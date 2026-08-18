-- A card's description is now editable from the card itself, by whoever is
-- looking at it — the team and the client both. RLS gates rows, not keys
-- inside a jsonb body, so without adding `desc` to the allowed list the
-- trigger would quietly pin a client's edit back to its stored value: the
-- textarea would accept the text and the change would evaporate on the next
-- load, which is worse than not offering the control at all.
--
-- Everything else stays exactly as migration 022 left it. A client still
-- cannot touch a status, a title, a projected finish date or an approval.
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
    when 'work'     then array['comments','desc']
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

  new.data      := merged;
  new.client_id := old.client_id;     -- no moving a row between tenants
  new.id        := old.id;
  return new;
end $$;

revoke execute on function public.client_jsonb_guard() from public, anon, authenticated;
