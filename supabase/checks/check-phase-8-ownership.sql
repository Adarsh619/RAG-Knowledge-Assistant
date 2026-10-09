-- Read-only deployed-RLS check, scoped to the generated Phase 8 fixture.
-- Temporarily emulate authenticated JWT identities; no account or row is changed.
begin read only;
do $check$
declare
  v_document public.documents%rowtype;
  v_other uuid;
begin
  select * into strict v_document from public.documents
  where storage_name like '%--phase-8-ingestion-test.pdf';
  select id into v_other from auth.users where id <> v_document.owner_id order by created_at limit 1;
  perform set_config('phase8.other_is_existing_account', (v_other is not null)::text, true);
  v_other := coalesce(v_other, gen_random_uuid());
  perform set_config('phase8.document', v_document.id::text, true);
  perform set_config('phase8.owner', v_document.owner_id::text, true);
  perform set_config('phase8.other', v_other::text, true);
  perform set_config('phase8.path', v_document.storage_path, true);
end;
$check$;
set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('phase8.owner'), 'role', 'authenticated')::text, true) is not null as owner_identity_set;
do $owner_check$
begin
  if (select count(*) from public.documents where id = current_setting('phase8.document')::uuid) <> 1
    or (select count(*) from storage.objects where bucket_id = 'documents' and name = current_setting('phase8.path')) <> 1
    or (select count(*) from public.document_chunks where document_id = current_setting('phase8.document')::uuid) < 1
    or exists (select 1 from public.document_chunks where document_id = current_setting('phase8.document')::uuid
      and (extensions.vector_dims(embedding) <> 384 or abs(extensions.vector_norm(embedding) - 1) >= 0.0001))
  then raise exception 'Owner access/vector verification failed'; end if;
end;
$owner_check$;
select
  (select count(*) from public.documents where id = current_setting('phase8.document')::uuid) as owner_visible_documents,
  (select count(*) from public.document_chunks where document_id = current_setting('phase8.document')::uuid) as owner_visible_chunks,
  (select count(*) from storage.objects where bucket_id = 'documents' and name = current_setting('phase8.path')) as owner_visible_pdf,
  (select bool_and(extensions.vector_dims(embedding) = 384 and abs(extensions.vector_norm(embedding) - 1) < 0.0001)
    from public.document_chunks where document_id = current_setting('phase8.document')::uuid) as all_vectors_valid;
select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('phase8.other'), 'role', 'authenticated')::text, true) is not null as other_identity_set;
do $other_check$
begin
  if exists(select 1 from public.documents where id = current_setting('phase8.document')::uuid)
    or exists(select 1 from public.document_chunks where document_id = current_setting('phase8.document')::uuid)
    or exists(select 1 from storage.objects where bucket_id = 'documents' and name = current_setting('phase8.path'))
    or has_table_privilege('authenticated', 'public.document_chunks', 'UPDATE')
    or has_column_privilege('authenticated', 'public.documents', 'owner_id', 'UPDATE')
    or has_table_privilege('anon', 'public.documents', 'SELECT')
    or has_table_privilege('anon', 'public.document_chunks', 'SELECT')
  then raise exception 'Ownership isolation/grant verification failed'; end if;
end;
$other_check$;
select
  current_setting('phase8.other_is_existing_account')::boolean as other_is_existing_account,
  (select count(*) from public.documents where id = current_setting('phase8.document')::uuid) as other_visible_documents,
  (select count(*) from public.document_chunks where document_id = current_setting('phase8.document')::uuid) as other_visible_chunks,
  (select count(*) from storage.objects where bucket_id = 'documents' and name = current_setting('phase8.path')) as other_visible_pdf,
  current_setting('phase8.owner')::uuid = (select auth.uid()) as document_write_owner_predicate,
  exists(select 1 from public.documents where id = current_setting('phase8.document')::uuid and owner_id = (select auth.uid())) as chunk_write_parent_predicate,
  has_table_privilege('authenticated', 'public.document_chunks', 'UPDATE') as chunk_update_granted,
  has_column_privilege('authenticated', 'public.documents', 'owner_id', 'UPDATE') as ownership_update_granted;
reset role;
rollback;
