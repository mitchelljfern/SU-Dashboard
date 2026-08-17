-- Sending a submission back for changes. Rather than a reject state, this
-- returns the row to pending with a note, so the member can edit and resubmit
-- and nothing already entered is lost.
alter table public.team_payments
  add column if not exists change_requested boolean not null default false,
  add column if not exists change_note      text    not null default '';

-- Member edits now also clear the change flag: editing IS the response, and the
-- row goes back into the reviewer's queue. The note is kept as context.
-- Members still cannot set their own status, rate or adjustment.
create or replace function public.team_payments_guard()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if auth.uid() is not null and not public.can_view_billing() then
    new.profile_id  := auth.uid();       -- never submit on someone else's behalf
    new.status      := 'pending';        -- approval is not self-service
    new.approved_by := null;
    new.approved_at := null;
    new.paid_at     := null;
    new.adjustment  := 0;                -- corrections are a finance action
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
end $$;
revoke execute on function public.team_payments_guard() from public, anon, authenticated;
