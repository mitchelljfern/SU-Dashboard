-- Three things a member can submit: hours for a pay period, an invoice for
-- project work, or a one-time payment such as an expense.
alter table public.team_payments
  add column if not exists kind         text not null default 'hours',
  add column if not exists minutes      integer not null default 0,
  add column if not exists flat_amount  numeric not null default 0,
  add column if not exists breakdown    jsonb   not null default '[]'::jsonb,
  add column if not exists submitted_by uuid references public.profiles(id) on delete set null,
  add column if not exists submitted_at timestamptz,
  add column if not exists approved_by  uuid references public.profiles(id) on delete set null,
  add column if not exists approved_at  timestamptz;

alter table public.team_payments drop constraint if exists team_payments_kind_check;
alter table public.team_payments add constraint team_payments_kind_check
  check (kind in ('hours','invoice','expense'));

update public.team_payments set minutes = round(coalesce(hours,0) * 60)::int
where minutes = 0 and coalesce(hours,0) > 0;

-- amount was generated from hours*rate, which cannot express an invoice or an
-- expense. Generated expressions cannot be altered in place, so rebuild it.
-- minutes is authoritative so "2h 59m" survives a round trip exactly.
alter table public.team_payments drop column if exists amount;
alter table public.team_payments drop column if exists hours;
alter table public.team_payments add column amount numeric
  generated always as (
    case when kind = 'hours' then round(minutes * rate / 60.0, 2)
         else flat_amount end
    + adjustment
  ) stored;

-- pending -> approved (unpaid) -> paid
alter table public.team_payments drop constraint if exists team_payments_status_check;
alter table public.team_payments add constraint team_payments_status_check
  check (status in ('pending','unpaid','paid'));

-- The old unique key assumed one hours row per period. Invoices and expenses
-- can repeat within a period, so scope the constraint to hours submissions.
alter table public.team_payments
  drop constraint if exists team_payments_profile_id_period_start_period_end_key;
create unique index if not exists team_payments_one_hours_per_period
  on public.team_payments (profile_id, period_start, period_end)
  where kind = 'hours';
