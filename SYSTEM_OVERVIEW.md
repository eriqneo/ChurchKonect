# ChurchConnect: Comprehensive System & Architecture Overview

ChurchConnect is a mobile-first church administration and small-group management portal. PocketBase is the server authority, with focused offline resilience for service-critical operations and fast account-scoped caches for recently used screens.

---

## 1. Core Architectural Philosophies

### 📱 Mobile-First Experience Design
Designed explicitly for handheld touchscreens, the system operates as a single-page progressive mobile container:
*   **Dynamic Viewport Shell (`100dvh`)**: Avoids keyboard-shifting viewport jumpiness, double-scrollbars, or rubber-banding.
*   **Gestural Sheet Modals**: Replaces harsh desktop popups with elegant, bottom-sheet drawers (`motion/react` spring-physics) featuring slide-to-dismiss drag mechanics and tactile visual grab-handles.
*   **Micro-interactions & Tactility**: Every tap, checkbox click, state transition, and tab swap utilizes bouncy spring animations (`whileTap={{ scale: 0.95 }}`) and visual ripples to emulate native application physics.

### 🔌 Online-First & Offline-Resilient
PocketBase owns canonical identity, permissions, records, and reporting. Dexie stores scoped read caches, device settings, and durable critical-operation outboxes:
*   **Scoped Persistence**: Confirmed caches are keyed to the authenticated account and purged at logout where required.
*   **Responsive Queries**: Recently confirmed data can render immediately while the active module revalidates against PocketBase.
*   **Acknowledged Synchronization**: Cell operations and Academy check-ins stay pending until their idempotent PocketBase command succeeds. Permanent rejection is shown as **Needs attention**; timers never manufacture a successful state.

---

## 2. Comprehensive Module Breakdown

The system is compartmentalized into self-contained modules, each tailored to specific roles within a church's leadership structure (Admin, Pastor, Cell Leader, Intercessor):

### 👥 1. Membership & Directory ("Saints Directory")
*   **Purpose**: Centralized record keeping for all church members ("Saints").
*   **Key Features**:
    *   **Privacy-Safe Projection**: The church-wide directory contains ministry placement but omits phone, email, address, birth date, QR identity, and inactive registry records.
    *   **Scoped Registry Access**: Full records are limited to authorized leadership, the linked member, and ministry leaders for their assigned roster.
    *   **Paginated Offline Cache**: Confirmed directory pages and server-derived structure counts remain available per signed-in account during short outages.
    *   Multi-parameter search and fuzzy query filters (filter by Church Role, Pillar, Section, or District).
    *   Detailed Profile Cards detailing leadership records, cell group affiliations, and academy course histories.
    *   Visual fallback avatars generated dynamically using pastel gradient pairings and name initials.
    *   Intuitive forms for enrolling new members with auto-suggest cell and leadership values.

### 🏠 2. Small Groups ("Cell Groups")
*   **Purpose**: Track and nurture cellular communities.
*   **Key Features**:
    *   **Delinquency Monitoring**: Intelligent visual flags for groups with missing meeting logs.
    *   **Tactile Attendance Roll-Call**: Click-to-toggle checkboxes with active counts showing progress dynamically.
    *   **Visitor Logging**: Capture guest details (names, contact info) during active cell meetings to ensure prompt follow-up.
    *   **Leader Reporting**: Simple workflow for leaders to compile meeting summaries (attendance, prayer requests, testimonies, group challenges) and submit them upwards.
    *   **Pastoral Approval Pipeline**: Pastors can review, approve, or request clarification on weekly reports.

### 🎓 3. Academy & Courses ("Training Modules")
*   **Purpose**: Academic advancement, curriculum tracking, and leadership qualification pathways.
*   **Key Features**:
    *   **Course Catalog**: Interactive progress trackers showing active curriculum syllabus structures.
    *   **Class Session Logger**: Record lesson dates, times, facilitators, and individual student attendance logs.
    *   **Enrollment Systems**: Batch enroll members into courses, track pass/fail metrics, and record completion dates.
    *   **Certificate Generator**: Dynamically compiles and generates completion certificates suitable for print or sharing.

### 🙏 4. Prayer Wall & Assignments ("Prayer Module")
*   **Purpose**: Digital intercessory network.
*   **Key Features**:
    *   **Prayer Wall**: Interactive card list categorizeable by tags (Health, Family, Guidance, Finances).
    *   **Urgency & Status**: Visual states representing active, answered, or urgent intercessions.
    *   **Intercessor Assignment**: Assign specific prayer points to trained intercessors or cell groups.
    *   **Impact Tracking**: Track active prayer counts, testimonies, and visual timelines showing the journey of answered prayers.

### 📊 5. Visual Analytics ("Reports Module")
*   **Purpose**: Macro church health monitoring via elegant data indicators.
*   **Key Features**:
    *   **Bento-Grid Statistics**: Compact dashboard displaying member distribution, cell attendance rates, and training certifications.
    *   **Recharts Integration**: Premium, clean graphical curves (Area, Bar, and Pie Charts) detailing multi-week trends with dynamic tooltip positioning.
    *   **Circular Progress Rings**: Lightweight SVG radial meters depicting target goals (e.g. attendance percentage benchmarks) with spring-loaded stroke loading.

### 📅 6. Announcements & Timeline ("Announcements Module")
*   **Purpose**: Centralized bulletin board.
*   **Key Features**:
    *   **Dynamic Timelines**: Chronological feed of active church events and corporate messages.
    *   **Interactive Calendar Exports**: Instantly compile event variables (title, description, dates, location) into pre-configured templates for seamless export to **Google Calendar** or local `.ics`.

### 💬 7. Push Messages & Notifications ("Communication Module")
*   **Purpose**: Direct communication system.
*   **Key Features**:
    *   **Notification Panel**: Dropdown and floating alerts detailing background synchronization updates, newly assigned prayer points, or report approvals.
    *   **Recipient State**: Read and dismissed receipts synchronize across a user's signed-in devices.

---

## 3. Database Schema & Storage Map

The local storage layer is a support layer, not a second source of truth:

```typescript
// Simplified production responsibilities
{
  scopedCaches: ['members', 'directoryMembers', 'cellGroups', 'trainings', 'announcements', 'notifications'],
  criticalLocalViews: ['cellMeetings', 'cellAttendance', 'cellVisitors', 'cellReports', 'trainingAttendance'],
  durableOutbox: ['start_meeting', 'mark_attendance', 'add_visitor', 'submit_report', 'review_report', 'training_check_in'],
  deviceOnly: ['appSettings']
}
```

---

## 4. Sync & Conflict Resolution Engine

Critical offline-capable commands use one real acknowledgement lifecycle:

```
[UI Mutation (User Action)] 
         │
         ▼
[Write local operational view] ──► [Queue idempotent outbox command]
                                      │
                                      ▼
                             [Check Connectivity]
                             ├──► (Offline): Retain in local queue
                             └──► (Online): Process queue sequentially
                                        │
                                        ▼
                                [Module command processor]
                                ├── Send stable operation and entity IDs
                                ├── Let PocketBase rules accept or reject
                                └── Mark synced only after acknowledgement
```

1. **Stable identity:** every queued command has an immutable operation ID and PocketBase-compatible entity ID.
2. **Bounded retry:** transient network failures remain queued with backoff; permanent authorization or validation failures become **Needs attention**.
3. **Server authority:** editable canonical records use explicit server workflows; the client does not silently apply last-write-wins conflict merging.
