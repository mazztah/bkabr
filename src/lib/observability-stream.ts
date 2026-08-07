import { listLog, getObservabilityOverview } from "./db";
import type { SystemLogEintrag } from "./types";

/**
 * Kleiner Helfer für den SSE-Live-Log-Stream. Liefert die "Letzten N"
 * System-Log-Einträge plus eine Observable-Briefing, damit das Dashboard
 * Live-Logs und den Modell-/Ratelimit-Zustand gemeinsam anzeigen kann.
 */
export async function getSystemLogStream(limit = 20) {
  const [log, overview] = await Promise.all([
    listLog({ limit }),
    getObservabilityOverview().catch(() => null),
  ]);
  return {
    log: log as SystemLogEintrag[],
    overview,
    ts: new Date().toISOString(),
  };
}

