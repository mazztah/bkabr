/**
 * Fly.io NATS-Log-Streaming
 * -------------------------
 * Verbindet sich mit dem internen NATS-Proxy von Fly.io (snapshot, der alle
 * App-Logs (stdout/stderr) der aktuellen App publishiert) und hält einen
 * In-Memory-Ringpuffer der zuletzt empfangenen Log-Zeilen bereit.
 *
 * Warum NATS statt der Logs-API?
 *  - Der NATS-Proxy liefert Logs nahezu in Echtzeit (Subscriber-Modell),
 *    ganz im Sinne des "Fly.io-artigen Live-Streams" im LLM Mission Control.
 *  - Der Flux ist noch schlanker als Polling der HTTP-Logs-API.
 *
 * Subjects:  logs.<app_name>.<region>.<machine_id>
 * Auth:      FLY_NATS_TOKEN (wird von Fly.io automatisch als Env-Variable
 *            in jede Machine injiziert). Endpoint ist immer
 *            nats://fly-local-6pn:9292 (nur innerhalb des privaten Fly-Netzes
 *            erreichbar).
 *
 * Verhalten außerhalb von Fly.io:
 *  - Fehlt FLY_NATS_TOKEN (Lokal/Dev), bleibt das Modul inaktiv und meldet
 *    `isFlyLoggingActive() === false`. Die App läuft dann unverändert weiter,
 *    lediglich der "FLY"-Teil im Live-Log-Stream bleibt leer.
 */

import { connect, type NatsConnection, type Msg, type Subscription } from "nats";

// NATS-Endpoint des Fly.io-internen Log-Proxys (privat, nur im Fly-Netz).
const FLY_NATS_URL = process.env.FLY_NATS_URL || "nats://fly-local-6pn:9292";
// Subject-Kontext für die Suchfilter; "logs.>" = alle Log-Subjects.
const FLY_LOG_SUBJECT = process.env.FLY_LOG_SUBJECT || "logs.>";

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

let nc: NatsConnection | null = null;
let sub: Subscription | null = null;
let started = false;
let letzterFehler: string | null = null;

/** Ringpuffer – neueste Einträge am Anfang. */
let buffer: FlyLogEintrag[] = [];

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
  buffer = [entry, ...buffer].slice(0, FLY_LOG_MAX);
}

/** Callback für eingehende NATS-Nachrichten. */
function onFlyLog(msg: Msg): void {
  try {
    const parsed = parseFlyMessage(msg);
    pushEntry({ id: uidFly(), ...parsed });
  } catch (err) {
    letzterFehler = err instanceof Error ? err.message : String(err);
  }
}

async function connectAndSubscribe(): Promise<void> {
  if (!process.env.FLY_NATS_TOKEN) {
    letzterFehler = "FLY_NATS_TOKEN nicht gesetzt (lokal / außerhalb Fly.io).";
    return;
  }
  try {
    nc = await connect({
      servers: FLY_NATS_URL,
      token: process.env.FLY_NATS_TOKEN,
      // Kurzer Timeout, damit ein nicht erreichbarer Proxy den Serverstart
      // nicht blockiert. Die Verbindung läuft im Hintergrund weiter.
      timeout: 5000,
    });
    sub = nc.subscribe(FLY_LOG_SUBJECT, { callback: onFlyLog });
    console.info(`[fly-logs] NATS verbunden (${FLY_NATS_URL}), Subject "${FLY_LOG_SUBJECT}".`);
  } catch (err) {
    letzterFehler = err instanceof Error ? err.message : String(err);
    console.warn(`[fly-logs] NATS-Verbindung fehlgeschlagen: ${letzterFehler}`);
    nc = null;
  }
}

/**
 * Startet den Fly-Log-Ticker. Wird einmalig aus instrumentation.ts beim
 * Server-Start aufgerufen (Node-Laufzeit). Bei fehlendem Token (Dev/Lokal)
 * passiert nichts Schädliches – nur der FLY-Teil bleibt leer.
 */
export async function startFlyLogTicker(): Promise<void> {
  if (started) return;
  started = true;
  await connectAndSubscribe();
}

/** Liefert die zuletzt empfangenen Fly-Logs (neueste zuerst). */
export function getRecentFlyLogs(limit = 50): FlyLogEintrag[] {
  return buffer.slice(0, limit);
}

/** Status, ob das Fly-NATS-Streaming aktiv ist. */
export function isFlyLoggingActive(): boolean {
  return Boolean(nc && sub);
}

/** Letzter Fehler (für UI-Hinweis) oder null. */
export function getFlyLogError(): string | null {
  return letzterFehler;
}

