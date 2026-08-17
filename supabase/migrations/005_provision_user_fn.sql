-- Provision an email/password user + its profile in one call.
-- Mirrors what GoTrue's admin API writes, including the email identity row
-- that password sign-in requires.
--
-- Call it from the Supabase SQL editor only. Never commit real passwords:
--   select public.provision_user('someone@example.com','<password>','client','af','Client Name');
--   select public.provision_user('staff@example.com','<password>','team',null,'Staff Name');
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
      raw_app_meta_data, raw_user_meta_data
    ) values (
      '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
      lower(p_email), extensions.crypt(p_password, extensions.gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('name', p_name)
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

  insert into public.profiles (id, role, client_id, name)
  values (uid, p_role, p_client_id, p_name)
  on conflict (id) do update
    set role = excluded.role, client_id = excluded.client_id, name = excluded.name;
  return uid;
end $$;

-- Never callable from the browser.
revoke execute on function public.provision_user(text,text,text,text,text)
  from public, anon, authenticated;
