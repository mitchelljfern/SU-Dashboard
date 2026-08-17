-- Accountant: a staff role that sees money but is not an owner.
alter table public.profiles
  add column if not exists is_accountant boolean not null default false;

-- Stripe billing-portal link so monthly-plan clients can manage their plan.
alter table public.clients
  add column if not exists billing_portal_url text not null default '',
  add column if not exists billing_cycle      text not null default 'monthly';

create or replace function public.can_view_billing()
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'team'
      and (p.is_admin or p.is_accountant)
  );
$$;
revoke execute on function public.can_view_billing() from public, anon;
grant  execute on function public.can_view_billing() to authenticated;

-- ---------- client invoices are finance-only ----------
-- Previously any team account could read them. Restrict to admin/accountant;
-- the client's own read policy (invoices_client_select) is unchanged.
drop policy if exists invoices_team_all on public.invoices;
create policy invoices_billing_all on public.invoices for all to authenticated
  using (public.can_view_billing()) with check (public.can_view_billing());

-- ---------- team payments: admin or accountant ----------
drop policy if exists team_payments_admin_all on public.team_payments;
create policy team_payments_billing_all on public.team_payments for all to authenticated
  using (public.can_view_billing()) with check (public.can_view_billing());
-- (team_payments_own_select still lets each member read their own rows)

-- Pin the new client columns against client-side edits. RLS gates rows, not
-- columns, so the trigger is what stops a client editing its own plan/brands.
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
    new.created_at         := old.created_at;
    -- only new.pulse and new.pulse_month survive
  end if;
  return new;
end $$;
revoke execute on function public.clients_client_update_guard()
  from public, anon, authenticated;
