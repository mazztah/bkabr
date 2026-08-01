import Groq from "groq-sdk";
import { Abrechnung, ExtractedData, Liegenschaft, Gebaeude, Wohnung, Mieter, Mietvertrag, KontoauszugTransaktion } from "./types";
import { mietRueckstand } from "./mietkonto";

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
  const groq = getClient();

  const completion = await groq.chat.completions.create({
    model: TEXT_MODEL,
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
  const groq = getClient();

  const completion = await groq.chat.completions.create({
    model: TEXT_MODEL,
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
  const groq = getClient();

  const completion = await groq.chat.completions.create({
    model: TEXT_MODEL,
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

export async function generateBetriebskostenabrechnung(abr: Abrechnung): Promise<string> {
  const groq = getClient();
  const completion = await groq.chat.completions.create({
    model: TEXT_MODEL,
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
  const groq = getClient();
  const saldo = abr.workspace.nebenkosten - (abr.workspace.vorauszahlungen ?? 0);
  const completion = await groq.chat.completions.create({
    model: TEXT_MODEL,
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
  const groq = getClient();

  const overview = all.map((a) => ({
    id: a.id,
    name: a.name,
    adresse: a.adresse,
    zeitraum: a.zeitraum,
    gesamtSumme: a.gesamtSumme,
    status: a.status,
  }));

  // Bestand als Hierarchie Liegenschaft -> Gebäude -> Wohnung -> Mieter/Mietvertrag
  // aufbauen, inkl. berechnetem Mietrückstand aus dem Mietkonto, damit der Bot
  // reale Fragen zum Bestand beantworten kann statt aus Abrechnungs-Adressen zu raten.
  const portfolio = liegenschaften.map((lg) => {
    const lgGebaeude = gebaeude.filter((g) => g.liegenschaftId === lg.id);
    return {
      id: lg.id,
      nummer: lg.nummer,
      name: lg.name,
      adresse: `${lg.strasse} ${lg.hausnummer}, ${lg.plz} ${lg.ort}`,
      gebaeude: lgGebaeude.map((g) => {
        const gWohnungen = wohnungen.filter((w) => w.gebaeudeId === g.id);
        return {
          id: g.id,
          name: g.name,
          baujahr: g.baujahr,
          wohnungen: gWohnungen.map((w) => {
            const wMieter = mieter.filter((m) => m.wohnungId === w.id);
            const wVertraege = mietvertraege.filter((mv) => mv.wohnungId === w.id);
            return {
              id: w.id,
              bezeichnung: w.bezeichnung,
              typ: w.typ,
              flaeche: w.flaeche,
              mieter: wMieter.map((m) => ({
                id: m.id,
                name: m.name,
                mietbeginn: m.mietbeginn,
                mietende: m.mietende,
                kaltmiete: m.kaltmiete,
                nebenkostenVorauszahlung: m.nebenkostenVorauszahlung,
                mietrueckstand: mietRueckstand(m),
              })),
              mietvertraege: wVertraege.map((mv) => ({
                id: mv.id,
                status: mv.status,
                sollMiete: mv.sollMiete,
                mietbeginn: mv.mietbeginn,
                mietende: mv.mietende,
              })),
            };
          }),
        };
      }),
    };
  });

  // Zusätzlich eine flache Rückstandsliste über alle Mieter, sortiert nach Höhe,
  // damit Fragen wie "wie hoch sind die Mietrückstände" direkt beantwortbar sind.
  const mietrueckstaende = mieter
    .map((m) => {
      const wohnung = wohnungen.find((w) => w.id === m.wohnungId);
      const geb = wohnung ? gebaeude.find((g) => g.id === wohnung.gebaeudeId) : undefined;
      const lg = geb ? liegenschaften.find((l) => l.id === geb.liegenschaftId) : undefined;
      return {
        mieterId: m.id,
        mieterName: m.name,
        wohnung: wohnung?.bezeichnung,
        liegenschaft: lg?.name,
        rueckstand: mietRueckstand(m),
      };
    })
    .filter((r) => Math.round(r.rueckstand * 100) !== 0)
    .sort((a, b) => b.rueckstand - a.rueckstand);

  const pageLabel = PAGE_LABELS[path] || path;

  const system = `Du bist "BetriebsKostenBot", der KI-Assistent dieser Hausverwaltungs-App. Du bist app-weit über einen schwebenden Chat auf JEDER Seite erreichbar. Du siehst immer den gesamten Kontext:
- Die Seite, auf der sich der Nutzer gerade befindet
- Den kompletten Immobilienbestand als Hierarchie: Liegenschaft → Gebäude → Wohnung/Einheit → Mieter & Mietvertrag (Feld "portfolio")
- Eine vorberechnete Liste offener Mietrückstände je Mieter (Feld "mietrueckstaende"; positiver Wert = Mieter schuldet Geld, negativer Wert = Guthaben)
- Aktuell ausgewählte Abrechnung (Rohdaten + Workspace), falls vorhanden
- Liste aller Betriebskosten-Abrechnungen (Feld "abrechnungen")

WICHTIG: Für Fragen zu Liegenschaften, Gebäuden, Wohnungen, Mietern, Mietverträgen oder Mietrückständen nutzt du AUSSCHLIESSLICH die Daten aus "portfolio" bzw. "mietrueckstaende" – NICHT die Adressen aus "abrechnungen" (das sind reine Belege/Rechnungen und keine verlässliche Liegenschaftsliste). Wenn "portfolio" leer ist, sag das offen statt zu raten oder Abrechnungsadressen als Liegenschaften auszugeben.

Du machst Optimierungsvorschläge (z.B. fehlende Positionen in Abrechnungen), erkennst fehlende Punkte (z.B. USt bei Gewerbeobjekten), schlägst Formulierungen für Anschreiben vor, gibst Übersichten zu Mietern/Mietverträgen/Mietrückständen einer Liegenschaft und beantwortest Fragen zu Betriebskosten- und Mietrecht sowie zur Nutzung der App. Antworte präzise, hilfreich, in kompakten Listen wo sinnvoll, und auf Deutsch.

Nutzer befindet sich aktuell auf der Seite: ${pageLabel} (${path})

portfolio (Liegenschaften → Gebäude → Wohnungen → Mieter/Mietverträge):
${JSON.stringify(portfolio, null, 2)}

mietrueckstaende (nur Mieter mit offenem Saldo ungleich 0):
${JSON.stringify(mietrueckstaende, null, 2)}

Aktuelle Abrechnung:
${current ? JSON.stringify(current, null, 2) : "Keine ausgewählt"}

abrechnungen (Übersicht aller Betriebskosten-Abrechnungen/Belege, NICHT als Liegenschaftsliste verwenden):
${JSON.stringify(overview, null, 2)}`;

  const completion = await groq.chat.completions.create({
    model: TEXT_MODEL,
    max_completion_tokens: 1500,
    messages: [
      { role: "system", content: system },
      ...history.map((h) => ({ role: h.role, content: h.content }) as Groq.Chat.Completions.ChatCompletionMessageParam),
      { role: "user", content: message },
    ],
  });

  return completion.choices[0]?.message?.content || "";
}
