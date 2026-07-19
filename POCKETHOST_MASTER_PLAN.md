# ChurchConnect — PocketBase + Resilient Offline Master Plan

> Revised 2026-07-16. This plan supersedes the earlier full RxDB-replication proposal.

## 1. Executive recommendation

ChurchConnect should be an **online-first, server-authoritative application with resilient
offline support for critical workflows**.

Internet is normally available at church, so the system does not need to replicate every
collection into a second full client database. PocketBase on PocketHost should hold the source
of truth for users, permissions, members, prayer data, training, reports, and analytics. The
existing Dexie database should remain, but with a narrower purpose:

- cache frequently read, non-sensitive data for fast startup and temporary connectivity loss;
- preserve unfinished form drafts;
- durably queue a small set of operational writes that must survive an outage;
- expose immediate optimistic UI while a server request is in progress.

This approach retains the speed users already experience, supports short internet outages, and
avoids the migration, bundle size, conflict, and maintenance cost of adding RxDB. RxDB should be
reconsidered only if the church later requires prolonged offline operation or concurrent offline
editing across many devices.

---

## 2. Product and engineering goals

1. **Fast interaction:** local UI feedback should not wait for a network round trip.
2. **Server authority:** PocketBase owns canonical records, authentication, permissions, and
   sensitive data access.
3. **Graceful outages:** attendance and other service-critical work continues during a short
   outage and uploads automatically after reconnection.
4. **Clear truth:** the interface distinguishes `Saved on this device`, `Syncing`, `Synced`, and
   `Needs attention`.
5. **Security by default:** devices cache only the data required by the signed-in role, and
   sensitive prayer information is not broadly persisted.
6. **Incremental delivery:** preserve component hook shapes and migrate one module at a time.
7. **Measurable performance:** optimize against real mid-range Android devices and realistic
   church data volumes.

---

## 3. Current implementation state

| Layer | Current implementation | Assessment |
|---|---|---|
| Local database | Dexie/IndexedDB with scoped caches and dedicated outbox tables | Real, account-scoped support layer |
| UI updates | Data facades combine confirmed server data with approved optimistic commands | Fast without treating every local row as canonical |
| Synchronization | A real account-scoped coordinator processes Cell and Academy idempotent outboxes | Connected; only PocketBase acknowledgement produces `synced` state |
| Authentication | `PocketBaseProvider.tsx` uses PocketBase auth and refresh tokens | Server-authoritative |
| Identity | PocketBase auth is the production identity and role source | Reconciled |
| Saints Directory | Paginated privacy-safe view with scoped cache and server aggregate counts | Connected without exposing registry PII |
| Mobile Home | Lightweight private aggregate row plus published event dates with an account-scoped snapshot | Connected; sample activity and metrics retired |
| Certificate authority | Immutable Lead Pastor verification identity and live download revalidation | Connected; random codes and sample signatories retired |
| PocketBase hooks | Production collections, views, rules, and live bootstrap tests are versioned | Active |
| Backend configuration | PocketHost production URL and Cloudflare frontend configuration are deployed in source | Configured |

The implementation now follows the selective local-first target below. Production demo seeding and
timer-based fake acknowledgement have been retired; remaining record metadata can be simplified
after one compatibility release.

---

## 4. Target architecture

```text
┌──────────────────────────── Browser / PWA ────────────────────────────┐
│ React components                                                      │
│      │                                                                │
│      ▼                                                                │
│ Data facade: src/lib/data/                                            │
│  ├─ queries: server fetch + scoped Dexie cache                        │
│  ├─ commands: optimistic mutation + server request                    │
│  └─ connectivity: retry state and user-visible status                 │
│      │                           │                                     │
│      ▼                           ▼                                     │
│ PocketBase SDK              Dexie/IndexedDB                            │
│  ├─ normal reads/writes      ├─ safe read cache                        │
│  ├─ auth and API rules       ├─ form drafts                            │
│  └─ realtime invalidation    └─ durable critical-write outbox          │
└───────────────┬───────────────────────────────┬────────────────────────┘
                │ HTTPS                         │ reconnect/retry
                ▼                               │
┌──────────────────────── PocketHost ───────────▼───────────────────────┐
│ PocketBase                                                            │
│  ├─ canonical collections and indexes                                 │
│  ├─ authentication and role-based API rules                           │
│  ├─ realtime events                                                    │
│  ├─ versioned pb_migrations                                            │
│  └─ pb_hooks for privileged workflows and notifications               │
└───────────────────────────────────────────────────────────────────────┘
```

### Normal online read

1. Render a valid cached result immediately when available.
2. Fetch the authoritative server result in the background.
3. Replace and refresh the cache if the server result changed.
4. Show a compact stale/offline indicator when freshness cannot be confirmed.

This is stale-while-revalidate behavior, not full database replication.

### Normal online write

1. Validate the command locally.
2. Apply an optimistic UI update where reversal is safe.
3. Send the command to PocketBase immediately.
4. Replace the optimistic record with the authoritative response.
5. Roll back and explain the error if the server rejects it.

### Critical write during an outage

1. Generate a stable operation ID and client-created record ID.
2. Store the command in a dedicated Dexie outbox transaction.
3. Update the relevant local view immediately.
4. Mark it `Saved on this device` rather than `Synced`.
5. Retry with bounded exponential backoff after connectivity returns.
6. Mark it `Synced` only after PocketBase acknowledges the operation.

---

## 5. Data policy by workflow

| Workflow | Online behavior | Offline behavior | Local retention |
|---|---|---|---|
| Authentication and permissions | PocketBase required and authoritative | Existing session may show cached shell; protected mutations pause | Auth token per SDK; minimal role profile |
| Member directory | Server fetch with scoped cache | Read last confirmed cache | Role-scoped subset; purge on logout |
| Member enrollment/editing | Server-first transaction | Save non-sensitive draft only; do not claim enrollment succeeded | Draft expires automatically |
| Cell meetings | Server-first with optimistic UI | Create/update through durable outbox | Current and recent meetings |
| Attendance and visitors | Immediate server command | Durable append-style outbox | Current meeting plus recent history |
| Cell reports | Server save/submit | Draft locally; submission queues with explicit status | Draft until acknowledged |
| Training catalog | Server fetch with cache | Read cached catalog | Reference data |
| Training enrollment | Server-first | Draft selection; final enrollment waits for server | Minimal draft |
| Training attendance | Immediate server command | Durable append-style outbox | Active session only |
| Certificates | Server-generated/verified | Unavailable offline | Cache issued certificate metadata only |
| Prayer requests | Server-first with strict rules | Optional local draft only; no shared queue by default | Avoid sensitive body persistence |
| Prayer assignments | Server-first | Requires connection | Minimal metadata cache if authorized |
| Announcements | Server fetch/realtime with cache | Read cached active notices | Active notices and upcoming events |
| Notifications | Server/realtime | Read cached recent notifications | Small rolling window |
| Analytics | Server-derived | Show last refreshed snapshot with timestamp | Aggregates only |
| Audit logs | Server append through commands/hooks | Queue only the audit event attached to an allowed offline command | Remove after acknowledgement |
| Feedback/support | Server-first private workflow | Keep unsent text in the open form; do not claim submission | Account-scoped recent requests only |

Sensitive data must never be cached merely because a generic collection helper caches every
response. Every query declares its cache policy and retention explicitly.

---

## 6. Backend design decisions

### D1 — Keep Dexie; do not add RxDB in this phase

Dexie already provides IndexedDB persistence and reactive local UI. Adding RxDB would create a
second migration before the app has a real backend and would solve a broader offline problem than
the church currently reports. Refactor Dexie into cache, drafts, and outbox responsibilities
instead of replacing it.

### D2 — PocketBase is the canonical source

The server decides whether a user can read or change a record. Client role checks improve UX but
are never security controls. PocketBase collection rules and privileged hooks enforce access.

### D3 — Use a data facade

Components should not call Dexie or PocketBase directly. A facade preserves current hook return
shapes where practical and exposes explicit query and command functions. This lets modules move
incrementally without mixing server and local authority inside UI components.

### D4 — Use one identity source

`PocketBaseProvider` should wrap the real PocketBase `authStore`. The authenticated user and its
server role become the only production identity. The development role simulator may remain only
behind `import.meta.env.DEV`, using clearly labeled test identities.

### D5 — Make offline records idempotent

Each queued command has an immutable operation ID. Client-creatable offline records use a stable,
PocketBase-compatible ID before upload. Replaying a command after an uncertain connection must
not create a duplicate attendance, visitor, or report.

### D6 — Prefer append-style operational records

Attendance and check-ins should be independent records with a uniqueness constraint such as
`meetingId + memberId`. This minimizes edit conflicts and makes retries safe.

### D7 — Avoid blind last-write-wins for meaningful edits

For editable canonical records, send the last known server version or `updated` timestamp. If it
changed, return a conflict and ask the user to refresh or resolve it. Server-wins is acceptable
for rejected unauthorized changes; silent last-write-wins is not acceptable for member identity
or sensitive prayer data.

### D8 — Realtime events invalidate caches

PocketBase realtime subscriptions should trigger a targeted refetch or update of affected cache
entries. They do not turn Dexie into a full mirror. Reconnect triggers a freshness check for the
currently visible module.

### D9 — Configuration and schema live in the repository

- `VITE_PB_URL` configures the instance; no hardcoded deployment URL.
- `pb_migrations/` defines fields, indexes, relations, and API rules.
- `pb_hooks/` contains reviewed privileged workflows.
- No admin credentials or server secrets are shipped to the browser.

---

## 7. PocketBase collection direction

| Collection | Authority | Client cache/outbox policy |
|---|---|---|
| `users` | Server auth collection | Minimal active-user cache; never offline-created by normal clients |
| `members` | Server | Scoped read cache; enrollment/edit requires server |
| `departments`, `sections` | Server | Long-lived reference cache |
| `cell_groups` | Server | Scoped read cache; admin changes require server |
| `cell_meetings` | Server | Recent cache; critical create/update may queue |
| `cell_attendance` | Server | Append-style critical outbox |
| `cell_reports` | Server | Local draft plus queued submission |
| `trainings`, `training_sessions` | Server | Read cache |
| `training_enrollments` | Server | Server-first; local draft only |
| `training_attendance` | Server | Append-style critical outbox |
| `training_certificates` | Server | Read cache after server issuance |
| `prayer_requests` | Server, strict rules | Server-first; sensitive draft policy |
| `prayer_assignments`, `intercessory_teams` | Server, strict rules | Authorized metadata cache only |
| `announcements`, `notifications` | Server | Small read cache; realtime invalidation |
| `audit_logs` | Server append-only | Queue only with its originating offline command |
| `feedback` | Server | May queue if content policy permits |
| `appSettings` | Device | Local-only preferences; never an identity authority |

---

## 8. Delivery plan

### Phase 0 — Baseline and integrity fixes (~1–2 days)

- Record current bundle size, startup time, major query timings, and behavior at 375×812.
- Implement the identity unification from `MEMBER_FLOWS_REMEDIATION_PLAN.md`.
- Replace Saints Directory mock arrays with the real member facade and one enrollment flow.
- Add one shared active-member query policy and normalize soft-delete filtering.
- Keep the current fake sync clearly labeled as development-only until replacement.

**Gate:** one role is shown consistently everywhere; a member enrolled through Saints appears in
Registry, Cells, Training, and Prayer after reload; typecheck and production build pass.

### Phase 1 — PocketBase foundation (~1–1.5 days)

- Add the `pocketbase` SDK and `VITE_PB_URL` configuration.
- Provision the PocketHost pilot instance with named credential ownership.
- Commit versioned migrations for all required collections, relations, indexes, and rules.
- Add role-based rule tests, including denial cases for members and prayer data.
- Seed departments, sections, training catalog, and test accounts server-side.
- Deploy reviewed hooks for privileged account provisioning and notification fan-out.

**Gate:** scripted smoke tests prove allowed and forbidden operations for every production role;
no admin secret appears in the client bundle.

### Phase 2 — Real authentication and data facade (~1 day)

- Replace mock provider internals with `authWithPassword`, `authRefresh`, logout, and auth-store
  persistence while preserving the provider interface where practical.
- Add `src/lib/data/` query, command, cache-policy, and error abstractions.
- Purge role-scoped caches and drafts on logout or account change.
- Keep the role simulator development-only and visually unmistakable.

**Gate:** login, refresh, expiry, logout, and role changes behave consistently across reloads;
server rules, not component checks, block unauthorized access.

### Phase 3 — Server-backed reads, module by module (~1–1.5 days)

**Implemented:** the mobile Home screen now reads a single role-aware, account-scoped aggregate
row and published gathering dates. It revalidates only while visible and retains a safe snapshot
for a brief outage; hardcoded report, attendance, cell, course, and gathering activity is retired.

Order: reference data → members/cells → training → announcements → prayer → reports.

- Implement cache-first rendering followed by server revalidation.
- Declare cache scope, TTL, and logout behavior per query.
- Add pagination and indexed filtering instead of loading full collections.
- Use realtime events to invalidate only relevant active queries.
- Display `Last updated` when showing data that could be stale.

**Gate:** two browsers see server changes promptly; a brief outage can still open recently used,
authorized screens; users never see another role's cached data.

### Phase 4 — Server-backed commands and offline outbox (~1.5–2 days)

- Create a dedicated Dexie `outbox` table with operation ID, entity ID, command type, payload,
  owner, attempt count, timestamps, and failure state.
- Implement online optimistic commands first.
- Add offline queue support only for cell meetings, attendance/visitors, cell report submissions,
  training attendance, and approved feedback/audit events.
- Use idempotent IDs and uniqueness indexes to prevent duplicates.
- Process commands in dependency order and serialize commands targeting the same entity.
- Provide retry, discard, and inspect actions for permanent failures.

**Gate:** in airplane mode, a leader can record attendance and submit a report; after reconnection
each record appears exactly once on a second device. A rejected command remains visible as `Needs
attention` and is never falsely marked synced.

### Phase 5 — Retire simulation and reconcile legacy data (~0.5–1 day)

**Implemented:** the global coordinator now reflects real account-scoped outbox state, preserves
`churchconnect_sync_progress` as a compatibility event, exposes rejected operations for retry, and
removes unscoped demo fixtures once without touching confirmed caches or queued work.

- Replace `SyncEngine.ts` simulated completion with real request/outbox state.
- Preserve existing `churchconnect_sync_progress` UI events through an adapter if still useful.
- Upload or deliberately discard seeded/demo records; never silently mix demo and production data.
- Retire per-record `remoteId` and generic `syncStatus` fields after all consumers move to the
  command/outbox model.
- Keep a read-only backup of the legacy IndexedDB schema for one release.

**Gate:** every sync indicator represents real server acknowledgement; no timer can mark a failed
network operation as synced.

### Phase 6 — Performance, security, and rollout (~1–1.5 days)

- Test on a mid-range Android device with normal, slow, intermittent, and offline networks.
- Verify token expiry during queued work, multi-tab outbox ownership, retry backoff, cache purge,
  service-worker behavior, and PocketHost cold starts.
- Paginate/virtualize large directories and attendance histories.
- Review IndexedDB for sensitive prayer or cross-role data leakage.
- Add server backups, error monitoring, audit review, and an operational recovery procedure.
- Pilot with a small group before church-wide rollout.

**Gate:** production build and PWA checks pass; the pilot meets the performance targets below;
backup and rollback procedures are tested rather than merely documented.

**Estimated implementation:** approximately 7–10 working days for a production-ready pilot,
including the documented identity and Saints remediation. External provisioning, data cleanup,
and user acceptance time are additional.

---

## 9. Performance targets

- Cached usable screen visible within 2 seconds on a representative mid-range Android phone.
- Tap-to-feedback under 100 ms for local interactions.
- Normal tab transition under 150 ms excluding deliberate animation duration.
- Directory search feedback under 100 ms for locally cached results.
- No unpaginated full-collection fetch in production module paths.
- Online command acknowledgement normally visible within 1 second on church Wi-Fi.
- Offline command visible locally immediately and retried without blocking the interface.
- Charts and long lists load on demand rather than inflating initial startup cost.

Performance must be measured before and after each migration phase. A new architecture is not
considered faster merely because it is more sophisticated.

---

## 10. Failure and conflict behavior

| Situation | Required behavior |
|---|---|
| Request times out before acknowledgement | Retry same operation ID; do not create a duplicate |
| User goes offline during attendance | Save to outbox and show `Saved on this device` |
| Authentication expires | Pause outbox, refresh auth, then retry; request login if refresh fails |
| Permission is revoked while offline | Server rejects; mark `Needs attention`; do not loop forever |
| Editable record changed on server | Return conflict and refresh/resolve; do not silently overwrite |
| Realtime connection drops | Continue normal HTTPS use; refetch visible data on reconnect |
| PocketHost cold start | Show non-blocking reconnect state and use bounded backoff |
| User logs out with pending commands | Warn explicitly; retain only under the same encrypted/user scope or require resolution |

---

## 11. Security requirements

- PocketBase rules are tested with both allow and deny assertions.
- Prayer request bodies and personal details use the strictest collection rules.
- Cache keys include authenticated user and tenant/church scope.
- Logout removes scoped member, prayer, notification, and draft data from IndexedDB.
- The client never contains PocketBase admin credentials.
- Privileged user creation and certificate issuance run through server hooks/endpoints.
- Audit logs are append-only to clients and record authoritative server identity.
- Production UI contains no role impersonation controls.
- Local drafts containing personal data have an expiry and explicit discard path.

---

## 12. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Users expect every offline action to sync | Support a documented subset and label unavailable actions clearly |
| Cached data leaks across roles | Scope caches per account; purge on logout and role/account change |
| Duplicate writes after timeout | Stable operation IDs, client record IDs, and server uniqueness indexes |
| Outbox becomes another generic replication engine | Restrict allowed command types and keep server fetches authoritative |
| PocketHost cold starts | Warm-up request, bounded retry/backoff, and paid tier before broad rollout if needed |
| Sensitive prayer data persists on shared devices | Server-first policy, minimal metadata cache, expiring drafts, logout purge |
| Component code mixes Dexie and PocketBase | Enforce data-facade access for migrated modules |
| Demo data enters production | Explicit seed environment and migration/discard decision before launch |
| Analytics are expensive on clients | Server-side aggregates and paginated detail views |

---

## 13. Explicitly out of scope for the pilot

- Full RxDB or bidirectional replication of every collection
- Prolonged multi-day offline operation
- Automatic field-level conflict merging
- Offline member/account provisioning
- Offline prayer assignment or access to uncached sensitive prayer content
- Client-side certificate authority
- File/avatar replication beyond normal PocketBase file access
- Self-hosted PocketBase infrastructure

---

## 14. Conditions for reconsidering full local-first replication

Re-evaluate RxDB or another full replication layer only if measured usage demonstrates one or
more of the following:

- users regularly work without connectivity for hours rather than minutes;
- most modules must be fully editable offline;
- several devices concurrently edit the same offline datasets;
- server round-trip latency remains unacceptable after optimistic UI and caching;
- the targeted outbox grows into most application collections;
- a formal multi-device offline convergence requirement is approved and funded.

Until then, PocketBase plus scoped Dexie caching and a small durable outbox is the simpler,
faster-to-operate, and professionally appropriate architecture for ChurchConnect.

---

## 15. Decisions required before implementation

1. **PocketHost ownership:** who creates the instance and controls admin credentials and backups?
2. **Pilot tier:** free tier for testing or paid always-on service for the live pilot?
3. **Offline window:** how long must queued church-service work remain available—hours, days, or
   until manually resolved?
4. **Device policy:** are phones personal devices, shared church devices, or both?
5. **Prayer drafts:** may sensitive prayer text ever be stored locally, even temporarily?
6. **Legacy data:** should current seeded/user-created Dexie records be migrated, archived, or
   discarded before production?
