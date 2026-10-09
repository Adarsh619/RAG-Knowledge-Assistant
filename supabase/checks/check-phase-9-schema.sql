-- Read-only catalog inspection. No private PDF/chunk content is returned.
select jsonb_build_object(
  'function', (select jsonb_build_object(
    'name', p.proname, 'security_definer', p.prosecdef,
    'volatility', p.provolatile, 'config', p.proconfig,
    'arguments', pg_get_function_arguments(p.oid),
    'authenticated_execute', has_function_privilege('authenticated', p.oid, 'EXECUTE'),
    'anon_execute', has_function_privilege('anon', p.oid, 'EXECUTE'),
    'definition', pg_get_functiondef(p.oid)
  ) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'search_document_chunks'),
  'rls', (select jsonb_agg(jsonb_build_object('table', c.relname, 'enabled', c.relrowsecurity))
    from pg_class c where c.oid in ('public.documents'::regclass, 'public.document_chunks'::regclass)),
  'vector_indexes', (select count(*) from pg_index i join pg_class c on c.oid = i.indexrelid
    join pg_am a on a.oid = c.relam where i.indrelid = 'public.document_chunks'::regclass
    and a.amname in ('hnsw', 'ivfflat'))
) as verification;
