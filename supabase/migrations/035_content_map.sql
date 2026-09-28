-- Content Map for the team.
--
-- The client portal already has a Content Map: the `strategy` table, one row
-- per planned piece, shared between the agency and the client. The team view
-- now gets its own Content Map across every client, and two agents (the daily
-- social run and the daily blog run) build it out. Nothing here changes what a
-- client can see: RLS on `strategy` still pins every row to its tenant, and a
-- row with a null client_id is Social Upgrades' own content, team-only.
--
-- New on strategy.data (all optional, all jsonb, nothing to migrate):
--   channel      social | blog | email | ads
--   status       per channel; social adds `scheduled`, blog is
--                idea -> approved -> drafting -> published
--   networks[]   instagram, facebook, linkedin, gbp, tiktok, youtube, x,
--                threads, pinterest
--   format       single | carousel | reel | story | video | article | newsletter | ad
--   scheduledFor YYYY-MM-DD      scheduledTime HH:MM
--   hook, caption, cta, hashtags[], pillar, campaign, publishedUrl
--   media[]      {id, url, type, alt, path?, source?, ts}  -- the big previews
--   metricool    {postId, status, url, publishedAt}
--   metrics      {impressions, reach, likes, comments, shares, saves, clicks}
--   by           profile id of whoever made the card (an agent, usually)

-- ---------------------------------------------------------------------------
-- 1. Agents that sign the daily runs. provision_agent is not idempotent, so
--    each is guarded by the address it would create.
do $$
begin
  if not exists (select 1 from public.profiles where email = 'social-agent@agents.socialupgrades.invalid') then
    perform public.provision_agent('Social Agent', 'social-agent');
  end if;
  if not exists (select 1 from public.profiles where email = 'blog-agent@agents.socialupgrades.invalid') then
    perform public.provision_agent('Blog Agent', 'blog-agent');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. The team view lists every client's plan at once, filtered by channel and
--    laid on a calendar, so both keys get an index.
create index if not exists strategy_channel_idx on public.strategy ((data->>'channel'));
create index if not exists strategy_sched_idx   on public.strategy ((data->>'scheduledFor'));

-- ---------------------------------------------------------------------------
-- 3. Metricool snapshots. The browser never holds a Metricool token; the daily
--    agent reads Metricool through its own connector and writes what the team
--    needs to see here, one row per brand and kind, upserted by id:
--      mc:<brandId>:kpis:<network>   data.stats[]  {label, value, delta, up}
--      mc:<brandId>:best_times:<net> data.slots[]  {day, time, score}
--      mc:<brandId>:queue            data.posts[]  {id, network, text, publishAt, mediaUrls[], contentId}
--      mc:<brandId>:top_posts        data.posts[]  {network, text, url, imageUrl, publishedAt, impressions, engagement}
--    Every row carries source, kind, brandId, brandLabel, syncedAt. client_id
--    is the client the brand belongs to, or null for Social Upgrades itself.
create table if not exists public.content_stats (
  id         text primary key,
  client_id  text references public.clients(id) on delete cascade,
  ts         bigint not null default (extract(epoch from now())*1000)::bigint,
  data       jsonb  not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists content_stats_ts_idx on public.content_stats (ts desc);
alter table public.content_stats enable row level security;
drop policy if exists content_stats_team_all on public.content_stats;
create policy content_stats_team_all on public.content_stats for all to authenticated
  using (public.is_team()) with check (public.is_team());

-- ---------------------------------------------------------------------------
-- 4. Where the previews live. Public bucket: a content preview is shown on the
--    team board and, for the client's own rows, in their portal, and the
--    agents that write them cannot sign URLs. Nothing sensitive goes here.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('content-media', 'content-media', true, 26214400,
        array['image/jpeg','image/png','image/gif','image/webp','image/avif','image/svg+xml',
              'video/mp4','video/quicktime','video/webm'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists content_media_read        on storage.objects;
drop policy if exists content_media_team_insert on storage.objects;
drop policy if exists content_media_team_delete on storage.objects;
create policy content_media_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'content-media');
create policy content_media_team_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'content-media' and public.is_team());
create policy content_media_team_delete on storage.objects for delete to authenticated
  using (bucket_id = 'content-media' and public.is_team());

-- ---------------------------------------------------------------------------
-- 5. Media by URL. An agent has SQL and nothing else, so it cannot upload a
--    file. It inserts a job naming the card and the URL; the trigger below
--    asks the `content-media-ingest` edge function to fetch the bytes, store
--    them in the bucket and append the stored URL to the card's media[]. The
--    team can queue one from a card too (paste an image link).
create table if not exists public.content_media_jobs (
  id           uuid primary key default gen_random_uuid(),
  item_id      text not null references public.strategy(id) on delete cascade,
  source_url   text not null,
  alt          text not null default '',
  requested_by uuid references public.profiles(id) on delete set null,
  status       text not null default 'pending',   -- pending | working | done | failed
  stored_url   text,
  error        text,
  created_at   timestamptz not null default now(),
  done_at      timestamptz
);
create index if not exists content_media_jobs_item_idx   on public.content_media_jobs (item_id);
create index if not exists content_media_jobs_status_idx on public.content_media_jobs (status);
alter table public.content_media_jobs enable row level security;
drop policy if exists content_media_jobs_team_select on public.content_media_jobs;
drop policy if exists content_media_jobs_team_insert on public.content_media_jobs;
create policy content_media_jobs_team_select on public.content_media_jobs for select to authenticated
  using (public.is_team());
create policy content_media_jobs_team_insert on public.content_media_jobs for insert to authenticated
  with check (public.is_team() and (requested_by is null or requested_by = auth.uid()));
-- Outcome columns are the function's to write, never the browser's.

create extension if not exists pg_net with schema extensions;

create or replace function public.content_media_job_dispatch()
returns trigger
language plpgsql security definer
set search_path = public, net, extensions, pg_temp
as $$
begin
  perform net.http_post(
    url     := 'https://tiefkbutqnrttpdcsmiy.supabase.co/functions/v1/content-media-ingest',
    body    := jsonb_build_object('jobId', new.id::text),
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 5000
  );
  return new;
end $$;
revoke execute on function public.content_media_job_dispatch() from public, anon, authenticated;

drop trigger if exists content_media_jobs_dispatch on public.content_media_jobs;
create trigger content_media_jobs_dispatch
  after insert on public.content_media_jobs
  for each row execute function public.content_media_job_dispatch();

-- A job the function never picked up (deploy gap, network) can be re-sent by
-- flipping it back to pending: the trigger is insert-only, so this does it.
create or replace function public.content_media_job_retry(p_job uuid)
returns void
language plpgsql security definer
set search_path = public, net, extensions, pg_temp
as $$
begin
  if not public.is_team() and auth.uid() is not null then
    raise exception 'team only' using errcode = '42501';
  end if;
  update public.content_media_jobs set status = 'pending', error = null where id = p_job;
  perform net.http_post(
    url     := 'https://tiefkbutqnrttpdcsmiy.supabase.co/functions/v1/content-media-ingest',
    body    := jsonb_build_object('jobId', p_job::text),
    headers := '{"Content-Type":"application/json"}'::jsonb,
    timeout_milliseconds := 5000
  );
end $$;
revoke execute on function public.content_media_job_retry(uuid) from public, anon;
grant  execute on function public.content_media_job_retry(uuid) to authenticated;

-- A failed fetch would otherwise sit on the card forever. The team can clear it.
drop policy if exists content_media_jobs_team_delete on public.content_media_jobs;
create policy content_media_jobs_team_delete on public.content_media_jobs for delete to authenticated
  using (public.is_team());
