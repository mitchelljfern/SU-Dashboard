-- Creating a login needs privileges the browser must never hold, so these run
-- SECURITY DEFINER and check is_admin() themselves. provision_user stays
-- un-grantable; only these narrow wrappers are callable from the app.

create or replace function public.admin_create_client_login(
  p_client_id text, p_email text, p_password text, p_name text
) returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare uid uuid;
begin
  if not public.is_admin() then
    raise exception 'only an admin can create client logins' using errcode = '42501';
  end if;
  if length(coalesce(p_password,'')) < 12 then
    raise exception 'password must be at least 12 characters' using errcode = '22023';
  end if;
  if not exists (select 1 from public.clients where id = p_client_id) then
    raise exception 'no such client: %', p_client_id using errcode = '23503';
  end if;
  uid := public.provision_user(p_email, p_password, 'client', p_client_id, p_name);
  return uid;
end $$;

create or replace function public.admin_create_team_member(
  p_email text, p_password text, p_name text,
  p_rate numeric default 20, p_is_accountant boolean default false
) returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare uid uuid;
begin
  if not public.is_admin() then
    raise exception 'only an admin can create team members' using errcode = '42501';
  end if;
  if length(coalesce(p_password,'')) < 12 then
    raise exception 'password must be at least 12 characters' using errcode = '22023';
  end if;
  uid := public.provision_user(p_email, p_password, 'team', null, p_name);
  update public.profiles
     set hourly_rate = coalesce(p_rate, 20),
         is_accountant = coalesce(p_is_accountant, false),
         is_admin = false
   where id = uid;
  return uid;
end $$;

revoke execute on function public.admin_create_client_login(text,text,text,text) from public, anon;
revoke execute on function public.admin_create_team_member(text,text,text,numeric,boolean) from public, anon;
grant  execute on function public.admin_create_client_login(text,text,text,text) to authenticated;
grant  execute on function public.admin_create_team_member(text,text,text,numeric,boolean) to authenticated;
