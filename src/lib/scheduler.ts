import { agentSchedulesDb, dueAgentSchedules, logEvent, recordAgentScheduleRun } from "./db";
import { AgentSchedule, AgentScheduleLauf } from "./types";
import { computeNextRun } from "./schedule";
import { runAgent } from "./agent";

let tickerStarted = false;
let running = false;

/** Führt eine einzelne Kalender-Aufgabe sofort aus (z.B. "Jetzt ausführen"-Button oder Fälligkeit). */
export async function executeAgentSchedule(schedule: AgentSchedule): Promise<AgentScheduleLauf> {
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
  if (running) return; // keine überlappenden Läufe, falls ein Tick länger dauert als das Intervall
  running = true;
  try {
    const due = await dueAgentSchedules();
    for (const schedule of due) {
      await executeAgentSchedule(schedule);
    }
  } catch (err) {
    console.error("[kalender] Fehler beim Prüfen fälliger Aufgaben:", err);
  } finally {
    running = false;
  }
}

/**
 * Startet den Hintergrund-Ticker (alle 30s prüfen, ob Aufgaben fällig sind).
 * Wird einmalig aus instrumentation.ts beim Server-Start aufgerufen – der
 * `tickerStarted`-Guard verhindert Mehrfachstarts bei Hot-Reload im Dev-Modus.
 */
export function startAgentScheduler(): void {
  if (tickerStarted) return;
  tickerStarted = true;
  const INTERVAL_MS = 30_000;
  setInterval(() => {
    runDueAgentSchedules().catch((err) =>
      console.error("[kalender] Ticker-Fehler:", err)
    );
  }, INTERVAL_MS);
  console.info("[kalender] Scheduler gestartet (Prüfintervall: 30s).");
}

export { agentSchedulesDb };
