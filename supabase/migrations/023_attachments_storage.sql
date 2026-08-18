-- Attachments were never actually stored anywhere. Attaching a file recorded
-- its *name* on the item's jsonb body and nothing else, so every "Download"
-- link in the app pointed at href="#". Bytes now live in a private storage
-- bucket and the item carries the object path.
--
-- Path convention: <client_id>/<kind>/<item_id>/<opaque>.<ext>
-- The first folder segment is the tenant, which is what the policies below
-- compare against, so the bucket inherits the same isolation the tables have.
-- Team-only rows (no client) live under '_internal'.

insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 52428800)   -- 50 MB a file
on conflict (id) do update
  set public          = excluded.public,
      file_size_limit = excluded.file_size_limit;

-- Private bucket: nothing is readable by URL alone. The app signs a URL per
-- view or download, so a link copied out of the portal stops working.

drop policy if exists attachments_team_all      on storage.objects;
drop policy if exists attachments_client_read   on storage.objects;
drop policy if exists attachments_client_insert on storage.objects;

create policy attachments_team_all on storage.objects for all to authenticated
  using       (bucket_id = 'attachments' and public.is_team())
  with check  (bucket_id = 'attachments' and public.is_team());

create policy attachments_client_read on storage.objects for select to authenticated
  using (bucket_id = 'attachments'
         and (storage.foldername(name))[1] = public.my_client_id());

-- Clients may attach to their own requests, so they need insert — pinned to
-- their own folder, exactly as the table policies pin their rows.
create policy attachments_client_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments'
              and (storage.foldername(name))[1] = public.my_client_id());

-- No client update or delete: removing a file stays team-only, like every
-- other destructive action in this app.
