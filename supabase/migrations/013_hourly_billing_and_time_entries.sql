-- Not every client is on a monthly plan. 'retainer' keeps the plan/price model;
-- 'hourly' bills logged time at the client's rate, invoiced on the 1st.
alter table public.clients
  add column if not exists billing_type text not null default 'retainer',
  add column if not exists hourly_rate  numeric not null default 0;

alter table public.clients drop constraint if exists clients_billing_type_check;
alter table public.clients add constraint clients_billing_type_check
  check (billing_type in ('retainer','hourly'));

-- Hours worked for a client. Staff log them; the client reads them so they can
-- see what their next invoice is building towards.
create table if not exists public.time_entries (
  id          text primary key,
  client_id   text not null references public.clients(id) on delete cascade,
  profile_id  uuid references public.profiles(id) on delete set null,
  entry_date  date not null,
  hours       numeric not null default 0 check (hours >= 0),
  description text not null default '',
  billable    boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists time_entries_client_idx on public.time_entries (client_id);
create index if not exists time_entries_date_idx   on public.time_entries (entry_date desc);

alter table public.time_entries enable row level security;

-- Any staff member logs time — this is operational, not financial.
create policy time_entries_team_all on public.time_entries for all to authenticated
  using (public.is_team()) with check (public.is_team());

-- The client sees its own hours, and only reads them: no insert/update/delete
-- policy exists for clients, so they cannot invent or erase time.
create policy time_entries_client_select on public.time_entries for select to authenticated
  using (client_id = public.my_client_id());

-- Pin the new columns so a client cannot set its own rate or billing type.
create or replace function public.clients_client_update_guard()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if not public.is_team() then
    new.id                 := old.id;
    new.name               := old.name;
    new.domain             := old.domain;
    new.service            := old.service;
    new.plan               := old.plan;
    new.price              := old.price;
    new.hours_used         := old.hours_used;
    new.hours_total        := old.hours_total;
    new.businesses         := old.businesses;
    new.billing_portal_url := old.billing_portal_url;
    new.billing_cycle      := old.billing_cycle;
    new.billing_type       := old.billing_type;
    new.hourly_rate        := old.hourly_rate;
    new.created_at         := old.created_at;
    -- only new.pulse and new.pulse_month survive
  end if;
  return new;
end $$;
revoke execute on function public.clients_client_update_guard()
  from public, anon, authenticated;
