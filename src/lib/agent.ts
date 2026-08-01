import Groq from "groq-sdk";
import { v4 as uuidv4 } from "uuid";
import {
  Gebaeude,
  Liegenschaft,
  Mieter,
  SchriftverkehrDokument,
  Wohnung,
} from "./types";
import {
  gebaeudeDb,
  liegenschaftenDb,
  mieterDb,
  schriftverkehrDb,
  wohnungenDb,
} from "./db";
import { mietRueckstand } from "./mietkonto";
import {
  BriefKontext,
  SCHRIFTVERKEHR_TEMPLATES,
  heuteDe,
  initialWerte,
  renderBrief,
} from "./schriftverkehr";

const TEXT_MODEL = process.env.GROQ_TEXT_MODEL || "llama-3.3-70b-versatile";
const MAX_AGENT_STEPS = 12;

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

// -------- Tool-Definitionen (OpenAI-/Groq-kompatibel) --------

const AGENT_TOOLS: Groq.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "list_liegenschaften",
      description:
        "Listet alle Liegenschaften (Name, Adresse, ID). Nutzen, um eine Straße/Adresse einer Liegenschaft zuzuordnen.",
      parameters: { type: "object", properties: { "_": { type: "string", description: "Optional, ignorieren" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "find_mieter",
      description:
        "Findet Mieter anhand Liegenschaftsname, Straße, Adresse oder Mietername. Optional nur Mieter mit positivem Mietrückstand.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Suchbegriff: Liegenschaftsname, Straße (z.B. Spannhagengartenstraße), Ort oder Mietername",
          },
          nur_mit_rueckstand: {
            type: "boolean",
            description: "Wenn true, nur Mieter mit positivem Mietrückstand (> 0)",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_mietrueckstaende",
      description:
        "Liefert alle Mieter mit offenem Mietrückstand (positiv = Schuld). Optional gefiltert nach Liegenschaft/Straße.",
      parameters: {
        type: "object",
        properties: {
          liegenschaft_query: {
            type: "string",
            description: "Optionaler Filter: Liegenschaftsname oder Straße",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_brief_vorlagen",
      description:
        "Listet verfügbare Schriftverkehr-Vorlagen (z.B. mahnung, kuendigung, bk_abrechnung).",
      parameters: { type: "object", properties: { "_": { type: "string", description: "Optional, ignorieren" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "create_brief",
      description:
        "Erstellt ein Anschreiben/Mahnung für einen Mieter aus einer Vorlage und speichert es im Schriftverkehr. Felder der Vorlage werden aus Stammdaten/Rückstand vorbelegt; optional überschreibbar.",
      parameters: {
        type: "object",
        properties: {
          mieter_id: { type: "string", description: "ID des Mieters" },
          template_id: {
            type: "string",
            description:
              "Vorlagen-ID, z.B. mahnung, kuendigung, bk_abrechnung, mieterhoehung, hausordnung",
          },
          werte: {
            type: "object",
            description:
              "Optionale Feldwerte der Vorlage als flaches Objekt (z.B. {\"offenerBetrag\":\"120.50\",\"frist\":\"15.08.2026\",\"iban\":\"...\"}).",
          },
          status: {
            type: "string",
            enum: ["Entwurf", "Versandbereit"],
            description: "Status des Briefs; Standard Versandbereit",
          },
        },
        required: ["mieter_id", "template_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_briefe_batch",
      description:
        "Erstellt denselben Brief-Typ für mehrere Mieter auf einmal (z.B. alle Mahnungen einer Straße) und speichert sie.",
      parameters: {
        type: "object",
        properties: {
          mieter_ids: {
            type: "array",
            items: { type: "string" },
            description: "Liste der Mieter-IDs",
          },
          template_id: {
            type: "string",
            description: "Vorlagen-ID, typischerweise mahnung",
          },
          status: {
            type: "string",
            enum: ["Entwurf", "Versandbereit"],
          },
        },
        required: ["mieter_ids", "template_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_gespeicherte_briefe",
      description:
        "Listet bereits gespeicherte Schriftverkehr-Dokumente, optional gefiltert nach Mieter oder Liegenschaft.",
      parameters: {
        type: "object",
        properties: {
          mieter_id: { type: "string" },
          liegenschaft_query: { type: "string" },
          template_id: { type: "string" },
        },
        required: [],
      },
    },
  },
];

// -------- Kontext-Helfer --------

function matchesQuery(
  query: string,
  lg?: Liegenschaft,
  mieterName?: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const parts: string[] = [];
  if (lg) {
    parts.push(
      lg.name,
      lg.strasse,
      lg.hausnummer,
      lg.plz,
      lg.ort,
      `${lg.strasse} ${lg.hausnummer}`,
      `${lg.strasse}${lg.hausnummer}`,
      `${lg.plz} ${lg.ort}`
    );
  }
  if (mieterName) parts.push(mieterName);
  const hay = parts.filter(Boolean).join(" ").toLowerCase();
  // Teilsuche: jedes Wort aus der Query sollte vorkommen (OR für Straße/Name)
  const tokens = q.split(/\s+/).filter((t) => t.length > 1);
  if (tokens.length === 0) return hay.includes(q);
  return tokens.some((t) => hay.includes(t));
}

async function loadHierarchy() {
  const [liegenschaften, gebaeude, wohnungen, mieter] = await Promise.all([
    liegenschaftenDb.list(),
    gebaeudeDb.list(),
    wohnungenDb.list(),
    mieterDb.list(),
  ]);
  return { liegenschaften, gebaeude, wohnungen, mieter };
}

function resolveHierarchy(
  m: Mieter,
  wohnungen: Wohnung[],
  gebaeude: Gebaeude[],
  liegenschaften: Liegenschaft[]
) {
  const wohnung = wohnungen.find((w) => w.id === m.wohnungId);
  const geb = wohnung ? gebaeude.find((g) => g.id === wohnung.gebaeudeId) : undefined;
  const lg = geb ? liegenschaften.find((l) => l.id === geb.liegenschaftId) : undefined;
  return { wohnung, gebaeude: geb, liegenschaft: lg };
}

async function buildAndSaveBrief(params: {
  mieter: Mieter;
  wohnung?: Wohnung;
  gebaeude?: Gebaeude;
  liegenschaft?: Liegenschaft;
  templateId: string;
  werteOverride?: Record<string, string>;
  status?: "Entwurf" | "Versandbereit";
  quelle?: "manuell" | "agent";
}): Promise<SchriftverkehrDokument> {
  const template = SCHRIFTVERKEHR_TEMPLATES.find((t) => t.id === params.templateId);
  if (!template) {
    throw new Error(
      `Unbekannte Vorlage "${params.templateId}". Verfügbare: ${SCHRIFTVERKEHR_TEMPLATES.map((t) => t.id).join(", ")}`
    );
  }

  const basis: Omit<BriefKontext, "werte"> = {
    mieter: params.mieter,
    wohnung: params.wohnung,
    gebaeude: params.gebaeude,
    liegenschaft: params.liegenschaft,
    heute: heuteDe(),
  };
  const werte = {
    ...initialWerte(template, basis),
    ...(params.werteOverride || {}),
  };
  const ctx: BriefKontext = { ...basis, werte };
  const text = renderBrief(template, ctx);
  const betreff = template.betreff(ctx);

  const doc: SchriftverkehrDokument = {
    id: uuidv4(),
    templateId: template.id,
    templateLabel: template.label,
    mieterId: params.mieter.id,
    mieterName: params.mieter.name,
    wohnungId: params.wohnung?.id,
    gebaeudeId: params.gebaeude?.id,
    liegenschaftId: params.liegenschaft?.id,
    liegenschaftName: params.liegenschaft
      ? `${params.liegenschaft.strasse} ${params.liegenschaft.hausnummer}, ${params.liegenschaft.plz} ${params.liegenschaft.ort}`
      : params.liegenschaft?.name,
    betreff,
    text,
    werte,
    status: params.status || "Versandbereit",
    quelle: params.quelle || "agent",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return schriftverkehrDb.create(doc);
}

// -------- Tool-Ausführung --------

async function executeTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const { liegenschaften, gebaeude, wohnungen, mieter } = await loadHierarchy();

  switch (name) {
    case "list_liegenschaften": {
      return liegenschaften.map((lg) => ({
        id: lg.id,
        nummer: lg.nummer,
        name: lg.name,
        adresse: `${lg.strasse} ${lg.hausnummer}, ${lg.plz} ${lg.ort}`,
      }));
    }

    case "find_mieter": {
      const query = String(args.query || "");
      const nurRueckstand = Boolean(args.nur_mit_rueckstand);
      const results = mieter
        .map((m) => {
          const h = resolveHierarchy(m, wohnungen, gebaeude, liegenschaften);
          const rueckstand = mietRueckstand(m);
          return {
            mieterId: m.id,
            mieterName: m.name,
            mietbeginn: m.mietbeginn,
            kaltmiete: m.kaltmiete,
            nebenkostenVorauszahlung: m.nebenkostenVorauszahlung,
            rueckstand,
            wohnung: h.wohnung?.bezeichnung,
            wohnungId: h.wohnung?.id,
            liegenschaftId: h.liegenschaft?.id,
            liegenschaft: h.liegenschaft
              ? `${h.liegenschaft.strasse} ${h.liegenschaft.hausnummer}, ${h.liegenschaft.plz} ${h.liegenschaft.ort}`
              : undefined,
            liegenschaftName: h.liegenschaft?.name,
          };
        })
        .filter((r) => {
          if (nurRueckstand && !(r.rueckstand > 0.005)) return false;
          const lg = liegenschaften.find((l) => l.id === r.liegenschaftId);
          return matchesQuery(query, lg, r.mieterName);
        });
      return { anzahl: results.length, mieter: results };
    }

    case "get_mietrueckstaende": {
      const q = args.liegenschaft_query ? String(args.liegenschaft_query) : "";
      const list = mieter
        .map((m) => {
          const h = resolveHierarchy(m, wohnungen, gebaeude, liegenschaften);
          const rueckstand = mietRueckstand(m);
          return {
            mieterId: m.id,
            mieterName: m.name,
            rueckstand,
            wohnung: h.wohnung?.bezeichnung,
            liegenschaftId: h.liegenschaft?.id,
            liegenschaft: h.liegenschaft
              ? `${h.liegenschaft.strasse} ${h.liegenschaft.hausnummer}, ${h.liegenschaft.plz} ${h.liegenschaft.ort}`
              : undefined,
          };
        })
        .filter((r) => {
          if (Math.round(r.rueckstand * 100) === 0) return false;
          if (!q) return true;
          const lg = liegenschaften.find((l) => l.id === r.liegenschaftId);
          return matchesQuery(q, lg, r.mieterName);
        })
        .sort((a, b) => b.rueckstand - a.rueckstand);
      return {
        anzahl: list.length,
        summePositiv: list.filter((r) => r.rueckstand > 0).reduce((s, r) => s + r.rueckstand, 0),
        rueckstaende: list,
      };
    }

    case "list_brief_vorlagen": {
      return SCHRIFTVERKEHR_TEMPLATES.map((t) => ({
        id: t.id,
        label: t.label,
        felder: t.fields.map((f) => f.key),
      }));
    }

    case "create_brief": {
      const mieterId = String(args.mieter_id || "");
      const templateId = String(args.template_id || "");
      const m = mieter.find((x) => x.id === mieterId);
      if (!m) return { error: `Mieter ${mieterId} nicht gefunden` };
      const h = resolveHierarchy(m, wohnungen, gebaeude, liegenschaften);
      const werteOverride =
        args.werte && typeof args.werte === "object"
          ? (args.werte as Record<string, string>)
          : undefined;
      const status =
        args.status === "Entwurf" || args.status === "Versandbereit"
          ? args.status
          : "Versandbereit";
      const doc = await buildAndSaveBrief({
        mieter: m,
        wohnung: h.wohnung,
        gebaeude: h.gebaeude,
        liegenschaft: h.liegenschaft,
        templateId,
        werteOverride,
        status,
        quelle: "agent",
      });
      return {
        ok: true,
        id: doc.id,
        nummer: doc.nummer,
        betreff: doc.betreff,
        mieterName: doc.mieterName,
        templateLabel: doc.templateLabel,
        status: doc.status,
        hinweis: "Brief wurde unter Schriftverkehr gespeichert und ist dort einsehbar.",
      };
    }

    case "create_briefe_batch": {
      const ids = Array.isArray(args.mieter_ids)
        ? (args.mieter_ids as string[])
        : [];
      const templateId = String(args.template_id || "mahnung");
      const status =
        args.status === "Entwurf" || args.status === "Versandbereit"
          ? args.status
          : "Versandbereit";
      const created: unknown[] = [];
      const errors: string[] = [];
      for (const mieterId of ids) {
        const m = mieter.find((x) => x.id === mieterId);
        if (!m) {
          errors.push(`Mieter ${mieterId} nicht gefunden`);
          continue;
        }
        try {
          const h = resolveHierarchy(m, wohnungen, gebaeude, liegenschaften);
          const doc = await buildAndSaveBrief({
            mieter: m,
            wohnung: h.wohnung,
            gebaeude: h.gebaeude,
            liegenschaft: h.liegenschaft,
            templateId,
            status,
            quelle: "agent",
          });
          created.push({
            id: doc.id,
            nummer: doc.nummer,
            mieterName: doc.mieterName,
            betreff: doc.betreff,
            offenerBetrag: doc.werte.offenerBetrag,
          });
        } catch (e: any) {
          errors.push(`${m.name}: ${e.message || String(e)}`);
        }
      }
      return {
        ok: true,
        anzahl: created.length,
        erstellt: created,
        fehler: errors,
        hinweis:
          "Die Briefe liegen unter Schriftverkehr (gespeicherte Dokumente) und können dort bearbeitet/exportiert werden.",
      };
    }

    case "list_gespeicherte_briefe": {
      let docs = await schriftverkehrDb.list();
      if (args.mieter_id) {
        docs = docs.filter((d) => d.mieterId === String(args.mieter_id));
      }
      if (args.template_id) {
        docs = docs.filter((d) => d.templateId === String(args.template_id));
      }
      if (args.liegenschaft_query) {
        const q = String(args.liegenschaft_query).toLowerCase();
        docs = docs.filter(
          (d) =>
            (d.liegenschaftName || "").toLowerCase().includes(q) ||
            (d.mieterName || "").toLowerCase().includes(q)
        );
      }
      docs = [...docs].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      return {
        anzahl: docs.length,
        briefe: docs.map((d) => ({
          id: d.id,
          nummer: d.nummer,
          templateLabel: d.templateLabel,
          mieterName: d.mieterName,
          liegenschaftName: d.liegenschaftName,
          betreff: d.betreff,
          status: d.status,
          quelle: d.quelle,
          createdAt: d.createdAt,
        })),
      };
    }

    default:
      return { error: `Unbekanntes Tool: ${name}` };
  }
}

// -------- Agent-Loop --------

const AGENT_SYSTEM = `Du bist "BetriebsKostenBot Agent" – ein Handlungs-Assistent in einer deutschen Hausverwaltungs-App.
Du kannst Tools aufrufen, um Daten zu lesen und Schriftverkehr (Mahnungen, Anschreiben, Kündigungen usw.) zu erstellen und im System abzulegen.

Arbeitsweise:
1. Verstehe die Nutzeranfrage (z.B. "Mahnliste für Spannhagengartenstraße und alle nötigen Mahnungen erstellen").
2. Finde zuerst die passenden Mieter/Rückstände über die Tools (find_mieter, get_mietrueckstaende, list_liegenschaften).
3. Erstelle nur dann Briefe, wenn der Nutzer das ausdrücklich will oder klar aus dem Auftrag hervorgeht (z.B. "erstelle alle Mahnungen").
4. Für Mahnungen: nur Mieter mit positivem Rückstand (> 0). Nutze template_id "mahnung".
5. Bei Batch-Aufträgen: create_briefe_batch mit den gefundenen mieter_ids.
6. Am Ende: kurze Zusammenfassung auf Deutsch – wie viele Briefe, für wen, wo sie liegen (Schriftverkehr). Beträge in Euro.

Regeln:
- Erfinde keine Mieter-IDs oder Beträge – nur Tool-Ergebnisse nutzen.
- Wenn nichts gefunden wird, sage das klar.
- Keine Rechtsberatung jenseits der Vorlagen; formuliere knapp und professionell.
- Antworte nach Abschluss der Tools in klarem Deutsch ohne JSON.`;

export interface AgentResult {
  reply: string;
  steps: { tool: string; args: Record<string, unknown>; result: unknown }[];
  createdBriefIds: string[];
}

export async function runAgent(params: {
  message: string;
  history?: { role: "user" | "assistant"; content: string }[];
  path?: string;
}): Promise<AgentResult> {
  const groq = getClient();
  const steps: AgentResult["steps"] = [];
  const createdBriefIds: string[] = [];

  const messages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: AGENT_SYSTEM },
    ...(params.history || []).map(
      (h) =>
        ({
          role: h.role,
          content: h.content,
        }) as Groq.Chat.Completions.ChatCompletionMessageParam
    ),
    {
      role: "user",
      content: params.path
        ? `[Aktuelle App-Seite: ${params.path}]\n\n${params.message}`
        : params.message,
    },
  ];

  try {
    for (let step = 0; step < MAX_AGENT_STEPS; step++) {
      const completion = await groq.chat.completions.create({
        model: TEXT_MODEL,
        max_completion_tokens: 2000,
        temperature: 0.2,
        tools: AGENT_TOOLS,
        tool_choice: "auto",
        messages,
      });

      const choice = completion.choices[0];
      const msg = choice?.message;
      if (!msg) break;

      const toolCalls = msg.tool_calls;
      if (!toolCalls || toolCalls.length === 0) {
        return {
          reply: msg.content || "Fertig.",
          steps,
          createdBriefIds,
        };
      }

      // Assistant-Nachricht mit tool_calls in den Verlauf (content null wenn leer)
      messages.push({
        role: "assistant",
        content: msg.content || null,
        tool_calls: toolCalls,
      } as Groq.Chat.Completions.ChatCompletionMessageParam);

      for (const call of toolCalls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch {
          args = {};
        }

        let result: unknown;
        try {
          result = await executeTool(call.function.name, args);
        } catch (toolErr: any) {
          result = { error: toolErr?.message || String(toolErr) };
        }
        steps.push({ tool: call.function.name, args, result });

        if (
          (call.function.name === "create_brief" ||
            call.function.name === "create_briefe_batch") &&
          result &&
          typeof result === "object"
        ) {
          const r = result as any;
          if (r.id) createdBriefIds.push(r.id);
          if (Array.isArray(r.erstellt)) {
            for (const e of r.erstellt) {
              if (e?.id) createdBriefIds.push(e.id);
            }
          }
        }

        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result),
        } as Groq.Chat.Completions.ChatCompletionMessageParam);
      }
    }

    return {
      reply:
        "Der Agent hat die maximale Anzahl interner Schritte erreicht. Bitte prüfe die bisher erstellten Dokumente unter Schriftverkehr oder formuliere den Auftrag enger.",
      steps,
      createdBriefIds,
    };
  } catch (e: any) {
    // Fallback: deterministische Mahnungs-Erstellung ohne Tool-Calling
    const fallback = await tryDeterministicMahnung(params.message);
    if (fallback) {
      return {
        reply:
          fallback.reply +
          (e?.message
            ? `\n\n(Hinweis: Tool-Agent war nicht verfügbar: ${e.message})`
            : ""),
        steps: fallback.steps,
        createdBriefIds: fallback.createdBriefIds,
      };
    }
    throw e;
  }
}

/** Ohne LLM-Tools: Rückstände finden und Mahnungen speichern, wenn der Text klar danach verlangt. */
async function tryDeterministicMahnung(message: string): Promise<AgentResult | null> {
  const m = message.toLowerCase();
  const wantsMahnung =
    /\b(mahnung|mahnungen|mahnliste|mahnlauf)\b/.test(m) &&
    /\b(erstell|generier|schreib|mach|fertig|alle|nötig|noetig)\w*/.test(m);
  if (!wantsMahnung) return null;

  // Suchbegriff: nach "für" / "fuer" oder bekannte Straßenmuster
  let query = "";
  const fuer = message.match(/\b(?:für|fuer)\s+(.+?)(?:\s+und\s+|\s*$)/i);
  if (fuer) query = fuer[1].replace(/[?.!]+$/, "").trim();
  if (!query) {
    const str = message.match(
      /([A-ZÄÖÜ][a-zäöüß]+(?:straße|strasse|str\.?|weg|platz|allee|gasse)[^\s,]*)/i
    );
    if (str) query = str[1];
  }

  const { liegenschaften, gebaeude, wohnungen, mieter } = await loadHierarchy();
  const targets = mieter
    .map((mi) => {
      const h = resolveHierarchy(mi, wohnungen, gebaeude, liegenschaften);
      const rueckstand = mietRueckstand(mi);
      return { mi, h, rueckstand };
    })
    .filter(({ mi, h, rueckstand }) => {
      if (!(rueckstand > 0.005)) return false;
      if (!query) return true;
      return matchesQuery(query, h.liegenschaft, mi.name);
    });

  if (targets.length === 0) {
    return {
      reply: query
        ? `Keine Mieter mit positivem Mietrückstand für „${query}“ gefunden. Bitte Straße/Liegenschaft prüfen oder Rückstände im Mietkonto nachtragen.`
        : "Keine Mieter mit positivem Mietrückstand gefunden.",
      steps: [{ tool: "deterministic_mahnung", args: { query }, result: { anzahl: 0 } }],
      createdBriefIds: [],
    };
  }

  const created: string[] = [];
  const lines: string[] = [];
  for (const { mi, h, rueckstand } of targets) {
    const doc = await buildAndSaveBrief({
      mieter: mi,
      wohnung: h.wohnung,
      gebaeude: h.gebaeude,
      liegenschaft: h.liegenschaft,
      templateId: "mahnung",
      status: "Versandbereit",
      quelle: "agent",
    });
    created.push(doc.id);
    lines.push(
      `• ${mi.name}${h.wohnung ? ` (${h.wohnung.bezeichnung})` : ""} – Rückstand ${rueckstand.toFixed(2)} € – ${doc.nummer || doc.id}`
    );
  }

  return {
    reply: `Mahnlauf abgeschlossen (${created.length} Schreiben, Status Versandbereit):\n${lines.join(
      "\n"
    )}\n\nDie Briefe liegen unter Schriftverkehr → Archiv / Agent-Briefe.`,
    steps: [
      {
        tool: "deterministic_mahnung",
        args: { query },
        result: { anzahl: created.length },
      },
    ],
    createdBriefIds: created,
  };
}

/** Erkennung, ob eine Chat-Nachricht einen Agenten-Workflow auslösen soll */
export function isAgentIntent(message: string): boolean {
  const m = message.toLowerCase();
  // Reine Wissensfragen ohne Handlungsaufforderung → kein Agent
  const pureQuestion =
    /^(was|wer|wie\s+hoch|wieviel|wie\s+viele|welche|wo|warum|erkläre|erklaere|zeig|liste)\b/.test(
      m
    ) && !/\b(erstell|generier|schreib|leg\s+an|anlegen|fertig|mach)\w*/.test(m);
  if (pureQuestion) return false;

  const wantsCreate =
    /\b(erstell|generier|schreib|versend|leg\s+an|anlegen|mach|fertig|anfertig|ausfertig)\w*/.test(
      m
    );
  const documentHint =
    /\b(mahnung|mahnungen|mahnliste|mahnlauf|anschreiben|kündigung|kuendigung|abmahnung|mieterhöhung|mieterhoehung|brief|briefe|schreiben)\b/.test(
      m
    );
  // z.B. "erstelle alle Mahnungen für die Spannhagengartenstraße"
  return (wantsCreate && documentHint) || (documentHint && /\b(alle|nötig|noetig|offen)\b/.test(m));
}

/** Manuelles Speichern aus dem UI (SchriftverkehrPanel) */
export async function saveBriefManuell(params: {
  mieterId: string;
  templateId: string;
  text: string;
  betreff: string;
  werte: Record<string, string>;
  status?: "Entwurf" | "Versandbereit";
}): Promise<SchriftverkehrDokument> {
  const { liegenschaften, gebaeude, wohnungen, mieter } = await loadHierarchy();
  const m = mieter.find((x) => x.id === params.mieterId);
  if (!m) throw new Error("Mieter nicht gefunden");
  const h = resolveHierarchy(m, wohnungen, gebaeude, liegenschaften);
  const template = SCHRIFTVERKEHR_TEMPLATES.find((t) => t.id === params.templateId);

  const doc: SchriftverkehrDokument = {
    id: uuidv4(),
    templateId: params.templateId,
    templateLabel: template?.label || params.templateId,
    mieterId: m.id,
    mieterName: m.name,
    wohnungId: h.wohnung?.id,
    gebaeudeId: h.gebaeude?.id,
    liegenschaftId: h.liegenschaft?.id,
    liegenschaftName: h.liegenschaft
      ? `${h.liegenschaft.strasse} ${h.liegenschaft.hausnummer}, ${h.liegenschaft.plz} ${h.liegenschaft.ort}`
      : undefined,
    betreff: params.betreff,
    text: params.text,
    werte: params.werte,
    status: params.status || "Entwurf",
    quelle: "manuell",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return schriftverkehrDb.create(doc);
}
