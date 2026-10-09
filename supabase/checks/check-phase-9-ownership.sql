-- Run while the two generated Phase 9 PDFs are ingested.
-- Read-only role/JWT emulation, not account creation or data modification.
begin read only;
do $setup$
declare
  v_doc public.documents%rowtype;
  v_other uuid;
  v_vector extensions.vector;
begin
  select * into strict v_doc from public.documents
    where storage_name like '%--phase-9-react.pdf';
  select embedding into strict v_vector from public.document_chunks
    where document_id = v_doc.id and chunk_index = 0;
  select id into v_other from auth.users where id <> v_doc.owner_id order by created_at limit 1;
  perform set_config('phase9.other_is_existing_account', (v_other is not null)::text, true);
  perform set_config('phase9.other', coalesce(v_other, gen_random_uuid())::text, true);
  perform set_config('phase9.owner', v_doc.owner_id::text, true);
  perform set_config('phase9.document', v_doc.id::text, true);
  perform set_config('phase9.path', v_doc.storage_path, true);
  perform set_config('phase9.owned_documents', (select array_agg(id)::text from public.documents where owner_id = v_doc.owner_id), true);
  perform set_config('phase9.vector', v_vector::text, true);
end;
$setup$;
set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('phase9.owner'), 'role', 'authenticated')::text, true) is not null as owner_identity_set;
do $owner$
declare
  v_query extensions.vector := current_setting('phase9.vector')::extensions.vector;
  v_doc uuid := current_setting('phase9.document')::uuid;
  v_total integer;
  v_top integer;
  v_scoped integer;
begin
  select count(*) into v_total from public.search_document_chunks(v_query, 20, null, -1);
  select count(*) into v_top from public.search_document_chunks(v_query, 1, null, -1);
  select count(*) into v_scoped from public.search_document_chunks(v_query, 20, v_doc, -1);
  if v_total < 2 or v_top <> 1 or v_scoped < 1
    or exists (select 1 from public.search_document_chunks(v_query, 20, v_doc, -1) r where r.document_id <> v_doc)
    or not exists (select 1 from public.search_document_chunks(v_query, 20, v_doc, 0.999) r where r.chunk_index = 0)
    or exists (select 1 from public.search_document_chunks(v_query, 20, null, 0.30) r where r.similarity < 0.30)
  then raise exception 'Owner retrieval/top-k/scope/threshold checks failed'; end if;
  perform set_config('phase9.owner_total', v_total::text, true);
  perform set_config('phase9.owner_scoped', v_scoped::text, true);
  -- PostgreSQL checks arguments independently from the application.
  begin
    perform public.search_document_chunks(v_query, 21, null, -1);
    raise exception 'Excessive top-k accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.search_document_chunks(v_query, 5, null, 'NaN'::double precision);
    raise exception 'NaN threshold accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.search_document_chunks(null, 5, null, -1);
    raise exception 'Null vector accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.search_document_chunks(array_fill(0::real, array[384])::extensions.vector, 5, null, -1);
    raise exception 'Zero vector accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.search_document_chunks(array_fill(0::real, array[383])::extensions.vector, 5, null, -1);
    raise exception 'Wrong dimension accepted';
  exception when invalid_parameter_value then null; end;
end;
$owner$;
select set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('phase9.other'), 'role', 'authenticated')::text, true) is not null as other_identity_set;
do $other$
begin
  if exists(select 1 from public.search_document_chunks(current_setting('phase9.vector')::extensions.vector, 20, null, -1) r
      where r.document_id = any(current_setting('phase9.owned_documents')::uuid[]))
    or exists(select 1 from public.search_document_chunks(current_setting('phase9.vector')::extensions.vector, 20, current_setting('phase9.document')::uuid, -1))
    or exists(select 1 from public.documents where id = current_setting('phase9.document')::uuid)
    or exists(select 1 from public.document_chunks where document_id = current_setting('phase9.document')::uuid)
    or exists(select 1 from storage.objects where bucket_id = 'documents' and name = current_setting('phase9.path'))
    or has_function_privilege('anon', 'public.search_document_chunks(extensions.vector,integer,uuid,double precision)', 'EXECUTE')
  then raise exception 'Other-identity isolation failed'; end if;
end;
$other$;
select
  current_setting('phase9.other_is_existing_account')::boolean as other_is_existing_account,
  current_setting('phase9.owner_total')::integer as owner_all_scope_results,
  current_setting('phase9.owner_scoped')::integer as owner_single_scope_results,
  (select count(*) from public.search_document_chunks(current_setting('phase9.vector')::extensions.vector, 20, null, -1) r
    where r.document_id = any(current_setting('phase9.owned_documents')::uuid[])) as other_all_scope_results,
  (select count(*) from public.search_document_chunks(current_setting('phase9.vector')::extensions.vector, 20, current_setting('phase9.document')::uuid, -1)) as other_single_scope_results,
  true as rpc_argument_guards_passed;
reset role;
rollback;
