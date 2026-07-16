# Member Flows — Remediation Plan

Follow-up to the member-flow audit (2026-07-14), which confirmed two critical defects:

- **C1 — Saints Directory is disconnected mock data.** `SaintsDirectory.tsx` (the primary
  "Saints" nav tab) holds members/cells/districts/pillars in local `useState` arrays and never
  touches Dexie. Members enrolled there are invisible to the real registry and to every module
  that assigns members (Cells, Training, Prayer). Proven: ghost member enrolled in Saints was
  "No match found" in Registry CMS.
- **C2 — Two unsynced identity systems.** `PocketBaseProvider` (key `activeSession`, 7-role list)
  drives the header/drawer; `useCurrentUser()` in `hooks.ts` (key `currentRole`, a different
  4-role list) drives Profile, Prayer, Cells, Training. They desync: header showed Brother
  Michael while My Profile showed Pastor David's name, phone, and QR pass.

## Recommendation (summary)

1. **Fix identity first (C2).** It is small, foundational, and every other fix depends on
   trusting "who is logged in" — including the role gating the Saints rewrite needs.
2. **Fix Saints by promoting real data into its shell (C1)** — keep the polished UI, replace the
   data layer tab-by-tab, and reuse the already-correct `EnrollMemberForm` instead of its fake
   local form. Do **not** rewrite the UI, and do **not** patch the mock arrays to "look" synced.
3. **Keep Registry CMS** (Profile → CMS) as the admin power-tool (edit, deactivate, password
   reset). Once both screens share one data source it complements the directory rather than
   duplicating it.

---

## Phase 1 — Single source of identity (fixes C2) — ~½ day, low-medium risk

1. Create `src/lib/auth/roles.ts`: one canonical role list (superset of the 7-role and 4-role
   arrays currently duplicated in `MobileLayout.tsx`, `hooks.ts`, and `PocketBaseProvider.tsx`)
   plus one `setActiveRole()` helper that writes a **single** `appSettings` key (via
   `putAppSetting`) and the audit log entry.
2. Rework `useCurrentUser()` to a thin `useLiveQuery` over that same key, preserving its return
   shape `{ user, role, switchRole }` so its consumers (Profile, Prayer, Cells, Training,
   Reports) need no changes. `switchRole` delegates to `setActiveRole()`.
3. `PocketBaseProvider.login` / `switchRoleDirect` also delegate to `setActiveRole()`. Delete the
   duplicated ROLES arrays.

**Acceptance:** switching role from *any* switcher (DEV MODE sheet, Prayer ribbon, login screen)
updates header avatar, drawer card, My Profile identity, QR pass, and module gating together.
The header person and the Profile person can never differ.

## Phase 2 — Saints Directory on real data (fixes C1) — 1–2 days, medium risk

Rewire `SaintsDirectory.tsx` tab-by-tab (each step independently shippable):

1. **Members tab:** replace `INITIAL_MEMBERS` with `usePocketBaseMembers().members`
   (Dexie-backed, live). Wire search/filter/sort and the detail sheet to real records. Keep the
   existing UX (Avatar, SwipeableRow, stagger, A–Z index).
2. **Enrollment:** delete the local "Enroll New Saint" form and open the existing
   `EnrollMemberForm` in the bottom sheet — one enrollment path app-wide, with the credential
   slip and cell/section auto-fill it already has.
3. **Cells tab:** bind to `db.cellGroups` (+ live member counts from `db.members`); create-cell
   writes Dexie (reuse/extract CellGroupModule's create logic).
4. **Districts tab → `db.sections`; Pillars tab → `db.departments`.** Delete all mock arrays.

**Acceptance (the audit test, re-run):** enroll a member in the Saints tab → appears in Registry
CMS search → assignable in a cell roster, a training enrollment, and a prayer watch → still
present after reload.

## Phase 3 — De-duplication & gating — ~½ day

- Role-gate directory actions with the unified identity: members get a read-only directory;
  admin/pastor see Enroll/Edit/quick actions.
- Normalize soft-delete handling: CellGroupModule filters `deletedAt === undefined` but
  Prayer/Training/MemberManagement query `db.members.toArray()` raw. Add one shared
  `activeMembers()` query helper and use it everywhere.

## Phase 4 — Verification & guardrails — ~½ day

- Re-run the full ghost-member end-to-end flow (enroll → registry → cell → training check-in →
  prayer assignment → reload) and the role-switch desync test on the production build.
- Typecheck + build + service-worker-fresh deploy check.

## Explicitly rejected alternatives

- **Patching SaintsDirectory's mock arrays to also write Dexie** — leaves two write paths and
  guarantees future drift.
- **Deleting SaintsDirectory and moving Registry CMS to the nav tab** — loses the best-polished
  screen in the app; the CMS list UI is utilitarian by design.
- **Keeping both identity stores and syncing on write** — double-write schemes re-desync on the
  first missed call site; a single key is strictly simpler.
