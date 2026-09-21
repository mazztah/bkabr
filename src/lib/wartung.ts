import type { Anlage } from "./types";

export type FaelligkeitsStufe = "ueberfaellig" | "30" | "90" | "ok" | "ungeplant";

export interface WartungsZeile {
  anlage: Anlage;
  faellig?: Date;
  tage?: number; // negativ = überfällig
  stufe: FaelligkeitsStufe;
}

const TAG = 86_400_000;

/** Regelbasierte Einstufung der nächsten Wartung/Prüfung (WART-002, WART-006). */
export function bewerteAnlage(anlage: Anlage, heute = new Date()): WartungsZeile {
  if (!anlage.naechstePruefung) return { anlage, stufe: "ungeplant" };
  const faellig = new Date(anlage.naechstePruefung);
  if (Number.isNaN(faellig.getTime())) return { anlage, stufe: "ungeplant" };
  const start = new Date(heute.getFullYear(), heute.getMonth(), heute.getDate()).getTime();
  const tage = Math.round((faellig.getTime() - start) / TAG);
  const stufe: FaelligkeitsStufe = tage < 0 ? "ueberfaellig" : tage <= 30 ? "30" : tage <= 90 ? "90" : "ok";
  return { anlage, faellig, tage, stufe };
}

export const STUFEN_LABEL: Record<FaelligkeitsStufe, string> = {
  ueberfaellig: "Überfällig",
  "30": "≤ 30 Tage",
  "90": "≤ 90 Tage",
  ok: "Planmäßig",
  ungeplant: "Ohne Termin",
};

/**
 * Nächster Termin aus Durchführungsdatum + Prüfintervall (WART-002).
 * Monatsende-sicher: 31.01. + 1 Monat = 28./29.02.
 */
export function naechsteFaelligkeitAus(durchgefuehrtAm: string, intervallMonate: number): string | undefined {
  if (!Number.isFinite(intervallMonate) || intervallMonate <= 0) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(durchgefuehrtAm);
  if (!m) return undefined;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const ziel = new Date(Date.UTC(y, mo + Math.round(intervallMonate), 1));
  const letzterTag = new Date(Date.UTC(ziel.getUTCFullYear(), ziel.getUTCMonth() + 1, 0)).getUTCDate();
  ziel.setUTCDate(Math.min(d, letzterTag));
  return ziel.toISOString().slice(0, 10);
}
