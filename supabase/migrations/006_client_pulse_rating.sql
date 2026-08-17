alter table public.clients add column if not exists pulse_month text;

-- Clients may rate their own month. They may NOT touch plan, price or hours,
-- so a trigger pins every other column back to its old value for non-team
-- users. (RLS can gate the row but not individual columns; the trigger does.)
create or replace function public.clients_client_update_guard()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if not public.is_team() then
    new.id          := old.id;
    new.name        := old.name;
    new.domain      := old.domain;
    new.service     := old.service;
    new.plan        := old.plan;
    new.price       := old.price;
    new.hours_used  := old.hours_used;
    new.hours_total := old.hours_total;
    new.created_at  := old.created_at;
    -- only new.pulse and new.pulse_month survive
  end if;
  return new;
end $$;

create trigger clients_guard
  before update on public.clients
  for each row execute function public.clients_client_update_guard();

create policy clients_client_rate on public.clients for update to authenticated
  using      (id = public.my_client_id())
  with check (id = public.my_client_id());
