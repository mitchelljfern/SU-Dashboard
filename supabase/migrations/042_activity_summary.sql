-- Activity Log (Team > Activity Log): per-author totals for a period plus the
-- latest run of every scheduled agent, computed in Postgres so the page never
-- has to download thousands of log rows to draw its summary cards.
-- Security invoker: the log's own RLS still applies, so only the team gets rows.
create or replace function public.activity_summary(since_ms bigint)
returns table(by_id text, agent text, n bigint, last_ts bigint, runs bigint, avg_minutes numeric,
              warns bigint, errors bigint, last_run_ts bigint, last_run_status text, last_run_text text)
language sql stable security invoker set search_path = public as $$
  with l as (
    select ts, coalesce(data->>'by','') b, coalesce(data->>'agent','') a, data,
           (data->>'kind' = 'run' or data->>'text' ~ '^(Overnight outreach|Outreach batch)') is_run
    from public.log
  )
  select b, a,
    count(*) filter (where ts >= since_ms),
    max(ts),
    count(*) filter (where is_run and ts >= since_ms),
    round(avg(nullif(data->>'minutes','')::numeric) filter (where is_run and ts >= since_ms), 1),
    count(*) filter (where data->>'status' = 'warn' and ts >= since_ms),
    count(*) filter (where data->>'status' = 'error' and ts >= since_ms),
    max(ts) filter (where is_run),
    (array_agg(coalesce(data->>'status','ok') order by ts desc) filter (where is_run))[1],
    (array_agg(data->>'text' order by ts desc) filter (where is_run))[1]
  from l group by b, a;
$$;
revoke all on function public.activity_summary(bigint) from public, anon;
grant execute on function public.activity_summary(bigint) to authenticated;
