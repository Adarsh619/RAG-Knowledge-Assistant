-- Phase 4 isolation check. Upload the disposable phase-4-storage-test.pdf first.
-- This transaction is READ ONLY: no file bytes or Storage rows are changed.
begin read only;

select set_config('phase4.fixture_path', (
  select name from storage.objects
  where bucket_id='documents'
    and storage.filename(name) like '%--phase-4-storage-test.pdf'
  order by created_at desc limit 1
), true);
select set_config('phase4.fixture_owner', (
  select owner_id from storage.objects
  where bucket_id='documents' and name=current_setting('phase4.fixture_path')
), true);

do $check$
begin
  if coalesce(current_setting('phase4.fixture_path'), '') = ''
     or coalesce(current_setting('phase4.fixture_owner'), '') = '' then
    raise exception 'Upload the disposable test PDF through the app first';
  end if;
end;
$check$;

set local role authenticated;
do $check$
begin
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('phase4.fixture_owner'), 'role', 'authenticated'
  )::text, true);
  if not exists(select 1 from storage.objects
    where bucket_id='documents' and name=current_setting('phase4.fixture_path')) then
    raise exception 'The authenticated owner could not read the test file';
  end if;

  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', case when current_setting('phase4.fixture_owner') = '00000000-0000-4000-8000-000000000001'
      then '00000000-0000-4000-8000-000000000002'
      else '00000000-0000-4000-8000-000000000001' end,
    'role', 'authenticated'
  )::text, true);
  if exists(select 1 from storage.objects
    where bucket_id='documents' and name=current_setting('phase4.fixture_path')) then
    raise exception 'A different authenticated user could read the test file';
  end if;
end;
$check$;

set local role anon;
select set_config('request.jwt.claims', '{}', true);
do $check$
begin
  if exists(select 1 from storage.objects
    where bucket_id='documents' and name=current_setting('phase4.fixture_path')) then
    raise exception 'An unauthenticated user could read the test file';
  end if;
end;
$check$;

rollback;
select jsonb_build_object('owner_can_read', true, 'other_user_read_denied', true,
  'signed_out_read_denied', true, 'storage_rows_changed', false) as isolation_checks;
