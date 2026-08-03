import Groq from "groq-sdk";
import { v4 as uuidv4 } from "uuid";
import {
  Gebaeude,
  Liegenschaft,
  Mieter,
  PruefBefund,
  SchriftverkehrDokument,
  Wohnung,
} from "./types";
import {
  ablageDb,
  deleteAbrechnung,
  gebaeudeDb,
  liegenschaftenDb,
  listAbrechnungen,
  logEvent,
  mieterDb,
  mietvertraegeDb,
  pmVertraegeDb,
  pruefLaufDb,
  schriftverkehrDb,
  updateAbrechnung,
  wohnungenDb,
  eigentuemerDb,
} from "./db";
import { runPlausibilitaetspruefung, wendeBefundAn } from "./pruefung";
import { mietRueckstand } from "./mietkonto";
import {
  BriefKontext,
  SCHRIFTVERKEHR_TEMPLATES,
  heuteDe,
  initialWerte,
  renderBrief,
} from "./schriftverkehr";
import { createChatCompletion } from "./groq-client";

const MAX_AGENT_STEPS = 20;

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

  // ---- Plausibilitätsprüfung & Stammdaten-Bereinigung (alle Module) ----
  {
    type: "function",
    function: {
      name: "get_pruef_befunde",
      description:
        "Liest den letzten Plausibilitäts-Prüflauf und listet offene Befunde aller Module (Liegenschaften, Gebäude, Wohnungen, Mieter, Mietverträge, PM-Verträge, Eigentümer, Abrechnungen, Kontoauszüge, Ablage). Nutzen als erstes bei Bereinigungsaufträgen.",
      parameters: {
        type: "object",
        properties: {
          nur_offen: {
            type: "boolean",
            description: "Wenn true (Standard), nur offene Befunde",
          },
          modul: {
            type: "string",
            description:
              "Optionaler Filter: liegenschaften|gebaeude|wohnungen|mieter|mietvertraege|pmVertraege|eigentuemer|abrechnungen|kontoauszuege|ablage",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_pruefung",
      description:
        "Startet einen neuen vollständigen Plausibilitäts-Prüflauf über alle Module und gibt die Befunde zurück.",
      parameters: { type: "object", properties: { "_": { type: "string" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "create_gebaeude",
      description:
        "Legt ein Gebäude unter einer Liegenschaft an (z.B. 'Hauptgebäude'). Schließt den Hinweis 'Liegenschaft ohne Gebäude'.",
      parameters: {
        type: "object",
        properties: {
          liegenschaft_id: { type: "string", description: "ID der Liegenschaft" },
          name: {
            type: "string",
            description: "Gebäude-Name, Standard 'Hauptgebäude'",
          },
          anzahl_einheiten: { type: "number" },
          baujahr: { type: "number" },
          heizungsart: { type: "string" },
          user_confirmed: {
            type: "boolean",
            description:
              "Muss true sein, wenn der Nutzer die Anlage bestätigt hat. Sonst nur Vorschlag zurückgeben.",
          },
        },
        required: ["liegenschaft_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_liegenschaft",
      description:
        "Korrigiert Stammdaten einer Liegenschaft (Name, Straße, Hausnummer, PLZ, Ort, Flurstück, Notizen).",
      parameters: {
        type: "object",
        properties: {
          liegenschaft_id: { type: "string" },
          name: { type: "string" },
          strasse: { type: "string" },
          hausnummer: { type: "string" },
          plz: { type: "string" },
          ort: { type: "string" },
          flurstueck: { type: "string" },
          notizen: { type: "string" },
        },
        required: ["liegenschaft_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_liegenschaft",
      description:
        "Löscht eine Liegenschaft. Nur wenn sie keine Gebäude/Wohnungen/Mieter hat ODER user_confirmed=true und force=true. Bei abhängigen Daten zuerst merge oder force+confirm.",
      parameters: {
        type: "object",
        properties: {
          liegenschaft_id: { type: "string" },
          user_confirmed: { type: "boolean" },
          force: {
            type: "boolean",
            description: "Auch löschen wenn noch abhängige Objekte existieren (Vorsicht)",
          },
        },
        required: ["liegenschaft_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "merge_liegenschaften",
      description:
        "Verschiebt Gebäude, PM-Verträge und Eigentümer von Quell-Liegenschaft zur Ziel-Liegenschaft und löscht optional die leere Quelle. Für Duplikate wie mehrfache 'Spannhagengartenstraße'.",
      parameters: {
        type: "object",
        properties: {
          quelle_id: { type: "string", description: "ID der zu entleerenden Liegenschaft" },
          ziel_id: { type: "string", description: "ID der kanonischen Liegenschaft" },
          quelle_loeschen: {
            type: "boolean",
            description: "Nach Merge leere Quelle löschen (nur mit user_confirmed)",
          },
          user_confirmed: { type: "boolean" },
        },
        required: ["quelle_id", "ziel_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_wohnung",
      description:
        "Aktualisiert Wohnungs-Stammdaten, z.B. fehlende Wohnfläche (flaeche in m²), Bezeichnung, Typ, Zimmer.",
      parameters: {
        type: "object",
        properties: {
          wohnung_id: { type: "string" },
          flaeche: { type: "number", description: "Wohnfläche in m²" },
          bezeichnung: { type: "string" },
          typ: { type: "string", enum: ["Wohnung", "Gewerbe", "Stellplatz", "Sonstige"] },
          zimmer: { type: "number" },
          notizen: { type: "string" },
        },
        required: ["wohnung_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_abrechnung",
      description:
        "Korrigiert eine Abrechnung – z.B. Status von 'Fertig' zurück auf 'Rohdaten' wenn Summe 0 €.",
      parameters: {
        type: "object",
        properties: {
          abrechnung_id: { type: "string" },
          status: {
            type: "string",
            enum: ["Rohdaten", "Validierung", "Fertig"],
          },
          name: { type: "string" },
          adresse: { type: "string" },
          gesamtSumme: { type: "number" },
        },
        required: ["abrechnung_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_abrechnung",
      description:
        "Löscht eine leere/fehlerhafte Abrechnung. Erfordert user_confirmed=true.",
      parameters: {
        type: "object",
        properties: {
          abrechnung_id: { type: "string" },
          user_confirmed: { type: "boolean" },
        },
        required: ["abrechnung_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_ablage_zuordnung",
      description:
        "Korrigiert die Zuordnung eines Ablage-Dokuments (z.B. Rechnung lag bei falschem Lieferanten/Objekt).",
      parameters: {
        type: "object",
        properties: {
          ablage_id: { type: "string" },
          ziel_art: {
            type: "string",
            description: "z.B. Liegenschaft, Rechnung, PM-Vertrag, Eigentümer, Kontoauszug",
          },
          ziel_id: { type: "string" },
          ziel_label: { type: "string" },
        },
        required: ["ablage_id", "ziel_art", "ziel_id", "ziel_label"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "apply_pruef_befund",
      description:
        "Wendet den automatischen Korrekturvorschlag eines Befunds an (Dokument verschieben / Stammdaten-Patch), falls vorhanden.",
      parameters: {
        type: "object",
        properties: {
          lauf_id: { type: "string" },
          befund_id: { type: "string" },
        },
        required: ["lauf_id", "befund_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mark_befund_status",
      description:
        "Setzt Befund-Status auf 'uebernommen' (als erledigt markieren ohne Änderung) oder 'abgelehnt'.",
      parameters: {
        type: "object",
        properties: {
          lauf_id: { type: "string" },
          befund_id: { type: "string" },
          status: { type: "string", enum: ["uebernommen", "abgelehnt", "offen"] },
        },
        required: ["lauf_id", "befund_id", "status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analyze_and_plan_cleanup",
      description:
        "Analysiert alle offenen Prüfbefunde und liefert einen strukturierten Plan: auto_fix (zweifelsfrei, sofort ausführbar), fragen (Nutzer bestätigen: anlegen/löschen/mergen), manuell (z.B. fehlende Fläche ohne Quelle). Keine Änderungen – nur Plan.",
      parameters: { type: "object", properties: { "_": { type: "string" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "execute_safe_cleanup",
      description:
        "Führt nur zweifelsfreie Korrekturen aus: (1) Abrechnungen mit Status Fertig und Summe 0 → Rohdaten, (2) Befunde mit vorhandenem vorschlag anwenden, (3) leere Duplikat-Liegenschaften ohne Abhängigkeiten zur kanonischen Adresse mergen wenn eindeutig. Gebäude-Neuanlage und Löschungen nur wenn allow_create_gebaeude bzw. allow_delete true (Nutzer hat bestätigt).",
      parameters: {
        type: "object",
        properties: {
          allow_create_gebaeude: {
            type: "boolean",
            description: "true = fehlende Gebäude als 'Hauptgebäude' anlegen (Nutzer bestätigt)",
          },
          allow_delete_empty_liegenschaften: {
            type: "boolean",
            description: "true = leere Duplikat-Liegenschaften nach Merge löschen",
          },
          allow_delete_empty_abrechnungen: {
            type: "boolean",
            description: "true = leere Fertig-Abrechnungen mit Summe 0 löschen statt nur Status zurücksetzen",
          },
          liegenschaft_ids_fuer_gebaeude: {
            type: "array",
            items: { type: "string" },
            description: "Optional nur für diese Liegenschaft-IDs Gebäude anlegen",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "sync_mieter_from_mietvertraege",
      description:
        "Übernimmt aus vorhandenen Mietverträgen Mietbeginn, Mietende, Kaltmiete (sollMiete) und NK-Vorauszahlung in die Mieter-Stammdaten. Optional gefiltert nach Liegenschaft/Straße. Nur Felder setzen, die im Mietvertrag befüllt sind.",
      parameters: {
        type: "object",
        properties: {
          liegenschaft_query: {
            type: "string",
            description: "Optional: Straße/Name z.B. Spannhagengartenstraße 10",
          },
          nur_leere_felder: {
            type: "boolean",
            description: "Wenn true (Standard), nur leere Mieter-Felder überschreiben; wenn false, Vertragsdaten immer übernehmen",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_unpassende_dokumente",
      description:
        "Listet Ablage-Dokumente die (a) keiner Liegenschaft zugeordnet sind, (b) Status neu/in_pruefung haben, oder (c) im letzten Prüflauf als unplausible Zuordnung markiert wurden. Ideal für 'zeig mir Dokumente die zu keiner Liegenschaft passen'.",
      parameters: {
        type: "object",
        properties: {
          nur_ohne_liegenschaft: {
            type: "boolean",
            description: "Wenn true, nur Dokumente ohne Liegenschafts-Zuordnung",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_ablage",
      description:
        "Listet Dokumente in der Ablage (Dokumenteneingang). Filter: status (neu|in_pruefung|zugeordnet|verworfen|offen), erkannter_typ (z.B. mietvertrag). Nutzen bei 'zeig offene Unterlagen' oder 'welche Mietverträge liegen in der Ablage'.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            description: "neu | in_pruefung | zugeordnet | verworfen | offen (= neu+in_pruefung)",
          },
          erkannter_typ: {
            type: "string",
            description: "Optional z.B. mietvertrag, rechnung, pm_vertrag",
          },
          limit: { type: "number", description: "Max. Treffer (Standard 30)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reassign_mietvertrag",
      description:
        "Ordnet einen bestehenden Mietvertrag neu zu (Wohnung und/oder Mieter) und aktualisiert optional die Mieter-Stammdaten aus den Vertragsfeldern (Kaltmiete, NK, Mietbeginn). Nutzen wenn Zuordnung falsch ist oder fehlte.",
      parameters: {
        type: "object",
        properties: {
          mietvertrag_id: { type: "string", description: "ID des Mietvertrags" },
          wohnung_id: { type: "string", description: "Neue Wohnungs-ID" },
          mieter_id: { type: "string", description: "Neue Mieter-ID (optional)" },
          sync_mieter_stammdaten: {
            type: "boolean",
            description: "Wenn true (Standard): Kaltmiete/NK/Daten aus Vertrag auf Mieter übernehmen",
          },
        },
        required: ["mietvertrag_id", "wohnung_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_mietvertraege",
      description:
        "Listet Mietverträge mit Mieter-, Wohnungs- und Stammdaten. Optional Filter nach fehlender Zuordnung (ohne_mieter / ohne_wohnung).",
      parameters: {
        type: "object",
        properties: {
          ohne_mieter: { type: "boolean" },
          ohne_wohnung: { type: "boolean" },
          query: { type: "string", description: "Suche in Dateiname / Nummer" },
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
      : undefined,
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

    case "get_pruef_befunde": {
      const laeufe = await pruefLaufDb.list();
      if (!laeufe.length) return { hinweis: "Noch kein Prüflauf vorhanden. Nutze run_pruefung." };
      const lauf = [...laeufe].sort(
        (a, b) => new Date(b.gestartetAm).getTime() - new Date(a.gestartetAm).getTime()
      )[0];
      const nurOffen = args.nur_offen !== false;
      let befunde = lauf.befunde || [];
      if (nurOffen) befunde = befunde.filter((b) => b.status === "offen");
      if (args.modul) befunde = befunde.filter((b) => b.modul === String(args.modul));
      return {
        laufId: lauf.id,
        gestartetAm: lauf.gestartetAm,
        modulStatus: lauf.modulStatus,
        anzahl: befunde.length,
        befunde: befunde.map((b) => ({
          id: b.id,
          modul: b.modul,
          schweregrad: b.schweregrad,
          titel: b.titel,
          beschreibung: b.beschreibung,
          betroffene: b.betroffene,
          hatVorschlag: Boolean(b.vorschlag),
          vorschlag: b.vorschlag,
          status: b.status,
        })),
      };
    }

    case "run_pruefung": {
      const lauf = await runPlausibilitaetspruefung();
      return {
        laufId: lauf.id,
        gestartetAm: lauf.gestartetAm,
        modulStatus: lauf.modulStatus,
        anzahlBefunde: lauf.befunde.length,
        offene: lauf.befunde.filter((b) => b.status === "offen").length,
        befunde: lauf.befunde
          .filter((b) => b.status === "offen")
          .map((b) => ({
            id: b.id,
            modul: b.modul,
            schweregrad: b.schweregrad,
            titel: b.titel,
            beschreibung: b.beschreibung,
            betroffene: b.betroffene,
            hatVorschlag: Boolean(b.vorschlag),
          })),
      };
    }

    case "create_gebaeude": {
      const lgId = String(args.liegenschaft_id || "");
      const lg = await liegenschaftenDb.get(lgId);
      if (!lg) return { error: `Liegenschaft ${lgId} nicht gefunden` };
      if (!args.user_confirmed) {
        return {
          needsConfirmation: true,
          frage: `Soll für Liegenschaft „${lg.name}" (${lg.strasse} ${lg.hausnummer}, ${lg.plz} ${lg.ort}) ein Gebäude „${args.name || "Hauptgebäude"}" angelegt werden?`,
          liegenschaft_id: lgId,
          vorschlag_name: args.name || "Hauptgebäude",
        };
      }
      const now = new Date().toISOString();
      const geb = await gebaeudeDb.create({
        id: uuidv4(),
        liegenschaftId: lgId,
        name: String(args.name || "Hauptgebäude"),
        anzahlEinheiten:
          typeof args.anzahl_einheiten === "number" ? args.anzahl_einheiten : undefined,
        baujahr: typeof args.baujahr === "number" ? args.baujahr : undefined,
        heizungsart: args.heizungsart ? String(args.heizungsart) : undefined,
        createdAt: now,
        updatedAt: now,
      });
      await logEvent(
        "anlage",
        `Gebäude „${geb.name}" für Liegenschaft „${lg.name}" vom Agent angelegt.`,
        { art: "Gebäude", id: geb.id }
      );
      return { ok: true, gebaeude: { id: geb.id, name: geb.name, liegenschaftId: lgId } };
    }

    case "update_liegenschaft": {
      const id = String(args.liegenschaft_id || "");
      const patch: Record<string, string> = {};
      for (const k of ["name", "strasse", "hausnummer", "plz", "ort", "flurstueck", "notizen"] as const) {
        if (args[k] !== undefined && args[k] !== null) patch[k] = String(args[k]);
      }
      const updated = await liegenschaftenDb.update(id, patch as any);
      if (!updated) return { error: "Liegenschaft nicht gefunden" };
      await logEvent("aenderung", `Liegenschaft „${updated.name}" vom Agent aktualisiert.`, {
        art: "Liegenschaft",
        id,
      });
      return {
        ok: true,
        liegenschaft: {
          id: updated.id,
          name: updated.name,
          adresse: `${updated.strasse} ${updated.hausnummer}, ${updated.plz} ${updated.ort}`,
        },
      };
    }

    case "delete_liegenschaft": {
      const id = String(args.liegenschaft_id || "");
      const lg = await liegenschaftenDb.get(id);
      if (!lg) return { error: "Liegenschaft nicht gefunden" };
      const [gebaeude, pm, eigentuemer] = await Promise.all([
        gebaeudeDb.list(),
        pmVertraegeDb.list(),
        eigentuemerDb.list(),
      ]);
      const deps = {
        gebaeude: gebaeude.filter((g) => g.liegenschaftId === id).length,
        pmVertraege: pm.filter((p) => p.liegenschaftId === id).length,
        eigentuemer: eigentuemer.filter((e) => e.liegenschaftId === id).length,
      };
      const hasDeps = deps.gebaeude + deps.pmVertraege + deps.eigentuemer > 0;
      if (!args.user_confirmed) {
        return {
          needsConfirmation: true,
          frage: hasDeps
            ? `Liegenschaft „${lg.name}" hat noch Abhängigkeiten (Gebäude: ${deps.gebaeude}, PM: ${deps.pmVertraege}, Eigentümer: ${deps.eigentuemer}). Wirklich löschen (force)? Besser merge_liegenschaften nutzen.`
            : `Leere Liegenschaft „${lg.name}" löschen?`,
          liegenschaft_id: id,
          abhaengigkeiten: deps,
        };
      }
      if (hasDeps && !args.force) {
        return {
          error: "Abhängigkeiten vorhanden – force=true und user_confirmed=true nötig oder zuerst mergen.",
          abhaengigkeiten: deps,
        };
      }
      await liegenschaftenDb.remove(id);
      await logEvent("loeschung", `Liegenschaft „${lg.name}" vom Agent gelöscht.`, {
        art: "Liegenschaft",
        id,
      });
      return { ok: true, geloescht: lg.name };
    }

    case "merge_liegenschaften": {
      const quelleId = String(args.quelle_id || "");
      const zielId = String(args.ziel_id || "");
      if (quelleId === zielId) return { error: "Quelle und Ziel sind identisch" };
      const [quelle, ziel] = await Promise.all([
        liegenschaftenDb.get(quelleId),
        liegenschaftenDb.get(zielId),
      ]);
      if (!quelle || !ziel) return { error: "Quelle oder Ziel nicht gefunden" };
      if (!args.user_confirmed && args.quelle_loeschen) {
        return {
          needsConfirmation: true,
          frage: `Gebäude/PM/Eigentümer von „${quelle.name}" nach „${ziel.name}" verschieben und Quelle löschen?`,
          quelle_id: quelleId,
          ziel_id: zielId,
        };
      }
      const [gebaeude, pm, eigentuemer] = await Promise.all([
        gebaeudeDb.list(),
        pmVertraegeDb.list(),
        eigentuemerDb.list(),
      ]);
      let movedG = 0,
        movedP = 0,
        movedE = 0;
      for (const g of gebaeude.filter((x) => x.liegenschaftId === quelleId)) {
        await gebaeudeDb.update(g.id, { liegenschaftId: zielId });
        movedG++;
      }
      for (const p of pm.filter((x) => x.liegenschaftId === quelleId)) {
        await pmVertraegeDb.update(p.id, { liegenschaftId: zielId });
        movedP++;
      }
      for (const e of eigentuemer.filter((x) => x.liegenschaftId === quelleId)) {
        await eigentuemerDb.update(e.id, { liegenschaftId: zielId });
        movedE++;
      }
      let geloescht = false;
      if (args.quelle_loeschen && args.user_confirmed) {
        await liegenschaftenDb.remove(quelleId);
        geloescht = true;
      }
      await logEvent(
        "aenderung",
        `Merge: „${quelle.name}" → „${ziel.name}" (Gebäude ${movedG}, PM ${movedP}, Eigentümer ${movedE})${geloescht ? ", Quelle gelöscht" : ""}.`,
        { art: "Liegenschaft", id: zielId }
      );
      return {
        ok: true,
        verschoben: { gebaeude: movedG, pmVertraege: movedP, eigentuemer: movedE },
        quelleGeloescht: geloescht,
        ziel: { id: ziel.id, name: ziel.name },
      };
    }

    case "update_wohnung": {
      const id = String(args.wohnung_id || "");
      const patch: Record<string, unknown> = {};
      if (typeof args.flaeche === "number") patch.flaeche = args.flaeche;
      if (args.bezeichnung !== undefined) patch.bezeichnung = String(args.bezeichnung);
      if (args.typ !== undefined) patch.typ = String(args.typ);
      if (typeof args.zimmer === "number") patch.zimmer = args.zimmer;
      if (args.notizen !== undefined) patch.notizen = String(args.notizen);
      const updated = await wohnungenDb.update(id, patch as any);
      if (!updated) return { error: "Wohnung nicht gefunden" };
      await logEvent(
        "aenderung",
        `Wohnung „${updated.bezeichnung}" vom Agent aktualisiert (${Object.keys(patch).join(", ")}).`,
        { art: "Wohnung", id }
      );
      return {
        ok: true,
        wohnung: {
          id: updated.id,
          bezeichnung: updated.bezeichnung,
          flaeche: updated.flaeche,
        },
      };
    }

    case "update_abrechnung": {
      const id = String(args.abrechnung_id || "");
      const patch: Record<string, unknown> = {};
      if (args.status) patch.status = String(args.status);
      if (args.name !== undefined) patch.name = String(args.name);
      if (args.adresse !== undefined) patch.adresse = String(args.adresse);
      if (typeof args.gesamtSumme === "number") patch.gesamtSumme = args.gesamtSumme;
      const updated = await updateAbrechnung(id, patch as any);
      if (!updated) return { error: "Abrechnung nicht gefunden" };
      await logEvent(
        "aenderung",
        `Abrechnung „${updated.name}" vom Agent aktualisiert (Status ${updated.status}).`,
        { art: "Abrechnung", id }
      );
      return {
        ok: true,
        abrechnung: {
          id: updated.id,
          name: updated.name,
          status: updated.status,
          gesamtSumme: updated.gesamtSumme,
        },
      };
    }

    case "delete_abrechnung": {
      const id = String(args.abrechnung_id || "");
      if (!args.user_confirmed) {
        const a = await listAbrechnungen().then((list) => list.find((x) => x.id === id));
        return {
          needsConfirmation: true,
          frage: `Abrechnung „${a?.name || id}" (Summe ${a?.gesamtSumme ?? "?"} €, Status ${a?.status}) wirklich löschen?`,
          abrechnung_id: id,
        };
      }
      const ok = await deleteAbrechnung(id);
      if (!ok) return { error: "Abrechnung nicht gefunden" };
      await logEvent("loeschung", `Abrechnung ${id} vom Agent gelöscht.`, {
        art: "Abrechnung",
        id,
      });
      return { ok: true };
    }

    case "update_ablage_zuordnung": {
      const id = String(args.ablage_id || "");
      const doc = await ablageDb.get(id);
      if (!doc) return { error: "Ablage-Dokument nicht gefunden" };
      const alt = doc.zugeordnetAn?.label;
      const updated = await ablageDb.update(id, {
        zugeordnetAn: {
          art: String(args.ziel_art) as any,
          id: String(args.ziel_id),
          label: String(args.ziel_label),
        },
        status: "zugeordnet",
      });
      await logEvent(
        "zuordnung",
        `Ablage „${doc.dateiName}" vom Agent umgehängt: „${alt || "—"}" → „${args.ziel_label}".`,
        { art: "Ablage", id }
      );
      return {
        ok: true,
        dateiName: doc.dateiName,
        neu: updated?.zugeordnetAn,
      };
    }

    case "apply_pruef_befund": {
      const laufId = String(args.lauf_id || "");
      const befundId = String(args.befund_id || "");
      const lauf = await pruefLaufDb.get(laufId);
      if (!lauf) return { error: "Prüflauf nicht gefunden" };
      const befund = lauf.befunde.find((b) => b.id === befundId);
      if (!befund) return { error: "Befund nicht gefunden" };
      const result = await wendeBefundAn(befund);
      if (result.ok) {
        befund.status = "uebernommen";
        await pruefLaufDb.update(laufId, { befunde: lauf.befunde });
      }
      return result;
    }

    case "mark_befund_status": {
      const laufId = String(args.lauf_id || "");
      const befundId = String(args.befund_id || "");
      const status = String(args.status || "uebernommen") as PruefBefund["status"];
      const lauf = await pruefLaufDb.get(laufId);
      if (!lauf) return { error: "Prüflauf nicht gefunden" };
      const befund = lauf.befunde.find((b) => b.id === befundId);
      if (!befund) return { error: "Befund nicht gefunden" };
      befund.status = status;
      await pruefLaufDb.update(laufId, { befunde: lauf.befunde });
      return { ok: true, befundId, status };
    }

    case "analyze_and_plan_cleanup": {
      const laeufe = await pruefLaufDb.list();
      if (!laeufe.length) {
        return { hinweis: "Kein Prüflauf – zuerst run_pruefung ausführen." };
      }
      const lauf = [...laeufe].sort(
        (a, b) => new Date(b.gestartetAm).getTime() - new Date(a.gestartetAm).getTime()
      )[0];
      const offen = (lauf.befunde || []).filter((b) => b.status === "offen");
      const [liegenschaften, gebaeude, abrechnungen] = await Promise.all([
        liegenschaftenDb.list(),
        gebaeudeDb.list(),
        listAbrechnungen(),
      ]);

      const auto_fix: { befundId?: string; aktion: string; detail: string }[] = [];
      const fragen: {
        befundId?: string;
        frage: string;
        vorschlag: string;
        liegenschaft_id?: string;
        abrechnung_id?: string;
        quelle_id?: string;
        ziel_id?: string;
      }[] = [];
      const manuell: { befundId: string; titel: string; grund: string }[] = [];

      // Duplikat-Liegenschaften erkennen (gleicher Straßenname, eine mit Hausnr.)
      const byStreet = new Map<string, typeof liegenschaften>();
      for (const l of liegenschaften) {
        const key = `${(l.strasse || l.name || "").toLowerCase().replace(/\s+/g, " ").trim()}|${l.plz}|${l.ort}`;
        const arr = byStreet.get(key) || [];
        arr.push(l);
        byStreet.set(key, arr);
      }

      for (const b of offen) {
        if (b.vorschlag) {
          auto_fix.push({
            befundId: b.id,
            aktion: "apply_pruef_befund",
            detail: b.vorschlag.beschreibung || b.titel,
          });
          continue;
        }
        if (b.titel === "Abrechnung ohne Summe") {
          const abrId = b.betroffene.find((t) => t.art === "Abrechnung")?.id;
          auto_fix.push({
            befundId: b.id,
            aktion: "update_abrechnung_status_rohdaten",
            detail: `Abrechnung ${abrId}: Status Fertig + Summe 0 → Rohdaten`,
          });
          fragen.push({
            befundId: b.id,
            abrechnung_id: abrId,
            frage: `Leere Abrechnung „${b.betroffene[0]?.label}" (0 €, Status Fertig) – Status auf Rohdaten setzen oder löschen?`,
            vorschlag: "Status auf Rohdaten setzen (sicher); Löschen nur auf Wunsch",
          });
          continue;
        }
        if (b.titel === "Liegenschaft ohne Gebäude") {
          const lgId = b.betroffene.find((t) => t.art === "Liegenschaft")?.id;
          const lg = liegenschaften.find((l) => l.id === lgId);
          fragen.push({
            befundId: b.id,
            liegenschaft_id: lgId,
            frage: `Für „${lg?.name || lgId}" fehlt ein Gebäude. Soll „Hauptgebäude" mit Stammdaten angelegt werden?`,
            vorschlag: "create_gebaeude name=Hauptgebäude",
          });
          continue;
        }
        if (b.titel === "Liegenschaft ohne PM-Vertrag") {
          manuell.push({
            befundId: b.id,
            titel: b.titel,
            grund: "PM-Vertrag erfordert Vertragsdokument – nicht blind anlegen. Hinweis bleibt oder Upload.",
          });
          continue;
        }
        if (b.titel === "Wohnung ohne Flächenangabe") {
          manuell.push({
            befundId: b.id,
            titel: b.titel,
            grund: "Wohnfläche unbekannt – bitte m² nennen oder in der Wohnungsmaske nachtragen.",
          });
          continue;
        }
        if (b.titel === "Zuordnung wirkt unplausibel") {
          if (b.vorschlag) {
            auto_fix.push({
              befundId: b.id,
              aktion: "apply_pruef_befund",
              detail: b.beschreibung,
            });
          } else {
            manuell.push({
              befundId: b.id,
              titel: b.titel,
              grund: b.beschreibung + " – bitte Ziel-Zuordnung nennen.",
            });
          }
          continue;
        }
        manuell.push({
          befundId: b.id,
          titel: b.titel,
          grund: b.beschreibung,
        });
      }

      // Eindeutige leere Duplikate (kein Gebäude, Name ohne Hausnummer, gleiche Straße wie kanonische)
      for (const [, group] of byStreet) {
        if (group.length < 2) continue;
        const withHn = group.filter((l) => (l.hausnummer || "").trim());
        const without = group.filter((l) => !(l.hausnummer || "").trim());
        if (withHn.length === 1 && without.length >= 1) {
          const ziel = withHn[0];
          for (const q of without) {
            const hatGeb = gebaeude.some((g) => g.liegenschaftId === q.id);
            fragen.push({
              quelle_id: q.id,
              ziel_id: ziel.id,
              frage: `Duplikat „${q.name}" (ohne Hausnr.) neben „${ziel.name}" ${ziel.strasse} ${ziel.hausnummer}. Merge nach Ziel und leere Quelle löschen?`,
              vorschlag: hatGeb
                ? "merge_liegenschaften + quelle_loeschen"
                : "merge (leer) + löschen",
            });
          }
        }
      }

      // Test-/Müll-Liegenschaft "uzdu"
      const junk = liegenschaften.filter(
        (l) =>
          !l.strasse?.trim() &&
          !l.hausnummer?.trim() &&
          !l.plz?.trim() &&
          (l.name || "").length <= 6
      );
      for (const j of junk) {
        const hatGeb = gebaeude.some((g) => g.liegenschaftId === j.id);
        fragen.push({
          liegenschaft_id: j.id,
          frage: `Vermutlich Test-Liegenschaft „${j.name}" ohne Adresse${hatGeb ? " (hat Gebäude)" : ""}. Löschen?`,
          vorschlag: "delete_liegenschaft",
        });
      }

      return {
        laufId: lauf.id,
        zusammenfassung: {
          offen: offen.length,
          auto_fix: auto_fix.length,
          fragen: fragen.length,
          manuell: manuell.length,
        },
        auto_fix,
        fragen,
        manuell,
        hinweis:
          "Bei Bereinigung: zuerst execute_safe_cleanup für auto_fix; Fragen dem Nutzer stellen; nach Bestätigung create_gebaeude / merge / delete mit user_confirmed=true.",
      };
    }

    case "execute_safe_cleanup": {
      const laeufe = await pruefLaufDb.list();
      const lauf = laeufe.length
        ? [...laeufe].sort(
            (a, b) => new Date(b.gestartetAm).getTime() - new Date(a.gestartetAm).getTime()
          )[0]
        : null;
      const done: string[] = [];
      const skipped: string[] = [];

      // 1) Abrechnungen Fertig + Summe 0 → Rohdaten
      const abrechnungen = await listAbrechnungen();
      for (const a of abrechnungen) {
        if (a.status !== "Rohdaten" && (!a.gesamtSumme || a.gesamtSumme === 0)) {
          if (args.allow_delete_empty_abrechnungen) {
            await deleteAbrechnung(a.id);
            done.push(`Abrechnung „${a.name}" gelöscht`);
          } else {
            await updateAbrechnung(a.id, { status: "Rohdaten" } as any);
            done.push(`Abrechnung „${a.name}" → Status Rohdaten`);
          }
          if (lauf) {
            for (const b of lauf.befunde) {
              if (
                b.status === "offen" &&
                b.titel === "Abrechnung ohne Summe" &&
                b.betroffene.some((t) => t.id === a.id)
              ) {
                b.status = "uebernommen";
              }
            }
          }
        }
      }

      // 2) Befunde mit Vorschlag anwenden
      if (lauf) {
        for (const b of lauf.befunde) {
          if (b.status !== "offen" || !b.vorschlag) continue;
          const r = await wendeBefundAn(b);
          if (r.ok) {
            b.status = "uebernommen";
            done.push(`Befund „${b.titel}": ${r.meldung}`);
          } else {
            skipped.push(`Befund „${b.titel}": ${r.meldung}`);
          }
        }
        await pruefLaufDb.update(lauf.id, { befunde: lauf.befunde });
      }

      // 3) Gebäude anlegen wenn erlaubt
      if (args.allow_create_gebaeude) {
        const liegenschaften = await liegenschaftenDb.list();
        const gebaeude = await gebaeudeDb.list();
        const filterIds = Array.isArray(args.liegenschaft_ids_fuer_gebaeude)
          ? (args.liegenschaft_ids_fuer_gebaeude as string[])
          : null;
        for (const l of liegenschaften) {
          if (filterIds && !filterIds.includes(l.id)) continue;
          const hat = gebaeude.some((g) => g.liegenschaftId === l.id);
          if (hat) continue;
          const now = new Date().toISOString();
          const geb = await gebaeudeDb.create({
            id: uuidv4(),
            liegenschaftId: l.id,
            name: "Hauptgebäude",
            createdAt: now,
            updatedAt: now,
          });
          done.push(`Gebäude „Hauptgebäude" für „${l.name}" angelegt (${geb.id})`);
          if (lauf) {
            for (const b of lauf.befunde) {
              if (
                b.status === "offen" &&
                b.titel === "Liegenschaft ohne Gebäude" &&
                b.betroffene.some((t) => t.id === l.id)
              ) {
                b.status = "uebernommen";
              }
            }
          }
        }
        if (lauf) await pruefLaufDb.update(lauf.id, { befunde: lauf.befunde });
      } else {
        skipped.push(
          "Gebäude-Neuanlage übersprungen (allow_create_gebaeude nicht gesetzt) – Nutzer fragen."
        );
      }

      await logEvent(
        "aenderung",
        `Agent-Bereinigung: ${done.length} Aktion(en), ${skipped.length} übersprungen.`,
        { art: "PruefLauf", id: lauf?.id }
      );

      return {
        ok: true,
        ausgefuehrt: done,
        uebersprungen: skipped,
        naechster_schritt:
          "Optional run_pruefung erneut, um Restbefunde zu prüfen. Offene Fragen (Gebäude anlegen, Duplikate löschen) dem Nutzer stellen.",
      };
    }


    
    case "sync_mieter_from_mietvertraege": {
      const q = args.liegenschaft_query ? String(args.liegenschaft_query) : "";
      const nurLeere = args.nur_leere_felder !== false;
      const [vertraege, mieter, wohnungen, gebaeude, liegenschaften] = await Promise.all([
        mietvertraegeDb.list(),
        mieterDb.list(),
        wohnungenDb.list(),
        gebaeudeDb.list(),
        liegenschaftenDb.list(),
      ]);

      const wohnungById = new Map(wohnungen.map((w) => [w.id, w]));
      const gebById = new Map(gebaeude.map((g) => [g.id, g]));
      const lgById = new Map(liegenschaften.map((l) => [l.id, l]));

      function mieterInQuery(mi: typeof mieter[0]): boolean {
        if (!q) return true;
        const w = wohnungById.get(mi.wohnungId);
        const g = w ? gebById.get(w.gebaeudeId) : undefined;
        const lg = g ? lgById.get(g.liegenschaftId) : undefined;
        return matchesQuery(q, lg, mi.name);
      }

      const updates: {
        mieterId: string;
        mieterName: string;
        fromVertrag: string;
        patch: Record<string, string | number>;
      }[] = [];
      const skipped: string[] = [];

      for (const mv of vertraege) {
        if (mv.status === "Beendet") continue;
        let target = mv.mieterId ? mieter.find((x) => x.id === mv.mieterId) : undefined;
        if (!target && mv.wohnungId) {
          // Prefer mieter on same Wohnung without data, or any on Wohnung
          const candidates = mieter.filter((x) => x.wohnungId === mv.wohnungId);
          target =
            candidates.find((c) => !c.kaltmiete && !c.mietbeginn) ||
            candidates[0];
        }
        if (!target) {
          skipped.push(`${mv.dateiName}: kein Mieter verknüpft`);
          continue;
        }
        if (!mieterInQuery(target)) continue;

        const patch: Record<string, string | number> = {};
        if (mv.mietbeginn && (!nurLeere || !target.mietbeginn)) patch.mietbeginn = mv.mietbeginn;
        if (mv.mietende && (!nurLeere || !target.mietende)) patch.mietende = mv.mietende;
        if (typeof mv.sollMiete === "number" && mv.sollMiete > 0 && (!nurLeere || !target.kaltmiete)) {
          patch.kaltmiete = mv.sollMiete;
        }
        if (
          typeof mv.nebenkostenVorauszahlung === "number" &&
          mv.nebenkostenVorauszahlung >= 0 &&
          (!nurLeere || target.nebenkostenVorauszahlung === undefined || target.nebenkostenVorauszahlung === null)
        ) {
          patch.nebenkostenVorauszahlung = mv.nebenkostenVorauszahlung;
        }
        if (Object.keys(patch).length === 0) {
          skipped.push(`${target.name}: nichts zu übernehmen aus ${mv.dateiName}`);
          continue;
        }
        await mieterDb.update(target.id, patch as any);
        updates.push({
          mieterId: target.id,
          mieterName: target.name,
          fromVertrag: mv.dateiName || mv.nummer || mv.id,
          patch,
        });
      }

      await logEvent(
        "aenderung",
        `Agent: ${updates.length} Mieter aus Mietverträgen aktualisiert (Mietbeginn/Kaltmiete/NK).`,
        { art: "Mieter" }
      );

      return {
        ok: true,
        anzahl: updates.length,
        aktualisiert: updates.map((u) => ({
          mieter: u.mieterName,
          vertrag: u.fromVertrag,
          felder: u.patch,
        })),
        uebersprungen: skipped.slice(0, 20),
      };
    }

case "list_unpassende_dokumente": {
      const [ablage, laeufe, liegenschaften] = await Promise.all([
        ablageDb.list(),
        pruefLaufDb.list(),
        liegenschaftenDb.list(),
      ]);
      const lauf = laeufe.length
        ? [...laeufe].sort(
            (a, b) => new Date(b.gestartetAm).getTime() - new Date(a.gestartetAm).getTime()
          )[0]
        : null;
      const unplausibleIds = new Set(
        (lauf?.befunde || [])
          .filter((b) => b.status === "offen" && b.titel === "Zuordnung wirkt unplausibel")
          .flatMap((b) => b.betroffene.filter((t) => t.art === "Ablage").map((t) => t.id))
      );

      const ohneLiegenschaft = ablage.filter((d) => {
        const art = (d.zugeordnetAn?.art || "").toLowerCase();
        const isLg = art.includes("liegenschaft");
        const noAssign = !d.zugeordnetAn || d.status === "neu" || d.status === "in_pruefung";
        return noAssign || !isLg;
      });

      const unplausibel = ablage.filter((d) => unplausibleIds.has(d.id));

      const mapDoc = (d: (typeof ablage)[0], grund: string) => ({
        id: d.id,
        dateiName: d.dateiName,
        status: d.status,
        erkannterTyp: d.erkannterTyp,
        zugeordnetAn: d.zugeordnetAn
          ? `${d.zugeordnetAn.art}: ${d.zugeordnetAn.label}`
          : "(keine Zuordnung)",
        grund,
      });

      const result: ReturnType<typeof mapDoc>[] = [];
      const seen = new Set<string>();
      for (const d of unplausibel) {
        seen.add(d.id);
        const befund = lauf?.befunde.find(
          (b) => b.betroffene.some((t) => t.id === d.id) && b.titel === "Zuordnung wirkt unplausibel"
        );
        result.push(mapDoc(d, befund?.beschreibung || "Zuordnung unplausibel laut Prüfung"));
      }
      if (!args.nur_ohne_liegenschaft) {
        for (const d of ohneLiegenschaft) {
          if (seen.has(d.id)) continue;
          seen.add(d.id);
          result.push(
            mapDoc(
              d,
              d.zugeordnetAn
                ? `Zugeordnet an ${d.zugeordnetAn.art} „${d.zugeordnetAn.label}" – keine Liegenschaft`
                : "Keine Zuordnung"
            )
          );
        }
      } else {
        for (const d of ablage.filter((x) => !x.zugeordnetAn || x.status === "neu" || x.status === "in_pruefung")) {
          if (seen.has(d.id)) continue;
          seen.add(d.id);
          result.push(mapDoc(d, "Ohne Zuordnung / in Prüfung"));
        }
      }

      return {
        anzahl: result.length,
        liegenschaftenBekannt: liegenschaften.map(
          (l) => `${l.name}: ${l.strasse} ${l.hausnummer}, ${l.plz} ${l.ort}`
        ),
        dokumente: result,
      };
    }

    case "list_ablage": {
      const docs = await ablageDb.list();
      const statusFilter = String(args.status || "").toLowerCase();
      const typFilter = String(args.erkannter_typ || "").toLowerCase();
      const limit = Math.min(Number(args.limit) || 30, 80);
      let filtered = docs;
      if (statusFilter === "offen") {
        filtered = filtered.filter((d) => d.status === "neu" || d.status === "in_pruefung");
      } else if (statusFilter) {
        filtered = filtered.filter((d) => d.status === statusFilter);
      }
      if (typFilter) {
        filtered = filtered.filter((d) => (d.erkannterTyp || "").toLowerCase().includes(typFilter));
      }
      filtered = [...filtered].sort(
        (a, b) => new Date(b.hochgeladenAm).getTime() - new Date(a.hochgeladenAm).getTime()
      );
      return {
        anzahl: filtered.length,
        link: "/ablage",
        dokumente: filtered.slice(0, limit).map((d) => ({
          id: d.id,
          dateiName: d.dateiName,
          status: d.status,
          erkannterTyp: d.erkannterTyp,
          konfidenz: d.konfidenz,
          zugeordnetAn: d.zugeordnetAn
            ? `${d.zugeordnetAn.art}: ${d.zugeordnetAn.label}`
            : null,
          hochgeladenAm: d.hochgeladenAm,
        })),
      };
    }

    case "list_mietvertraege": {
      const [vertraege, mieterAll, wohnungenAll] = await Promise.all([
        mietvertraegeDb.list(),
        mieterDb.list(),
        wohnungenDb.list(),
      ]);
      const q = String(args.query || "").toLowerCase();
      let list = vertraege;
      if (args.ohne_mieter) list = list.filter((v) => !v.mieterId);
      if (args.ohne_wohnung) list = list.filter((v) => !v.wohnungId || !wohnungenAll.some((w) => w.id === v.wohnungId));
      if (q) {
        list = list.filter(
          (v) =>
            (v.dateiName || "").toLowerCase().includes(q) ||
            (v.nummer || "").toLowerCase().includes(q)
        );
      }
      return {
        anzahl: list.length,
        link: "/mietvertraege",
        mietvertraege: list.slice(0, 40).map((v) => {
          const m = mieterAll.find((x) => x.id === v.mieterId);
          const w = wohnungenAll.find((x) => x.id === v.wohnungId);
          return {
            id: v.id,
            dateiName: v.dateiName,
            status: v.status,
            mieter: m?.name || null,
            mieterId: v.mieterId || null,
            wohnung: w?.bezeichnung || null,
            wohnungId: v.wohnungId || null,
            sollMiete: v.sollMiete,
            mietbeginn: v.mietbeginn,
            nebenkostenVorauszahlung: v.nebenkostenVorauszahlung,
          };
        }),
      };
    }

    case "reassign_mietvertrag": {
      const mvId = String(args.mietvertrag_id || "");
      const wohnungId = String(args.wohnung_id || "");
      const mieterId = args.mieter_id ? String(args.mieter_id) : undefined;
      const sync = args.sync_mieter_stammdaten !== false;
      const mv = await mietvertraegeDb.get(mvId);
      if (!mv) return { error: `Mietvertrag ${mvId} nicht gefunden` };
      const wohnung = await wohnungenDb.get(wohnungId);
      if (!wohnung) return { error: `Wohnung ${wohnungId} nicht gefunden` };
      if (mieterId) {
        const m = await mieterDb.get(mieterId);
        if (!m) return { error: `Mieter ${mieterId} nicht gefunden` };
      }
      const patch: Record<string, unknown> = { wohnungId };
      if (mieterId) patch.mieterId = mieterId;
      const updated = await mietvertraegeDb.update(mvId, patch as any);
      let mieterPatch: Record<string, unknown> | null = null;
      const targetMieterId = mieterId || mv.mieterId;
      if (sync && targetMieterId) {
        mieterPatch = { wohnungId };
        if (mv.sollMiete) mieterPatch.kaltmiete = mv.sollMiete;
        if (mv.nebenkostenVorauszahlung != null)
          mieterPatch.nebenkostenVorauszahlung = mv.nebenkostenVorauszahlung;
        if (mv.mietbeginn) mieterPatch.mietbeginn = mv.mietbeginn;
        if (mv.mietende) mieterPatch.mietende = mv.mietende;
        await mieterDb.update(targetMieterId, mieterPatch as any);
      }
      await logEvent(
        "aenderung",
        `Agent: Mietvertrag „${mv.dateiName}" neu zugeordnet (Wohnung ${wohnung.bezeichnung}${mieterId ? ", Mieter gesetzt" : ""}).`,
        { art: "Mietvertrag", id: mvId }
      );
      return {
        ok: true,
        mietvertrag: updated,
        mieterAktualisiert: mieterPatch,
        hinweis: "Zuordnung gespeichert. UI: /mietvertraege",
      };
    }

    default:
      return { error: `Unbekanntes Tool: ${name}` };
  }
}

// -------- Agent-Loop --------

const AGENT_SYSTEM = `Du bist "BetriebsKostenBot Agent" – ein Handlungs-Assistent in einer deutschen Hausverwaltungs-App.
Du kannst Tools aufrufen für: Schriftverkehr (Mahnungen, Anschreiben) UND vollständige Stammdaten-Bereinigung nach der Plausibilitätsprüfung.

## Module der Plausibilitätsprüfung (nichts auslassen)
liegenschaften · gebaeude · wohnungen · mieter · mietvertraege · pmVertraege · eigentuemer · abrechnungen · kontoauszuege · ablage

## Bereinigungs-Workflow (wenn Nutzer Fehler/Hinweise korrigieren will)
1. get_pruef_befunde laden (oder run_pruefung wenn keiner existiert).
2. analyze_and_plan_cleanup – Überblick.
3. Wenn der Nutzer EXPLIZIT sagt „lege die fehlenden Gebäude an" / „Gebäude anlegen" / „beseitige die Probleme":
   → execute_safe_cleanup mit allow_create_gebaeude=true SOFORT (keine erneute Rückfrage).
4. Sonst zweifelsfreie Fixes mit execute_safe_cleanup (ohne allow_*): Abrechnung Fertig+0€ → Rohdaten; Befunde mit vorschlag anwenden.
5. Wenn Nutzer „zeig mir Dokumente die zu keiner Liegenschaft passen" / „unpassende Dokumente" sagt:
   → list_unpassende_dokumente und die Liste klar auf Deutsch ausgeben (Dateiname, aktuelle Zuordnung, Grund).
6. Wenn der Nutzer eine Wohnfläche nennt (z.B. „alle 77 m²“): update_wohnung / Batch auf alle Wohnungen ohne Fläche – keine erneute Rückfrage.
7. Wenn der Nutzer Liegenschaften ohne PM-Vertrag zum Löschen freigibt: löschen (leere/Duplikate). Nicht löschen, wenn noch echte Wohnungen/Mieter dranhängen – dann melden.
8. PM-Verträge und Wohnflächen NICHT erfinden, wenn der Nutzer keine Zahl/Freigabe genannt hat.
9. Am Ende kurz: was erledigt, was offen.

## Schriftverkehr-Workflow
1. Mieter/Rückstände finden (find_mieter, get_mietrueckstaende).
2. Briefe nur auf klaren Auftrag (create_brief / create_briefe_batch).
3. Mahnungen nur bei positivem Rückstand, template_id „mahnung".

## Regeln
- Keine IDs/Beträge erfinden – nur Tool-Ergebnisse.
- Löschen und Neu-Anlegen von Objekten nur mit Nutzer-Bestätigung (außer execute_safe_cleanup ohne create/delete-Flags).
- Lücken schließen, wenn die Info zweifelsfrei ist (z.B. Status-Korrektur, vorhandener vorschlag).
- Antworte nach Tools in klarem Deutsch, strukturiert, ohne JSON-Dump.
- Keine Rechtsberatung jenseits der Vorlagen.`;

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
  const steps: AgentResult["steps"] = [];
  const createdBriefIds: string[] = [];

  // Bei klarem Bereinigungsauftrag: deterministisch ausführen (zuverlässig, kein Timeout)
  const det = await tryDeterministicCleanup(params.message);
  if (det) return det;

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
      const completion = await createChatCompletion({
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
    const cleanupFallback = await tryDeterministicCleanup(params.message);
    if (cleanupFallback) {
      return {
        reply:
          cleanupFallback.reply +
          (e?.message ? `\n\n(Hinweis: LLM-Agent-Loop abgebrochen: ${e.message})` : ""),
        steps: cleanupFallback.steps,
        createdBriefIds: [],
      };
    }
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


/** Deterministische Bereinigung ohne LLM-Tool-Loop (Fallback + bei klarem Auftrag). */
async function tryDeterministicCleanup(message: string): Promise<AgentResult | null> {
  const m = message
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue");

  // --- Fläche: 77 m² / 77 qm / 77m2 / "wohnungen ... 77" ---
  const flaecheMatch =
    m.match(/(\d+(?:[.,]\d+)?)\s*(?:m\s*[²2]|qm|quadratmeter)/i) ||
    m.match(/(?:flaeche|fläche|wohnflaeche|wohnfläche)\s*(?:ist|sind|von|auf|=|:)?\s*(\d+(?:[.,]\d+)?)/i) ||
    m.match(/(?:alle|jeweils|je|pro\s+wohnung)\s+(\d+(?:[.,]\d+)?)/i) ||
    (/\bwohnung/.test(m) ? m.match(/\b(\d{2,3})(?:\s|$)/) : null);
  const flaecheWert = flaecheMatch ? parseFloat(flaecheMatch[1].replace(",", ".")) : NaN;
  const wantsFlaeche =
    Number.isFinite(flaecheWert) &&
    flaecheWert >= 10 &&
    flaecheWert <= 500 &&
    (/\b(wohnung|flaeche|fläche|m\s*[²2]|qm|stammdaten|aktualis)/i.test(m) ||
      /\b(setz|eintrag|hinterleg)\w*/.test(m));

  // --- Löschen ---
  const wantsDeleteLiegenschaften =
    /\b(loesch|entfernen)\w*/.test(m) &&
    /\b(liegenschaft)/.test(m);

  const wantsDeleteOhnePm =
    wantsDeleteLiegenschaften ||
    (/\b(loesch|entfernen|weg|koennen|soll)\w*/.test(m) &&
      /\b(ohne\s+pm|pm[- ]?vertrag)/.test(m));

  // "ohne Gebäude", leere, Duplikate
  const wantsDeleteOhneGebaeude =
    /\b(loesch|entfernen)\w*/.test(m) &&
    /\b(ohne\s+geb(ae|ä)ude|kein\s+geb(ae|ä)ude|leere?\s+liegenschaft|duplikat)/.test(m);

  // Expliziter Force: trotzdem / force / !!!! / "bitte löschen" nach Ablehnung
  const forceDelete =
    /\b(trotzdem|force|erzwungen|unbedingt|wirklich|sofort)\b/.test(m) ||
    /!{2,}/.test(message) ||
    (/\b(bitte)\b/.test(m) && /\b(loesch|entfernen)\w*/.test(m) && /\b(liegenschaft)/.test(m));

  const wantsAnyDelete =
    wantsDeleteLiegenschaften ||
    wantsDeleteOhnePm ||
    wantsDeleteOhneGebaeude ||
    (forceDelete && /\b(liegenschaft)/.test(m));

  const wantsCleanup =
    /\b(beseitig|beheb|berein|korrigier|fix)\w*/.test(m) ||
    (/\b(hinweise?|fehler|probleme?|befunde?)\b/.test(m) &&
      /\b(beheb|beseitig|berein|korrigier|fix)\w*/.test(m));

  const wantsDocs = /\b(unpassend|keine[r]?\s+liegenschaft)\b/.test(m);

  // Hausnummer-Korrektur: "hausnummer ... falsch" / "alle haben 16"
  const wantsFixHausnummer =
    /\b(hausnummer|hausnr)\b/.test(m) &&
    /\b(falsch|korrigier|richtig|alle\s+haben|ueberall|überall)\b/.test(m);

  // Mieter-Stammdaten aus Mietvertrag (Mietbeginn, Kaltmiete, NK)
  const wantsMieterSync =
    (/\b(mieter|stammdaten)\b/.test(m) &&
      /\b(aktualis|sync|uebernehm|übernehm|pfleg|fuell|füll|mietbeginn|kaltmiete|mietzins|nebenkosten|nk)\w*/.test(
        m
      )) ||
    (/\b(mietbeginn|kaltmiete|mietzins|nk[- ]?voraus)\b/.test(m) &&
      /\b(setz|aktualis|uebernehm|übernehm|alle|mieter)\w*/.test(m)) ||
    (/\b(mietvertrag|mietvertraege)\b/.test(m) &&
      /\b(mieter|stammdaten|uebernehm|übernehm)\b/.test(m));

  if (
    !wantsCleanup &&
    !wantsDocs &&
    !wantsFlaeche &&
    !wantsAnyDelete &&
    !wantsFixHausnummer &&
    !wantsMieterSync
  ) {
    return null;
  }

  const steps: AgentResult["steps"] = [];
  const lines: string[] = [];

  // 1) Wohnflächen
  if (wantsFlaeche) {
    const wohnungen = await wohnungenDb.list();
    const targets = wohnungen.filter((w) => !w.flaeche || w.flaeche <= 0);
    const updatedNames: string[] = [];
    for (const w of targets) {
      await wohnungenDb.update(w.id, { flaeche: flaecheWert });
      updatedNames.push(`${w.bezeichnung} → ${flaecheWert} m²`);
    }
    const laeufe = await pruefLaufDb.list();
    if (laeufe.length) {
      const lauf = [...laeufe].sort(
        (a, b) => new Date(b.gestartetAm).getTime() - new Date(a.gestartetAm).getTime()
      )[0];
      for (const b of lauf.befunde) {
        if (b.status === "offen" && b.titel === "Wohnung ohne Flächenangabe") {
          b.status = "uebernommen";
        }
      }
      await pruefLaufDb.update(lauf.id, { befunde: lauf.befunde });
    }
    await logEvent(
      "aenderung",
      `Agent: ${updatedNames.length} Wohnung(en) auf ${flaecheWert} m² gesetzt.`,
      { art: "Wohnung" }
    );
    steps.push({
      tool: "update_wohnung_batch_flaeche",
      args: { flaeche: flaecheWert },
      result: { updated: updatedNames },
    });
    lines.push(`**Wohnflächen gesetzt (${updatedNames.length} × ${flaecheWert} m²):**`);
    for (const n of updatedNames) lines.push(`• ${n}`);
    if (!updatedNames.length) lines.push("• Keine Wohnung ohne Fläche – nichts zu tun.");
  }

  // 2) Liegenschaften löschen (leer / ohne PM / ohne Gebäude / Duplikate)
  if (wantsAnyDelete) {
    const [liegenschaften, pm, gebaeude, eigentuemer, wohnungen, mieter] = await Promise.all([
      liegenschaftenDb.list(),
      pmVertraegeDb.list(),
      gebaeudeDb.list(),
      eigentuemerDb.list(),
      wohnungenDb.list(),
      mieterDb.list(),
    ]);

    function score(l: (typeof liegenschaften)[0]) {
      const gebs = gebaeude.filter((g) => g.liegenschaftId === l.id);
      const gebIds = gebs.map((g) => g.id);
      const wohns = wohnungen.filter((w) => gebIds.includes(w.gebaeudeId));
      const miet = mieter.filter((mi) => wohns.some((w) => w.id === mi.wohnungId));
      const hasPm = pm.some((p) => p.liegenschaftId === l.id);
      return {
        gebs,
        gebIds,
        wohns,
        miet,
        hasPm,
        hasMieter: miet.length > 0,
        hasGebaeude: gebs.length > 0,
        points: gebs.length * 10 + wohns.length * 3 + miet.length * 5 + (hasPm ? 2 : 0),
      };
    }

    // Name normalisieren für Duplikat-Gruppen
    function normName(n: string) {
      return (n || "")
        .toLowerCase()
        .replace(/ß/g, "ss")
        .replace(/ä/g, "ae")
        .replace(/ö/g, "oe")
        .replace(/ü/g, "ue")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
    }

    // Query aus Nachricht (Straßenname)
    let nameQuery = "";
    const strMatch = message.match(
      /([A-ZÄÖÜ][a-zäöüßA-ZÄÖÜ\-]+(?:straße|strasse|str\.?|weg|platz|allee)[^\s,]*(?:\s*\d+)?)/i
    );
    if (strMatch) nameQuery = normName(strMatch[1]);
    if (!nameQuery) {
      const gorch = message.match(/gorch[\s\-]*fock/i);
      if (gorch) nameQuery = "gorch fock";
    }

    const byName = new Map<string, typeof liegenschaften>();
    for (const l of liegenschaften) {
      const key = normName(l.name || l.strasse || l.id);
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key)!.push(l);
    }

    const toDelete = new Set<string>();
    const behalten: string[] = [];
    const geloescht: string[] = [];

    // a) Duplikat-Gruppen: behalte die „reichste“, lösche leere Geschwister
    for (const [key, group] of byName) {
      if (group.length < 2) continue;
      if (nameQuery && !key.includes(nameQuery) && !nameQuery.includes(key.split(" ")[0] || "")) {
        // wenn Nutzer konkreten Namen nennt, nur diese Gruppe
        if (nameQuery.length > 3 && !key.includes(nameQuery.slice(0, 8))) continue;
      }
      const ranked = group
        .map((l) => ({ l, s: score(l) }))
        .sort((a, b) => b.s.points - a.s.points);
      const keep = ranked[0];
      for (const r of ranked.slice(1)) {
        // Leeres Geschwister (kein Mieter) → löschen
        if (!r.s.hasMieter) {
          toDelete.add(r.l.id);
        } else if (forceDelete && !r.s.hasGebaeude) {
          toDelete.add(r.l.id);
        } else {
          behalten.push(
            `„${r.l.name}" (${r.l.id.slice(0, 8)}…) behalten – hat ${r.s.miet.length} Mieter / ${r.s.gebs.length} Gebäude (Kanone: ${keep.l.id.slice(0, 8)}…)`
          );
        }
      }
    }

    // b) Ohne Gebäude (wenn angefragt oder force)
    if (wantsDeleteOhneGebaeude || wantsDeleteOhnePm || forceDelete || wantsDeleteLiegenschaften) {
      for (const l of liegenschaften) {
        if (toDelete.has(l.id)) continue;
        const s = score(l);
        if (s.hasGebaeude) continue;
        if (nameQuery) {
          const key = normName(l.name || l.strasse || "");
          if (!key.includes(nameQuery) && !nameQuery.split(" ").every((w) => key.includes(w))) {
            continue;
          }
        }
        // Ohne Gebäude und ohne Mieter → immer löschen bei Löschauftrag
        if (!s.hasMieter) {
          toDelete.add(l.id);
        } else if (forceDelete) {
          // Force: auch mit „hängenden“ Mietern ohne Gebäude (Dateninkonsistenz)
          toDelete.add(l.id);
        } else {
          behalten.push(`„${l.name}" behalten – hat Mieter, aber kein Gebäude (force mit „trotzdem löschen“).`);
        }
      }
    }

    // c) Ohne PM und ohne Mieter (klassisch)
    if (wantsDeleteOhnePm || wantsDeleteLiegenschaften) {
      for (const l of liegenschaften) {
        if (toDelete.has(l.id)) continue;
        const s = score(l);
        if (s.hasPm) continue;
        if (s.hasMieter && !forceDelete) {
          behalten.push(`„${l.name}" behalten – hat Mieter (kein PM).`);
          continue;
        }
        if (!s.hasMieter || forceDelete) toDelete.add(l.id);
      }
    }

    // Ausführen
    for (const id of toDelete) {
      const l = liegenschaften.find((x) => x.id === id);
      if (!l) continue;
      const s = score(l);
      // PM an dieser leeren LG entfernen
      for (const p of pm.filter((x) => x.liegenschaftId === l.id)) {
        await pmVertraegeDb.remove(p.id);
      }
      for (const mi of s.miet) await mieterDb.remove(mi.id);
      for (const w of s.wohns) await wohnungenDb.remove(w.id);
      for (const g of s.gebs) await gebaeudeDb.remove(g.id);
      for (const e of eigentuemer.filter((x) => x.liegenschaftId === l.id)) {
        await eigentuemerDb.remove(e.id);
      }
      await liegenschaftenDb.remove(l.id);
      geloescht.push(
        `${l.name} [${l.id.slice(0, 8)}…] (Gebäude:${s.gebs.length} Mieter:${s.miet.length} PM:${s.hasPm ? "ja" : "nein"})`
      );
    }

    // Befunde markieren
    const laeufe = await pruefLaufDb.list();
    if (laeufe.length) {
      const lauf = [...laeufe].sort(
        (a, b) => new Date(b.gestartetAm).getTime() - new Date(a.gestartetAm).getTime()
      )[0];
      const remaining = new Set((await liegenschaftenDb.list()).map((x) => x.id));
      for (const b of lauf.befunde) {
        if (b.status !== "offen") continue;
        if (
          b.titel === "Liegenschaft ohne PM-Vertrag" ||
          b.titel === "Liegenschaft ohne Gebäude"
        ) {
          if (!b.betroffene.some((t) => remaining.has(t.id))) b.status = "uebernommen";
        }
      }
      await pruefLaufDb.update(lauf.id, { befunde: lauf.befunde });
    }

    await logEvent(
      "loeschung",
      `Agent: ${geloescht.length} Liegenschaft(en) gelöscht${forceDelete ? " (force)" : ""}: ${geloescht.join("; ") || "–"}`,
      { art: "Liegenschaft" }
    );
    steps.push({
      tool: "delete_liegenschaften",
      args: { force: forceDelete, nameQuery },
      result: { geloescht, behalten },
    });
    lines.push("");
    lines.push(`**Liegenschaften gelöscht (${geloescht.length})${forceDelete ? " [force]" : ""}:**`);
    for (const n of geloescht) lines.push(`• ${n}`);
    if (!geloescht.length) {
      lines.push("• Keine passende leere/Duplikat-Liegenschaft gefunden.");
      lines.push('→ Bei hartnäckigen Duplikaten: „Lösche leere Gorch-Fock-Straße trotzdem“');
    }
    for (const b of behalten) lines.push(`• ${b}`);
  }

  // 3) Hausnummer aus Name ableiten (z.B. Name "Spannhagengartenstraße 10" → hausnummer 10)
  if (wantsFixHausnummer || wantsCleanup) {
    const liegenschaften = await liegenschaftenDb.list();
    const fixed: string[] = [];
    for (const l of liegenschaften) {
      // Hausnummer am Ende des Namens: "... 10" oder "...12"
      const fromName = (l.name || "").match(/(\d+[a-zA-Z]?)\s*$/);
      const fromStrasse = (l.strasse || "").match(/(\d+[a-zA-Z]?)\s*$/);
      const expected = fromName?.[1] || fromStrasse?.[1];
      if (!expected) continue;
      // Wenn alle fälschlich dieselbe Nr. haben oder Name eine andere Nr. trägt
      if ((l.hausnummer || "").trim() !== expected) {
        const newName = (l.name || "").replace(/\s+\d+[a-zA-Z]?\s*$/, "").trim() || l.name;
        const newStrasse = (l.strasse || "")
          .replace(/\s+\d+[a-zA-Z]?\s*$/, "")
          .trim() || l.strasse;
        await liegenschaftenDb.update(l.id, {
          hausnummer: expected,
          name: /\d/.test(l.name || "") ? l.name : `${newName} ${expected}`.trim(),
          strasse: newStrasse,
        } as any);
        fixed.push(`„${l.name}" → Hausnr. ${expected}`);
      }
    }
    if (fixed.length) {
      await logEvent("aenderung", `Agent: Hausnummern korrigiert (${fixed.length}).`, {
        art: "Liegenschaft",
      });
      steps.push({ tool: "fix_hausnummern", args: {}, result: { fixed } });
      lines.push("");
      lines.push(`**Hausnummern korrigiert (${fixed.length}):**`);
      for (const f of fixed) lines.push(`• ${f}`);
    }
  }

  // 4) Safe cleanup buildings if requested
  if (wantsCleanup) {
    const allowGebaeude =
      /\b(gebäude|gebaeude)\b/.test(m) &&
      /\b(anlegen|leg[e]?\s+.*an|fehlend)\b/.test(m);
    const cleanupResult = (await executeTool("execute_safe_cleanup", {
      allow_create_gebaeude: allowGebaeude,
    })) as any;
    steps.push({
      tool: "execute_safe_cleanup",
      args: { allow_create_gebaeude: allowGebaeude },
      result: cleanupResult,
    });
    if (Array.isArray(cleanupResult?.ausgefuehrt) && cleanupResult.ausgefuehrt.length) {
      lines.push("");
      lines.push("**Weitere Korrekturen:**");
      for (const a of cleanupResult.ausgefuehrt) lines.push(`• ${a}`);
    }
  }


  // Mieter aus Mietverträgen
  if (wantsMieterSync) {
    // Straße/Query aus Nachricht ziehen
    let query = "";
    const fuer = message.match(
      /\b(?:in|fuer|für|der|die)\s+([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß\s\d.-]{3,40})/i
    );
    if (fuer) query = fuer[1].replace(/[?.!,]+$/, "").trim();
    if (!query) {
      const str = message.match(
        /([A-ZÄÖÜ][a-zäöüß]+(?:straße|strasse|str\.?|weg|platz)[^\s,]*(?:\s*\d+)?)/i
      );
      if (str) query = str[1];
    }
    const sync = (await executeTool("sync_mieter_from_mietvertraege", {
      liegenschaft_query: query || undefined,
      nur_leere_felder: true,
    })) as any;
    steps.push({
      tool: "sync_mieter_from_mietvertraege",
      args: { liegenschaft_query: query },
      result: sync,
    });
    lines.push("");
    lines.push(`**Mieter aus Mietverträgen aktualisiert (${sync?.anzahl || 0}):**`);
    for (const u of sync?.aktualisiert || []) {
      const felder = Object.entries(u.felder || {})
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");
      lines.push(`• ${u.mieter} ← ${u.vertrag}: ${felder}`);
    }
    if (!(sync?.anzahl > 0)) {
      lines.push(
        "• Keine übernehmbaren Werte gefunden (Mietverträge ohne sollMiete/mietbeginn oder Felder bereits gesetzt)."
      );
    }
  }

  // 5) Restbefunde
  const befunde = (await executeTool("get_pruef_befunde", { nur_offen: true })) as any;
  steps.push({ tool: "get_pruef_befunde", args: { nur_offen: true }, result: befunde });
  if (befunde?.anzahl > 0) {
    lines.push("");
    lines.push(`**Noch offen (${befunde.anzahl}):**`);
    const byTitel = new Map<string, number>();
    for (const b of befunde.befunde || []) {
      byTitel.set(b.titel, (byTitel.get(b.titel) || 0) + 1);
    }
    for (const [t, n] of byTitel) lines.push(`• ${t}: ${n}`);
    if (byTitel.has("Wohnung ohne Flächenangabe")) {
      lines.push('→ Schreibe z.B.: „Setze alle Wohnflächen auf 77 m²“');
    }
    if (byTitel.has("Liegenschaft ohne PM-Vertrag")) {
      lines.push('→ Schreibe z.B.: „Lösche die Liegenschaften ohne PM-Vertrag“');
    }
  } else if (befunde && !befunde.hinweis) {
    lines.push("");
    lines.push("**Keine offenen Prüfbefunde mehr.**");
  }

  if (!lines.length) return null;
  return { reply: lines.join("\n"), steps, createdBriefIds: [] };
}

/** Erkennung, ob eine Chat-Nachricht einen Agenten-Workflow auslösen soll */
export function isAgentIntent(message: string): boolean {
  const m = message
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue");

  if (
    /\b(lieber\s+agent|server[- ]?agent|als\s+agent)\b/.test(m) ||
    /\b(beseitige|behebe|beheben|bereinige|bereinigen|korrigiere|korrigieren)\b/.test(m) ||
    /\b(lege\s+.*\s*(gebäude|gebaeude)\s*an|fehlende[n]?\s+(gebäude|gebaeude)\s*anlegen)\b/.test(m) ||
    (/\b(probleme?|hinweise?|fehler|befunde?)\b/.test(m) &&
      /\b(beseitig|beheb|berein|korrigier|fix|schliess)\w*/.test(m))
  ) {
    return true;
  }

  // Fläche
  if (
    /\d+\s*(?:m\s*[²2]|qm)/.test(m) ||
    (/\b(wohnung|flaeche|fläche)\b/.test(m) &&
      /\b(aktualis|setz|eintrag|stammdaten|\d{2,3})\b/.test(m))
  ) {
    return true;
  }

  // Löschen Liegenschaften
  if (/\b(loesch|lösch|entfernen)\w*/.test(m) && /\b(liegenschaft|pm[- ]?vertrag|duplikat)\b/.test(m)) {
    return true;
  }
  if (
    /\b(liegenschaft)/.test(m) &&
    /\b(ohne\s+pm|pm[- ]?vertrag)/.test(m) &&
    /\b(geloescht|loeschen|löschen|koennen|können)\b/.test(m)
  ) {
    return true;
  }

  if (
    /\b(loesch|entfernen)\w*/.test(m) &&
    /\b(liegenschaft|pm[- ]?vertrag|duplikat|geb(ae|ä)ude|leere?)\b/.test(m)
  ) {
    return true;
  }
  if (/\b(trotzdem|force)\b/.test(m) && /\b(loesch|entfernen|liegenschaft)\w*/.test(m)) {
    return true;
  }

  // Hausnummer
  if (/\b(hausnummer|hausnr)\b/.test(m) && /\b(falsch|korrigier|richtig|alle)\b/.test(m)) {
    return true;
  }

  if (
    /\b(dokumente?|rechnungen?|ablage)\b/.test(m) &&
    /\b(keine[r]?\s+liegenschaft|unpassend|ohne\s+zuordnung)\b/.test(m)
  ) {
    return true;
  }

  // Mieter-Stammdaten aus Vertrag
  if (
    (/\b(mieter|stammdaten)\b/.test(m) &&
      /\b(aktualis|sync|uebernehm|pfleg|mietbeginn|kaltmiete|mietzins|nebenkosten)\w*/.test(m)) ||
    (/\b(mietbeginn|kaltmiete|mietzins)\b/.test(m) && /\b(alle|mieter|setz|aktualis)\w*/.test(m))
  ) {
    return true;
  }

  const pureQuestion =
    /^(was|wer|wie\s+hoch|wieviel|wie\s+viele|welche|wo|warum|erklaere|erkläre|wann|wie\s+lange)\b/.test(
      m
    ) &&
    !/\b(erstell|generier|schreib|leg\s+an|anlegen|fertig|mach|korrigier|berein|beheb|fix|loesch|lösch|beseitig|aktualis)\w*/.test(
      m
    );
  if (pureQuestion) return false;

  const wantsCreate =
    /\b(erstell|generier|schreib|versend|leg\s+an|anlegen|mach|fertig|anfertig|ausfertig)\w*/.test(
      m
    );
  const documentHint =
    /\b(mahnung|mahnungen|mahnliste|mahnlauf|anschreiben|kuendigung|kündigung|abmahnung|mieterhoehung|mieterhöhung|brief|briefe|schreiben)\b/.test(
      m
    );

  return (
    (wantsCreate && documentHint) ||
    (documentHint && /\b(alle|noetig|nötig|offen)\b/.test(m))
  );
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
