-- READ ONLY: run while phase-7-embedding-test.pdf is stored in development.
-- No file, row, account, bucket, or policy is changed.
begin read only;
do $setup$
declare
  object_path text;
  object_owner text;
begin
  select name, owner_id into object_path, object_owner
  from storage.objects
  where bucket_id = 'documents'
    and storage.filename(name) like '%--phase-7-embedding-test.pdf'
  order by created_at desc limit 1;
  if coalesce(object_owner, '') = '' then
    raise exception 'Upload the generated Phase 7 fixture first';
  end if;
  perform set_config('phase7.path', object_path, true);
  perform set_config('phase7.owner', object_owner, true);
end;
$setup$;
set local role authenticated;
do $check$
begin
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('phase7.owner'), 'role', 'authenticated')::text, true);
  if not exists(select 1 from storage.objects where bucket_id = 'documents' and name = current_setting('phase7.path')) then
    raise exception 'Owner read failed';
  end if;
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', case when current_setting('phase7.owner') = '00000000-0000-4000-8000-000000000001'
      then '00000000-0000-4000-8000-000000000002' else '00000000-0000-4000-8000-000000000001' end,
    'role', 'authenticated')::text, true);
  if exists(select 1 from storage.objects where bucket_id = 'documents' and name = current_setting('phase7.path')) then
    raise exception 'Another identity could read the owner PDF';
  end if;
end;
$check$;
set local role anon;
do $check$
begin
  perform set_config('request.jwt.claims', '{}', true);
  if exists(select 1 from storage.objects where bucket_id = 'documents' and name = current_setting('phase7.path')) then
    raise exception 'Anonymous identity could read the owner PDF';
  end if;
end;
$check$;
rollback;
select jsonb_build_object('owner_can_read', true, 'other_identity_read_denied', true,
  'anonymous_read_denied', true, 'storage_data_changed', false) as embedding_isolation;
