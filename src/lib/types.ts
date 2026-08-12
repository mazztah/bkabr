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

/** aktiv = in Analyse/Prüfung; inaktiv = z.B. nach beendetem PM-Vertrag ausgeblendet */
export type ObjektStatus = "aktiv" | "inaktiv";

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
  /** Default aktiv. Bei beendetem PM-Vertrag → inaktiv (fällt aus Analysen heraus). */
  status?: ObjektStatus;
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
  status?: ObjektStatus;
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
  status?: ObjektStatus;
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
  /** inaktiv = ausgezogen / nicht mehr in Analysen */
  status?: ObjektStatus;
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

/** Kontext für Anzeige in der Prüf-UI (Nummern, Objekt, Dokument-Link). */
export interface PruefBefundKontext {
  mieterNummer?: string;
  mieterName?: string;
  liegenschaftNummer?: string;
  liegenschaftName?: string;
  liegenschaftAdresse?: string;
  wohnungBezeichnung?: string;
  /** Direkter Link zur App-Seite (Mieter, Vertrag, Ablage, …). */
  bearbeitenHref?: string;
  /** Link zur Originaldatei (PDF/Bild) falls vorhanden. */
  dokumentHref?: string;
  dokumentLabel?: string;
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
  /** Strukturierter Anzeige-Kontext (Nummern, Liegenschaft, Dokument). */
  kontext?: PruefBefundKontext;
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

// -------- Kalender (wiederkehrende Agent-Aufgaben) --------
// Erlaubt dem Nutzer, dem Agent wiederkehrende Aufträge zu geben, z.B.
// "alle 2 Stunden Mahnlauf" oder "täglich 23:40 Uhr E-Mail-Batch versenden".
// Bewusst kein vollständiger Cron-Parser: drei einfache, für Nutzer ohne
// Cron-Kenntnisse verständliche Wiederholungsarten decken die realen
// Anwendungsfälle (Intervall / täglich / wöchentlich) ab.

export type AgentScheduleRecurrence =
  | { art: "intervall"; minuten: number }
  | { art: "taeglich"; uhrzeit: string /* "HH:MM" */ }
  | { art: "woechentlich"; wochentag: number /* 0=So..6=Sa */; uhrzeit: string };

export type AgentScheduleLaufStatus = "erfolg" | "fehler";

export interface AgentScheduleLauf {
  zeitpunkt: string;
  status: AgentScheduleLaufStatus;
  ergebnis: string;
}

export interface AgentSchedule {
  id: string;
  nummer?: string;
  name: string;
  /** Auftrag/Prompt, der dem Agenten bei Fälligkeit als Nachricht übergeben wird. */
  prompt: string;
  recurrence: AgentScheduleRecurrence;
  aktiv: boolean;
  liegenschaftId?: string;
  liegenschaftName?: string;
  nextRunAt: string;
  lastRunAt?: string;
  /** Letzte 20 Ausführungen, neueste zuerst. */
  historie: AgentScheduleLauf[];
  createdAt: string;
  updatedAt: string;
}

// -------- Schriftverkehr (gespeicherte Anschreiben / Mahnungen) --------

// -------- Buchhaltung (Einnahmen/Ausgaben-Journal & Bilanz) --------
// Durchgang 1 der Dashboard-Initiative: ein eigenständiges, einfaches Journal
// (Kassenbuch-Prinzip: jede Buchung ist Einnahme ODER Ausgabe) plus ein
// schlanker Kontenrahmen für eine Aktiva/Passiva-Bilanz. Bewusst kein volles
// doppisches Buchungssystem (Soll/Haben je Konto) – das wäre für den
// aktuellen Bedarf (Kennzahlen, Dashboard) unnötig komplex. Buchungen können
// künftig automatisch aus Rechnungen/Abrechnungen/Kontoauszügen erzeugt
// werden (belegTyp/belegId), aktuell auch manuell erfassbar.

export type BuchungsTyp = "Einnahme" | "Ausgabe";

export const EINNAHME_KATEGORIEN = [
  "Miete",
  "Nebenkostenvorauszahlung",
  "Nebenkostennachzahlung",
  "Sonstige Einnahmen",
] as const;

export const AUSGABE_KATEGORIEN = [
  "Instandhaltung",
  "Verwaltung",
  "Versicherung",
  "Zinsen",
  "Steuern",
  "Abschreibungen",
  "Dienstleister",
  "Betriebskosten",
  "Sonstige Ausgaben",
] as const;

export type BuchungsKategorie =
  | (typeof EINNAHME_KATEGORIEN)[number]
  | (typeof AUSGABE_KATEGORIEN)[number];

export interface Buchung {
  id: string;
  nummer?: string;
  /** ISO-Datum des wirtschaftlichen Vorfalls (nicht der Erfassung) */
  datum: string;
  typ: BuchungsTyp;
  kategorie: string;
  /** immer positiv – das Vorzeichen ergibt sich aus `typ` */
  betrag: number;
  beschreibung?: string;
  liegenschaftId?: string;
  /** Herkunft der Buchung, für spätere Automatisierung (Rechnung → Buchung etc.) */
  belegTyp?: "Rechnung" | "Abrechnung" | "Kontoauszug" | "Kaufvertrag" | "Manuell";
  belegId?: string;
  /** Freitext-Referenz, falls (noch) kein digitalisiertes Beleg-Dokument existiert (z.B. "Kaufvertrag vom 12.03., Notar Müller, Urk.-Nr. 44/2026") */
  belegFreitext?: string;
  rechnungsdaten?: BuchungsRechnungsdaten;
  /** gewählter Abrechnungskreis, falls die Kosten auf Mieter umgelegt wurden */
  abrechnungskreisId?: string;
  aufteilung?: BuchungsAufteilungsPosition[];
  /** true = diese Buchung wurde durch eine Gegenbuchung storniert */
  storniert?: boolean;
  /** ID der Gegenbuchung, falls storniert */
  storniertDurchBuchungId?: string;
  /** true = diese Buchung IST die Gegenbuchung einer Stornierung */
  istStornoBuchung?: boolean;
  storniertVonBuchungId?: string;
  createdAt: string;
  updatedAt: string;
}

/** Rechnungsstammdaten, analog zu RECHNUNGS_MERKMALE aus der Plausibilitätsprüfung. */
export interface BuchungsRechnungsdaten {
  rechnungsnummer?: string;
  rechnungsdatum?: string;
  /** Lieferant/Auftragnehmer bzw. bei Kaufverträgen der Verkäufer */
  lieferant?: string;
  leistungsart?: string;
}

export type Umlageschluessel = "Wohnflaeche" | "Miteigentumsanteil" | "Gleich";

export const UMLAGESCHLUESSEL_LABEL: Record<Umlageschluessel, string> = {
  Wohnflaeche: "Wohnfläche (m²)",
  Miteigentumsanteil: "Miteigentumsanteil (MEA)",
  Gleich: "Gleich verteilt (Kopfteile)",
};

/**
 * Wiederverwendbare Umlage-Vorlage. Ohne `wohnungIds` gilt sie für ALLE
 * Wohnungen der jeweiligen Liegenschaft zum Buchungszeitpunkt (aufgelöst bei
 * der Buchung, nicht vorab gespeichert – Wohnungsbestand kann sich ändern).
 * Mit `wohnungIds` ist sie auf eine konkrete Teilmenge eingeschränkt (z.B.
 * "nur Erdgeschoss") und damit an eine Liegenschaft gebunden.
 */
export interface Abrechnungskreis {
  id: string;
  nummer?: string;
  name: string;
  beschreibung?: string;
  umlageschluessel: Umlageschluessel;
  liegenschaftId?: string;
  wohnungIds?: string[];
  /** true = Teil des mitgelieferten Standardkatalogs */
  istStandard: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BuchungsAufteilungsPosition {
  wohnungId: string;
  wohnungBezeichnung: string;
  mieterId?: string;
  mieterName?: string;
  /** 0..1 */
  anteil: number;
  betrag: number;
}

/** Ergebnis der Splitting-Berechnung inkl. Wohnungen, die nicht zugeordnet werden konnten. */
export interface AbrechnungskreisSplitErgebnis {
  positionen: BuchungsAufteilungsPosition[];
  summeVerteilt: number;
  nichtZugeordneteWohnungen: string[];
}

export type KontoArt = "Aktiva" | "Passiva";

export type KontoKategorie =
  | "Anlagevermögen"
  | "Umlaufvermögen"
  | "Liquide Mittel"
  | "Eigenkapital"
  | "Verbindlichkeiten"
  | "Rückstellungen";

/** Bilanzkonto – aktuell mit manuell gepflegtem Saldo (kein Buchungsautomatismus je Konto). */
export interface Konto {
  id: string;
  nummer?: string;
  name: string;
  art: KontoArt;
  kategorie: KontoKategorie;
  saldo: number;
  notizen?: string;
  createdAt: string;
  updatedAt: string;
}

/** Aggregierte Sicht für Dashboard/KPI-Engine – wird serverseitig aus Buchungen + Konten berechnet. */
export interface BuchhaltungsUebersicht {
  einnahmen: number;
  ausgaben: number;
  gewinn: number;
  einnahmenNachKategorie: Record<string, number>;
  ausgabenNachKategorie: Record<string, number>;
  bilanz: {
    aktiva: Konto[];
    passiva: Konto[];
    summeAktiva: number;
    summePassiva: number;
    imGleichgewicht: boolean;
  };
  buchungenAnzahl: number;
}

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

// -------- Investoren (Kontaktsammlung + Recherche/Anschreiben/Strategie) --------
// Eigenständiges Modul, bewusst nicht an die Liegenschaftshierarchie gekoppelt:
// Investoren sind externe Kontakte (Startup/VC, Private Equity, IT/KI, Real
// Estate, Property-/Facility-/Asset-Management), die der Agent selbstständig
// per Websuche recherchiert, anhand von INVESTOR_KRITERIEN (siehe lib/investoren.ts)
// bewertet und – nach Freigabe – in die Stammdatenliste übernimmt. Anschreiben
// und Strategie-Berichte hängen jeweils per investorId an einem Datensatz.

export type InvestorStatus =
  | "vorschlag" // von der (Web-)Recherche vorgeschlagen, wartet auf Freigabe
  | "freigegeben"
  | "kontaktiert"
  | "in_gespraech"
  | "abgelehnt";

export const INVESTOR_STATUS_LABEL: Record<InvestorStatus, string> = {
  vorschlag: "Vorschlag (Freigabe offen)",
  freigegeben: "Freigegeben",
  kontaktiert: "Kontaktiert",
  in_gespraech: "In Gespräch",
  abgelehnt: "Abgelehnt",
};

/** Bewusst als String statt strikter Union: KI-recherchierte Sektoren sollen nicht an
 *  einer starren Enum-Prüfung scheitern. INVESTOR_SEKTOR_VORSCHLAEGE (lib/investoren.ts)
 *  liefert die Vorschlagsliste fürs UI (Startup/VC, Private Equity, IT/Software, KI/AI,
 *  Real Estate, Property/Facility/Asset Management, …). */
export type InvestorSektor = string;

export interface InvestorKriteriumErgebnis {
  /** ID aus INVESTOR_KRITERIEN, z.B. "quelle_verifizierbar" */
  kriteriumId: string;
  erfuellt: boolean;
  begruendung?: string;
}

export interface Investor {
  id: string;
  nummer?: string;
  firma: string;
  ansprechpartnerName?: string;
  ansprechpartnerRolle?: string;
  email?: string;
  telefon?: string;
  webseite?: string;
  linkedinUrl?: string;
  xingUrl?: string;
  land: string;
  /** Wissenshub/Standort, z.B. "Silicon Valley", "Berlin" */
  hub?: string;
  sektoren: InvestorSektor[];
  /** Kurzer Lebenslauf/Profil-Text des Kontakts bzw. der Firma */
  kurzprofil?: string;
  tickeGroesse?: string;
  sprache?: string;
  /** Wo der Kontakt herkommt (URL/Quelle), Pflicht für DSGVO-Nachweis bei Agent-Recherchen */
  quelle?: string;
  quelleDatum?: string;
  status: InvestorStatus;
  /** 0-10, aus kriterienErgebnis abgeleitet */
  score?: number;
  kriterienErgebnis?: InvestorKriteriumErgebnis[];
  notizen?: string;
  createdAt: string;
  updatedAt: string;
}

export type InvestorAnschreibenStatus = "Entwurf" | "Versandbereit" | "Versendet" | "Archiviert";

export interface InvestorAnschreiben {
  id: string;
  nummer?: string;
  investorId: string;
  investorFirma: string;
  betreff: string;
  text: string;
  status: InvestorAnschreibenStatus;
  quelle: "manuell" | "agent";
  // Finale, per "Fertigstellen" erzeugte PDF-Version inkl. Corporate-Design-Briefkopf
  finalStoredFileName?: string;
  finalDateiName?: string;
  finalisiertAm?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InvestorStrategiePunkt {
  titel: string;
  beschreibung: string;
}

export interface InvestorStrategieBericht {
  id: string;
  nummer?: string;
  investorId: string;
  investorFirma: string;
  /** Wirtschaftliche Ziele/Kontext, der dem Bericht zugrunde lag (freier Nutzertext) */
  wirtschaftlicheZiele?: string;
  zusammenfassung: string;
  /** Mind. 20 individualisierte Strategiepunkte */
  punkte: InvestorStrategiePunkt[];
  createdAt: string;
  updatedAt: string;
}

// -------- News-Widget (RSS-Feed-Aggregator, Durchgang 8a) --------

export type NewsKategorie = "Allgemein" | "KI & Tech" | "Immobilien";
export type NewsRegion = "Inland" | "Ausland";

export interface NewsQuelle {
  id: string;
  label: string;
  url: string;
  kategorie: NewsKategorie;
  region: NewsRegion;
  /** Hinweis auf Nutzungseinschränkungen der Quelle, falls vorhanden (z.B. nur privater Gebrauch) */
  lizenzHinweis?: string;
}

export interface NewsArtikel {
  quelle: string;
  quelleLabel: string;
  kategorie: NewsKategorie;
  region: NewsRegion;
  titel: string;
  link: string;
  bildUrl?: string;
  veroeffentlichtAm?: string;
  beschreibung?: string;
}
// Fasst die serverseitig berechneten Kennzahlen für das Business-Command-Center
// zusammen. Bewusst als eigener Typ (statt einzelner Fetches im Client), damit
// die Berechnungslogik (u.a. Health-Score-Formel) zentral in db.ts liegt und
// dokumentiert bleibt.

export interface DashboardObjektUebersicht {
  liegenschaften: number;
  gebaeude: number;
  wohnungen: number;
  mieterAktiv: number;
  /** aktive Mieter / Wohnungen, 0..1 (null wenn keine Wohnungen vorhanden) */
  belegungsquote: number | null;
  /** Anzahl Wohnungen ohne aktiven Mieter (echte Zählung je Einheit, nicht nur Verhältnis) */
  wohnungenLeer: number;
}

export interface DashboardAbrechnungsUebersicht {
  gesamt: number;
  rohdaten: number;
  validierung: number;
  fertig: number;
}

export interface DashboardPruefUebersicht {
  letzterLaufAm?: string;
  offeneBefunde: number;
  fehler: number;
  warnungen: number;
  hinweise: number;
}

export interface DashboardKennzahlen {
  /** liquide Mittel / Verbindlichkeiten (vereinfacht, keine Fristigkeiten-Trennung) */
  liquiditaetsgradI: number | null;
  /** Summe Eigenkapital-Konten / Bilanzsumme Aktiva */
  eigenkapitalquote: number | null;
  /** aktuell = Gewinn aus dem Journal (vereinfachtes Näherungsmaß, kein echter Cashflow) */
  cashflow: number;
  /**
   * Zusammengesetzter 0–100-Score aus Gewinnmarge, Bilanzgleichgewicht,
   * offenen Prüfbefunden und Belegungsquote. Bewusst transparent und simpel
   * gehalten (keine "Black Box") – Formel und Gewichtung werden mit
   * wachsender Datenbasis in späteren Durchgängen verfeinert.
   */
  businessHealthScore: number;
  /** Gewinn / Einnahmen — klassische Umsatzrendite, null wenn keine Einnahmen erfasst */
  umsatzrendite: number | null;
  /** Umlaufvermögen-Konten − Verbindlichkeiten-Konten (vereinfacht, keine Fristigkeiten-Trennung) */
  workingCapital: number | null;
  /** Anteil der Buchungen mit automatischer Herkunft (belegTyp != Manuell), null wenn keine Buchungen */
  automatisierungsgrad: number | null;
  /**
   * Liquide Mittel / durchschnittliche tägliche Ausgaben der letzten 30 Tage
   * = geschätzte Reichweite in Tagen. Null wenn keine Ausgaben im Zeitraum
   * anfielen (Division durch 0 vermieden) oder keine liquiden Mittel erfasst.
   */
  cashBurnTageReichweite: number | null;

  // -- Durchgang 4: verbleibende klassische Kennzahlen --
  /** Alias auf Einnahmen — klassische Bezeichnung */
  umsatz: number;
  /** Gewinn + Zinsaufwand + Steueraufwand */
  ebit: number;
  /** EBIT + Abschreibungen */
  ebitda: number;
  /** (Liquide Mittel + Umlaufvermögen) / Verbindlichkeiten */
  liquiditaetsgradII: number | null;
  /**
   * In diesem Geschäftsmodell (keine Vorräte) rechnerisch identisch mit
   * Liquiditätsgrad II — wird dennoch ausgewiesen, da klassisch erwartet.
   */
  liquiditaetsgradIII: number | null;

  // -- Durchgang 4: zusätzliche moderne Kennzahlen --
  /** Anteil der Schriftverkehr-Dokumente mit quelle = agent */
  korrespondenzAutomatisierungsgrad: number | null;
  /** Gleich gewichteter Schnitt aus Buchhaltungs- und Korrespondenz-Automatisierung */
  gesamtAutomatisierungsgrad: number | null;
  /** Durchschnittliche KI-Konfidenz (0–1) aller klassifizierten Ablage-Dokumente */
  kiKonfidenzScore: number | null;
  /** Durchschnittliche Stunden von Upload bis Zuordnung eines Ablage-Dokuments */
  processingSpeedStunden: number | null;
  /** 100 − gewichtete Fehlerdichte aus dem letzten Prüflauf relativ zur Anzahl Stammdaten */
  dataQualityScore: number | null;
  /** 0–100, höher = riskanter: aus offenen Fehlern/Warnungen + niedriger Liquidität */
  riskExposureIndex: number;
}

export interface DashboardUebersicht {
  buchhaltung: BuchhaltungsUebersicht;
  objekte: DashboardObjektUebersicht;
  abrechnungen: DashboardAbrechnungsUebersicht;
  pruefung: DashboardPruefUebersicht;
  kennzahlen: DashboardKennzahlen;
  /** letzte Systemereignisse für den Aktivitäts-Feed */
  aktivitaet: SystemLogEintrag[];
}

// -------- Dashboard: Verlaufsdaten für Sparklines/Trendcharts --------
// Ausschließlich aus real vorhandenen, zeitgestempelten Daten abgeleitet
// (Buchungen, Prüfläufe, Systemprotokoll) — keine interpolierten oder
// künstlich erzeugten Punkte.

export interface DashboardBuchungsVerlaufPunkt {
  /** Tagesgranularität, ISO-Datum (YYYY-MM-DD) */
  datum: string;
  einnahmen: number;
  ausgaben: number;
  /** kumulierter Gewinn bis einschließlich diesem Tag */
  gewinnKumuliert: number;
}

export interface DashboardPruefVerlaufPunkt {
  datum: string;
  offeneBefunde: number;
}

export interface DashboardAktivitaetVerlaufPunkt {
  datum: string;
  anzahl: number;
}

export interface DashboardVerlauf {
  buchungen: DashboardBuchungsVerlaufPunkt[];
  pruefung: DashboardPruefVerlaufPunkt[];
  aktivitaet: DashboardAktivitaetVerlaufPunkt[];
}

// -------- AI Cost & Model Observatory (Durchgang 6) --------
// Instrumentiert den einen zentralen LLM-Aufrufpunkt (createChatCompletion in
// groq-client.ts), durch den JEDE Chat-Completion der App läuft — Agent-Chat,
// Klassifikation, Smart-Upload, Vertragsanalyse etc. Tokens kommen, wenn vom
// Provider geliefert, exakt aus `completion.usage`; sonst (nicht jeder
// OpenAI-kompatible Endpoint liefert das zuverlässig) fällt der Aufrufer auf
// eine Schätzung zurück und markiert den Eintrag entsprechend – nie stille
// Fantasiewerte.

export type AiProvider = "groq" | "cerebras" | "cloudflare" | "nvidia";

export interface AiCallLogEintrag {
  id: string;
  zeitpunkt: string;
  provider: AiProvider;
  model: string;
  /** Fallback-Stufe: 0 = Primärmodell erfolgreich, 1+ = so oft musste auf das nächste Modell ausgewichen werden */
  fallbackStufe: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** true = Tokens kommen exakt vom Provider; false = geschätzt (kein usage-Feld in der Antwort) */
  exakt: boolean;
  /** in USD; 0 für aktuell ausschließlich genutzte Free-Tier-Modelle */
  geschaetzteKostenUsd: number;
}

/** Optionale Referenzpreise (USD je 1 Mio. Tokens) für ein Modell — nur gesetzt, wenn es NICHT auf einem Free-Tier läuft. */
export interface AiModellPreis {
  inputProMio: number;
  outputProMio: number;
}

export interface AiModellStatistik {
  provider: AiProvider;
  model: string;
  aufrufe: number;
  fehlgeschlageneFallbacks: number;
  promptTokens: number;
  completionTokens: number;
  geschaetzteKostenUsd: number;
}

export interface AiProviderKatalogEintrag {
  provider: AiProvider;
  label: string;
  konfiguriert: boolean;
  benoetigteEnvVars: string[];
  hinweis: string;
}

export interface AiObservatoryUebersicht {
  gesamtAufrufe: number;
  gesamtPromptTokens: number;
  gesamtCompletionTokens: number;
  gesamtKostenUsd: number;
  proModell: AiModellStatistik[];
  providerKatalog: AiProviderKatalogEintrag[];
  letzteAufrufe: AiCallLogEintrag[];
}

// -------- Dashboard: regelbasierte Agent-Hinweise (Durchgang 5) --------
// Bewusst deterministisch/regelbasiert statt LLM-generiert: Aussagen über
// Liquidität, Risiko, Prüfbefunde etc. sind hier nachvollziehbar aus den
// echten Kennzahlen abgeleitet. Ein LLM-gestützter Interpretationslayer
// (freitextliche Einordnung, Rückfragen) kommt on-demand über den ohnehin
// vorhandenen Chat-Agenten hinzu — nicht als zusätzliche, unbelegte
// "KI-Meinung" auf dem Dashboard selbst.

export type AgentHinweisSchweregrad = "info" | "warnung" | "kritisch";

export interface AgentHinweis {
  id: string;
  schweregrad: AgentHinweisSchweregrad;
  text: string;
  /** Welche Kennzahl/Kachel den Hinweis ausgelöst hat, für Deep-Link/Hover */
  kpiId?: string;
}

// -------- Mein Kalender (Durchgang 8b) --------
// Persönliche Termine, mit optionalen Dokument-Anhängen aus der Ablage.
// "100% synchronisiert mit der App" wird dadurch erreicht, dass der Kalender
// zusätzlich zu den hier gespeicherten Terminen automatisch reale, bereits
// vorhandene Termine aus der App einblendet (Mietbeginn/-ende, Agent-
// Routinen, Prüfläufe) — siehe getKalenderEreignisse() in db.ts. Es werden
// keine synthetischen Termine erfunden.

export type KalenderKategorie = "Termin" | "Frist" | "Aufgabe" | "Erinnerung";

export interface KalenderEreignis {
  id: string;
  titel: string;
  beschreibung?: string;
  /** ISO-Datum/-Zeit, Start */
  datum: string;
  datumEnde?: string;
  ganztaegig: boolean;
  kategorie: KalenderKategorie;
  liegenschaftId?: string;
  /** Referenzen auf vorhandene Ablage-Dokumente, die an den Termin angehängt sind */
  dokumentIds: string[];
  erstelltVon?: string;
  createdAt: string;
  updatedAt: string;
}

/** Read-only, aus echten App-Daten abgeleiteter Kalendereintrag (keine eigene Speicherung). */
export interface AbgeleitetesKalenderEreignis {
  id: string;
  titel: string;
  datum: string;
  kategorie: KalenderKategorie;
  quelle: "Mietvertrag" | "Routine" | "Pruefung" | "Buchung";
  link?: string;
}

// -------- Team-Nachrichten (minimalistischer Messenger, Durchgang 8b) --------
// Bewusst ohne Benutzerkonten/Auth (die App hat aktuell kein Multi-User-
// System) — der Autorenname wird frei eingegeben/aus zuletzt verwendeten
// Namen gewählt. Funktional nutzbar, wenn mehrere Personen dieselbe
// deployte App öffnen, aber ohne echte Identitätsprüfung.

export interface TeamNachricht {
  id: string;
  autorName: string;
  text: string;
  emoji?: string;
  liegenschaftId?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// Observability / LLM Mission Control (Super Spielekind-Agent)
// ============================================================

/** Rate-Limit-Kategorie für Log-Parsing und Dashboard */
export type RateLimitKategorie =
  | "TPM"   // Tokens per Minute
  | "TPD"   // Tokens per Day
  | "RPM"   // Requests per Minute
  | "RPD"   // Requests per Day
  | "ZPM"   // (Reserve)
  | "ZPD";  // (Reserve)

export interface RateLimitEvent {
  id: string;
  zeitpunkt: string;
  provider: string;
  model: string;
  kategorie: RateLimitKategorie;
  limit: number;
  used: number;
  requested: number;
  warteSekunden: number;
  fallbackTo: string;
  fallbackStufe: number;
  gesamteKette: number;
}

/** Eintrag im Agent-Audit-Log */
export interface AgentAuditEintrag {
  id: string;
  zeitpunkt: string;
  aktion: string;
  detail: string;
  ergebnis: "ok" | "fehler" | "plausibel" | "unplausibel";
  kontext?: Record<string, unknown>;
}

/** Provider-Typ für das erweiterte Observability */
export type ObservableProvider =
  | "groq"
  | "cerebras"
  | "cloudflare"
  | "nvidia"
  | "openai"
  | "anthropic"
  | "google"
  | "mistral"
  | "together"
  | "openrouter"
  | "deepinfra"
  | "fireworks";

/** Modell-Katalog-Eintrag für das LLM Observatory */
export interface ModelCatalogEntry {
  id: string;
  provider: string;
  model: string;
  label: string;
  /** vollständiger API-Bezeichner */
  apiModel: string;
  /** Provider-Präfix in der Fallback-Kette */
  providerPrefix: string;
  /** Fallback-Position (1-basiert) */
  fallbackPriority: number;
  /** Anbieterfirma */
  company: string;
  /** Erscheinungsdatum (bekannt) */
  released?: string;
  /** Letztes bekanntes Update */
  lastUpdate?: string;
  /** Context Window (Tokens) */
  contextLength: number;
  /** Maximale Output-Tokens */
  maxOutput?: number;
  /** Unterstützte Features */
  capabilities: {
    vision: boolean;
    reasoning: boolean;
    functionCalling: boolean;
    jsonMode: boolean;
    structuredOutput: boolean;
    streaming: boolean;
    multilingual: boolean;
    toolUse: boolean;
    embedding: boolean;
  };
  /** Links zur Dokumentation */
  links: {
    api?: string;
    docs?: string;
    playground?: string;
    github?: string;
    changelog?: string;
    pricing?: string;
  };
  /** Gesundheitsstatus */
  health: {
    status: "green" | "gray" | "unknown";
    lastPingAt?: string;
    lastSuccessAt?: string;
    pingDurationMs?: number;
    errorRate?: number;
    /** Wie oft das Free-Tier-Limit überschritten wurde */
    freeTierExceededCount: number;
    rateLimitCount: number;
    totalCalls: number;
    successCalls: number;
    /** Summierte Tokens aus aiUsageLog (nur echte Aufrufe, kein Ping) */
    promptTokens?: number;
    completionTokens?: number;
  };
  /** Free-Tier-Info */
  freeTier?: {
    tpdLimit?: number;
    tpmLimit?: number;
    rpdLimit?: number;
    rpmLimit?: number;
    expiresAt?: string;
    dailyUsed: number;
  };
  /** Preis (USD pro 1M Tokens) – null = kostenlos */
  pricing?: {
    inputPerMillion: number;
    outputPerMillion: number;
    cachingDiscount?: number;
  };
  /** Der Agent hat dieses Modell zuletzt aktualisiert */
  lastAgentUpdate?: string;
  /** Quelle der Daten (auto-fetched / manual) */
  dataSource: "agent" | "manual" | "builtin";
}

/** LED-Typ für die LED-Wall */
export type LedTyp =
  | "fly" | "sqlite" | "supabase" | "cloudflare" | "groq" | "cerebras" | "nvidia" | "github" | "scheduler"
  | "cron" | "telegram" | "memory" | "agent" | "queue" | "background"
  | "backup" | "search" | "sse" | "websocket" | "push" | "mail"
  | "dns" | "https" | "ssl" | "storage" | "cache" | "ollama"
  | "local" | "api_keys" | "billing"
  // Hausverwaltungs-LEDs
  | "dokumente" | "ocr_queue" | "bk_bearbeitung" | "eigentuemerwechsel"
  | "mieterwechsel" | "kunden_rueckfragen" | "export" | "mahnlauf"
  | "wiedervorlagen" | "ki_agent" | "db_backup" | "sync_extern";

export interface LedEntry {
  id: LedTyp;
  label: string;
  status: "green" | "yellow" | "red" | "gray";
  blinker?: boolean;
  tooltip?: string;
  href?: string;
  /** Zusätzliche Key-Value-Zeilen für das Detail-Popover (Hover/Tap auf der LED-Wall). */
  detail?: { label: string; value: string }[];
}

/** Observability-Gesamtübersicht (für API) */
export interface ObservabilityOverview {
  /** Alle Modelle im Katalog */
  modelCatalog: ModelCatalogEntry[];
  /** Rate-Limit-Events (letzte 50) */
  recentRateLimits: RateLimitEvent[];
  /** LED-Wall-Status */
  ledWall: LedEntry[];
  /** Agent-Audit (letzte 30) */
  recentAudit: AgentAuditEintrag[];
  /** Zusammenfassung */
  summary: {
    totalModels: number;
    greenModels: number;
    grayModels: number;
    totalRateLimits: number;
    totalAudits: number;
    lastAgentRun?: string;
    funMode: boolean;
  };
}
