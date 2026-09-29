create table if not exists public.channels (
  slug text primary key,
  created_at timestamptz not null default now()
);

create index if not exists channels_created_at_idx
  on public.channels (created_at desc);

alter table public.channels enable row level security;
