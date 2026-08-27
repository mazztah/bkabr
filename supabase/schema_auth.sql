-- BetriebsKostenBot AI — Auth, Rollen/Rechte & Audit-Log (Phase 0, Durchgang 14)
-- ============================================================================
-- Einmalig im Supabase SQL Editor ausführen, NACH schema.sql und
-- schema_business.sql. Idempotent (create if not exists / on conflict do
-- nothing), kann also gefahrlos erneut ausgeführt werden.
--
-- Bezug zum Pflichtenheft "Immobilien- und Liegenschaftsmanagement":
--   §3  Rollen und Berechtigungen  → roles, role_permissions, user_roles
--   §20 SEC-001 bis SEC-005        → audit_log, has_permission(), RLS-Policies
--
-- Leitprinzip (wie bei schema_business.sql): additiv und risikofrei. Diese
-- Migration schaltet NICHTS im laufenden Betrieb um — sie legt nur die
-- Tabellen/Funktionen an. Die tatsächliche Durchsetzung in der App
-- (Login-Pflicht, Rechteprüfung in den API-Routen) ist bewusst ein
-- separater, einzeln testbarer Schritt (siehe supabase/AUTH_AND_RBAC.md).
--
-- Wichtiger Architektur-Hinweis: Die App spricht Supabase serverseitig über
-- den SERVICE_ROLE_KEY an (umgeht RLS grundsätzlich, siehe supabase.ts).
-- Die hier definierten RLS-Policies sind daher "defense in depth" für den
-- Fall künftiger direkter Client-Zugriffe (z.B. Realtime-Subscriptions) —
-- die EIGENTLICHE Rechtedurchsetzung für die bestehenden Next.js-API-Routen
-- erfolgt in src/lib/rbac.ts (siehe requireUser()/hasPermission() dort).

create extension if not exists pgcrypto;

-- ============================================================================
-- 1. Profile (1:1 zu auth.users) + automatisches Anlegen bei Registrierung
-- ============================================================================

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  aktiv boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_profiles_updated_at before update on profiles
  for each row execute function set_updated_at();

-- Legt bei jeder Registrierung (auth.users INSERT) automatisch ein Profil an.
-- Neue Nutzer haben zunächst KEINE Rolle (= keine Rechte), bis ein
-- Systemadministrator sie einer Rolle zuweist (Prinzip: geschlossen by
-- default, siehe SEC-001 Datenminimierung).
create or replace function handle_new_auth_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

-- ============================================================================
-- 2. Rollen (§3 Pflichtenheft — neun vordefinierte Rollen)
-- ============================================================================

create table if not exists roles (
  id text primary key, -- slug, z.B. 'systemadministration'
  name text not null,
  beschreibung text
);

insert into roles (id, name, beschreibung) values
  ('systemadministration', 'Systemadministration', 'Benutzer, Rollen, Stammdaten, Konfiguration.'),
  ('immobilienverwaltung', 'Immobilienverwaltung', 'Gebäude, Räume, Flächen, Anlagen und zugehörige Verträge.'),
  ('liegenschaftsverwaltung', 'Liegenschaftsverwaltung', 'Flurstücke, Grundbuch, Pacht- und Nutzungsverträge.'),
  ('vertragsmanagement', 'Vertragsmanagement', 'Verträge, Fristen, Wiedervorlagen und Dokumente.'),
  ('veranstaltungsmanagement', 'Veranstaltungsmanagement', 'Veranstaltungsflächen, Reservierungen und Kalender.'),
  ('haustechnik', 'Haustechnik', 'Anlagen, Wartungen, Prüfungen und Tickets.'),
  ('finanzen', 'Finanzen/Kostenstellen', 'Kostenstellen, Innenaufträge, Kosten und Auswertungen.'),
  ('lesebrechtigte', 'Leseberechtigte', 'Zugriff auf freigegebene Informationen und Dokumente.'),
  ('ticketbearbeiter', 'Ticketbearbeiter', 'Zugriff auf zugewiesene und berechtigte Tickets.')
on conflict (id) do nothing;

create table if not exists user_roles (
  user_id uuid not null references profiles(id) on delete cascade,
  role_id text not null references roles(id) on delete cascade,
  zugewiesen_am timestamptz not null default now(),
  zugewiesen_von uuid references profiles(id),
  primary key (user_id, role_id)
);

-- ============================================================================
-- 3. Rechte je Rolle × Modul × Aktion
-- ============================================================================
-- module orientiert sich an §2 (Projektumfang) des Pflichtenhefts.
-- Weitere Module (z.B. 'zaehler', 'anlagen' als eigenständiges Modul statt
-- Teil von 'immobilien') können bei Bedarf per einfachem INSERT ergänzt
-- werden — bewusst KEIN Enum-Typ, damit Erweiterbarkeit ohne
-- Schemaänderung möglich bleibt (siehe Pflichtenheft, Kriterium
-- "Erweiterbarkeit").

create table if not exists role_permissions (
  role_id text not null references roles(id) on delete cascade,
  modul text not null,
  aktion text not null check (aktion in ('read', 'write', 'delete', 'admin')),
  primary key (role_id, modul, aktion)
);

-- Default-Rechtematrix, aus §3 des Pflichtenhefts abgeleitet.
-- 'systemadministration' bekommt admin auf alle bisher bekannten Module.
do $$
declare
  m text;
begin
  for m in select unnest(array[
    'immobilien','liegenschaften','pacht_nutzung','veranstaltungen','vertraege',
    'kalender','anlagen','ticketsystem','zaehler','dokumente','finanzen'
  ])
  loop
    insert into role_permissions (role_id, modul, aktion)
    values ('systemadministration', m, 'admin')
    on conflict do nothing;
  end loop;
end $$;

insert into role_permissions (role_id, modul, aktion) values
  -- Immobilienverwaltung
  ('immobilienverwaltung', 'immobilien', 'read'), ('immobilienverwaltung', 'immobilien', 'write'),
  ('immobilienverwaltung', 'anlagen', 'read'), ('immobilienverwaltung', 'anlagen', 'write'),
  ('immobilienverwaltung', 'vertraege', 'read'), ('immobilienverwaltung', 'vertraege', 'write'),
  ('immobilienverwaltung', 'kalender', 'read'), ('immobilienverwaltung', 'dokumente', 'read'), ('immobilienverwaltung', 'dokumente', 'write'),
  -- Liegenschaftsverwaltung
  ('liegenschaftsverwaltung', 'liegenschaften', 'read'), ('liegenschaftsverwaltung', 'liegenschaften', 'write'),
  ('liegenschaftsverwaltung', 'pacht_nutzung', 'read'), ('liegenschaftsverwaltung', 'pacht_nutzung', 'write'),
  ('liegenschaftsverwaltung', 'vertraege', 'read'), ('liegenschaftsverwaltung', 'vertraege', 'write'),
  ('liegenschaftsverwaltung', 'dokumente', 'read'), ('liegenschaftsverwaltung', 'dokumente', 'write'),
  -- Vertragsmanagement
  ('vertragsmanagement', 'vertraege', 'read'), ('vertragsmanagement', 'vertraege', 'write'),
  ('vertragsmanagement', 'kalender', 'read'), ('vertragsmanagement', 'kalender', 'write'),
  ('vertragsmanagement', 'dokumente', 'read'), ('vertragsmanagement', 'dokumente', 'write'),
  -- Veranstaltungsmanagement
  ('veranstaltungsmanagement', 'veranstaltungen', 'read'), ('veranstaltungsmanagement', 'veranstaltungen', 'write'),
  ('veranstaltungsmanagement', 'kalender', 'read'), ('veranstaltungsmanagement', 'kalender', 'write'),
  ('veranstaltungsmanagement', 'dokumente', 'read'),
  -- Haustechnik
  ('haustechnik', 'anlagen', 'read'), ('haustechnik', 'anlagen', 'write'),
  ('haustechnik', 'kalender', 'read'), ('haustechnik', 'kalender', 'write'),
  ('haustechnik', 'ticketsystem', 'read'), ('haustechnik', 'ticketsystem', 'write'),
  ('haustechnik', 'zaehler', 'read'), ('haustechnik', 'zaehler', 'write'),
  -- Finanzen/Kostenstellen
  ('finanzen', 'finanzen', 'read'), ('finanzen', 'finanzen', 'write'),
  ('finanzen', 'immobilien', 'read'), ('finanzen', 'liegenschaften', 'read'),
  ('finanzen', 'vertraege', 'read'), ('finanzen', 'ticketsystem', 'read'), ('finanzen', 'zaehler', 'read'),
  -- Leseberechtigte: lesend auf alles außer Finanzen
  ('lesebrechtigte', 'immobilien', 'read'), ('lesebrechtigte', 'liegenschaften', 'read'),
  ('lesebrechtigte', 'pacht_nutzung', 'read'), ('lesebrechtigte', 'veranstaltungen', 'read'),
  ('lesebrechtigte', 'vertraege', 'read'), ('lesebrechtigte', 'kalender', 'read'),
  ('lesebrechtigte', 'anlagen', 'read'), ('lesebrechtigte', 'ticketsystem', 'read'),
  ('lesebrechtigte', 'zaehler', 'read'), ('lesebrechtigte', 'dokumente', 'read'),
  -- Ticketbearbeiter (Einschränkung auf "nur zugewiesene Tickets" erfolgt
  -- zusätzlich auf App-Ebene, siehe AUTH_AND_RBAC.md — RBAC allein bildet nur
  -- die Modul-Ebene ab, nicht die Zuweisungs-Ebene je Ticket)
  ('ticketbearbeiter', 'ticketsystem', 'read'), ('ticketbearbeiter', 'ticketsystem', 'write'),
  ('ticketbearbeiter', 'kalender', 'read')
on conflict do nothing;

-- ============================================================================
-- 4. Objekt-/Datenbereich-Scope (§3: "...mindestens nach Benutzer, Rolle,
--    Modul UND Objekt-/Datenbereich steuerbar")
-- ============================================================================
-- Konvention: Hat ein Nutzer KEINE Zeile in user_object_scope, ist er für
-- alle Liegenschaften zugelassen (vorbehaltlich Modul-Recht). Hat er
-- mindestens eine Zeile, ist er NUR auf die dort gelisteten Liegenschaften
-- beschränkt. Das deckt den häufigsten Fall ab (Sachbearbeiter ist nur für
-- bestimmte Liegenschaften zuständig); eine Verfeinerung auf Gebäude-/
-- Raum-Ebene ist als Phase-1-Erweiterung vorgesehen (gleiche Tabellenform,
-- zusätzliche Spalte gebaeude_id).

create table if not exists user_object_scope (
  user_id uuid not null references profiles(id) on delete cascade,
  liegenschaft_id uuid not null references liegenschaften(id) on delete cascade,
  primary key (user_id, liegenschaft_id)
);

-- ============================================================================
-- 5. Audit-Log (SEC-003: Änderungen an Stammdaten/Verträgen/Fristen/
--    Zuordnungen müssen protokolliert werden)
-- ============================================================================

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid,
  aktion text not null check (aktion in ('insert', 'update', 'delete')),
  changed_by uuid references profiles(id),
  changed_at timestamptz not null default now(),
  old_data jsonb,
  new_data jsonb
);
create index if not exists audit_log_table_record_idx on audit_log (table_name, record_id);
create index if not exists audit_log_changed_at_idx on audit_log (changed_at desc);
create index if not exists audit_log_changed_by_idx on audit_log (changed_by);

-- Generische Trigger-Funktion, an beliebige Tabellen anhängbar (siehe unten).
-- auth.uid() ist null, wenn der Schreibzugriff über den Service-Role-Key
-- erfolgt (aktuell der Fall für alle bestehenden API-Routen, solange die
-- Rechteprüfung noch nicht in jede Route eingebaut ist) — changed_by bleibt
-- dann null, der Eintrag wird aber trotzdem geschrieben (Nachvollziehbarkeit
-- "es geschah etwas" bleibt auch ohne Aktor-Info erhalten).
create or replace function log_audit_change()
returns trigger as $$
begin
  if (tg_op = 'INSERT') then
    insert into audit_log (table_name, record_id, aktion, changed_by, new_data)
    values (tg_table_name, new.id, 'insert', auth.uid(), to_jsonb(new));
    return new;
  elsif (tg_op = 'UPDATE') then
    insert into audit_log (table_name, record_id, aktion, changed_by, old_data, new_data)
    values (tg_table_name, new.id, 'update', auth.uid(), to_jsonb(old), to_jsonb(new));
    return new;
  elsif (tg_op = 'DELETE') then
    insert into audit_log (table_name, record_id, aktion, changed_by, old_data)
    values (tg_table_name, old.id, 'delete', auth.uid(), to_jsonb(old));
    return old;
  end if;
  return null;
end;
$$ language plpgsql security definer set search_path = public;

-- Angehängt an die Tabellen, die bereits (per DB_SUPABASE_MODULES) auf
-- Supabase laufen können. Weitere Tabellen folgen nach demselben Muster,
-- sobald sie in db-supabase.ts ein Pendant bekommen — einfach den Block
-- kopieren und den Tabellennamen ersetzen.
do $$
declare
  t text;
begin
  for t in select unnest(array['liegenschaften','gebaeude','wohnungen','mieter','mietvertraege'])
  loop
    execute format('drop trigger if exists trg_%I_audit on %I', t, t);
    execute format(
      'create trigger trg_%I_audit after insert or update or delete on %I
       for each row execute function log_audit_change()', t, t
    );
  end loop;
end $$;

-- ============================================================================
-- 6. Helper-Funktionen für RLS-Policies
-- ============================================================================

create or replace function has_permission(p_modul text, p_aktion text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from user_roles ur
    join role_permissions rp on rp.role_id = ur.role_id
    where ur.user_id = auth.uid()
      and rp.modul = p_modul
      and (rp.aktion = p_aktion or rp.aktion = 'admin')
  );
$$;

create or replace function has_object_access(p_liegenschaft_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    -- kein Eintrag in user_object_scope für diesen Nutzer => unbeschränkt
    not exists (select 1 from user_object_scope where user_id = auth.uid())
    or exists (
      select 1 from user_object_scope
      where user_id = auth.uid() and liegenschaft_id = p_liegenschaft_id
    );
$$;

-- ============================================================================
-- 7. RLS-Policies (defense in depth, siehe Hinweis am Dateianfang)
-- ============================================================================

alter table profiles enable row level security;
drop policy if exists profiles_select_own on profiles;
create policy profiles_select_own on profiles for select
  using (id = auth.uid() or has_permission('systemadministration', 'admin'));

alter table roles enable row level security;
drop policy if exists roles_select_authenticated on roles;
create policy roles_select_authenticated on roles for select
  using (auth.uid() is not null);

alter table role_permissions enable row level security;
drop policy if exists role_permissions_select_authenticated on role_permissions;
create policy role_permissions_select_authenticated on role_permissions for select
  using (auth.uid() is not null);

alter table user_roles enable row level security;
drop policy if exists user_roles_select_own on user_roles;
create policy user_roles_select_own on user_roles for select
  using (user_id = auth.uid() or has_permission('systemadministration', 'admin'));

alter table audit_log enable row level security;
drop policy if exists audit_log_select_permitted on audit_log;
create policy audit_log_select_permitted on audit_log for select
  using (has_permission('systemadministration', 'admin'));

-- Liegenschaften: read = Modulrecht 'liegenschaften' + Objekt-Scope; write/delete = Modulrecht write/admin
drop policy if exists liegenschaften_select on liegenschaften;
create policy liegenschaften_select on liegenschaften for select
  using (has_permission('liegenschaften', 'read') and has_object_access(id));
drop policy if exists liegenschaften_write on liegenschaften;
create policy liegenschaften_write on liegenschaften for insert
  with check (has_permission('liegenschaften', 'write'));
drop policy if exists liegenschaften_update on liegenschaften;
create policy liegenschaften_update on liegenschaften for update
  using (has_permission('liegenschaften', 'write') and has_object_access(id));
drop policy if exists liegenschaften_delete on liegenschaften;
create policy liegenschaften_delete on liegenschaften for delete
  using (has_permission('liegenschaften', 'delete') and has_object_access(id));

-- Gebäude/Wohnungen/Mieter/Mietverträge: analoges Muster über 'immobilien'.
-- Objekt-Scope wird über den referenzierten liegenschaft_id-Pfad geprüft.
drop policy if exists gebaeude_select on gebaeude;
create policy gebaeude_select on gebaeude for select
  using (has_permission('immobilien', 'read') and has_object_access(liegenschaft_id));
drop policy if exists gebaeude_write on gebaeude;
create policy gebaeude_write on gebaeude for insert
  with check (has_permission('immobilien', 'write'));
drop policy if exists gebaeude_update on gebaeude;
create policy gebaeude_update on gebaeude for update
  using (has_permission('immobilien', 'write') and has_object_access(liegenschaft_id));
drop policy if exists gebaeude_delete on gebaeude;
create policy gebaeude_delete on gebaeude for delete
  using (has_permission('immobilien', 'delete') and has_object_access(liegenschaft_id));

-- Hinweis: wohnungen/mieter/mietvertraege haben keine direkte liegenschaft_id
-- (nur über gebaeude/wohnung verschachtelt) — Policies dafür bewusst NICHT
-- Teil dieser Phase-0-Migration, um die Datei nicht zu sprengen. Muster: Join
-- auf gebaeude.liegenschaft_id per Subquery, siehe AUTH_AND_RBAC.md Abschnitt
-- "Nächste Schritte" für die exakte Vorlage zum Kopieren.
