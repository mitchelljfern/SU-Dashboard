-- Strategy is a shared board rather than a plan handed down: both sides add
-- cards and move them between lists. Clients get insert, and their updates are
-- no longer field-restricted. RLS still pins every row to their own tenant.
create policy strategy_client_insert on public.strategy for insert to authenticated
  with check (client_id is not null and client_id = public.my_client_id());

-- Deleting stays with the team: it is the one destructive action here, and a
-- client removing work the agency planned is not something to allow by default.
drop trigger if exists strategy_client_guard on public.strategy;

-- Drop the strategy branch from the shared guard; the other tables keep theirs.
create or replace function public.client_jsonb_guard()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  allowed text[];
  k text;
  merged jsonb;
begin
  if auth.uid() is null or public.is_team() then
    return new;                       -- staff and service work are unrestricted
  end if;

  allowed := case TG_TABLE_NAME
    when 'work'     then array['comments']
    when 'requests' then array['comments','files','links']
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

  new.data      := merged;
  new.client_id := old.client_id;     -- no moving a row between tenants
  new.id        := old.id;
  return new;
end $$;
revoke execute on function public.client_jsonb_guard() from public, anon, authenticated;
