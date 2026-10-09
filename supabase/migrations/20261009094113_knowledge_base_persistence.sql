-- Phase 8 only: authenticated ingestion persistence, without retrieval.
begin;
create extension if not exists vector with schema extensions;

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  storage_name text not null check (storage_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}--[A-Za-z0-9_-]{1,100}\.pdf$'),
  storage_path text not null check (storage_path = owner_id::text || '/' || storage_name),
  original_filename text not null check (char_length(original_filename) between 1 and 255),
  mime_type text not null default 'application/pdf' check (mime_type = 'application/pdf'),
  file_size bigint not null check (file_size between 1 and 4194304),
  ingestion_status text not null check (ingestion_status in ('ready', 'deleting')),
  page_count integer check (page_count between 1 and 100),
  extracted_characters integer check (extracted_characters between 1 and 200000),
  source_characters integer check (source_characters between 1 and 200200),
  chunk_count integer not null default 0 check (chunk_count between 0 and 500),
  embedding_model text,
  embedding_revision text,
  embedding_dimension integer,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (owner_id, storage_name),
  constraint ready_document_metadata check (ingestion_status = 'deleting' or (
    page_count is not null and extracted_characters is not null and source_characters is not null
    and chunk_count > 0 and processed_at is not null
    and embedding_model is not null and embedding_model = 'Xenova/all-MiniLM-L6-v2'
    and embedding_revision is not null and embedding_revision = '751bff37182d3f1213fa05d7196b954e230abad9'
    and embedding_dimension is not null and embedding_dimension = 384
  ))
);

create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  chunk_index integer not null check (chunk_index between 0 and 499),
  content text not null check (char_length(btrim(content)) > 0),
  -- Counts/offsets preserve JavaScript UTF-16 units, including surrogate pairs.
  character_count integer not null check (character_count between 1 and 1200
    and character_count >= char_length(content) and character_count <= 2 * char_length(content)),
  page_numbers integer[] not null check (array_ndims(page_numbers) = 1
    and cardinality(page_numbers) between 1 and 100
    and array_position(page_numbers, null) is null and 0 < all(page_numbers)),
  start_offset integer not null check (start_offset >= 0),
  end_offset integer not null check (end_offset > start_offset and end_offset - start_offset = character_count),
  overlap_with_previous integer not null check (overlap_with_previous between 0 and 200),
  forced_word_split boolean not null,
  token_count integer not null check (token_count between 1 and 512),
  embedding extensions.vector(384) not null check (abs(extensions.vector_norm(embedding) - 1) < 0.0001),
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);
-- The unique keys also index ownership lookups and the chunk cascade FK.
-- No vector similarity index is created.
alter table public.documents enable row level security;
alter table public.document_chunks enable row level security;

create policy documents_read_own on public.documents for select to authenticated
using (owner_id = (select auth.uid()));
create policy documents_insert_own on public.documents for insert to authenticated
with check (owner_id = (select auth.uid()) and exists (
  select 1 from storage.objects s where s.bucket_id = 'documents'
  and s.name = documents.storage_path and s.owner_id = (select auth.uid()::text)
));
create policy documents_update_own on public.documents for update to authenticated
using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy documents_delete_own on public.documents for delete to authenticated
using (owner_id = (select auth.uid()));
create policy chunks_read_own on public.document_chunks for select to authenticated
using (document_id in (select id from public.documents where owner_id = (select auth.uid())));
create policy chunks_insert_own on public.document_chunks for insert to authenticated
with check (document_id in (select id from public.documents where owner_id = (select auth.uid())));
create policy chunks_delete_own on public.document_chunks for delete to authenticated
using (document_id in (select id from public.documents where owner_id = (select auth.uid())));

revoke all on public.documents, public.document_chunks from public, anon, authenticated;
grant select, insert, delete on public.documents to authenticated;
grant update (original_filename, ingestion_status, page_count, extracted_characters,
  source_characters, chunk_count, embedding_model, embedding_revision,
  embedding_dimension, processed_at) on public.documents to authenticated;
grant select, insert, delete on public.document_chunks to authenticated;
grant usage on type extensions.vector to authenticated;
grant execute on function extensions.vector_norm(extensions.vector), extensions.vector_dims(extensions.vector) to authenticated;

create function public.persist_document_ingestion(
  p_storage_name text, p_file_size bigint, p_page_count integer,
  p_extracted_characters integer, p_source_characters integer,
  p_embedding_model text, p_embedding_revision text, p_embedding_dimension integer,
  p_chunks jsonb, p_reingest boolean default false
) returns setof public.documents
language plpgsql security invoker set search_path = '' as $function$
declare
  v_owner uuid := auth.uid();
  v_document uuid;
  v_path text := v_owner::text || '/' || p_storage_name;
  v_count integer;
  v_filename text;
  v_size bigint;
begin
  if v_owner is null then raise exception using errcode = '42501', message = 'Authentication required'; end if;
  if jsonb_typeof(p_chunks) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Chunks must be an array';
  end if;
  v_count := jsonb_array_length(p_chunks);
  if v_count < 1 or v_count > 500 then
    raise exception using errcode = '22023', message = 'Invalid chunk count';
  end if;
  if (select count(distinct c.chunk_index) <> v_count or min(c.chunk_index) <> 0 or max(c.chunk_index) <> v_count - 1
      from jsonb_to_recordset(p_chunks) as c(chunk_index integer)) then
    raise exception using errcode = '22023', message = 'Chunk indices must be contiguous';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_chunks) as c(end_offset integer, page_numbers integer[])
    where c.end_offset > p_source_characters or exists (select 1 from unnest(c.page_numbers) p where p > p_page_count)) then
    raise exception using errcode = '22023', message = 'Chunk metadata exceeds the source';
  end if;

  -- This upsert locks the owner/name row before the final Storage existence check.
  -- The same row serializes ingestion against begin_document_deletion().
  insert into public.documents as d (owner_id, storage_name, storage_path, original_filename,
    file_size, ingestion_status, page_count, extracted_characters, source_characters,
    chunk_count, embedding_model, embedding_revision, embedding_dimension, processed_at)
  values (v_owner, p_storage_name, v_path, substr(p_storage_name, 39), p_file_size,
    'ready', p_page_count, p_extracted_characters, p_source_characters, v_count,
    p_embedding_model, p_embedding_revision, p_embedding_dimension, clock_timestamp())
  on conflict (owner_id, storage_name) do update set
    page_count = excluded.page_count, extracted_characters = excluded.extracted_characters,
    source_characters = excluded.source_characters, chunk_count = excluded.chunk_count,
    embedding_model = excluded.embedding_model, embedding_revision = excluded.embedding_revision,
    embedding_dimension = excluded.embedding_dimension, processed_at = excluded.processed_at
  where p_reingest and d.owner_id = v_owner and d.ingestion_status = 'ready'
  returning id into v_document;
  if v_document is null then
    raise exception using errcode = 'P0001', message = 'Already ingested or deletion pending';
  end if;

  select left(coalesce(nullif(s.user_metadata->>'original_filename', ''), substr(p_storage_name, 39)), 255),
    (s.metadata->>'size')::bigint into v_filename, v_size
  from storage.objects s where s.bucket_id = 'documents' and s.name = v_path and s.owner_id = v_owner::text;
  if not found or v_size is distinct from p_file_size then
    raise exception using errcode = 'P0002', message = 'The owned PDF is unavailable or changed';
  end if;
  update public.documents set original_filename = v_filename where id = v_document and owner_id = v_owner;
  -- Only this verified owner's document is replaced; any insert failure rolls it back.
  delete from public.document_chunks where document_id = v_document;
  insert into public.document_chunks (document_id, chunk_index, content, character_count,
    page_numbers, start_offset, end_offset, overlap_with_previous, forced_word_split, token_count, embedding)
  select v_document, c.chunk_index, c.content, c.character_count, c.page_numbers,
    c.start_offset, c.end_offset, c.overlap_with_previous, c.forced_word_split, c.token_count,
    c.embedding::extensions.vector(384)
  from jsonb_to_recordset(p_chunks) as c(chunk_index integer, content text, character_count integer,
    page_numbers integer[], start_offset integer, end_offset integer,
    overlap_with_previous integer, forced_word_split boolean, token_count integer, embedding text);
  return query select * from public.documents where id = v_document and owner_id = v_owner;
end;
$function$;

create function public.begin_document_deletion(p_storage_name text) returns uuid
language plpgsql security invoker set search_path = '' as $function$
declare
  v_owner uuid := auth.uid();
  v_document uuid;
  v_path text := v_owner::text || '/' || p_storage_name;
  v_filename text;
  v_size bigint;
begin
  if v_owner is null then raise exception using errcode = '42501', message = 'Authentication required'; end if;
  select id into v_document from public.documents
  where owner_id = v_owner and storage_name = p_storage_name for update;
  if found then
    update public.documents set ingestion_status = 'deleting' where id = v_document and owner_id = v_owner;
    return v_document;
  end if;
  select left(coalesce(nullif(s.user_metadata->>'original_filename', ''), substr(p_storage_name, 39)), 255),
    (s.metadata->>'size')::bigint into v_filename, v_size
  from storage.objects s where s.bucket_id = 'documents' and s.name = v_path and s.owner_id = v_owner::text;
  if not found then return null; end if;
  insert into public.documents as d (owner_id, storage_name, storage_path, original_filename, file_size, ingestion_status)
  values (v_owner, p_storage_name, v_path, v_filename, v_size, 'deleting')
  on conflict (owner_id, storage_name) do update set ingestion_status = 'deleting'
  where d.owner_id = v_owner returning id into v_document;
  return v_document;
end;
$function$;

create function public.finish_document_deletion(p_storage_name text) returns boolean
language plpgsql security invoker set search_path = '' as $function$
declare
  v_owner uuid := auth.uid();
  v_document public.documents%rowtype;
begin
  if v_owner is null then raise exception using errcode = '42501', message = 'Authentication required'; end if;
  select * into v_document from public.documents
  where owner_id = v_owner and storage_name = p_storage_name for update;
  if not found then return true; end if;
  if v_document.ingestion_status <> 'deleting' or exists (
    select 1 from storage.objects s where s.bucket_id = 'documents'
    and s.name = v_document.storage_path and s.owner_id = v_owner::text
  ) then raise exception using errcode = 'P0001', message = 'PDF deletion has not completed'; end if;
  delete from public.documents where id = v_document.id and owner_id = v_owner and ingestion_status = 'deleting';
  return true;
end;
$function$;

revoke all on function public.persist_document_ingestion(text, bigint, integer, integer, integer, text, text, integer, jsonb, boolean),
  public.begin_document_deletion(text), public.finish_document_deletion(text) from public, anon, authenticated;
grant execute on function public.persist_document_ingestion(text, bigint, integer, integer, integer, text, text, integer, jsonb, boolean),
  public.begin_document_deletion(text), public.finish_document_deletion(text) to authenticated;

-- Retain the original owner restrictions. Processed files require coordinated deletion.
alter policy documents_delete_own on storage.objects using (
  bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid()::text)
  and owner_id = (select auth.uid()::text)
  and not exists (select 1 from public.documents d where d.owner_id = (select auth.uid())
    and d.storage_path = storage.objects.name and d.ingestion_status = 'ready')
);
commit;
