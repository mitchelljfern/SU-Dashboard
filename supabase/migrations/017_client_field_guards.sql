-- Clients hold UPDATE on work and requests so they can comment and attach
-- links. But the whole jsonb body is replaced on write, so that permission
-- also let them rewrite a status, a title, or a projected finish date. RLS
-- gates rows, not fields inside a jsonb column — a trigger does that.
--
-- Each table names the keys a client may change; everything else is pinned
-- back to its stored value.
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

drop trigger if exists work_client_guard     on public.work;
drop trigger if exists requests_client_guard on public.requests;
drop trigger if exists updates_client_guard  on public.updates;
drop trigger if exists todos_client_guard    on public.todos;

create trigger work_client_guard     before update on public.work
  for each row execute function public.client_jsonb_guard();
create trigger requests_client_guard before update on public.requests
  for each row execute function public.client_jsonb_guard();
create trigger updates_client_guard  before update on public.updates
  for each row execute function public.client_jsonb_guard();
create trigger todos_client_guard    before update on public.todos
  for each row execute function public.client_jsonb_guard();

revoke execute on function public.client_jsonb_guard() from public, anon, authenticated;

-- The insert policies check which tenant a row belongs to, but not what is
-- inside it. Without this a client could insert a request already marked
-- approved, or a message attributed to the team.
create or replace function public.client_insert_guard()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or public.is_team() then
    return new;
  end if;

  if TG_TABLE_NAME = 'requests' then
    new.data := new.data || jsonb_build_object('status', 'new');
  elsif TG_TABLE_NAME = 'messages' then
    new.data := new.data || jsonb_build_object('from', 'client');
  elsif TG_TABLE_NAME = 'todos' then
    new.data := new.data || jsonb_build_object('who', 'client');
  end if;
  return new;
end $$;

drop trigger if exists requests_client_insert_guard on public.requests;
drop trigger if exists messages_client_insert_guard on public.messages;
drop trigger if exists todos_client_insert_guard    on public.todos;

create trigger requests_client_insert_guard before insert on public.requests
  for each row execute function public.client_insert_guard();
create trigger messages_client_insert_guard before insert on public.messages
  for each row execute function public.client_insert_guard();
create trigger todos_client_insert_guard    before insert on public.todos
  for each row execute function public.client_insert_guard();

revoke execute on function public.client_insert_guard() from public, anon, authenticated;
