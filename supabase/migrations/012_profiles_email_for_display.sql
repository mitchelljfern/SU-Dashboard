-- profiles had no email, so the staff directory had nothing to display.
alter table public.profiles add column if not exists email text not null default '';

update public.profiles p set email = u.email
from auth.users u where u.id = p.id and p.email = '';

-- provision_user now keeps it populated (and still sets the GoTrue token
-- columns to '' rather than NULL — see 008).
create or replace function public.provision_user(
  p_email text, p_password text, p_role text, p_client_id text, p_name text
) returns uuid
language plpgsql security definer
set search_path = auth, public, extensions, pg_temp
as $$
declare uid uuid;
begin
  select id into uid from auth.users where email = lower(p_email);
  if uid is null then
    uid := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token,
      reauthentication_token
    ) values (
      '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
      lower(p_email), extensions.crypt(p_password, extensions.gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('name', p_name),
      '', '', '', '', '', '', '', ''
    );
    insert into auth.identities (
      provider_id, user_id, identity_data, provider, last_sign_in_at,
      created_at, updated_at
    ) values (
      uid::text, uid,
      jsonb_build_object('sub', uid::text, 'email', lower(p_email), 'email_verified', true),
      'email', now(), now(), now()
    );
  end if;

  insert into public.profiles (id, role, client_id, name, email)
  values (uid, p_role, p_client_id, p_name, lower(p_email))
  on conflict (id) do update
    set role = excluded.role, client_id = excluded.client_id,
        name = excluded.name, email = excluded.email;
  return uid;
end $$;

revoke execute on function public.provision_user(text,text,text,text,text)
  from public, anon, authenticated;
