import type { DinGruppe, Raum } from "./types";

export const DIN_GRUPPEN: DinGruppe[] = [
  "NUF 1 Wohnen und Aufenthalt",
  "NUF 2 Büroarbeit",
  "NUF 3 Produktion, Hand- und Maschinenarbeit, Experimente",
  "NUF 4 Lagern, Verteilen und Verkaufen",
  "NUF 5 Bildung, Unterricht und Kultur",
  "NUF 6 Heilen und Pflegen",
  "NUF 7 Sonstige Nutzungen",
  "TF Technikfläche",
  "VF Verkehrsfläche",
];

/** Vorkonfigurierte Nutzungsarten (Pflichtenheft Kap. 9) mit sinnvoller DIN-277-Vorbelegung. */
export const NUTZUNGSARTEN: { name: string; din: DinGruppe }[] = [
  { name: "Ausstellungsfläche", din: "NUF 5 Bildung, Unterricht und Kultur" },
  { name: "Depot", din: "NUF 4 Lagern, Verteilen und Verkaufen" },
  { name: "Mietwohnung", din: "NUF 1 Wohnen und Aufenthalt" },
  { name: "Gewerbefläche", din: "NUF 7 Sonstige Nutzungen" },
  { name: "Pachtfläche", din: "NUF 7 Sonstige Nutzungen" },
  { name: "Werkstatt", din: "NUF 3 Produktion, Hand- und Maschinenarbeit, Experimente" },
  { name: "Lager", din: "NUF 4 Lagern, Verteilen und Verkaufen" },
  { name: "Umkleide", din: "NUF 7 Sonstige Nutzungen" },
  { name: "Sanitär", din: "NUF 7 Sonstige Nutzungen" },
  { name: "Teeküche", din: "NUF 7 Sonstige Nutzungen" },
  { name: "Büro", din: "NUF 2 Büroarbeit" },
  { name: "Flur", din: "VF Verkehrsfläche" },
  { name: "Veranstaltungsfläche", din: "NUF 5 Bildung, Unterricht und Kultur" },
  { name: "Keller", din: "NUF 4 Lagern, Verteilen und Verkaufen" },
  { name: "Technikraum", din: "TF Technikfläche" },
  { name: "Sonstige Nutzfläche", din: "NUF 7 Sonstige Nutzungen" },
];

const ETAGEN_REIHENFOLGE = ["UG", "KG", "EG", "1. OG", "2. OG", "3. OG", "4. OG", "5. OG", "DG"];

export function etageSortKey(etage: string): number {
  const i = ETAGEN_REIHENFOLGE.findIndex((e) => e.toLowerCase() === etage.trim().toLowerCase());
  if (i >= 0) return i;
  const m = etage.match(/-?\d+/);
  return m ? 100 + parseInt(m[0], 10) : 999;
}

export function gruppiereNachEtage(raeume: Raum[]): { etage: string; raeume: Raum[]; summe: number }[] {
  const map = new Map<string, Raum[]>();
  for (const r of raeume) {
    const key = r.etage || "ohne Etage";
    map.set(key, [...(map.get(key) || []), r]);
  }
  return Array.from(map.entries())
    .map(([etage, list]) => ({
      etage,
      raeume: list.sort((a, b) => a.laufendeNr - b.laufendeNr),
      summe: list.reduce((s, r) => s + (r.flaeche || 0), 0),
    }))
    .sort((a, b) => etageSortKey(a.etage) - etageSortKey(b.etage));
}

/** Auswertung je Nutzungsgruppe (IMM-005). */
export function summeNachGruppe(raeume: Raum[]): { gruppe: string; flaeche: number; anzahl: number }[] {
  const map = new Map<string, { flaeche: number; anzahl: number }>();
  for (const r of raeume) {
    const g = r.dinGruppe || "nicht zugeordnet";
    const cur = map.get(g) || { flaeche: 0, anzahl: 0 };
    cur.flaeche += r.flaeche || 0;
    cur.anzahl += 1;
    map.set(g, cur);
  }
  return Array.from(map.entries())
    .map(([gruppe, v]) => ({ gruppe, ...v }))
    .sort((a, b) => b.flaeche - a.flaeche);
}

export const fmtM2 = (n: number) =>
  `${n.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} m²`;
