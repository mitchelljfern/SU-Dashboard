-- Letting a client archive a card of their own.
--
-- 027 made `archived` staff-only, which was too blunt: a client who submits a
-- request by mistake, or stops needing one, had no way to clear it and had to
-- ask. They can archive now, under three rules the trigger enforces:
--
--   1. They may set `archived`, never clear it. Restoring stays with Social
--      Upgrades, so an archive is always undone by someone who can see the
--      whole history.
--   2. They cannot archive work that has already been approved. Approved hours
--      count toward the month's retainer, and archiving drops a card out of
--      that total — the party being billed does not get to do that.
--   3. `archivedAt` and `archivedBy` are stamped here, not accepted from the
--      browser, because they are the archive history the team reads.
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
    when 'work'     then array['comments','desc','approved','archived']
    when 'requests' then array['comments','files','links','desc','archived']
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
      -- The hours the team recorded, or the estimate they set. Read from the
      -- stored row, so the figure cannot be edited on the way through.
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
  -- id, so entries written before ids existed are skipped rather than checked:
  -- treating an unmatchable entry as removed would fail every client write to
  -- an item that has one, including simply adding a comment.
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
