import Groq from "groq-sdk";
import {
  Abrechnung,
  ExtractedData,
  Liegenschaft,
  Gebaeude,
  Wohnung,
  Mieter,
  Mietvertrag,
  KontoauszugTransaktion,
  ERKANNTE_DOKUMENT_TYPEN,
  ErkannterDokumentTyp,
  MietvertragExtraktion,
} from "./types";
import { mietRueckstand } from "./mietkonto";
import { createChatCompletion, VISION_MODEL } from "./groq-client";

/**
 * Erkennt Small-Talk / triviale Nachrichten ("hallo", "danke", "ok" …), bei
 * denen KEIN Portfolio-Kontext nötig ist. Grund: chatWithContext hat vorher
 * bei JEDER Nachricht das komplette Portfolio (alle Liegenschaften → Gebäude
 * → Wohnungen → Mieter inkl. Miete/Rückständen) + bis zu 40 Mietrückstände +
 * bis zu 30 Abrechnungen in den System-Prompt gepackt. Bei einem größeren
 * Bestand sind das schnell mehrere tausend Tokens – für "hallo" komplett
 * verschwendet und laut Server-Logs regelmäßig der Grund, warum bereits der
 * erste Modell-Versuch mit "Request too large" scheitert und die gesamte
 * Fallback-Kette (7-8 Provider) durchlaufen wird, bevor überhaupt geantwortet
 * werden kann.
 */
function isSmallTalk(message: string): boolean {
  const m = message
    .trim()
    .toLowerCase()
    .replace(/[!?.,;:]+$/g, "");
  if (m.length > 40) return false; // längere Nachrichten haben fast immer fachlichen Bezug
  return /^(hallo|hi|hey|servus|moin|guten\s*(morgen|tag|abend)|na|test|ok|okay|danke|dankeschön|super|top|passt|alles klar|verstanden|gut|cool|nice)\b/.test(
    m
  );
}

/**
 * Kontext-Engineering: klassifiziert, welchen DATENUMFANG eine Anfrage
 * tatsächlich braucht, statt bei jeder Nachricht denselben vollen
 * Portfolio-Dump (alle Liegenschaften→Gebäude→Wohnungen→Mieter inkl.
 * Finanzdaten, Rückstände, Abrechnungen) mitzuschicken. Das war der
 * Hauptgrund, warum selbst einfache Fragen ("welche Liegenschaften haben
 * wir") die Free-Tier-TPM-Limits mehrerer Modelle in der Fallback-Kette
 * gesprengt haben.
 *
 * Bewusst KONSERVATIV: Sobald ein Begriff auftaucht, der auf Finanzen,
 * Abrechnungen, Verträge oder Mieter-Details hindeutet, wird "voll"
 * zurückgegeben (aktuelles, bewährtes Verhalten). Die leichten Stufen
 * greifen nur bei eindeutig eng umrissenen Struktur-/Belegungsfragen.
 * Lieber einmal zu viel Kontext als eine falsche/unvollständige Antwort in
 * einer Hausverwaltungs-App.
 */
type KontextBedarf = "adressen" | "belegung" | "rueckstaende" | "voll";

function klassifiziereKontextbedarf(message: string): KontextBedarf {
  const m = message.toLowerCase();

  const hatFinanzBezug =
    /miete\b|kaltmiete|nebenkosten|kosten|saldo|guthaben|nachzahlung|zahlung|betrag|summe|\beuro\b|€|vertrag|kündig/.test(
      m
    );
  const hatAbrechnungsBezug = /abrechnung|beleg|position/.test(m);
  const hatRueckstandsBezug =
    /rückstand|rueckstand|säumig|saeumig|schulden|offene?\s*(miete|forderung)|mahnung/.test(m);
  const hatMieterDetailBezug = /\bmieter\b.*(kontakt|telefon|email|e-mail|wer\b)|kontakt|telefon|e-?mail/.test(m);

  // Finanz-/Abrechnungs-/Vertragsfragen und Mieter-Detailfragen sind stark
  // verflochten – hier lieber der bewährte volle Kontext.
  if (hatAbrechnungsBezug || hatFinanzBezug || hatMieterDetailBezug) return "voll";
  if (hatRueckstandsBezug) return "rueckstaende";

  // Reine Bestands-/Struktur-Fragen ohne Wohnungs-/Belegungsbezug:
  // "welche Liegenschaften haben wir", "wie viele Gebäude" …
  if (/liegenschaft|gebäude|gebaeude|\bobjekt(e)?\b|adresse|\bbestand\b/.test(m) && !/wohnung|einheit|leerstand|frei|belegt/.test(m)) {
    return "adressen";
  }

  // Belegungs-/Leerstandsfragen: wie viele Wohnungen, Leerstände, frei/belegt
  if (/leerstand|leer\s*steh|unbelegt|\bbelegt\b|\bfrei\b|wohnung|einheit/.test(m)) {
    return "belegung";
  }

  return "voll";
}

/**
 * Robustes JSON-Parsing aus LLM-Antworten.
 * Free-Tier-Modelle liefern gelegentlich abgeschnittenes JSON, Markdown-Fences
 * oder Text vor/nach dem Objekt – das hier abfangen, bevor der Upload scheitert.
 */
function extractJson(text: string): any {
  if (!text || !String(text).trim()) {
    throw new Error("Keine gültige JSON-Antwort erhalten (leere Modell-Antwort)");
  }
  let candidate = String(text).trim();

  // Markdown-Codefence entfernen
  const fenced = candidate.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) candidate = fenced[1].trim();

  // Häufiger Prefix-Müll
  candidate = candidate.replace(/^[^{[]*?(?=[{\[])/, "");

  const startObj = candidate.indexOf("{");
  const startArr = candidate.indexOf("[");
  let start = -1;
  if (startObj === -1) start = startArr;
  else if (startArr === -1) start = startObj;
  else start = Math.min(startObj, startArr);

  if (start === -1) {
    throw new Error("Keine gültige JSON-Antwort erhalten");
  }

  candidate = candidate.slice(start);

  // Vollständiges Objekt/Array per Brace-Counting extrahieren
  const open = candidate[0];
  const close = open === "[" ? "]" : "}";
  let depth = 0;
  let inString = false;
  let escape = false;
  let end = -1;
  for (let i = 0; i < candidate.length; i++) {
    const ch = candidate[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  let jsonStr = end >= 0 ? candidate.slice(0, end + 1) : candidate;

  // Abgeschnittene Strings notdürftig schließen (Free-Tier-Truncation)
  if (end < 0) {
    let repaired = jsonStr;
    // Offene Strings schließen
    let qs = 0;
    let esc = false;
    for (let i = 0; i < repaired.length; i++) {
      const c = repaired[i];
      if (esc) {
        esc = false;
        continue;
      }
      if (c === "\\") {
        esc = true;
        continue;
      }
      if (c === '"') qs++;
    }
    if (qs % 2 === 1) repaired += '"';
    // Klammern ausbalancieren
    const opens = (repaired.match(/{/g) || []).length;
    const closes = (repaired.match(/}/g) || []).length;
    const aOpens = (repaired.match(/\[/g) || []).length;
    const aCloses = (repaired.match(/]/g) || []).length;
    // Trailing Komma entfernen
    repaired = repaired.replace(/,\s*$/, "");
    repaired += "}".repeat(Math.max(0, opens - closes));
    repaired += "]".repeat(Math.max(0, aOpens - aCloses));
    jsonStr = repaired;
  }

  try {
    return JSON.parse(jsonStr);
  } catch (e: any) {
    // Letzter Versuch: trailing commas / Steuerzeichen
    const cleaned = jsonStr
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/[\u0000-\u001f]+/g, " ");
    try {
      return JSON.parse(cleaned);
    } catch {
      throw new Error(
        `Keine gültige JSON-Antwort erhalten (${e?.message || "Parse-Fehler"}). Bitte Datei erneut versuchen – oft Free-Tier-Limit oder abgeschnittene Antwort.`
      );
    }
  }
}

/** Einmaliger Retry bei kaputtem JSON – kürzerer Prompt, klarere Anweisung. */
async function withJsonRetry<T>(
  run: (strictHint: boolean) => Promise<string>,
  parse: (raw: string) => T
): Promise<T> {
  let lastErr: any;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await run(attempt > 0);
      return parse(raw);
    } catch (e: any) {
      lastErr = e;
      const msg = String(e?.message || e || "").toLowerCase();
      const isJsonFail =
        msg.includes("json") ||
        msg.includes("unterminated") ||
        msg.includes("keine gültige") ||
        msg.includes("parse");
      if (!isJsonFail || attempt === 1) throw e;
      console.warn(`[ai] JSON-Parse fehlgeschlagen, Retry… (${e?.message || e})`);
    }
  }
  throw lastErr;
}

const SYSTEM_EXTRAKTION = `Du bist "BetriebsKostenBot", ein Experte für deutsche Betriebskosten- und Nebenkostenabrechnungen, Mieteinnahmen, Heizkostenabrechnungen, Mietverträge und Eingangsrechnungen.
Analysiere das übergebene Dokument (Rechnung, Betriebskostenabrechnung, Nebenkostenabrechnung, Mietvertrag, Heizkostenabrechnung, Einnahmen/Ausgaben-Aufstellung o.ä.) und extrahiere die relevanten Daten.

WICHTIGSTE REGEL: Trage NUR Werte ein, die wörtlich oder eindeutig erkennbar im übergebenen Text stehen. Rate niemals, leite niemals Werte aus Firmennamen, Textmustern, Layoutvermutungen oder Weltwissen ab. Der übergebene Text kann OCR-/Extraktionsfehler oder Lücken enthalten – im Zweifel leeres Feld statt Vermutung. Ein leeres/falsches Feld ist immer besser als eine erfundene Angabe.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt (kein Fließtext, keine Erklärung) in exakt diesem Format:
{
  "name": "kurzer Titel/Objektname",
  "adresse": "vollständige Adresse des Objekts",
  "objektTyp": "Wohnung" | "Haus" | "Gewerbe",
  "zeitraum": "z.B. 01.01.2025 - 31.12.2025",
  "gesamtSumme": <Zahl in Euro, NUR falls ein Gesamt-/Endbetrag eindeutig im Text steht, sonst 0>,
  "positionen": [ { "name": "Heizung", "betrag": <Zahl>, "beschreibung": "kurz" }, ... ],
  "rawText": "kurze, wortgetreue Zusammenfassung der wichtigsten erkannten Rohdaten (keine Interpretation)",
  "rechnungsnummer": "Rechnungs-/Belegnummer, NUR falls im Text vorhanden, sonst leerer String",
  "rechnungsdatum": "Datum der Rechnung, z.B. 12.03.2025, NUR falls im Text vorhanden, sonst leerer String",
  "betrag": <Rechnungsendbetrag in Euro, NUR falls eindeutig, sonst 0>,
  "leistungsart": "Was wurde geliefert/geleistet, NUR falls im Text erkennbar",
  "leistungsort": "Ort/Objekt der Leistungserbringung, NUR falls im Text erkennbar",
  "auftraggeber": "Empfänger der Rechnung, NUR falls im Text erkennbar",
  "auftragnehmer": "Aussteller/Lieferant der Rechnung, NUR falls im Text erkennbar",
  "firma": "Firmenname des Rechnungsstellers, NUR falls im Text erkennbar",
  "rechnungsadresse": "Anschrift auf der Rechnung, NUR falls im Text erkennbar"
}
Falls ein Wert nicht sicher erkennbar ist, verwende leeren String bzw. 0 – niemals raten oder erfinden.`;

const SYSTEM_TRANSKRIPTION = `Du bist ein OCR-Assistent. Gib AUSSCHLIESSLICH den auf dem Bild tatsächlich sichtbaren Text wortgetreu wieder (Tabellen zeilenweise, Zahlen exakt wie abgebildet).
Keine Interpretation, keine Ergänzung, keine Zusammenfassung, keine Vervollständigung unleserlicher Stellen. Ist ein Teil unleserlich oder unsicher, markiere ihn mit [unleserlich] statt zu raten. Erfinde niemals Wörter, Zahlen oder Namen, die nicht klar erkennbar sind.`;

/**
 * Lässt das Groq Vision-Modell den Bildinhalt (Rechnung/Abrechnung) abschreiben.
 * Dient als (zweite, unabhängige) OCR-Quelle neben Tesseract.js.
 */
export async function visionTranscribe(params: {
  base64: string;
  mimeType: string;
  fileName: string;
}): Promise<string> {
  const { base64, mimeType, fileName } = params;
  const completion = await createChatCompletion({
    model: VISION_MODEL,
    max_completion_tokens: 2000,
    temperature: 0,
    messages: [
      { role: "system", content: SYSTEM_TRANSKRIPTION },
      {
        role: "user",
        content: [
          { type: "text", text: `Datei: ${fileName}. Gib den Bildinhalt als Text wieder.` },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
        ] as any,
      },
    ],
  });

  return completion.choices[0]?.message?.content || "";
}

/**
 * Analysiert bereits als Klartext vorliegenden Inhalt (TXT-Upload, aus PDF extrahierter
 * Text, oder die kombinierte OCR-Ausgabe aus Tesseract + Vision-LLM für Bild-Uploads)
 * und extrahiert die strukturierten Abrechnungsdaten.
 */
export async function analyzeDocument(params: {
  text: string;
  fileName: string;
}): Promise<ExtractedData> {
  const { text, fileName } = params;
  const completion = await createChatCompletion({
    max_completion_tokens: 2000,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_EXTRAKTION },
      {
        role: "user",
        content: `Datei: ${fileName}.\n\nInhalt des Dokuments:\n${text}\n\nAnalysiere dieses Dokument und liefere die JSON-Extraktion.`,
      },
    ],
  });

  const result = completion.choices[0]?.message?.content || "";
  return extractJson(result) as ExtractedData;
}

const SYSTEM_MIETVERTRAG = `Du bist ein Experte für deutsche Mietverträge. Analysiere den Text sorgfältig und extrahiere ALLE erkennbaren Stammdaten für Mieter, Wohnung und Vertrag.

WICHTIGE PRÄZISIONS-REGELN (häufige Fehlerquellen):
- "sollMiete" ist IMMER die reine Nettokaltmiete (ohne jegliche Nebenkosten) – meist bezeichnet als "Kaltmiete", "Grundmiete", "Nettomiete" oder schlicht "Miete" im Absatz zur monatlichen Zahlung. NIEMALS die Warmmiete/Gesamtmiete hier eintragen.
- Enthält der Vertrag eine Staffelmiete oder Indexmiete (mehrere Beträge zu verschiedenen zukünftigen Zeitpunkten), nimm für "sollMiete" AUSSCHLIESSLICH den zu Mietbeginn gültigen ERSTEN Betrag – niemals eine spätere Erhöhungsstufe.
- Unterscheide klar: bkVorauszahlung (Betriebskosten/BK-VZ), hkVorauszahlung (Heizkosten/HK-VZ), nebenkostenVorauszahlung (nur falls NICHT einzeln aufgeschlüsselt) und warmmiete (die Summe aus allem = Gesamtmiete/Bruttomiete). Verwechsle diese vier Werte nicht miteinander.
- Prüfe intern, ob sollMiete + bkVorauszahlung + hkVorauszahlung ungefähr der genannten Warmmiete entspricht. Wenn nicht, vertraue den explizit im Text genannten Einzelbeträgen (nicht der Summe) – trage aber KEINE geratenen/errechneten Werte ein, sondern nur was wörtlich im Vertrag steht.
- Bei mehreren Mietparteien/Wohnungen im selben Dokument: extrahiere nur die Daten der im Rubrum/Vertragskopf als Hauptmieter genannten Partei und deren Einheit.
- Ein Betrag, der eindeutig im Kontext einer Kaution, eines Nachtrags, eines Streitfalls oder eines Rechenbeispiels in den AGB steht, ist NICHT die aktuell gültige Miete – überspringen.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt in exakt diesem Format:
{
  "mieterName": "vollständiger Name des Mieters/der Mieter",
  "vermieterName": "Name des Vermieters",
  "mieterEmail": "E-Mail falls genannt, sonst leerer String",
  "mieterTelefon": "Telefon falls genannt, sonst leerer String",
  "mietbeginn": "Datum z.B. 01.01.2023, sonst leerer String",
  "mietende": "Ende/Auszug z.B. 31.03.2026 falls befristet/genannt, sonst leerer String",
  "sollMiete": <Kaltmiete/Nettomiete zu Mietbeginn in Euro als Zahl, z.B. 840>,
  "bkVorauszahlung": <Betriebskosten-Vorauszahlung BK-VZ in Euro, sonst 0>,
  "hkVorauszahlung": <Heizkosten-Vorauszahlung HK-VZ in Euro, sonst 0>,
  "nebenkostenVorauszahlung": <Summe BK+HK oder pauschale NK-VZ in Euro; wenn BK und HK einzeln da: Summe>,
  "warmmiete": <Gesamtmiete/Warmmiete pro Monat falls im Text genannt, sonst 0>,
  "kaution": <Kaution in Euro, sonst 0>,
  "objektAdresse": "Straße Hausnummer, PLZ Ort",
  "wohnungsbezeichnung": "Lage z.B. EG links, 1. OG rechts",
  "flaeche": <Wohnfläche in m² als Zahl, z.B. 72, sonst 0>,
  "zimmer": <Zimmeranzahl als Zahl, z.B. 3, sonst 0>,
  "unsicherheiten": ["Liste der Feldnamen, bei denen du dir nicht sicher bist, z.B. weil mehrere widersprüchliche Beträge im Text stehen"]
}
WICHTIG: Zahlen ohne Tausenderpunkt, Komma als Dezimaltrenner im Text → als Zahl (840,00 → 840). Erfinde nichts. Fehlende Werte: leerer String bzw. 0.`;

/**
 * Baut für lange Mietverträge einen Auszug, der neben dem Vertragskopf
 * (Parteien, Objekt) gezielt die Textabschnitte rund um Miet-Schlüsselwörter
 * enthält – sonst rutscht die eigentliche Mietsumme bei langen Verträgen
 * (AGB, Hausordnung etc.) leicht aus dem an das Modell gesendeten Ausschnitt.
 */
function buildMietvertragExcerpt(text: string, maxLen = 11000): string {
  if (!text || text.length <= maxLen) return text || "";
  const kopf = text.slice(0, 4500);
  const keywords = /(kaltmiete|nettomiete|grundmiete|mietzins|warmmiete|bruttomiete|betriebskosten|heizkosten|nebenkosten|staffelmiete|indexmiete|kaution)/gi;
  const windows: { start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = keywords.exec(text))) {
    const start = Math.max(0, m.index - 200);
    const end = Math.min(text.length, m.index + 400);
    windows.push({ start, end });
  }
  // Überlappende Fenster zusammenführen
  windows.sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const w of windows) {
    const last = merged[merged.length - 1];
    if (last && w.start <= last.end) last.end = Math.max(last.end, w.end);
    else merged.push({ ...w });
  }
  let extra = "";
  const budget = maxLen - kopf.length - 200;
  for (const w of merged) {
    if (extra.length >= budget) break;
    extra += `\n[…]\n${text.slice(w.start, w.end)}`;
  }
  return `${kopf}\n\n--- Relevante Textstellen zu Miete/Nebenkosten (aus dem restlichen Dokument) ---${extra.slice(0, budget)}`;
}

export async function extractMietvertrag(params: {
  text: string;
  fileName: string;
}): Promise<import("./types").MietvertragExtraktion> {
  const { text, fileName } = params;
  const textSlice = buildMietvertragExcerpt(text, 11000);
  return withJsonRetry(
    async (strict) => {
      const completion = await createChatCompletion({
        max_completion_tokens: 1500,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_MIETVERTRAG },
          {
            role: "user",
            content: strict
              ? `Datei: ${fileName}.\n\nWICHTIG: Antworte NUR mit einem vollständigen, gültigen JSON-Objekt.\n\nInhalt (Auszug):\n${textSlice}\n\nExtrahiere die JSON-Daten.`
              : `Datei: ${fileName}.\n\nInhalt:\n${textSlice}\n\nExtrahiere die JSON-Daten.`,
          },
        ],
      });
      return completion.choices[0]?.message?.content || "";
    },
    (raw) => extractJson(raw)
  );
}

const SYSTEM_KONTOAUSZUG = `Du bist ein Experte für deutsche Bankauszüge/Kontoauszüge (PDF-Text oder CSV-Export). Analysiere den übergebenen Text und extrahiere AUSSCHLIESSLICH die Zahlungseingänge (Gutschriften, positive Beträge) – ignoriere Abbuchungen/Lastschriften/Belastungen.
Antworte AUSSCHLIESSLICH mit einem JSON-Objekt in exakt diesem Format:
{
  "transaktionen": [
    {
      "datum": "YYYY-MM-DD",
      "betrag": <Betrag als positive Zahl>,
      "verwendungszweck": "Verwendungszweck/Buchungstext kurz",
      "absender": "Name des Auftraggebers/Einzahlers, falls erkennbar, sonst leerer String"
    }
  ]
}
WICHTIG: Maximal 40 Transaktionen. Bei mehr Einträgen die neuesten/wichtigsten priorisieren.
Kurze Verwendungszwecke (max. ~80 Zeichen). Erfinde keine Transaktionen. Falls kein Datum: leerer String.`;

export async function extractKontoauszug(params: {
  text: string;
  fileName: string;
}): Promise<KontoauszugTransaktion[]> {
  const { text, fileName } = params;
  // Lange Kontoauszüge + Free-Tier → abgeschnittenes JSON ("," / "]" Fehler).
  // Input und Output strikt begrenzen.
  const textSlice = text.slice(0, 6000);
  return withJsonRetry(
    async (strict) => {
      const completion = await createChatCompletion({
        max_completion_tokens: 2500,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_KONTOAUSZUG },
          {
            role: "user",
            content: strict
              ? `Datei: ${fileName}.\n\nWICHTIG: NUR vollständiges gültiges JSON, max. 40 Transaktionen, kurze Texte.\n\nInhalt (Auszug):\n${textSlice}\n\nExtrahiere die JSON-Daten.`
              : `Datei: ${fileName}.\n\nInhalt:\n${textSlice}\n\nExtrahiere die JSON-Daten (max. 40 Zahlungseingänge).`,
          },
        ],
      });
      return completion.choices[0]?.message?.content || "";
    },
    (raw) => {
      const parsed = extractJson(raw) as { transaktionen?: KontoauszugTransaktion[] };
      const list = Array.isArray(parsed.transaktionen) ? parsed.transaktionen : [];
      return list.slice(0, 40);
    }
  );
}

const SYSTEM_EIGENTUEMER = `Du bist ein Experte für deutsche Hausverwaltungs- und WEG-Dokumente. Analysiere den übergebenen Text eines eigentümerbezogenen Dokuments (z.B. Vollmacht, Eigentümerbeschluss, Grundbuchauszug, Verwaltervollmacht, Kontaktdaten-Schreiben) und extrahiere die relevanten Stammdaten.
Antworte AUSSCHLIESSLICH mit einem JSON-Objekt in exakt diesem Format:
{
  "eigentuemerName": "Name des/der Eigentümer(s)",
  "anschrift": "vollständige Anschrift des Eigentümers (Straße, PLZ, Ort)",
  "email": "E-Mail-Adresse, sonst leerer String",
  "telefon": "Telefonnummer, sonst leerer String",
  "miteigentumsanteil": <Miteigentumsanteil als Zahl (z.B. 125 für 125/1000), sonst 0>,
  "vollmachtBeginn": "Datum, sonst leerer String",
  "vollmachtEnde": "Datum, sonst leerer String",
  "dokumentTyp": "kurze Bezeichnung des Dokumenttyps, z.B. Vollmacht/Grundbuchauszug/Eigentümerbeschluss",
  "objektAdresse": "vollständige Adresse der betroffenen Liegenschaft/Immobilie (Straße Hausnummer, PLZ Ort)",
  "liegenschaftName": "Name/Bezeichnung der Liegenschaft, falls im Dokument genannt, sonst leerer String"
}
Erfinde keine Fakten, die nicht im Dokument stehen. Falls ein Wert nicht erkennbar ist: leerer String bzw. 0.`;

export async function extractEigentuemerDokument(params: {
  text: string;
  fileName: string;
}): Promise<import("./types").EigentuemerExtraktion> {
  const { text, fileName } = params;
  // Notarverträge sind oft sehr lang – zu viel Input + Free-Tier-Tokenlimit
  // führt zu abgeschnittenem JSON ("Unterminated string…").
  const textSlice = text.slice(0, 8000);
  return withJsonRetry(
    async (strict) => {
      const completion = await createChatCompletion({
        max_completion_tokens: 1500,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_EIGENTUEMER },
          {
            role: "user",
            content: strict
              ? `Datei: ${fileName}.\n\nWICHTIG: Antworte NUR mit einem vollständigen, gültigen JSON-Objekt – keine Erklärungen, keine abgeschnittenen Strings.\n\nInhalt (Auszug):\n${textSlice}\n\nExtrahiere die JSON-Daten.`
              : `Datei: ${fileName}.\n\nInhalt:\n${textSlice}\n\nExtrahiere die JSON-Daten.`,
          },
        ],
      });
      return completion.choices[0]?.message?.content || "";
    },
    (raw) => extractJson(raw)
  );
}

const SYSTEM_PM_VERTRAG = `Du bist ein Experte für deutsche Property-Management- und Hausverwaltungsverträge. Analysiere den übergebenen Text eines PM-/Verwaltervertrags und extrahiere die relevanten Stammdaten.
Antworte AUSSCHLIESSLICH mit einem JSON-Objekt in exakt diesem Format:
{
  "verwalterName": "Name der Hausverwaltung/des Property Managers",
  "auftraggeberName": "Name des Auftraggebers/Eigentümers",
  "honorarModell": "kurze Bezeichnung, z.B. Pauschale/je Einheit/Prozent der Mieteinnahmen, sonst leerer String",
  "honorarSatz": <Satz als Zahl (Euro oder Prozent, je nach Modell), sonst 0>,
  "leistungsumfang": "kurze Zusammenfassung des vereinbarten Leistungsumfangs",
  "laufzeitBeginn": "Datum, sonst leerer String",
  "laufzeitEnde": "Datum falls befristet, sonst leerer String",
  "kuendigungsfrist": "Kündigungsfrist, z.B. '3 Monate zum Jahresende', sonst leerer String",
  "objektAdresse": "vollständige Adresse der betroffenen Liegenschaft/Immobilie (Straße Hausnummer, PLZ Ort)",
  "liegenschaftName": "Name/Bezeichnung der Liegenschaft, falls im Dokument genannt, sonst leerer String"
}
Erfinde keine Fakten, die nicht im Dokument stehen. Falls ein Wert nicht erkennbar ist: leerer String bzw. 0.`;

export async function extractPmVertrag(params: {
  text: string;
  fileName: string;
}): Promise<import("./types").PmVertragExtraktion> {
  const { text, fileName } = params;
  const textSlice = text.slice(0, 8000);
  return withJsonRetry(
    async (strict) => {
      const completion = await createChatCompletion({
        max_completion_tokens: 1500,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PM_VERTRAG },
          {
            role: "user",
            content: strict
              ? `Datei: ${fileName}.\n\nWICHTIG: Antworte NUR mit einem vollständigen, gültigen JSON-Objekt – keine Erklärungen, keine abgeschnittenen Strings.\n\nInhalt (Auszug):\n${textSlice}\n\nExtrahiere die JSON-Daten.`
              : `Datei: ${fileName}.\n\nInhalt:\n${textSlice}\n\nExtrahiere die JSON-Daten.`,
          },
        ],
      });
      return completion.choices[0]?.message?.content || "";
    },
    (raw) => extractJson(raw)
  );
}

const SYSTEM_WOHNUNGSUEBERSICHT = `Du bist ein Experte für deutsche Hausverwaltungs-Objektunterlagen. Analysiere den übergebenen Text (Anlage zum PM-Vertrag, Objektbeschreibung, Mieterliste oder eine hochgeladene Excel-/CSV-Stammdatenliste) und extrahiere daraus eine Übersicht der Gebäude, Wohnungen/Einheiten und – falls vorhanden – der zugehörigen Mieter.

WICHTIGSTE REGEL: Trage NUR Zeilen/Werte ein, die eindeutig als eigene Wohnung/Einheit im Text erkennbar sind (typischerweise eine Tabelle mit Wohnungsbezeichnung/Lage, Fläche/Größe in m², ggf. Zimmerzahl, ggf. Mietername/Miete). Erfinde niemals Wohnungen, Größen oder Namen. Ist gar keine solche Tabelle/Liste im Text enthalten (z.B. reiner Fließtext ohne Einheitenliste), liefere ein leeres "einheiten"-Array.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt in exakt diesem Format:
{
  "liegenschaftName": "Name/Bezeichnung der Liegenschaft, falls im Dokument genannt, sonst leerer String",
  "objektAdresse": "vollständige Adresse der Liegenschaft (Straße Hausnummer, PLZ Ort), falls erkennbar, sonst leerer String",
  "einheiten": [
    {
      "gebaeudeName": "Name/Bezeichnung des Gebäudes, z.B. 'Haus A' oder die Adresse des Gebäudeteils, falls im Text unterschieden, sonst leerer String",
      "wohnungsbezeichnung": "Bezeichnung/Lage der Wohnung, z.B. '1. OG links' oder 'Whg. 3'",
      "typ": "Wohnung" | "Gewerbe" | "Stellplatz" | "Sonstige",
      "flaeche": <Wohnfläche in m² als Zahl, sonst 0>,
      "zimmer": <Anzahl Zimmer als Zahl, sonst 0>,
      "miteigentumsanteil": <Miteigentumsanteil als Zahl (z.B. 125 für 125/1000), sonst 0>,
      "mieterName": "Name des aktuellen Mieters, NUR falls im Text bei dieser Wohnung genannt, sonst leerer String",
      "kaltmiete": <Kaltmiete in Euro, NUR falls genannt, sonst 0>,
      "nebenkostenVorauszahlung": <monatliche NK-Vorauszahlung in Euro, NUR falls genannt, sonst 0>,
      "mietbeginn": "Datum, NUR falls genannt, sonst leerer String"
    }
  ]
}
Falls ein Wert nicht sicher erkennbar ist: leerer String bzw. 0. Rate niemals.`;

/**
 * Extrahiert eine Wohnungs-/Mieterübersicht aus einer Anlage zum PM-Vertrag
 * (Objektbeschreibung, Mieterliste) oder einer hochgeladenen Excel-/CSV-Stammdatenliste.
 * Liefert ein leeres `einheiten`-Array, wenn im Text keine entsprechende Tabelle
 * gefunden wurde (z.B. bei einer reinen Liegenschaftskarte/Lageplan).
 */
export async function extractWohnungsuebersicht(params: {
  text: string;
  fileName: string;
  anweisung?: string;
}): Promise<import("./types").WohnungsuebersichtExtraktion> {
  const { text, fileName, anweisung } = params;
  const completion = await createChatCompletion({
    max_completion_tokens: 4000,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_WOHNUNGSUEBERSICHT },
      {
        role: "user",
        content: `Datei: ${fileName}.${
          anweisung ? `\n\nHinweis des Nutzers zu diesem Upload: ${anweisung}` : ""
        }\n\nInhalt:\n${text.slice(0, 16000)}\n\nExtrahiere die JSON-Daten.`,
      },
    ],
  });

  const result = completion.choices[0]?.message?.content || "";
  try {
    const parsed = extractJson(result) as { liegenschaftName?: string; objektAdresse?: string; einheiten?: unknown };
    const einheiten = Array.isArray(parsed.einheiten) ? parsed.einheiten : [];
    return {
      liegenschaftName: parsed.liegenschaftName || "",
      objektAdresse: parsed.objektAdresse || "",
      einheiten: einheiten as import("./types").WohnungsuebersichtEintrag[],
    };
  } catch {
    return { liegenschaftName: "", objektAdresse: "", einheiten: [] };
  }
}

const SYSTEM_ZUORDNUNGSPRUEFUNG = `Du bist ein sorgfältiger Prüfer bei einer Hausverwaltung. Du bekommst den Textinhalt eines abgelegten Dokuments sowie die Stammdaten des Objekts, dem es aktuell zugeordnet ist. Beurteile NUR, ob diese Zuordnung inhaltlich plausibel ist (z.B. stimmen Adresse/Straße/Hausnummer, Namen, grobe Beträge grundsätzlich zum Zielobjekt überein) – nicht mehr und nicht weniger.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt:
{
  "plausibel": true oder false,
  "begruendung": "kurze Begründung, max. 1 Satz",
  "konfidenz": <Zahl 0-1, wie sicher du dir bist>
}
Sei zurückhaltend mit "plausibel: false" – nur wenn ein klarer, konkreter Widerspruch erkennbar ist (z.B. andere Hausnummer/Straße im Dokument als beim Zielobjekt). Bei Unsicherheit: plausibel: true, niedrige Konfidenz.`;

export interface ZuordnungsPruefErgebnis {
  plausibel: boolean;
  begruendung: string;
  konfidenz: number;
}

/**
 * Lässt das LLM beurteilen, ob ein bereits zugeordnetes Dokument inhaltlich zu
 * seinem Zielobjekt passt (Teil der automatisierten Plausibilitätsprüfung).
 * Wird nur für eine begrenzte Stichprobe aufgerufen (Kostenkontrolle).
 */
export async function pruefeDokumentZuordnung(params: {
  dokumentText: string;
  zielLabel: string;
  zielTyp: string;
}): Promise<ZuordnungsPruefErgebnis> {
  const completion = await createChatCompletion({
    max_completion_tokens: 300,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_ZUORDNUNGSPRUEFUNG },
      {
        role: "user",
        content: `Zielobjekt (${params.zielTyp}): ${params.zielLabel}\n\nDokumentinhalt (Auszug):\n${params.dokumentText.slice(0, 4000)}\n\nIst diese Zuordnung plausibel?`,
      },
    ],
  });
  const raw = completion.choices[0]?.message?.content || "";
  try {
    const parsed = extractJson(raw) as Partial<ZuordnungsPruefErgebnis>;
    return {
      plausibel: parsed.plausibel !== false,
      begruendung: parsed.begruendung || "",
      konfidenz: typeof parsed.konfidenz === "number" ? parsed.konfidenz : 0.5,
    };
  } catch {
    return { plausibel: true, begruendung: "", konfidenz: 0 };
  }
}

// -------- Klassifizierung beim Sammel-Upload (viele unterschiedliche Dokumente auf einmal) --------

const SYSTEM_KLASSIFIZIERUNG = `Du bist ein Dokumenten-Klassifizierer für eine deutsche Hausverwaltungs-Software. Ordne das übergebene Dokument (Dateiname + erkannter Text, ggf. gekürzt) GENAU EINER der folgenden Kategorien zu:

- "rechnung": Eingangsrechnung/Beleg einer Firma (Handwerker, Versorger, Dienstleister) für eine Liegenschaft.
- "mietvertrag": vollständiger, neuer Mietvertrag zwischen Vermieter und Mieter (Erstvertrag).
- "mietvertrag_nachtrag": Nachtrag/Änderung/Ergänzung zu einem BESTEHENDEN Mietvertrag (z.B. Mieterwechsel, Mieterhöhung, Zusatzvereinbarung, Untermieterlaubnis) – kein vollständiger Erstvertrag.
- "uebergabeprotokoll": Wohnungsübergabeprotokoll (Ein- oder Auszug), Zählerstände, Schlüsselübergabe.
- "pm_vertrag": Property-Management-/Hausverwaltervertrag zwischen Eigentümer und Verwaltung.
- "eigentuemer_dokument": eigentümerbezogenes Dokument wie Vollmacht, Eigentümerbeschluss, WEG-Beschluss, Kontaktschreiben (NICHT Grundbuchauszug oder Kaufvertrag).
- "grundbuchauszug": Grundbuchauszug / Grundbuchblatt.
- "kaufvertrag": Notarieller Kaufvertrag / Immobilienkaufvertrag.
- "liegenschaftskarte": Lageplan, Liegenschafts-/Flurstückskarte, Katasterauszug, Objekt-/Gebäudebeschreibung, Gebäude- oder Mieterlisten-Übersicht (Anlage zu PM-Vertrag/Liegenschaft, keine Einzelrechnung/kein Vertrag).
- "kontoauszug": Bankauszug / Kontoauszug mit Buchungen/Transaktionen.
- "unbekannt": passt zu keiner der obigen Kategorien oder ist nicht eindeutig zuordenbar.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt:
{ "typ": "<eine der Kategorien exakt>", "konfidenz": <Zahl 0..1>, "begruendung": "ein kurzer Satz" }`;

export async function classifyDocument(params: {
  text: string;
  fileName: string;
}): Promise<{ typ: ErkannterDokumentTyp; konfidenz: number; begruendung?: string }> {
  const { text, fileName } = params;
  const completion = await createChatCompletion({
    max_completion_tokens: 300,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_KLASSIFIZIERUNG },
      {
        role: "user",
        content: `Dateiname: ${fileName}\n\nErkannter Text (ggf. gekürzt):\n${text.slice(0, 3500)}\n\nKlassifiziere dieses Dokument.`,
      },
    ],
  });
  const result = completion.choices[0]?.message?.content || "";
  try {
    const parsed = extractJson(result) as { typ?: string; konfidenz?: number; begruendung?: string };
    const gueltig = new Set<string>(ERKANNTE_DOKUMENT_TYPEN as readonly string[]);
    const typ = parsed.typ && gueltig.has(parsed.typ) ? parsed.typ : "unbekannt";
    return {
      typ: typ as ErkannterDokumentTyp,
      konfidenz: typeof parsed.konfidenz === "number" ? parsed.konfidenz : 0.5,
      begruendung: parsed.begruendung,
    };
  } catch {
    return { typ: "unbekannt", konfidenz: 0 };
  }
}

const SYSTEM_NACHTRAG = `Du bist ein Experte für deutsche Mietverträge. Analysiere den übergebenen Text eines NACHTRAGS oder ÜBERGABEPROTOKOLLS zu einem bestehenden Mietvertrag (z.B. Mieterwechsel innerhalb einer WG, Ein-/Auszug eines von mehreren Mietern, Mieterhöhung, Zusatzvereinbarung) und extrahiere die relevanten Änderungen.
Antworte AUSSCHLIESSLICH mit einem JSON-Objekt in exakt diesem Format:
{
  "art": "Nachtrag" | "Uebergabeprotokoll",
  "ereignis": "Auszug" | "Einzug" | "Mieterwechsel" | "Sonstige_Aenderung",
  "mieterName": "Name des bisherigen/betroffenen Mieters, falls erkennbar",
  "vermieterName": "Name des Vermieters, falls erkennbar",
  "mietbeginn": "Datum, falls sich der Mietbeginn ändert oder ein neuer Mieter einzieht, sonst leerer String",
  "mietende": "Datum, falls ein Mieter auszieht/das Verhältnis endet, sonst leerer String",
  "sollMiete": <neue Kaltmiete in Euro, falls geändert, sonst 0>,
  "nebenkostenVorauszahlung": <neue monatliche NK-Vorauszahlung, falls geändert, sonst 0>,
  "kaution": <neue Kaution, falls geändert, sonst 0>,
  "objektAdresse": "Adresse des Mietobjekts, falls erkennbar",
  "wohnungsbezeichnung": "Lage/Bezeichnung der Wohnung, falls erkennbar",
  "hinweis": "kurzer, sachlicher Hinweis, was sich laut Dokument konkret ändert (max. 2 Sätze)"
}
Erfinde keine Fakten, die nicht im Dokument stehen. Falls ein Wert nicht erkennbar ist: leerer String bzw. 0.`;

export async function extractMietvertragNachtrag(params: {
  text: string;
  fileName: string;
}): Promise<
  MietvertragExtraktion & {
    art: "Nachtrag" | "Uebergabeprotokoll";
    ereignis?: "Auszug" | "Einzug" | "Mieterwechsel" | "Sonstige_Aenderung";
    hinweis?: string;
  }
> {
  const { text, fileName } = params;
  const completion = await createChatCompletion({
    max_completion_tokens: 1200,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_NACHTRAG },
      {
        role: "user",
        content: `Datei: ${fileName}.\n\nInhalt:\n${text}\n\nExtrahiere die JSON-Daten.`,
      },
    ],
  });
  const result = completion.choices[0]?.message?.content || "";
  return extractJson(result);
}

export async function generateBetriebskostenabrechnung(abr: Abrechnung): Promise<string> {
  const completion = await createChatCompletion({
    max_completion_tokens: 1200,
    messages: [
      {
        role: "system",
        content:
          "Du bist ein erfahrener deutscher Betriebskostenmanager. Kopf (Vermieter/Mieter/Objekt/Zeitraum), " +
          "Kostentabelle und Saldo werden bereits automatisch von der Software formatiert dargestellt – " +
          "wiederhole sie NICHT. Schreibe stattdessen einen kurzen, sachlichen Abschnitt 'Erläuterungen' " +
          "(max. 5-8 Sätze, Fließtext, kein Markdown-Header) mit Auffälligkeiten: nennenswerte Änderungen " +
          "gegenüber typischen Werten, Hinweise zu verbrauchsabhängigen Positionen (HeizkostenV, 50-70% " +
          "verbrauchsabhängig), oder falls nichts Auffälliges vorliegt ein kurzer bestätigender Satz. " +
          "Antworte nur mit dem fertigen Fließtext, keine Anrede, keine Grußformel.",
      },
      {
        role: "user",
        content: `Erstelle die Erläuterungen für folgende Abrechnung:\n${JSON.stringify(
          {
            name: abr.name,
            adresse: abr.adresse,
            objektTyp: abr.objektTyp,
            zeitraum: abr.zeitraum,
            gesamtSumme: abr.gesamtSumme,
            positionen: abr.workspace.positionen,
            mieteinnahmen: abr.workspace.mieteinnahmen,
            nebenkosten: abr.workspace.nebenkosten,
            vorauszahlungen: abr.workspace.vorauszahlungen,
          },
          null,
          2
        )}`,
      },
    ],
  });
  return completion.choices[0]?.message?.content || "";
}

export async function generateAnschreiben(abr: Abrechnung, anlass: string): Promise<string> {
  const saldo = abr.workspace.nebenkosten - (abr.workspace.vorauszahlungen ?? 0);
  const completion = await createChatCompletion({
    max_completion_tokens: 1200,
    messages: [
      {
        role: "system",
        content:
          "Du bist ein Vermieter-/Hausverwaltungs-Assistent. Adressblock, Datum und Betreffzeile werden " +
          "bereits automatisch von der Software über dem Text angezeigt – erzeuge NUR den Brieftext ab der " +
          "Anrede (z.B. 'Sehr geehrte(r) Frau/Herr ...,'). Struktur: kurze Einleitung, Kernaussage mit " +
          "konkretem Nachzahlungs- oder Guthabenbetrag und Zahlungsfrist/Auszahlungshinweis, Hinweis auf " +
          "die Einspruchsfrist von 12 Monaten nach Zugang gemäß § 556 Abs. 3 BGB, Hinweis auf Belegeinsicht " +
          "während der üblichen Geschäftszeiten, abschließende Grußformel mit Absendername. Formell, " +
          "höflich, präzise, auf Deutsch. Antworte nur mit dem fertigen Brieftext.",
      },
      {
        role: "user",
        content: `Anlass: ${anlass}\n\nDaten der Abrechnung:\n${JSON.stringify(
          {
            mieterName: abr.mieterName || abr.name,
            vermieterName: abr.vermieterName,
            adresse: abr.adresse,
            zeitraum: abr.zeitraum,
            gesamtSumme: abr.gesamtSumme,
            summeMieteranteile: abr.workspace.nebenkosten,
            vorauszahlungen: abr.workspace.vorauszahlungen,
            saldo,
            saldoArt: saldo > 0 ? "Nachzahlung zu Lasten des Mieters" : saldo < 0 ? "Guthaben zugunsten des Mieters" : "ausgeglichen",
            positionen: abr.workspace.positionen,
          },
          null,
          2
        )}`,
      },
    ],
  });
  return completion.choices[0]?.message?.content || "";
}

export async function rechtCheck(abr: Abrechnung | null, staticContent: string): Promise<string> {
  const completion = await createChatCompletion({
    max_completion_tokens: 1500,
    messages: [
      {
        role: "system",
        content: `Du bist ein Experte für deutsches Miet- und Betriebskostenrecht. Nutze folgenden Rechtsstand als Basis:\n\n${staticContent}\n\nPrüfe die übergebene Abrechnung auf Konformität und gib eine klare, strukturierte Markdown-Antwort mit konkreten Hinweisen, Quellen und ggf. Entscheidungsdatum zurück.`,
      },
      {
        role: "user",
        content: abr
          ? `Prüfe diese Abrechnung:\n${JSON.stringify(
              {
                name: abr.name,
                adresse: abr.adresse,
                zeitraum: abr.zeitraum,
                gesamtSumme: abr.gesamtSumme,
                positionen: abr.workspace.positionen,
              },
              null,
              2
            )}`
          : "Gib mir eine kurze Zusammenfassung der aktuellen Rechtslage.",
      },
    ],
  });
  return completion.choices[0]?.message?.content || "";
}

const PAGE_LABELS: Record<string, string> = {
  "/": "Dashboard / Abrechnungen",
  "/liegenschaften": "Liegenschaften",
  "/gebaeude": "Gebäude",
  "/wohnungen": "Wohnungen",
  "/mieter": "Mieter",
  "/schriftverkehr": "Schriftverkehr",
  "/mietvertraege": "Mietverträge",
  "/eigentuemer": "Eigentümer",
  "/investoren": "Investoren",
  "/pm-vertrag": "PM-Vertrag",
  "/dienstleistungsvertraege": "Dienstleistungsverträge",
  "/kontoauszuege": "Kontoauszüge",
  "/vorauszahlungen": "Vorauszahlungen",
  "/budgetierung": "Budgetierung",
  "/finanzierung": "Finanzierung",
  "/instandhaltung": "Instandhaltung",
  "/auftraege": "Aufträge",
  "/rechnungen": "Rechnungen",
  "/assetmanagement": "Assetmanagement",
  "/auswertung": "Auswertung",
};

export async function chatWithContext(params: {
  message: string;
  current: Abrechnung | null;
  all: Abrechnung[];
  liegenschaften?: Liegenschaft[];
  gebaeude?: Gebaeude[];
  wohnungen?: Wohnung[];
  mieter?: Mieter[];
  mietvertraege?: Mietvertrag[];
  history: { role: "user" | "assistant"; content: string }[];
  path?: string;
}): Promise<string> {
  const {
    message,
    current,
    all,
    liegenschaften = [],
    gebaeude = [],
    wohnungen = [],
    mieter = [],
    mietvertraege = [],
    history,
    path = "/",
  } = params;

  // Kompakte Übersicht (max. 30 Abrechnungen, ohne Pretty-Print → spart Tokens)
  const overview = all.slice(0, 30).map((a) => ({
    id: a.id,
    name: a.name,
    adresse: a.adresse,
    zeitraum: a.zeitraum,
    summe: a.gesamtSumme,
    status: a.status,
  }));

  // Portfolio kompakt: nur relevante Felder, keine leeren Arrays aufblasen
  const portfolio = liegenschaften.map((lg) => {
    const lgGebaeude = gebaeude.filter((g) => g.liegenschaftId === lg.id);
    return {
      id: lg.id,
      name: lg.name,
      adr: `${lg.strasse} ${lg.hausnummer}, ${lg.plz} ${lg.ort}`,
      geb: lgGebaeude.map((g) => {
        const gWohnungen = wohnungen.filter((w) => w.gebaeudeId === g.id);
        return {
          id: g.id,
          name: g.name,
          eh: gWohnungen.map((w) => {
            const wMieter = mieter.filter((m) => m.wohnungId === w.id);
            return {
              id: w.id,
              bez: w.bezeichnung,
              mieter: wMieter.map((m) => ({
                id: m.id,
                name: m.name,
                km: m.kaltmiete,
                nk: m.nebenkostenVorauszahlung,
                rs: Math.round(mietRueckstand(m) * 100) / 100,
              })),
            };
          }),
        };
      }),
    };
  });

  const mietrueckstaende = mieter
    .map((m) => {
      const wohnung = wohnungen.find((w) => w.id === m.wohnungId);
      const geb = wohnung ? gebaeude.find((g) => g.id === wohnung.gebaeudeId) : undefined;
      const lg = geb ? liegenschaften.find((l) => l.id === geb.liegenschaftId) : undefined;
      const rs = Math.round(mietRueckstand(m) * 100) / 100;
      return {
        id: m.id,
        name: m.name,
        eh: wohnung?.bezeichnung,
        lg: lg ? `${lg.strasse} ${lg.hausnummer}` : undefined,
        rs,
      };
    })
    .filter((r) => Math.round(r.rs * 100) !== 0)
    .sort((a, b) => b.rs - a.rs)
    .slice(0, 40);

  // ---- Leichte Kontext-Stufen (Kontext-Engineering) ----

  // Stufe "adressen": nur Name/Adresse/Anzahl je Liegenschaft – keine
  // Wohnungs- oder Mieter-Details. Für reine Bestandsfragen.
  const bestandAdressen = liegenschaften.map((lg) => {
    const lgGebaeude = gebaeude.filter((g) => g.liegenschaftId === lg.id);
    const wohnungenAnzahl = lgGebaeude.reduce(
      (s, g) => s + wohnungen.filter((w) => w.gebaeudeId === g.id).length,
      0
    );
    return {
      id: lg.id,
      name: lg.name,
      adr: `${lg.strasse} ${lg.hausnummer}, ${lg.plz} ${lg.ort}`,
      gebaeude: lgGebaeude.length,
      wohnungen: wohnungenAnzahl,
    };
  });

  // Stufe "belegung": Wohnungen mit belegt/frei-Status je Gebäude – ohne
  // Mieter-Namen oder Finanzdaten. Für Leerstands-/Belegungsfragen.
  const belegungsUebersicht = liegenschaften.map((lg) => {
    const lgGebaeude = gebaeude.filter((g) => g.liegenschaftId === lg.id);
    return {
      id: lg.id,
      name: lg.name,
      adr: `${lg.strasse} ${lg.hausnummer}`,
      geb: lgGebaeude.map((g) => {
        const gWohnungen = wohnungen.filter((w) => w.gebaeudeId === g.id);
        return {
          name: g.name,
          eh: gWohnungen.map((w) => ({
            bez: w.bezeichnung,
            belegt: mieter.some((m) => m.wohnungId === w.id),
          })),
        };
      }),
    };
  });
  const leerstandGesamt = belegungsUebersicht.reduce(
    (s, lg) => s + lg.geb.reduce((s2, g) => s2 + g.eh.filter((e) => !e.belegt).length, 0),
    0
  );
  const einheitenGesamt = belegungsUebersicht.reduce(
    (s, lg) => s + lg.geb.reduce((s2, g) => s2 + g.eh.length, 0),
    0
  );

  const currentKurz = current
    ? {
        id: current.id,
        name: current.name,
        adresse: current.adresse,
        zeitraum: current.zeitraum,
        status: current.status,
        summe: current.gesamtSumme,
        pos: (current.workspace?.positionen || []).slice(0, 25).map((p) => ({
          n: p.name,
          b: p.betrag,
        })),
        nk: current.workspace?.nebenkosten,
        vz: current.workspace?.vorauszahlungen,
      }
    : null;

  const pageLabel = PAGE_LABELS[path] || path;

  const systemBase = `Du bist "BetriebsKostenBot", KI-Assistent der Hausverwaltungs-App (app-weit im Chat).
Seite: ${pageLabel} (${path})

Regeln:
- Für Liegenschaften/Mieter/Rückstände NUR "portfolio" und "mietrueckstaende" nutzen – NICHT "abrechnungen" (Belege).
- Falls stattdessen "bestand" (nur Adressen/Anzahl) oder "belegung" (nur belegt/frei je Einheit, keine Namen) mitgeschickt wird: das ist bewusst ein reduzierter Kontext für diese enge Frage – die Angaben darin sind vollständig und aktuell, kein Hinweis auf fehlende Daten nötig.
- Wenn portfolio/bestand/belegung leer: das sagen, nicht raten.
- Knapp, Deutsch, Listen ok.
- Behaupte NIEMALS, du hättest keine Schreibrechte oder könntest Stammdaten nicht ändern.
- Aufträge wie „Stammdaten nachtragen“, „Befunde bereinigen“, Mahnungen: der Server-Agent führt sie aus (Tools). Wenn der Nutzer das will, formuliere klar, dass er denselben Satz nochmal senden kann – ideal: „Stammdaten aus Mietverträgen nachtragen“.
- Handlungsaufträge erledigt der Agent-Pfad, nicht du manuell.`;

  function buildSystem(compact: boolean): string {
    const space = compact ? 0 : undefined;
    const body = compact
      ? `portfolio:${JSON.stringify(portfolio)}
rs:${JSON.stringify(mietrueckstaende)}
abr:${JSON.stringify(currentKurz)}
liste:${JSON.stringify(overview)}`
      : `portfolio:
${JSON.stringify(portfolio, null, space)}
mietrueckstaende:
${JSON.stringify(mietrueckstaende, null, space)}
aktuelle_abrechnung:
${JSON.stringify(currentKurz, null, space)}
abrechnungen:
${JSON.stringify(overview, null, space)}`;
    return `${systemBase}\n\n${body}`;
  }

  const hist = history.slice(-6).map(
    (h) =>
      ({
        role: h.role,
        content: h.content.length > 1500 ? h.content.slice(0, 1500) + "…" : h.content,
      }) as Groq.Chat.Completions.ChatCompletionMessageParam
  );

  // Small-Talk ("hallo", "danke" …) braucht keinen Portfolio-Dump – spart
  // pro Nachricht mehrere tausend Tokens und vermeidet unnötige
  // Provider-Fallback-Ketten. Nur wenn KEINE Historie vorliegt, da sonst ein
  // vorheriger fachlicher Turn den Kontext ggf. weiter braucht.
  if (isSmallTalk(message) && hist.length === 0) {
    try {
      const completion = await createChatCompletion({
        max_completion_tokens: 300,
        messages: [
          {
            role: "system",
            content: `${systemBase}\n\n(Kein Portfolio-Kontext geladen – das ist Small-Talk. Bei Bedarf kann der Nutzer gezielt nach Portfolio/Rückständen/Abrechnungen fragen, dann wird der volle Kontext geladen.)`,
          },
          { role: "user", content: message },
        ],
      });
      return completion.choices[0]?.message?.content || "";
    } catch {
      // Bei Fehler ganz normal mit vollem Kontext weitermachen (unten).
    }
  }

  // Kontext-Engineering: bei klar eng umrissenen Fragen (Bestand, Belegung,
  // Rückstände) nur den dafür nötigen Datenausschnitt schicken statt des
  // vollen Portfolios. Nur ohne Historie (siehe Small-Talk oben – bei einem
  // Folge-Turn könnte der vorherige Kontext noch gebraucht werden). Liefert
  // die reduzierte Anfrage eine leere Antwort oder wirft einen Fehler, wird
  // unten regulär mit vollem Kontext weiterprobiert – nie stillschweigend
  // eine unvollständige Antwort riskieren.
  const kontextBedarf = klassifiziereKontextbedarf(message);
  if (kontextBedarf !== "voll" && hist.length === 0) {
    let leichterBody = "";
    if (kontextBedarf === "adressen") {
      leichterBody = `bestand:${JSON.stringify(bestandAdressen)}\n\n(Reduzierter Kontext: nur Bestandsliste – für Details zu Wohnungen/Mietern/Finanzen bitte gezielt nachfragen.)`;
    } else if (kontextBedarf === "belegung") {
      leichterBody = `belegung:${JSON.stringify(belegungsUebersicht)}\nleerstand_gesamt:${leerstandGesamt}\neinheiten_gesamt:${einheitenGesamt}\n\n(Reduzierter Kontext: nur Belegungsstatus je Einheit – KEINE Mieternamen oder Finanzdaten enthalten.)`;
    } else if (kontextBedarf === "rueckstaende") {
      leichterBody = `rs:${JSON.stringify(mietrueckstaende)}\n\n(Reduzierter Kontext: nur Mietrückstände – für Portfolio-Struktur oder Abrechnungen bitte gezielt nachfragen.)`;
    }
    try {
      const completion = await createChatCompletion({
        max_completion_tokens: 700,
        messages: [
          { role: "system", content: `${systemBase}\n\n${leichterBody}` },
          { role: "user", content: message },
        ],
      });
      const reply = completion.choices[0]?.message?.content || "";
      if (reply.trim()) return reply;
      // Leere Antwort → unten mit vollem Kontext weiterprobieren.
    } catch {
      // Fehler → unten mit vollem Kontext weiterprobieren.
    }
  }

  // 1. Versuch: normal kompakt (ohne Pretty-Print)
  try {
    const completion = await createChatCompletion({
      max_completion_tokens: 1200,
      messages: [
        { role: "system", content: buildSystem(true) },
        ...hist,
        { role: "user", content: message },
      ],
    });
    return completion.choices[0]?.message?.content || "";
  } catch (err: any) {
    const msg = String(err?.message || err || "").toLowerCase();
    const tooLarge =
      msg.includes("request too large") ||
      msg.includes("please reduce your message size") ||
      (msg.includes("tpm") && msg.includes("requested"));
    if (!tooLarge) throw err;

    // 2. Versuch: nur Rückstände + kurze Portfolio-Namen, keine Abrechnungsliste
    const miniPortfolio = portfolio.map((lg) => ({
      id: lg.id,
      name: lg.name,
      adr: lg.adr,
      mieter: lg.geb.flatMap((g) =>
        g.eh.flatMap((e) => e.mieter.map((m) => ({ id: m.id, name: m.name, rs: m.rs, eh: e.bez })))
      ),
    }));
    const miniSystem = `${systemBase}

bestand:${JSON.stringify(miniPortfolio)}
rs:${JSON.stringify(mietrueckstaende.slice(0, 20))}
abr:${JSON.stringify(currentKurz ? { id: currentKurz.id, name: currentKurz.name, status: currentKurz.status } : null)}`;

    const completion = await createChatCompletion({
      max_completion_tokens: 1000,
      messages: [
        { role: "system", content: miniSystem },
        ...hist.slice(-3),
        { role: "user", content: message.slice(0, 2000) },
      ],
    });
    return completion.choices[0]?.message?.content || "";
  }
}

