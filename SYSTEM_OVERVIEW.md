# ChurchConnect: Comprehensive System & Architecture Overview

ChurchConnect is a state-of-the-art, mobile-first church administration and small group management portal. Engineered specifically for local-first reliability, the application combines a high-fidelity **"Fintech & Fitness App Aesthetic"** with robust offline capabilities, instant client-side performance, and continuous synchronization.

---

## 1. Core Architectural Philosophies

### 📱 Mobile-First Experience Design
Designed explicitly for handheld touchscreens, the system operates as a single-page progressive mobile container:
*   **Dynamic Viewport Shell (`100dvh`)**: Avoids keyboard-shifting viewport jumpiness, double-scrollbars, or rubber-banding.
*   **Gestural Sheet Modals**: Replaces harsh desktop popups with elegant, bottom-sheet drawers (`motion/react` spring-physics) featuring slide-to-dismiss drag mechanics and tactile visual grab-handles.
*   **Micro-interactions & Tactility**: Every tap, checkbox click, state transition, and tab swap utilizes bouncy spring animations (`whileTap={{ scale: 0.95 }}`) and visual ripples to emulate native application physics.

### 🔌 Local-First & Offline-Capable
Administrative church tasks often happen in areas with spotty cellular coverage (reverent basements, rural meeting points). ChurchConnect handles this seamlessly:
*   **Client-Side Persistence**: Built directly upon IndexedDB using **Dexie.js** for blistering search speed and zero server-roundtrip latency.
*   **Instant Query Engine (`useLiveQuery`)**: UI screens bind directly to local collections. Changes reflect on screen instantly (<16ms frame target), bypassing loading spinner walls.
*   **Background Sync Engine**: Implements a mutation queue. Local writes are recorded immediately, and a differential sync thread periodically attempts to reconcile them with the remote backend (PocketBase) whenever internet connectivity recovers.

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
    *   **Communication Templates**: Formulate bulk communication drafts for Cell Leaders, Pastors, or general announcements.

---

## 3. Database Schema & Storage Map

The local storage layer (IndexedDB via Dexie) is structured across highly optimized relational tables:

```typescript
// Dexie IndexedDB Schema Definition
{
  members: 'id, name, email, role, cellGroupId, sectionId, districtId, pillar, status',
  cellGroups: 'id, name, leaderId, sectionId, meetingDay, meetingTime, status',
  sections: 'id, name, pastorId, districtId',
  districts: 'id, name, overseerId',
  cellMeetings: 'id, cellGroupId, date, status, elapsedSeconds',
  cellAttendances: 'id, meetingId, memberId, present, isVisitor',
  cellReports: 'id, cellGroupId, meetingId, attendanceCount, visitorCount, topics, status, submittedAt',
  trainings: 'id, name, code, durationWeeks, status',
  trainingEnrollments: 'id, trainingId, memberId, status, progressPercent, enrolledAt',
  trainingSessions: 'id, trainingId, lessonNumber, date, facilitatorId',
  trainingAttendance: 'id, sessionId, memberId, present',
  trainingCertificates: 'id, trainingId, memberId, issuedAt',
  prayerRequests: 'id, title, description, category, requestorId, status, isUrgent, createdAt',
  prayerAssignments: 'id, requestId, assignedToId, status, assignedAt',
  notifications: 'id, title, message, type, recipientId, read, createdAt',
  logs: 'id, action, category, details, timestamp',
  roleSettings: 'id, activeRole'
}
```

---

## 4. Sync & Conflict Resolution Engine

To reconcile offline client-side databases with the central cloud system, the application uses an active, multi-stage synchronization lifecycle:

```
[UI Mutation (User Action)] 
         │
         ▼
[Write to Local IndexedDB] ──► [Queue Sync Change Log]
                                      │
                                      ▼
                             [Check Connectivity]
                             ├──► (Offline): Retain in local queue
                             └──► (Online): Process queue sequentially
                                        │
                                        ▼
                                [Sync Reconciler]
                                ├── Push client-side mutation
                                ├── Pull remote increments
                                └── Apply Conflict rules (LWW - Last Write Wins)
```

1.  **Change Tracking**: All local mutations (inserts, updates, deletions) record metadata indicating the change timestamp, operation type, and modified keys.
2.  **Heartbeat Network Monitor**: Constantly queries navigator status and runs diagnostic ping triggers to set the global online indicator state.
3.  **Conflict Reconciler**: Implements *Last-Write-Wins (LWW)* timestamp conflict merging. If records modify concurrently, timestamps arbitrate the final state. If structural deletions conflict, server-defined constraints take precedence.
