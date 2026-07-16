import Groq from "groq-sdk";
import { Abrechnung, ExtractedData } from "./types";

// Textmodell für Zusammenfassungen, Abrechnungen, Anschreiben, Chat & Recht-Check
const TEXT_MODEL = process.env.GROQ_TEXT_MODEL || "llama-3.3-70b-versatile";
// Vision-Modell für Bild-Uploads (JPG/PNG) – wird für OCR/Dokumentenerkennung genutzt
const VISION_MODEL = process.env.GROQ_VISION_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct";

let client: Groq | null = null;
function getClient(): Groq {
  if (!process.env.GROQ_API_KEY) {
    throw new Error(
      "GROQ_API_KEY ist nicht gesetzt. Bitte in .env.local bzw. als Fly.io Secret hinterlegen."
    );
  }
  if (!client) client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return client;
}

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
  const groq = getClient();

  const completion = await groq.chat.completions.create({
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
  const groq = getClient();

  const completion = await groq.chat.completions.create({
    model: TEXT_MODEL,
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
  const groq = getClient();

  const completion = await groq.chat.completions.create({
    model: TEXT_MODEL,
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

export async function generateBetriebskostenabrechnung(abr: Abrechnung): Promise<string> {
  const groq = getClient();
  const completion = await groq.chat.completions.create({
    model: TEXT_MODEL,
    max_completion_tokens: 2500,
    messages: [
      {
        role: "system",
        content:
          "Du bist ein erfahrener deutscher Betriebskostenmanager. Erstelle eine vollständige, formal korrekte Betriebskostenabrechnung nach § 556 BGB / BetrKV im Klartext (Markdown), inkl. Kostenaufstellung, Umlageschlüssel und Saldo. Antworte nur mit dem fertigen Text.",
      },
      {
        role: "user",
        content: `Erstelle die Betriebskostenabrechnung für folgende Daten:\n${JSON.stringify(
          {
            name: abr.name,
            adresse: abr.adresse,
            objektTyp: abr.objektTyp,
            zeitraum: abr.zeitraum,
            gesamtSumme: abr.gesamtSumme,
            positionen: abr.workspace.positionen,
            mieteinnahmen: abr.workspace.mieteinnahmen,
            nebenkosten: abr.workspace.nebenkosten,
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
  const groq = getClient();
  const completion = await groq.chat.completions.create({
    model: TEXT_MODEL,
    max_completion_tokens: 1500,
    messages: [
      {
        role: "system",
        content:
          "Du bist ein Vermieter-Assistent. Erstelle ein formelles, höfliches Anschreiben an den Mieter auf Deutsch (Betreff, Anrede, Text, Grußformel), das alle rechtlich relevanten Punkte zur Betriebskostenabrechnung enthält. Antworte nur mit dem fertigen Brieftext.",
      },
      {
        role: "user",
        content: `Anlass: ${anlass}\n\nDaten der Abrechnung:\n${JSON.stringify(
          {
            name: abr.name,
            adresse: abr.adresse,
            zeitraum: abr.zeitraum,
            gesamtSumme: abr.gesamtSumme,
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
  const groq = getClient();
  const completion = await groq.chat.completions.create({
    model: TEXT_MODEL,
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

export async function chatWithContext(params: {
  message: string;
  current: Abrechnung | null;
  all: Abrechnung[];
  history: { role: "user" | "assistant"; content: string }[];
}): Promise<string> {
  const { message, current, all, history } = params;
  const groq = getClient();

  const overview = all.map((a) => ({
    id: a.id,
    name: a.name,
    adresse: a.adresse,
    zeitraum: a.zeitraum,
    gesamtSumme: a.gesamtSumme,
    status: a.status,
  }));

  const system = `Du bist "BetriebsKostenBot", der KI-Assistent dieser Betriebskosten-App. Du siehst immer den gesamten Kontext der Seite:
- Aktuell ausgewählte Abrechnung (Rohdaten + Workspace)
- Liste aller anderen Abrechnungen
Du machst Optimierungsvorschläge (z.B. fehlende Positionen), erkennst fehlende Punkte (z.B. USt bei Gewerbeobjekten), schlägst Formulierungen für Anschreiben vor und beantwortest Fragen zu Betriebskosten- und Mietrecht. Antworte präzise, hilfreich und auf Deutsch.

Aktuelle Abrechnung:
${current ? JSON.stringify(current, null, 2) : "Keine ausgewählt"}

Alle Abrechnungen (Übersicht):
${JSON.stringify(overview, null, 2)}`;

  const completion = await groq.chat.completions.create({
    model: TEXT_MODEL,
    max_completion_tokens: 1200,
    messages: [
      { role: "system", content: system },
      ...history.map((h) => ({ role: h.role, content: h.content }) as Groq.Chat.Completions.ChatCompletionMessageParam),
      { role: "user", content: message },
    ],
  });

  return completion.choices[0]?.message?.content || "";
}
