/**
 * Fly.io NATS-Log-Streaming
 * -------------------------
 * Verbindet sich mit dem internen NATS-Log-Proxy von Fly.io (dem selben, den
 * auch das offizielle Referenzprojekt github.com/fly-apps/natstream nutzt)
 * und hält einen In-Memory-Ringpuffer der zuletzt empfangenen Log-Zeilen
 * bereit.
 *
 * Warum NATS statt der Logs-API?
 *  - Der NATS-Proxy liefert Logs nahezu in Echtzeit (Subscriber-Modell),
 *    ganz im Sinne des "Fly.io-artigen Live-Streams" im LLM Mission Control.
 *  - Der Flux ist noch schlanker als Polling der HTTP-Logs-API.
 *
 * Endpoint:  nats://[fdaa::3]:4223 (IPv6-Literal von Fly.io's internem
 *            NATS-Proxy, nur aus dem privaten Fly-6PN-Netz heraus
 *            erreichbar – funktioniert also nur, wenn diese App selbst auf
 *            Fly.io läuft).
 * Auth:      NATS-Benutzername/Passwort-Auth, KEIN Bearer-Token:
 *              user = FLY_ORG      (Org-Slug, z.B. "personal")
 *              pass = ACCESS_TOKEN (Read-Only-Token: `fly tokens create readonly <org>`)
 *            Fly.io injiziert diese NICHT automatisch – beide müssen als
 *            Secrets/Env-Vars gesetzt werden. Aus Kompatibilität mit einem
 *            evtl. bereits gesetzten Secret wird auch FLY_ACCESS_TOKEN als
 *            Alias für ACCESS_TOKEN akzeptiert.
 * Subjects:  logs.<app_name>.<region>.<machine_id>
 *
 * Verhalten außerhalb von Fly.io / bei fehlenden Credentials:
 *  - Fehlt FLY_ORG oder ACCESS_TOKEN/FLY_ACCESS_TOKEN, bleibt das Modul
 *    inaktiv und meldet `isFlyLoggingActive() === false`. Die App läuft dann
 *    unverändert weiter, lediglich der "FLY"-Teil im Live-Log-Stream bleibt
 *    leer.
 */

import { connect, type NatsConnection, type Msg, type Subscription } from "nats";

// NATS-Endpoint des Fly.io-internen Log-Proxys (privat, nur im Fly-6PN-Netz
// erreichbar). Dies ist die feste Adresse, die Fly.io für den Log-NATS-Proxy
// dokumentiert – NICHT "fly-local-6pn" (das ist nur der DNS-Name der eigenen
// Machine, nicht des Log-Proxys).
const FLY_NATS_URL = process.env.FLY_NATS_URL || "nats://[fdaa::3]:4223";
// Fly.io-Organisation (Username für die NATS-Auth). `fly orgs list` zeigt
// den Slug; für Einzelaccounts meist "personal".
const FLY_ORG = process.env.FLY_ORG || process.env.FLY_ORG_SLUG || "";
// Read-Only Access Token (Passwort für die NATS-Auth). Unterstützt sowohl
// den offiziellen Namen ACCESS_TOKEN als auch FLY_ACCESS_TOKEN als Alias.
const FLY_ACCESS_TOKEN = process.env.ACCESS_TOKEN || process.env.FLY_ACCESS_TOKEN || "";
// Subject-Kontext für die Suchfilter. Standard: eigene App-Logs, falls
// FLY_APP_NAME bekannt ist (wird von Fly.io automatisch gesetzt); sonst alle
// Logs der Org. "logs.>" = alle Log-Subjects, "*" erzwingt explizit alle.
const FLY_LOG_SUBJECT = (() => {
  const explicit = process.env.FLY_LOG_SUBJECT;
  if (explicit) return explicit;
  const flyApp = process.env.FLY_APP;
  if (flyApp === "*") return "logs.>";
  if (flyApp) return `logs.${flyApp}.>`;
  if (process.env.FLY_APP_NAME) return `logs.${process.env.FLY_APP_NAME}.>`;
  return "logs.>";
})();

/** Maximale Anzahl im Speicher gehaltener Fly-Log-Zeilen. */
const FLY_LOG_MAX = 500;

export interface FlyLogEintrag {
  id: string;
  zeitpunkt: string;
  typ: "fly" | string;
  text: string;
  /** Machine-/Region/Kontext aus dem NATS-Subject, falls vorhanden */
  machine?: string;
  region?: string;
}

/**
 * Next.js kompiliert `instrumentation.ts` (Server-Start-Hook) und API-Routes
 * als SEPARATE Webpack-Bundles. Ganz normale `let`-Modulvariablen wie unten
 * würden dadurch in JEDEM Bundle eine EIGENE Kopie bekommen: die
 * Hintergrund-Verbindung (aus instrumentation.ts gestartet) lebt dann in
 * einer Kopie, während `/api/dashboard/log-stream` beim Abfragen eine
 * andere, leere Kopie sieht → Verbindung erfolgreich laut Server-Log, aber
 * im Frontend dauerhaft "inaktiv". `globalThis` ist dagegen der einzige
 * Ort, der über alle Bundles hinweg im selben Node-Prozess garantiert
 * geteilt wird – deshalb hier als echter Singleton-Speicher genutzt.
 */
interface FlyLogsGlobalState {
  nc: NatsConnection | null;
  sub: Subscription | null;
  started: boolean;
  letzterFehler: string | null;
  buffer: FlyLogEintrag[];
}
const globalKey = "__bkabr_flyLogsState__";
const g = globalThis as unknown as Record<string, FlyLogsGlobalState | undefined>;
if (!g[globalKey]) {
  g[globalKey] = { nc: null, sub: null, started: false, letzterFehler: null, buffer: [] };
}
const state: FlyLogsGlobalState = g[globalKey]!;

/** Generiert eine kurze, eindeutige ID für einen Log-Eintrag. */
function uidFly(): string {
  return `fly-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Zerlegt ein Subject "logs.app.region.machine_id" in Kontext. */
function parseNatsSubject(subject: string): { region?: string; machine?: string } {
  const parts = subject.split(".");
  // parts[0] === "logs", parts[1] === app, parts[2] === region, parts[3] === machine
  if (parts.length >= 4) {
    return { region: parts[2] || undefined, machine: parts[3] || undefined };
  }
  return {};
}

/**
 * Formatiert eine einzelne Fly-Log-Nachricht in einen `FlyLogEintrag`.
 * Fly ist mit der NATS-Proxy-Integration dazu übergegangen, die Nachrichten
 * als JSON zu senden; manche Zeilen können aber auch reiner Text sein.
 * Wir behandeln beides defensiv.
 */
function parseFlyMessage(msg: Msg): Omit<FlyLogEintrag, "id"> {
  const { region, machine } = parseNatsSubject(msg.subject);
  const raw = typeof msg.data === "string" ? msg.data : Buffer.from(msg.data).toString("utf-8");
  const timeMs = Date.now();

  // Versuche JSON (moderne Fly-Format): { "level": "...", "message": "...", "time": ... }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      const text =
        typeof parsed.message === "string"
          ? parsed.message
          : typeof parsed.msg === "string"
            ? parsed.msg
            : raw;
      const level = typeof parsed.level === "string" ? parsed.level : typeof parsed.typ === "string" ? parsed.typ : "info";
      let zeitpunkt: string;
      if (typeof parsed.time === "string" && !Number.isNaN(Date.parse(parsed.time))) {
        zeitpunkt = parsed.time;
      } else if (typeof parsed.timestamp === "string" && !Number.isNaN(Date.parse(parsed.timestamp))) {
        zeitpunkt = parsed.timestamp;
      } else {
        zeitpunkt = new Date(timeMs).toISOString();
      }
      return {
        zeitpunkt,
        typ: normalizeFlyLevel(level),
        text: text.trim(),
        machine,
        region,
      };
    }
  } catch {
    // kein JSON → unten als Klartext behandeln
  }

  // Klartext-Fallback
  return {
    zeitpunkt: new Date(timeMs).toISOString(),
    typ: "info",
    text: raw.trim(),
    machine,
    region,
  };
}

/** Vereinheitlicht Fly-Log-Level auf eine kleine, bekannte Menge. */
function normalizeFlyLevel(level: string): string {
  const l = level.toLowerCase();
  if (["error", "err"].includes(l) || l.startsWith("fatal")) return "error";
  if (["warn", "warning"].includes(l)) return "warn";
  if (["debug", "trace"].includes(l)) return "debug";
  // info, log, stdout, stderr, request, response, … bleiben wie sie sind
  return l;
}

/** Fügt einen Eintrag in den Ringpuffer ein (neueste zuerst, begrenzt). */
function pushEntry(entry: FlyLogEintrag): void {
  state.buffer = [entry, ...state.buffer].slice(0, FLY_LOG_MAX);
}

/** Callback für eingehende NATS-Nachrichten. */
function onFlyLog(msg: Msg): void {
  try {
    const parsed = parseFlyMessage(msg);
    pushEntry({ id: uidFly(), ...parsed });
  } catch (err) {
    state.letzterFehler = err instanceof Error ? err.message : String(err);
  }
}

async function connectAndSubscribe(): Promise<void> {
  if (!FLY_ORG) {
    state.letzterFehler = "FLY_ORG nicht gesetzt (Org-Slug, z.B. 'personal'; siehe `fly orgs list`).";
    console.warn(`[fly-logs] ${state.letzterFehler}`);
    return;
  }
  if (FLY_ORG.includes("@")) {
    // Häufiger Stolperstein: FLY_ORG versehentlich auf die Fly.io-Login-
    // E-Mail statt auf den Org-Slug gesetzt → NATS lehnt mit "Authorization
    // Violation" ab. Der Slug (siehe `fly orgs list`) ist NIE eine E-Mail-
    // Adresse, bei Einzelaccounts praktisch immer "personal".
    console.warn(
      `[fly-logs] FLY_ORG ("${FLY_ORG}") sieht wie eine E-Mail-Adresse aus, nicht wie ein Org-Slug. ` +
        `Erwartet wird der Slug aus \`fly orgs list\` (bei Einzelaccounts meist "personal"). Verbindungsversuch trotzdem, wird aber vermutlich mit "Authorization Violation" scheitern.`
    );
  }
  if (!FLY_ACCESS_TOKEN) {
    state.letzterFehler = "ACCESS_TOKEN / FLY_ACCESS_TOKEN nicht gesetzt (Secret fehlt oder falscher Name).";
    console.warn(`[fly-logs] ${state.letzterFehler}`);
    return;
  }
  console.info(
    `[fly-logs] Verbindungsversuch → ${FLY_NATS_URL} (user="${FLY_ORG}", pass=${FLY_ACCESS_TOKEN.length} Zeichen, subject="${FLY_LOG_SUBJECT}")`
  );
  try {
    state.nc = await connect({
      servers: FLY_NATS_URL,
      // Fly.io's NATS-Log-Proxy nutzt Username/Passwort-Auth, KEIN
      // Bearer-Token: Username = Org-Slug, Passwort = Access-Token.
      user: FLY_ORG,
      pass: FLY_ACCESS_TOKEN,
      // Kurzer Timeout, damit ein nicht erreichbarer Proxy den Serverstart
      // nicht blockiert. Die Verbindung läuft im Hintergrund weiter.
      timeout: 10000,
      reconnect: true,
      maxReconnectAttempts: 5,
      reconnectTimeWait: 2000,
    });
    state.sub = state.nc.subscribe(FLY_LOG_SUBJECT, { callback: onFlyLog });
    console.info(`[fly-logs] NATS verbunden (${FLY_NATS_URL}), Subject "${FLY_LOG_SUBJECT}".`);

    // Verbindung sauber zurücksetzen, falls sie im Hintergrund geschlossen
    // wird (z.B. Netzwerkfehler nach ausgeschöpften Reconnect-Versuchen),
    // damit isFlyLoggingActive() den Status korrekt widerspiegelt.
    state.nc.closed().then((err) => {
      if (err) {
        state.letzterFehler = err instanceof Error ? err.message : String(err);
        console.warn(`[fly-logs] NATS-Verbindung mit Fehler geschlossen: ${state.letzterFehler}`);
      } else {
        console.info("[fly-logs] NATS-Verbindung geschlossen.");
      }
      state.nc = null;
      state.sub = null;
    });
  } catch (err) {
    state.letzterFehler = err instanceof Error ? err.message : String(err);
    console.warn(`[fly-logs] NATS-Verbindung fehlgeschlagen: ${state.letzterFehler}`);
    state.nc = null;
  }
}

/**
 * Startet den Fly-Log-Ticker. Wird einmalig aus instrumentation.ts beim
 * Server-Start aufgerufen (Node-Laufzeit). Bei fehlendem Token (Dev/Lokal)
 * passiert nichts Schädliches – nur der FLY-Teil bleibt leer.
 */
export async function startFlyLogTicker(): Promise<void> {
  if (state.started) return;
  state.started = true;
  await connectAndSubscribe();
}

/** Liefert die zuletzt empfangenen Fly-Logs (neueste zuerst). */
export function getRecentFlyLogs(limit = 50): FlyLogEintrag[] {
  return state.buffer.slice(0, limit);
}

/** Status, ob das Fly-NATS-Streaming aktiv ist. */
export function isFlyLoggingActive(): boolean {
  return Boolean(state.nc && state.sub);
}

/** Letzter Fehler (für UI-Hinweis) oder null. */
export function getFlyLogError(): string | null {
  return state.letzterFehler;
}

