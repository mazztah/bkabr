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
import { deleteStoredFile } from "./storage";
import {
  cascadeDeleteLiegenschaft,
  cascadeDeleteGebaeude,
  cascadeDeleteWohnung,
  cascadeDeleteMieter,
  beendePmVertrag,
} from "./cascade-delete";

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
      name: "list_abrechnungen",
      description:
        "Listet Rechnungen/Abrechnungen (Belege). Filter optional nach Name, Firma, Liegenschaft, Status, Adresse. Vor dem Löschen nutzen, um IDs zu finden. 'Rechnung' und 'Abrechnung' meinen denselben Datensatz.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Freitext: Name, Firma, Adresse, Rechnungsnummer, Liegenschaft",
          },
          status: {
            type: "string",
            description: "Optional: Rohdaten|Validierung|Fertig",
          },
          limit: {
            type: "number",
            description: "Max. Treffer (Default 30)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_abrechnung",
      description:
        "Löscht eine oder mehrere Rechnungen/Abrechnungen (Belege im Modul Rechnungen). Suche per abrechnung_id, query (Name/Firma/Adresse) oder abrechnung_ids. Bei mehreren Treffer ohne eindeutige ID: Liste zurückgeben. Erfordert user_confirmed=true zum endgültigen Löschen. Nach Nutzer-Bestätigung ('ja', 'lösche', 'endgültig') sofort mit user_confirmed=true erneut aufrufen.",
      parameters: {
        type: "object",
        properties: {
          abrechnung_id: { type: "string", description: "Einzel-ID" },
          abrechnung_ids: {
            type: "array",
            items: { type: "string" },
            description: "Mehrere IDs auf einmal löschen",
          },
          query: {
            type: "string",
            description: "Name, Firma, Adresse oder Teilstring wenn ID unbekannt",
          },
          user_confirmed: {
            type: "boolean",
            description: "Muss true sein zum endgültigen Löschen, sonst needsConfirmation",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_ablage_zuordnung",
      description:
        "Ändert den Ablageort/die Zuordnung eines Dokuments. Suche per ablage_id oder datei_name; Ziel per ziel_id oder ziel_liegenschaft_query (Straße/Name).",
      parameters: {
        type: "object",
        properties: {
          ablage_id: { type: "string" },
          datei_name: { type: "string", description: "Teilstring Dateiname, wenn ID unbekannt" },
          ziel_art: {
            type: "string",
            description: "Standard: Liegenschaft. Auch PM-Vertrag, Eigentümer, …",
          },
          ziel_id: { type: "string" },
          ziel_label: { type: "string" },
          ziel_liegenschaft_query: {
            type: "string",
            description: "Straße/Name der Ziel-Liegenschaft, wenn ziel_id unbekannt",
          },
        },
        required: [],
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
        "Übernimmt aus vorhandenen Mietverträgen Mietbeginn, Mietende, Kaltmiete (sollMiete) und NK-Vorauszahlung in die Mieter-Stammdaten. Filter nach Liegenschaft/Straße ODER nach Mieternamen (z.B. „Yvonne Paul“). Zahlen werden auch aus Strings gelesen. Verknüpft Verträge ohne mieterId automatisch, wenn auf der Wohnung genau ein Mieter sitzt.",
      parameters: {
        type: "object",
        properties: {
          liegenschaft_query: {
            type: "string",
            description: "Optional: Straße/Name z.B. Spannhagengartenstraße 10 ODER Mietername „Yvonne Paul“",
          },
          mieter_name: {
            type: "string",
            description: "Optional: konkreter Mietername (Teilstring, z.B. Paul oder Yvonne Paul)",
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
      name: "update_mieter",
      description:
        "Setzt Stammdaten eines Mieters direkt (kaltmiete, nebenkostenVorauszahlung, mietbeginn, mietende, name, email, telefon, wohnungId). Nutzen wenn der Nutzer konkrete Werte vorgibt oder sync aus dem Vertrag nicht greift.",
      parameters: {
        type: "object",
        properties: {
          mieter_id: { type: "string", description: "Mieter-ID (aus find_mieter)" },
          mieter_name: {
            type: "string",
            description: "Alternativ Name suchen, wenn ID unbekannt (erster Treffer)",
          },
          kaltmiete: { type: "number" },
          nebenkostenVorauszahlung: { type: "number" },
          mietbeginn: { type: "string", description: "ISO-Datum YYYY-MM-DD bevorzugt" },
          mietende: { type: "string" },
          name: { type: "string" },
          email: { type: "string" },
          telefon: { type: "string" },
          wohnung_id: { type: "string" },
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
  {
    type: "function",
    function: {
      name: "delete_mietvertrag",
      description:
        "Löscht einen Mietvertrag endgültig. Erfordert user_confirmed=true. Vor dem Löschen list_mietvertraege nutzen, um die ID zu finden. Der zugehörige Mieter bleibt erhalten.",
      parameters: {
        type: "object",
        properties: {
          mietvertrag_id: { type: "string", description: "ID des zu löschenden Mietvertrags" },
          mietvertrag_query: {
            type: "string",
            description: "Alternativ Suche in Dateiname/Nummer, wenn ID unbekannt",
          },
          user_confirmed: {
            type: "boolean",
            description: "Muss true sein, sonst wird nur nach Bestätigung gefragt",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_mieter",
      description:
        "Löscht einen Mieter-Stammdatensatz. Erfordert user_confirmed=true. Optional verknüpfte Mietverträge mitlöschen (delete_vertraege=true).",
      parameters: {
        type: "object",
        properties: {
          mieter_id: { type: "string" },
          mieter_name: { type: "string", description: "Name suchen, wenn ID unbekannt" },
          delete_vertraege: {
            type: "boolean",
            description: "Wenn true, auch Mietverträge dieses Mieters löschen",
          },
          user_confirmed: { type: "boolean" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_ablage_dokument",
      description:
        "Löscht ein Dokument aus der Ablage (und die gespeicherte Datei). Erfordert user_confirmed=true. Suche per ablage_id oder datei_name.",
      parameters: {
        type: "object",
        properties: {
          ablage_id: { type: "string" },
          datei_name: { type: "string", description: "Teilstring des Dateinamens" },
          user_confirmed: { type: "boolean" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_gebaeude",
      description: "Löscht ein Gebäude kaskadiert (Wohnungen, Mieter, Mietverträge). user_confirmed=true erforderlich.",
      parameters: {
        type: "object",
        properties: {
          gebaeude_id: { type: "string" },
          user_confirmed: { type: "boolean" },
        },
        required: ["gebaeude_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_wohnung",
      description: "Löscht eine Wohnung kaskadiert (Mieter, Mietverträge). user_confirmed=true erforderlich.",
      parameters: {
        type: "object",
        properties: {
          wohnung_id: { type: "string" },
          user_confirmed: { type: "boolean" },
        },
        required: ["wohnung_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "beende_pm_vertrag",
      description:
        "Beendet einen PM-Vertrag (Status Beendet) und setzt die zugehörige Liegenschaft auf inaktiv – sie fällt aus Analysen/Prüfung heraus. user_confirmed=true.",
      parameters: {
        type: "object",
        properties: {
          pm_vertrag_id: { type: "string" },
          liegenschaft_query: { type: "string", description: "Falls ID unbekannt: Straße/Name" },
          user_confirmed: { type: "boolean" },
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
      const cascade = args.cascade !== false;
      if (!args.user_confirmed) {
        return {
          needsConfirmation: true,
          frage: cascade
            ? `Liegenschaft „${lg.name}" inkl. aller Gebäude, Wohnungen, Mieter, Mietverträge, PM-Verträge endgültig löschen?`
            : `Leere Liegenschaft „${lg.name}" löschen?`,
          liegenschaft_id: id,
          cascade,
        };
      }
      if (cascade) {
        const result = await cascadeDeleteLiegenschaft(id);
        if (!result.ok) return { error: result.error };
        return { ok: true, cascade: true, report: result.report, name: result.name };
      }
      await liegenschaftenDb.remove(id);
      await logEvent("loeschung", `Liegenschaft „${lg.name}" gelöscht.`, { art: "Liegenschaft", id });
      return { ok: true, cascade: false, name: lg.name };
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

    case "list_abrechnungen": {
      const q = String(args.query || "").trim().toLowerCase();
      const statusFilter = args.status ? String(args.status).trim() : "";
      const limit = Math.min(Math.max(Number(args.limit) || 30, 1), 100);
      let list = await listAbrechnungen();
      if (statusFilter) {
        list = list.filter((a) => String(a.status || "").toLowerCase() === statusFilter.toLowerCase());
      }
      if (q) {
        list = list.filter((a) => {
          const hay = [
            a.name,
            a.adresse,
            a.nummer,
            a.zeitraum,
            a.status,
            a.mieterName,
            a.vermieterName,
            (a as any).firma,
            (a as any).rechnungsnummer,
            a.liegenschaftId,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return hay.includes(q) || q.split(/\s+/).every((p) => hay.includes(p));
        });
      }
      const items = list.slice(0, limit).map((a) => ({
        id: a.id,
        name: a.name,
        adresse: a.adresse,
        zeitraum: a.zeitraum,
        gesamtSumme: a.gesamtSumme,
        status: a.status,
        nummer: a.nummer,
        liegenschaftId: a.liegenschaftId,
        updatedAt: a.updatedAt,
      }));
      return { anzahl: list.length, gezeigt: items.length, items };
    }

    case "delete_abrechnung": {
      const list = await listAbrechnungen();
      const ids: string[] = [];
      if (Array.isArray(args.abrechnung_ids)) {
        for (const x of args.abrechnung_ids) {
          if (x) ids.push(String(x));
        }
      }
      if (args.abrechnung_id) ids.push(String(args.abrechnung_id));

      // Suche per query (Name/Firma/Adresse), wenn keine ID
      if (ids.length === 0 && args.query) {
        const q = String(args.query).trim().toLowerCase();
        const treffer = list.filter((a) => {
          const hay = [
            a.name,
            a.adresse,
            a.nummer,
            a.mieterName,
            (a as any).firma,
            (a as any).rechnungsnummer,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return hay.includes(q) || q.split(/\s+/).every((p) => p && hay.includes(p));
        });
        if (treffer.length === 0) {
          return { error: `Keine Rechnung/Abrechnung zu „${args.query}" gefunden. list_abrechnungen nutzen.` };
        }
        if (treffer.length > 1 && !args.user_confirmed) {
          return {
            error: "Mehrere Treffer – bitte abrechnung_id wählen oder alle bestätigen",
            treffer: treffer.slice(0, 20).map((a) => ({
              id: a.id,
              name: a.name,
              adresse: a.adresse,
              gesamtSumme: a.gesamtSumme,
              status: a.status,
            })),
          };
        }
        ids.push(...treffer.map((a) => a.id));
      }

      if (ids.length === 0) {
        return { error: "abrechnung_id, abrechnung_ids oder query erforderlich" };
      }

      const uniqueIds = [...new Set(ids)];
      const targets = uniqueIds
        .map((id) => list.find((a) => a.id === id))
        .filter(Boolean) as Awaited<ReturnType<typeof listAbrechnungen>>;

      if (targets.length === 0) {
        return { error: "Rechnung/Abrechnung nicht gefunden" };
      }

      if (!args.user_confirmed) {
        if (targets.length === 1) {
          const a = targets[0];
          return {
            needsConfirmation: true,
            frage: `Rechnung/Abrechnung „${a.name}" (${a.gesamtSumme ?? "?"} €, Status ${a.status}, ${a.adresse || "ohne Adresse"}) wirklich endgültig löschen?`,
            abrechnung_id: a.id,
            abrechnung_ids: [a.id],
          };
        }
        const sum = targets.reduce((s, a) => s + (Number(a.gesamtSumme) || 0), 0);
        return {
          needsConfirmation: true,
          frage: `${targets.length} Rechnungen/Abrechnungen (Summe ca. ${sum} €) wirklich endgültig löschen?`,
          abrechnung_ids: targets.map((a) => a.id),
          treffer: targets.slice(0, 15).map((a) => ({
            id: a.id,
            name: a.name,
            gesamtSumme: a.gesamtSumme,
            status: a.status,
          })),
        };
      }

      const geloescht: { id: string; name: string }[] = [];
      const fehlgeschlagen: string[] = [];
      for (const a of targets) {
        const ok = await deleteAbrechnung(a.id);
        if (ok) {
          geloescht.push({ id: a.id, name: a.name });
          await logEvent("loeschung", `Rechnung/Abrechnung „${a.name}" (${a.id}) vom Agent gelöscht.`, {
            art: "Abrechnung",
            id: a.id,
          });
        } else {
          fehlgeschlagen.push(a.id);
        }
      }
      return {
        ok: true,
        anzahl: geloescht.length,
        geloescht,
        fehlgeschlagen: fehlgeschlagen.length ? fehlgeschlagen : undefined,
      };
    }

    case "update_ablage_zuordnung": {
      let id = args.ablage_id ? String(args.ablage_id) : "";
      if (!id && args.datei_name) {
        const q = String(args.datei_name).toLowerCase();
        const list = await ablageDb.list();
        const treffer = list.filter((d) => (d.dateiName || "").toLowerCase().includes(q));
        if (treffer.length === 0) return { error: `Kein Ablage-Dokument „${args.datei_name}"` };
        if (treffer.length > 1) {
          return {
            error: "Mehrere Dokumente – bitte ablage_id wählen",
            treffer: treffer.map((d) => ({ id: d.id, dateiName: d.dateiName, status: d.status })),
          };
        }
        id = treffer[0].id;
      }
      if (!id) return { error: "ablage_id oder datei_name erforderlich" };
      const doc = await ablageDb.get(id);
      if (!doc) return { error: "Ablage-Dokument nicht gefunden" };

      let zielArt = args.ziel_art ? String(args.ziel_art) : "Liegenschaft";
      let zielId = args.ziel_id ? String(args.ziel_id) : "";
      let zielLabel = args.ziel_label ? String(args.ziel_label) : "";

      if (!zielId && args.ziel_liegenschaft_query) {
        const q = String(args.ziel_liegenschaft_query);
        const lgs = await liegenschaftenDb.list();
        const treffer = lgs.filter((l) => matchesQuery(q, l));
        if (treffer.length === 0) return { error: `Keine Liegenschaft zu „${q}"` };
        if (treffer.length > 1) {
          return {
            error: "Mehrere Liegenschaften – bitte ziel_id wählen",
            treffer: treffer.map((l) => ({
              id: l.id,
              name: l.name,
              nummer: l.nummer,
              adresse: `${l.strasse} ${l.hausnummer}`,
            })),
          };
        }
        zielArt = "Liegenschaft";
        zielId = treffer[0].id;
        zielLabel = treffer[0].name;
      }
      if (!zielId || !zielLabel) {
        return { error: "ziel_id+ziel_label oder ziel_liegenschaft_query erforderlich" };
      }

      const alt = doc.zugeordnetAn?.label;
      const updated = await ablageDb.update(id, {
        zugeordnetAn: {
          art: zielArt as any,
          id: zielId,
          label: zielLabel,
        },
        status: "zugeordnet",
      });
      await logEvent(
        "zuordnung",
        `Ablage „${doc.dateiName}" vom Agent umgehängt: „${alt || "—"}" → „${zielLabel}".`,
        { art: "Ablage", id }
      );
      return {
        ok: true,
        dateiName: doc.dateiName,
        alt: alt || null,
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
      const nameFilter = args.mieter_name ? String(args.mieter_name).trim().toLowerCase() : "";
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

      const asPos = (v: unknown): number | undefined => {
        if (v == null || v === "") return undefined;
        const n = typeof v === "number" ? v : Number(String(v).replace(/\s/g, "").replace(",", "."));
        return Number.isFinite(n) && n > 0 ? n : undefined;
      };
      const asNonNeg = (v: unknown): number | undefined => {
        if (v == null || v === "") return undefined;
        const n = typeof v === "number" ? v : Number(String(v).replace(/\s/g, "").replace(",", "."));
        return Number.isFinite(n) && n >= 0 ? n : undefined;
      };
      const hasTxt = (v: unknown) =>
        typeof v === "string" ? v.trim().length > 0 : v != null && String(v).trim().length > 0;

      function mieterInQuery(mi: (typeof mieter)[0]): boolean {
        if (nameFilter) {
          const n = (mi.name || "").toLowerCase();
          if (!n.includes(nameFilter) && !nameFilter.split(/\s+/).every((t) => n.includes(t))) {
            return false;
          }
        }
        if (!q) return true;
        const w = wohnungById.get(mi.wohnungId);
        const g = w ? gebById.get(w.gebaeudeId) : undefined;
        const lg = g ? lgById.get(g.liegenschaftId) : undefined;
        return matchesQuery(q, lg, mi.name);
      }

      function findTargetForVertrag(mv: (typeof vertraege)[0]) {
        if (mv.mieterId) {
          const byId = mieter.find((x) => x.id === mv.mieterId);
          if (byId) return byId;
        }
        if (mv.wohnungId) {
          const candidates = mieter.filter((x) => x.wohnungId === mv.wohnungId);
          if (candidates.length === 1) return candidates[0];
          if (nameFilter) {
            const byName = candidates.find((c) => c.name.toLowerCase().includes(nameFilter));
            if (byName) return byName;
          }
          return (
            candidates.find((c) => !asPos(c.kaltmiete) && !hasTxt(c.mietbeginn)) || candidates[0]
          );
        }
        return undefined;
      }

      function nkFromMv(mv: (typeof vertraege)[0]): number | undefined {
        const d = asNonNeg(mv.nebenkostenVorauszahlung);
        if (d != null) return d;
        const bk = asNonNeg(mv.bkVorauszahlung) ?? 0;
        const hk = asNonNeg(mv.hkVorauszahlung) ?? 0;
        if (bk + hk > 0) return bk + hk;
        const warm = asPos(mv.warmmiete);
        const kalt = asPos(mv.sollMiete);
        if (warm != null && kalt != null && warm > kalt) return Math.round((warm - kalt) * 100) / 100;
        return undefined;
      }

      const updates: {
        mieterId: string;
        mieterName: string;
        fromVertrag: string;
        patch: Record<string, string | number>;
      }[] = [];
      const skipped: string[] = [];
      const diagnostik: string[] = [];

      for (const mv of vertraege) {
        if (mv.status === "Beendet") continue;
        const target = findTargetForVertrag(mv);
        if (!target) {
          skipped.push(`${mv.dateiName || mv.id}: kein Mieter verknüpft (wohnungId=${mv.wohnungId || "–"})`);
          continue;
        }
        if (!mieterInQuery(target)) continue;

        // Fehlende mieterId nachziehen, wenn eindeutig
        if (!mv.mieterId && target.id) {
          await mietvertraegeDb.update(mv.id, { mieterId: target.id } as any);
        }

        const patch: Record<string, string | number> = {};
        const soll = asPos(mv.sollMiete);
        const nk = nkFromMv(mv);
        if (hasTxt(mv.mietbeginn) && (!nurLeere || !hasTxt(target.mietbeginn))) {
          patch.mietbeginn = String(mv.mietbeginn).trim();
        }
        if (hasTxt(mv.mietende) && (!nurLeere || !hasTxt(target.mietende))) {
          patch.mietende = String(mv.mietende).trim();
        }
        if (soll != null && (!nurLeere || asPos(target.kaltmiete) == null)) {
          patch.kaltmiete = soll;
        }
        if (
          nk != null &&
          (!nurLeere || asNonNeg(target.nebenkostenVorauszahlung) == null)
        ) {
          patch.nebenkostenVorauszahlung = nk;
        }

        if (Object.keys(patch).length === 0) {
          diagnostik.push(
            `${target.name} ← ${mv.dateiName || mv.id}: nichts zu übernehmen ` +
              `(Vertrag: sollMiete=${mv.sollMiete ?? "–"} mietbeginn=${mv.mietbeginn || "–"} NK=${mv.nebenkostenVorauszahlung ?? "–"}; ` +
              `Mieter: kaltmiete=${target.kaltmiete ?? "–"} mietbeginn=${target.mietbeginn || "–"} NK=${target.nebenkostenVorauszahlung ?? "–"})`
          );
          skipped.push(`${target.name}: nichts zu übernehmen aus ${mv.dateiName || mv.id}`);
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

      // Falls per Name gefiltert und kein Vertrag gefunden: klare Meldung
      if (nameFilter && updates.length === 0) {
        const treffer = mieter.filter((m) => m.name.toLowerCase().includes(nameFilter));
        for (const t of treffer) {
          const mvs = vertraege.filter(
            (mv) => mv.mieterId === t.id || mv.wohnungId === t.wohnungId
          );
          diagnostik.push(
            `Mieter „${t.name}" (id=${t.id}): ${mvs.length} Vertrag(e) auf Wohnung/ID; ` +
              `Stammdaten kaltmiete=${t.kaltmiete ?? "–"} mietbeginn=${t.mietbeginn || "–"} NK=${t.nebenkostenVorauszahlung ?? "–"}`
          );
        }
        if (!treffer.length) {
          diagnostik.push(`Kein Mieter mit Namen enthaltend „${nameFilter}" gefunden.`);
        }
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
          mieterId: u.mieterId,
          vertrag: u.fromVertrag,
          felder: u.patch,
        })),
        uebersprungen: skipped.slice(0, 30),
        diagnostik: diagnostik.slice(0, 30),
        hinweis:
          updates.length === 0
            ? "Keine Werte übernommen. Siehe diagnostik. Ggf. update_mieter mit konkreten Werten nutzen oder Mietvertrag unter /mietvertraege zuordnen."
            : undefined,
      };
    }

    case "update_mieter": {
      const nameQ = args.mieter_name ? String(args.mieter_name).trim().toLowerCase() : "";
      let id = args.mieter_id ? String(args.mieter_id) : "";
      if (!id && nameQ) {
        const alle = await mieterDb.list();
        const treffer = alle.filter((m) => m.name.toLowerCase().includes(nameQ));
        if (treffer.length === 0) return { error: `Kein Mieter mit Namen „${args.mieter_name}" gefunden` };
        if (treffer.length > 1) {
          return {
            error: `Mehrere Mieter gefunden – bitte mieter_id angeben`,
            treffer: treffer.map((m) => ({ id: m.id, name: m.name, wohnungId: m.wohnungId })),
          };
        }
        id = treffer[0].id;
      }
      if (!id) return { error: "mieter_id oder mieter_name erforderlich" };
      const existing = await mieterDb.get(id);
      if (!existing) return { error: `Mieter ${id} nicht gefunden` };

      const asPos = (v: unknown): number | undefined => {
        if (v == null || v === "") return undefined;
        const n = typeof v === "number" ? v : Number(String(v).replace(/\s/g, "").replace(",", "."));
        return Number.isFinite(n) && n > 0 ? n : undefined;
      };
      const asNonNeg = (v: unknown): number | undefined => {
        if (v == null || v === "") return undefined;
        const n = typeof v === "number" ? v : Number(String(v).replace(/\s/g, "").replace(",", "."));
        return Number.isFinite(n) && n >= 0 ? n : undefined;
      };

      const patch: Record<string, string | number> = {};
      if (args.kaltmiete != null) {
        const n = asPos(args.kaltmiete);
        if (n != null) patch.kaltmiete = n;
      }
      if (args.nebenkostenVorauszahlung != null) {
        const n = asNonNeg(args.nebenkostenVorauszahlung);
        if (n != null) patch.nebenkostenVorauszahlung = n;
      }
      if (args.mietbeginn != null && String(args.mietbeginn).trim()) {
        patch.mietbeginn = String(args.mietbeginn).trim();
      }
      if (args.mietende != null && String(args.mietende).trim()) {
        patch.mietende = String(args.mietende).trim();
      }
      if (args.name != null && String(args.name).trim()) patch.name = String(args.name).trim();
      if (args.email != null) patch.email = String(args.email);
      if (args.telefon != null) patch.telefon = String(args.telefon);
      if (args.wohnung_id != null && String(args.wohnung_id).trim()) {
        patch.wohnungId = String(args.wohnung_id).trim();
      }

      if (Object.keys(patch).length === 0) {
        return {
          error: "Keine gültigen Felder zum Setzen",
          aktuell: {
            name: existing.name,
            kaltmiete: existing.kaltmiete,
            nebenkostenVorauszahlung: existing.nebenkostenVorauszahlung,
            mietbeginn: existing.mietbeginn,
            mietende: existing.mietende,
          },
        };
      }

      const updated = await mieterDb.update(id, patch as any);
      await logEvent(
        "aenderung",
        `Agent: Mieter „${existing.name}" aktualisiert (${Object.keys(patch).join(", ")}).`,
        { art: "Mieter", id }
      );
      return { ok: true, mieter: updated, patch };
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

    case "delete_mietvertrag": {
      let id = args.mietvertrag_id ? String(args.mietvertrag_id) : "";
      if (!id && args.mietvertrag_query) {
        const q = String(args.mietvertrag_query).toLowerCase();
        const list = await mietvertraegeDb.list();
        const treffer = list.filter(
          (v) =>
            (v.dateiName || "").toLowerCase().includes(q) ||
            (v.nummer || "").toLowerCase().includes(q)
        );
        if (treffer.length === 0) return { error: `Kein Mietvertrag zu „${args.mietvertrag_query}"` };
        if (treffer.length > 1) {
          return {
            error: "Mehrere Treffer – bitte mietvertrag_id wählen",
            treffer: treffer.map((v) => ({ id: v.id, dateiName: v.dateiName, nummer: v.nummer })),
          };
        }
        id = treffer[0].id;
      }
      if (!id) return { error: "mietvertrag_id oder mietvertrag_query erforderlich" };
      const mv = await mietvertraegeDb.get(id);
      if (!mv) return { error: `Mietvertrag ${id} nicht gefunden` };
      if (!args.user_confirmed) {
        return {
          needsConfirmation: true,
          frage: `Mietvertrag „${mv.dateiName}"${mv.nummer ? ` (${mv.nummer})` : ""} wirklich endgültig löschen? Der zugehörige Mieter bleibt erhalten.`,
          mietvertrag_id: id,
        };
      }
      const ok = await mietvertraegeDb.remove(id);
      if (!ok) return { error: "Löschen fehlgeschlagen" };
      await logEvent("loeschung", `Agent: Mietvertrag „${mv.dateiName}" gelöscht.`, {
        art: "Mietvertrag",
        id,
      });
      return {
        ok: true,
        geloescht: { id, dateiName: mv.dateiName, nummer: mv.nummer },
        hinweis: "Mietvertrag gelöscht. Mieter-Stammdaten unverändert.",
      };
    }

    case "delete_mieter": {
      let id = args.mieter_id ? String(args.mieter_id) : "";
      if (!id && args.mieter_name) {
        const q = String(args.mieter_name).toLowerCase();
        const list = await mieterDb.list();
        const treffer = list.filter((m) => m.name.toLowerCase().includes(q));
        if (treffer.length === 0) return { error: `Kein Mieter „${args.mieter_name}"` };
        if (treffer.length > 1) {
          return {
            error: "Mehrere Mieter – bitte mieter_id wählen",
            treffer: treffer.map((m) => ({ id: m.id, name: m.name, nummer: m.nummer })),
          };
        }
        id = treffer[0].id;
      }
      if (!id) return { error: "mieter_id oder mieter_name erforderlich" };
      const m = await mieterDb.get(id);
      if (!m) return { error: `Mieter ${id} nicht gefunden` };
      if (!args.user_confirmed) {
        return {
          needsConfirmation: true,
          frage: `Mieter „${m.name}"${m.nummer ? ` (Nr. ${m.nummer})` : ""} wirklich löschen${
            args.delete_vertraege !== false ? " inklusive verknüpfter Mietverträge" : ""
          }?`,
          mieter_id: id,
        };
      }
      const result = await cascadeDeleteMieter(id, args.delete_vertraege !== false);
      if (!result.ok) return { error: result.error };
      return { ok: true, report: result.report, name: result.name };
    }

    case "delete_ablage_dokument": {
      let id = args.ablage_id ? String(args.ablage_id) : "";
      if (!id && args.datei_name) {
        const q = String(args.datei_name).toLowerCase();
        const list = await ablageDb.list();
        const treffer = list.filter((d) => (d.dateiName || "").toLowerCase().includes(q));
        if (treffer.length === 0) return { error: `Kein Ablage-Dokument „${args.datei_name}"` };
        if (treffer.length > 1) {
          return {
            error: "Mehrere Treffer – bitte ablage_id wählen",
            treffer: treffer.map((d) => ({
              id: d.id,
              dateiName: d.dateiName,
              status: d.status,
              zugeordnetAn: d.zugeordnetAn?.label,
            })),
          };
        }
        id = treffer[0].id;
      }
      if (!id) return { error: "ablage_id oder datei_name erforderlich" };
      const doc = await ablageDb.get(id);
      if (!doc) return { error: `Ablage-Dokument ${id} nicht gefunden` };
      if (!args.user_confirmed) {
        return {
          needsConfirmation: true,
          frage: `Ablage-Dokument „${doc.dateiName}" wirklich endgültig löschen (Datei + Eintrag)?`,
          ablage_id: id,
        };
      }
      if (doc.storedFileName) {
        try {
          await deleteStoredFile(doc.storedFileName);
        } catch {
          /* ignore */
        }
      }
      await ablageDb.remove(id);
      await logEvent("loeschung", `Agent: Ablage „${doc.dateiName}" gelöscht.`, {
        art: "Ablage",
        id,
      });
      return { ok: true, geloescht: { id, dateiName: doc.dateiName } };
    }


    case "delete_gebaeude": {
      const id = String(args.gebaeude_id || "");
      const g = await gebaeudeDb.get(id);
      if (!g) return { error: "Gebäude nicht gefunden" };
      if (!args.user_confirmed) {
        return {
          needsConfirmation: true,
          frage: `Gebäude „${g.name}" inkl. Wohnungen und Mieter löschen?`,
          gebaeude_id: id,
        };
      }
      const result = await cascadeDeleteGebaeude(id);
      if (!result.ok) return { error: result.error };
      return { ok: true, report: result.report, name: result.name };
    }

    case "delete_wohnung": {
      const id = String(args.wohnung_id || "");
      const w = await wohnungenDb.get(id);
      if (!w) return { error: "Wohnung nicht gefunden" };
      if (!args.user_confirmed) {
        return {
          needsConfirmation: true,
          frage: `Wohnung „${w.bezeichnung}" inkl. Mieter und Mietverträge löschen?`,
          wohnung_id: id,
        };
      }
      const result = await cascadeDeleteWohnung(id);
      if (!result.ok) return { error: result.error };
      return { ok: true, report: result.report, name: result.name };
    }

    case "beende_pm_vertrag": {
      let id = args.pm_vertrag_id ? String(args.pm_vertrag_id) : "";
      if (!id && args.liegenschaft_query) {
        const q = String(args.liegenschaft_query);
        const [pms, lgs] = await Promise.all([pmVertraegeDb.list(), liegenschaftenDb.list()]);
        const lgIds = new Set(lgs.filter((l) => matchesQuery(q, l)).map((l) => l.id));
        const treffer = pms.filter((p) => lgIds.has(p.liegenschaftId) && p.status !== "Beendet");
        if (treffer.length === 0) return { error: `Kein aktiver PM-Vertrag zu „${q}"` };
        if (treffer.length > 1) {
          return {
            error: "Mehrere PM-Verträge – pm_vertrag_id wählen",
            treffer: treffer.map((p) => ({
              id: p.id,
              verwalter: p.verwalterName,
              dateiName: p.dateiName,
              status: p.status,
            })),
          };
        }
        id = treffer[0].id;
      }
      if (!id) return { error: "pm_vertrag_id oder liegenschaft_query erforderlich" };
      const pm = await pmVertraegeDb.get(id);
      if (!pm) return { error: "PM-Vertrag nicht gefunden" };
      if (!args.user_confirmed) {
        return {
          needsConfirmation: true,
          frage: `PM-Vertrag „${pm.verwalterName || pm.dateiName}" beenden und Liegenschaft auf inaktiv setzen?`,
          pm_vertrag_id: id,
        };
      }
      const result = await beendePmVertrag(id);
      if (!result.ok) return { error: result.error };
      return { ...result, ok: true };
    }

    default:
      return { error: `Unbekanntes Tool: ${name}` };
  }
}

// -------- Agent-Loop --------

const AGENT_SYSTEM = `Du bist "BetriebsKostenBot Agent" – ein Handlungs-Assistent in einer deutschen Hausverwaltungs-App.
Du hast Schreibrechte über Tools (Datenbank-Updates). Behaupte NIEMALS, du könntest Stammdaten nicht speichern oder hättest keine Schreibrechte.

## Wichtige Tools (Stammdaten)
- sync_mieter_from_mietvertraege – übernimmt Kaltmiete, NK, Mietbeginn/Ende aus verknüpften Mietverträgen in die Mieter-Stammdaten. Parameter mieter_name oder liegenschaft_query. Bei „Stammdaten nachtragen/Mietbeginn nachpflegen“ SOFORT aufrufen.
- update_mieter – setzt Stammdaten eines Mieters direkt (kaltmiete, mietbeginn, NK, …) per ID oder Name.
- reassign_mietvertrag – Wohnung/Mieter eines Vertrags neu setzen + optional Stammdaten sync.
- delete_mietvertrag – Mietvertrag löschen (user_confirmed=true; ID oder Query).
- delete_mieter – Mieter löschen (user_confirmed; optional delete_vertraege).
- delete_ablage_dokument – Ablage-Datei löschen (user_confirmed; ID oder datei_name).
- delete_liegenschaft – ganze Liegenschaft löschen (user_confirmed / force bei Abhängigkeiten).
- list_abrechnungen – Rechnungen/Abrechnungen (Belege) auflisten; Filter query/status.
- delete_abrechnung – Rechnung/Abrechnung löschen (ID, query oder abrechnung_ids; user_confirmed=true). „Lösche die Rechnung X“ → list_abrechnungen oder direkt delete_abrechnung mit query.
- update_ablage_zuordnung – Ablageort ändern (datei_name + ziel_liegenschaft_query möglich).
- delete_gebaeude / delete_wohnung / delete_liegenschaft (cascade) – Hierarchie kaskadiert löschen.
- beende_pm_vertrag – PM beenden → Liegenschaft inaktiv (raus aus Analysen).
- Löschen immer erst mit needsConfirmation fragen, dann user_confirmed=true ausführen, wenn der Nutzer klar bestätigt („ja“, „lösche“, „endgültig“, „ja bitte“, „mach das“). Bestätigung aus dem Chat-Verlauf erkennen und Tool erneut mit user_confirmed=true aufrufen – nicht erneut nur fragen.
- list_mietvertraege / list_ablage / list_unpassende_dokumente / list_abrechnungen – Übersicht.
- get_pruef_befunde / run_pruefung / execute_safe_cleanup – Prüfbefunde.

## Module der Plausibilitätsprüfung
system · liegenschaften · gebaeude · wohnungen · mieter · mietvertraege · pmVertraege · eigentuemer · abrechnungen · kontoauszuege · ablage

## Bereinigungs-Workflow
1. get_pruef_befunde (oder run_pruefung).
2. „Stammdaten nachtragen“ / fehlende Kaltmiete/NK/Mietbeginn → sync_mieter_from_mietvertraege (ggf. pro Liegenschaft).
3. Explizit Gebäude anlegen → execute_safe_cleanup allow_create_gebaeude=true.
4. Unpassende Dokumente → list_unpassende_dokumente / list_ablage.
5. Wohnfläche mit Zahl → Batch update_wohnung.
6. Am Ende: was erledigt, was offen (z.B. Mieter ohne Mietvertrag brauchen Upload).

## Schriftverkehr
find_mieter / get_mietrueckstaende / create_brief – Mahnungen nur bei positivem Rückstand.

## Regeln
- Tools nutzen, nicht ablehnen. Keine erfundenen Beträge.
- Löschen nur mit klarer Nutzer-Freigabe.
- Antworten auf Deutsch, kurz und strukturiert.`;

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
      /\b(aktualis|sync|uebernehm|übernehm|pfleg|fuell|füll|nachtrag|ergaenz|ergänz|vervollstaend|vervollständig|fehlend|mietbeginn|kaltmiete|mietzins|nebenkosten|nk)\w*/.test(
        m
      )) ||
    (/\b(mietbeginn|kaltmiete|mietzins|nk[- ]?voraus)\b/.test(m) &&
      /\b(setz|aktualis|uebernehm|übernehm|alle|mieter)\w*/.test(m)) ||
    (/\b(mietvertrag|mietvertraege)\b/.test(m) &&
      /\b(mieter|stammdaten|uebernehm|übernehm)\b/.test(m)) ||
    // „erstmal die stammdaten nachtragen“ / „stammdaten bitte“
    (/\bstammdaten\b/.test(m) &&
      /\b(nachtrag|ergaenz|ergänz|pfleg|fuell|füll|aktualis|uebernehm|übernehm|bitte|erstmal)\w*/.test(m));

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
    // Straße/Query und optionaler Mietername aus Nachricht
    let query = "";
    let mieterName = "";
    const nameMatch = message.match(
      /\b(?:mieter(?:in|s)?|von|fuer|für)\s+([A-ZÄÖÜ][a-zäöüß]+(?:\s+[A-ZÄÖÜ][a-zäöüß]+)+)/
    );
    if (nameMatch) mieterName = nameMatch[1].trim();
    // „Yvonne Paul“ / „Paul“ in freier Formulierung
    if (!mieterName) {
      const freeName = message.match(
        /\b([A-ZÄÖÜ][a-zäöüß]{2,}\s+[A-ZÄÖÜ][a-zäöüß]{2,})\b/
      );
      if (freeName && !/(Straße|Weg|Platz|Str\.)/i.test(freeName[1])) {
        mieterName = freeName[1].trim();
      }
    }
    const fuer = message.match(
      /\b(?:in|der|die)\s+([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß\s\d.-]{3,40})/i
    );
    if (fuer) query = fuer[1].replace(/[?.!,]+$/, "").trim();
    if (!query) {
      const str = message.match(
        /([A-ZÄÖÜ][a-zäöüß]+(?:straße|strasse|str\.?|weg|platz)[^\s,]*(?:\s*\d+)?)/i
      );
      if (str) query = str[1];
    }
    // Wenn die Query wie ein Personenname aussieht und wir keinen mieterName haben → als Name nutzen
    if (query && !mieterName && !/(straße|strasse|str\.|weg|platz|\d)/i.test(query)) {
      mieterName = query;
      query = "";
    }
    const sync = (await executeTool("sync_mieter_from_mietvertraege", {
      liegenschaft_query: query || undefined,
      mieter_name: mieterName || undefined,
      nur_leere_felder: true,
    })) as any;
    steps.push({
      tool: "sync_mieter_from_mietvertraege",
      args: { liegenschaft_query: query, mieter_name: mieterName },
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
        "• Keine übernehmbaren Werte gefunden (Mietverträge ohne sollMiete/mietbeginn, ohne Mieter-Verknüpfung, oder Felder bereits gesetzt)."
      );
      if (Array.isArray(sync?.diagnostik) && sync.diagnostik.length) {
        lines.push("• Diagnose:");
        for (const d of sync.diagnostik.slice(0, 8)) lines.push(`  – ${d}`);
      }
      lines.push(
        "• Tipp: Unter /mietvertraege Verträge mit „Neu zuordnen“ an Wohnung+Mieter hängen, oder konkrete Werte mit update_mieter setzen."
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

  // Löschen: Liegenschaften, Rechnungen/Abrechnungen, Belege, Mieter, Verträge, Ablage, Gebäude
  if (
    /\b(loesch|lösch|entfernen|entferne|remove)\w*/.test(m) &&
    /\b(liegenschaft|pm[- ]?vertrag|duplikat|rechnung|rechnungen|abrechnung|abrechnungen|beleg|belege|mieter|mietvertrag|mietvertraege|ablage|dokument|geb(ae|ä)ude|wohnung)\b/.test(
      m
    )
  ) {
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
  if (/\b(trotzdem|force)\b/.test(m) && /\b(loesch|entfernen|liegenschaft|rechnung|abrechnung)\w*/.test(m)) {
    return true;
  }

  // Bestätigung nach needsConfirmation (z.B. „ja“, „lösche“, „endgültig“) – Agent muss Tool mit user_confirmed ausführen
  if (
    /^(ja|yes|ok|okay|genau|richtig|mach\s*das|bitte\s*loeschen|bitte\s*löschen|endgueltig|endgültig|loeschen|löschen|bestaetigt|bestätigt|einverstanden)(\b|[!.\s,]|$)/.test(
      m.trim()
    ) ||
    /\b(ja[,.]?\s*(bitte|loesch|lösch|mach|genau)|user_confirmed|endgueltig\s+loesch|endgültig\s+lösch)\w*/.test(m)
  ) {
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

  // Mieter-Stammdaten aus Vertrag / nachtragen
  if (
    (/\b(mieter|stammdaten)\b/.test(m) &&
      /\b(aktualis|sync|uebernehm|übernehm|pfleg|fuell|füll|nachtrag|ergaenz|ergänz|vervollstaend|vervollständig|fehlend|mietbeginn|kaltmiete|mietzins|nebenkosten)\w*/.test(
        m
      )) ||
    (/\b(mietbeginn|kaltmiete|mietzins)\b/.test(m) && /\b(alle|mieter|setz|aktualis)\w*/.test(m)) ||
    (/\bstammdaten\b/.test(m) &&
      /\b(nachtrag|ergaenz|ergänz|pfleg|fuell|füll|bitte|erstmal)\w*/.test(m))
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
