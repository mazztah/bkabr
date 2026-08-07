import { listLog, getObservabilityOverview } from "./db";
import type { SystemLogEintrag } from "./types";
import { getRecentFlyLogs, isFlyLoggingActive, getFlyLogError } from "./fly-logs";

/**
 * Kleiner Helfer für den SSE-Live-Log-Stream. Liefert die "Letzten N"
 * System-Log-Einträge plus eine Observable-Briefing, damit das Dashboard
 * Live-Logs und den Modell-/Ratelimit-Zustand gemeinsam anzeigen kann.
 *
 * Seit der Fly.io-Integration werden zusätzlich die zuletzt über den internen
 * NATS-Proxy empfangenen Fly-Logs (`flyLog`) sowie Status-Infos zur
 * NATS-Verbindung (`flyLogStatus`) mitgeliefert, damit die Live-Logs-Ansicht
 * die "FLY"-Zeilen mit einem Quell-Badge und Verbindungsstatus darstellen kann.
 */
export async function getSystemLogStream(limit = 20) {
  const [log, overview] = await Promise.all([
    listLog({ limit }),
    getObservabilityOverview().catch(() => null),
  ]);
  return {
    log: log as SystemLogEintrag[],
    overview,
    flyLog: getRecentFlyLogs(50),
    flyLogStatus: {
      active: isFlyLoggingActive(),
      error: getFlyLogError(),
    },
    ts: new Date().toISOString(),
  };
}

