-- Legión Bot MVP: calendario comunitario administrado en servidor.
-- Ejecutar manualmente en Supabase SQL Editor antes de utilizar /bot.
-- No modificar la tabla existente public.channels.

create table if not exists public.legion_bot_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 100),
  details text not null default '' check (char_length(details) <= 1000),
  starts_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  created_at timestamptz not null default now()
);

create index if not exists legion_bot_events_start_idx
  on public.legion_bot_events (starts_at);

-- Solo nuestra API de Next.js, que usa la service_role key en el servidor,
-- puede gestionar los eventos. Los visitantes nunca reciben la clave.
alter table public.legion_bot_events enable row level security;
revoke all privileges on public.legion_bot_events from anon, authenticated;

-- No se crean políticas públicas de lectura o escritura.
-- La ruta GET de Next.js filtra y expone solo eventos programados.
