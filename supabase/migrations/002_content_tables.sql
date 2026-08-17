-- Each collection in the app maps to one table. client_id is a real column so
-- RLS can enforce tenant isolation; the entity body stays in jsonb so the
-- existing UI keeps its shape. client_id NULL = internal/team-only row.
do $$
declare t text;
begin
  foreach t in array array['todos','work','requests','updates','messages','files','invoices','log']
  loop
    execute format($f$
      create table public.%I (
        id         text primary key,
        client_id  text references public.clients(id) on delete cascade,
        ts         bigint not null default (extract(epoch from now())*1000)::bigint,
        data       jsonb  not null default '{}'::jsonb,
        created_at timestamptz not null default now()
      );
      create index %I on public.%I (client_id);
      create index %I on public.%I (ts desc);
    $f$, t, t||'_client_idx', t, t||'_ts_idx', t);
  end loop;
end $$;

-- Monthly report block, one per client.
create table public.reports (
  client_id  text primary key references public.clients(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.clients  enable row level security;
alter table public.profiles enable row level security;
alter table public.reports  enable row level security;
do $$
declare t text;
begin
  foreach t in array array['todos','work','requests','updates','messages','files','invoices','log']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
