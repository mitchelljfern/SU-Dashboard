-- Trigger functions are invoked by the table owner during the trigger, never
-- by a caller, so nobody needs EXECUTE. Without this it is reachable as a
-- REST RPC endpoint.
revoke execute on function public.clients_client_update_guard()
  from public, anon, authenticated;
