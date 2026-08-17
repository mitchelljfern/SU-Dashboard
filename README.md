# SU Dashboard

Dual-view work dashboard for Social Upgrades — internal team view + client portal.

- **Team view**: overview (open requests / in progress / awaiting approval, messages, to-dos, activity), kanban work board with request intake and retainer hours, client cards, request approvals, per-client message boards.
- **Client portal**: dashboard, updates with approvals + feedback, categorized work requests with comments and file attachments, client to-dos, messages, files, monthly reports, billing.

## Running it

This is a self-contained HTML prototype — no build step. Serve the folder with any static server and open `Client Hub.dc.html`:

```
npx serve .
```

Data persists in the browser via localStorage (key `su_hub_v5`).

## Structure

- `Client Hub.dc.html` — the entire app (template + logic)
- `support.js` — component runtime
- `_ds/` — Social Upgrades design system (tokens, styles, bundle)
- `assets/` — brand logos

## Pushing updates

```
git add -A && git commit -m "Update dashboard" && git push
```
