-- Read-only persistence inspection, scoped to the generated public-text PDF.
select d.id, d.original_filename, d.file_size, d.ingestion_status,
  d.page_count, d.extracted_characters, d.source_characters,
  d.chunk_count, d.embedding_model, d.embedding_dimension, d.processed_at,
  count(c.id) as actual_chunks,
  md5(string_agg(c.id::text, ',' order by c.chunk_index)) as chunk_identity_fingerprint,
  bool_and(extensions.vector_dims(c.embedding) = 384) as dimensions_valid,
  bool_and(abs(extensions.vector_norm(c.embedding) - 1) < 0.0001) as normalized,
  jsonb_agg(jsonb_build_object('index', c.chunk_index, 'pages', c.page_numbers,
    'characters', c.character_count, 'start', c.start_offset, 'end', c.end_offset,
    'overlap', c.overlap_with_previous, 'tokens', c.token_count,
    'dimension', extensions.vector_dims(c.embedding)) order by c.chunk_index) as chunks
from public.documents d join public.document_chunks c on c.document_id = d.id
where d.storage_name like '%--phase-8-ingestion-test.pdf'
group by d.id;
