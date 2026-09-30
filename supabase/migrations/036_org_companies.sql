-- Organizations with several companies.
--
-- A client row has always been the tenant: one organization, one login space,
-- one wall in Postgres. `clients.businesses` already listed the companies an
-- organization runs (Double Ops Inc runs Double Ops, Bravo Boxing and Costa
-- Mesa Jiu Jitsu), but nothing was ever filed under one of them, so every
-- company's requests, content and messages sat in one pile.
--
-- Rows now carry `data.businessId`, the company they belong to. A row without
-- one belongs to the organization's first company, which is how everything
-- written before this reads (all of it was about the main company).
--
-- A client login is either organization-wide (business_ids empty: sees every
-- company, the executive view) or scoped to some companies (sees only those).
-- The scope is enforced here, not in the browser: a Bravo Boxing manager
-- cannot read, write or move a Double Ops row even by editing the JavaScript.

alter table public.profiles
  add column if not exists business_ids text[] not null default '{}';

-- The caller's companies. Empty means the whole organization.
create or replace function public.my_business_ids()
returns text[] language sql stable security definer
set search_path = public, pg_temp as $$
  select coalesce((select p.business_ids from public.profiles p where p.id = auth.uid()), '{}'::text[]);
$$;

-- An organization's first company: where rows with no company land.
create or replace function public.main_business_id(p_client text)
returns text language sql stable security definer
set search_path = public, pg_temp as $$
  select c.businesses -> 0 ->> 'id' from public.clients c where c.id = p_client;
$$;

-- Whether a row is inside the caller's companies. Always true for staff and
-- for organization-wide members; the tenant check stays in each policy.
create or replace function public.row_in_my_companies(p_client text, p_data jsonb)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select public.is_team()
      or cardinality(public.my_business_ids()) = 0
      or coalesce(nullif(p_data ->> 'businessId', ''), public.main_business_id(p_client))
           = any (public.my_business_ids());
$$;

revoke execute on function public.my_business_ids()                 from public, anon;
revoke execute on function public.main_business_id(text)            from public, anon;
revoke execute on function public.row_in_my_companies(text, jsonb)  from public, anon;
grant  execute on function public.my_business_ids()                 to authenticated;
grant  execute on function public.main_business_id(text)            to authenticated;
grant  execute on function public.row_in_my_companies(text, jsonb)  to authenticated;

-- ---------------------------------------------------------------------------
-- Client policies gain the company check. Team policies are untouched.
-- ---------------------------------------------------------------------------

-- strategy (shared board: select, insert, update)
drop policy if exists strategy_client_select on public.strategy;
drop policy if exists strategy_client_insert on public.strategy;
drop policy if exists strategy_client_update on public.strategy;
create policy strategy_client_select on public.strategy for select to authenticated
  using (client_id is not null and client_id = public.my_client_id() and public.row_in_my_companies(client_id, data));
create policy strategy_client_insert on public.strategy for insert to authenticated
  with check (client_id is not null and client_id = public.my_client_id() and public.row_in_my_companies(client_id, data));
create policy strategy_client_update on public.strategy for update to authenticated
  using (client_id is not null and client_id = public.my_client_id() and public.row_in_my_companies(client_id, data))
  with check (client_id is not null and client_id = public.my_client_id() and public.row_in_my_companies(client_id, data));

-- todos
drop policy if exists todos_client_select on public.todos;
drop policy if exists todos_client_insert on public.todos;
drop policy if exists todos_client_update on public.todos;
create policy todos_client_select on public.todos for select to authenticated
  using (client_id is not null and client_id = public.my_client_id() and public.row_in_my_companies(client_id, data));
create policy todos_client_insert on public.todos for insert to authenticated
  with check (client_id is not null and client_id = public.my_client_id() and public.row_in_my_companies(client_id, data));
create policy todos_client_update on public.todos for update to authenticated
  using (client_id is not null and client_id = public.my_client_id() and public.row_in_my_companies(client_id, data))
  with check (client_id is not null and client_id = public.my_client_id() and public.row_in_my_companies(client_id, data));

-- messages
drop policy if exists messages_client_select on public.messages;
drop policy if exists messages_client_insert on public.messages;
create policy messages_client_select on public.messages for select to authenticated
  using (client_id is not null and client_id = public.my_client_id() and public.row_in_my_companies(client_id, data));
create policy messages_client_insert on public.messages for insert to authenticated
  with check (client_id is not null and client_id = public.my_client_id() and public.row_in_my_companies(client_id, data));

-- updates
drop policy if exists updates_client_select on public.updates;
drop policy if exists updates_client_update on public.updates;
create policy updates_client_select on public.updates for select to authenticated
  using (client_id is not null and client_id = public.my_client_id() and public.row_in_my_companies(client_id, data));
create policy updates_client_update on public.updates for update to authenticated
  using (client_id is not null and client_id = public.my_client_id() and public.row_in_my_companies(client_id, data))
  with check (client_id is not null and client_id = public.my_client_id() and public.row_in_my_companies(client_id, data));

-- files
drop policy if exists files_client_select on public.files;
drop policy if exists files_client_insert on public.files;
create policy files_client_select on public.files for select to authenticated
  using (client_id is not null and client_id = public.my_client_id() and public.row_in_my_companies(client_id, data));
create policy files_client_insert on public.files for insert to authenticated
  with check (client_id is not null and client_id = public.my_client_id() and public.row_in_my_companies(client_id, data));

-- log
drop policy if exists log_client_select on public.log;
drop policy if exists log_client_insert on public.log;
create policy log_client_select on public.log for select to authenticated
  using (client_id is not null and client_id = public.my_client_id() and public.row_in_my_companies(client_id, data));
create policy log_client_insert on public.log for insert to authenticated
  with check (client_id is not null and client_id = public.my_client_id() and public.row_in_my_companies(client_id, data));

-- requests (archived rows stay invisible to clients, as before)
drop policy if exists requests_client_select on public.requests;
drop policy if exists requests_client_insert on public.requests;
drop policy if exists requests_client_update on public.requests;
create policy requests_client_select on public.requests for select to authenticated
  using (client_id is not null and client_id = public.my_client_id()
         and coalesce((data ->> 'archived')::boolean, false) = false
         and public.row_in_my_companies(client_id, data));
create policy requests_client_insert on public.requests for insert to authenticated
  with check (client_id is not null and client_id = public.my_client_id() and public.row_in_my_companies(client_id, data));
create policy requests_client_update on public.requests for update to authenticated
  using (client_id is not null and client_id = public.my_client_id()
         and coalesce((data ->> 'archived')::boolean, false) = false
         and public.row_in_my_companies(client_id, data))
  with check (client_id is not null and client_id = public.my_client_id() and public.row_in_my_companies(client_id, data));

-- work
drop policy if exists work_client_select on public.work;
drop policy if exists work_client_update on public.work;
create policy work_client_select on public.work for select to authenticated
  using (client_id is not null and client_id = public.my_client_id()
         and coalesce((data ->> 'archived')::boolean, false) = false
         and public.row_in_my_companies(client_id, data));
create policy work_client_update on public.work for update to authenticated
  using (client_id is not null and client_id = public.my_client_id()
         and coalesce((data ->> 'archived')::boolean, false) = false
         and public.row_in_my_companies(client_id, data))
  with check (client_id is not null and client_id = public.my_client_id() and public.row_in_my_companies(client_id, data));

-- ---------------------------------------------------------------------------
-- Who is on which company.
-- ---------------------------------------------------------------------------

-- Staff, or an organization-wide member of the same organization, can set a
-- portal member's companies. An empty list makes them organization-wide.
-- Nobody can widen their own scope: a scoped member is refused outright, and
-- an organization-wide member changing themselves can only narrow.
create or replace function public.set_member_companies(p_user uuid, p_business_ids text[])
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  target public.profiles%rowtype;
  valid text[];
  ids text[];
begin
  select * into target from public.profiles where id = p_user;
  if not found or target.role <> 'client' or target.client_id is null then
    raise exception 'only a portal member can be given companies' using errcode = '22023';
  end if;
  if not public.is_team() then
    if public.my_client_id() is distinct from target.client_id
       or cardinality(public.my_business_ids()) > 0 then
      raise exception 'only someone who sees the whole organization can change who sees what'
        using errcode = '42501';
    end if;
  end if;
  select coalesce(array_agg(b ->> 'id'), '{}') into valid
    from public.clients c, jsonb_array_elements(coalesce(c.businesses, '[]'::jsonb)) b
   where c.id = target.client_id;
  select coalesce(array_agg(distinct x), '{}') into ids
    from unnest(coalesce(p_business_ids, '{}')) x where x = any (valid);
  if cardinality(coalesce(p_business_ids, '{}')) > 0 and cardinality(ids) = 0 then
    raise exception 'none of those companies belong to this organization' using errcode = '22023';
  end if;
  update public.profiles set business_ids = ids where id = p_user;
end $$;

revoke execute on function public.set_member_companies(uuid, text[]) from public, anon;
grant  execute on function public.set_member_companies(uuid, text[]) to authenticated;

-- A client inviting a colleague can now say which companies they see. A
-- scoped member can only invite into their own companies, never wider.
drop function if exists public.client_invite_member(text, text, text);
create or replace function public.client_invite_member(
  p_email text, p_password text default null, p_name text default '',
  p_business_ids text[] default '{}'
) returns uuid
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare uid uuid; my text; pw text; mine text[]; want text[];
begin
  my := public.my_client_id();
  if my is null then
    raise exception 'only a client account can invite portal members'
      using errcode = '42501';
  end if;
  if coalesce(p_password,'') = '' then
    pw := encode(extensions.gen_random_bytes(24), 'base64');
  elsif length(p_password) < 12 then
    raise exception 'password must be at least 12 characters' using errcode = '22023';
  else
    pw := p_password;
  end if;
  mine := public.my_business_ids();
  want := coalesce(p_business_ids, '{}');
  if cardinality(mine) > 0 then
    if cardinality(want) = 0 then want := mine; end if;
    if exists (select 1 from unnest(want) w where not (w = any (mine))) then
      raise exception 'you can only invite people to your own companies' using errcode = '42501';
    end if;
  end if;
  uid := public.provision_user(p_email, pw, 'client', my, p_name);
  update public.profiles set business_ids = want where id = uid;
  return uid;
end $$;

revoke execute on function public.client_invite_member(text,text,text,text[]) from public, anon;
grant  execute on function public.client_invite_member(text,text,text,text[]) to authenticated;

-- Billing is the organization's, not a company's. Invoices and logged hours
-- stay with organization-wide members; a company manager does not see what
-- the whole group pays.
drop policy if exists invoices_client_select on public.invoices;
create policy invoices_client_select on public.invoices for select to authenticated
  using (client_id is not null and client_id = public.my_client_id() and cardinality(public.my_business_ids()) = 0);
drop policy if exists time_entries_client_select on public.time_entries;
create policy time_entries_client_select on public.time_entries for select to authenticated
  using (client_id = public.my_client_id() and cardinality(public.my_business_ids()) = 0);
