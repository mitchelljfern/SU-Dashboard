-- AI Chatbot tab: client badges, and the intake a client fills in so the team
-- can build their chatbot.
--
-- Badges are what a client has bought beyond their plan. They live on the
-- client row as a jsonb array of short keys (today just 'ai_chatbot'). A
-- client can never change its own badges: the brand guard from migration 032
-- rebuilds every client-side update from the stored row, so a column added
-- here is protected the day it is added.
--
-- The intake is one row per company. A single-company client has one row
-- (id 'cb-<client_id>'); an organization gets one per company
-- ('cb-<client_id>-<business_id>', with data.businessId set), so Bravo Boxing
-- and Costa Mesa Jiu Jitsu each describe their own bot.
--
-- data (jsonb):
--   businessId    company inside an organization
--   status        draft | submitted          submittedAt  ISO timestamp
--   updatedAt     ISO timestamp               updatedBy    profile id
--   basics{}      business facts (name, website, hours, phone ...)
--   bot{}         what the chatbot should do (goal, tone, greeting, handoff ...)
--   offerings[]   {id, name, price, description, link}
--   faqs[]        {id, q, a}
--   policies{}    refunds, cancellation, shipping, warranty, payment, other
--   sources{}     pages to learn from, notes
--   tech{}        platform, lead routing, calendar, access
--   files[]       uploads in the private attachments bucket (path only)
--   team{}        team only: stage, notes, botUrl. A client write never
--                 changes it; the guard below puts the stored value back.

alter table public.clients
  add column if not exists badges jsonb not null default '[]'::jsonb;

create table if not exists public.chatbot_intake (
  id         text primary key,
  client_id  text not null references public.clients(id) on delete cascade,
  ts         bigint not null default (extract(epoch from now())*1000)::bigint,
  data       jsonb  not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  -- A generous ceiling: hundreds of FAQs and products fit easily, a pasted
  -- novel does not.
  constraint chatbot_intake_size check (octet_length(data::text) < 1500000)
);
create index if not exists chatbot_intake_client_idx on public.chatbot_intake (client_id);

alter table public.chatbot_intake enable row level security;

-- Does this client hold a badge? Used by the client policies, so a client
-- without the AI Chatbot badge can see the tab but cannot write to it.
create or replace function public.client_has_badge(p_client text, p_badge text)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (select 1 from public.clients c
                 where c.id = p_client and coalesce(c.badges, '[]'::jsonb) ? p_badge);
$$;
revoke execute on function public.client_has_badge(text, text) from public, anon;
grant  execute on function public.client_has_badge(text, text) to authenticated;

drop policy if exists chatbot_intake_team_all      on public.chatbot_intake;
drop policy if exists chatbot_intake_client_select on public.chatbot_intake;
drop policy if exists chatbot_intake_client_insert on public.chatbot_intake;
drop policy if exists chatbot_intake_client_update on public.chatbot_intake;

create policy chatbot_intake_team_all on public.chatbot_intake for all to authenticated
  using (public.is_team()) with check (public.is_team());

create policy chatbot_intake_client_select on public.chatbot_intake for select to authenticated
  using (client_id = public.my_client_id() and public.row_in_my_companies(client_id, data));

create policy chatbot_intake_client_insert on public.chatbot_intake for insert to authenticated
  with check (client_id = public.my_client_id()
              and public.row_in_my_companies(client_id, data)
              and public.client_has_badge(client_id, 'ai_chatbot'));

create policy chatbot_intake_client_update on public.chatbot_intake for update to authenticated
  using      (client_id = public.my_client_id() and public.row_in_my_companies(client_id, data))
  with check (client_id = public.my_client_id()
              and public.row_in_my_companies(client_id, data)
              and public.client_has_badge(client_id, 'ai_chatbot'));
-- No client delete. Removing an intake is the team's call.

-- A client write keeps the team's private block as it was stored, and cannot
-- move the row to another tenant or company.
create or replace function public.chatbot_intake_client_guard()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if auth.uid() is null or public.is_team() then
    return new;
  end if;
  if TG_OP = 'INSERT' then
    new.data := new.data - 'team';
    return new;
  end if;
  new.id        := old.id;
  new.client_id := old.client_id;
  new.data      := (new.data - 'team' - 'businessId')
                   || jsonb_strip_nulls(jsonb_build_object(
                        'team', old.data -> 'team',
                        'businessId', old.data -> 'businessId'));
  return new;
end $$;
revoke execute on function public.chatbot_intake_client_guard() from public, anon, authenticated;

drop trigger if exists chatbot_intake_client_guard on public.chatbot_intake;
create trigger chatbot_intake_client_guard
  before insert or update on public.chatbot_intake
  for each row execute function public.chatbot_intake_client_guard();
