-- EXECUTE is granted to PUBLIC by default, and anon inherits it; revoking
-- from anon alone leaves that path open. Revoke from PUBLIC, then re-grant
-- only to signed-in users.
revoke execute on function public.is_team()      from public, anon;
revoke execute on function public.my_client_id() from public, anon;
grant  execute on function public.is_team()      to authenticated;
grant  execute on function public.my_client_id() to authenticated;
