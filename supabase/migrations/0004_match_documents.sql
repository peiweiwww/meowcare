create or replace function public.match_documents(
  query_embedding text,
  match_count int
)
returns table (
  id bigint,
  title text,
  content text,
  source_url text,
  similarity double precision
)
language sql
stable
as $$
  select
    documents.id,
    documents.title,
    documents.content,
    documents.source_url,
    1 - (documents.embedding <=> query_embedding::vector) as similarity
  from public.documents
  order by documents.embedding <=> query_embedding::vector
  limit match_count;
$$;
