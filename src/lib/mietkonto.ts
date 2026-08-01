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

function monatSchluessel(datum: string): string {
  return datum.slice(0, 7); // "YYYY-MM"
}

/**
 * Berechnet, für welche Monate seit Mietbeginn (bis inkl. aktuellem Monat, bzw.
 * Mietende falls früher) noch keine Miet-Sollstellung im Mietkonto existiert,
 * und liefert die fehlenden Buchungen (Soll = Kaltmiete + Nebenkostenvorauszahlung,
 * Ist = 0) zurück, damit sie automatisch nachgebucht werden können.
 */
export function fehlendeSollstellungen(
  mieter: Pick<Mieter, "mietkonto" | "mietbeginn" | "mietende" | "kaltmiete" | "nebenkostenVorauszahlung">,
  bisDatum: Date = new Date()
): MietkontoBuchung[] {
  if (!mieter.mietbeginn || !mieter.kaltmiete) return [];

  const vorhandeneMonate = new Set(
    (mieter.mietkonto || []).filter((b) => b.typ === "Miete").map((b) => monatSchluessel(b.datum))
  );

  const start = new Date(mieter.mietbeginn);
  if (isNaN(start.getTime())) return [];
  const ende = mieter.mietende ? new Date(mieter.mietende) : null;
  const letzterMonat = ende && ende < bisDatum ? ende : bisDatum;

  const buchungen: MietkontoBuchung[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const grenze = new Date(letzterMonat.getFullYear(), letzterMonat.getMonth(), 1);

  while (cursor <= grenze) {
    const datum = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-01`;
    if (!vorhandeneMonate.has(monatSchluessel(datum))) {
      buchungen.push({
        id: crypto.randomUUID(),
        datum,
        typ: "Miete",
        soll: (mieter.kaltmiete || 0) + (mieter.nebenkostenVorauszahlung || 0),
        ist: 0,
        text: "Automatische Sollstellung",
      });
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return buchungen;
}
