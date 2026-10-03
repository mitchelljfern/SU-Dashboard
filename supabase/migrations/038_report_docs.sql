-- Reports tab: real reports, written by the agents (or the team), one row each.
--
-- The old `reports` table holds one hand-typed block per client (four tiles
-- and a note). That stays as it is. Reports are now documents: a dated
-- snapshot of one channel with the numbers, what they mean, what is working,
-- what is not, and what to do next. Many per client, newest first.
--
-- client_id null  = Social Upgrades' own reports. Team-only, always.
-- client_id set   = a client's report. The team always sees it; the client
--                   sees it only once data.visibility = 'client' (published)
--                   and only for the companies they belong to (businessId,
--                   same rule as every other company-scoped row, migration 036).
--
-- data (jsonb), all optional except title:
--   title, kind (daily | weekly | monthly), channel (ads | social | website | email | overview)
--   businessId     company inside an organization (e.g. do-cmjj)
--   visibility     team | client
--   period         {label, start, end}   (YYYY-MM-DD)
--   createdAt      ISO timestamp           by / byName  profile that wrote it
--   verdict        good | watch | bad      headline  one plain sentence
--   kpis[]         {label, value, delta, good (true|false|null), meaning}
--   working[]      plain sentences          notWorking[]  plain sentences
--   actions[]      {title, detail, who (us | you), needsApproval}
--   tables[]       {title, note, columns[], rows[][]}
--   source         where the numbers came from
--   teamNote       internal only; the portal never renders it
--   archived       {at, by} hides it everywhere (never deleted by agents)

create table if not exists public.report_docs (
  id         text primary key,
  client_id  text references public.clients(id) on delete cascade,
  ts         bigint not null default (extract(epoch from now())*1000)::bigint,
  data       jsonb  not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists report_docs_client_ts_idx on public.report_docs (client_id, ts desc);

alter table public.report_docs enable row level security;

create policy report_docs_team_all on public.report_docs for all to authenticated
  using (public.is_team()) with check (public.is_team());

-- Clients read their own published, unarchived reports for their companies.
-- No client write policy: the portal only reads reports.
create policy report_docs_client_select on public.report_docs for select to authenticated
  using (client_id is not null
         and client_id = public.my_client_id()
         and public.row_in_my_companies(client_id, data)
         and coalesce(data->>'visibility', 'team') = 'client'
         and (data->'archived'->>'at') is null);
