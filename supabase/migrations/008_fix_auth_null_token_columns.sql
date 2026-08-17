-- Fixes "Database error querying schema" on every sign-in.
--
-- GoTrue scans these auth.users columns into non-nullable Go strings.
-- confirmation_token, recovery_token, email_change_token_new and email_change
-- have no column default, so rows inserted by hand (as 005 did) leave them
-- NULL and authentication fails for that user. Empty string is what the
-- GoTrue admin API writes.
update auth.users set
  confirmation_token         = coalesce(confirmation_token, ''),
  recovery_token             = coalesce(recovery_token, ''),
  email_change_token_new     = coalesce(email_change_token_new, ''),
  email_change               = coalesce(email_change, ''),
  email_change_token_current = coalesce(email_change_token_current, ''),
  phone_change               = coalesce(phone_change, ''),
  phone_change_token         = coalesce(phone_change_token, ''),
  reauthentication_token     = coalesce(reauthentication_token, '')
where confirmation_token is null
   or recovery_token is null
   or email_change_token_new is null
   or email_change is null
   or email_change_token_current is null
   or phone_change is null
   or phone_change_token is null
   or reauthentication_token is null;

-- Same fix at the source, so newly provisioned users are not born broken.
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
      -- must be '' not NULL: GoTrue reads them as plain strings
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

  insert into public.profiles (id, role, client_id, name)
  values (uid, p_role, p_client_id, p_name)
  on conflict (id) do update
    set role = excluded.role, client_id = excluded.client_id, name = excluded.name;
  return uid;
end $$;

revoke execute on function public.provision_user(text,text,text,text,text)
  from public, anon, authenticated;
