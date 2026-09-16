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
| Team — member | All clients and work; **no** Invoicing board, **no** client Billing tab, only their own pay |
| Client | Only their own tenant, portal only — cannot reach the team view |

A client's **Billing** tab — their plan price, retainer hours, rate and
invoices — follows the same line as the Invoicing board: the client sees their
own, admins and accountants see anyone's, ordinary staff see nobody's. The
database already refuses a member the invoice rows, but the rest of that tab
reads from the client record they *can* read, so the tab is removed rather
than left to come up empty. Hiding the menu item is not the whole fix: the
section itself is gated, and a member who was sitting on Billing lands on the
dashboard instead of a blank page.

Isolation is enforced in Postgres by row-level security, not in the browser.
A client cannot read another client's data, move rows between tenants, delete
anything, edit its own invoices, or promote itself to staff. A team member
cannot read client invoices, mark their own pay as paid, change their own
hourly rate, or make themselves an admin — even by editing the JavaScript.

Admins add people from the dashboard (Clients → New client, Team → Add a team
member). Those forms call `admin_create_client_login` /
`admin_create_team_member`, which re-check `is_admin()` in the database.

**Nobody picks a password for anybody.** Adding a person creates the account
with a long random password that is never shown, sent or stored anywhere
readable, then emails them an invitation. The link lands on a *set your
password* screen, and choosing one is what lets them in — the recovery session
the link carries does not by itself open the dashboard. **Forgot password** on
the sign-in screen sends the same link, and answers identically whether or not
the address has an account, so the screen cannot be used to discover who has
one.

This needs SMTP configured under Auth → SMTP Settings, the Site URL set to the
deployed address (otherwise links point at localhost), and the *Reset Password*
email template worded to suit an invitation as well as a reset — Supabase sends
the same template for both.

From the Supabase SQL editor:

```sql
select public.provision_user('someone@example.com', '<password>', 'client', 'af', 'Client Name');
select public.provision_user('staff@example.com',   '<password>', 'team',   null, 'Staff Name');
update public.profiles set is_accountant = true where email = 'books@example.com';
```

## Requests and work

Clients submit requests from their dashboard or the Requests tab, with a
category, urgency, an optional "need completed by" date, and attachments. Files
can be uploaded directly on the form, or shared by link (Dropbox, Drive,
WeTransfer) when they are too big or already live somewhere else. Both travel
with the request onto the work item.

A file can be attached before the request exists, so the request's id is minted
when the first file is picked and reused on submit — the upload already sits in
the folder belonging to the request it becomes, rather than somewhere that has
to be reconciled later.

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

## To-Dos

A **To-Dos** board in the team menu: every to-do across every client in one
list, grouped by the client it belongs to with the team's own pile last, and
filterable by client, side and status. Before it, to-dos lived in two
half-views — the overview's top seven team items and whatever a single client
saw of its own — so nothing answered "what is outstanding, and who is it on",
and nothing anywhere could correct a typo or take one back. Ticking it done
was the only way to retire a to-do, which says something different.

A to-do is either **for the client** — it shows on their To-Dos tab and their
dashboard, and they tick it off — or **for the team**, which stays internal and
can be assigned to a member. Rows retitle in place, and removing takes two
clicks, because a to-do is small enough to lose to a mis-click and there is no
undo. Removing or retitling one the client can see is logged; internal ones are
nobody else's news.

Adding one "for client" without picking a client is refused: it would file the
row under Internal, which no portal lists — a to-do addressed to nobody.

The sidebar badge counts what is assigned to *you*, not the size of the board.
A count of everyone's to-dos is not a number anyone can act on.

Finished work has its own list under the board, most recently finished first,
capped at eight with a **View all** for the rest — it only ever grows. It used
to be reachable only by flipping the board to "Completed", which hid the open
work in order to show it; a record and a worklist are different questions, so
they are two lists. The client and side filters narrow both. Rows there name
their client, since one flat run across every client would otherwise say
nothing about whose it was.

Ordering it by completion needed a completion date: a to-do only carried the
day it was written, so "recently completed" quietly meant "recently created".
Every checkbox in the app runs through one toggle that stamps `doneAt`, and
un-ticking clears it. A client ticking their own to-do cannot write that field
— `done` is the only key the guard lets them near — so the database stamps it
for them, which also means the ordering of that list is not written by whoever
is ticking the box.

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

## Reports

A **Reports** board in the team menu writes the monthly report a client sees.
Before it there was no way to write one at all: every client got an empty
shell on creation and it stayed empty, so the only reports that existed were
seeded ones.

Four tiles — label, value, change, and whether the change is good news — plus
a summary paragraph. The labels are typed rather than fixed, because
`Sessions / Conversion / Orders / AOV` is an ecommerce set and a law firm has
no AOV. Leave a tile blank to publish three figures instead of four.

The client is told when it was last written. The date used to be today's,
whatever the figures were and however old they got, so a report from March
told the client it was generated this morning. A client with no report yet is
told that, rather than being shown an empty grid.

Filling the tiles from an analytics API later means filling this same shape;
the tab does not need to change for it.

## Card order

Cards carry a position within their column, moved with the arrows on the card.
A column used to show whatever order its rows arrived in, so the card that
mattered most could sit anywhere in it and the only way to raise one was to
mention it in a message.

The position is one field that both sides read and write: the client's queue
and ours are the same list seen twice, so a card moved on either side moves for
everyone. A client may write it because it is a position and nothing else — it
cannot move a card between columns, between tenants, or change a word of it,
and a position that is not a number is rejected rather than stored as something
every later sort would read as absent.

A card with no position sorts last and keeps its natural order, so a column
nobody has arranged reads as it always did, and new work joins the back of the
queue rather than jumping cards already placed. Moving normalises the whole
column first — half a column with positions and half without reshuffles on the
next render. Work sorts oldest-first and requests newest-first, the same on
both sides: a shared position is worth nothing if the fallback differs.

The mixed approval lists are deliberately left alone. They hold work items and
updates together and read by time; a shared position across two different kinds
of record would not mean anything.

## Booking a call

A **Schedule Call** tab in the client portal, and the same booking form at the
foot of their dashboard, both pointed at the cal.com link in `CAL_URL`.

It is an `<iframe>` rather than cal.com's `embed.js`. The script version would
run inside this page, which holds the signed-in Supabase session, and a
booking widget has no business being able to reach it; a cross-origin frame is
isolated by the browser instead. The cost is a fixed height rather than one
that resizes itself, which is why there is a plain link underneath for anyone
the frame fails.

The frame is sandboxed to what cal.com actually needs — scripts, its own
origin, forms, and popups for the Google Calendar overlay. If the embed ever
misbehaves after a cal.com change, the `sandbox` attribute is the first thing
to widen.

Only one frame is ever in the page: sections render conditionally, so the
dashboard copy and the tab copy never both exist.

On the dashboard the frame now waits for a click. cal.com focuses a control as
soon as it is ready, and a browser scrolls whatever has focus into view, so
merely having the embed down there dragged the dashboard to the bottom of
itself a few seconds after it opened. `loading="lazy"` did not help: the card
sits inside the browser's load margin, so the frame mounted anyway. Pressing
"Pick a time" loads it in place, which also means cal.com is not contacted at
all for the many clients who never book. The Schedule Call tab still embeds it
directly, where the calendar is the point of the page and there is nothing to
scroll past.

## Taking work elsewhere

Clients often already run Asana, Trello or Jira. Rather than an integration per
tool, a card copies as Markdown (**Copy**, in the card header) and a list
downloads as CSV (**Export CSV** on Your requests and on Completed work). All
three tools accept both, and neither needs an account, a token, or anything to
keep working. If someone eventually wants live sync, an outbound webhook per
client would cover every tool at once and is the next step worth taking — not
three separate OAuth integrations.

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
caller, so an invite can only ever land on their own portal. Staff have no
tenant of their own, so that path cannot work for them: an admin adding a login
from inside a client's portal goes through `admin_create_client_login`, which
names the client explicitly and re-checks `is_admin()` in the database. The team sees and
manages the same list when editing a client, and admins can remove a member.
Removal is deliberately one-way: it only accepts client accounts, never a team
account and never your own, so it cannot be used to remove a colleague or lock
the owner out.

## Messages

Unread is counted from the **view you are in**, not the account you signed in
with. Staff previewing a client portal used to be shown staff-side unread
there, so a team → client message could never register in the preview, and
opening Messages in the preview advanced the staff marker and wiped the team's
own count for that client.

Unread counts are per reader, held in `message_reads` — two people on the same
board track their own unread independently, and a marker is only ever readable
or writable by the person it belongs to. Only the *other* side's messages count
as unread, and opening a board (or switching thread) is what marks it read, as
does a message arriving while you already have that board open **and that window
is in front** — without the focus check, a message landing in a background
window was marked read before anyone saw it. The count shows
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

### The pipeline

One card, one place. The client's dashboard follows a job through four
columns, and it appears in exactly one of them at a time:

| Client sees | Team sees | Moves on when |
|---|---|---|
| Open requests | Awaiting review | the team approves it, setting an estimate |
| In queue | Queued | the team presses **Start** |
| In progress | In progress | the team presses **Submit for approval** |
| Awaiting approval | Awaiting approval | the client presses **Approve** |

Approving counts the hours and takes it off all four: the work item shows under
completed work in the portal, and the request it came from under **Completed
Requests** on the team's Requests page.

The team's *Awaiting approval* holds both the work handed over and any updates
sent for sign-off — both are waiting on the same person. A handed-over item used
to stay in *In progress* wearing an "In review" badge, so the column the team
watches for what is still theirs to do included work that was not.

Open requests used to hold approved requests too, so a card sat there *and* in
whatever column its work item had reached — the same job listed twice. Open
requests is now what the team has not triaged yet, and the queue is its own
column.

### Requests

Both Requests pages split the same way, because a request is either still
moving or it is closed and those are two different questions:

- **Awaiting review** (team only) — new requests, with the approve/decline
  controls and the optional estimate.
- **Current Requests** — approved and in flight. On the client's page this also
  covers what they have submitted and we have not triaged yet.
- **Completed Requests** — finished and declined, each carrying its own badge.

One mapper renders the card for both sides, so they are the same card; the team
version adds the client's name, which a client does not need on their own.

### Archiving and comments

A card (work item or request) is **archived** from the header of its own pop-up,
behind a confirmation that says what it does. The client stops seeing it
entirely — the row is invisible to them in Postgres, not merely hidden in the
UI. Archived cards drop out of every list on both sides, including retainer
hours, so the two sides never disagree about what exists; the confirmation says
so when the card had approved hours on it.

A request and the work item it became are archived and restored together, since
they are one job and leaving half of it on the board helps nobody.

**Either side can archive.** A client who submits a request by mistake, or stops
needing one, clears it themselves. Three rules are enforced by the trigger, not
the browser:

- A client may set `archived`, never clear it. Restoring is staff-only, so an
  archive is always undone by someone who can see the whole history.
- A client cannot archive work that has been approved — those hours count toward
  the month, and the party being billed does not get to take a card out of the
  total.
- `archivedAt` and `archivedBy` are stamped in Postgres, not accepted from the
  browser, because they are the history the team reads.

The team's **Archived** list holds both kinds together and appears at the foot
of both the Workboard and the Requests page, saying who archived each card and
when. It is one list in two places on purpose: archiving a work item and then
looking for it under Requests, where it was never going to be, made the card
look deleted.

**Titles** are editable from the card by either side — a request typed in a
hurry keeps its typo otherwise, and the person best placed to fix it is whoever
wrote it. A request and the work item it became share a title, so renaming one
renames the other; the change goes on the activity log. Updates and strategy
cards are not covered: an update is a paragraph rather than a title, and
strategy is not client-writable at all.

**Comments** can be deleted by the person who wrote them, and by any staff
member. That is enforced by the trigger on the table, not just in the browser:
the comment array has to be client-writable for a client to comment at all, so
a rule the browser keeps to itself is not a rule. Ownership is `by`, the
author's profile id, stamped when the comment is written — comments from before
that field existed have no author on record and are staff-only to remove.

Files can be dropped straight onto an open card as well as picked through the
button; both take the same upload path.

### Messages

A message is signed by the person who sent it and the company they are at —
"Mitchell @ Social Upgrades", "Alec @ Afore Beauty". It used to be signed by the
company alone, so a thread with three people on it read as one voice. The
composed name is stored on the message rather than resolved when it is read,
because a client cannot read our profiles and the name has to survive that;
messages sent before this still show the company.

On a phone the team's client switcher is a row of chips rather than the column
it is on a desktop. Laid out as a row it had kept the column's full-width rows,
stretching to the height of the panel and wrapping company names onto three
lines, so the list of companies took the screen and the thread had none of it.

## Files under Brand Kit

In the portal, Files is a child of Brand Kit rather than a tab of its own: both
hold the client's own material, and Files sat a tab away from the kit it
belongs to. The parent takes a disclosure arrow, expands while either board is
open, and stays lit when the child is the one showing, which is how Strategy
already opened into its channels. The difference is that Strategy's children
are one board filtered three ways, while this child is a section of its own and
carries its own id.

`SUBNAV` holds the parent-to-children map and `navFlat` is the same nav with
the children folded back in. The phone's More sheet and the tab bar's label
lookup read the flat list, because a nested board that exists only in the
sidebar cannot be opened on a phone at all.

Staff have no Files board, so `SUBNAV` is empty for them.

## Sorting and filtering the Overview

The Overview carries a filter bar over all four columns and a sort menu in each
column header. Filtering by client or category narrows every column at once — a
client is a client wherever their work has got to — while sort is per column,
because "oldest first" means something different in a queue than it does in a
list of requests waiting on us.

Offered categories are the ones the work actually carries as well as the
standard list, so a category typed before it was standard is still filterable
and one nobody uses does not clutter the menu.

The up/down arrows disappear while a column is sorted or filtered, and that is
deliberate rather than cosmetic: `moveCard` renumbers exactly the cards it is
handed, so reordering a filtered subset would write positions that collide with
the cards hidden from it. Hand-ordering is only offered when the column on
screen is the whole column.

## Card widths

Cards are `width:100%` with padding on top, and nothing in the app set
`box-sizing`, so each one rendered its padding and border wider than the column
holding it — which is why the Queued cards sat on top of the Open requests ones
on both dashboards. Two rules in the helmet fix it: `box-sizing:border-box`
inside the dashboard grids, and `min-width:0` on their columns, since a grid
item defaults to `min-width:auto` and will not shrink below its content. Card
titles may also break mid-word, because a pasted URL is the usual reason a card
refuses to shrink.

## Paid by month

The invoicing board carries a column chart of what each client has actually
paid, bucketed by the day the money landed rather than the day the invoice was
raised. A paid invoice from before `paidOn` existed has only its issue date, so
that stands in instead of dropping the row out of the total.

Every month between the first payment and the last is drawn, including the ones
with nothing in them — skipping an empty month would redraw a quiet stretch as
a busy one — and the window is capped at the most recent twelve so a long
history stays readable.

Each bar is labelled with its own figure, so there is no second axis to read
against and the fill never has to carry a value on its own. That is deliberate:
the brand green sits at 2.69:1 against a white card, which is under the 3:1 a
mark needs to be read unaided, so the values are written on the chart and the
invoice list underneath is the table view. On a narrow screen the bar labels
drop out and that list is what carries the figures.

## Brand kit

Every client has a kit — logos, colours, type, photography and a short voice
note — and the portal is built out of it. Change a colour on the Brand Kit tab
and the sidebar, headings, buttons, links, status pills and type follow on the
next render; there is no separate "apply" step. The client's logo sits top left
and the Social Upgrades mark moves to the bottom left, under "Powered by".

Both sides reach the same tab. Staff edit whichever client the sidebar picker
is on, so a kit can be set up before the client ever opens it; a client edits
their own and nobody else's.

A kit that has never been touched still themes. The accent falls back to the
colour already assigned to that client on the Clients board, so a portal is
recognisably theirs from the first load rather than Social Upgrades green, and
the wordmark stands in for the logo until one is marked "On dark".

Theming works by overriding the design system's custom properties on the app's
root element for the portal only — `--chrome`, `--surface-card`, `--navy`,
`--cloud`, `--cta-bg`, `--font-display` and the rest. Nothing downstream knows
about brands: a card that reads `var(--navy)` is themed without being told. The
team view sets none of them and stays Social Upgrades throughout.

### Dark backgrounds

Seven colour roles, each doing one job: **primary** is the chrome (the sidebar
and the dark buttons), **card** is the panel background, **heading** is titles
and section labels, **text** is body copy, plus **accent**, **link** and
**surface**. Primary and heading used to be the same colour, which is why a kit
could not have light headings without a light sidebar.

Everything incidental — borders, muted text, the greys, the pill tints — is
mixed between the card colour and the text colour rather than assumed to be a
tint of white. Set the card dark and the borders darken with it, so a black kit
does not mean naming twenty more colours. Form fields are told to follow the
card too, since a browser paints them white otherwise, and a dark kit sets
`color-scheme: dark` so native widgets (the date picker, select arrows,
scrollbars) come with it.

### Controls

Every row of filter pills is built by one `pillStyle(on)` helper. There were
three copies of it once, each written out by hand, and each one had to be found
separately when a kit broke it: the file filters and the Content Map channel
tabs both turned into white pills with white labels on a dark kit, weeks apart,
for exactly the same reason.

A filled control takes `--cta-bg` with `--cta-fg`, a pair the theme picks so
the text on it is readable whatever the kit does. An unfilled one is
transparent with a `--gray-200` border, so it sits on whatever is behind it and
wears the same ink as the text around it. Neither is ever a literal white or
`--navy`: a kit with white headings and white body text made both of those
invisible, which is how the file filters came to be white pills with white
labels on a black page.

The filter pills have a pair of their own, `--pill-bg` and `--pill-fg`, because
they stand on the page rather than inside a card. `--cta-bg` is chosen against
the cards, which is right for a button in one and wrong here: a kit with white
cards over a black page picks a black fill, and the pill then disappears into
the page while its label stays perfectly readable, so the row reads as words
with no buttons around them. `--pill-bg` is measured against the surface
instead, preferring the accent, then the chrome, then a tone stepped off the
kit's own ink, which cannot match the page by construction.

**Light background** and **Dark background** on the Colors section move the four
readability colours together in one click. They deliberately leave accent, link
and the chrome alone — those are the brand; this is only about being able to
read the page.

Red is a token too (`--danger-fg`, `--danger-line`, `--danger-wash`): a delete
button written in a dark red chosen for a white card is unreadable on a dark
one, so the red moves with the card behind it.

Contrast is checked as you go and a warning appears on the same page when a
combination has gone unreadable (3:1 for headings, 4.5:1 for body copy, both
WCAG). Text is checked against the page background as well as against the
cards, because the page title and the section kickers sit straight on the
background — a kit with pale cards over a dark page passes every card check and
still has an unreadable heading at the top of it. It never blocks a choice — it is their brand — it just says so where the
choice was made rather than letting it be discovered on the dashboard. Two
things correct themselves: a status pill lightens its text on a dark card, and
the primary button falls back to the accent where the chrome colour would
disappear into the card behind it.

One thing stays light on a dark portal: the cal.com booking iframe on Schedule
Call is cross-origin, so its background is not ours to set.

### What the database allows

`clients.brand` is one jsonb body, written whole. This is the only column a
client may write, and `032_client_brand_kit.sql` is what makes that safe: a
client's update is rebuilt from the stored row with just `brand` carried
across, so the same request cannot also move their price, retainer hours or
billing terms. Rebuilding from the old row rather than listing the columns to
protect means a column added later is protected the day it is added.

The body is checked on the way in, for staff writes too. Colours must be hex,
text is capped, lists are capped, and image URLs must point at our own storage
bucket or a file shipped with the app — those URLs are read back into `url(...)`
in a stylesheet, so one pointing anywhere else is the only value in a kit that
could do more than look wrong.

Logos and photography go to the public `brand-assets` bucket, penned into a
folder named for the client; the storage policy checks that first path segment,
so one client cannot write into another's folder. 2 MB a file, images only.
Removing a logo drops the record first and the file second — a kit pointing at
a file that is already gone would render broken on every load.

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
month it was approved in. The team may set an estimate when approving a request
— it is optional, and nothing is invented when it is left blank. The estimate
stays editable from the work item's card, team side only, for as long as the
item is open: scope arrives late, and a 0 entered to get moving has to be
correctable. The team records the hours it actually took when handing the item
over (also optional — blank means the estimate stands), and hands it to the
client with **Submit for approval** — from the Workboard card or straight from the Overview.

The Overview carries the whole pipeline left to right — open requests, the
queue, in progress, awaiting approval. **Start** on a queued card moves it into
progress without a trip to the Workboard, and the client sees it move into their
own *In progress* list. It then
leaves the client's *In progress* list and appears under **Awaiting approval**
alongside updates, which is where they sign work off. Approving is what counts
the hours, and the card says how many before it is pressed. Approving is what counts:
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

### Client invoices

Nothing is charged by this app. Invoices are raised in Stripe or PayPal and
recorded here with their hosted link, so both sides open the real one.

The **Invoicing** board (admins and accountants only) is where that happens.
Pick a client down the left and the right-hand side carries three things:

- **Plan** — billing type, plan name, monthly price, retainer hours, hourly rate
  and the Stripe billing portal link. Moving a client between a monthly plan and
  hourly is a billing change, so it is made here rather than in client settings.
- **New invoice** — number, amount, issue and due date, how it is paid, its
  payment link, and what it covers. The number carries on from the client's last
  one, so `SP-0058` suggests `SP-0059`; back-dating the issue date files the
  invoice by that date rather than at the top.
- **The client's invoices**, as cards.

An invoice is a card on both sides and opens into the same overlay: the amount,
who it is billed to, when it was issued and due, how it is paid, when it was
paid, and what it covers. A client gets a button straight through to the Stripe
or PayPal invoice; the team gets the editing, and **Send to client**.

Sending posts the invoice on the client's message board — which is what raises
their unread count — and stamps `sentAt`. There is also **Email instead**, which
opens a pre-filled message to the client's portal members in your own mail
client. The app never sends mail of its own here.

Status is `Due` or `Paid`; **Overdue** is derived from a due date that has passed
and is never stored. Marking an invoice paid without saying when stamps today.

Invoicing sits beside **Team Pay** — the payroll board, which was called
Payments. They are separate: one is what clients owe us, the other is what we
owe the team.

### Team pay

Pay runs on the 1st and the 16th: the 16th covers the 1st–15th of that month,
the 1st covers the 16th–end of the previous month.

Members submit their own pay from the **Team Pay** tab, in three kinds:

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
