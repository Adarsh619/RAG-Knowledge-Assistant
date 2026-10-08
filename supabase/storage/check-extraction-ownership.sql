-- Run while the generated phase-5-text-test.pdf is stored in the development bucket.
-- READ ONLY: no file, row, account, bucket, or policy is changed.
begin read only;
select set_config('phase5.path', (
  select name from storage.objects where bucket_id='documents'
    and storage.filename(name) like '%--phase-5-text-test.pdf'
  order by created_at desc limit 1
), true);
select set_config('phase5.owner', (
  select owner_id from storage.objects where bucket_id='documents'
    and name=current_setting('phase5.path')
), true);
set local role authenticated;
do $check$
begin
  if coalesce(current_setting('phase5.owner'), '') = '' then
    raise exception 'Upload the generated Phase 5 text fixture first';
  end if;
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('phase5.owner'), 'role', 'authenticated')::text, true);
  if not exists(select 1 from storage.objects where bucket_id='documents' and name=current_setting('phase5.path')) then
    raise exception 'Owner read failed';
  end if;
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', case when current_setting('phase5.owner')='00000000-0000-4000-8000-000000000001'
      then '00000000-0000-4000-8000-000000000002' else '00000000-0000-4000-8000-000000000001' end,
    'role', 'authenticated')::text, true);
  if exists(select 1 from storage.objects where bucket_id='documents' and name=current_setting('phase5.path')) then
    raise exception 'Another identity could read the owner PDF';
  end if;
end;
$check$;
set local role anon;
select set_config('request.jwt.claims', '{}', true);
do $check$
begin
  if exists(select 1 from storage.objects where bucket_id='documents' and name=current_setting('phase5.path')) then
    raise exception 'Anonymous identity could read the owner PDF';
  end if;
end;
$check$;
rollback;
select jsonb_build_object('owner_can_read', true, 'other_identity_read_denied', true,
  'anonymous_read_denied', true, 'storage_data_changed', false) as extraction_isolation;
