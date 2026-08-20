-- Manual card order, shared by both sides.
--
-- A column showed whatever order the rows arrived in, so the card that
-- mattered most could be anywhere in it. `sort` is a card's position within
-- its column, and both sides read and write the same one — the client's queue
-- and ours are the same list, so a card moved on either side moves for
-- everyone. That only works if a client may write it, so `sort` joins the
-- keys the guard lets through on work and requests. Everything else here is
-- 029 unchanged.
--
-- It is a position and nothing more: it cannot move a card between columns
-- (that is `status`, still team-only), between tenants, or change what the
-- card says. The worst a client can do with it is reorder their own queue,
-- which is the point.
create or replace function public.client_jsonb_guard()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  allowed text[];
  k text;
  merged jsonb;
  now_ms bigint;
  list_key text;
  old_list jsonb;
  new_list jsonb;
  was_archived boolean;
  now_archived boolean;
begin
  if auth.uid() is null or public.is_team() then
    return new;                       -- staff and service work are unrestricted
  end if;

  allowed := case TG_TABLE_NAME
    when 'work'     then array['comments','desc','approved','archived','title','sort']
    when 'requests' then array['comments','files','links','desc','archived','title','sort']
    when 'updates'  then array['feedback','approved']
    when 'todos'    then array['done']
    else array[]::text[]
  end;

  merged := coalesce(old.data, '{}'::jsonb);
  foreach k in array allowed loop
    if new.data ? k then
      merged := merged || jsonb_build_object(k, new.data -> k);
    end if;
  end loop;
  now_ms := (extract(epoch from now()) * 1000)::bigint;

  -- A position has to be a number. Without this a client could store a string
  -- or an object there and every sort on that column would read it as absent.
  if merged ? 'sort'
     and jsonb_typeof(merged -> 'sort') not in ('number', 'null') then
    raise exception 'a card position must be a number'
      using errcode = '22023';
  end if;

  -- Signing off a finished work item. Only from 'review', so a client cannot
  -- approve something that was never handed to them, and only once.
  if TG_TABLE_NAME = 'work'
     and coalesce((old.data ->> 'approved')::boolean, false) = false
     and coalesce((merged ->> 'approved')::boolean, false) = true
     and coalesce(old.data ->> 'status', '') = 'review' then
    merged := merged || jsonb_build_object(
      'status',      'done',
      'approvedAt',  now_ms,
      'completedAt', now_ms,
      'hoursApproved', coalesce(
        nullif(old.data ->> 'actualHours', '')::numeric,
        nullif(old.data ->> 'hours', '')::numeric,
        0)
    );
  end if;

  was_archived := coalesce((old.data    ->> 'archived')::boolean, false);
  now_archived := coalesce((merged      ->> 'archived')::boolean, false);

  if was_archived and not now_archived then
    raise exception 'only Social Upgrades can restore an archived card'
      using errcode = '42501';
  end if;

  if not was_archived and now_archived then
    if TG_TABLE_NAME = 'work'
       and nullif(old.data ->> 'approvedAt', '') is not null then
      raise exception 'work that has been approved cannot be archived here'
        using errcode = '42501';
    end if;
    merged := merged || jsonb_build_object(
      'archivedAt', now_ms,
      'archivedBy', auth.uid()::text);
  end if;

  -- Somebody else's comment has to survive the write. Entries are matched by
  -- id, so entries written before ids existed are skipped rather than checked.
  list_key := case TG_TABLE_NAME
    when 'work'     then 'comments'
    when 'requests' then 'comments'
    when 'updates'  then 'feedback'
    else null
  end;
  if list_key is not null then
    old_list := case when jsonb_typeof(old.data -> list_key) = 'array'
                     then old.data -> list_key else '[]'::jsonb end;
    new_list := case when jsonb_typeof(merged -> list_key) = 'array'
                     then merged -> list_key else '[]'::jsonb end;
    if exists (
      select 1 from jsonb_array_elements(old_list) o
      where o ->> 'id' is not null
        and coalesce(o ->> 'by', '') <> coalesce(auth.uid()::text, '')
        and not exists (
          select 1 from jsonb_array_elements(new_list) n
          where n ->> 'id' is not null and n ->> 'id' = o ->> 'id')
    ) then
      raise exception 'only the person who wrote a comment can remove it'
        using errcode = '42501';
    end if;
  end if;

  new.data      := merged;
  new.client_id := old.client_id;     -- no moving a row between tenants
  new.id        := old.id;
  return new;
end $$;

revoke execute on function public.client_jsonb_guard() from public, anon, authenticated;
