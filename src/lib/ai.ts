import Anthropic from "@anthropic-ai/sdk";
import { Abrechnung, ExtractedData } from "./types";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY ist nicht gesetzt. Bitte in .env.local bzw. als Fly.io Secret hinterlegen."
    );
  }
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
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
  const anthropic = getClient();

  const isPdf = mimeType === "application/pdf";
  const isImage = mimeType.startsWith("image/");

  const contentBlocks: Anthropic.MessageParam["content"] = [];

  if (isPdf) {
    contentBlocks.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: base64 },
    } as any);
  } else if (isImage) {
    contentBlocks.push({
      type: "image",
      source: { type: "base64", media_type: mimeType as any, data: base64 },
    } as any);
  } else {
    // Text-basierte Formate (txt, docx-Rohtext etc.) werden bereits als Text übergeben
    contentBlocks.push({ type: "text", text: base64 });
  }

  contentBlocks.push({
    type: "text",
    text: `Datei: ${fileName}. Analysiere dieses Dokument und liefere die JSON-Extraktion.`,
  });

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: SYSTEM_EXTRAKTION,
    messages: [{ role: "user", content: contentBlocks }],
  });

  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  return extractJson(text) as ExtractedData;
}

export async function generateBetriebskostenabrechnung(abr: Abrechnung): Promise<string> {
  const anthropic = getClient();
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2500,
    system:
      "Du bist ein erfahrener deutscher Betriebskostenmanager. Erstelle eine vollständige, formal korrekte Betriebskostenabrechnung nach § 556 BGB / BetrKV im Klartext (Markdown), inkl. Kostenaufstellung, Umlageschlüssel und Saldo. Antworte nur mit dem fertigen Text.",
    messages: [
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
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

export async function generateAnschreiben(abr: Abrechnung, anlass: string): Promise<string> {
  const anthropic = getClient();
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system:
      "Du bist ein Vermieter-Assistent. Erstelle ein formelles, höfliches Anschreiben an den Mieter auf Deutsch (Betreff, Anrede, Text, Grußformel), das alle rechtlich relevanten Punkte zur Betriebskostenabrechnung enthält. Antworte nur mit dem fertigen Brieftext.",
    messages: [
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
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

export async function rechtCheck(abr: Abrechnung | null, staticContent: string): Promise<string> {
  const anthropic = getClient();
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: `Du bist ein Experte für deutsches Miet- und Betriebskostenrecht. Nutze folgenden Rechtsstand als Basis:\n\n${staticContent}\n\nPrüfe die übergebene Abrechnung auf Konformität und gib eine klare, strukturierte Markdown-Antwort mit konkreten Hinweisen, Quellen und ggf. Entscheidungsdatum zurück.`,
    messages: [
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
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

export async function chatWithContext(params: {
  message: string;
  current: Abrechnung | null;
  all: Abrechnung[];
  history: { role: "user" | "assistant"; content: string }[];
}): Promise<string> {
  const { message, current, all, history } = params;
  const anthropic = getClient();

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

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1200,
    system,
    messages: [
      ...history.map((h) => ({ role: h.role, content: h.content }) as Anthropic.MessageParam),
      { role: "user", content: message },
    ],
  });

  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}
