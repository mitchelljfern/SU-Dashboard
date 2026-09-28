# Content agents and the team Content Map

The daily social and blog tasks (scheduled Claude tasks) keep the team
Content Map at https://dashboard.socialupgrades.com up to date. They talk to
the dashboard's database directly through the Supabase connector. This file is
the contract, plus the prompt blocks to paste into each scheduled task.

## Where things live

| Thing | Where |
|---|---|
| Supabase project | `su-dashboard`, id `tiefkbutqnrttpdcsmiy` |
| Content cards | `public.strategy` — `id text`, `client_id text` (null = Social Upgrades itself), `ts bigint` (ms), `data jsonb` |
| Preview fetch queue | `public.content_media_jobs` — insert `(item_id, source_url, alt, requested_by)`; a trigger calls the `content-media-ingest` edge function, which stores the file in the public `content-media` bucket and appends it to the card's `data.media[]` |
| Metricool snapshots | `public.content_stats` — same `id / client_id / ts / data` shape, upserted by id |
| Activity + bell | `public.log` — one row per run wakes open dashboards and notifies the team; quiet rows fill card history |
| Agent profiles | Social Agent `73dfe83e-4407-4673-ba0f-5e77093ac162`, Blog Agent `0206ee9c-23ca-46b8-a58d-3db284f57b8e` (`select id, name from public.profiles where is_agent`) |
| Clients | `select id, name from public.clients order by name` (for example `af` Afore Beauty, `vs` ViewSlipstream, `sharma` Sharma Law, `do` Double Ops Inc) |
| Metricool brand (Social Upgrades) | blogId `7016311`, timezone `America/Los_Angeles`, Instagram + LinkedIn + Google Business |

## The card (`strategy.data`)

```json
{
  "channel": "social",
  "status": "idea",
  "title": "3 signs your website is costing you clients",
  "hook": "Your website is quietly turning people away.",
  "caption": "Most small business sites lose visitors in the first 5 seconds...",
  "cta": "DM us AUDIT for a free look.",
  "hashtags": ["#smallbusiness", "#webdesign"],
  "networks": ["instagram", "linkedin"],
  "format": "carousel",
  "scheduledFor": "2026-09-30",
  "scheduledTime": "09:30",
  "pillar": "Education",
  "campaign": "",
  "body": "Notes for the team: why this, what to check.",
  "media": [],
  "links": [],
  "comments": [],
  "by": "73dfe83e-4407-4673-ba0f-5e77093ac162"
}
```

- `channel`: `social` | `blog` | `email` | `ads`.
- `status`: social `idea → approved → scheduled → posted`; blog
  `idea → approved → drafting → published`; email `idea → approved → sent`;
  ads `idea → approved → live → paused → ended`. **Only a person moves
  `idea → approved`.** An agent moves things after that.
- `networks`: `instagram`, `facebook`, `linkedin`, `gbp`, `tiktok`, `youtube`,
  `x`, `threads`, `pinterest`. `format`: `single`, `carousel`, `reel`, `story`,
  `video`, `article`, `newsletter`, `ad`.
- `media[]` is written by the ingest function, not by hand. Never put base64
  or an expiring link there.
- Once scheduled: `"metricool": {"postId": "...", "status": "scheduled", "url": "...", "scheduledAt": "2026-09-30T09:30"}`.
- Once live: `"status": "posted"`, `"publishedUrl": "https://..."`, and later
  `"metrics": {"impressions": 2410, "reach": 1980, "likes": 143, "comments": 12, "shares": 3, "saves": 31, "clicks": 20}`
  with `"metricsAt": <ms>`.
- A comment: `{"id": "<uuid>", "by": "<agent id>", "from": "team", "who": "Social Agent", "name": "Social Agent", "text": "...", "ts": <ms>}`.

Always merge, never replace: `update public.strategy set data = data || '{...}'::jsonb where id = '...'`.

## Metricool snapshot rows (`content_stats`)

One row per brand and kind, id `mc:<brandId>:<kind>[:<network>]`,
`client_id` = the client that brand belongs to (null for Social Upgrades).
Every `data` carries `source: "metricool"`, `kind`, `brandId`, `brandLabel`,
`syncedAt` (ms).

| kind | data |
|---|---|
| `kpis` (per network) | `network`, `period` ("30d"), `stats: [{label, value, delta, up}]` |
| `best_times` (per network) | `network`, `slots: [{day: "Tue", time: "11:00", score}]` (best 5) |
| `queue` | `posts: [{id, network, text, publishAt: "2026-09-30T09:30", mediaUrls: [], contentId}]` |
| `top_posts` | `period`, `posts: [{network, text, url, imageUrl, publishedAt, impressions, engagement}]` |

`contentId` on a queued post is the dashboard card it came from; the panel
then says "On the board" and opens the card.

---

## Prompt block: paste into BOTH scheduled tasks

Replace `<AGENT NAME>` and `<AGENT ID>` with the values for that task.

```
## Keep the team Content Map on the dashboard up to date (every run)

The team dashboard (https://dashboard.socialupgrades.com, Content Map tab) is
the record of what we are publishing. Keep it current using the Supabase
connector (project su-dashboard, id tiefkbutqnrttpdcsmiy, tool execute_sql).
You are <AGENT NAME>, profile id <AGENT ID>. Sign everything with that id.
Never sign as a person, never delete rows, never overwrite a card wholesale:
update with `data = data || '{...}'::jsonb`.

Brands: client_id NULL is Social Upgrades itself. Client ids come from
`select id, name from public.clients order by name`.

1. READ FIRST. Load the current plan before you write:
   select id, client_id, data from public.strategy
   where data->>'channel' = '<social or blog>'
     and (data->>'status' in ('idea','approved','scheduled','drafting')
          or data->>'scheduledFor' >= to_char(now() - interval '14 days','YYYY-MM-DD'))
   order by data->>'scheduledFor';
   Treat comments in data->'comments' that are not by you and are newer
   than your last run as instructions from the team for that card. Act on
   them, then reply on the card with a comment of your own
   (jsonb_set on data->'comments', append {id, by:<AGENT ID>, from:"team",
   who:"<AGENT NAME>", name:"<AGENT NAME>", text, ts}).
   A card moved to "approved" by a person is your signal to do the next
   step for it. Do not duplicate: if a card with the same title and date
   already exists, update it instead of inserting another.

2. WRITE CARDS. One row per piece of content, inserted as an idea:
   insert into public.strategy (id, client_id, ts, data) values
   (gen_random_uuid()::text, <client id or NULL>,
    (extract(epoch from now())*1000)::bigint,
    $${"channel":"...","status":"idea","title":"...","hook":"...",
       "caption":"...","cta":"...","hashtags":["#..."],
       "networks":["instagram"],"format":"single",
       "scheduledFor":"YYYY-MM-DD","scheduledTime":"HH:MM",
       "pillar":"...","campaign":"","body":"notes for the team",
       "media":[],"links":[],"comments":[],"by":"<AGENT ID>"}$$::jsonb);
   Statuses you may set: social idea→approved is a person's call; you move
   approved→scheduled (once it is in Metricool) and scheduled→posted (once
   live). Blog: approved→drafting when you start the draft,
   drafting→published when it is live (set publishedUrl).

3. PREVIEWS. Every social card and every blog card gets at least one
   image. Do not store image bytes or expiring links on the card. Queue a
   fetch and the dashboard stores it and attaches it within seconds:
   insert into public.content_media_jobs (item_id, source_url, alt, requested_by)
   values ('<card id>', '<direct image or video URL>', '<what it shows>', '<AGENT ID>');
   Use a direct file URL: a Canva export URL, a Metricool media URL, a
   public Drive or Dropbox share link, or any https link that returns the
   file. One job per image; for a carousel, one job per slide in order.
   Before you finish, check: select item_id, status, error
   from public.content_media_jobs where requested_by = '<AGENT ID>'
   and created_at > now() - interval '1 hour'; retry a failed one with a
   better link (select public.content_media_job_retry('<job id>') after
   updating source_url, or insert a new job).

4. SIGN OFF (required; this is what refreshes open dashboards and rings
   the team's bell). One summary row per run:
   insert into public.log (id, client_id, ts, data) values
   (gen_random_uuid()::text, NULL, (extract(epoch from now())*1000)::bigint,
    $${"text":"<AGENT NAME>: <what you did, in one line>","by":"<AGENT ID>","side":"team"}$$::jsonb);
   And one quiet row per card you created or changed, so the card's
   History is complete:
   ... $${"text":"<AGENT NAME> added \"<title>\"","by":"<AGENT ID>","side":"team","quiet":true,"contentId":"<card id>"}$$::jsonb
   Use client_id of the card on those rows (NULL for Social Upgrades).
```

## Prompt block: add to the SOCIAL task only

```
## Metricool and the dashboard

You are Social Agent (id 73dfe83e-4407-4673-ba0f-5e77093ac162).

- Plan a rolling 7 days ahead for Social Upgrades (Metricool brand
  socialupgrades, blogId 7016311, timezone America/Los_Angeles; Instagram,
  LinkedIn, Google Business) and for each client with a connected Metricool
  brand. Each planned post is a card (step 2 above) with networks, format,
  hook, caption, cta, hashtags, scheduledFor and scheduledTime taken from
  getBestTimeToPostByNetwork.
- For every card in status "approved" with a date: create the scheduled post
  in Metricool (createScheduledPost, or createScheduledPostForReview when the
  brand is a client's), using the card's caption + hashtags and its stored
  media URLs (data->'media'->>'url'), then update the card:
  data = data || '{"status":"scheduled","metricool":{"postId":"<id>","status":"scheduled","url":"<link if any>","scheduledAt":"<ISO>"}}'
- For every card in "scheduled" whose time has passed: confirm in Metricool
  it went out, then set status "posted" and publishedUrl. For cards posted
  in the last 30 days, refresh
  data->'metrics' from getAnalyticsDataByMetrics (impressions, reach, likes,
  comments, shares, saves, clicks) and set metricsAt.
- Sync the Metricool panel. Upsert one row per brand and kind into
  public.content_stats (id, client_id, ts, data) ... on conflict (id) do update
  set ts = excluded.ts, data = excluded.data:
    mc:<brandId>:kpis:<network>    {"source":"metricool","kind":"kpis","brandId":<id>,"brandLabel":"<name>","network":"instagram","period":"30d","syncedAt":<ms>,"stats":[{"label":"Followers","value":"1,204","delta":"+18","up":true}, ...]}
    mc:<brandId>:best_times:<network>  {"kind":"best_times", ..., "slots":[{"day":"Tue","time":"11:00","score":0.9}, ...]}
    mc:<brandId>:queue             {"kind":"queue", ..., "posts":[{"id":"<metricool id>","network":"linkedin","text":"...","publishAt":"2026-09-30T11:00","mediaUrls":["..."],"contentId":"<card id or omit>"}]}
    mc:<brandId>:top_posts         {"kind":"top_posts","period":"30d", ..., "posts":[{"network":"instagram","text":"...","url":"...","imageUrl":"...","publishedAt":"2026-09-26","impressions":2410,"engagement":186}]}
  client_id is the client the brand belongs to, NULL for Social Upgrades.
- Your sign-off line should say how many cards you added, how many you
  scheduled in Metricool, and that Metricool was synced.
```

## Prompt block: add to the BLOG task only

```
## Blog cards on the dashboard

You are Blog Agent (id 0206ee9c-23ca-46b8-a58d-3db284f57b8e).

- Every blog topic you propose is a card with channel "blog", format
  "article", status "idea", a title, a one-line hook (the angle), body (the
  outline: H2s and the promise of each), pillar, target keyword in campaign,
  and a scheduledFor publish date. Queue a hero image for it (step 3).
- When a person moves a blog card to "approved": write the draft, store the
  finished draft in body (Markdown), set status "drafting", and comment on
  the card with where the draft lives (Google Doc link in data->'links' via
  data = data || jsonb_build_object('links', coalesce(data->'links','[]'::jsonb) || '[{"url":"...","label":"Draft"}]'::jsonb)).
- When it is published: status "published", publishedUrl, and a quiet log
  row. If the social task should promote it, add a social card that links
  to it (channel "social", caption with the link, campaign = the blog title).
- Your sign-off line should say how many topics you proposed, how many
  drafts you wrote, and what was published.
```
