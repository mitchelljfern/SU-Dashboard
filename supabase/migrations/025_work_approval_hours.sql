-- Retainer hours used to come from a hardcoded estimate: approving a request
-- created a work item with `hours: 4` regardless of the work, and dragging it
-- to done added that 4 to a running total on the client row. The number was
-- invented and it was client-visible.
--
-- Hours are now counted when a finished item is *approved*, into the month of
-- approval, from hours the team actually recorded. The monthly total is
-- derived from these fields on the work item, so this trigger is what makes a
-- client's approval trustworthy: the client may flip `approved`, and nothing
-- else. Status, timestamps and — above all — the hours counted are stamped
-- here from values already stored, never from what the browser sent.
create or replace function public.client_jsonb_guard()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  allowed text[];
  k text;
  merged jsonb;
  now_ms bigint;
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

  new.data      := merged;
  new.client_id := old.client_id;     -- no moving a row between tenants
  new.id        := old.id;
  return new;
end $$;

revoke execute on function public.client_jsonb_guard() from public, anon, authenticated;
