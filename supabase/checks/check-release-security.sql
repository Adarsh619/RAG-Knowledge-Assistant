-- Read-only catalog verification. Admin metadata checks do not replace real-user tests.
select jsonb_build_object(
  'tables', (select jsonb_agg(jsonb_build_object(
    'table', c.relname, 'rls', c.relrowsecurity,
    'anon_select', has_table_privilege('anon',c.oid,'select'),
    'authenticated_select', has_table_privilege('authenticated',c.oid,'select')
  )) from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname in ('documents','document_chunks','conversations','messages')),
  'functions', (select jsonb_agg(jsonb_build_object(
    'name',p.proname,'security_definer',p.prosecdef,
    'anon_execute',has_function_privilege('anon',p.oid,'execute'),
    'authenticated_execute',has_function_privilege('authenticated',p.oid,'execute')
  )) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'),
  'embedding_type', (select format_type(a.atttypid,a.atttypmod) from pg_attribute a
    where a.attrelid='public.document_chunks'::regclass and a.attname='embedding'),
  'bucket', (select jsonb_build_object('private',not public,'byte_limit',file_size_limit,
    'mime_types',allowed_mime_types) from storage.buckets where id='documents')
) as release_security;
