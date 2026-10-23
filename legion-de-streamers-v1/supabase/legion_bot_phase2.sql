-- Legión Bot fase 2: miembros, puntos verificables y reportes gestionados por moderadores.
-- EJECUTAR DESPUÉS de legion_bot.sql en el mismo Supabase del proyecto.
-- No altera la tabla existente de canales ni los eventos anteriores.

create table if not exists public.legion_bot_members (
  id uuid primary key default gen_random_uuid(),
  kick_slug text not null unique check (kick_slug ~ '^[a-z0-9_-]{1,80}$'),
  display_name text not null check (char_length(display_name) between 2 and 80),
  status text not null default 'active' check (status in ('active', 'paused')),
  leaderboard_opt_in boolean not null default false,
  consent_confirmed_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.legion_bot_points_log (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.legion_bot_members(id) on delete cascade,
  points integer not null check (points between 1 and 50),
  reason text not null check (char_length(reason) between 5 and 240),
  created_at timestamptz not null default now()
);

create index if not exists legion_bot_points_member_idx
  on public.legion_bot_points_log(member_id, created_at desc);

create table if not exists public.legion_bot_reports (
  id uuid primary key default gen_random_uuid(),
  subject text not null check (char_length(subject) between 3 and 100),
  category text not null check (category in ('spam', 'harassment', 'rules', 'other')),
  summary text not null check (char_length(summary) between 10 and 750),
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists legion_bot_reports_status_idx
  on public.legion_bot_reports(status, created_at desc);

-- El backend accede solo con la service_role key. Ningún navegador recibe esa clave.
-- Sin políticas abiertas de lectura/escritura; ni siquiera la lista pública se consulta
-- directamente en Supabase: /api/bot/leaderboard devuelve exclusivamente miembros opt-in.
alter table public.legion_bot_members enable row level security;
alter table public.legion_bot_points_log enable row level security;
alter table public.legion_bot_reports enable row level security;

revoke all privileges on public.legion_bot_members from anon, authenticated;
revoke all privileges on public.legion_bot_points_log from anon, authenticated;
revoke all privileges on public.legion_bot_reports from anon, authenticated;
