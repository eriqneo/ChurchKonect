# ChurchConnect

ChurchConnect is a mobile-first church administration PWA for members, cell groups, training,
prayer coordination, announcements, and reporting.

The frontend is a React/Vite application with scoped Dexie persistence. PocketBase provides
production authentication, member and cell administration, local-first cell operations, Academy,
announcements, prayer coordination, aggregate reports, notifications, feedback, and operational
activity history. Each backend module is reconciled and authorization-tested before work moves on.

### Production synchronization

The global connection indicator is backed by the authenticated user's real Dexie `outbox`.
Cell operations and Academy check-ins remain `pending` until their module processor receives a
PocketBase acknowledgement; no timer can mark a record synchronized. Rejected commands remain
visible as **Needs attention**, including the server error and attempt count, and can be retried
from the Synchronization sheet. Reconnects, manual retries, and service-worker sync requests all
use the same idempotent coordinator.

Production builds never seed demo personas or records. Existing unscoped legacy demo rows are
retired once without deleting account-scoped server caches or queued operations.

## Local development

Requirements: Node.js 20+ and npm.

```bash
npm ci
npm run dev
```

The committed production configuration points to the ChurchConnect PocketHost instance. For a
different local backend, copy `.env.example` to `.env.local` and change `VITE_PB_URL`.

## Verification

```bash
npm run lint
npm run build
```

The production output is written to `dist/`.

## Deploy to Cloudflare Pages from GitHub

Connect this repository in **Cloudflare Dashboard → Workers & Pages → Create → Pages → Import an
existing Git repository**, then use:

| Setting | Value |
|---|---|
| Framework preset | React (Vite) |
| Production branch | `main` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `/` |

No secret Cloudflare environment variables are required. `VITE_PB_URL` is a public browser
configuration value and is provided by `.env.production`; it may be overridden in Cloudflare.

The repository includes:

- `wrangler.jsonc` for Pages direct deployments;
- `public/_redirects` for SPA deep-link fallback;
- `public/_headers` for security and cache policy;
- a network-first service worker shell so new deployments replace stale builds;
- the SVG favicon/PWA logo at `public/churchconnect-logo.svg`.

After Git integration is enabled, pushes to `main` deploy to production and other branches can be
used for preview deployments.

## Optional direct deployment

Authenticate Wrangler, then run:

```bash
npm run deploy:cloudflare
```

This builds and deploys `dist/` to the `churchkonect` Pages project. The command uses `npx`, so
Wrangler does not need to be stored as a production dependency.

## Backend safety

Never place PocketBase superuser credentials, API secrets, or private keys in a `VITE_*` variable
because Vite exposes those values in the browser bundle.

## PocketBase authentication module

The frontend authenticates regular records from PocketBase's `users` auth collection. PocketBase
superusers are exclusively for backend administration and cannot be used on the app login screen.

To reconcile the `users` collection schema and run disposable access-rule tests:

```bash
npm run backend:bootstrap-auth -- \
  --url=https://churchconnect.pockethost.io \
  --email=YOUR_SUPERUSER_EMAIL
```

The command prompts for the superuser password without echoing it. It never stores the password,
uses temporary test users, and removes those users and the superuser token after the test.

For a real app login, create a regular record under **Collections → users** with:

- a unique email and a password different from every superuser password;
- `name` and optional `avatarText`/`department`;
- one allowed `role`, such as `administrator` or `member`;
- `status` set to `active`.

The versioned source schema is in `pb_migrations/202607161930_create_users_auth.js`.

## Member registry and cell structures

The member directory, departments, sections, cell groups, and roster assignments use PocketBase
as their canonical source. Confirmed server reads are cached per signed-in user for short outages;
configuration changes require a live server acknowledgement.

To reconcile and test the member registry schema:

```bash
npm run backend:bootstrap-members -- --email=YOUR_SUPERUSER_EMAIL
```

To reconcile cell-structure relations and run disposable role/security tests:

```bash
npm run backend:bootstrap-cell-structure -- --email=YOUR_SUPERUSER_EMAIL
```

Both commands prompt for the password without echoing or storing it.

### Saints Directory privacy projection

The member-facing Saints Directory reads from `saints_directory`, not from full registry records.
Authenticated users can see names, roles, fellowship/section placement, ministries, and server-
derived fellowship/ministry counts. Email, phone, address, date of birth, QR identifiers, inactive
records, and other registry fields are not present in the projection.

Directory pages are cached per account in batches of 100 and can be loaded progressively. Full
`members` access is restricted to Administrators/Lead Pastors, a member's own linked profile, a
Cell Leader's assigned fellowship roster, or a District Pastor's assigned section. Members may
update their linked name and phone, but cannot change email, role, ministry placement, QR identity,
status, or ownership. Login email changes require a separate verified account workflow.

To reconcile the privacy views and run disposable leakage, ownership, roster-scope, aggregate,
inactive-record, and anonymous-access tests:

```bash
npm run backend:bootstrap-saints-directory -- --email=YOUR_SUPERUSER_EMAIL --transport=curl
```

The versioned schema is in `pb_migrations/202607190230_create_saints_directory.js`.

## Cell meetings, attendance, visitors, and reports

Fellowship operations are local-first: leaders can start a meeting, take attendance, add visitors,
and submit the weekly report immediately, including during an outage. A durable, per-user Dexie
outbox then sends idempotent commands to PocketBase in order. Server-confirmed results are cached
for short outages; failed authorization or validation remains visible as “needs attention” instead
of being falsely marked as synchronized.

To reconcile the four operational collections and run disposable ownership, authorization,
idempotency, report-review, and cleanup tests:

```bash
npm run backend:bootstrap-cell-operations -- --email=YOUR_SUPERUSER_EMAIL
```

If Node networking is restricted while `curl` can reach PocketHost, add `--transport=curl`. This is
only a bootstrap transport fallback; the browser app continues to use PocketBase directly.

The versioned schema is in `pb_migrations/202607171700_create_cell_operations.js`.

## Training Academy

Academy courses and sessions use a scoped PocketBase cache. Course creation, enrollment, session
state changes, and certificates require a live server acknowledgement. Attendance check-ins are
the exception: authorized Academy managers can continue scanning during a short outage, and each
check-in is retained in the durable outbox until PocketBase confirms it exactly once.

Only Administrators and the Lead Pastor manage courses and rosters. Certificate requests created
by an Administrator remain pending until the Lead Pastor verifies them; members can read only
their own enrollments, attendance, and certificates.

To reconcile and live-test the Academy schema:

```bash
npm run backend:bootstrap-training -- --email=YOUR_SUPERUSER_EMAIL
```

The command uses disposable users and removes all test data. Add `--transport=curl` only when the
local Node network path cannot reach PocketHost. The versioned schema is in
`pb_migrations/202607171930_create_training_academy.js`.

## Announcements and timeline

The announcement feed renders from a cache scoped to the signed-in user, revalidates against
PocketBase, and listens for realtime changes. A one-minute release check makes scheduled posts
appear without reopening the app. Members receive only published records whose release time has
arrived and whose expiry has not passed; the server rules also protect scheduled, expired, and
archived content from direct API reads.

Administrators, the Lead Pastor, and District Pastors can publish, schedule, edit, pin, duplicate,
and archive announcements while online. Management actions wait for PocketBase confirmation, and
hard deletion is disabled. Calendar export remains device-local.

To reconcile the collection and run disposable publication-window and role tests:

```bash
npm run backend:bootstrap-announcements -- --transport=curl
```

The command prompts for both superuser credentials without echoing or storing them. The versioned
schema is in `pb_migrations/202607182000_create_announcements.js`.

## Prayer coordination

Prayer petitions are server-first and are never retained as an offline IndexedDB cache. The
canonical request is readable only by its submitter and pastoral managers. Assigned intercessors
receive a separate privacy-safe assignment projection containing the prayer text and display name;
for anonymous petitions that projection contains no submitter relation or member identifier.

Administrators and the Lead Pastor triage, classify, assign, and archive requests. Intercessors can
append prayer-watch events, add immutable rhema notes, and report an answered outcome only for
their assigned petitions. Watch counts use unique append-only events so concurrent devices cannot
overwrite one another. Prayer text, notes, outcomes, and count events cannot be edited or deleted by
application clients.

To reconcile the five collections and run disposable ownership, anonymity, assignment, and
append-only workflow tests:

```bash
npm run backend:bootstrap-prayer -- --transport=curl
```

The command removes all disposable records and clears its superuser token. The versioned schema is
in `pb_migrations/202607182230_create_prayer_coordination.js`.

## Reports and Analytics

Leadership analytics are calculated by six read-only PocketBase view collections. The browser
receives aggregate counts and cell/course standings instead of downloading prayer bodies or other
sensitive source records. Administrators and Lead Pastors can inspect the dashboard; District
Pastors have the same aggregate read access but no reporting write path. Members and anonymous
clients receive no rows.

The selected week, month, quarter, or year is refreshed from PocketBase on entry and on demand. A
dated, account-scoped aggregate snapshot remains available during a short outage and is deleted on
logout. Announcement engagement is not estimated: the dashboard shows publication status until a
future backend records verifiable view and reminder events.

To reconcile the views and run disposable read/write authorization tests:

```bash
npm run backend:bootstrap-reports -- --email=YOUR_SUPERUSER_EMAIL --transport=curl
```

The versioned schema is in `pb_migrations/202607182300_create_reporting_views.js`.

## Communication and Notifications

The notification center is derived from real PocketBase events: published announcements, prayer
assignments and outcomes, submitted and approved cell reports, verified certificates, and Academy
enrollments. Eight read-only event views expose only the row whose recipient matches the signed-in
user. Prayer notifications contain category-level wording only and never project petition bodies
or submitter identity.

Pastoral users can also send the weekly report reminder shown in the Cells oversight screen. These
are append-only, use a fixed server-side message template, and are deduplicated per cell and week.

Read and dismissed state is stored in `notification_receipts`, scoped to the recipient and shared
across their devices. A rolling 100-alert cache remains readable during a short outage; offline
receipt changes stay pending and retry when connectivity returns. The header and installed-app
badge use the authoritative unread count. This module provides realtime in-app delivery while the
app is running; true background Web Push still requires a separately deployed push sender and is
not simulated by the client.

To reconcile the event views and receipts and run disposable cross-account authorization tests:

```bash
npm run backend:bootstrap-notifications -- --email=YOUR_SUPERUSER_EMAIL --transport=curl
```

The versioned schema is in `pb_migrations/202607182345_create_notifications.js`.

## Audit Logs and Feedback

`feedback` stores private support requests, problem reports, and suggestions. Members can create
and read only their own requests. Administrators and the Lead Pastor can review the shared queue,
add a response, and move a request through new, reviewing, and resolved states. The submitter,
original type, content, and submission timestamp are immutable, and app clients cannot hard-delete
requests. The profile support sheet and app error/access-reporting paths use this same collection.

`audit_logs` is an append-only operational history with server-enforced actor identity. Members see
their own recent actions; Administrators and the Lead Pastor can inspect the leadership activity
view. Successful actions in authentication, registry/structure management, cell operations,
Academy, announcements, prayer coordination, support review, and report reminders emit concise
events without storing prayer text or support content in the log. A rolling 100-record cache is
scoped to the signed-in account and purged on logout.

This activity history is useful for operations but does not replace PocketBase server logs for a
forensic or regulatory audit, because browser clients originate these events.

To reconcile both collections and run disposable spoofing, ownership, immutability, leadership,
hard-delete, and anonymous-access tests:

```bash
npm run backend:bootstrap-governance -- --email=YOUR_SUPERUSER_EMAIL --transport=curl
```

The versioned schema is in `pb_migrations/202607190030_create_governance.js`.
