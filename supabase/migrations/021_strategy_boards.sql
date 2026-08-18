-- Planned content per client, one row per card. Same id/client_id/ts/jsonb
-- shape as the other collections, so it rides the existing sync layer.
-- data: { channel, status, title, body, scheduledFor, links[], comments[] }
create table if not exists public.strategy (
  id         text primary key,
  client_id  text references public.clients(id) on delete cascade,
  ts         bigint not null default (extract(epoch from now())*1000)::bigint,
  data       jsonb  not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists strategy_client_idx on public.strategy (client_id);
create index if not exists strategy_ts_idx     on public.strategy (ts desc);

alter table public.strategy enable row level security;

-- Team plans it; the client reads their own. No client insert or delete: this
-- is the agency's plan, not a shared scratchpad.
create policy strategy_team_all on public.strategy for all to authenticated
  using (public.is_team()) with check (public.is_team());
create policy strategy_client_select on public.strategy for select to authenticated
  using (client_id is not null and client_id = public.my_client_id());
create policy strategy_client_update on public.strategy for update to authenticated
  using      (client_id is not null and client_id = public.my_client_id())
  with check (client_id is not null and client_id = public.my_client_id());

-- Field-level rules. A client may comment, and may sign off an idea — but
-- "posted", "sent" and "live" are statements about work the agency did, so a
-- client can only ever move idea -> approved, never further and never back.
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
    when 'strategy' then array['comments']
    else array[]::text[]
  end;

  merged := coalesce(old.data, '{}'::jsonb);
  foreach k in array allowed loop
    if new.data ? k then
      merged := merged || jsonb_build_object(k, new.data -> k);
    end if;
  end loop;

  -- the one status transition a client is allowed to make
  if TG_TABLE_NAME = 'strategy'
     and coalesce(old.data->>'status','') = 'idea'
     and new.data->>'status' = 'approved' then
    merged := merged || jsonb_build_object('status', 'approved');
  end if;

  new.data      := merged;
  new.client_id := old.client_id;     -- no moving a row between tenants
  new.id        := old.id;
  return new;
end $$;

drop trigger if exists strategy_client_guard on public.strategy;
create trigger strategy_client_guard before update on public.strategy
  for each row execute function public.client_jsonb_guard();

revoke execute on function public.client_jsonb_guard() from public, anon, authenticated;
