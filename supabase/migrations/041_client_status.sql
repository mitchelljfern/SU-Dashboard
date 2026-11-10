-- Client status: where each client stands with Social Upgrades.
--
--   active    current work, shown first on the team's Clients page
--   stalled   still technically a client (we keep their site) but no hours,
--             no plan and no projects moving
--   inactive  not a client right now; kept for history and billing records
--
-- Team-only to change. The brand guard from migration 032 rebuilds every
-- client-side update to `clients` from the stored row, so a client can never
-- set its own status.
alter table public.clients
  add column if not exists status text not null default 'active';

alter table public.clients drop constraint if exists clients_status_check;
alter table public.clients
  add constraint clients_status_check check (status in ('active','stalled','inactive'));

update public.clients set status = 'inactive' where id = 'agmb';
update public.clients set status = 'stalled'  where id = 'agr';
