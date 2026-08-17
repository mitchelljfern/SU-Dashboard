# SU Dashboard

Dual-view work dashboard for Social Upgrades — internal team view + client portal,
backed by Supabase with per-client logins.

- **Team view**: overview (open requests / in progress / awaiting approval, messages, to-dos, activity), kanban work board with request intake and retainer hours, client cards, request approvals, per-client message boards.
- **Client portal**: dashboard, updates with approvals + feedback, categorized work requests with comments and file attachments, client to-dos, messages, files, monthly reports, billing.

## Accounts

Every user signs in with email + password. A user's account decides what they see:

| Profile role | Sees |
|---|---|
| `team` | Every client, both views, can switch into any client's portal |
| `client` | Only their own tenant's rows, portal only — cannot reach the team view |

Isolation is enforced in Postgres by row-level security, not in the browser.
A client account cannot read another client's data, move rows between tenants,
delete anything, edit its own invoices, or promote itself to `team` — even if
someone edits the JavaScript.

Add a user from the Supabase SQL editor:

```sql
select public.provision_user('someone@example.com', '<password>', 'client', 'af', 'Client Name');
select public.provision_user('staff@example.com',   '<password>', 'team',   null, 'Staff Name');
```

The third argument is the role, the fourth the client id (`null` for team).

## Structure

- `public/index.html` — the whole app (template + logic)
- `public/su-config.js` — Supabase URL + publishable key
- `public/su-data.js` — auth, loading, and the diff-based write-back layer
- `public/su-boot.js` — login gate
- `public/support.js` — component runtime
- `public/_ds/` — Social Upgrades design system (tokens, styles, bundle)
- `public/assets/` — brand logos
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
