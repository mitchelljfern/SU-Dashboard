-- Clients are the tenants. Everything else hangs off client_id.
create table public.clients (
  id          text primary key,
  name        text not null,
  domain      text not null default '',
  service     text not null default '',
  plan        text not null default '',
  price       numeric not null default 0,
  hours_used  numeric not null default 0,
  hours_total numeric not null default 0,
  pulse       jsonb  not null default '[]'::jsonb,
  created_at  timestamptz not null default now()
);

-- One row per auth user. role='team' sees everything; role='client' is
-- pinned to a single client_id and can never see another tenant's rows.
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  role       text not null check (role in ('team','client')),
  client_id  text references public.clients(id) on delete cascade,
  name       text not null default '',
  created_at timestamptz not null default now(),
  constraint profile_tenant_shape check (
    (role = 'team'   and client_id is null) or
    (role = 'client' and client_id is not null)
  )
);

-- SECURITY DEFINER so policies can read profiles without recursing through
-- the very policies being evaluated. Locked search_path to prevent hijacking.
create or replace function public.is_team()
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'team'
  );
$$;

create or replace function public.my_client_id()
returns text language sql stable security definer
set search_path = public, pg_temp as $$
  select p.client_id from public.profiles p where p.id = auth.uid();
$$;
