import { Liegenschaft } from "./types";

export interface ParsedAddress {
  strasse: string;
  hausnummer: string;
  plz: string;
  ort: string;
}

/** Sehr einfacher, toleranter Parser für deutsche Adressen à la "Musterstr. 12, 30159 Hannover". */
export function parseAddress(adresse: string): ParsedAddress {
  const result: ParsedAddress = { strasse: "", hausnummer: "", plz: "", ort: "" };
  if (!adresse) return result;

  const plzOrtMatch = adresse.match(/(\d{5})\s+([A-Za-zÀ-ÿ.\- ]+)/);
  if (plzOrtMatch) {
    result.plz = plzOrtMatch[1];
    result.ort = plzOrtMatch[2].trim();
  }

  const strasseMatch = adresse.match(/([A-Za-zÀ-ÿ.\-\s]+?)\s*(\d+[a-zA-Z]?)\s*,?/);
  if (strasseMatch) {
    result.strasse = strasseMatch[1].trim();
    result.hausnummer = strasseMatch[2].trim();
  }

  return result;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/straße|strasse/g, "str").replace(/[^a-z0-9]/g, "");
}

/**
 * Prüft, ob eine extrahierte Adresse zu einer bekannten Liegenschaft passt.
 * Primär wird über Straße + Hausnummer gematcht (eindeutig). Der Fallback über
 * PLZ + Ort wird NUR verwendet, wenn er eindeutig genau eine Liegenschaft trifft –
 * sonst könnten zwei Häuser in derselben Straße/Stadt (z.B. Hausnr. 4 und 6 mit
 * identischer PLZ) fälschlich zusammengelegt werden, obwohl es unterschiedliche
 * Objekte mit unterschiedlichen Mietern/Rechnungen sind.
 */
export function matchLiegenschaft(
  adresse: string,
  liegenschaften: Liegenschaft[]
): Liegenschaft | undefined {
  if (!adresse) return undefined;
  const normAdresse = normalize(adresse);

  const strasseTreffer = liegenschaften.find((l) => {
    const strasseHnr = normalize(`${l.strasse}${l.hausnummer}`);
    return strasseHnr.length > 3 && normAdresse.includes(strasseHnr);
  });
  if (strasseTreffer) return strasseTreffer;

  const plzOrtTreffer = liegenschaften.filter((l) => {
    const ort = normalize(l.ort);
    return l.plz && adresse.includes(l.plz) && ort.length > 2 && normAdresse.includes(ort);
  });
  // Nur übernehmen, wenn es GENAU EINE Liegenschaft mit dieser PLZ/Ort-Kombination
  // gibt – bei mehreren (z.B. mehrere Häuser derselben Straße/Stadt) ist die
  // Zuordnung sonst ein Ratespiel und bleibt lieber offen (manuelle Bestätigung).
  return plzOrtTreffer.length === 1 ? plzOrtTreffer[0] : undefined;
}

/** Parst ein deutsches (TT.MM.JJJJ) oder ISO-Datum (JJJJ-MM-TT) und liefert das Jahr. */
export function parseYear(dateStr?: string): number | null {
  if (!dateStr) return null;
  const de = dateStr.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (de) return parseInt(de[3], 10);
  const iso = dateStr.match(/(\d{4})-\d{1,2}-\d{1,2}/);
  if (iso) return parseInt(iso[1], 10);
  const bare = dateStr.match(/\b(19|20)\d{2}\b/);
  if (bare) return parseInt(bare[0], 10);
  return null;
}

/** Prüft, ob ein Jahr im Zeitraumstring einer Abrechnung enthalten ist (z.B. "01.01.2025 - 31.12.2025"). */
export function zeitraumEnthaeltJahr(zeitraum: string, jahr: number): boolean {
  if (!zeitraum) return false;
  const years = [...zeitraum.matchAll(/\b(19|20)\d{2}\b/g)].map((m) => parseInt(m[0], 10));
  if (years.length === 0) return false;
  if (years.length === 1) return years[0] === jahr;
  const min = Math.min(...years);
  const max = Math.max(...years);
  return jahr >= min && jahr <= max;
}

export function jahresZeitraum(jahr: number): string {
  return `01.01.${jahr} - 31.12.${jahr}`;
}
