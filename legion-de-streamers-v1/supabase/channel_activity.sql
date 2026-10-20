-- Legión de Streamers: seguimiento del último directo detectado.
-- Ejecutar una sola vez en Supabase > SQL Editor (mismo proyecto del directorio).
-- No cambia ni elimina registros de public.channels.
create table if not exists public.channel_activity (
  slug text primary key,
  last_seen_live_at timestamptz,
  last_checked_at timestamptz,
  is_live boolean
);

create index if not exists channel_activity_last_seen_live_idx
  on public.channel_activity (last_seen_live_at desc);

alter table public.channel_activity enable row level security;

-- Solo el servidor con SUPABASE_SERVICE_ROLE_KEY puede leer o escribir el historial.
revoke all on public.channel_activity from anon, authenticated;
