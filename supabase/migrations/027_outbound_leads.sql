-- Outbound leads: the cold-outreach pipeline, moved in from the standalone
-- tracker so the team works it where it already works everything else.
--
-- Same id / client_id / ts / data(jsonb) shape as the other collections, so
-- all three ride the existing sync layer untouched. client_id is always null:
-- a lead is not a client yet, and these rows are internal.
--
--   leads        data: { name, county, niche, phone, website, email, owner,
--                        address, googleRating, size, siteScore, hook, status,
--                        stage, campaign, subject, subjectPattern, draftUrl,
--                        sentAt, repliedAt, nextTouch, assignee, notes, added }
--   lead_notes   data: { leadId, by, who, text }        -- team discussion
--   lead_emails  data: { leadId, direction, subject, snippet, from, to,
--                        threadId, url, at }             -- Gmail history
--
-- The nightly outreach run writes leads and lead_emails with the service
-- role. The browser only ever reads lead_emails.

create table if not exists public.leads (
  id         text primary key,
  client_id  text references public.clients(id) on delete cascade,
  ts         bigint not null default (extract(epoch from now())*1000)::bigint,
  data       jsonb  not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists leads_ts_idx    on public.leads (ts desc);
create index if not exists leads_stage_idx on public.leads ((data->>'stage'));

create table if not exists public.lead_notes (
  id         text primary key,
  client_id  text references public.clients(id) on delete cascade,
  ts         bigint not null default (extract(epoch from now())*1000)::bigint,
  data       jsonb  not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists lead_notes_lead_idx on public.lead_notes ((data->>'leadId'));
create index if not exists lead_notes_ts_idx   on public.lead_notes (ts);

create table if not exists public.lead_emails (
  id         text primary key,            -- the Gmail message id, so a re-run never duplicates
  client_id  text references public.clients(id) on delete cascade,
  ts         bigint not null default (extract(epoch from now())*1000)::bigint,
  data       jsonb  not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists lead_emails_lead_idx on public.lead_emails ((data->>'leadId'));
create index if not exists lead_emails_ts_idx   on public.lead_emails (ts desc);

alter table public.leads       enable row level security;
alter table public.lead_notes  enable row level security;
alter table public.lead_emails enable row level security;

-- Team only, end to end. A client login gets nothing back from any of these,
-- not even a count: prospects are other businesses, some of them competitors
-- of the people who can sign in here.
create policy leads_team_all on public.leads for all to authenticated
  using (public.is_team()) with check (public.is_team());

create policy lead_notes_team_all on public.lead_notes for all to authenticated
  using (public.is_team()) with check (public.is_team());

-- Email history is a record of what happened in Gmail. The team reads it; only
-- the nightly run (service role, which bypasses RLS) writes it.
create policy lead_emails_team_select on public.lead_emails for select to authenticated
  using (public.is_team());
