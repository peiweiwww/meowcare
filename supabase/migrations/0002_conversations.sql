create table public.conversations (
  id uuid not null default gen_random_uuid(),
  user_id text not null,
  title text null,
  created_at timestamp with time zone null default now(),
  constraint conversations_pkey primary key (id)
) TABLESPACE pg_default;
