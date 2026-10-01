-- What was actually sent, not just what was owed.
--
-- A pay row already knows what someone earned (minutes x rate, plus any
-- adjustment). Finance also needs the payment itself: how much went out, the
-- day it went out (paid_at, which already exists), who received it, and the
-- processor's transaction id, so a late or split payment still lines up with
-- the period it covers.
--
-- paid_to is free text on purpose: for tax reasons a member's pay can go to a
-- family member's account while staying filed under that member.

alter table public.team_payments
  add column if not exists paid_amount numeric,
  add column if not exists paid_to     text not null default '',
  add column if not exists payment_ref text not null default '';

-- Members cannot record or alter payment details on their own rows; only
-- finance can. Same shape as the existing guard: a member's write keeps
-- whatever finance last set.
create or replace function public.team_payments_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if auth.uid() is not null and not public.can_view_billing() then
    new.profile_id  := auth.uid();       -- never submit on someone else's behalf
    new.status      := 'pending';        -- approval is not self-service
    new.approved_by := null;
    new.approved_at := null;
    new.paid_at     := null;
    new.adjustment  := 0;                -- corrections are a finance action
    if TG_OP = 'INSERT' then
      new.paid_amount := null;
      new.paid_to     := '';
      new.payment_ref := '';
    else
      new.paid_amount := old.paid_amount;
      new.paid_to     := old.paid_to;
      new.payment_ref := old.payment_ref;
    end if;
    -- Pay rate comes from the rate table, never from the submitted row.
    if new.kind = 'hours' then
      new.rate := coalesce(
        (select hourly_rate from public.team_rates where profile_id = auth.uid()), 0);
    else
      new.rate := 0;
    end if;
    if TG_OP = 'INSERT' then
      new.submitted_by := auth.uid();
      new.submitted_at := now();
      new.change_requested := false;
      new.change_note      := '';
    else
      -- responding to feedback by editing clears the flag; only a reviewer
      -- can raise it again
      new.change_requested := false;
      new.change_note      := old.change_note;
    end if;
  end if;
  return new;
end $function$;

revoke execute on function public.team_payments_guard() from public, anon, authenticated;
