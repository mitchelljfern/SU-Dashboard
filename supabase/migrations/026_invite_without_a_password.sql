-- Accounts were created by an admin typing a password, which then had to be
-- conveyed to the person somehow — and the obvious way to convey it is the
-- worst one. Nobody picks a password for anybody now: these functions mint a
-- long random one that is never shown, stored anywhere readable, or sent, and
-- the app follows up with an invitation email whose link lets the person set
-- their own.
--
-- The signatures are unchanged so existing calls keep working; passing a blank
-- password is what asks for an invite. A supplied password still has to meet
-- the 12-character rule, so the old path is intact for anyone who wants it.

create or replace function public.admin_create_client_login(
  p_client_id text, p_email text, p_password text default null, p_name text default ''
) returns uuid
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare uid uuid; pw text;
begin
  if not public.is_admin() then
    raise exception 'only an admin can create client logins' using errcode = '42501';
  end if;
  if not exists (select 1 from public.clients where id = p_client_id) then
    raise exception 'no such client: %', p_client_id using errcode = '23503';
  end if;
  if coalesce(p_password,'') = '' then
    -- Never leaves this function. The invitation link is how they get in.
    pw := encode(extensions.gen_random_bytes(24), 'base64');
  elsif length(p_password) < 12 then
    raise exception 'password must be at least 12 characters' using errcode = '22023';
  else
    pw := p_password;
  end if;
  uid := public.provision_user(p_email, pw, 'client', p_client_id, p_name);
  return uid;
end $$;

create or replace function public.admin_create_team_member(
  p_email text, p_password text default null, p_name text default '',
  p_rate numeric default 20, p_is_accountant boolean default false
) returns uuid
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare uid uuid; pw text;
begin
  if not public.is_admin() then
    raise exception 'only an admin can create team members' using errcode = '42501';
  end if;
  if coalesce(p_password,'') = '' then
    pw := encode(extensions.gen_random_bytes(24), 'base64');
  elsif length(p_password) < 12 then
    raise exception 'password must be at least 12 characters' using errcode = '22023';
  else
    pw := p_password;
  end if;
  uid := public.provision_user(p_email, pw, 'team', null, p_name);
  update public.profiles
     set is_accountant = coalesce(p_is_accountant, false), is_admin = false
   where id = uid;
  insert into public.team_rates (profile_id, hourly_rate)
  values (uid, coalesce(p_rate, 20))
  on conflict (profile_id) do update set hourly_rate = excluded.hourly_rate;
  return uid;
end $$;

create or replace function public.client_invite_member(
  p_email text, p_password text default null, p_name text default ''
) returns uuid
language plpgsql security definer
set search_path = public, extensions, pg_temp
as $$
declare uid uuid; my text; pw text;
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
  uid := public.provision_user(p_email, pw, 'client', my, p_name);
  return uid;
end $$;

revoke execute on function public.admin_create_client_login(text,text,text,text) from public, anon;
revoke execute on function public.admin_create_team_member(text,text,text,numeric,boolean) from public, anon;
revoke execute on function public.client_invite_member(text,text,text) from public, anon;
grant  execute on function public.admin_create_client_login(text,text,text,text) to authenticated;
grant  execute on function public.admin_create_team_member(text,text,text,numeric,boolean) to authenticated;
grant  execute on function public.client_invite_member(text,text,text) to authenticated;
