# SU Dashboard

Dual-view work dashboard for Social Upgrades — internal team view + client portal,
backed by Supabase with per-client logins.

- **Team view**: overview (open requests / in progress / awaiting approval, messages, to-dos, activity), kanban work board with request intake and retainer hours, client cards, request approvals, per-client message boards.
- **Client portal**: dashboard, updates with approvals + feedback, categorized work requests with comments and file attachments, client to-dos, messages, files, monthly reports, billing.

## Accounts

Every user signs in with email + password. The account decides what they see:

| Account | Sees |
|---|---|
| Team — admin | Everything: all clients, staff directory, rates, client invoices, payroll |
| Team — accountant | Everything a member sees, plus client invoices and all payroll |
| Team — member | All clients and work; **no** client invoices, only their own pay |
| Client | Only their own tenant, portal only — cannot reach the team view |

Isolation is enforced in Postgres by row-level security, not in the browser.
A client cannot read another client's data, move rows between tenants, delete
anything, edit its own invoices, or promote itself to staff. A team member
cannot read client invoices, mark their own pay as paid, change their own
hourly rate, or make themselves an admin — even by editing the JavaScript.

Admins add people from the dashboard (Clients → New client, Team → Add a team
member). Those forms call `admin_create_client_login` /
`admin_create_team_member`, which re-check `is_admin()` in the database.

From the Supabase SQL editor:

```sql
select public.provision_user('someone@example.com', '<password>', 'client', 'af', 'Client Name');
select public.provision_user('staff@example.com',   '<password>', 'team',   null, 'Staff Name');
update public.profiles set is_accountant = true where email = 'books@example.com';
```

## Clients and businesses

A client is the tenant and the unit of isolation. A client may cover several
businesses — Double Ops Inc and Bravo Boxing sit under one account, so one
login serves the whole group. Extra businesses are entered comma-separated when
creating the client and stored on `clients.businesses`.

## Money

**Billing type** is per client:

- **Monthly plan** (`retainer`) — plan, price and retainer hours, as before.
  These clients get a **Manage plan** button pointing at their Stripe billing
  portal link.
- **Hourly** — no plan. Staff log hours in the Time tab; the client's Billing
  tab shows the hours worked this month, their rate, the running total, and the
  date of the next invoice (the 1st). Previous months stay visible as history.

Hours live in `time_entries`. Any staff member can log them; a client can read
its own but cannot create, edit or delete them, so the number behind a bill
can't be altered by the party being billed. Entries can be marked non-billable,
in which case they show on the client's list but are excluded from the total.

**Client invoices** are raised in Stripe. The team pastes the hosted invoice
link (Billing admin panel, visible to admins and accountants only) and the
client opens the real invoice from their own Billing tab. Nothing is charged by
this app; it stores links, hours and status.

**Team pay** runs on the 1st and the 16th: the 16th covers the 1st–15th of that
month, the 1st covers the 16th–end of the previous month. "Open pay period"
creates the current period for a member at their current rate; hours are
entered, `amount` is computed in Postgres (`hours * rate + adjustment`) and each
row toggles between pending and paid. Rates are per-member and admin-editable.

## Structure

- `public/index.html` — the whole app (template + logic)
- `public/su-config.js` — Supabase URL + publishable key
- `public/su-data.js` — auth, loading, and the diff-based write-back layer
- `public/su-boot.js` — login gate
- `public/support.js` — component runtime
- `public/_ds/` — Social Upgrades design system (tokens, styles, bundle)
- `public/assets/` — brand mark, app icon and favicons
- `public/site.webmanifest` — installable-app metadata
- `supabase/migrations/` — schema, RLS policies, and user provisioning
- `netlify.toml` — publish config, headers, SPA rewrite

The UI holds one nested data object in memory and mutates it wholesale via
`set(fn)`. `su-data.js` preserves that contract: it loads rows into that exact
shape and, on each change, diffs the old tree against the new one and issues
only the rows that actually changed. That is why the view code needed almost
no edits when persistence moved from localStorage to Postgres.

## Running it locally

No build step. Serve `public/` with any static server:

```
npx serve public
```

It talks to the live Supabase project, so local and deployed share one dataset.

## Deploying

Netlify builds from this repo — pushing to the deploy branch publishes.
`netlify.toml` sets `public/` as the publish directory.

## Notes

- The publishable Supabase key in `su-config.js` is meant to be public; it grants
  nothing on its own because every table is behind RLS. Never put the
  `service_role` key in this repo.
- React, Babel and supabase-js load from CDNs at runtime, so the app needs
  network access to unpkg and jsdelivr on first paint.
