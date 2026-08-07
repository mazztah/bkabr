import {
  getObservabilityOverview,
  pingModel,
  recordAgentAudit,
  runMonthlyModelUpdate,
} from "./db";
import { getStaticModelCatalog } from "./llm-observability";

let started = false;
let intervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Täglicher Health-Ping für alle konfigurierten Modelle + monatliches
 * Modell-Update. Wird einmalig aus instrumentation.ts beim Server-Start
 * aufgerufen (der `started`-Guard verhindert Mehrfachstarts im Dev-Modus).
 *
 * Ablauf:
 *   1. Beim Start ein initialer Ping (nicht blockierend, fire-and-forget).
 *   2. Alle 24h: alle Modelle pingen (mit API-Keys), Health aktualisieren,
 *      Audit-Eintrag schreiben.
 *   3. Alle 30 Tage: runMonthlyModelUpdate() – zusätzliche Dokumentations-
 *      Aktualisierung (in der Praxis Startpunkt für den externen Modell-
 *      Katalog-Abgleich).
 */
const TAG_MS = 24 * 60 * 60 * 1000; // 24h
const MONAT_MS = 30 * 24 * 60 * 60 * 1000; // 30 Tage

async function performDailyPing(): Promise<void> {
  try {
    const overview = await getObservabilityOverview().catch(() => null);
    const catalog = overview?.modelCatalog?.length
      ? overview.modelCatalog
      : getStaticModelCatalog();

    let gepingt = 0;
    let gruen = 0;
    let grau = 0;

    for (const entry of catalog) {
      if (entry.health.status !== "green" && entry.health.status !== "gray") continue;
      // Nur erneut pingen, wenn bereits geraten/persistiert – spart Requests.
      try {
        const res = await pingProvider(entry.provider, entry.apiModel, entry.id);
        if (res) {
          gepingt++;
          if (res === "green") gruen++;
          else grau++;
        }
      } catch {
        /* einzelner Ping darf den Loop nicht stoppen */
      }
    }

    await recordAgentAudit(
      "daily_ping",
      `Täglicher Health-Ping: ${gepingt} Modelle (${gruen} grün, ${grau} grau)`,
      "ok",
      { gepingt, gruen, grau }
    );
  } catch (err) {
    console.error("[observability] Täglicher Ping fehlgeschlagen:", err);
  }
}

/** Kleiner Helfer, der den Provider-Ping aus db.ts kapselt. */
async function pingProvider(
  provider: string,
  apiModel: string,
  modelId: string
): Promise<"green" | "gray" | null> {
  // Nur Provider pingen, deren API-Key gesetzt ist
  const hasKey =
    (provider === "groq" && Boolean(process.env.GROQ_API_KEY)) ||
    (provider === "cerebras" && Boolean(process.env.CEREBRAS_API_KEY)) ||
    (provider === "cloudflare" &&
      Boolean(
        process.env.CLOUDFLARE_ACCOUNT_ID &&
          (process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_API_KEY)
      )) ||
    (provider === "nvidia" && Boolean(process.env.NVIDIA_API_KEY));

  if (!hasKey) return null;

  const result = await pingModel(modelId);
  return result.status;
}

async function checkMonthlyUpdate(): Promise<void> {
  try {
    const overview = await getObservabilityOverview().catch(() => null);
    const last = overview?.summary?.lastAgentRun;
    const now = Date.now();
    const lastTs = last ? new Date(last).getTime() : 0;

    if (!last || now - lastTs >= MONAT_MS) {
      await runMonthlyModelUpdate();
    }
  } catch (err) {
    console.error("[observability] Monatliches Update fehlgeschlagen:", err);
  }
}

export function startObservabilityScheduler(): void {
  if (started) return;
  started = true;

  // Initialer nicht-blockierender Ping kurz nach Start
  setTimeout(performDailyPing, 5000);
  // Monats-Check direkt zu Beginn
  setTimeout(checkMonthlyUpdate, 8000);

  // Täglich pingen
  intervalId = setInterval(performDailyPing, TAG_MS);
  // Monatslogik prüfen (defensiv, sobald fällig)
  setInterval(checkMonthlyUpdate, 6 * 60 * 60 * 1000); // alle 6h prüfen

  console.info("[observability] Scheduler gestartet (täglicher Health-Ping + 30-Tage-Update).");
}

