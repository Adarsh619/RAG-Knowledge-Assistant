begin;

create function public.search_document_chunks(
  p_query_embedding extensions.vector,
  p_top_k integer default 5,
  p_document_id uuid default null,
  p_min_similarity double precision default 0.30
)
returns table (
  document_id uuid,
  chunk_id uuid,
  chunk_index integer,
  content text,
  character_count integer,
  page_numbers integer[],
  start_offset integer,
  end_offset integer,
  original_filename text,
  processed_at timestamptz,
  similarity double precision
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_query_embedding is null
     or extensions.vector_dims(p_query_embedding) <> 384
     or abs(extensions.vector_norm(p_query_embedding) - 1) >= 0.0001 then
    raise exception 'Expected a normalized 384-dimensional query vector'
      using errcode = '22023';
  end if;

  if p_top_k is null or p_top_k < 1 or p_top_k > 20 then
    raise exception 'top-k must be between 1 and 20' using errcode = '22023';
  end if;

  if p_min_similarity is null
     or not (p_min_similarity between -1 and 1) then
    raise exception 'Minimum similarity must be between -1 and 1'
      using errcode = '22023';
  end if;

  return query
  with scored as (
    select
      d.id as source_document_id,
      c.id as source_chunk_id,
      c.chunk_index as source_chunk_index,
      c.content,
      c.character_count,
      c.page_numbers,
      c.start_offset,
      c.end_offset,
      d.original_filename,
      d.processed_at,
      c.embedding operator(extensions.<=>) p_query_embedding as distance
    from public.document_chunks as c
    join public.documents as d on d.id = c.document_id
    where d.owner_id = (select auth.uid())
      and d.ingestion_status = 'ready'
      and d.embedding_model = 'Xenova/all-MiniLM-L6-v2'
      and d.embedding_revision = '751bff37182d3f1213fa05d7196b954e230abad9'
      and d.embedding_dimension = 384
      and (p_document_id is null or d.id = p_document_id)
  )
  select
    s.source_document_id,
    s.source_chunk_id,
    s.source_chunk_index,
    s.content,
    s.character_count,
    s.page_numbers,
    s.start_offset,
    s.end_offset,
    s.original_filename,
    s.processed_at,
    greatest(-1::double precision,
      least(1::double precision, 1 - s.distance)) as similarity
  from scored as s
  where greatest(-1::double precision,
    least(1::double precision, 1 - s.distance)) >= p_min_similarity
  order by s.distance, s.source_document_id, s.source_chunk_index
  limit p_top_k;
end;
$$;

revoke all on function public.search_document_chunks(
  extensions.vector, integer, uuid, double precision
) from public, anon, authenticated;

grant execute on function public.search_document_chunks(
  extensions.vector, integer, uuid, double precision
) to authenticated;

commit;
