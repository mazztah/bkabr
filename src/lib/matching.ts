import { Liegenschaft, Mieter, Wohnung, Gebaeude, MietvertragExtraktion } from "./types";

export interface ParsedAddress {
  strasse: string;
  hausnummer: string;
  plz: string;
  ort: string;
}

export interface MietvertragMatchVorschlag {
  mieterId?: string;
  mieterName?: string;
  wohnungId?: string;
  liegenschaftId?: string;
  score: number;
  hinweis?: string;
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

/**
 * Dateiname-Hints wie GFS6, GFS2, SHG10, UZDU4 → Straße/Hausnummer-Fragmente.
 * Hilft, wenn OCR die Adresse schlecht liest, der Dateiname aber die Liegenschaft kodiert.
 */
const DATEINAME_LIEGENSCHAFT_HINTS: { re: RegExp; strasse: string; hnr?: string }[] = [
  { re: /\bgfs\s*6\b|\bgfs6\b/i, strasse: "gorchfock", hnr: "6" },
  { re: /\bgfs\s*4\b|\bgfs4\b/i, strasse: "gorchfock", hnr: "4" },
  { re: /\bgfs\s*2\b|\bgfs2\b/i, strasse: "gorchfock", hnr: "2" },
  { re: /\bshg\s*10\b|\bshg10\b/i, strasse: "spannhagengarten", hnr: "10" },
  { re: /\bshg\s*6\b|\bshg6\b/i, strasse: "spannhagengarten", hnr: "6" },
  { re: /\bshg\s*4\b|\bshg4\b/i, strasse: "spannhagengarten", hnr: "4" },
  { re: /\buzdu\s*4\b|\buzdu4\b/i, strasse: "uzdu", hnr: "4" },
];

function scoreLiegenschaftAgainstText(
  lg: Liegenschaft,
  textNorm: string,
  fileNameNorm: string
): number {
  let score = 0;
  const strasseHnr = normalize(`${lg.strasse}${lg.hausnummer}`);
  const strasse = normalize(lg.strasse);
  if (strasseHnr.length > 3 && (textNorm.includes(strasseHnr) || fileNameNorm.includes(strasseHnr))) {
    score += 50;
  } else if (strasse.length > 4 && (textNorm.includes(strasse) || fileNameNorm.includes(strasse))) {
    score += 25;
    if (lg.hausnummer && (textNorm.includes(normalize(lg.hausnummer)) || fileNameNorm.includes(normalize(lg.hausnummer)))) {
      score += 20;
    }
  }
  if (lg.plz && (textNorm.includes(lg.plz) || fileNameNorm.includes(lg.plz))) score += 8;
  if (lg.ort && normalize(lg.ort).length > 2 && textNorm.includes(normalize(lg.ort))) score += 5;

  for (const hint of DATEINAME_LIEGENSCHAFT_HINTS) {
    if (hint.re.test(fileNameNorm) || hint.re.test(textNorm)) {
      if (strasse.includes(hint.strasse) || normalize(lg.name).includes(hint.strasse)) {
        score += 40;
        if (hint.hnr && normalize(lg.hausnummer) === normalize(hint.hnr)) score += 25;
      }
    }
  }
  return score;
}

function scoreWohnung(bezeichnung: string, extrakt: string, fileName: string): number {
  const n = normalize(bezeichnung);
  if (n.length < 2) return 0;
  let score = 0;
  const e = normalize(extrakt);
  const f = normalize(fileName);
  if (e.includes(n) || n.includes(e)) score += 40;
  // typische Lagen
  const lageTokens = n.match(/(eg|og|dg|links|rechts|mitte|\d+)/g) || [];
  for (const t of lageTokens) {
    if (t.length >= 2 && (e.includes(t) || f.includes(t))) score += 8;
  }
  return score;
}

/**
 * Robustes Matching Wohnung/Mieter/Liegenschaft für Mietvertrags-Upload.
 * Nutzt Dateiname, Adresse, Wohnungsbezeichnung und Mieternamen.
 */
export function matchMietvertragVorschlag(params: {
  fileName: string;
  extraktion: Partial<MietvertragExtraktion>;
  ocrText?: string;
  liegenschaften: Liegenschaft[];
  gebaeude: Gebaeude[];
  wohnungen: Wohnung[];
  mieter: Mieter[];
}): MietvertragMatchVorschlag {
  const { fileName, extraktion, ocrText = "", liegenschaften, gebaeude, wohnungen, mieter } = params;
  const textBlob = [extraktion.objektAdresse, extraktion.wohnungsbezeichnung, ocrText.slice(0, 2500), fileName]
    .filter(Boolean)
    .join(" ");
  const textNorm = normalize(textBlob);
  const fileNameNorm = normalize(fileName);

  // 1) Liegenschaft
  let bestLg: Liegenschaft | undefined;
  let bestLgScore = 0;
  for (const lg of liegenschaften) {
    const s = scoreLiegenschaftAgainstText(lg, textNorm, fileNameNorm);
    if (s > bestLgScore) {
      bestLgScore = s;
      bestLg = lg;
    }
  }
  // Fallback: matchLiegenschaft
  if ((!bestLg || bestLgScore < 20) && extraktion.objektAdresse) {
    const m = matchLiegenschaft(extraktion.objektAdresse, liegenschaften);
    if (m) {
      bestLg = m;
      bestLgScore = Math.max(bestLgScore, 35);
    }
  }

  const gebaeudeIds = bestLg
    ? new Set(gebaeude.filter((g) => g.liegenschaftId === bestLg!.id).map((g) => g.id))
    : null;

  // 2) Wohnung – bevorzugt innerhalb der Liegenschaft
  let bestW: Wohnung | undefined;
  let bestWScore = 0;
  const kandidatWohnungen = gebaeudeIds
    ? wohnungen.filter((w) => gebaeudeIds.has(w.gebaeudeId))
    : wohnungen;
  const extraktWohnung = `${extraktion.wohnungsbezeichnung || ""} ${extraktion.objektAdresse || ""}`;
  for (const w of kandidatWohnungen) {
    let s = scoreWohnung(w.bezeichnung, extraktWohnung, fileName);
    if (gebaeudeIds) s += 15; // Bonus im richtigen Haus
    if (s > bestWScore) {
      bestWScore = s;
      bestW = w;
    }
  }
  // Wenn nur eine Wohnung in der Liegenschaft und Liegenschaft sicher: die nehmen
  if (!bestW && kandidatWohnungen.length === 1 && bestLgScore >= 40) {
    bestW = kandidatWohnungen[0];
    bestWScore = 30;
  }

  // 3) Mieter – Name, bevorzugt in passender Wohnung/Liegenschaft
  let bestM: Mieter | undefined;
  let bestMScore = 0;
  const zielName = normalize(extraktion.mieterName || "");
  if (zielName.length > 2) {
    for (const m of mieter) {
      const n = normalize(m.name);
      if (n.length < 2) continue;
      let s = 0;
      if (n === zielName) s = 60;
      else if (n.includes(zielName) || zielName.includes(n)) s = 40;
      else {
        // Nachname-Token
        const tokens = zielName.split(/\s+/).filter((t) => t.length > 2);
        if (tokens.some((t) => n.includes(t))) s = 25;
      }
      if (bestW && m.wohnungId === bestW.id) s += 25;
      else if (gebaeudeIds) {
        const w = wohnungen.find((x) => x.id === m.wohnungId);
        if (w && gebaeudeIds.has(w.gebaeudeId)) s += 12;
      }
      if (s > bestMScore) {
        bestMScore = s;
        bestM = m;
      }
    }
  }

  // Wenn Mieter gefunden und noch keine Wohnung: dessen Wohnung
  if (bestM && !bestW) {
    bestW = wohnungen.find((w) => w.id === bestM!.wohnungId);
  }
  // Wenn Wohnung gefunden und kein Mieter: ersten Mieter der Wohnung?
  // (nicht automatisch – oft mehrere/leer)

  const score = bestLgScore + bestWScore + bestMScore;
  const hinweise: string[] = [];
  if (bestLg) hinweise.push(`Liegenschaft: ${bestLg.name}`);
  if (bestW) hinweise.push(`Wohnung: ${bestW.bezeichnung}`);
  if (bestM) hinweise.push(`Mieter: ${bestM.name}`);

  return {
    mieterId: bestMScore >= 25 ? bestM?.id : undefined,
    mieterName: bestMScore >= 25 ? bestM?.name : extraktion.mieterName,
    wohnungId: bestWScore >= 20 || (bestM && bestW) ? bestW?.id : bestWScore >= 15 ? bestW?.id : undefined,
    liegenschaftId: bestLgScore >= 20 ? bestLg?.id : undefined,
    score,
    hinweis: hinweise.length ? hinweise.join(" · ") : undefined,
  };
}

/**
 * Notfall-Extraktion aus OCR-Text, wenn das LLM-JSON fehlschlägt.
 * Deckt u.a. „Kaltmiete 840,00 € · BK-VZ 195,00 € · HK-VZ 100,00 € · Gesamt 1.135,00 €“.
 */
export function heuristicMietvertragFromText(text: string, fileName: string): MietvertragExtraktion {
  const t = text || "";
  const num = (s?: string) => {
    if (!s) return undefined;
    const cleaned = s.replace(/\s/g, "").replace(/\.(?=\d{3})/g, "").replace(",", ".");
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : undefined;
  };

  const mieterMatch =
    t.match(/(?:Mieter(?:in)?|Pächter)\s*[:\-]?\s*([A-ZÄÖÜ][a-zäöüß]+(?:\s+[A-ZÄÖÜ][a-zäöüß\-]+)+)/) ||
    t.match(/(?:Herr|Frau)\s+([A-ZÄÖÜ][a-zäöüß]+(?:\s+[A-ZÄÖÜ][a-zäöüß\-]+)+)/);
  const mieteMatch =
    t.match(/(?:Kaltmiete|Grundmiete|Nettomiete)\s*[:\-·]?\s*(\d{1,3}(?:\.\d{3})*(?:[.,]\d{2})?|\d+[.,]\d{2}|\d{2,4})\s*€?/i) ||
    t.match(/(\d{1,3}(?:\.\d{3})*(?:[.,]\d{2})?)\s*€\s*(?:Kaltmiete)/i);
  const bkMatch = t.match(/(?:BK[- ]?VZ|Betriebskosten(?:-Vorauszahlung)?)\s*[:\-·]?\s*(\d{1,3}(?:\.\d{3})*(?:[.,]\d{2})?|\d+[.,]\d{2}|\d{2,4})/i);
  const hkMatch = t.match(/(?:HK[- ]?VZ|Heizkosten(?:-Vorauszahlung)?)\s*[:\-·]?\s*(\d{1,3}(?:\.\d{3})*(?:[.,]\d{2})?|\d+[.,]\d{2}|\d{2,4})/i);
  const nkMatch = t.match(
    /(?:Nebenkosten(?:-Vorauszahlung)?|NK[- ]?VZ)\s*[:\-·]?\s*(\d{1,3}(?:\.\d{3})*(?:[.,]\d{2})?|\d+[.,]\d{2}|\d{2,4})/i
  );
  const warmMatch =
    t.match(/(?:Gesamt(?:miete)?|Warmmiete|Bruttomiete)\s*[:\-·]?\s*(\d{1,3}(?:\.\d{3})*(?:[.,]\d{2})?|\d+[.,]\d{2}|\d{2,4})/i);
  const kautionMatch = t.match(/(?:Kaution|Mietkaution)\s*[:\-·]?\s*(\d{1,3}(?:\.\d{3})*(?:[.,]\d{2})?|\d+[.,]\d{2}|\d{3,5})/i);
  const beginnMatch =
    t.match(/(?:Mietbeginn|Beginn)\s*[:\-·]?\s*(\d{1,2}\.\d{1,2}\.\d{2,4})/i) ||
    t.match(/Beginn\s*[:\-·]?\s*(\d{1,2}\.\d{1,2}\.\d{2,4})/i);
  const endeMatch =
    t.match(/(?:Mietende|Ende|Auszug)\s*[:\-·]?\s*(\d{1,2}\.\d{1,2}\.\d{2,4})/i);
  const flaecheMatch =
    t.match(/(?:Wohnfläche|Fläche|Flaeche)\s*[:\-·]?\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*m/i) ||
    t.match(/(\d{1,3}(?:[.,]\d{1,2})?)\s*m\s*²/);
  const zimmerMatch = t.match(/(\d{1,2})\s*(?:Zi\.?|Zimmer)/i);
  const adresseMatch =
    t.match(
      /((?:Gorch[- ]?Fock|Spannhagengarten|Uzdu)[^\n,]{0,40}\d+[^\n,]{0,20}\d{5}\s*Hannover)/i
    ) ||
    t.match(
      /([A-ZÄÖÜ][a-zäöüß]+(?:straße|strasse|str\.|weg|platz|allee)[^\n,]{0,20}\d+[a-zA-Z]?(?:,?\s*\d{5}\s+[A-Za-zäöüÄÖÜß\-]+)?)/i
    );
  const lageMatch =
    t.match(/(?:Wohnung|Mietobjekt)\s+((?:EG|OG|DG|[0-9]+\.\s*OG)[^\n,;]{0,25}(?:links|rechts|mitte)?)/i) ||
    t.match(/\b((?:EG|Erdgeschoss|[0-9]+\.\s*OG|DG)[^\n,]{0,20}(?:links|rechts|mitte))\b/i);
  const emailMatch = t.match(/([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/);
  const telMatch = t.match(/(?:Tel(?:efon)?\.?|Mobil)\s*[:\-]?\s*([\d\s\/\+\-]{6,20})/i);

  const bk = num(bkMatch?.[1]);
  const hk = num(hkMatch?.[1]);
  let nk = num(nkMatch?.[1]);
  if (nk == null && (bk != null || hk != null)) {
    nk = (bk || 0) + (hk || 0);
  }

  return {
    mieterName: mieterMatch?.[1]?.trim(),
    mieterEmail: emailMatch?.[1],
    mieterTelefon: telMatch?.[1]?.trim(),
    sollMiete: num(mieteMatch?.[1]),
    bkVorauszahlung: bk,
    hkVorauszahlung: hk,
    nebenkostenVorauszahlung: nk,
    warmmiete: num(warmMatch?.[1]),
    kaution: num(kautionMatch?.[1]),
    mietbeginn: beginnMatch?.[1],
    mietende: endeMatch?.[1],
    flaeche: num(flaecheMatch?.[1]),
    zimmer: zimmerMatch ? parseInt(zimmerMatch[1], 10) : undefined,
    objektAdresse: adresseMatch?.[1]?.trim() || (fileName.match(/GFS|SHG|UZDU/i) ? fileName : undefined),
    wohnungsbezeichnung: lageMatch?.[1]?.trim(),
  };
}

/** Füllt fehlende Extraktionsfelder aus Heuristik auf. */
export function mergeMietvertragExtraktion(
  primary: Partial<MietvertragExtraktion>,
  fallback: MietvertragExtraktion
): MietvertragExtraktion {
  const pickNum = (a?: number, b?: number) =>
    a != null && a > 0 ? a : b != null && b > 0 ? b : a ?? b;
  const bk = pickNum(primary.bkVorauszahlung, fallback.bkVorauszahlung);
  const hk = pickNum(primary.hkVorauszahlung, fallback.hkVorauszahlung);
  let nk = pickNum(primary.nebenkostenVorauszahlung, fallback.nebenkostenVorauszahlung);
  if ((nk == null || nk === 0) && (bk || hk)) nk = (bk || 0) + (hk || 0);
  return {
    mieterName: primary.mieterName || fallback.mieterName,
    vermieterName: primary.vermieterName || fallback.vermieterName,
    mieterEmail: primary.mieterEmail || fallback.mieterEmail,
    mieterTelefon: primary.mieterTelefon || fallback.mieterTelefon,
    mietbeginn: primary.mietbeginn || fallback.mietbeginn,
    mietende: primary.mietende || fallback.mietende,
    sollMiete: pickNum(primary.sollMiete, fallback.sollMiete),
    bkVorauszahlung: bk,
    hkVorauszahlung: hk,
    nebenkostenVorauszahlung: nk,
    warmmiete: pickNum(primary.warmmiete, fallback.warmmiete),
    kaution: pickNum(primary.kaution, fallback.kaution),
    objektAdresse: primary.objektAdresse || fallback.objektAdresse,
    wohnungsbezeichnung: primary.wohnungsbezeichnung || fallback.wohnungsbezeichnung,
    flaeche: pickNum(primary.flaeche, fallback.flaeche),
    zimmer: pickNum(primary.zimmer, fallback.zimmer),
  };
}
