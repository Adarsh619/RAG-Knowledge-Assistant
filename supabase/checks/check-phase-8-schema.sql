-- Read-only Phase 8 catalog verification; no application/private contents returned.
select jsonb_build_object(
'vector', (select jsonb_build_object('version',e.extversion,'schema',n.nspname) from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='vector'),
'tables', (select jsonb_agg(jsonb_build_object('name',c.relname,'rls',c.relrowsecurity)) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('documents','document_chunks')),
'embedding_type', (select format_type(a.atttypid,a.atttypmod) from pg_attribute a where a.attrelid='public.document_chunks'::regclass and a.attname='embedding'),
'policies', (select jsonb_agg(jsonb_build_object('table',tablename,'name',policyname,'roles',roles,'command',cmd,'using',qual,'check',with_check)) from pg_policies where (schemaname='public' and tablename in ('documents','document_chunks')) or (schemaname='storage' and tablename='objects' and policyname='documents_delete_own')),
'table_grants', (select jsonb_agg(jsonb_build_object('table',table_name,'role',grantee,'privilege',privilege_type)) from information_schema.role_table_grants where table_schema='public' and table_name in ('documents','document_chunks') and grantee in ('anon','authenticated','PUBLIC')),
'column_updates', (select jsonb_agg(column_name) from information_schema.column_privileges where table_schema='public' and table_name='documents' and grantee='authenticated' and privilege_type='UPDATE'),
'functions', (select jsonb_agg(jsonb_build_object('name',p.proname,'security_definer',p.prosecdef,'config',p.proconfig,'auth_execute',has_function_privilege('authenticated',p.oid,'EXECUTE'),'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('persist_document_ingestion','begin_document_deletion','finish_document_deletion'))
) as verification;
