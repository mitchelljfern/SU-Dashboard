-- Rates were a column on profiles, which every staff member can read, so the
-- whole team could see everyone's pay. RLS filters rows, not columns, so the
-- fix is to move rates into their own table with its own policy.
create table if not exists public.team_rates (
  profile_id  uuid primary key references public.profiles(id) on delete cascade,
  hourly_rate numeric not null default 0,
  pay_type    text not null default 'hourly' check (pay_type in ('hourly','project')),
  updated_at  timestamptz not null default now()
);

insert into public.team_rates (profile_id, hourly_rate)
select id, hourly_rate from public.profiles where role = 'team'
on conflict (profile_id) do nothing;

alter table public.profiles drop column if exists hourly_rate;

alter table public.team_rates enable row level security;

-- Only an admin sees or sets rates. A member may read their own so their
-- Payments tab can show what they are paid.
create policy team_rates_admin_all on public.team_rates for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy team_rates_own_select on public.team_rates for select to authenticated
  using (profile_id = auth.uid());

-- admin_create_team_member wrote profiles.hourly_rate; point it at the new table.
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
     set is_accountant = coalesce(p_is_accountant, false), is_admin = false
   where id = uid;
  insert into public.team_rates (profile_id, hourly_rate)
  values (uid, coalesce(p_rate, 20))
  on conflict (profile_id) do update set hourly_rate = excluded.hourly_rate;
  return uid;
end $$;
revoke execute on function public.admin_create_team_member(text,text,text,numeric,boolean) from public, anon;
grant  execute on function public.admin_create_team_member(text,text,text,numeric,boolean) to authenticated;
