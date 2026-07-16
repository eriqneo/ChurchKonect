# ChurchConnect

ChurchConnect is a mobile-first church administration PWA for members, cell groups, training,
prayer coordination, announcements, and reporting.

The frontend is currently a React/Vite application with Dexie-backed local persistence. The
production PocketBase backend described in `POCKETHOST_MASTER_PLAN.md` has not yet been connected,
so authentication and remote synchronization remain simulated in this frontend release.

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

Both commands prompt for the password without echoing or storing it. Cell meetings, attendance,
visitors, and weekly reports are intentionally reserved for the following offline-outbox module.
