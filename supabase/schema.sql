-- BetriebsKostenBot AI — Agent-Gedächtnis (Durchgang 9)
-- Einmalig im Supabase SQL Editor des Projekts ausführen.
--
-- Bewusst eine einzige, schlanke Tabelle statt eines vollen Schemas
-- (separate Tabellen für Steps/Reflections/Plans) — pro Agent-Lauf fallen
-- nur 2 Schreibzugriffe an (INSERT beim Start, UPDATE am Ende), steps/
-- reflection liegen als JSONB im selben Row. Das hält den Ressourcen-
-- verbrauch im kostenlosen Supabase-Tier minimal, ohne Aussagekraft zu
-- verlieren (ein Lauf = eine Zeile = vollständig nachvollziehbar).

create table if not exists agent_runs (
  id uuid primary key default gen_random_uuid(),
  goal text not null,
  path text,
  status text not null default 'running' check (status in ('running', 'success', 'max_steps_reached', 'error')),
  steps jsonb not null default '[]'::jsonb,
  reflection text,
  reply text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Für die "letzte Läufe"-Ansicht im AI Observatory
create index if not exists agent_runs_created_at_idx on agent_runs (created_at desc);

-- Optional, aber empfohlen: alte Läufe automatisch aufräumen, damit die
-- kostenlose Supabase-Instanz nicht unbegrenzt wächst. 90 Tage Aufbewahrung
-- als sinnvoller Standard für ein Buchhaltungs-/Verwaltungs-Tool.
-- (Erfordert die pg_cron-Extension; falls nicht verfügbar, einfach manuell
-- oder per externem Cron aufräumen.)
--
-- select cron.schedule(
--   'agent_runs_cleanup',
--   '0 3 * * *',
--   $$ delete from agent_runs where created_at < now() - interval '90 days' $$
-- );

-- Row Level Security: Diese Tabelle wird ausschließlich serverseitig über den
-- Service-Role-Key beschrieben/gelesen (nie vom Browser aus) — RLS bleibt
-- daher aktiviert, aber ohne Policies, was jeglichen Zugriff über den
-- anonymen/öffentlichen Key verweigert.
alter table agent_runs enable row level security;
