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

No environment variables are required for the current frontend. Copy `.env.example` only when
configuring a future backend integration.

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

No Cloudflare environment variables are required for the frontend-only deployment.

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

When PocketBase is connected later, set `VITE_PB_URL` in the Cloudflare Pages environment. Never
place PocketBase admin credentials, API secrets, or private keys in a `VITE_*` variable because
Vite exposes those values in the browser bundle.
