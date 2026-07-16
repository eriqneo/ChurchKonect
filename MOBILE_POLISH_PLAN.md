# ChurchConnect — Mobile Structure & Polish Master Plan

Goal: make the app feel like a native iOS/Android app ("Fintech & Fitness" aesthetic) per
`claude_polish_prompt.md`, building on what already exists rather than rewriting it.

## Current state audit (what's already in place)

- ✅ Animation library at `src/lib/animations/index.ts`: `cardTap`, `buttonTap`, `sheetPresent`,
  `staggerChildren`, `attendanceCheck`, `useHaptic`, `useCountUp`, `usePullToRefresh`, `useReducedMotion`.
- ✅ Shared primitives at `src/components/shared/index.tsx`: `GlassCard`, `AccentBadge`, `StatBlock`,
  `GlowTabBar`, `BottomSheet` (spring slide-up, grab handle, blurred backdrop), `SearchField`, `HeroCard`.
- ✅ Safe-area CSS variables defined in `src/globals.css` (`--safe-top/bottom/left/right`).
- ✅ `AnimatePresence` view transitions and `whileTap` states in `MobileLayout.tsx`.
- ✅ Recharts partially themed in `ReportsModule.tsx` (rounded bars, faint grids, cursor fills).
- ✅ Design tokens: gold accent (#C8A45C), cathedral/surface palette, Inter font, `Typography` scale.

## Gaps (what this plan fixes)

- ❌ Shell uses `min-h-screen` (100vh), not `100dvh` → keyboard/URL-bar viewport jumping on mobile.
- ❌ Safe-area vars are defined but not verified as consumed by the sticky header / bottom nav.
- ❌ `BottomSheet` has no drag-to-dismiss gesture — handle is click-only.
- ❌ No JetBrains Mono for metrics/counts/times.
- ❌ No swipe-to-reveal actions on list items (member cards etc.).
- ❌ Staggered list entrances exist as variants but adoption across modules is inconsistent.
- ❌ SVG progress rings exist in places (training/reports) but not as a shared, animated primitive.

---

## Phase 1 — Native viewport shell (foundation, do first)

Files: `src/components/layout/MobileLayout.tsx`, `src/App.tsx`, `src/globals.css`, `index.html`

1. Switch the app shell from `min-h-screen` to a fixed `h-[100dvh]` column layout:
   sticky header + scrollable content region (`flex-1 overflow-y-auto`) + fixed bottom nav.
   Only the content region scrolls — never the body (kills rubber-banding/double scrollbars).
2. Consume safe-area vars: `padding-top: var(--safe-top)` on the header,
   `padding-bottom: var(--safe-bottom)` on the bottom nav.
3. Verify `index.html` has `viewport-fit=cover` in the viewport meta tag.
4. Add `overscroll-behavior: none` on the body to stop pull-to-refresh hijacking the shell.

Acceptance: no layout jump when the keyboard opens; bottom nav never overlaps the home indicator;
body never scrolls independently of the content pane.

## Phase 2 — Bottom nav & tab transitions

Files: `MobileLayout.tsx`, `shared/index.tsx` (`GlowTabBar`)

1. Spring-active pill highlight behind the selected tab (`layoutId` shared-layout animation).
2. Tab content transitions via `AnimatePresence mode="wait"`:
   `initial={{ opacity: 0, y: 12 }}` → `animate={{ opacity: 1, y: 0 }}`.
3. `whileTap={{ scale: 0.9 }}` + `useHaptic()` on every tab press.

## Phase 3 — Drag-to-dismiss BottomSheet

Files: `shared/index.tsx` (`BottomSheet`)

1. Add `drag="y"` with `dragConstraints={{ top: 0 }}`, `dragElastic`, and dismiss on
   velocity/offset threshold in `onDragEnd`. Keep escape-key and backdrop-click paths.
2. Respect existing `detents` prop; snap back with spring when drag doesn't cross threshold.
3. Keep backdrop `bg-black/60 backdrop-blur` and grab handle; handle becomes the visual drag cue.

Every sheet in the app inherits this for free (Saints, Cells, Training, Prayer all use `BottomSheet`).

## Phase 4 — Typography: JetBrains Mono for metrics

Files: `index.html` or `src/globals.css`, `src/lib/theme/typography.ts`

1. Self-host or link JetBrains Mono (weights 500/700 only), add `--font-mono` to `@theme`.
2. Add a `Typography.METRIC` token; apply to attendance counts, percentages, phone numbers,
   times, and stat values across `StatBlock`, `ReportsModule`, `CellGroupModule`, `TrainingModule`.

## Phase 5 — Lists: stagger, avatars, badges, swipe actions

Files: `SaintsDirectory.tsx`, `CellGroupModule.tsx`, `PrayerModule.tsx`, `shared/index.tsx`

1. Apply the existing `staggerChildren` variants consistently to all list/card collections.
2. Confirm initial-letter pastel-gradient avatars and role `AccentBadge`s on every member row.
3. Attendance checkboxes: `attendanceCheck` pop animation + live count via `useCountUp`.
4. New shared `SwipeableRow` primitive (drag-x, snap-open action rail) — apply to member cards
   (call/edit) and prayer cards (assign/mark-answered).

## Phase 6 — Bento grids & shared ProgressRing

Files: `ReportsModule.tsx`, `CellGroupModule.tsx`, `TrainingModule.tsx`, `shared/index.tsx`

1. Extract the existing ring code into one shared `<ProgressRing>` (animated stroke-dashoffset
   on mount, mono percentage label, size/color props).
2. Restructure module headline stats into bento grids (2-col mixed-span, high-contrast type).
3. Glowing pulse indicator on sync status.

## Phase 7 — Recharts final pass + form controls

Files: `ReportsModule.tsx`, form inputs across modules

1. Finish chart theming: translucent themed tooltips everywhere, gradient area fills,
   rounded bar edges on all remaining charts.
2. Inputs: `focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500` (gold, not the prompt's
   emerald — match the existing design system).

---

## Constraints (from claude_polish_prompt.md — non-negotiable)

- Motion imports only from `'motion/react'`.
- Tailwind v4 utilities; custom tokens via `@theme` in the CSS entry file.
- No new dependencies; don't touch `vite.config.ts` React resolution.
- All data access stays on Dexie `useLiveQuery` — never bypass `db`.
- Strict TypeScript, no `any`.
- Run a compile check (`npx tsc --noEmit` / vite build) after each phase.
- Honor `useReducedMotion()` in every new animation.

## Order & rationale

Phases 1–3 are structural ("mobile structured"): viewport shell, nav, and sheet gestures define
whether the app *feels* native. Phases 4–7 are cosmetic polish layered on that foundation.
Each phase is independently shippable and verifiable in the browser at mobile viewport (375×812).
