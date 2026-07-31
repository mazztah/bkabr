import { Mieter, MietkontoBuchung } from "./types";

/** Summe aller offenen Salden (Soll - Ist) im Mietkonto. Positiv = Rückstand, negativ = Guthaben. */
export function mietRueckstand(mieter: Pick<Mieter, "mietkonto">): number {
  return (mieter.mietkonto || []).reduce(
    (sum: number, b: MietkontoBuchung) => sum + (b.soll - b.ist),
    0
  );
}

/** Rückstand nur für Buchungen vom Typ "Miete" (ohne Nebenkosten/Kaution/Sonstiges). */
export function mietRueckstandMiete(mieter: Pick<Mieter, "mietkonto">): number {
  return (mieter.mietkonto || [])
    .filter((b: MietkontoBuchung) => b.typ === "Miete")
    .reduce((sum: number, b: MietkontoBuchung) => sum + (b.soll - b.ist), 0);
}
