-- Archiving a card, and who may remove a comment.
--
-- Two rules that would otherwise live only in the browser, which is to say
-- nowhere. An archived card is meant to disappear for the client as if it had
-- been deleted, and a client is meant to be able to delete their own comments
-- and nobody else's. Both are decided here instead.

-- 1. An archived card is invisible to the client, and inert.
--
-- `archived` is not in the guard's allowed-key list below, so a client can
-- neither set it nor clear it; staff archive and restore. Read access is what
-- makes it "as if deleted" — hiding it in the UI would leave the row readable
-- through the API, which is not the same thing.
drop policy if exists work_client_select on public.work;
create policy work_client_select on public.work for select
  using (client_id is not null and client_id = public.my_client_id()
         and coalesce((data ->> 'archived')::boolean, false) = false);

drop policy if exists work_client_update on public.work;
create policy work_client_update on public.work for update
  using (client_id is not null and client_id = public.my_client_id()
         and coalesce((data ->> 'archived')::boolean, false) = false)
  with check (client_id is not null and client_id = public.my_client_id());

drop policy if exists requests_client_select on public.requests;
create policy requests_client_select on public.requests for select
  using (client_id is not null and client_id = public.my_client_id()
         and coalesce((data ->> 'archived')::boolean, false) = false);

drop policy if exists requests_client_update on public.requests;
create policy requests_client_update on public.requests for update
  using (client_id is not null and client_id = public.my_client_id()
         and coalesce((data ->> 'archived')::boolean, false) = false)
  with check (client_id is not null and client_id = public.my_client_id());

-- 2. A client may delete their own comments, and only their own.
--
-- Everything from 025 is unchanged; the comment-ownership check is new. The
-- comment array has to be client-writable for them to comment at all, so
-- without this the rule is a suggestion the browser makes to itself.
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
begin
  if auth.uid() is null or public.is_team() then
    return new;                       -- staff and service work are unrestricted
  end if;

  allowed := case TG_TABLE_NAME
    when 'work'     then array['comments','desc','approved']
    when 'requests' then array['comments','files','links','desc']
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

  -- Signing off a finished work item. Only from 'review', so a client cannot
  -- approve something that was never handed to them, and only once.
  if TG_TABLE_NAME = 'work'
     and coalesce((old.data ->> 'approved')::boolean, false) = false
     and coalesce((merged ->> 'approved')::boolean, false) = true
     and coalesce(old.data ->> 'status', '') = 'review' then
    now_ms := (extract(epoch from now()) * 1000)::bigint;
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
