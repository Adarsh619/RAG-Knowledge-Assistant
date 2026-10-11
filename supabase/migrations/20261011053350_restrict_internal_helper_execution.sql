-- The dashboard's optional automatic-RLS event trigger is internal.
-- Preserve the helper/trigger, data, tables and all application RPC grants.
-- Fresh projects may not have installed this dashboard helper at all.
do $migration$
begin
  if pg_catalog.to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end;
$migration$;
