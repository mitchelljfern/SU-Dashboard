# SU Dashboard

Dual-view work dashboard for Social Upgrades — internal team view + client portal.

- **Team view**: overview (open requests / in progress / awaiting approval, messages, to-dos, activity), kanban work board with request intake and retainer hours, client cards, request approvals, per-client message boards.
- **Client portal**: dashboard, updates with approvals + feedback, categorized work requests with comments and file attachments, client to-dos, messages, files, brand kit, monthly reports, billing.
- **Brand kit**: every client gets a card-style tab for logos, colors, type, photography and quick rules. Both views reach it — the client edits their own, the team edits whichever client is selected in the sidebar picker.

## Client-branded portals

The portal wears the client's brand, not Social Upgrades'. The brand kit writes to a per-client `brand` record, and the portal's root element overrides the design-system custom properties from it (`--navy`, `--green`, `--blue`, `--cloud`, `--text-body`, `--grad-brand`, `--font-display`, `--font-body`), so a change in the kit re-skins the sidebar, headings, buttons, links, badges and type immediately.

The client's logo sits top-left in the portal sidebar, falling back to a wordmark until one is marked "On dark"; the Social Upgrades mark moves to the bottom-left as "Powered by". The team view keeps Social Upgrades' own branding throughout.

Logos and photos are stored as data URLs in the same localStorage record, so uploads are capped at 1.2 MB and a full-storage failure is surfaced in the tab. Fonts load from Google Fonts on demand.

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
