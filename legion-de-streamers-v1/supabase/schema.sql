-- Legión de Streamers: persistent KICK channel storage.
-- Run this in Supabase SQL Editor if channels do not save, disappear after refresh,
-- or if the old table still has a required user_id column.

create table if not exists public.channels (
  slug text,
  created_at timestamptz not null default now()
);

alter table public.channels
  add column if not exists slug text;

alter table public.channels
  add column if not exists created_at timestamptz not null default now();

-- Older test tables sometimes had user_id as NOT NULL. The current app does not need it.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'channels'
      and column_name = 'user_id'
  ) then
    alter table public.channels alter column user_id drop not null;
  end if;
end $$;

update public.channels
set slug = lower(regexp_replace(slug, '[^a-zA-Z0-9_-]', '', 'g'))
where slug is not null;

delete from public.channels
where slug is null or slug = '';

-- Remove duplicated slugs before creating the unique index.
delete from public.channels a
using public.channels b
where lower(a.slug) = lower(b.slug)
  and a.ctid < b.ctid;

alter table public.channels
  alter column slug set not null;

create unique index if not exists channels_slug_unique_idx
  on public.channels (lower(slug));

create index if not exists channels_created_at_idx
  on public.channels (created_at desc);

alter table public.channels enable row level security;

-- Public page can read the directory.
drop policy if exists "channels_public_read" on public.channels;
create policy "channels_public_read"
  on public.channels
  for select
  using (true);

-- Public page can add valid KICK slugs through the app.
-- Editing and deleting are done by the protected /admin panel using SUPABASE_SERVICE_ROLE_KEY.
drop policy if exists "channels_public_insert" on public.channels;
create policy "channels_public_insert"
  on public.channels
  for insert
  with check (slug ~ '^[a-z0-9_-]{1,80}$');
