export type ObjektTyp = "Wohnung" | "Haus" | "Gewerbe";
export type Status = "Rohdaten" | "Validierung" | "Fertig";

export interface Position {
  id: string;
  name: string;
  betrag: number; // Mieteranteil (umgelegter Betrag)
  beschreibung?: string;
  gesamtkosten?: number; // Gesamtkosten dieser Kostenart für das gesamte Objekt
  umlageschluessel?: string; // z.B. "Wohnfläche (80/400 m²) – 20 %"
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
  vorauszahlungen?: number; // geleistete Nebenkosten-Vorauszahlungen im Abrechnungszeitraum
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
  // Kopfdaten für Anschreiben/Briefkopf (§ 126b BGB) – manuell oder automatisch
  // aus der verknüpften Liegenschaft/dem Mieter befüllbar
  vermieterName?: string;
  vermieterAnschrift?: string;
  verwalterKontakt?: string; // z.B. Telefon/E-Mail der Hausverwaltung
  mieterName?: string;
  mieterAnschrift?: string;
  nutzungszeitraum?: string; // falls abweichend vom Abrechnungszeitraum (Ein-/Auszug)
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

export type MietkontoBuchungTyp = "Miete" | "Nebenkosten" | "Kaution" | "Sonstiges";

export interface MietkontoBuchung {
  id: string;
  datum: string; // ISO Datum, für welchen Monat/Zeitpunkt die Buchung gilt
  typ: MietkontoBuchungTyp;
  soll: number; // erwarteter Betrag
  ist: number; // tatsächlich eingegangener Betrag
  text?: string;
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
  mietkonto?: MietkontoBuchung[];
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
  /** Summe BK+HK oder pauschale NK-Vorauszahlung */
  nebenkostenVorauszahlung?: number;
  bkVorauszahlung?: number;
  hkVorauszahlung?: number;
  warmmiete?: number;
  kaution?: number;
  mietbeginn?: string;
  mietende?: string;
  /** Aus Vertrag: Wohnfläche m² (auch in Wohnung-Stammdaten übernommen) */
  flaeche?: number;
  zimmer?: number;
  status: MietvertragStatus;
  extraktText?: string;
  // Nachträge / Übergabeprotokolle, die zu diesem Mietvertrag hochgeladen wurden
  anhaenge?: Anhang[];
  createdAt: string;
  updatedAt: string;
}

export interface MietvertragExtraktion {
  mieterName?: string;
  vermieterName?: string;
  mieterEmail?: string;
  mieterTelefon?: string;
  mietbeginn?: string;
  mietende?: string;
  /** Kaltmiete / Nettomiete */
  sollMiete?: number;
  /** Betriebskosten-Vorauszahlung (BK-VZ) */
  bkVorauszahlung?: number;
  /** Heizkosten-Vorauszahlung (HK-VZ) */
  hkVorauszahlung?: number;
  /** Summe BK+HK bzw. pauschale NK, falls nicht aufgeschlüsselt */
  nebenkostenVorauszahlung?: number;
  /** Warmmiete / Gesamtmiete pro Monat */
  warmmiete?: number;
  kaution?: number;
  objektAdresse?: string;
  wohnungsbezeichnung?: string;
  flaeche?: number;
  zimmer?: number;
  /** Feldnamen, bei denen die Extraktion sich selbst als unsicher einschätzt (z.B. mehrdeutige Beträge) */
  unsicherheiten?: string[];
}

export interface KontoauszugTransaktion {
  datum?: string;
  betrag?: number; // positiv = Zahlungseingang
  verwendungszweck?: string;
  absender?: string;
}

// -------- Eigentümer --------

export interface Eigentuemer {
  id: string;
  nummer?: string;
  liegenschaftId: string;
  name: string;
  anschrift?: string;
  email?: string;
  telefon?: string;
  miteigentumsanteil?: number; // in ‰ oder % je nach Teilungserklärung
  vollmachtVon?: string;
  vollmachtBis?: string;
  dateiName?: string;
  storedFileName?: string;
  mimeType?: string;
  extraktText?: string;
  notizen?: string;
  // Zusatzunterlagen wie Grundbuchauszug, Kaufvertrag, weitere Vollmachten/Beschlüsse
  anhaenge?: Anhang[];
  createdAt: string;
  updatedAt: string;
}

export interface EigentuemerExtraktion {
  eigentuemerName?: string;
  anschrift?: string;
  email?: string;
  telefon?: string;
  miteigentumsanteil?: number;
  vollmachtBeginn?: string;
  vollmachtEnde?: string;
  dokumentTyp?: string; // z.B. "Vollmacht", "Grundbuchauszug", "Eigentümerbeschluss"
  objektAdresse?: string;
  liegenschaftName?: string;
}

// -------- Property-Management-Vertrag --------

export type PmVertragStatus = "Entwurf" | "Aktiv" | "Beendet";

export interface PmVertrag {
  id: string;
  nummer?: string;
  liegenschaftId: string;
  dateiName: string;
  storedFileName?: string;
  mimeType: string;
  hochgeladenAm: string;
  verwalterName?: string;
  auftraggeberName?: string;
  honorarModell?: string; // z.B. "Pauschale", "je Einheit", "% der Mieteinnahmen"
  honorarSatz?: number;
  leistungsumfang?: string;
  laufzeitBeginn?: string;
  laufzeitEnde?: string;
  kuendigungsfrist?: string;
  status: PmVertragStatus;
  extraktText?: string;
  // Zusatzunterlagen wie Liegenschaftskarte, Objektbeschreibung, Mieterliste
  anhaenge?: Anhang[];
  createdAt: string;
  updatedAt: string;
}

export interface PmVertragExtraktion {
  verwalterName?: string;
  auftraggeberName?: string;
  honorarModell?: string;
  honorarSatz?: number;
  leistungsumfang?: string;
  laufzeitBeginn?: string;
  laufzeitEnde?: string;
  kuendigungsfrist?: string;
  objektAdresse?: string;
  liegenschaftName?: string;
}

// -------- Anhänge (Zusatzdokumente an Eigentümer / PM-Vertrag / Mietvertrag) --------
// Ermöglicht das Hinterlegen weiterer Belege an einem bereits angelegten Stammdatensatz,
// z.B. Liegenschaftskarte am PM-Vertrag, Grundbuchauszug/Kaufvertrag am Eigentümer,
// Nachtrag/Übergabeprotokoll am Mietvertrag.

export type AnhangTyp =
  | "Liegenschaftskarte"
  | "Objektbeschreibung"
  | "Mieterliste"
  | "Grundbuchauszug"
  | "Kaufvertrag"
  | "Vollmacht"
  | "Eigentuemerbeschluss"
  | "Nachtrag"
  | "Uebergabeprotokoll"
  | "Sonstiges";

export interface Anhang {
  id: string;
  typ: AnhangTyp;
  dateiName: string;
  storedFileName: string;
  mimeType: string;
  hochgeladenAm: string;
  extraktText?: string;
  notizen?: string;
}

// -------- Kontoauszüge (abgelegte Quelldateien + Buchungsstatus) --------

export interface Kontoauszug {
  id: string;
  nummer?: string;
  liegenschaftId?: string;
  dateiName: string;
  storedFileName?: string;
  mimeType: string;
  hochgeladenAm: string;
  zeitraum?: string;
  anzahlTransaktionen: number;
  gebuchteTransaktionen: number;
  extraktText?: string;
  createdAt: string;
  updatedAt: string;
}

// -------- Intelligenter Sammel-Upload (Multi-Dokument-Klassifizierung) --------
// Erlaubt das gleichzeitige Hochladen vieler unterschiedlicher Dokumente (z.B. 20 PDFs
// eines Übergabepakets). Jede Datei wird einzeln klassifiziert, passend extrahiert und
// gegen bestehende Stammdaten gematcht. Nichts wird ohne Bestätigung durch den User
// gespeichert bzw. abgelegt.

export const ERKANNTE_DOKUMENT_TYPEN = [
  "rechnung",
  "mietvertrag",
  "mietvertrag_nachtrag",
  "uebergabeprotokoll",
  "pm_vertrag",
  "eigentuemer_dokument",
  "grundbuchauszug",
  "kaufvertrag",
  "liegenschaftskarte",
  "kontoauszug",
  "unbekannt",
] as const;
export type ErkannterDokumentTyp = (typeof ERKANNTE_DOKUMENT_TYPEN)[number];

export const DOKUMENT_TYP_LABEL: Record<ErkannterDokumentTyp, string> = {
  rechnung: "Rechnung",
  mietvertrag: "Mietvertrag",
  mietvertrag_nachtrag: "Nachtrag zum Mietvertrag",
  uebergabeprotokoll: "Übergabeprotokoll",
  pm_vertrag: "PM-/Hausverwaltervertrag",
  eigentuemer_dokument: "Eigentümer-Dokument (Vollmacht/Beschluss)",
  grundbuchauszug: "Grundbuchauszug",
  kaufvertrag: "Kaufvertrag",
  liegenschaftskarte: "Liegenschaftskarte / Objektunterlage",
  kontoauszug: "Kontoauszug",
  unbekannt: "Unbekannt / manuell prüfen",
};

export interface DokumentKlassifikation {
  typ: ErkannterDokumentTyp;
  konfidenz: number; // 0..1
  begruendung?: string;
}

// Ein Eintrag der Sammel-Upload-Warteschlange, wie ihn /api/smart-upload zurückliefert.
// `daten` enthält je nach `typ` die passende Extraktion (siehe jeweilige *Extraktion-Typen).
export interface SmartUploadErgebnis {
  key: string;
  dateiName: string;
  storedFileName: string;
  mimeType: string;
  ablageId?: string;
  typ: ErkannterDokumentTyp;
  konfidenz: number;
  begruendung?: string;
  fehler?: string;
  extraktText?: string;
  // Rechnungen werden (wie im übrigen Produkt) direkt automatisch abgelegt/ergänzt –
  // hier steht nur das Ergebnis zur Anzeige, kein weiterer Bestätigungsschritt nötig.
  erledigt?: boolean;
  hinweisText?: string;
  rechnung?: {
    extracted: ExtractedData;
    pruefung: RechnungsPruefung;
    abrechnungId?: string;
    abrechnungName?: string;
    liegenschaftId?: string;
    liegenschaftName?: string;
    neuanlage?: LiegenschaftStammdatenVorschlag;
  };
  mietvertrag?: {
    extraktion: MietvertragExtraktion;
    vorschlag: { mieterId?: string; mieterName?: string; wohnungId?: string };
  };
  nachtrag?: {
    extraktion: MietvertragExtraktion & {
      art: "Nachtrag" | "Uebergabeprotokoll";
      ereignis?: "Auszug" | "Einzug" | "Mieterwechsel" | "Sonstige_Aenderung";
      hinweis?: string;
    };
    vorschlag: { mietvertragId?: string; mieterId?: string; mieterName?: string; wohnungId?: string };
  };
  pmVertrag?: {
    extraktion: PmVertragExtraktion;
    vorschlag: {
      liegenschaftId?: string;
      liegenschaftName?: string;
      neuanlage?: LiegenschaftStammdatenVorschlag;
      pmVertragId?: string; // falls bereits ein PM-Vertrag für die Liegenschaft existiert (→ als Anhang vorschlagen)
    };
  };
  eigentuemerDokument?: {
    extraktion: EigentuemerExtraktion;
    anhangTyp: AnhangTyp; // aus dokumentTyp abgeleitet: Grundbuchauszug/Kaufvertrag/Vollmacht/Sonstiges
    vorschlag: {
      liegenschaftId?: string;
      liegenschaftName?: string;
      neuanlage?: LiegenschaftStammdatenVorschlag;
      eigentuemerId?: string; // falls bereits ein Eigentümer für die Liegenschaft existiert (→ als Anhang vorschlagen)
      eigentuemerName?: string;
    };
  };
  liegenschaftskarte?: {
    anhangTyp: AnhangTyp; // Liegenschaftskarte / Objektbeschreibung / Mieterliste
    vorschlag: {
      liegenschaftId?: string;
      liegenschaftName?: string;
      pmVertragId?: string;
      neuanlage?: LiegenschaftStammdatenVorschlag;
    };
    // Nur gesetzt, wenn im Dokument eine Wohnungs-/Mieterübersicht (Tabelle mit
    // Wohnungsbezeichnung + Größe, ggf. Mieter) erkannt wurde, z.B. Anlage zum
    // PM-Vertrag oder eine hochgeladene Mieterlisten-Excel/-CSV.
    hierarchie?: HierarchieAbgleichVorschlag;
  };
  kontoauszug?: {
    transaktionen: KontoauszugTransaktion[];
    vorschlaege: {
      transaktion: KontoauszugTransaktion;
      vorschlagMieterId?: string;
      vorschlagMieterName?: string;
      wohnungBezeichnung?: string;
      liegenschaftName?: string;
    }[];
  };
}

// -------- Gemeinsamer Vorschlag zur Neuanlage einer Liegenschaft --------
// Wird von den Analyse-Endpunkten (Eigentümer, PM-Vertrag, ggf. weitere) genutzt,
// um bei fehlendem Treffer eine bereits vorausgefüllte Maske anzubieten.

export interface LiegenschaftStammdatenVorschlag {
  name?: string;
  strasse?: string;
  hausnummer?: string;
  plz?: string;
  ort?: string;
}

// -------- Extraktion einer Wohnungs-/Mieterübersicht (Anlage zum PM-Vertrag, Mieterliste, Excel) --------

export interface WohnungsuebersichtEintrag {
  gebaeudeName?: string;
  wohnungsbezeichnung: string;
  typ?: EinheitTyp;
  flaeche?: number;
  zimmer?: number;
  miteigentumsanteil?: number;
  mieterName?: string;
  kaltmiete?: number;
  nebenkostenVorauszahlung?: number;
  mietbeginn?: string;
}

export interface WohnungsuebersichtExtraktion {
  liegenschaftName?: string;
  objektAdresse?: string;
  einheiten: WohnungsuebersichtEintrag[];
}

// -------- Abgleich Gebäude/Wohnungen/Mieter aus einer Objekt-/Wohnungsübersicht --------
// Wird erzeugt, wenn im Sammel-Upload eine Anlage zum PM-Vertrag (Objektbeschreibung,
// Mieterliste) oder eine hochgeladene Excel-/CSV-Stammdatenliste eine Tabelle mit
// Wohnungen (Bezeichnung, Größe, ggf. Mieter) enthält. Jeder Eintrag wird gegen die
// bestehenden Stammdaten der (ggf. neu anzulegenden) Liegenschaft abgeglichen.

export interface HierarchieGebaeudeVorschlag {
  key: string; // stabiler Bezugsschlüssel innerhalb dieses Uploads (von Wohnungen referenziert)
  aktion: "neu" | "vorhanden";
  gebaeudeId?: string; // gesetzt bei aktion "vorhanden"
  name: string;
}

export interface HierarchieWohnungVorschlag {
  key: string; // stabiler Bezugsschlüssel innerhalb dieses Uploads (von Mietern referenziert)
  gebaeudeKey: string; // referenziert HierarchieGebaeudeVorschlag.key
  aktion: "neu" | "aktualisieren" | "unveraendert";
  wohnungId?: string; // gesetzt bei aktion "aktualisieren"/"unveraendert"
  bezeichnung: string;
  typ: EinheitTyp;
  flaeche?: number;
  zimmer?: number;
  miteigentumsanteil?: number;
  // Bei aktion "aktualisieren": nur die Felder, die sich gegenüber dem bestehenden
  // Datensatz laut Dokument unterscheiden (zur Anzeige "was würde sich ändern").
  aenderungen?: Partial<Pick<Wohnung, "bezeichnung" | "flaeche" | "zimmer" | "miteigentumsanteil">>;
}

export interface HierarchieMieterVorschlag {
  key: string;
  wohnungKey: string; // referenziert HierarchieWohnungVorschlag.key
  aktion: "neu" | "aktualisieren";
  mieterId?: string; // gesetzt bei aktion "aktualisieren"
  name: string;
  kaltmiete?: number;
  nebenkostenVorauszahlung?: number;
  mietbeginn?: string;
  mietende?: string;
  aenderungen?: Partial<
    Pick<Mieter, "kaltmiete" | "nebenkostenVorauszahlung" | "mietbeginn" | "mietende">
  >;
}

export interface HierarchieAbgleichVorschlag {
  liegenschaftId?: string;
  liegenschaftName?: string;
  neuanlage?: LiegenschaftStammdatenVorschlag; // gesetzt, wenn keine passende Liegenschaft gefunden wurde
  gebaeude: HierarchieGebaeudeVorschlag[];
  wohnungen: HierarchieWohnungVorschlag[];
  mieter: HierarchieMieterVorschlag[];
}

// -------- Ablage (Dokumenten-Eingang) --------
// Jede über den Sammel-Upload hochgeladene Datei landet hier zunächst mit
// Status "neu". Sobald die KI sie korrekt zugeordnet hat (Nutzer hat im
// Sammel-Upload "Übernehmen" bestätigt), wechselt sie auf "zugeordnet" und
// verschwindet aus der aktiven Ablage-Ansicht. Dateien, die verworfen wurden
// oder nie zugeordnet werden konnten, bleiben mit Status "verworfen"/"neu"
// sichtbar und können manuell (mit Sicherheitsabfrage) gelöscht werden.

export type AblageStatus = "neu" | "in_pruefung" | "zugeordnet" | "verworfen";

export interface AblageZuordnung {
  art: string; // z.B. "Liegenschaft", "PM-Vertrag", "Mietvertrag", "Abrechnung"
  id: string;
  label: string;
}

export interface AblageDokument {
  id: string;
  nummer?: string;
  dateiName: string;
  storedFileName: string;
  mimeType: string;
  groesse: number;
  hochgeladenAm: string;
  status: AblageStatus;
  erkannterTyp?: ErkannterDokumentTyp;
  konfidenz?: number;
  zugeordnetAn?: AblageZuordnung;
  extraktText?: string;
  createdAt: string;
  updatedAt: string;
}

// -------- System-Log --------
// Protokolliert wichtige Ereignisse in Klartext (Uploads, Zuordnungen,
// Neuanlagen, Änderungen, Löschungen, Prüfläufe), damit sowohl der Nutzer als
// auch der Agent nachvollziehen können, was auf der Plattform passiert ist.

export type SystemLogTyp =
  | "upload"
  | "zuordnung"
  | "anlage"
  | "aenderung"
  | "loeschung"
  | "pruefung"
  | "fehler"
  | "info";

export const SYSTEM_LOG_TYP_ICON: Record<SystemLogTyp, string> = {
  upload: "📤",
  zuordnung: "🔗",
  anlage: "🆕",
  aenderung: "✏️",
  loeschung: "🗑️",
  pruefung: "🔍",
  fehler: "⚠️",
  info: "ℹ️",
};

export interface SystemLogEintrag {
  id: string;
  zeitpunkt: string;
  typ: SystemLogTyp;
  text: string;
  bezug?: { art: string; id?: string };
}

// -------- Plausibilitätsprüfung (automatisierter KI-Audit) --------
// Prüft periodisch bzw. auf Knopfdruck sämtliche Stammdaten-Module und die
// Ablage auf Widersprüche/Fehlzuordnungen (z.B. Dokument liegt an falscher
// Liegenschaft, Wohnung ohne Fläche, Mieter ohne gültige Wohnung). Ergebnis
// ist eine Liste von Befunden mit Korrekturvorschlag, die der Nutzer komplett
// oder einzeln freigeben kann; freigegebene Befunde werden automatisiert
// angewendet (Dokument verschieben / Stammdaten korrigieren).

export type PruefModul =
  | "liegenschaften"
  | "gebaeude"
  | "wohnungen"
  | "mieter"
  | "mietvertraege"
  | "pmVertraege"
  | "eigentuemer"
  | "abrechnungen"
  | "kontoauszuege"
  | "ablage"
  | "system";

export const PRUEF_MODUL_LABEL: Record<PruefModul, string> = {
  liegenschaften: "Liegenschaften",
  gebaeude: "Gebäude",
  wohnungen: "Wohnungen",
  mieter: "Mieter",
  mietvertraege: "Mietverträge",
  pmVertraege: "PM-Verträge",
  eigentuemer: "Eigentümer",
  abrechnungen: "Abrechnungen",
  kontoauszuege: "Kontoauszüge",
  ablage: "Ablage",
  system: "System / Module",
};

export const PRUEF_MODUL_REIHENFOLGE: PruefModul[] = [
  "system",
  "liegenschaften",
  "gebaeude",
  "wohnungen",
  "mieter",
  "mietvertraege",
  "pmVertraege",
  "eigentuemer",
  "abrechnungen",
  "kontoauszuege",
  "ablage",
];

/** Deep-Link-Ziele in der UI (Prüfung / Agent-Hinweise). */
export const ENTITAET_ROUTE: Record<string, string> = {
  Liegenschaft: "/liegenschaften",
  Gebäude: "/gebaeude",
  Wohnung: "/wohnungen",
  Mieter: "/mieter",
  Mietvertrag: "/mietvertraege",
  Ablage: "/ablage",
  Abrechnung: "/rechnungen",
  Eigentümer: "/eigentuemer",
  "PM-Vertrag": "/pm-vertrag",
  Kontoauszug: "/kontoauszuege",
};

export type PruefStatus = "ok" | "hinweise" | "fehler" | "ausstehend";

export interface PruefKorrekturVorschlag {
  art: "dokument_verschieben" | "stammdaten_korrigieren";
  beschreibung: string;
  // Für "dokument_verschieben": welches Ablage-Dokument wohin verschieben
  ablageId?: string;
  zielLiegenschaftId?: string;
  zielPmVertragId?: string;
  // Für "stammdaten_korrigieren": welches Feld welcher Entität ändern
  entitaet?: { art: "liegenschaft" | "gebaeude" | "wohnung" | "mieter"; id: string; label: string };
  patch?: Record<string, string | number>;
}

export interface PruefBefund {
  id: string;
  modul: PruefModul;
  schweregrad: "hinweis" | "warnung" | "fehler";
  titel: string;
  beschreibung: string;
  betroffene: { art: string; id: string; label: string }[];
  /** Optionaler UI-Pfad, z.B. /ablage oder /mietvertraege – für „Zur Bearbeitung“. */
  linkHref?: string;
  vorschlag?: PruefKorrekturVorschlag;
  status: "offen" | "uebernommen" | "abgelehnt";
}

export interface PruefLauf {
  id: string;
  nummer?: string;
  gestartetAm: string;
  abgeschlossenAm?: string;
  modulStatus: Record<PruefModul, PruefStatus>;
  befunde: PruefBefund[];
  createdAt: string;
  updatedAt: string;
}

// -------- Schriftverkehr (gespeicherte Anschreiben / Mahnungen) --------

export type SchriftverkehrStatus = "Entwurf" | "Versandbereit" | "Versendet" | "Archiviert";

export interface SchriftverkehrDokument {
  id: string;
  nummer?: string;
  /** Template-ID aus SCHRIFTVERKEHR_TEMPLATES, z.B. "mahnung" */
  templateId: string;
  templateLabel: string;
  mieterId: string;
  mieterName: string;
  wohnungId?: string;
  gebaeudeId?: string;
  liegenschaftId?: string;
  liegenschaftName?: string;
  betreff: string;
  text: string;
  werte: Record<string, string>;
  status: SchriftverkehrStatus;
  /** Wie entstand der Brief: manuell im Panel oder per Agent */
  quelle: "manuell" | "agent";
  // Finale, per "Fertigstellen" erzeugte PDF-Version inkl. Corporate-Design-Briefkopf
  finalStoredFileName?: string;
  finalDateiName?: string;
  finalisiertAm?: string;
  createdAt: string;
  updatedAt: string;
}
