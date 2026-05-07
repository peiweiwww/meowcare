create table public.messages (
  id uuid not null default gen_random_uuid(),
  conversation_id uuid null,
  role text not null,
  content text not null,
  sources jsonb null,
  created_at timestamp with time zone null default now(),
  constraint messages_pkey primary key (id),
  constraint messages_conversation_id_fkey foreign KEY (conversation_id) references conversations(id) on delete CASCADE
) TABLESPACE pg_default;
