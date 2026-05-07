create table public.documents (
  id bigserial not null,
  title text not null,
  content text not null,
  source_url text null,
  embedding public.vector not null,
  created_at timestamp with time zone not null default now(),
  sources text[] null default '{}'::text[],
  category text null,
  tags text[] null default '{}'::text[],
  source_file text null,
  constraint documents_pkey primary key (id)
) TABLESPACE pg_default;

create index IF not exists documents_embedding_idx on public.documents using ivfflat (embedding vector_cosine_ops)
with (lists = '100') TABLESPACE pg_default;

create index IF not exists documents_source_file_idx on public.documents using btree (source_file) TABLESPACE pg_default;
