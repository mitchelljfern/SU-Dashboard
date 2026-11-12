-- Team chats: internal conversations on the Messages page.
--
-- A chat is a row in team_chats. Its messages live in public.messages like a
-- client board's do, with client_id null and data.chatId naming the chat.
--
-- data (jsonb):
--   name        shown in the list
--   everyone    true = every team member is in it (the main Social Upgrades chat)
--   members[]   profile ids, used when everyone is not true
--   createdBy   profile id
--
-- Who sees what is decided here, not in the browser:
--   * an admin sees and manages every chat;
--   * a team member sees a chat when it is for everyone or they are a member;
--   * a client never sees a chat or any of its messages.
-- Only an admin can create, rename, re-staff or delete a chat.

create table if not exists public.team_chats (
  id         text primary key,
  client_id  text,
  ts         bigint not null default (extract(epoch from now())*1000)::bigint,
  data       jsonb  not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint team_chats_internal check (client_id is null)
);

alter table public.team_chats enable row level security;

create or replace function public.can_see_chat(chat text)
returns boolean
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select public.is_team() and chat is not null and (
    public.is_admin()
    or exists (
      select 1 from public.team_chats c
      where c.id = chat
        and (coalesce((c.data->>'everyone')::boolean, false)
             or coalesce(c.data->'members', '[]'::jsonb) ? (auth.uid())::text)
    )
  );
$$;

revoke all on function public.can_see_chat(text) from public;
grant execute on function public.can_see_chat(text) to authenticated;

drop policy if exists team_chats_select on public.team_chats;
create policy team_chats_select on public.team_chats
  for select using (public.can_see_chat(id));

drop policy if exists team_chats_admin_insert on public.team_chats;
create policy team_chats_admin_insert on public.team_chats
  for insert with check (public.is_admin());

drop policy if exists team_chats_admin_update on public.team_chats;
create policy team_chats_admin_update on public.team_chats
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists team_chats_admin_delete on public.team_chats;
create policy team_chats_admin_delete on public.team_chats
  for delete using (public.is_admin());

grant select, insert, update, delete on public.team_chats to authenticated;

-- Staff used to be able to read and write every message. A message with no
-- client is now a chat message, and it follows its chat.
drop policy if exists messages_team_all on public.messages;
create policy messages_team_all on public.messages
  for all
  using (public.is_team() and (client_id is not null or public.can_see_chat(data->>'chatId')))
  with check (public.is_team() and (client_id is not null or public.can_see_chat(data->>'chatId')));

-- Read markers are keyed by client id. A chat's marker is keyed 'chat:<id>',
-- which is not a client, so the foreign key has to go. A marker left behind by
-- a deleted client or chat is harmless: nothing reads it.
alter table public.message_reads drop constraint if exists message_reads_client_id_fkey;

-- The main chat everyone on the team is in.
insert into public.team_chats (id, client_id, ts, data)
values ('general', null, (extract(epoch from now())*1000)::bigint,
        jsonb_build_object('name', 'Social Upgrades', 'everyone', true))
on conflict (id) do nothing;
