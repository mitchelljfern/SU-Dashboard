-- Agent team members.
--
-- The overnight outreach run (and any later automation) writes to the
-- dashboard through the service connection, so until now its changes were
-- anonymous: log rows with an empty `by`, notes with no author. An agent is a
-- real team profile so everything it touches is signed, filterable and
-- traceable exactly like a person's work.
--
-- An agent can never sign in. Its password is random and never leaves the
-- function, and the auth user is banned, so neither a password nor a reset
-- link can open a session for it. It exists to be named, not to log in.

alter table public.profiles
  add column if not exists is_agent boolean not null default false;

create or replace function public.provision_agent(p_name text, p_slug text)
returns uuid
language plpgsql security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare uid uuid; addr text;
begin
  if coalesce(trim(p_name),'') = '' or coalesce(trim(p_slug),'') = '' then
    raise exception 'an agent needs a name and a slug' using errcode = '22023';
  end if;
  -- .invalid is reserved and never routes, so no mail can reach this address.
  addr := lower(trim(p_slug)) || '@agents.socialupgrades.invalid';
  uid := public.provision_user(addr, encode(extensions.gen_random_bytes(32), 'base64'),
                               'team', null, trim(p_name));
  update public.profiles
     set is_agent = true, is_admin = false, is_accountant = false, active = true
   where id = uid;
  update auth.users
     set banned_until = '2999-12-31 00:00:00+00',
         raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"agent":true}'::jsonb
   where id = uid;
  return uid;
end $$;

-- Only the database owner (migrations, the service connection) makes agents.
revoke execute on function public.provision_agent(text, text) from public, anon, authenticated;

-- The first one: signs the overnight outreach build.
select public.provision_agent('Leads Agent', 'leads-agent');
