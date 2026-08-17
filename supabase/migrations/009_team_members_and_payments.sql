-- ---------- team member fields ----------
alter table public.profiles
  add column if not exists is_admin    boolean not null default false,
  add column if not exists hourly_rate numeric not null default 20,
  add column if not exists active      boolean not null default true;

-- Multi-brand clients: one tenant, several businesses under it.
alter table public.clients
  add column if not exists businesses jsonb not null default '[]'::jsonb;

create or replace function public.is_admin()
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'team' and p.is_admin
  );
$$;
revoke execute on function public.is_admin() from public, anon;
grant  execute on function public.is_admin() to authenticated;

-- ---------- close a privilege-escalation hole ----------
-- profiles_team_write let ANY team account write profiles, so a non-admin
-- member could set is_admin on themselves or raise their own hourly_rate.
-- Profile writes are now admin-only.
drop policy if exists profiles_team_write on public.profiles;
create policy profiles_admin_write on public.profiles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- payments to team members ----------
create table if not exists public.team_payments (
  id           text primary key,
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  period_start date not null,
  period_end   date not null,
  pay_date     date not null,
  hours        numeric not null default 0,
  rate         numeric not null default 0,          -- snapshot at time of pay
  adjustment   numeric not null default 0,          -- bonus / correction
  amount       numeric generated always as (hours * rate + adjustment) stored,
  status       text not null default 'pending' check (status in ('pending','paid')),
  paid_at      timestamptz,
  note         text not null default '',
  created_at   timestamptz not null default now(),
  unique (profile_id, period_start, period_end)
);
create index if not exists team_payments_profile_idx on public.team_payments (profile_id);
create index if not exists team_payments_pay_date_idx on public.team_payments (pay_date desc);

alter table public.team_payments enable row level security;

-- Admin manages everyone's pay; a member may read only their own; clients
-- get nothing (no policy matches them).
create policy team_payments_admin_all on public.team_payments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy team_payments_own_select on public.team_payments for select to authenticated
  using (profile_id = auth.uid());
