/**
 * Erfüllungsmatrix zum Pflichtenheft (Kap. 28 „Anbieterantwort / Bewertungsmatrix“).
 * Selbsteinschätzung anhand des Code-Stands vom 20.09.2026 (Abgleich gegen Code, inkl. Korrekturen zu zu optimistischen Einträgen) – NICHT durch Abnahmetests belegt.
 * Bei Funktionsänderungen bitte hier nachziehen; die Seite /pflichtenheft rendert diese Liste.
 */
export type Erfuellung = "erfuellt" | "teilweise" | "offen";

export interface Anforderung {
  id: string;
  modul: string;
  text: string;
  status: Erfuellung;
  link?: string;
  bemerkung?: string;
}

const M = {
  LIE: "Liegenschaften",
  IMM: "Immobilien",
  VER: "Veranstaltungen",
  VERTR: "Verträge",
  KAL: "Kalender",
  ANL: "Anlagen",
  WART: "Wartung",
  TKT: "Tickets",
  ZAE: "Zähler",
  DOK: "Dokumente",
  UX: "Suche & UX",
  TECH: "Technik",
  SEC: "Datenschutz",
  MIG: "Migration",
} as const;

type Row = [id: string, text: string, status: Erfuellung, link?: string, bemerkung?: string];

const rows = (modul: string, list: Row[]): Anforderung[] =>
  list.map(([id, text, status, link, bemerkung]) => ({ id, modul, text, status, link, bemerkung }));

const E = "erfuellt" as const;
const T = "teilweise" as const;
const O = "offen" as const;

export const ANFORDERUNGEN: Anforderung[] = [
  ...rows(M.LIE, [
    ["LIE-001", "≥ 3.000 Flurstücke mit eindeutiger Identifikation", T, "/flurstuecke", "Dublettenprüfung im POST (Gemarkung/Flur/Nr.) ergänzt. Alle Daten liegen weiter in db.json (Supabase-Adapter vorhanden, unter 3.200 Datensätzen getestet), Lasttest der App offen."],
    ["LIE-002", "Flurstücksakte mit Bild/Karte und Katasterangaben", T, "/flurstuecke", "Bild-Upload vorhanden; Karte fehlt"],
    ["LIE-003", "Lfd. Nr., Gemarkung, Flur, Flurstück, Wirtschaftsart, Lage, Größe", E, "/flurstuecke", "Alle Felder vorhanden; „Lage“ und Freigabe werden jetzt auch beim Anlegen (POST) übernommen."],
    ["LIE-004", "Flächenarten und Zuordnung von Teilflächen", T, "/flurstuecke", "Gesamtfläche vorhanden; Teilflächen fehlen"],
    ["LIE-005", "Verknüpfung mit Gebäuden, Verträgen, Dokumenten, Kostenstellen", T, "/flurstuecke", "Verträge/Anhänge verknüpft; Gebäude und Kostenstelle offen"],
    ["LIE-006", "Grundbuchdaten Abt. I, II, III", E, "/flurstuecke"],
    ["LIE-007", "Historisierung mit Änderungsdatum und Quelle", E, "/flurstuecke", "Eintragsdatum, Rötung mit Grund und Feld „Quelle“ (Formular, API, Anzeige) vorhanden. Audit-Log nur mit Supabase."],
    ["LIE-008", "Kartendarstellung / Geodaten", O, undefined, "Kein Kartendienst eingebunden"],
    ["LIE-009", "Pachtverträge (Fläche, Partner, Laufzeit, Entgelt, Bedingungen, Fristen, Dokumente)", T, "/vertraege", "Bedingungen nur als Freitext"],
    ["LIE-010", "Freigabe/Sperre für Kurzzeitvermietung", E, "/flurstuecke", "Flag am Flurstück; für Räume über /raeume"],
  ]),
  ...rows(M.IMM, [
    ["IMM-001", "Gebäude-Stammdaten (Adresse, Nutzung, Fläche, Bild, Kostenstelle, Hausbeauftragte)", T, "/gebaeude", "Name, Baujahr, Heizung vorhanden; Adresse, Bild, Kostenstelle, Hausbeauftragte fehlen"],
    ["IMM-002", "Grundrisspläne je Etage", O, undefined, "Upload/Zuordnung noch nicht umgesetzt"],
    ["IMM-003", "Räume je Etage mit lfd. Nr., Nutzung, Fläche", E, "/raeume", "Neu in Durchgang 14"],
    ["IMM-004", "Flächenangaben nach DIN 277 / Flächenverordnung", E, "/raeume", "DIN-277-Gruppen; WoFlV nicht separat"],
    ["IMM-005", "Nutzungsgruppen zusammenfassen und auswerten", E, "/raeume", "Neu in Durchgang 14"],
    ["IMM-006", "Zusammenhängende Veranstaltungsflächen markieren und freigeben", T, "/raeume", "Flag + Verbundgruppe; Übernahme ins Veranstaltungsmodul offen"],
    ["IMM-007", "Grundrisse ↔ Räume; räumliche Zuordnung technischer Anlagen", T, "/anlagen", "Anlagenstandort nur als Freitext, keine Raum-Referenz"],
  ]),
  ...rows(M.VER, [
    ["VER-001", "Eigene Maske für Veranstaltungsflächen", E, "/veranstaltungsflaechen"],
    ["VER-002", "Fläche, Kapazität, Lage, Verfügbarkeit, Gebäude/Flurstück", T, "/veranstaltungsflaechen", "Kein Bezug zu Gebäude/Raum/Flurstück; Verfügbarkeit nur indirekt"],
    ["VER-003", "Anfragen, Reservierungen, bestätigte Veranstaltungen unterscheiden", T, "/veranstaltungsflaechen", "Statusmodell gegen Kap. 10 abgleichen"],
    ["VER-004", "Doppelbelegung verhindern oder als Konflikt anzeigen", E, "/veranstaltungsflaechen", "Konfliktprüfung in der Reservierungs-API"],
    ["VER-005", "Verknüpfung mit Verträgen, Partnern, Flächen, Kalender", T, "/veranstaltungsflaechen", "Kein Vertragsbezug an der Reservierung"],
    ["VER-006", "Veranstaltungszeiträume sowie Auf-/Abbauzeiten", O, undefined, "Nur Beginn/Ende"],
  ]),
  ...rows(M.VERTR, [
    ["VERTR-001", "Vertragspartner mit Kontaktdaten und Rollen", T, "/vertraege", "Partner als Text; kein Partnerstamm"],
    ["VERTR-002", "Vertragstypen und Vertragsstatus", E, "/vertraege"],
    ["VERTR-003", "Präambel, Sachgegenstand, Objekt, Entgelt, Bedingungen", T, "/vertraege", "Teilweise in Notizen"],
    ["VERTR-004", "Beginn, Ende, Kündigungsfristen, Verlängerung, Optionen, Wiedervorlagen", T, "/vertraege", "Verlängerung/Optionen/Wiedervorlage fehlen"],
    ["VERTR-005", "PDF speichern, öffnen, Objektakte zuordnen", T, "/vertraege", "Der PDF-Link wird angezeigt, wenn storedFileName gesetzt ist. Weder /vertraege noch der Flurstück-Reiter „Verträge“ hat einen Upload, das POST verwirft Dateifelder."],
    ["VERTR-006", "Mehrere Dokumentversionen und Anlagen", O, "/ablage", "Kein Weg, Anhänge oder Versionen an einen Vertrag zu hängen (Feld anhaenge ohne Oberfläche). Versionierung existiert nur in der Ablage."],
    ["VERTR-007", "Fristen automatisch in den Kalender", T, "/kalender"],
    ["VERTR-008", "Erinnerungen mit konfigurierbaren Vorlaufzeiten", O],
    ["VERTR-009", "Filter nach Objekt, Partner, Art, Status, Frist", T, "/vertraege"],
  ]),
  ...rows(M.KAL, [
    ["KAL-001", "Zentraler Kalender (Veranstaltungen, Fristen, Wartungen, Prüfungen, Tickets)", T, "/kalender", "Abgeleitete Ereignisse vorhanden; Vollständigkeit prüfen"],
    ["KAL-002", "Filter nach Gebäude, Flurstück, Fläche, Anlage, Vertrag, Mitarbeiter, Terminart", O, undefined, "Kein Filter im Kalender; nur Flurstück-Reiter vorgefiltert"],
    ["KAL-003", "Konflikte und Überschneidungen visuell erkennbar", O],
    ["KAL-004", "Termine aus Fachmodulen erzeugen und rückverlinken", T, "/kalender"],
    ["KAL-005", "Erinnerungen und Eskalation überfälliger Fristen", O],
  ]),
  ...rows(M.ANL, [
    ["ANL-001", "Vollständige Anlagenliste je Gebäude", T, "/anlagen", "Katalog mit 49 eindeutigen Typen (Kap. 13 nennt „Weitere Anlage“ zweimal) plus 12 Altbestandstypen, Typ frei erweiterbar."],
    ["ANL-002", "Räumliche Zuordnung (Gebäude, Etage, Raum, Bereich)", T, "/anlagen", "Gebäude + Freitext; keine Raum-Referenz"],
    ["ANL-003", "Typ, Hersteller, Baujahr, Wartungsfirma, letzte Wartung", E, "/anlagen", "Katalog mit 50 Positionen neu"],
    ["ANL-004", "Wartungsverträge als PDF und im Vertragsmanagement verknüpft", O, "/anlagen", "Kein PDF-Upload an der Anlage, keine Verknüpfung zu Wartungsverträgen im Vertragsmodul."],
    ["ANL-005", "Wartungs-/Prüftermine im Kalender", E, "/kalender"],
    ["ANL-006", "Status, Bemerkungen, Dokumente, Historie", T, "/anlagen", "Status (4 Werte), Notizen und Wartungshistorie vorhanden. Das Feld für Dokumente hat keine Oberfläche."],
  ]),
  ...rows(M.WART, [
    ["WART-001", "Wartungszyklen und Prüfintervalle je Anlage", E, "/anlagen"],
    ["WART-002", "Letzte/nächste Wartung regelbasiert führen", T, "/instandhaltung", "Regelbasierte Einstufung überfällig/≤ 30/≤ 90 Tage vorhanden."],
    ["WART-003", "Wartungsfirmen und -verträge verknüpfen", T, "/anlagen", "Firma als Text"],
    ["WART-004", "Wartungsnachweise und Protokolle als PDF", O, "/anlagen", "Kein Dokumentweg an Anlage oder Wartungseintrag."],
    ["WART-005", "Wartungskalender mit Veranstaltungen und Fristen zusammenführen", T, "/kalender", "Wiedervorlagen fehlen"],
    ["WART-006", "Überfällige Wartungen als offene Aufgaben sichtbar", E, "/instandhaltung", "Neu, inkl. Ticket-Erzeugung"],
  ]),
  ...rows(M.TKT, [
    ["TKT-001", "Mitarbeiter inkl. Arbeitsplatz als Bearbeiter/Anfordernde", T, "/systemadministration/nutzer", "Zuständiger als Text"],
    ["TKT-002", "Tickets direkt Mitarbeitern zuweisen", T, "/ticketsystem", "Zuweisung an Handwerker; interner Mitarbeiter nur als Text"],
    ["TKT-003", "Eindeutige laufende Auftragsnummer", E, "/ticketsystem"],
    ["TKT-004", "Anfordernde Person inkl. Signatur-/Kontaktdaten", T, "/ticketsystem"],
    ["TKT-005", "Liegenschaft, Gebäude, Raum/Bereich, Objekt", T, "/ticketsystem", "Raum-Referenz fehlt"],
    ["TKT-006", "Kostenstelle und/oder Innenauftrag", T, "/ticketsystem", "Innenauftrag fehlt"],
    ["TKT-007", "Fälligkeit, Priorität, Dringlichkeit", E, "/ticketsystem", "SLA aus Priorität"],
    ["TKT-008", "Aufgabenbeschreibung und auszuführende Arbeiten", E, "/ticketsystem"],
    ["TKT-009", "Erledigung, Datum, benötigte Arbeitszeit", T, "/ticketsystem", "Arbeitszeit fehlt"],
    ["TKT-010", "Status neu, angenommen, in Bearbeitung, wartet, erledigt, geschlossen", T, "/ticketsystem", "Eigenes Workflow-Modell; Mapping offen"],
    ["TKT-011", "Historie aller Änderungen", T, "/ticketsystem", "Historie mit Zeitpunkt, Status, Text, Von, aber nur für Statuswechsel, Zuweisung, Freigabe und Ablehnung."],
    ["TKT-012", "Anhänge, Fotos, Dokumente", E, "/ticketsystem"],
  ]),
  ...rows(M.ZAE, [
    ["ZAE-001", "Zähler Gas/Wasser/Strom je Gebäude und Fläche", T, "/zaehler", "Strom, Gas, Wasser (kalt/warm), Wärme, Sonstige. Das Formular kennt nur Liegenschaft und Freitext-Standort, Gebäude und Wohnung sind nur per API setzbar."],
    ["ZAE-002", "Zähler mehreren versorgten Flächen zuordnen", O, "/zaehler", "Nur eine Wohnung je Zähler"],
    ["ZAE-003", "Übersicht für Zähler mit mehreren Versorgten", O],
    ["ZAE-004", "Zählerart, -nummer, Eigentümer (eigener/Versorger)", T, "/zaehler", "Eigentümer fehlt"],
    ["ZAE-005", "Nutzer/Endverbraucher und versorgte Fläche", T, "/zaehler"],
    ["ZAE-006", "Menge, Einheit, Eichung, Wartung", T, "/zaehler", "Eichung/Wartung fehlen"],
    ["ZAE-007", "Kosten und Verbrauch je Energieträger", T, "/zaehler"],
    ["ZAE-008", "Zählerstände mit Datum, Quelle, Ableser", T, "/zaehler", "Quelle fehlt"],
    ["ZAE-009", "Verbrauchsauswertungen je Zähler, Fläche, Gebäude, Zeitraum", T, "/zaehler"],
    ["ZAE-010", "Zählerwechsel und Zuordnungsänderungen nachvollziehbar", T, "/zaehler", "Über Audit-Log"],
  ]),
  ...rows(M.DOK, [
    ["DOK-001", "PDFs allen relevanten Objekten und Vorgängen zuordnen", T, "/ablage", "Anhänge fehlen an Raum, Gebäude, Zähler, Reservierung"],
    ["DOK-002", "Dokumente über die Objektakte erreichbar", T],
    ["DOK-003", "Dokumenttypen und Metadaten konfigurierbar", T, "/ablage"],
    ["DOK-004", "Versionierung und Ablagehistorie", E, "/ablage"],
    ["DOK-005", "Berechtigungen auch für sensible Dokumente", T, "/ablage", "Modulebene; Dokumentebene offen"],
    ["DOK-006", "Volltextsuche in Metadaten; optional OCR", T, "/ablage", "OCR vorhanden"],
  ]),
  ...rows(M.UX, [
    ["UX-001", "Globale Suche über alle Objektarten", T, undefined, "Räume und Mitarbeiter noch nicht indexiert"],
    ["UX-002", "Schnellzugriff / zuletzt verwendete Datensätze", T, undefined, "Neu: 'Zuletzt verwendet' in der Cmd/Ctrl+K-Suche (localStorage, pro Browser); Tracking bislang nur bei Suchauswahl, nicht bei Direktnavigation"],
    ["UX-003", "Dashboards (Tickets, Verträge, Wartungen, Veranstaltungen, Fristen)", T, undefined, "/portfolio zeigt offene Tickets, Verträge mit Ende in 90 Tagen, überfällige Prüfungen, kommende Reservierungen und Bestandszahlen je Liegenschaft."],
    ["UX-004", "Auswertungen nach Gebäude, Fläche, Nutzung, Kostenstelle, Partner, Zeitraum", T, "/auswertung"],
    ["UX-005", "Listen filter-, sortier- und exportierbar", T, undefined, "Export vorhanden; Sortierung uneinheitlich"],
    ["UX-006", "Objektakte ohne Medienbruch navigierbar", T],
    ["UX-007", "Responsive Masken", T],
    ["UX-008", "Auswahllisten, Suchfelder, Plausibilitätsprüfungen", T],
    ["UX-009", "Pflichtfelder, Status und Fristen visuell eindeutig", T, undefined, "Neue Bausteine (Chips, Pflichtfeld-Marker) in Durchgang 14"],
  ]),
  ...rows(M.TECH, [
    ["TECH-001", "Offene, dokumentierte API", T, undefined, "REST-Routen vorhanden; keine OpenAPI-Doku"],
    ["TECH-002", "Import aus CSV/XLSX", T, "/smart-upload"],
    ["TECH-003", "Export XLSX/CSV/PDF", T, undefined, "Export XLSX/CSV/PDF nur für Abrechnungen; sonst vereinzelt CSV"],
    ["TECH-004", "Kartendienste / GIS-Schnittstelle", O],
    ["TECH-005", "Revisionssichere, datenschutzkonforme Ablage", T],
    ["TECH-006", "Zentrale Authentifizierung/Berechtigungen; optional Verzeichnisdienst", T, "/systemadministration/nutzer", "Verzeichnisdienst offen"],
    ["TECH-007", "Auslegung für 140 Gebäude / 3.000+ Flurstücke", T, undefined, "Fachmodule laufen weiter über db.json. Adapter für Flurstücke und Grundbuch (paginiert, geprüft mit 3.200 Flurstücken) und schema_fachmodule.sql liegen vor; Rest der Module offen."],
    ["TECH-008", "Sicherung, Wiederherstellung, Protokollierung", T, undefined, "readDb() überschreibt defektes JSON nicht mehr, rollierende .bak-Kopie. Backup-/Restore-Konzept und Tests fehlen weiter."],
  ]),
  ...rows(M.SEC, [
    ["SEC-001", "Datenminimierung bei personenbezogenen Daten", O, undefined, "Kein Datenminimierungskonzept, keine Maskierung. Vertrags-, Konto- und Mieterdaten werden an externe LLM-Anbieter gesendet (Groq, Cerebras, Cloudflare, NVIDIA, Mistral, OpenRouter)."],
    ["SEC-002", "Rollenbasierte Einschränkung sensibler Daten", T, "/systemadministration/nutzer", "Modulprüfung in allen Fachrouten, KI-Agent prüft Rechte je Tool, PATCH-Whitelist bei Verträgen/Anlagen. Offen: Objekt-Scope wird nirgends erzwungen, Ticketbearbeiter sieht alle Tickets, Dashboard-/Log-Routen nur mit Login."],
    ["SEC-003", "Protokollierung wesentlicher Änderungen", T, undefined, "logAudit nur mit Supabase und fail open; bulk-delete jetzt protokolliert. Weiterhin ohne Audit: smart-upload, upload, kalender, team-nachrichten, Nachträge."],
    ["SEC-004", "Konfigurierbare Lösch- und Aufbewahrungsregeln", O],
    ["SEC-005", "Backup und Wiederherstellung nach Betriebskonzept", O],
  ]),
  ...rows(M.MIG, [
    ["MIG-001", "Bestandsdaten analysieren, bereinigen, überführen", T, "/smart-upload"],
    ["MIG-002", "Importvorlagen und Mappingregeln", O],
    ["MIG-003", "PDFs mit migrierten Objekten verknüpfen", T, "/smart-upload"],
    ["MIG-004", "Testmigration und Datenqualitätsabnahme", O],
    ["MIG-005", "Schulungs- und Rollenkonzept", T, undefined, "Rollenkonzept dokumentiert; Schulung offen"],
  ]),
];

export const STATUS_LABEL: Record<Erfuellung, string> = {
  erfuellt: "Erfüllt",
  teilweise: "Teilweise",
  offen: "Offen",
};
