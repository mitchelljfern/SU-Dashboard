-- When a to-do was finished.
--
-- The team's completed list is ordered by when each item was ticked, but the
-- only date a to-do carried was the day it was written, so "recently
-- completed" quietly meant "recently created". The app stamps `doneAt` when
-- staff tick one; a client ticking their own could not, because `done` is the
-- single key the guard lets them write.
--
-- So the server stamps it instead of allowing it through: the client sends
-- `done` and the database decides the time. The ordering of that list cannot
-- be written by whoever is ticking the box, and un-ticking clears the stamp so
-- a reopened to-do does not sit in the finished list wearing an old date.
-- Everything else here is 030 unchanged.
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

  -- Finishing a to-do records when, whoever ticked it.
  if TG_TABLE_NAME = 'todos' then
    if coalesce((old.data ->> 'done')::boolean, false) = false
       and coalesce((merged ->> 'done')::boolean, false) = true then
      merged := merged || jsonb_build_object('doneAt', now_ms);
    elsif coalesce((old.data ->> 'done')::boolean, false) = true
       and coalesce((merged ->> 'done')::boolean, false) = false then
      merged := merged - 'doneAt';
    end if;
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
