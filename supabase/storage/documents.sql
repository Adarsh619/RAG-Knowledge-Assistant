-- Phase 4: run once in the existing development project.
-- Uses only Supabase's existing Storage tables; creates no application tables.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 4194304, array['application/pdf']);

create policy "documents_insert_own_pdf"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and owner_id = (select auth.uid()::text)
  and array_length(storage.foldername(name), 1) = 1
  and storage.filename(name) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}--[A-Za-z0-9_-]{1,100}\.pdf$'
);

create policy "documents_select_own"
on storage.objects for select to authenticated
using (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and owner_id = (select auth.uid()::text)
);

create policy "documents_delete_own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'documents'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and owner_id = (select auth.uid()::text)
);

-- No UPDATE policy: overwriting, moving, and renaming are not part of Phase 4.
commit;
