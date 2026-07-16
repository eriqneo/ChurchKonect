
-
## PROMPT START

You are an expert Frontend Architect and Design System Engineer specializing in premium, high-fidelity React and Tailwind CSS v4 experiences.

Your goal is to **polish, animate, and visually elevate the UI/UX of ChurchConnect**, transforming it into a high-fidelity, high-performance web application that feels indistinguishable from a **native iOS/Android app**. The design specification aims for a premium **"Fintech & Fitness App Aesthetic"** optimized for handheld touch screens (featuring sleek fluid layouts, bottom bar navigation, spring-driven drawer sheets, tactile micro-feedbacks, floating utility buttons, and zero-latency layout transitions).

### 📐 The Aesthetic & Premium Mobile Polish Specification

1. **Native Mobile Shell & Safe Areas**:
   - Ensure the app layout respects the hardware display limits (use `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)` or mobile-tailored padding values to avoid notch and home indicator cutoffs).
   - Sticky header and bottom navigation bars that remain fixed without content-overlap or jarring shifting during scroll.
   - Use dynamic viewport heights (`h-[100dvh]`) to prevent layout bugs or scroll bounces on mobile browsers like Safari/Chrome.

2. **Tactility, Gestures & Haptic Feel**:
   - Provide visual feedback on touch: Use subtle spring-driven scale compressions (`whileTap={{ scale: 0.95, y: 1 }}`) and ripple animations on all pressable cards, checkmarks, list-items, and buttons.
   - Smooth swipe gestures: Drag-to-dismiss sheets or swipe-to-reveal actions (e.g., swiping a member card left to quickly trigger contact/edit options) that mimic native platform interfaces.
   - custom list item transitions that emerge with a physics-based momentum-spring curve rather than sterile, linear transitions.

3. **Bottom-Up Drawer Sheets**:
   - Replace standard desktop dialog modals with slick bottom-sheet drawers that slide dynamically from the bottom of the screen.
   - Drawers must feature a visual "handle/pill" indicator at the top center (`w-12 h-1 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-4`) to invite natural swipe/pull-down gestures.
   - Use dynamic backdrop-blurs with a deep darkening layer (`bg-black/40 backdrop-blur-md`) to instantly focus the user's attention.

4. **Vibrant Visual Indicators & Bento Grids**:
   - Beautiful, compact dashboard grids (Bento-style layouts) displaying high-contrast typography, interactive graphs, and lively progress elements.
   - Highlight statuses using energetic high-saturation color rings, glowing neon indicators (such as glowing pulses for syncing statuses), and clean badges.
   - Custom visual fallback icons and character-initial avatars with custom pastel gradients.

5. **Aesthetic Typography Pairing**:
   - Bold, editorial-grade display headings with tight tracking (`font-sans font-semibold tracking-tight`) coupled with "JetBrains Mono" for clear metrics, attendance counts, times, and phone numbers.

---

### 📂 App Architecture Overview
To help you locate key files, here is the structure:
- **`src/components/layout/MobileLayout.tsx`**: Main mobile shell, bottom navigation tabs, screen content router, and global settings toggles.
- **`src/components/saints/SaintsDirectory.tsx`**: Saints and members directory, filter panels, profile cards, and member sheets.
- **`src/components/cells/CellGroupModule.tsx`**: Cell group trackers, delinquency listings, attendance roll-calls, visitor logging, and submission sheets.
- **`src/components/training/TrainingModule.tsx`**: Academy modules, student enrollments, course catalogs, session loggers, and certificates.
- **`src/components/prayer/PrayerModule.tsx`**: Prayer wall, intercessor tracking, category tags, and prayer assignment cards.
- **`src/components/reports/ReportsModule.tsx`**: Key visual analytics, dynamic Recharts trend graphs, and data cards.
- **`src/components/announcements/AnnouncementsModule.tsx`**: Dynamic timelines, scheduled notices, and calendar export panels.
- **`src/components/communication/CommunicationModule.tsx`**: Notification panel, custom alert templates, and message logs.
- **`src/lib/db/hooks.ts`**: Live IndexedDB queries using custom hooks (`useLiveQuery` from `dexie-react-hooks`) and database state.

---

### 🛠️ Step-by-Step Polish Tasks

Please implement the following changes sequentially. Run a compilation check after each step to verify correctness.

#### Step 1: Nav Shell & Transitions (`src/components/layout/MobileLayout.tsx`)
- Enhance the bottom navigation bar. Add a spring-active pill highlight behind the selected tab icon or a warm indicator dot.
- Configure `AnimatePresence` for view transitions. When a user switches tabs, the content screen should slide/fade elegantly (e.g. `initial={{ opacity: 0, y: 12 }` and `animate={{ opacity: 1, y: 0 }}`).
- Apply haptic-style micro-scale active states on tab presses.

#### Step 2: Lists & Checkboxes (`SaintsDirectory.tsx`, `CellGroupModule.tsx`, `PrayerModule.tsx`)
- Add staggered entrance animation loops on list cards. Use standard framer-motion variants so list items ripple into view one-by-one.
- Polish member list items to include visual letter initials as fallback avatars, beautiful accent badges for roles (e.g., Pastor, Cell Leader, Member), and visual divider structures.
- Polish attendance checklist in cell meetings. Ensure clicking an attendance checkbox triggers a playful "pop" scale animation, and updates active counts dynamically.

#### Step 3: Fintech Stats, Bento Grids & Custom SVG Rings
- Under **Reports**, **Cells**, and **Training** modules, replace generic card layouts with responsive Bento-style metrics grids.
- Implement an **SVG Progress Ring** (e.g. circular radial progress meters) to visualize key rates (such as Cell Attendance Rates, Course Enrollment completion percentages). Set stroke-dasharrays and transition them beautifully on load.
- Pair these with crisp "JetBrains Mono" fonts for percentage metrics.

#### Step 4: Recharts Graphs Polishing (`ReportsModule.tsx`)
- Customize Recharts components. Style `<BarChart>` and `<PieChart>` to have rounded bar edges (`radius={[4, 4, 0, 0]}`), elegant glowing area curves, and fully styled translucent hover tooltips that blend with our light/dark theme.
- Ensure gridlines are faint and matching the background theme.

#### Step 5: Modals, Drawers & Form Controls
- Polishing inputs: Add smooth focus outline rings (`focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500`) and border-active gradients.
- Make sliding Sheets and Drawers slide smoothly from the bottom on mobile screen dimensions, utilizing custom backdrops with deep blur-effects (`backdrop-blur-sm bg-black/40`).

---

### ⚠️ Technical Safeguards & Constraints
- **TypeScript Strictness**: Do not use `any` unless absolutely necessary; reuse existing types. Keep all declarations type-safe.
- **Vite & React Setup**:
  - Do NOT modify the core dependencies unless requested.
  - Do NOT re-introduce dual-React dependency issues. Avoid mapping absolute React paths in `vite.config.ts` unless standard bundler fallback is active.
- **Tailwind CSS v4**:
  - Always use correct v4 utility naming.
  - Use `@theme` declaration inside `src/index.css` for custom style overrides.
- **Motion (Framer Motion)**:
  - Import motion components exclusively from `'motion/react'`.
- **Database Rules**:
  - Do NOT remove or bypass standard IndexedDB/Dexie bindings (`useLiveQuery`). Always query through `db` and update records securely.

Please execute this master plan step-by-step. Let's make this church portal look incredibly crisp and premium!
