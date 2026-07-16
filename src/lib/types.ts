export type ObjektTyp = "Wohnung" | "Haus" | "Gewerbe";
export type Status = "Rohdaten" | "Validierung" | "Fertig";

export interface Position {
  id: string;
  name: string;
  betrag: number;
  beschreibung?: string;
}

// -------- Rechnungsmerkmale (§14 UStG-nahe Pflichtangaben, vereinfacht) --------
// Wird bei jedem OCR/Vision-Durchlauf geprüft; ab MERKMALS_SCHWELLE (90%)
// erkannter Merkmale gilt die Rechnung als "erkannt/akzeptiert".
export const RECHNUNGS_MERKMALE = [
  "rechnungsnummer",
  "rechnungsdatum",
  "auftraggeber",
  "auftragnehmer",
  "rechnungsadresse",
  "leistungsart",
  "leistungsort",
  "betrag",
] as const;
export type RechnungsMerkmal = (typeof RECHNUNGS_MERKMALE)[number];
export const MERKMALS_SCHWELLE = 0.83;

export interface RechnungsPruefung {
  erkannteMerkmale: RechnungsMerkmal[];
  score: number; // 0..1
  akzeptiert: boolean;
  // Phase 2 (Fachprüfung/Kontierung) – aktuell nur Datenstruktur, Logik folgt:
  relevantFuerBk?: boolean;
  abrechnungskreis?: "Alle Mieter" | "Direktkosten" | "Kein Mieter" | string;
  kontierung?: string;
  zahlungsfreigabe?: {
    status: "offen" | "freigegeben" | "abgelehnt";
    freigegebenVon?: string;
    zweiteFreigabeVon?: string;
    timestamp?: string;
  };
}

/**
 * Prüft, wie viele der definierten Rechnungsmerkmale (RECHNUNGS_MERKMALE) in
 * den extrahierten Daten tatsächlich befüllt sind. Ab MERKMALS_SCHWELLE
 * (Standard 90%) gilt die Rechnung als vollständig erkannt/akzeptiert.
 */
export function pruefeRechnungsmerkmale(extracted: ExtractedData): RechnungsPruefung {
  const werte: Record<RechnungsMerkmal, unknown> = {
    rechnungsnummer: extracted.rechnungsnummer,
    rechnungsdatum: extracted.rechnungsdatum,
    auftraggeber: extracted.auftraggeber,
    auftragnehmer: extracted.auftragnehmer,
    rechnungsadresse: extracted.rechnungsadresse,
    leistungsart: extracted.leistungsart,
    leistungsort: extracted.leistungsort,
    betrag: extracted.betrag,
  };

  const erkannteMerkmale = RECHNUNGS_MERKMALE.filter((m) => {
    const v = werte[m];
    if (typeof v === "number") return v > 0;
    return typeof v === "string" && v.trim().length > 0;
  });

  const score = erkannteMerkmale.length / RECHNUNGS_MERKMALE.length;

  return {
    erkannteMerkmale,
    score,
    akzeptiert: score >= MERKMALS_SCHWELLE,
  };
}

export interface Dokument {
  id: string;
  nummer?: string;
  name: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  extraktText?: string;
  storedFileName?: string; // Dateiname im Upload-Verzeichnis, ermöglicht Ansicht/Download
  // Erweiterte Rechnungsmerkmale aus OCR/Vision-Analyse
  rechnungsnummer?: string;
  rechnungsdatum?: string;
  betrag?: number;
  leistungsart?: string;
  leistungsort?: string;
  auftraggeber?: string;
  auftragnehmer?: string;
  firma?: string;
  rechnungsadresse?: string;
  pruefung?: RechnungsPruefung;
}

export interface Workspace {
  positionen: Position[];
  mieteinnahmen: number;
  nebenkosten: number;
  abrechnungstext?: string;
  anschreiben?: string;
}

export interface VersionEntry {
  version: number;
  timestamp: string;
  snapshot: Partial<Abrechnung>;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface Abrechnung {
  id: string;
  nummer?: string;
  name: string;
  adresse: string;
  objektTyp: ObjektTyp;
  zeitraum: string;
  gesamtSumme: number;
  status: Status;
  dokumente: Dokument[];
  workspace: Workspace;
  chat: ChatMessage[];
  version: number;
  history: VersionEntry[];
  createdAt: string;
  updatedAt: string;
  // Zuordnung in die Liegenschaftshierarchie (optional, wird beim Anlegen
  // aus einer Wohnungs-Registerkarte oder nachträglich per Zuordnung gesetzt)
  liegenschaftId?: string;
  gebaeudeId?: string;
  wohnungId?: string;
}

export interface ExtractedData {
  name?: string;
  adresse?: string;
  objektTyp?: ObjektTyp;
  zeitraum?: string;
  gesamtSumme?: number;
  positionen?: { name: string; betrag: number; beschreibung?: string }[];
  rawText?: string;
  // Rechnungsmerkmale
  rechnungsnummer?: string;
  rechnungsdatum?: string;
  betrag?: number;
  leistungsart?: string;
  leistungsort?: string;
  auftraggeber?: string;
  auftragnehmer?: string;
  firma?: string;
  rechnungsadresse?: string;
}

// -------- Liegenschaftsverwaltung (Hausverwaltungs-Hierarchie) --------
// Liegenschaft (Grundstück) > Gebäude > Wohnung/Einheit > Mieter

export interface Liegenschaft {
  id: string;
  nummer?: string;
  name: string;
  strasse: string;
  hausnummer: string;
  plz: string;
  ort: string;
  grundstuecksflaeche?: number;
  flurstueck?: string;
  notizen?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Gebaeude {
  id: string;
  nummer?: string;
  liegenschaftId: string;
  name: string;
  baujahr?: number;
  anzahlEinheiten?: number;
  heizungsart?: string;
  notizen?: string;
  createdAt: string;
  updatedAt: string;
}

export type EinheitTyp = "Wohnung" | "Gewerbe" | "Stellplatz" | "Sonstige";

export interface Wohnung {
  id: string;
  nummer?: string;
  gebaeudeId: string;
  bezeichnung: string; // z.B. "1. OG links"
  typ: EinheitTyp;
  flaeche?: number;
  zimmer?: number;
  miteigentumsanteil?: number;
  notizen?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SollIstEintrag {
  id: string;
  jahr: string;
  sollVorauszahlung: number;
  istZahlungen: number;
  notiz?: string;
}

export interface Mieter {
  id: string;
  nummer?: string;
  wohnungId: string;
  name: string;
  email?: string;
  telefon?: string;
  mietbeginn?: string;
  mietende?: string;
  kaltmiete?: number;
  nebenkostenVorauszahlung?: number;
  notizen?: string;
  sollIst?: SollIstEintrag[];
  createdAt: string;
  updatedAt: string;
}

// -------- Mietverträge --------

export type MietvertragStatus = "Entwurf" | "Aktiv" | "Beendet";

export interface Mietvertrag {
  id: string;
  nummer?: string;
  wohnungId: string;
  mieterId?: string;
  dateiName: string;
  storedFileName?: string;
  mimeType: string;
  hochgeladenAm: string;
  sollMiete?: number;
  nebenkostenVorauszahlung?: number;
  kaution?: number;
  mietbeginn?: string;
  mietende?: string;
  status: MietvertragStatus;
  extraktText?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MietvertragExtraktion {
  mieterName?: string;
  vermieterName?: string;
  mietbeginn?: string;
  mietende?: string;
  sollMiete?: number;
  nebenkostenVorauszahlung?: number;
  kaution?: number;
  objektAdresse?: string;
  wohnungsbezeichnung?: string;
}
