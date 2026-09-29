create table if not exists public.channels (
  slug text primary key,
  created_at timestamptz not null default now()
);

create index if not exists channels_created_at_idx
  on public.channels (created_at desc);

alter table public.channels enable row level security;

-- These policies let the public site read and add channels safely.
-- The primary key on slug prevents duplicate channels.
drop policy if exists "channels_public_read" on public.channels;
create policy "channels_public_read"
  on public.channels
  for select
  using (true);

drop policy if exists "channels_public_insert" on public.channels;
create policy "channels_public_insert"
  on public.channels
  for insert
  with check (slug ~ '^[a-z0-9_-]{1,80}$');
