-- ---------- profiles ----------
create policy profiles_select_own  on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_team());
create policy profiles_team_write  on public.profiles for all to authenticated
  using (public.is_team()) with check (public.is_team());

-- ---------- clients ----------
create policy clients_select on public.clients for select to authenticated
  using (public.is_team() or id = public.my_client_id());
create policy clients_team_write on public.clients for all to authenticated
  using (public.is_team()) with check (public.is_team());

-- ---------- reports (client reads own, team writes) ----------
create policy reports_select on public.reports for select to authenticated
  using (public.is_team() or client_id = public.my_client_id());
create policy reports_team_write on public.reports for all to authenticated
  using (public.is_team()) with check (public.is_team());

-- ---------- content tables ----------
do $$
declare
  t text;
  all_t text[] := array['todos','work','requests','updates','messages','files','invoices','log'];
  ins_t text[] := array['todos','requests','messages','files','log'];        -- client may create
  upd_t text[] := array['todos','work','requests','updates'];                -- client may modify
begin
  foreach t in array all_t loop
    execute format($f$
      create policy %I on public.%I for all to authenticated
        using (public.is_team()) with check (public.is_team());
    $f$, t||'_team_all', t);

    execute format($f$
      create policy %I on public.%I for select to authenticated
        using (client_id is not null and client_id = public.my_client_id());
    $f$, t||'_client_select', t);
  end loop;

  foreach t in array ins_t loop
    execute format($f$
      create policy %I on public.%I for insert to authenticated
        with check (client_id is not null and client_id = public.my_client_id());
    $f$, t||'_client_insert', t);
  end loop;

  foreach t in array upd_t loop
    -- both USING and WITH CHECK pinned, so a client cannot move a row
    -- into (or out of) another tenant
    execute format($f$
      create policy %I on public.%I for update to authenticated
        using       (client_id is not null and client_id = public.my_client_id())
        with check  (client_id is not null and client_id = public.my_client_id());
    $f$, t||'_client_update', t);
  end loop;
  -- note: no DELETE policy for clients anywhere — deletes are team-only
end $$;
