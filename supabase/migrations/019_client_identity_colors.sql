-- A stable identity colour per client, stored rather than derived, so it
-- follows the client and never shifts when the list is filtered or another
-- client is removed.
alter table public.clients add column if not exists color text not null default '';

-- Backfill in creation order from the fixed categorical order. Slot order is
-- deliberate, not alphabetical: the palette is validated pair-by-pair in this
-- sequence, so adjacent clients stay distinguishable, including for the common
-- colour-vision deficiencies.
with ordered as (
  select id, row_number() over (order by created_at, id) - 1 as n
  from public.clients
), palette as (
  select array['#2a78d6','#eb6834','#1baf7a','#eda100',
               '#e87ba4','#008300','#4a3aa7','#e34948']::text[] as p
)
update public.clients c
   set color = (select p[(o.n % 8) + 1] from palette)
  from ordered o
 where c.id = o.id and c.color = '';

-- Clients must not be able to repaint themselves in the team's board.
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
    new.color              := old.color;
    new.created_at         := old.created_at;
    -- only new.pulse and new.pulse_month survive
  end if;
  return new;
end $$;
revoke execute on function public.clients_client_update_guard()
  from public, anon, authenticated;
