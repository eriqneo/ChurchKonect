# ChurchConnect

ChurchConnect is a mobile-first church administration PWA for members, cell groups, training,
prayer coordination, announcements, and reporting.

The frontend is a React/Vite application with Dexie-backed local persistence. PocketBase currently
provides production authentication, the member registry, church/cell structures, and local-first
cell operations. Remaining modules are being connected incrementally and tested before moving on.

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
