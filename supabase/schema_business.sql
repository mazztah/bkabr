-- BetriebsKostenBot AI — Geschäftsdaten-Schema (Migration JSON-Datei → Supabase)
-- ============================================================================
-- Einmalig im Supabase SQL Editor ausführen (nach schema.sql, welches bereits
-- agent_runs für das Agent-Gedächtnis anlegt). Dieses Schema bildet 1:1 die
-- Struktur aus src/lib/db.ts (DbShape) ab, die bisher in data/db.json liegt.
--
-- Leitprinzipien dieses Schemas:
-- 1. IDs bleiben uuid und werden 1:1 aus der bestehenden JSON-Datei übernommen
--    (die App erzeugt IDs bereits per crypto.randomUUID() in utils.ts::uid()),
--    d.h. KEIN Remapping nötig — Migration ist ID-stabil.
-- 2. Echte fachliche Hierarchien/Referenzen werden zu Foreign Keys
--    (Liegenschaft → Gebäude → Wohnung → Mieter → Mietvertrag, Buchung →
--    Konto/Abrechnungskreis, …) — bisher nur "by convention" als lose
--    *Id-Strings im Code vorhanden.
-- 3. Log-/Snapshot-artige, nicht relational abzufragende Unterstrukturen
--    (Chat-Verlauf, Versions-Historie, Prüf-Historie, Kriterien-Ergebnisse)
--    bleiben bewusst JSONB — exakt das Prinzip, das ihr bei agent_runs.steps
--    bereits gewählt habt.
-- 4. Fachlich wertvolle Unterlisten (Rechnungspositionen, Dokumente,
--    Kostenaufteilung je Wohnung, Prüfbefunde) werden zu echten Kind-Tabellen,
--    weil sie erst dadurch durchsuchbar/aggregierbar werden (KPIs, Volltext-
--    und Fuzzy-Suche).
-- 5. RLS ist überall aktiviert, aber (noch) ohne Policies — wie bei
--    agent_runs bedeutet das: Zugriff ausschließlich über den
--    Service-Role-Key (serverseitig), niemals vom Browser aus. Echte
--    Policies (pro Nutzer/Rolle) kommen mit der Workplace-/Auth-Phase.

create extension if not exists pg_trgm;
create extension if not exists pgcrypto; -- für gen_random_uuid(), falls noch nicht aktiv

-- Wiederverwendbarer Trigger: setzt updated_at automatisch bei jedem UPDATE,
-- unabhängig davon, ob die App-Schicht es mitschickt (Sicherheitsnetz).
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ============================================================================
-- 1. Stammdaten-Hierarchie: Liegenschaft → Gebäude → Wohnung → Mieter
-- ============================================================================

create table if not exists liegenschaften (
  id uuid primary key default gen_random_uuid(),
  nummer text unique,
  name text not null,
  strasse text not null,
  hausnummer text not null,
  plz text not null,
  ort text not null,
  grundstuecksflaeche numeric,
  flurstueck text,
  notizen text,
  status text not null default 'aktiv' check (status in ('aktiv', 'inaktiv')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_liegenschaften_updated_at before update on liegenschaften
  for each row execute function set_updated_at();
create index if not exists liegenschaften_name_trgm_idx on liegenschaften using gin (name gin_trgm_ops);
create index if not exists liegenschaften_ort_trgm_idx on liegenschaften using gin (ort gin_trgm_ops);
create index if not exists liegenschaften_strasse_trgm_idx on liegenschaften using gin (strasse gin_trgm_ops);

create table if not exists gebaeude (
  id uuid primary key default gen_random_uuid(),
  nummer text unique,
  liegenschaft_id uuid not null references liegenschaften(id) on delete cascade,
  name text not null,
  baujahr int,
  anzahl_einheiten int,
  heizungsart text,
  notizen text,
  status text not null default 'aktiv' check (status in ('aktiv', 'inaktiv')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_gebaeude_updated_at before update on gebaeude
  for each row execute function set_updated_at();
create index if not exists gebaeude_liegenschaft_idx on gebaeude (liegenschaft_id);

create table if not exists wohnungen (
  id uuid primary key default gen_random_uuid(),
  nummer text unique,
  gebaeude_id uuid not null references gebaeude(id) on delete cascade,
  bezeichnung text not null,
  typ text not null check (typ in ('Wohnung', 'Gewerbe', 'Stellplatz', 'Sonstige')),
  flaeche numeric,
  zimmer numeric,
  miteigentumsanteil numeric,
  notizen text,
  status text not null default 'aktiv' check (status in ('aktiv', 'inaktiv')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_wohnungen_updated_at before update on wohnungen
  for each row execute function set_updated_at();
create index if not exists wohnungen_gebaeude_idx on wohnungen (gebaeude_id);
create index if not exists wohnungen_bezeichnung_trgm_idx on wohnungen using gin (bezeichnung gin_trgm_ops);

create table if not exists mieter (
  id uuid primary key default gen_random_uuid(),
  nummer text unique,
  wohnung_id uuid not null references wohnungen(id) on delete cascade,
  name text not null,
  email text,
  telefon text,
  mietbeginn date,
  mietende date,
  kaltmiete numeric,
  nebenkosten_vorauszahlung numeric,
  notizen text,
  status text not null default 'aktiv' check (status in ('aktiv', 'inaktiv')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_mieter_updated_at before update on mieter
  for each row execute function set_updated_at();
create index if not exists mieter_wohnung_idx on mieter (wohnung_id);
create index if not exists mieter_name_trgm_idx on mieter using gin (name gin_trgm_ops);

create table if not exists mieter_soll_ist (
  id uuid primary key default gen_random_uuid(),
  mieter_id uuid not null references mieter(id) on delete cascade,
  jahr text not null,
  soll_vorauszahlung numeric not null default 0,
  ist_zahlungen numeric not null default 0,
  notiz text
);
create index if not exists mieter_soll_ist_mieter_idx on mieter_soll_ist (mieter_id);

create table if not exists mieter_mietkonto (
  id uuid primary key default gen_random_uuid(),
  mieter_id uuid not null references mieter(id) on delete cascade,
  datum date not null,
  typ text not null check (typ in ('Miete', 'Nebenkosten', 'Kaution', 'Sonstiges')),
  soll numeric not null default 0,
  ist numeric not null default 0,
  text text
);
create index if not exists mieter_mietkonto_mieter_idx on mieter_mietkonto (mieter_id);

create table if not exists mietvertraege (
  id uuid primary key default gen_random_uuid(),
  nummer text unique,
  wohnung_id uuid not null references wohnungen(id) on delete cascade,
  mieter_id uuid references mieter(id) on delete set null,
  datei_name text not null,
  stored_file_name text,
  mime_type text not null,
  hochgeladen_am timestamptz not null default now(),
  soll_miete numeric,
  nebenkosten_vorauszahlung numeric,
  bk_vorauszahlung numeric,
  hk_vorauszahlung numeric,
  warmmiete numeric,
  kaution numeric,
  mietbeginn date,
  mietende date,
  flaeche numeric,
  zimmer numeric,
  status text not null default 'Entwurf' check (status in ('Entwurf', 'Aktiv', 'Beendet')),
  extrakt_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_mietvertraege_updated_at before update on mietvertraege
  for each row execute function set_updated_at();
create index if not exists mietvertraege_wohnung_idx on mietvertraege (wohnung_id);
create index if not exists mietvertraege_mieter_idx on mietvertraege (mieter_id);

-- ============================================================================
-- 2. Eigentümer & Property-Management-Verträge
-- ============================================================================

create table if not exists eigentuemer (
  id uuid primary key default gen_random_uuid(),
  nummer text unique,
  liegenschaft_id uuid not null references liegenschaften(id) on delete cascade,
  name text not null,
  anschrift text,
  email text,
  telefon text,
  miteigentumsanteil numeric,
  vollmacht_von date,
  vollmacht_bis date,
  datei_name text,
  stored_file_name text,
  mime_type text,
  extrakt_text text,
  notizen text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_eigentuemer_updated_at before update on eigentuemer
  for each row execute function set_updated_at();
create index if not exists eigentuemer_liegenschaft_idx on eigentuemer (liegenschaft_id);
create index if not exists eigentuemer_name_trgm_idx on eigentuemer using gin (name gin_trgm_ops);

create table if not exists pm_vertraege (
  id uuid primary key default gen_random_uuid(),
  nummer text unique,
  liegenschaft_id uuid not null references liegenschaften(id) on delete cascade,
  datei_name text not null,
  stored_file_name text,
  mime_type text not null,
  hochgeladen_am timestamptz not null default now(),
  verwalter_name text,
  auftraggeber_name text,
  honorar_modell text,
  honorar_satz numeric,
  leistungsumfang text,
  laufzeit_beginn date,
  laufzeit_ende date,
  kuendigungsfrist text,
  status text not null default 'Entwurf' check (status in ('Entwurf', 'Aktiv', 'Beendet')),
  extrakt_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_pm_vertraege_updated_at before update on pm_vertraege
  for each row execute function set_updated_at();
create index if not exists pm_vertraege_liegenschaft_idx on pm_vertraege (liegenschaft_id);

-- Gemeinsame Anhänge-Tabelle für Mietvertrag/Eigentümer/PM-Vertrag (Nachtrag,
-- Grundbuchauszug, Vollmacht, Liegenschaftskarte, …). Bewusst EINE Tabelle
-- statt drei Kopien (Anhang-Struktur ist überall identisch) — parent_typ +
-- parent_id statt FK, weil Postgres keine polymorphen FKs kennt; die
-- Anwendungsschicht garantiert die Konsistenz (wie bisher schon in db.ts).
create table if not exists anhaenge (
  id uuid primary key default gen_random_uuid(),
  parent_typ text not null check (parent_typ in ('mietvertrag', 'eigentuemer', 'pm_vertrag')),
  parent_id uuid not null,
  typ text not null check (typ in (
    'Liegenschaftskarte', 'Objektbeschreibung', 'Mieterliste', 'Grundbuchauszug',
    'Kaufvertrag', 'Vollmacht', 'Eigentuemerbeschluss', 'Nachtrag',
    'Uebergabeprotokoll', 'Sonstiges'
  )),
  datei_name text not null,
  stored_file_name text not null,
  mime_type text not null,
  hochgeladen_am timestamptz not null default now(),
  extrakt_text text,
  notizen text
);
create index if not exists anhaenge_parent_idx on anhaenge (parent_typ, parent_id);

-- ============================================================================
-- 3. Abrechnungen (Kernobjekt) + Dokumente + Positionen
-- ============================================================================

create table if not exists abrechnungen (
  id uuid primary key default gen_random_uuid(),
  nummer text unique,
  name text not null,
  adresse text not null,
  objekt_typ text not null check (objekt_typ in ('Wohnung', 'Haus', 'Gewerbe')),
  zeitraum text not null,
  gesamt_summe numeric not null default 0,
  status text not null default 'Rohdaten' check (status in ('Rohdaten', 'Validierung', 'Fertig')),
  version int not null default 1,
  liegenschaft_id uuid references liegenschaften(id) on delete set null,
  gebaeude_id uuid references gebaeude(id) on delete set null,
  wohnung_id uuid references wohnungen(id) on delete set null,
  vermieter_name text,
  vermieter_anschrift text,
  verwalter_kontakt text,
  mieter_name text,
  mieter_anschrift text,
  nutzungszeitraum text,
  -- ehemals "workspace": Skalarfelder direkt hier, positionen als Kind-Tabelle
  mieteinnahmen numeric not null default 0,
  nebenkosten numeric not null default 0,
  vorauszahlungen numeric,
  abrechnungstext text,
  anschreiben text,
  -- Chat & Versions-Historie bleiben JSONB (log-artig, kein Query-Bedarf über
  -- einzelne Nachrichten hinweg)
  chat jsonb not null default '[]'::jsonb,
  history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_abrechnungen_updated_at before update on abrechnungen
  for each row execute function set_updated_at();
create index if not exists abrechnungen_liegenschaft_idx on abrechnungen (liegenschaft_id);
create index if not exists abrechnungen_wohnung_idx on abrechnungen (wohnung_id);
create index if not exists abrechnungen_status_idx on abrechnungen (status);
create index if not exists abrechnungen_name_trgm_idx on abrechnungen using gin (name gin_trgm_ops);

create table if not exists abrechnung_positionen (
  id uuid primary key default gen_random_uuid(),
  abrechnung_id uuid not null references abrechnungen(id) on delete cascade,
  name text not null,
  betrag numeric not null default 0,
  beschreibung text,
  gesamtkosten numeric,
  umlageschluessel text,
  sortierung int not null default 0
);
create index if not exists abrechnung_positionen_abrechnung_idx on abrechnung_positionen (abrechnung_id);

create table if not exists abrechnung_dokumente (
  id uuid primary key default gen_random_uuid(),
  abrechnung_id uuid not null references abrechnungen(id) on delete cascade,
  nummer text,
  name text not null,
  mime_type text not null,
  size bigint not null default 0,
  uploaded_at timestamptz not null default now(),
  extrakt_text text,
  stored_file_name text,
  rechnungsnummer text,
  rechnungsdatum text,
  betrag numeric,
  leistungsart text,
  leistungsort text,
  auftraggeber text,
  auftragnehmer text,
  firma text,
  rechnungsadresse text,
  -- Prüfergebnis (Merkmale/Score/Freigabe) bleibt als kompaktes JSONB-Objekt
  pruefung jsonb
);
create index if not exists abrechnung_dokumente_abrechnung_idx on abrechnung_dokumente (abrechnung_id);
create index if not exists abrechnung_dokumente_extrakt_trgm_idx
  on abrechnung_dokumente using gin (extrakt_text gin_trgm_ops);

-- ============================================================================
-- 4. Kontoauszüge & Ablage (Poststelle)
-- ============================================================================

create table if not exists kontoauszuege (
  id uuid primary key default gen_random_uuid(),
  nummer text unique,
  liegenschaft_id uuid references liegenschaften(id) on delete set null,
  datei_name text not null,
  stored_file_name text,
  mime_type text not null,
  hochgeladen_am timestamptz not null default now(),
  zeitraum text,
  anzahl_transaktionen int not null default 0,
  gebuchte_transaktionen int not null default 0,
  extrakt_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_kontoauszuege_updated_at before update on kontoauszuege
  for each row execute function set_updated_at();
create index if not exists kontoauszuege_liegenschaft_idx on kontoauszuege (liegenschaft_id);

create table if not exists ablage (
  id uuid primary key default gen_random_uuid(),
  nummer text unique,
  datei_name text not null,
  stored_file_name text not null,
  mime_type text not null,
  groesse bigint not null default 0,
  hochgeladen_am timestamptz not null default now(),
  status text not null default 'neu' check (status in ('neu', 'in_pruefung', 'zugeordnet', 'verworfen')),
  erkannter_typ text,
  konfidenz numeric,
  zugeordnet_an jsonb, -- {art, id, label}
  extrakt_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_ablage_updated_at before update on ablage
  for each row execute function set_updated_at();
create index if not exists ablage_status_idx on ablage (status);
create index if not exists ablage_datei_name_trgm_idx on ablage using gin (datei_name gin_trgm_ops);
create index if not exists ablage_extrakt_trgm_idx on ablage using gin (extrakt_text gin_trgm_ops);

-- ============================================================================
-- 5. System-Log & Plausibilitätsprüfung
-- ============================================================================

create table if not exists system_log (
  id uuid primary key default gen_random_uuid(),
  zeitpunkt timestamptz not null default now(),
  typ text not null check (typ in ('upload', 'zuordnung', 'anlage', 'aenderung', 'loeschung', 'pruefung', 'fehler', 'info')),
  text text not null,
  bezug jsonb -- {art, id}
);
create index if not exists system_log_zeitpunkt_idx on system_log (zeitpunkt desc);
create index if not exists system_log_typ_idx on system_log (typ);
create index if not exists system_log_text_trgm_idx on system_log using gin (text gin_trgm_ops);

create table if not exists pruef_laeufe (
  id uuid primary key default gen_random_uuid(),
  nummer text unique,
  gestartet_am timestamptz not null default now(),
  abgeschlossen_am timestamptz,
  modul_status jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_pruef_laeufe_updated_at before update on pruef_laeufe
  for each row execute function set_updated_at();

create table if not exists pruef_befunde (
  id uuid primary key default gen_random_uuid(),
  pruef_lauf_id uuid not null references pruef_laeufe(id) on delete cascade,
  modul text not null,
  schweregrad text not null check (schweregrad in ('hinweis', 'warnung', 'fehler')),
  titel text not null,
  beschreibung text not null,
  betroffene jsonb not null default '[]'::jsonb, -- [{art, id, label}]
  link_href text,
  kontext jsonb,
  vorschlag jsonb,
  status text not null default 'offen' check (status in ('offen', 'uebernommen', 'abgelehnt'))
);
create index if not exists pruef_befunde_lauf_idx on pruef_befunde (pruef_lauf_id);
create index if not exists pruef_befunde_status_idx on pruef_befunde (status);

-- ============================================================================
-- 6. Agent-Schedules (wiederkehrende Aufträge)
-- ============================================================================

create table if not exists agent_schedules (
  id uuid primary key default gen_random_uuid(),
  nummer text unique,
  name text not null,
  prompt text not null,
  recurrence jsonb not null, -- {art: intervall|taeglich|woechentlich, ...}
  aktiv boolean not null default true,
  liegenschaft_id uuid references liegenschaften(id) on delete set null,
  liegenschaft_name text,
  next_run_at timestamptz not null,
  last_run_at timestamptz,
  historie jsonb not null default '[]'::jsonb, -- letzte 20 Läufe
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_agent_schedules_updated_at before update on agent_schedules
  for each row execute function set_updated_at();
create index if not exists agent_schedules_next_run_idx on agent_schedules (next_run_at) where aktiv;

-- ============================================================================
-- 7. Buchhaltung: Buchungen, Konten, Abrechnungskreise
-- ============================================================================

create table if not exists konten (
  id uuid primary key default gen_random_uuid(),
  nummer text unique,
  name text not null,
  art text not null check (art in ('Aktiva', 'Passiva')),
  kategorie text not null check (kategorie in (
    'Anlagevermögen', 'Umlaufvermögen', 'Liquide Mittel',
    'Eigenkapital', 'Verbindlichkeiten', 'Rückstellungen'
  )),
  saldo numeric not null default 0,
  notizen text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_konten_updated_at before update on konten
  for each row execute function set_updated_at();

create table if not exists abrechnungskreise (
  id uuid primary key default gen_random_uuid(),
  nummer text unique,
  name text not null,
  beschreibung text,
  umlageschluessel text not null check (umlageschluessel in ('Wohnflaeche', 'Miteigentumsanteil', 'Gleich')),
  liegenschaft_id uuid references liegenschaften(id) on delete set null,
  wohnung_ids uuid[], -- Teilmenge, falls nicht "alle Wohnungen der Liegenschaft"
  ist_standard boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_abrechnungskreise_updated_at before update on abrechnungskreise
  for each row execute function set_updated_at();

create table if not exists buchungen (
  id uuid primary key default gen_random_uuid(),
  nummer text unique,
  datum date not null,
  typ text not null check (typ in ('Einnahme', 'Ausgabe')),
  kategorie text not null,
  betrag numeric not null,
  beschreibung text,
  liegenschaft_id uuid references liegenschaften(id) on delete set null,
  beleg_typ text check (beleg_typ in ('Rechnung', 'Abrechnung', 'Kontoauszug', 'Kaufvertrag', 'Manuell')),
  beleg_id text,
  beleg_freitext text,
  rechnungsdaten jsonb, -- {rechnungsnummer, rechnungsdatum, lieferant, leistungsart}
  abrechnungskreis_id uuid references abrechnungskreise(id) on delete set null,
  storniert boolean not null default false,
  storniert_durch_buchung_id uuid references buchungen(id) on delete set null,
  ist_storno_buchung boolean not null default false,
  storniert_von_buchung_id uuid references buchungen(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_buchungen_updated_at before update on buchungen
  for each row execute function set_updated_at();
create index if not exists buchungen_liegenschaft_idx on buchungen (liegenschaft_id);
create index if not exists buchungen_datum_idx on buchungen (datum desc);
create index if not exists buchungen_typ_kategorie_idx on buchungen (typ, kategorie);

create table if not exists buchung_aufteilung (
  id uuid primary key default gen_random_uuid(),
  buchung_id uuid not null references buchungen(id) on delete cascade,
  wohnung_id uuid not null references wohnungen(id) on delete cascade,
  wohnung_bezeichnung text,
  mieter_id uuid references mieter(id) on delete set null,
  mieter_name text,
  anteil numeric not null, -- 0..1
  betrag numeric not null
);
create index if not exists buchung_aufteilung_buchung_idx on buchung_aufteilung (buchung_id);
create index if not exists buchung_aufteilung_wohnung_idx on buchung_aufteilung (wohnung_id);

-- ============================================================================
-- 8. Schriftverkehr
-- ============================================================================

create table if not exists schriftverkehr (
  id uuid primary key default gen_random_uuid(),
  nummer text unique,
  template_id text not null,
  template_label text not null,
  mieter_id uuid not null references mieter(id) on delete cascade,
  mieter_name text not null,
  wohnung_id uuid references wohnungen(id) on delete set null,
  gebaeude_id uuid references gebaeude(id) on delete set null,
  liegenschaft_id uuid references liegenschaften(id) on delete set null,
  liegenschaft_name text,
  betreff text not null,
  text text not null,
  werte jsonb not null default '{}'::jsonb,
  status text not null default 'Entwurf' check (status in ('Entwurf', 'Versandbereit', 'Versendet', 'Archiviert')),
  quelle text not null check (quelle in ('manuell', 'agent')),
  final_stored_file_name text,
  final_datei_name text,
  finalisiert_am timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_schriftverkehr_updated_at before update on schriftverkehr
  for each row execute function set_updated_at();
create index if not exists schriftverkehr_mieter_idx on schriftverkehr (mieter_id);
create index if not exists schriftverkehr_status_idx on schriftverkehr (status);
create index if not exists schriftverkehr_text_trgm_idx on schriftverkehr using gin (text gin_trgm_ops);

-- ============================================================================
-- 9. Investoren
-- ============================================================================

create table if not exists investoren (
  id uuid primary key default gen_random_uuid(),
  nummer text unique,
  firma text not null,
  ansprechpartner_name text,
  ansprechpartner_rolle text,
  email text,
  telefon text,
  webseite text,
  linkedin_url text,
  xing_url text,
  land text not null,
  hub text,
  sektoren text[] not null default '{}',
  kurzprofil text,
  ticke_groesse text,
  sprache text,
  quelle text,
  quelle_datum date,
  status text not null default 'vorschlag' check (status in ('vorschlag', 'freigegeben', 'kontaktiert', 'in_gespraech', 'abgelehnt')),
  score numeric,
  kriterien_ergebnis jsonb not null default '[]'::jsonb,
  notizen text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_investoren_updated_at before update on investoren
  for each row execute function set_updated_at();
create index if not exists investoren_firma_trgm_idx on investoren using gin (firma gin_trgm_ops);
create index if not exists investoren_status_idx on investoren (status);

create table if not exists investor_anschreiben (
  id uuid primary key default gen_random_uuid(),
  nummer text unique,
  investor_id uuid not null references investoren(id) on delete cascade,
  investor_firma text not null,
  betreff text not null,
  text text not null,
  status text not null default 'Entwurf' check (status in ('Entwurf', 'Versandbereit', 'Versendet', 'Archiviert')),
  quelle text not null check (quelle in ('manuell', 'agent')),
  final_stored_file_name text,
  final_datei_name text,
  finalisiert_am timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_investor_anschreiben_updated_at before update on investor_anschreiben
  for each row execute function set_updated_at();
create index if not exists investor_anschreiben_investor_idx on investor_anschreiben (investor_id);

create table if not exists investor_strategie_berichte (
  id uuid primary key default gen_random_uuid(),
  nummer text unique,
  investor_id uuid not null references investoren(id) on delete cascade,
  investor_firma text not null,
  wirtschaftliche_ziele text,
  zusammenfassung text not null,
  punkte jsonb not null default '[]'::jsonb, -- [{titel, beschreibung}]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_investor_strategie_berichte_updated_at before update on investor_strategie_berichte
  for each row execute function set_updated_at();
create index if not exists investor_strategie_berichte_investor_idx on investor_strategie_berichte (investor_id);

-- ============================================================================
-- 10. Kalender & Team-Nachrichten
-- ============================================================================

create table if not exists kalender_ereignisse (
  id uuid primary key default gen_random_uuid(),
  titel text not null,
  beschreibung text,
  datum timestamptz not null,
  datum_ende timestamptz,
  ganztaegig boolean not null default false,
  kategorie text not null check (kategorie in ('Termin', 'Frist', 'Aufgabe', 'Erinnerung')),
  liegenschaft_id uuid references liegenschaften(id) on delete set null,
  dokument_ids uuid[] not null default '{}',
  erstellt_von text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_kalender_ereignisse_updated_at before update on kalender_ereignisse
  for each row execute function set_updated_at();
create index if not exists kalender_ereignisse_datum_idx on kalender_ereignisse (datum);

-- team_nachrichten: aktuell noch ohne Auth (autor_name ist Freitext) — siehe
-- Kommentar in types.ts. author_id (uuid, FK auf auth.users) kommt in der
-- Workplace-/Auth-Phase dazu, ohne Breaking Change (nullable Spalte).
create table if not exists team_nachrichten (
  id uuid primary key default gen_random_uuid(),
  autor_name text not null,
  text text not null,
  emoji text,
  liegenschaft_id uuid references liegenschaften(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_team_nachrichten_updated_at before update on team_nachrichten
  for each row execute function set_updated_at();

-- ============================================================================
-- 11. Zähler & App-Einstellungen (ersetzen db.counters / db.observabilityMeta)
-- ============================================================================

create table if not exists counters (
  key text primary key,
  value int not null default 0
);

-- Atomarer Zähler-Increment für die Supabase-seitige Nummernvergabe
-- (nextNummer-Äquivalent für Module, die per DB_SUPABASE_MODULES bereits auf
-- Supabase laufen). Als DB-Funktion statt read-then-write in JS, damit
-- parallele Requests sich nicht dieselbe Nummer schnappen (race condition).
create or replace function increment_counter(p_key text)
returns int
language plpgsql
as $$
declare
  new_value int;
begin
  insert into counters (key, value) values (p_key, 1)
  on conflict (key) do update set value = counters.value + 1
  returning value into new_value;
  return new_value;
end;
$$;

create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
create trigger trg_app_settings_updated_at before update on app_settings
  for each row execute function set_updated_at();

-- ============================================================================
-- 12. Observability (ergänzt agent_runs aus schema.sql)
-- ============================================================================

create table if not exists ai_usage_log (
  id uuid primary key default gen_random_uuid(),
  zeitpunkt timestamptz not null default now(),
  provider text not null,
  model text not null,
  fallback_stufe int not null default 0,
  prompt_tokens int not null default 0,
  completion_tokens int not null default 0,
  total_tokens int not null default 0,
  exakt boolean not null default true,
  geschaetzte_kosten_usd numeric not null default 0
);
create index if not exists ai_usage_log_zeitpunkt_idx on ai_usage_log (zeitpunkt desc);
create index if not exists ai_usage_log_provider_model_idx on ai_usage_log (provider, model);

create table if not exists rate_limit_events (
  id uuid primary key default gen_random_uuid(),
  zeitpunkt timestamptz not null default now(),
  provider text not null,
  model text not null,
  kategorie text not null check (kategorie in ('TPM', 'TPD', 'RPM', 'RPD', 'ZPM', 'ZPD')),
  limit_wert int,
  used int,
  requested int,
  warte_sekunden numeric,
  fallback_to text,
  fallback_stufe int,
  gesamte_kette int
);
create index if not exists rate_limit_events_zeitpunkt_idx on rate_limit_events (zeitpunkt desc);

create table if not exists agent_audit (
  id uuid primary key default gen_random_uuid(),
  zeitpunkt timestamptz not null default now(),
  aktion text not null,
  detail text,
  ergebnis text not null check (ergebnis in ('ok', 'fehler', 'plausibel', 'unplausibel')),
  kontext jsonb
);
create index if not exists agent_audit_zeitpunkt_idx on agent_audit (zeitpunkt desc);

create table if not exists model_health (
  catalog_id text primary key,
  health jsonb,
  updated_at timestamptz not null default now()
);
create trigger trg_model_health_updated_at before update on model_health
  for each row execute function set_updated_at();

-- ============================================================================
-- RLS: überall aktiv, keine Policies → nur Service-Role-Zugriff (serverseitig)
-- ============================================================================

do $$
declare
  t text;
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public'
      and tablename in (
        'liegenschaften','gebaeude','wohnungen','mieter','mieter_soll_ist',
        'mieter_mietkonto','mietvertraege','eigentuemer','pm_vertraege','anhaenge',
        'abrechnungen','abrechnung_positionen','abrechnung_dokumente',
        'kontoauszuege','ablage','system_log','pruef_laeufe','pruef_befunde',
        'agent_schedules','konten','abrechnungskreise','buchungen','buchung_aufteilung',
        'schriftverkehr','investoren','investor_anschreiben','investor_strategie_berichte',
        'kalender_ereignisse','team_nachrichten','counters','app_settings',
        'ai_usage_log','rate_limit_events','agent_audit','model_health'
      )
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;
