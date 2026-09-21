-- BetriebsKostenBot AI — Fachmodul-Schema (Pflichtenheft Immobilien/Liegenschaften)
-- ============================================================================
-- Ausführen NACH schema.sql, schema_business.sql und schema_auth.sql (nutzt
-- set_updated_at(), log_audit_change(), liegenschaften, gebaeude, wohnungen,
-- profiles). Wiederholbar (if not exists, drop trigger if exists).
--
-- Zweck: Die bisher nur in data/db.json gehaltenen Module Flurstücke, Grundbuch,
-- Verträge, Anlagen, Zähler, Räume, Veranstaltungen, Tickets, Handwerker
-- bekommen Tabellen (TECH-007, SEC-003, SEC-005). Zusätzlich sind die im
-- Erfüllungsstand identifizierten Modell-Lücken bereits enthalten; sie sind mit
-- "[Lücke: <ID>]" markiert. Für diese Spalten fehlen noch Typen in types.ts und
-- der Adapter in db-supabase.ts — dieses Skript ändert kein App-Verhalten.
--
-- Konventionen wie schema_business.sql: uuid-IDs 1:1 aus der JSON-Datei,
-- RLS aktiv ohne Policies (Zugriff nur per Service-Role), updated_at-Trigger,
-- Audit-Trigger am Ende.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Ergänzungen an bestehenden Tabellen
-- ---------------------------------------------------------------------------
-- [Lücke: IMM-001] Gebäude-Stammdaten
alter table gebaeude add column if not exists kuerzel text;
alter table gebaeude add column if not exists hauptnutzung text;
alter table gebaeude add column if not exists gebaeudeflaeche_qm numeric;
alter table gebaeude add column if not exists bild_stored_file_name text;
alter table gebaeude add column if not exists kostenstelle text;
alter table gebaeude add column if not exists innenauftrag text;
alter table gebaeude add column if not exists hausbeauftragte_ids uuid[] not null default '{}'; -- profiles.id

-- ---------------------------------------------------------------------------
-- 1. Zentrale Konfiguration (Erweiterbarkeit ohne Codeänderung, Kap. 23)
-- ---------------------------------------------------------------------------
create table if not exists stamm_auswahl (
  id uuid primary key default gen_random_uuid(),
  kategorie text not null, -- nutzungsart | anlagentyp | vertragstyp | ticketkategorie | dokumenttyp | flaechenart | pachtnutzung
  wert text not null,
  sortierung int not null default 0,
  aktiv boolean not null default true,
  meta jsonb not null default '{}'::jsonb, -- z.B. {"din":"NUF 4 ..."} bei Nutzungsarten
  created_at timestamptz not null default now(),
  unique (kategorie, wert)
);

-- [Lücke: TKT-Kategorien Kap. 15, DOK-003] Vorbelegung
insert into stamm_auswahl (kategorie, wert, sortierung) values
  ('ticketkategorie','Wartung',1),('ticketkategorie','Reparatur',2),('ticketkategorie','Leerung',3),
  ('ticketkategorie','Reinigung',4),('ticketkategorie','Montage',5),('ticketkategorie','Prüfung',6),
  ('ticketkategorie','Störungsmeldung',7)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Dokumente/Anhänge an beliebigen Objekten (DOK-001/002, TECH-005)
-- ---------------------------------------------------------------------------
-- Ersetzt die eingebetteten Anhang[]-Arrays. Ein Dokument hängt an genau einem
-- Objekt; Versionen laufen über vorgaenger_id. [Lücke: DOK-001 — jetzt auch
-- Raum, Gebäude, Zähler, Reservierung.]
create table if not exists fach_anhaenge (
  id uuid primary key default gen_random_uuid(),
  parent_typ text not null check (parent_typ in (
    'flurstueck','grundbuch','vertrag','anlage','anlagen_wartung','zaehler','raum',
    'gebaeude','reservierung','veranstaltungsflaeche','ticket','handwerker'
  )),
  parent_id uuid not null,
  typ text not null,
  datei_name text not null,
  stored_file_name text not null,
  mime_type text not null,
  hochgeladen_am timestamptz not null default now(),
  hochgeladen_von uuid references profiles(id),
  version int not null default 1,
  vorgaenger_id uuid references fach_anhaenge(id), -- DOK-004
  sensibel boolean not null default false,         -- [Lücke: DOK-005] Dokumentebene
  extrakt_text text,
  notizen text
);
create index if not exists fach_anhaenge_parent_idx on fach_anhaenge (parent_typ, parent_id);
create index if not exists fach_anhaenge_name_trgm_idx on fach_anhaenge using gin (datei_name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 3. Flurstücke, Teilflächen, Grundbuch (LIE)
-- ---------------------------------------------------------------------------
create table if not exists flurstuecke (
  id uuid primary key default gen_random_uuid(),
  nummer text unique,
  liegenschaft_id uuid not null references liegenschaften(id) on delete restrict,
  gemarkung text not null,
  flur text not null,
  flurstueck_nummer text not null,
  wirtschaftsart text not null,
  flaeche_qm numeric,
  grundbuchblatt text,
  grundbuchamt text,
  lage text,
  veranstaltungsfreigabe boolean not null default false,
  kostenstelle text,      -- [Lücke: LIE-005]
  innenauftrag text,      -- [Lücke: LIE-005]
  geometrie jsonb,        -- [Lücke: LIE-008] GeoJSON, sobald Geodaten vorliegen
  notizen text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (liegenschaft_id, gemarkung, flur, flurstueck_nummer) -- Dublettenvermeidung
);
drop trigger if exists trg_flurstuecke_updated_at on flurstuecke;
create trigger trg_flurstuecke_updated_at before update on flurstuecke
  for each row execute function set_updated_at();
create index if not exists flurstuecke_liegenschaft_idx on flurstuecke (liegenschaft_id);
create index if not exists flurstuecke_gemarkung_trgm_idx on flurstuecke using gin (gemarkung gin_trgm_ops);

-- [Lücke: LIE-005] Flurstück ↔ Gebäude (n:m)
create table if not exists flurstueck_gebaeude (
  flurstueck_id uuid not null references flurstuecke(id) on delete cascade,
  gebaeude_id uuid not null references gebaeude(id) on delete cascade,
  primary key (flurstueck_id, gebaeude_id)
);

-- [Lücke: LIE-004] Teilflächen mit Flächenart und Nutzung
create table if not exists flurstueck_teilflaechen (
  id uuid primary key default gen_random_uuid(),
  flurstueck_id uuid not null references flurstuecke(id) on delete cascade,
  bezeichnung text not null,
  flaechenart text,
  nutzungsart text,               -- Jagd | Fischerei | Kleingarten | Wiese | ... (stamm_auswahl)
  flaeche_qm numeric,
  veranstaltungsfreigabe boolean not null default false, -- LIE-010 je Teilfläche
  notizen text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_flurstueck_teilflaechen_updated_at on flurstueck_teilflaechen;
create trigger trg_flurstueck_teilflaechen_updated_at before update on flurstueck_teilflaechen
  for each row execute function set_updated_at();
create index if not exists flurstueck_teilflaechen_fs_idx on flurstueck_teilflaechen (flurstueck_id);

create table if not exists grundbuch_eintraege (
  id uuid primary key default gen_random_uuid(),
  flurstueck_id uuid not null references flurstuecke(id) on delete restrict, -- Historie (LIE-007) darf nicht mitgelöscht werden
  abteilung text not null check (abteilung in ('I','II','III')),
  lfd_nummer text not null,
  art text not null,
  berechtigter text not null,
  betrag numeric,
  waehrung text,
  beschreibung text,
  eingetragen_am date not null,
  geloescht_am date,
  geloescht_grund text,
  quelle text,            -- [Lücke: LIE-007] Quelle (z.B. Grundbuchauszug vom ...)
  notizen text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_grundbuch_eintraege_updated_at on grundbuch_eintraege;
create trigger trg_grundbuch_eintraege_updated_at before update on grundbuch_eintraege
  for each row execute function set_updated_at();
create index if not exists grundbuch_flurstueck_idx on grundbuch_eintraege (flurstueck_id, abteilung);

-- ---------------------------------------------------------------------------
-- 4. Räume (IMM) und Grundrisse
-- ---------------------------------------------------------------------------
create table if not exists raeume (
  id uuid primary key default gen_random_uuid(),
  nummer text unique,
  gebaeude_id uuid not null references gebaeude(id) on delete cascade,
  liegenschaft_id uuid references liegenschaften(id),
  etage text not null,
  laufende_nr int not null,
  bezeichnung text not null,
  nutzung text not null,
  din_gruppe text,
  flaeche numeric not null default 0,
  veranstaltungsflaeche boolean not null default false,
  zusammenhang_gruppe text,
  notizen text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (gebaeude_id, etage, laufende_nr)
);
drop trigger if exists trg_raeume_updated_at on raeume;
create trigger trg_raeume_updated_at before update on raeume
  for each row execute function set_updated_at();
create index if not exists raeume_gebaeude_idx on raeume (gebaeude_id, etage);

-- [Lücke: IMM-002/007] Grundrisse je Etage (Datei über fach_anhaenge,
-- Typ 'Grundriss'); Raumzuordnung optional per Koordinaten im Plan
create table if not exists grundrisse (
  id uuid primary key default gen_random_uuid(),
  gebaeude_id uuid not null references gebaeude(id) on delete cascade,
  etage text not null,
  anhang_id uuid references fach_anhaenge(id),
  bezeichnung text,
  created_at timestamptz not null default now(),
  unique (gebaeude_id, etage, anhang_id)
);
create table if not exists grundriss_raeume (
  grundriss_id uuid not null references grundrisse(id) on delete cascade,
  raum_id uuid not null references raeume(id) on delete cascade,
  geometrie jsonb, -- Polygon/Position im Plan
  primary key (grundriss_id, raum_id)
);

-- ---------------------------------------------------------------------------
-- 5. Verträge (VERTR) und Wiedervorlagen
-- ---------------------------------------------------------------------------
-- [Lücke: VERTR-001] Vertragspartner-Stamm mit Kontaktdaten
create table if not exists vertragspartner (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  ansprechpartner text,
  email text,
  telefon text,
  adresse text,
  rollen text[] not null default '{}', -- Pächter, Mieter, Dienstleister, ...
  notizen text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_vertragspartner_updated_at on vertragspartner;
create trigger trg_vertragspartner_updated_at before update on vertragspartner
  for each row execute function set_updated_at();
create index if not exists vertragspartner_name_trgm_idx on vertragspartner using gin (name gin_trgm_ops);

create table if not exists vertraege (
  id uuid primary key default gen_random_uuid(),
  nummer text unique,
  art text not null,
  bezeichnung text not null,
  vertragspartner text not null,                       -- bisheriger Freitext bleibt erhalten
  vertragspartner_id uuid references vertragspartner(id), -- [Lücke: VERTR-001]
  liegenschaft_id uuid references liegenschaften(id),
  flurstueck_id uuid references flurstuecke(id),
  gebaeude_id uuid references gebaeude(id),            -- [Lücke: Kap. 4]
  raum_id uuid references raeume(id),
  anlage_id uuid,                                      -- FK unten (Zirkelbezug)
  nutzungsart text,
  praeambel text,          -- [Lücke: VERTR-003]
  sachgegenstand text,     -- [Lücke: VERTR-003]
  zahlungsbedingungen text,-- [Lücke: VERTR-003]
  beginn date not null,
  ende date,
  unbefristet boolean not null default false,
  kuendigungsfrist text,                               -- Freitext bleibt
  kuendigungsfrist_monate int,                         -- [Lücke: VERTR-004/007] berechenbar
  kuendigung_zum text check (kuendigung_zum in ('Monatsende','Quartalsende','Halbjahresende','Jahresende','Vertragsende')),
  verlaengerung_monate int,                            -- [Lücke: VERTR-004]
  optionen text,                                       -- [Lücke: VERTR-004]
  betrag numeric,
  zahlungsintervall text,
  status text not null default 'Entwurf' check (status in ('Entwurf','Aktiv','Gekündigt','Beendet')),
  kostenstelle text,
  notizen text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_vertraege_updated_at on vertraege;
create trigger trg_vertraege_updated_at before update on vertraege
  for each row execute function set_updated_at();
create index if not exists vertraege_flurstueck_idx on vertraege (flurstueck_id);
create index if not exists vertraege_liegenschaft_idx on vertraege (liegenschaft_id);
create index if not exists vertraege_ende_idx on vertraege (ende) where status in ('Aktiv','Gekündigt');

-- [Lücke: VERTR-004/008, KAL-005] Wiedervorlagen/Fristen mit Vorlaufzeit
create table if not exists wiedervorlagen (
  id uuid primary key default gen_random_uuid(),
  bezug_typ text not null check (bezug_typ in ('vertrag','anlage','zaehler','ticket','flurstueck','reservierung','sonstige')),
  bezug_id uuid,
  titel text not null,
  faellig_am date not null,
  vorlauf_tage int not null default 30,
  eskalation_nach_tagen int,           -- KAL-005: nach Überfälligkeit
  zustaendig_id uuid references profiles(id),
  erledigt_am timestamptz,
  erzeugt_automatisch boolean not null default false, -- aus Vertrag/Anlage abgeleitet
  notizen text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_wiedervorlagen_updated_at on wiedervorlagen;
create trigger trg_wiedervorlagen_updated_at before update on wiedervorlagen
  for each row execute function set_updated_at();
create index if not exists wiedervorlagen_offen_idx on wiedervorlagen (faellig_am) where erledigt_am is null;
create index if not exists wiedervorlagen_bezug_idx on wiedervorlagen (bezug_typ, bezug_id);

-- ---------------------------------------------------------------------------
-- 6. Anlagen und Wartung (ANL, WART)
-- ---------------------------------------------------------------------------
create table if not exists wartungsfirmen ( -- [Lücke: WART-003]
  id uuid primary key default gen_random_uuid(),
  name text not null,
  ansprechpartner text,
  email text,
  telefon text,
  adresse text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_wartungsfirmen_updated_at on wartungsfirmen;
create trigger trg_wartungsfirmen_updated_at before update on wartungsfirmen
  for each row execute function set_updated_at();

create table if not exists anlagen (
  id uuid primary key default gen_random_uuid(),
  nummer text unique,
  typ text not null,
  bezeichnung text not null,
  liegenschaft_id uuid not null references liegenschaften(id),
  gebaeude_id uuid references gebaeude(id),
  etage text,                                      -- [Lücke: ANL-002]
  raum_id uuid references raeume(id),              -- [Lücke: ANL-002, IMM-007]
  standort_detail text,
  hersteller text,
  modell text,
  seriennummer text,
  baujahr int,
  wartungsfirma text,
  wartungsfirma_id uuid references wartungsfirmen(id), -- [Lücke: WART-003]
  wartungsvertrag_id uuid references vertraege(id),    -- [Lücke: ANL-004, WART-003]
  naechste_pruefung date,
  pruefintervall_monate int,
  status text not null default 'In Betrieb' check (status in ('In Betrieb','Wartung fällig','Außer Betrieb','Defekt')),
  notizen text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_anlagen_updated_at on anlagen;
create trigger trg_anlagen_updated_at before update on anlagen
  for each row execute function set_updated_at();
create index if not exists anlagen_gebaeude_idx on anlagen (gebaeude_id);
create index if not exists anlagen_faellig_idx on anlagen (naechste_pruefung);

alter table vertraege
  drop constraint if exists vertraege_anlage_fk,
  add constraint vertraege_anlage_fk foreign key (anlage_id) references anlagen(id) on delete set null;

create table if not exists anlagen_wartungen (
  id uuid primary key default gen_random_uuid(),
  anlage_id uuid not null references anlagen(id) on delete cascade,
  durchgefuehrt_am date not null,
  durchgefuehrt_von text,
  art text not null check (art in ('Wartung','Prüfung','Reparatur','Sonstiges')),
  ergebnis text check (ergebnis in ('Ohne Mängel','Mängel behoben','Mängel offen')),
  beschreibung text,
  naechste_faelligkeit date,
  kosten numeric,
  ticket_id uuid,          -- FK unten
  notizen text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_anlagen_wartungen_updated_at on anlagen_wartungen;
create trigger trg_anlagen_wartungen_updated_at before update on anlagen_wartungen
  for each row execute function set_updated_at();
create index if not exists anlagen_wartungen_anlage_idx on anlagen_wartungen (anlage_id, durchgefuehrt_am desc);

-- ---------------------------------------------------------------------------
-- 7. Zähler (ZAE)
-- ---------------------------------------------------------------------------
create table if not exists zaehler (
  id uuid primary key default gen_random_uuid(),
  zaehlernummer text not null,
  art text not null check (art in ('Strom','Gas','Wasser (kalt)','Wasser (warm)','Wärme','Sonstige')),
  einheit text not null,
  liegenschaft_id uuid not null references liegenschaften(id),
  gebaeude_id uuid references gebaeude(id),
  wohnung_id uuid references wohnungen(id),   -- bisherige 1:1-Zuordnung bleibt erhalten
  standort_detail text,
  einbau_datum date,
  status text not null default 'Aktiv' check (status in ('Aktiv','Ausgebaut','Defekt')),
  eigentuemer text check (eigentuemer in ('Eigener','Versorger')), -- [Lücke: ZAE-004]
  endverbraucher text,                                             -- [Lücke: ZAE-005]
  eichung_bis date,                                                -- [Lücke: ZAE-006]
  letzte_wartung date,                                             -- [Lücke: ZAE-006]
  naechste_wartung date,
  vorgaenger_id uuid references zaehler(id),                       -- [Lücke: ZAE-010] Zählerwechsel
  ausgebaut_am date,
  endstand numeric,
  notizen text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (art, zaehlernummer)
);
drop trigger if exists trg_zaehler_updated_at on zaehler;
create trigger trg_zaehler_updated_at before update on zaehler
  for each row execute function set_updated_at();
create index if not exists zaehler_gebaeude_idx on zaehler (gebaeude_id);

-- [Lücke: ZAE-002/003] Ein Zähler versorgt mehrere Flächen/Räume/Wohnungen
create table if not exists zaehler_versorgte_flaechen (
  id uuid primary key default gen_random_uuid(),
  zaehler_id uuid not null references zaehler(id) on delete cascade,
  wohnung_id uuid references wohnungen(id),
  raum_id uuid references raeume(id),
  flurstueck_id uuid references flurstuecke(id),
  anteil_prozent numeric check (anteil_prozent is null or (anteil_prozent >= 0 and anteil_prozent <= 100)),
  gueltig_von date,
  gueltig_bis date,        -- ZAE-010 Zuordnungsänderungen historisch
  check (num_nonnulls(wohnung_id, raum_id, flurstueck_id) = 1)
);
create index if not exists zaehler_versorgt_zaehler_idx on zaehler_versorgte_flaechen (zaehler_id);

create table if not exists zaehler_ablesungen (
  id uuid primary key default gen_random_uuid(),
  zaehler_id uuid not null references zaehler(id) on delete cascade,
  ablesedatum date not null,
  stand numeric not null,
  ableser text,
  quelle text check (quelle in ('Manuell','Import','Versorger','Fernauslesung','KI-Erkennung')), -- [Lücke: ZAE-008]
  notizen text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (zaehler_id, ablesedatum)
);
drop trigger if exists trg_zaehler_ablesungen_updated_at on zaehler_ablesungen;
create trigger trg_zaehler_ablesungen_updated_at before update on zaehler_ablesungen
  for each row execute function set_updated_at();
create index if not exists zaehler_ablesungen_idx on zaehler_ablesungen (zaehler_id, ablesedatum desc);

-- [Lücke: ZAE-007] Kosten je Zähler/Zeitraum
create table if not exists zaehler_kosten (
  id uuid primary key default gen_random_uuid(),
  zaehler_id uuid not null references zaehler(id) on delete cascade,
  von date not null,
  bis date not null,
  betrag numeric not null,
  waehrung text not null default 'EUR',
  beleg_anhang_id uuid references fach_anhaenge(id),
  notizen text,
  check (bis >= von)
);
create index if not exists zaehler_kosten_idx on zaehler_kosten (zaehler_id, von);

-- ---------------------------------------------------------------------------
-- 8. Veranstaltungsflächen und Reservierungen (VER)
-- ---------------------------------------------------------------------------
create table if not exists veranstaltungsflaechen (
  id uuid primary key default gen_random_uuid(),
  bezeichnung text not null,
  liegenschaft_id uuid not null references liegenschaften(id),
  gebaeude_id uuid references gebaeude(id),        -- [Lücke: VER-002]
  flurstueck_id uuid references flurstuecke(id),   -- [Lücke: VER-002]
  raum_id uuid references raeume(id),
  flaeche_qm numeric,
  kapazitaet int,
  ausstattung text,
  preis_pro_tag numeric,
  status text not null default 'Verfügbar' check (status in ('Verfügbar','Gesperrt')),
  notizen text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_veranstaltungsflaechen_updated_at on veranstaltungsflaechen;
create trigger trg_veranstaltungsflaechen_updated_at before update on veranstaltungsflaechen
  for each row execute function set_updated_at();

create extension if not exists btree_gist;

create table if not exists reservierungen (
  id uuid primary key default gen_random_uuid(),
  veranstaltungsflaeche_id uuid not null references veranstaltungsflaechen(id) on delete cascade,
  titel text not null,
  mieter text not null,
  kontakt text,
  vertragspartner_id uuid references vertragspartner(id), -- [Lücke: VER-005]
  vertrag_id uuid references vertraege(id),               -- [Lücke: VER-005]
  aufbau_beginn timestamptz,                              -- [Lücke: VER-006]
  beginn timestamptz not null,
  ende timestamptz not null,
  abbau_ende timestamptz,                                 -- [Lücke: VER-006]
  status text not null default 'Angefragt' check (status in ('Angefragt','Reserviert','Bestätigt','Storniert')), -- [Lücke: VER-003]
  preis numeric,
  notizen text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ende > beginn),
  -- VER-004: Doppelbelegung auf DB-Ebene ausgeschlossen (inkl. Auf-/Abbau)
  constraint reservierungen_keine_doppelbelegung exclude using gist (
    veranstaltungsflaeche_id with =,
    tstzrange(coalesce(aufbau_beginn, beginn), coalesce(abbau_ende, ende), '[)') with &&
  ) where (status in ('Reserviert','Bestätigt'))
);
drop trigger if exists trg_reservierungen_updated_at on reservierungen;
create trigger trg_reservierungen_updated_at before update on reservierungen
  for each row execute function set_updated_at();
create index if not exists reservierungen_flaeche_idx on reservierungen (veranstaltungsflaeche_id, beginn);

-- ---------------------------------------------------------------------------
-- 9. Handwerker und Tickets (TKT)
-- ---------------------------------------------------------------------------
create table if not exists handwerker (
  id uuid primary key default gen_random_uuid(),
  nummer text unique,
  name text not null,
  firma text,
  gewerk text not null,
  email text,
  telefon text,
  adresse text,
  stundensatz numeric,
  status text not null default 'aktiv' check (status in ('aktiv','inaktiv','gesperrt')),
  lebenslauf text,
  qualifikationen text[] not null default '{}',
  notizen text,
  trackrecord jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_handwerker_updated_at on handwerker;
create trigger trg_handwerker_updated_at before update on handwerker
  for each row execute function set_updated_at();

create table if not exists tickets (
  id uuid primary key default gen_random_uuid(),
  nummer text unique, -- TKT-003 laufende Auftragsnummer (Counter wie bisher)
  titel text not null,
  beschreibung text,
  status text not null default 'Eingang' check (status in (
    'Eingang','Zur Freigabe','Freigegeben','Zugewiesen','In Bearbeitung',
    'Wartet','Erledigt','Geschlossen','Abgelehnt','Storniert'   -- [Lücke: TKT-010] Wartet/Geschlossen neu
  )),
  prioritaet text not null default 'mittel' check (prioritaet in ('niedrig','mittel','hoch','notfall')),
  quelle text not null default 'Intern',
  kategorie text,          -- Wert aus stamm_auswahl('ticketkategorie') [Lücke: Kap. 15]
  ticket_art text,
  schadensart text,
  liegenschaft_id uuid references liegenschaften(id),
  gebaeude_id uuid references gebaeude(id),
  wohnung_id uuid references wohnungen(id),
  mieter_id uuid references mieter(id),
  raum_id uuid references raeume(id),       -- [Lücke: TKT-005]
  anlage_id uuid references anlagen(id),    -- [Lücke: TKT-005, UC-04]
  zaehler_id uuid references zaehler(id),
  handwerker_id uuid references handwerker(id),
  zugewiesen_am timestamptz,
  bearbeiter_id uuid references profiles(id),     -- [Lücke: TKT-001/002] interner Mitarbeiter
  anfordernder_id uuid references profiles(id),   -- [Lücke: TKT-001/004]
  anfordernder_kontakt text,                      -- [Lücke: TKT-004] Signatur-/Kontaktdaten
  erstellt_von text,
  melder_typ text,
  zustaendiger_mitarbeiter text,
  freigabe_erforderlich boolean not null default false,
  freigegeben_von text,
  freigegeben_am timestamptz,
  freigabe_kommentar text,
  ablehnungsgrund text,
  abgelehnt_von text,
  abgelehnt_am timestamptz,
  sla_reaktion_bis timestamptz,
  sla_loesung_bis timestamptz,
  erste_reaktion_am timestamptz,
  kostenstelle text,
  innenauftrag text,                              -- [Lücke: TKT-006]
  kostenart text,
  bestellnummer text,
  kosten_schaetzung numeric,
  rechnungssumme numeric,
  rechnungsstatus text,
  vereinbarter_termin timestamptz,
  mieter_verfuegbarkeit text,
  schluesselstatus text,
  betriebsunterbrechung_risiko boolean,
  sicherheitsfreigabe_erforderlich boolean,
  wartungsvertrag_vorhanden boolean,
  wartungspartner text,
  faelligkeitsdatum date,
  erledigt_am timestamptz,                        -- [Lücke: TKT-009]
  erledigt_von_id uuid references profiles(id),   -- [Lücke: TKT-009]
  arbeitszeit_minuten int check (arbeitszeit_minuten is null or arbeitszeit_minuten >= 0), -- [Lücke: TKT-009]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_tickets_updated_at on tickets;
create trigger trg_tickets_updated_at before update on tickets
  for each row execute function set_updated_at();
create index if not exists tickets_status_idx on tickets (status, faelligkeitsdatum);
create index if not exists tickets_gebaeude_idx on tickets (gebaeude_id);
create index if not exists tickets_anlage_idx on tickets (anlage_id);
create index if not exists tickets_bearbeiter_idx on tickets (bearbeiter_id);
create index if not exists tickets_titel_trgm_idx on tickets using gin (titel gin_trgm_ops);

alter table anlagen_wartungen
  drop constraint if exists anlagen_wartungen_ticket_fk,
  add constraint anlagen_wartungen_ticket_fk foreign key (ticket_id) references tickets(id) on delete set null;

-- TKT-011: Historie als Kind-Tabelle (statt eingebettetem Array)
create table if not exists ticket_historie (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets(id) on delete cascade,
  zeitpunkt timestamptz not null default now(),
  status text,
  text text not null,
  von text
);
create index if not exists ticket_historie_idx on ticket_historie (ticket_id, zeitpunkt);

create table if not exists ticket_nachrichten (
  id uuid primary key default gen_random_uuid(),
  nummer text unique,
  ticket_id uuid not null references tickets(id) on delete cascade,
  von text not null,
  text text not null,
  intern boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ticket_nachrichten_idx on ticket_nachrichten (ticket_id, created_at);

-- ---------------------------------------------------------------------------
-- 10. Lösch- und Aufbewahrungsregeln (SEC-004)
-- ---------------------------------------------------------------------------
create table if not exists aufbewahrungsregeln (
  id uuid primary key default gen_random_uuid(),
  objekt_typ text not null unique, -- z.B. 'fach_anhaenge:Rechnung', 'tickets', 'zaehler_ablesungen'
  aufbewahrung_monate int not null check (aufbewahrung_monate >= 0),
  aktion_nach_frist text not null default 'pruefen' check (aktion_nach_frist in ('pruefen','anonymisieren','loeschen')),
  rechtsgrundlage text,
  aktiv boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_aufbewahrungsregeln_updated_at on aufbewahrungsregeln;
create trigger trg_aufbewahrungsregeln_updated_at before update on aufbewahrungsregeln
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- 11. RLS aktivieren (ohne Policies = nur Service-Role, wie schema_business.sql)
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  for t in select unnest(array[
    'stamm_auswahl','fach_anhaenge','flurstuecke','flurstueck_gebaeude','flurstueck_teilflaechen',
    'grundbuch_eintraege','raeume','grundrisse','grundriss_raeume','vertragspartner','vertraege',
    'wiedervorlagen','wartungsfirmen','anlagen','anlagen_wartungen','zaehler',
    'zaehler_versorgte_flaechen','zaehler_ablesungen','zaehler_kosten','veranstaltungsflaechen',
    'reservierungen','handwerker','tickets','ticket_historie','ticket_nachrichten','aufbewahrungsregeln'
  ])
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 12. Audit-Trigger (SEC-003) — gleiches Muster wie schema_auth.sql
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  for t in select unnest(array[
    'gebaeude','flurstuecke','flurstueck_teilflaechen','grundbuch_eintraege','raeume',
    'vertragspartner','vertraege','wiedervorlagen','anlagen','anlagen_wartungen','zaehler',
    'zaehler_ablesungen','zaehler_kosten','veranstaltungsflaechen','reservierungen',
    'tickets','handwerker','fach_anhaenge','aufbewahrungsregeln'
  ])
  loop
    execute format('drop trigger if exists trg_%I_audit on %I', t, t);
    execute format(
      'create trigger trg_%I_audit after insert or update or delete on %I
       for each row execute function log_audit_change()', t, t
    );
  end loop;
end $$;
