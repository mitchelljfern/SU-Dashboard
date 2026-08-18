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

## Requests and work

Clients submit requests from their dashboard or the Requests tab, with a
category, urgency, an optional "need completed by" date, and attachments. Files
can be uploaded directly, or shared by link (Dropbox, Drive, WeTransfer) when
they are too big or already live somewhere else. Both travel with the request
onto the work item.

Approving a request creates a work item that carries its context — attachments
and links included — through a `requestId` back-reference. Anything the team
adds to the request *after* approval is carried onto that work item too, so the
card the team actually works from never falls behind the request it came from. The team sets a **projected finish** date on the
Workboard card or in the item's detail view, and the client sees it on their
open-request and in-progress cards. Completed work appears on the client's
Updates tab, newest first, each opening to its details, comments and files.

Every card carries a **description** — what the work is, in plain words —
editable from the card by either side. A request's submitted details land
there, so the client's own wording is the starting point rather than a note
filed somewhere else. It is held as a draft with an explicit Save, so typing
does not write a row per keystroke.

What a client can change inside a shared row is enforced by triggers, not the
form: they may comment, edit the description, attach files and links, tick
their own to-dos and approve updates. They cannot move a projected finish date, change a status, approve
their own request, or post a message as the team.

Comments take more than one line: the box is a textarea (Enter for a new line,
⌘/Ctrl+Enter to send) and the rendered comment keeps the breaks that were typed
into it. Long unbroken text — a pasted URL, usually — wraps rather than running
off the side of a phone.

## Strategy

A **Strategy** tab in the client portal, opening into three channel boards. It
is not in the team menu — staff reach it the same way they see the rest of the
portal, through *Open client portal*. The lists differ because the end states
do:

| Channel | Lists |
|---|---|
| Social Media | Ideas → Approved → Posted |
| Emails | Ideas → Approved → Sent |
| Paid Ads | Ideas → Approved → Live → Paused → Ended |

It is a shared board: both staff and client members add cards and move them
between lists. Cards carry a title, notes, an optional scheduled date, links
and comments. Deleting is team-only — it is the one destructive action, and
RLS still pins every card to its own tenant, so neither side can add to or read
another client's board.

## Attachments

Files uploaded to a card, or into a client's Files tab, are stored in the
private `attachments` bucket in Supabase Storage, under
`<client_id>/<kind>/<item_id>/`. The item itself only records the object path,
the original filename, its size and its type.

Nothing in the bucket is readable by URL alone. Every thumbnail, preview and
download is a URL signed for the hour, so a link copied out of the portal stops
working, and row-level security decides who can sign one at all: staff reach
every folder, a client only its own. Clients can upload (their own requests)
but never delete — removing a file is team-only, like every other destructive
action here, and the storage policies say the same, not just the buttons.

Images, PDFs, video and audio open in a preview over the card; anything else
downloads. Limit is 50 MB a file. Attachments added before this existed have a
name and no stored file, and say so instead of offering a dead download.

Staff delete an attachment with the `×` on its row, which asks before it acts.
One stored object can be referenced from two places — approving a request
copies its attachments onto the work item, paths and all — so a delete counts
the references first. The last one takes the bytes out of the bucket and says
so ("Delete for everyone?"); any earlier one only drops that card's reference
("Remove from this card?") and leaves the file for whatever still points at it.
Deleting from a client's Files tab also unhooks the file from any update that
referenced it, so nothing is left pointing at a row that is gone.

## Portal access

A client is a tenant, not a single login. Clients add their own colleagues from
their **Team** tab — the tenant comes from the
caller, so an invite can only ever land on their own portal. The team sees and
manages the same list when editing a client, and admins can remove a member.
Removal is deliberately one-way: it only accepts client accounts, never a team
account and never your own, so it cannot be used to remove a colleague or lock
the owner out.

## Messages

Unread counts are per reader, held in `message_reads` — two people on the same
board track their own unread independently, and a marker is only ever readable
or writable by the person it belongs to. Only the *other* side's messages count
as unread, and opening a board (or switching thread) is what marks it read, as
does a message arriving while you already have that board open. The count shows
on the Messages menu item and again per thread.

The app used to pull new rows only when the tab regained focus, so two windows
open side by side never saw each other and a message sent from one simply never
appeared in the other. It now polls every 15 seconds: two indexed lookups for
the newest `messages` / `log` row this reader can see, and a full load only when
that number moves. A hidden tab does not poll at all, and the app's own writes
advance the mark so they never trigger a needless reload.

## On a phone

The sidebar is replaced by a bottom bar of the first four sections plus a
**More** sheet holding the rest. Both carry the same unread and pending badges
the sidebar does, and the More button carries the total for whatever is hidden
behind it — otherwise an unread message sat unseen, since Messages is not among
the first four on either side. The sheet also holds the *Preview portal as*
picker, so staff can choose which client portal to open without a desktop.

The bar is an explicit four per side rather than "the first four sections", so
Messages has a place on it and its unread count is visible without opening
anything: Overview, Workboard, Requests, Messages for staff; Dashboard,
Messages, Requests, To-Dos for a client. Clients and Updates move into More.

One trap worth knowing: a card that is itself a `<button>` cannot contain a
button. The parser closes the outer one early, which unbalances the surrounding
`sc-if` and leaks whole sections onto other pages. Clickable cards that carry an
action inside them are `<div>`s.

Form fields are 16px on narrow screens. Below that, iOS zooms the page in when
one is focused and does not zoom back out, which strands the user at a zoom
level they have to pinch their way out of. Raising the fields fixes it without
locking `maximum-scale`, so pinch-zoom still works for anyone who wants it.

## Notifications

The bell is other people's news, so it leaves out anything you did yourself:
every log entry records the profile that caused it, and entries matching the
reader are filtered out. Without that, sending a message notified you about
your own message. The team overview's activity list is separate and still shows
everything, including your own actions. Entries written before this carry no
author and are shown to everyone — nobody can be identified as their author.

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

### Retainer hours

Hours on a retainer are counted when a finished item is **approved**, into the
month it was approved in. The team sets an estimate when approving a request,
records the hours it actually took when handing the item over (optional — blank
means the estimate stands), and the client approves. Approving is what counts:
`hoursApproved` and `approvedAt` are stamped on the work item, and the month's
total is the sum over items approved in that month. Nothing resets on the 1st,
and earlier months stay visible on the client's Billing tab.

`clients.hours_used` is no longer read or written — it was a running total fed
by a hardcoded 4-hour estimate on every approved request. The column is left in
place; the figure shown is derived.

A client approving their own work is only trustworthy because the trigger
decides what approval means: the client may flip `approved` on an item that is
in `review`, and nothing else. The status, the timestamps and the hours counted
are stamped in Postgres from values already stored, so the number cannot be
edited on its way through the browser.

Hours live in `time_entries`. Any staff member can log them; a client can read
its own but cannot create, edit or delete them, so the number behind a bill
can't be altered by the party being billed. Entries can be marked non-billable,
in which case they show on the client's list but are excluded from the total.

**Client invoices** are raised in Stripe. The team pastes the hosted invoice
link (Billing admin panel, visible to admins and accountants only) and the
client opens the real invoice from their own Billing tab. Nothing is charged by
this app; it stores links, hours and status.

**Team pay** runs on the 1st and the 16th: the 16th covers the 1st–15th of that
month, the 1st covers the 16th–end of the previous month.

Members submit their own pay from the **Payments** tab, in three kinds:

| Kind | For |
|---|---|
| Hours | A pay period, optionally split by client |
| Invoice | Project work, for members paid per project rather than hourly |
| One-time payment | Expenses and reimbursements |

Then: **pending** → admin approves → **unpaid** → admin marks paid → **paid**.

Instead of rejecting, a reviewer can **Request change**: the submission goes
back to pending with a note, so nothing already entered is lost. The member
sees the note, edits, and the act of editing clears the flag and returns it to
the queue — the note stays as context for the next review.

Both sides can edit a submission: a member while theirs is still pending, a
reviewer any time before it is paid. Editing per-client lines recomputes the
total, so the number can never disagree with the detail under it. **Remove**
lives inside the edit panel rather than next to Approve, so destructive and
approving actions are not adjacent.

Hours are stored as whole `minutes`, so "2h 59m" survives a round trip exactly,
and `amount` is generated in Postgres — `minutes * rate / 60 + adjustment` for
hours, `flat_amount + adjustment` otherwise — so a total can never drift from
its inputs.

What a member may set is enforced by a trigger, not by the form: their own
submissions only, always at the rate on file, always starting as pending, and
locked once approved. Rates live in `team_rates`, readable only by an admin
(and by the member for their own row) — a rate column on `profiles` would have
been visible to the whole team, because RLS filters rows, not columns.

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
