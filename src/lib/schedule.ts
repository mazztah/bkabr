import { AgentScheduleRecurrence } from "./types";

const WOCHENTAGE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

/**
 * Berechnet den nächsten Ausführungszeitpunkt einer Wiederholungsregel ausgehend
 * von `from` (Default: jetzt). Bei "intervall" ist das schlicht from + N Minuten.
 * Bei "taeglich"/"woechentlich" wird der nächste zukünftige Zeitpunkt gesucht
 * (heute falls die Uhrzeit noch bevorsteht, sonst der nächste passende Tag).
 */
export function computeNextRun(recurrence: AgentScheduleRecurrence, from: Date = new Date()): Date {
  if (recurrence.art === "intervall") {
    const minuten = Math.max(1, Math.round(recurrence.minuten));
    return new Date(from.getTime() + minuten * 60_000);
  }

  const [hh, mm] = recurrence.uhrzeit.split(":").map((n) => parseInt(n, 10));
  const uhrzeitValid = Number.isFinite(hh) && Number.isFinite(mm);
  const targetH = uhrzeitValid ? hh : 0;
  const targetM = uhrzeitValid ? mm : 0;

  const next = new Date(from);
  next.setSeconds(0, 0);
  next.setHours(targetH, targetM, 0, 0);

  if (recurrence.art === "taeglich") {
    if (next.getTime() <= from.getTime()) next.setDate(next.getDate() + 1);
    return next;
  }

  // woechentlich
  const targetDay = ((recurrence.wochentag % 7) + 7) % 7;
  while (next.getDay() !== targetDay || next.getTime() <= from.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

/** Menschenlesbare Kurzbeschreibung für Karten/Listen, z.B. "alle 2 Std." oder "täglich 23:40 Uhr". */
export function describeRecurrence(recurrence: AgentScheduleRecurrence): string {
  if (recurrence.art === "intervall") {
    const m = recurrence.minuten;
    if (m % 60 === 0 && m >= 60) return `alle ${m / 60} Std.`;
    if (m % 1440 === 0) return `alle ${m / 1440} Tage`;
    return `alle ${m} Min.`;
  }
  if (recurrence.art === "taeglich") {
    return `täglich um ${recurrence.uhrzeit} Uhr`;
  }
  return `jeden ${WOCHENTAGE[recurrence.wochentag]} um ${recurrence.uhrzeit} Uhr`;
}

/** Validiert eine Wiederholungsregel vor dem Speichern (grobe Plausibilitätsprüfung). */
export function validateRecurrence(recurrence: AgentScheduleRecurrence): string | null {
  if (recurrence.art === "intervall") {
    if (!Number.isFinite(recurrence.minuten) || recurrence.minuten < 1) {
      return "Intervall muss mindestens 1 Minute betragen.";
    }
    if (recurrence.minuten > 60 * 24 * 30) {
      return "Intervall ist unrealistisch groß (max. 30 Tage).";
    }
    return null;
  }
  const zeitOk = /^([01]\d|2[0-3]):([0-5]\d)$/.test(recurrence.uhrzeit || "");
  if (!zeitOk) return "Uhrzeit muss im Format HH:MM vorliegen.";
  if (recurrence.art === "woechentlich" && (recurrence.wochentag < 0 || recurrence.wochentag > 6)) {
    return "Ungültiger Wochentag.";
  }
  return null;
}

export const WOCHENTAG_LABELS = WOCHENTAGE;
