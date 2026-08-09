import { agentSchedulesDb, dueAgentSchedules, logEvent, recordAgentScheduleRun } from "./db";
import { AgentSchedule, AgentScheduleLauf } from "./types";
import { computeNextRun } from "./schedule";
import { runAgent } from "./agent";

/**
 * `tickerStarted`/`running` als globalThis-Singleton statt normaler
 * Modul-Variablen – aus demselben Grund wie bei fly-logs.ts/db.ts/
 * groq-client.ts: Next.js kompiliert instrumentation.ts (startet den
 * 30s-Ticker) und API-Routes (z.B. /api/kalender/[id]/run, der manuelle
 * "Jetzt ausführen"-Button) als SEPARATE Webpack-Bundles. Mit normalen
 * `let`-Variablen bekäme jedes Bundle seine EIGENE Kopie von `running` –
 * der Überlappungs-Schutz in runDueAgentSchedules() würde dann NICHT
 * verhindern, dass ein manueller Klick zeitgleich mit einem Ticker-Tick
 * dasselbe (oder ein anderes) Schedule parallel ausführt. Zwei parallele
 * Agent-Läufe bedeuten zwei parallele 13-stufige LLM-Fallback-Ketten
 * gleichzeitig – ein plausibler Beitrag zu Lastspitzen/Health-Check-
 * Ausfällen und dem beobachteten NVIDIA-Concurrency-Fehler.
 */
interface SchedulerGlobalState {
  tickerStarted: boolean;
  running: boolean;
  /** IDs von Schedules, die GERADE ausführen – egal ob vom Ticker oder vom manuellen "Jetzt ausführen"-Button (api/kalender/[id]/run). Verhindert, dass dasselbe Schedule zweimal parallel läuft. */
  runningScheduleIds: Set<string>;
}
const SCHEDULER_GLOBAL_KEY = "__bkabr_schedulerState__";
const schedulerGlobal = globalThis as unknown as Record<string, SchedulerGlobalState | undefined>;
if (!schedulerGlobal[SCHEDULER_GLOBAL_KEY]) {
  schedulerGlobal[SCHEDULER_GLOBAL_KEY] = { tickerStarted: false, running: false, runningScheduleIds: new Set() };
}
const schedulerState: SchedulerGlobalState = schedulerGlobal[SCHEDULER_GLOBAL_KEY]!;

/** Führt eine einzelne Kalender-Aufgabe sofort aus (z.B. "Jetzt ausführen"-Button oder Fälligkeit). */
export async function executeAgentSchedule(schedule: AgentSchedule): Promise<AgentScheduleLauf> {
  if (schedulerState.runningScheduleIds.has(schedule.id)) {
    // Läuft bereits (Ticker ODER ein anderer manueller Aufruf) – nicht
    // doppelt starten. Zwei parallele Läufe desselben Schedules bedeuten
    // zwei parallele, bis zu 13-stufige LLM-Fallback-Ketten gleichzeitig.
    throw new Error(`Aufgabe „${schedule.name}" läuft bereits – bitte kurz warten.`);
  }
  schedulerState.runningScheduleIds.add(schedule.id);
  try {
    return await executeAgentScheduleInner(schedule);
  } finally {
    schedulerState.runningScheduleIds.delete(schedule.id);
  }
}

async function executeAgentScheduleInner(schedule: AgentSchedule): Promise<AgentScheduleLauf> {
  const zeitpunkt = new Date().toISOString();
  let lauf: AgentScheduleLauf;
  try {
    const kontext = schedule.liegenschaftName
      ? `[Wiederkehrende Aufgabe „${schedule.name}" – Liegenschaft: ${schedule.liegenschaftName}]\n\n${schedule.prompt}`
      : `[Wiederkehrende Aufgabe „${schedule.name}"]\n\n${schedule.prompt}`;
    const result = await runAgent({ message: kontext });
    lauf = {
      zeitpunkt,
      status: "erfolg",
      ergebnis: (result.reply || "Fertig.").slice(0, 2000),
    };
    await logEvent("info", `Kalender-Aufgabe „${schedule.name}" erfolgreich ausgeführt.`, {
      art: "AgentSchedule",
      id: schedule.id,
    });
  } catch (err: any) {
    lauf = {
      zeitpunkt,
      status: "fehler",
      ergebnis: (err?.message || String(err)).slice(0, 2000),
    };
    await logEvent("fehler", `Kalender-Aufgabe „${schedule.name}" fehlgeschlagen: ${lauf.ergebnis}`, {
      art: "AgentSchedule",
      id: schedule.id,
    });
  }

  const nextRunAt = computeNextRun(schedule.recurrence, new Date()).toISOString();
  await recordAgentScheduleRun(schedule.id, lauf, nextRunAt);
  return lauf;
}

/** Führt alle aktuell fälligen Aufgaben nacheinander aus (vom Ticker bzw. manuell aufrufbar). */
export async function runDueAgentSchedules(): Promise<void> {
  if (schedulerState.running) return; // keine überlappenden Ticker-Läufe, falls ein Tick länger dauert als das Intervall
  schedulerState.running = true;
  try {
    const due = await dueAgentSchedules();
    for (const schedule of due) {
      try {
        await executeAgentSchedule(schedule);
      } catch (err) {
        // z.B. "läuft bereits" durch parallelen manuellen Klick – einzelnes
        // Schedule überspringen, restliche fällige Aufgaben trotzdem prüfen.
        console.warn("[kalender] Schedule übersprungen:", err instanceof Error ? err.message : err);
      }
    }
  } catch (err) {
    console.error("[kalender] Fehler beim Prüfen fälliger Aufgaben:", err);
  } finally {
    schedulerState.running = false;
  }
}

/**
 * Startet den Hintergrund-Ticker (alle 30s prüfen, ob Aufgaben fällig sind).
 * Wird einmalig aus instrumentation.ts beim Server-Start aufgerufen – der
 * `tickerStarted`-Guard verhindert Mehrfachstarts bei Hot-Reload im Dev-Modus.
 */
export function startAgentScheduler(): void {
  if (schedulerState.tickerStarted) return;
  schedulerState.tickerStarted = true;
  const INTERVAL_MS = 30_000;
  setInterval(() => {
    runDueAgentSchedules().catch((err) =>
      console.error("[kalender] Ticker-Fehler:", err)
    );
  }, INTERVAL_MS);
  console.info("[kalender] Scheduler gestartet (Prüfintervall: 30s).");
}

export { agentSchedulesDb };
