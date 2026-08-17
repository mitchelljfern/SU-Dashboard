-- Members submit their own pay; finance approves it. A member may create and
-- edit a submission only while it is still pending — once approved it is out
-- of their hands.
create policy team_payments_own_insert on public.team_payments for insert to authenticated
  with check (profile_id = auth.uid());
create policy team_payments_own_update on public.team_payments for update to authenticated
  using      (profile_id = auth.uid() and status = 'pending')
  with check (profile_id = auth.uid());
create policy team_payments_own_delete on public.team_payments for delete to authenticated
  using (profile_id = auth.uid() and status = 'pending');

-- RLS decides which rows a member may touch; this decides which *fields* they
-- get to set. Without it a member could submit hours at their own rate, or
-- insert a row already marked paid.
--
-- auth.uid() is null for service-role and SQL-editor work, where the guard is
-- skipped; RLS still blocks anon, so that is safe.
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
    end if;
  end if;
  return new;
end $$;

drop trigger if exists team_payments_guard_trg on public.team_payments;
create trigger team_payments_guard_trg
  before insert or update on public.team_payments
  for each row execute function public.team_payments_guard();

revoke execute on function public.team_payments_guard() from public, anon, authenticated;
