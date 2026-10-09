-- Inspect only generated Phase 9 fixtures, without returning text or vectors.
select d.original_filename, d.id, d.ingestion_status, d.chunk_count, d.processed_at,
  count(c.id) as persisted_chunks,
  bool_and(extensions.vector_dims(c.embedding) = 384
    and abs(extensions.vector_norm(c.embedding) - 1) < 0.0001) as vectors_valid,
  jsonb_agg(jsonb_build_object('index', c.chunk_index, 'pages', c.page_numbers,
    'characters', c.character_count, 'start', c.start_offset, 'end', c.end_offset)
    order by c.chunk_index) as metadata
from public.documents d left join public.document_chunks c on c.document_id = d.id
where d.storage_name like '%--phase-9-react.pdf' or d.storage_name like '%--phase-9-ocean.pdf'
group by d.id order by d.original_filename;
