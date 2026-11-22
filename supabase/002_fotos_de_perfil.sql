-- Execute uma vez no SQL Editor. Pode repetir sem apagar as fotos existentes.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('caderno-profile-photos', 'caderno-profile-photos', false, 2097152,
 array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
 allowed_mime_types = excluded.allowed_mime_types;

-- Restrictive guard also protects this bucket if another bucket has broad policies.
drop policy if exists caderno_photo_guard on storage.objects;
create policy caderno_photo_guard on storage.objects as restrictive for all to public
using (bucket_id <> 'caderno-profile-photos' or name = (select auth.uid())::text || '/profile.webp')
with check (bucket_id <> 'caderno-profile-photos' or name = (select auth.uid())::text || '/profile.webp');

drop policy if exists caderno_photo_select_own on storage.objects;
create policy caderno_photo_select_own on storage.objects for select to authenticated
using (bucket_id = 'caderno-profile-photos' and name = (select auth.uid())::text || '/profile.webp');

drop policy if exists caderno_photo_insert_own on storage.objects;
create policy caderno_photo_insert_own on storage.objects for insert to authenticated
with check (bucket_id = 'caderno-profile-photos' and name = (select auth.uid())::text || '/profile.webp');

drop policy if exists caderno_photo_update_own on storage.objects;
create policy caderno_photo_update_own on storage.objects for update to authenticated
using (bucket_id = 'caderno-profile-photos' and name = (select auth.uid())::text || '/profile.webp')
with check (bucket_id = 'caderno-profile-photos' and name = (select auth.uid())::text || '/profile.webp');

drop policy if exists caderno_photo_delete_own on storage.objects;
create policy caderno_photo_delete_own on storage.objects for delete to authenticated
using (bucket_id = 'caderno-profile-photos' and name = (select auth.uid())::text || '/profile.webp');

commit;
