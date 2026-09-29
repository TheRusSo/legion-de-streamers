create table if not exists public.channels (
  slug text primary key,
  user_id bigint not null,
  created_at timestamptz not null default now()
);
create index if not exists channels_user_id_idx on public.channels(user_id);
alter table public.channels enable row level security;
