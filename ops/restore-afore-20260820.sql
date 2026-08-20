-- Restore point for the Afore Beauty test-data wipe of 2026-08-20.
--
-- The wipe removed every Afore content row from the production project
-- tiefkbutqnrttpdcsmiy (dashboard.socialupgrades.com). Before deleting,
-- each row was copied verbatim into public._afore_backup_20260820 as
-- jsonb, so the delete is fully reversible from inside the database.
--
-- What was kept: the clients row for 'af' itself (name, domain, service,
-- hourly_rate, colour, billing settings) so the real Afore team can be
-- onboarded onto the same account. Only hours_used and pulse were reset.
--
-- What was NOT touched: every other client, ViewSlipstream included.
--
-- The backup table has RLS enabled with no policies, so only service_role
-- can read it. Drop it once you are confident the wipe is correct.

-- What is in the backup:
--   select src, count(*) from public._afore_backup_20260820 group by src order by src;
--   clients 1 | files 8 | invoices 3 | log 22 | message_reads 2 | messages 13
--   profiles 1 | reports 1 | requests 2 | todos 3 | updates 3 | work 4 | auth.users 1

-- ---------------------------------------------------------------------
-- Restore the content tables (safe to re-run; ON CONFLICT DO NOTHING).
-- ---------------------------------------------------------------------
insert into public.todos    select * from jsonb_populate_recordset(null::public.todos,    (select jsonb_agg(payload) from public._afore_backup_20260820 where src='todos'))    on conflict (id) do nothing;
insert into public.work     select * from jsonb_populate_recordset(null::public.work,     (select jsonb_agg(payload) from public._afore_backup_20260820 where src='work'))     on conflict (id) do nothing;
insert into public.requests select * from jsonb_populate_recordset(null::public.requests, (select jsonb_agg(payload) from public._afore_backup_20260820 where src='requests')) on conflict (id) do nothing;
insert into public.updates  select * from jsonb_populate_recordset(null::public.updates,  (select jsonb_agg(payload) from public._afore_backup_20260820 where src='updates'))  on conflict (id) do nothing;
insert into public.messages select * from jsonb_populate_recordset(null::public.messages, (select jsonb_agg(payload) from public._afore_backup_20260820 where src='messages')) on conflict (id) do nothing;
insert into public.files    select * from jsonb_populate_recordset(null::public.files,    (select jsonb_agg(payload) from public._afore_backup_20260820 where src='files'))    on conflict (id) do nothing;
insert into public.invoices select * from jsonb_populate_recordset(null::public.invoices, (select jsonb_agg(payload) from public._afore_backup_20260820 where src='invoices')) on conflict (id) do nothing;
insert into public.log      select * from jsonb_populate_recordset(null::public.log,      (select jsonb_agg(payload) from public._afore_backup_20260820 where src='log'))      on conflict (id) do nothing;
insert into public.reports  select * from jsonb_populate_recordset(null::public.reports,  (select jsonb_agg(payload) from public._afore_backup_20260820 where src='reports'))  on conflict (client_id) do nothing;

-- ---------------------------------------------------------------------
-- Restore hours_used / pulse on the client row.
-- The clients_guard trigger reverts every field except pulse unless the
-- caller is a signed-in team user, so it has to come off for this one
-- statement. The exception handler puts it back even if the update fails.
-- ---------------------------------------------------------------------
do $$
declare c jsonb := (select payload from public._afore_backup_20260820 where src='clients' limit 1);
begin
  execute 'alter table public.clients disable trigger clients_guard';
  update public.clients
     set hours_used  = (c->>'hours_used')::numeric,
         pulse       = c->'pulse',
         pulse_month = c->>'pulse_month'
   where id = 'af';
  execute 'alter table public.clients enable trigger clients_guard';
exception when others then
  execute 'alter table public.clients enable trigger clients_guard';
  raise;
end $$;

-- ---------------------------------------------------------------------
-- The client@aforebeauty.com portal login was deleted too. Its auth.users
-- and profiles rows are in the backup, but recreating a login is better
-- done through the app's own admin_create_client_login RPC than by
-- reinserting into auth.users by hand:
--   select public.admin_create_client_login('af','client@aforebeauty.com','<password>','Afore Beauty');
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- NOT restorable from here: the storage object
--   attachments/af/requests/r1/9efac0a6-0408-4fd1-8cc2-4c4a01aed430.jpg
-- (gb-magazine.jpg, 2.4 MB). Storage blocks direct SQL deletes, so it was
-- left in place and must be removed via the Storage API or the Supabase
-- dashboard (Storage -> attachments -> af/).
-- ---------------------------------------------------------------------
