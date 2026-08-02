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

function extractJson(text: string): any {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Keine gültige JSON-Antwort erhalten");
  return JSON.parse(candidate.slice(start, end + 1));
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

const SYSTEM_MIETVERTRAG = `Du bist ein Experte für deutsche Mietverträge. Analysiere den übergebenen Text eines Mietvertrags (oder Nachtrags) und extrahiere die relevanten Stammdaten.
Antworte AUSSCHLIESSLICH mit einem JSON-Objekt in exakt diesem Format:
{
  "mieterName": "Name des Mieters/der Mieter",
  "vermieterName": "Name des Vermieters",
  "mietbeginn": "Datum, z.B. 01.06.2025, sonst leerer String",
  "mietende": "Datum falls befristet, sonst leerer String",
  "sollMiete": <Kaltmiete in Euro, sonst 0>,
  "nebenkostenVorauszahlung": <monatliche NK-Vorauszahlung in Euro, sonst 0>,
  "kaution": <Kaution in Euro, sonst 0>,
  "objektAdresse": "Adresse des Mietobjekts",
  "wohnungsbezeichnung": "Lage/Bezeichnung der Wohnung, z.B. 2. OG rechts"
}
Erfinde keine Fakten, die nicht im Dokument stehen. Falls ein Wert nicht erkennbar ist: leerer String bzw. 0.`;

export async function extractMietvertrag(params: {
  text: string;
  fileName: string;
}): Promise<import("./types").MietvertragExtraktion> {
  const { text, fileName } = params;
  const completion = await createChatCompletion({
    max_completion_tokens: 1200,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_MIETVERTRAG },
      {
        role: "user",
        content: `Datei: ${fileName}.\n\nInhalt:\n${text}\n\nExtrahiere die JSON-Daten.`,
      },
    ],
  });

  const result = completion.choices[0]?.message?.content || "";
  return extractJson(result);
}

const SYSTEM_KONTOAUSZUG = `Du bist ein Experte für deutsche Bankauszüge/Kontoauszüge (PDF-Text oder CSV-Export). Analysiere den übergebenen Text und extrahiere AUSSCHLIESSLICH die Zahlungseingänge (Gutschriften, positive Beträge) – ignoriere Abbuchungen/Lastschriften/Belastungen.
Antworte AUSSCHLIESSLICH mit einem JSON-Objekt in exakt diesem Format:
{
  "transaktionen": [
    {
      "datum": "YYYY-MM-DD",
      "betrag": <Betrag als positive Zahl>,
      "verwendungszweck": "Verwendungszweck/Buchungstext wie im Auszug",
      "absender": "Name des Auftraggebers/Einzahlers, falls erkennbar, sonst leerer String"
    }
  ]
}
Erfinde keine Transaktionen, die nicht im Text stehen. Falls kein Datum erkennbar: leerer String.`;

export async function extractKontoauszug(params: {
  text: string;
  fileName: string;
}): Promise<KontoauszugTransaktion[]> {
  const { text, fileName } = params;
  const completion = await createChatCompletion({
    max_completion_tokens: 3000,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_KONTOAUSZUG },
      {
        role: "user",
        content: `Datei: ${fileName}.\n\nInhalt:\n${text.slice(0, 12000)}\n\nExtrahiere die JSON-Daten.`,
      },
    ],
  });

  const result = completion.choices[0]?.message?.content || "";
  const parsed = extractJson(result) as { transaktionen?: KontoauszugTransaktion[] };
  return parsed.transaktionen || [];
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
  const completion = await createChatCompletion({
    max_completion_tokens: 1200,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_EIGENTUEMER },
      {
        role: "user",
        content: `Datei: ${fileName}.\n\nInhalt:\n${text}\n\nExtrahiere die JSON-Daten.`,
      },
    ],
  });

  const result = completion.choices[0]?.message?.content || "";
  return extractJson(result);
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
  const completion = await createChatCompletion({
    max_completion_tokens: 1200,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PM_VERTRAG },
      {
        role: "user",
        content: `Datei: ${fileName}.\n\nInhalt:\n${text}\n\nExtrahiere die JSON-Daten.`,
      },
    ],
  });

  const result = completion.choices[0]?.message?.content || "";
  return extractJson(result);
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
- Wenn portfolio leer: das sagen, nicht raten.
- Knapp, Deutsch, Listen ok.
- Handlungsaufträge (Mahnungen erstellen) erledigt der Server-Agent; du informierst nur.`;

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

