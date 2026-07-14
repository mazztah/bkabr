// src/lib/ai.ts
import Groq from "groq-sdk";
import { Abrechnung, ExtractedData } from "./types";

// Modell-Konfiguration
const TEXT_MODEL = process.env.GROQ_TEXT_MODEL || "llama-3.3-70b-versatile";
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

// === SYSTEM-PROMPT FÜR DIE ANALYSE (einmalig definiert) ===
const SYSTEM_EXTRAKTION = `Du bist "BetriebsKostenBot", ein Experte für deutsche Betriebskosten- und Nebenkostenabrechnungen, Mieteinnahmen, Heizkostenabrechnungen und Mietverträge.
Analysiere das übergebene Dokument (Betriebskostenabrechnung, Nebenkostenabrechnung, Mietvertrag, Heizkostenabrechnung, Einnahmen/Ausgaben-Aufstellung o.ä.) und extrahiere die relevanten Daten.
Antworte AUSSCHLIESSLICH mit einem JSON-Objekt (kein Fließtext, keine Erklärung) in exakt diesem Format:
{
  "name": "kurzer Titel/Objektname",
  "adresse": "vollständige Adresse",
  "objektTyp": "Wohnung" | "Haus" | "Gewerbe",
  "zeitraum": "z.B. 01.01.2025 - 31.12.2025",
  "gesamtSumme": <Zahl in Euro>,
  "positionen": [ { "name": "Heizung", "betrag": <Zahl>, "beschreibung": "kurz" }, ... ],
  "rawText": "kurze Zusammenfassung der wichtigsten erkannten Rohdaten"
}
Falls ein Wert nicht erkennbar ist, verwende sinnvolle Defaults (leerer String, 0, leere Liste). Erfinde keine Fakten, die nicht im Dokument stehen.`;

export async function analyzeDocument(params: {
  base64: string;
  mimeType: string;
  fileName: string;
}): Promise<ExtractedData> {
  const { base64, mimeType, fileName } = params;
  const groq = getClient();

  const isImage = mimeType.startsWith("image/");
  let userContent: any;

  if (isImage) {
    // === KORRIGIERTE Base64-URL (das war der alte Fehler) ===
    const dataUrl = `data:${mimeType};base64,${base64}`;

    userContent = [
      {
        type: "text",
        text: `Datei: ${fileName}. Analysiere dieses Dokument und liefere die JSON-Extraktion.`,
      },
      {
        type: "image_url",
        image_url: { url: dataUrl },
      },
    ];
  } else {
    // Für TXT oder aus PDF extrahierten Text
    userContent = `Datei: ${fileName}.\n\nInhalt des Dokuments:\n${base64}\n\nAnalysiere dieses Dokument und liefere die JSON-Extraktion.`;
  }

  const completion = await groq.chat.completions.create({
    model: isImage ? VISION_MODEL : TEXT_MODEL,
    max_completion_tokens: 2000,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_EXTRAKTION },
      { role: "user", content: userContent },
    ],
  });

  const text = completion.choices[0]?.message?.content || "";
  return extractJson(text) as ExtractedData;
}

// === Übrige Funktionen (generateBetriebskostenabrechnung, generateAnschreiben, rechtCheck, chatWithContext) bleiben exakt wie du sie hast ===
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
      ...history.map((h) => ({ role: h.role, content: h.content }) as any),
      { role: "user", content: message },
    ],
  });
  return completion.choices[0]?.message?.content || "";
}
