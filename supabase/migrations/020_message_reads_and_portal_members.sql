-- Unread counts are per person, not per thread: two team members read the same
-- board independently, so the marker belongs to the reader.
create table if not exists public.message_reads (
  profile_id   uuid not null references public.profiles(id) on delete cascade,
  client_id    text not null references public.clients(id) on delete cascade,
  last_read_ts bigint not null default 0,
  primary key (profile_id, client_id)
);
alter table public.message_reads enable row level security;

create policy message_reads_own on public.message_reads for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- A client account can now see the other people on its own portal, so both
-- sides can list who has access. Team still sees everyone.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or public.is_team()
    or (client_id is not null and client_id = public.my_client_id())
  );

-- A client invites someone onto their own portal. The tenant comes from the
-- caller, never from the request, so this cannot be used to join another one.
create or replace function public.client_invite_member(
  p_email text, p_password text, p_name text
) returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare uid uuid; my text;
begin
  my := public.my_client_id();
  if my is null then
    raise exception 'only a client account can invite portal members'
      using errcode = '42501';
  end if;
  if length(coalesce(p_password,'')) < 12 then
    raise exception 'password must be at least 12 characters' using errcode = '22023';
  end if;
  uid := public.provision_user(p_email, p_password, 'client', my, p_name);
  return uid;
end $$;

-- Team removes a portal member. Admins only, and never a team account or
-- yourself, so this cannot be used to remove a colleague or lock out the owner.
create or replace function public.admin_delete_user(p_user uuid)
returns void
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare r text;
begin
  if not public.is_admin() then
    raise exception 'only an admin can remove users' using errcode = '42501';
  end if;
  if p_user = auth.uid() then
    raise exception 'you cannot remove your own account' using errcode = '42501';
  end if;
  select role into r from public.profiles where id = p_user;
  if r is null then
    raise exception 'no such user' using errcode = '42704';
  end if;
  if r <> 'client' then
    raise exception 'only client portal members can be removed here'
      using errcode = '42501';
  end if;
  delete from auth.users where id = p_user;   -- profile cascades
end $$;

revoke execute on function public.client_invite_member(text,text,text) from public, anon;
revoke execute on function public.admin_delete_user(uuid) from public, anon;
grant  execute on function public.client_invite_member(text,text,text) to authenticated;
grant  execute on function public.admin_delete_user(uuid) to authenticated;
