-- The brand kit, and a portal that wears it.
--
-- A client portal looked like Social Upgrades whoever it belonged to. Every
-- client now has a kit -- logos, colours, type, photography, a voice note --
-- and the portal reads from it, so the board a client signs in to is theirs.
--
-- The kit is one jsonb column rather than a table of its own. It is read with
-- the client row on every load, always written whole, and never queried across
-- clients, so a table would buy nothing and cost a join.
--
-- This is the first time a client has been allowed to write to `clients` at
-- all, and that is what the guard below is for. A client's update is rebuilt
-- from the stored row with only `brand` carried across, so the same request
-- cannot also move their price, their retainer hours or their billing terms.
-- Rebuilding from `old` rather than listing the columns to protect means a
-- column added later is protected the day it is added, not the day somebody
-- remembers to come back here.
--
-- Shape is checked on the way in for staff writes too, so the column cannot
-- come to hold a colour that is not a colour. Image URLs are checked hardest:
-- they are read back into `url(...)` in a stylesheet and into <img>, so a URL
-- pointing somewhere we did not put it is the one value in here that could do
-- more than look wrong.

alter table public.clients
  add column if not exists brand jsonb not null default '{}'::jsonb;

-- An image in a kit is one we host: either an upload in the brand-assets
-- bucket or a file shipped with the app. Anything else -- another origin, a
-- data: payload, a javascript: URL -- is refused rather than sanitised, so a
-- bad value fails the write loudly instead of being quietly dropped.
create or replace function public.brand_url_ok(u text)
returns boolean language sql immutable
set search_path = public, pg_temp as $$
  select u ~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/brand-assets/[A-Za-z0-9._/-]+$'
      or u ~ '^assets/[A-Za-z0-9._/-]+$';
$$;

-- Keeps only the keys a kit is made of, and checks each one. Unknown keys are
-- dropped: the column is written whole by the UI, so anything else in there
-- arrived by hand.
create or replace function public.brand_sanitize(b jsonb)
returns jsonb language plpgsql immutable
set search_path = public, pg_temp as $$
declare
  out_b  jsonb := '{}'::jsonb;
  k      text;
  v      text;
  item   jsonb;
  list   jsonb;
  src    text;
  n      int;
begin
  if b is null or jsonb_typeof(b) <> 'object' then
    return '{}'::jsonb;
  end if;

  -- The five colours the portal is themed from.
  foreach k in array array['primary','accent','link','surface','text'] loop
    v := nullif(b ->> k, '');
    if v is not null then
      if v !~ '^#[0-9a-fA-F]{6}$' then
        raise exception 'brand colour "%" must be a six-digit hex value, got "%"', k, v
          using errcode = '22023';
      end if;
      out_b := out_b || jsonb_build_object(k, lower(v));
    end if;
  end loop;

  -- Short single-line text. Trimmed rather than refused: a name too long is a
  -- layout problem, not an attack.
  foreach k in array array['wordmark','displayFont','bodyFont'] loop
    v := b ->> k;
    if v is not null then
      out_b := out_b || jsonb_build_object(k, left(v, 80));
    end if;
  end loop;

  v := b ->> 'voice';
  if v is not null then
    out_b := out_b || jsonb_build_object('voice', left(v, 2000));
  end if;

  -- The two logos the portal chrome actually uses.
  foreach k in array array['logoDark','logoLight'] loop
    v := nullif(b ->> k, '');
    if v is not null then
      if not public.brand_url_ok(v) then
        raise exception 'a brand logo must be a file we host, got "%"', v
          using errcode = '22023';
      end if;
      out_b := out_b || jsonb_build_object(k, v);
    end if;
  end loop;

  -- Logos and photography. Same shape, same checks, different caps.
  foreach k in array array['logos','photos'] loop
    list := b -> k;
    if jsonb_typeof(list) = 'array' then
      n := case when k = 'logos' then 24 else 48 end;
      if jsonb_array_length(list) > n then
        raise exception 'a brand kit holds at most % %', n, k
          using errcode = '22023';
      end if;
      out_b := out_b || jsonb_build_object(k, coalesce((
        select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                 'id',    left(coalesce(e ->> 'id', ''), 40),
                 'name',  left(coalesce(e ->> 'name', ''), 120),
                 'ext',   left(coalesce(e ->> 'ext', ''), 8),
                 'src',   e ->> 'src',
                 'plate', case when e ->> 'plate' = 'dark' then 'dark' else 'light' end)))
        from jsonb_array_elements(list) e
        where e ->> 'src' is not null
          and public.brand_url_ok(e ->> 'src')
      ), '[]'::jsonb));
    end if;
  end loop;

  -- Extra swatches beyond the five themed roles.
  list := b -> 'palette';
  if jsonb_typeof(list) = 'array' then
    if jsonb_array_length(list) > 24 then
      raise exception 'a brand kit holds at most 24 palette colours'
        using errcode = '22023';
    end if;
    for item in select e from jsonb_array_elements(list) e loop
      src := item ->> 'hex';
      if src is null or src !~ '^#[0-9a-fA-F]{6}$' then
        raise exception 'palette colour "%" must be a six-digit hex value', coalesce(src, 'null')
          using errcode = '22023';
      end if;
    end loop;
    out_b := out_b || jsonb_build_object('palette', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',   left(coalesce(e ->> 'id', ''), 40),
               'name', left(coalesce(e ->> 'name', ''), 60),
               'hex',  lower(e ->> 'hex')))
      from jsonb_array_elements(list) e
    ), '[]'::jsonb));
  end if;

  return out_b;
end $$;

revoke execute on function public.brand_url_ok(text)  from public, anon, authenticated;
revoke execute on function public.brand_sanitize(jsonb) from public, anon, authenticated;

-- Inserts are staff-only under the existing policy, so this only has to keep
-- the column well-formed.
create or replace function public.clients_brand_insert_guard()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  new.brand := public.brand_sanitize(coalesce(new.brand, '{}'::jsonb));
  return new;
end $$;

-- A client updating their kit: take the stored row, carry the new kit across,
-- and nothing else. Staff updates pass through with the kit checked.
create or replace function public.clients_brand_update_guard()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  kit jsonb;
begin
  kit := public.brand_sanitize(coalesce(new.brand, '{}'::jsonb));

  if auth.uid() is not null and not public.is_team() then
    if old.id is distinct from public.my_client_id() then
      raise exception 'only Social Upgrades can change another client''s record'
        using errcode = '42501';
    end if;
    new := old;                      -- every other column back as it was
  end if;

  new.brand := kit;
  return new;
end $$;

revoke execute on function public.clients_brand_insert_guard() from public, anon, authenticated;
revoke execute on function public.clients_brand_update_guard() from public, anon, authenticated;

drop trigger if exists clients_brand_insert on public.clients;
create trigger clients_brand_insert
  before insert on public.clients
  for each row execute function public.clients_brand_insert_guard();

drop trigger if exists clients_brand_update on public.clients;
create trigger clients_brand_update
  before update on public.clients
  for each row execute function public.clients_brand_update_guard();

-- The write itself. Scoped to the client's own row; the guard above decides
-- what the write is allowed to carry. There is still no client DELETE.
drop policy if exists clients_client_brand_update on public.clients;
create policy clients_client_brand_update on public.clients
  for update to authenticated
  using      (id = public.my_client_id())
  with check (id = public.my_client_id());

-- ---------- uploads ----------
-- Logos and photography are files, so they live in storage and the kit holds
-- their URLs. Public read: a logo is shown in a portal and on a sign-in page,
-- and guessing the URL of one reveals a logo.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('brand-assets', 'brand-assets', true, 2097152,
        array['image/png','image/jpeg','image/svg+xml','image/webp','image/gif'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Writes are penned into a folder named for the client, which is what ties an
-- upload to a tenant: the first path segment has to be the uploader's own
-- client id, so one client cannot write into another's folder or overwrite a
-- logo that is not theirs.
drop policy if exists brand_assets_read      on storage.objects;
drop policy if exists brand_assets_insert    on storage.objects;
drop policy if exists brand_assets_update    on storage.objects;
drop policy if exists brand_assets_delete    on storage.objects;

create policy brand_assets_read on storage.objects
  for select to public
  using (bucket_id = 'brand-assets');

create policy brand_assets_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'brand-assets'
    and (public.is_team() or (storage.foldername(name))[1] = public.my_client_id())
  );

create policy brand_assets_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'brand-assets'
    and (public.is_team() or (storage.foldername(name))[1] = public.my_client_id())
  )
  with check (
    bucket_id = 'brand-assets'
    and (public.is_team() or (storage.foldername(name))[1] = public.my_client_id())
  );

create policy brand_assets_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'brand-assets'
    and (public.is_team() or (storage.foldername(name))[1] = public.my_client_id())
  );
