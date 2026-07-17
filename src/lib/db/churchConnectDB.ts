import Dexie, { type Table } from 'dexie';

// ==========================================
// 1. Interfaces & Shared Types
// ==========================================

export interface LocalFirstRecord {
  id?: number;
  localId: string;         // crypto.randomUUID() or custom UUID
  remoteId?: string;
  syncStatus: 'local' | 'pending' | 'synced' | 'failed';
  createdAt: string;       // ISO string
  updatedAt: string;
  deletedAt?: string;      // soft delete
  cacheOwnerId?: string;   // authenticated user whose confirmed server result is cached
}

export interface UserRecord extends LocalFirstRecord {
  email: string;
  name: string;
  role: string;            // 'lead_pastor' | 'cell_leader' | 'member' etc.
  cellGroupId?: string;
  sectionId?: string;
  departmentId?: string;
}

export interface MemberRecord extends LocalFirstRecord {
  fullName: string;
  email: string;
  phone: string;
  role: string;
  cellGroupId?: string;
  sectionId?: string;
  qrCode: string;          // Pass token
  avatarText?: string;
}

export interface DepartmentRecord extends LocalFirstRecord {
  name: string;
  headId: string;          // user's localId
  headMemberId?: string;
  headName?: string;
  description?: string;
  status?: 'Active' | 'Inactive';
}

export interface SectionRecord extends LocalFirstRecord {
  name: string;
  pastorId: string;        // user's localId
  pastorMemberId?: string;
  pastorName?: string;
  code?: string;
  status?: 'Active' | 'Inactive';
}

export interface CellGroupRecord extends LocalFirstRecord {
  name: string;
  leaderId: string;        // user's localId
  leaderMemberId?: string;
  sectionId: string;       // section's localId
  meetingDay?: string;     // e.g., 'Wednesday'
  meetingTime?: string;    // e.g., '19:00'
  location?: string;
  status?: 'Active' | 'Inactive';
  leaderName?: string;
  sectionName?: string;
}

export interface CellMeetingRecord extends LocalFirstRecord {
  cellGroupId: string;
  meetingDate: string;     // YYYY-MM-DD
  status: 'scheduled' | 'active' | 'completed';
  startedAt?: string;
  endedAt?: string;
  createdBy?: string;
  operationId?: string;
}

export interface CellAttendanceRecord extends LocalFirstRecord {
  meetingId: string;
  memberId?: string;
  visitorId?: string;
  status: 'present' | 'absent' | 'excused';
  markedBy?: string;
  operationId?: string;
}

export interface CellVisitorRecord extends LocalFirstRecord {
  meetingId: string;
  cellGroupId: string;
  fullName: string;
  phone?: string;
  followUpStatus: 'new' | 'contacted' | 'connected';
  createdBy?: string;
  operationId?: string;
}

export interface CellReportRecord extends LocalFirstRecord {
  meetingId: string;
  cellGroupId: string;
  highlights: string;
  challenges: string;
  reportStatus: 'pending_review' | 'approved' | 'rejected';
  submittedBy: string;
  submittedById?: string;
  attendanceCount: number;
  excusedCount?: number;
  absentCount?: number;
  visitorCount?: number;
  submittedAt?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  operationId?: string;
}

export type CellOperationCommand =
  | 'start_meeting'
  | 'mark_attendance'
  | 'add_visitor'
  | 'submit_report'
  | 'review_report';

export type TrainingOperationCommand = 'training_check_in';
export type OutboxCommand = CellOperationCommand | TrainingOperationCommand;

export interface OutboxRecord {
  id?: number;
  operationId: string;
  ownerId: string;
  command: OutboxCommand;
  entityId: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'processing' | 'failed';
  attempts: number;
  lastError?: string;
  nextAttemptAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TrainingRecord extends LocalFirstRecord {
  code?: string;
  title: string;
  description: string;
  schedule: string;
  status: 'upcoming' | 'ongoing' | 'completed';
  startDate?: string;
  endDate?: string;
  totalSessions?: number;
  requiredAttendanceRate?: number;
  maxEnrollment?: number;
  isDraft?: boolean;
  startTime?: string;
  lateGraceMinutes?: number;
  createdBy?: string;
}

export interface TrainingSessionRecord extends LocalFirstRecord {
  trainingId: string;
  sessionDate: string;     // YYYY-MM-DD
  location: string;
  sessionNumber?: number;
  isOccurred?: boolean;
  status?: 'scheduled' | 'completed' | 'cancelled';
  createdBy?: string;
}

export interface TrainingEnrollmentRecord extends LocalFirstRecord {
  trainingId: string;
  memberId: string;
  enrolledAt: string;
  status?: 'enrolled' | 'withdrawn' | 'completed';
  enrolledBy?: string;
}

export interface TrainingAttendanceRecord extends LocalFirstRecord {
  sessionId: string;
  memberId: string;
  scannedAt: string;
  timing?: 'on_time' | 'late';
  markedBy?: string;
  operationId?: string;
}

export interface TrainingCertificateRecord extends LocalFirstRecord {
  trainingId: string;
  memberId: string;
  issuedAt: string;
  verifiedBy: string;      // user name / localId
  status: 'pending' | 'verified';
  certificateNumber?: string;
  attendanceRate?: number;
  requestedBy?: string;
  verifiedById?: string;
  verifiedAt?: string;
}

export interface PrayerRequestRecord extends LocalFirstRecord {
  memberId: string;
  memberName: string;
  category: string;        // 'Healing' | 'Family' | 'Financial' | 'Guidance' | 'Other'
  content: string;
  isSensitive: boolean;    // true means accessible to clergy only
  urgency: 'low' | 'medium' | 'high';
  status: 'submitted' | 'assigned' | 'answered' | 'sealed';
  rhemaNotes?: string;     // divine words
}

export interface PrayerAssignmentRecord extends LocalFirstRecord {
  requestId: string;
  intercessorId: string;   // user's localId
  intercessorName: string;
  prayerCount: number;
  status: 'active' | 'completed';
}

export interface IntercessoryTeamRecord extends LocalFirstRecord {
  name: string;
  memberIds: string[];     // Array of localId values
}

export interface NotificationRecord {
  id?: number;
  localId: string;
  userId: string;          // user's localId (or 'all' for general announcements)
  type: 'report' | 'prayer' | 'certificate' | 'member' | 'announcement' | 'system';
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;       // ISO String
  actionUrl?: string;      // Tap navigation URL
}

export interface AuditLogRecord {
  id?: number;
  localId: string;
  userId: string;
  userName: string;
  action: string;
  details: string;
  createdAt: string;
}

export interface FeedbackRecord extends LocalFirstRecord {
  memberId: string;
  memberName: string;
  type: string;
  content: string;
}

export interface AppSettingsRecord {
  id?: number;
  key: string;
  value: any;
}


// ==========================================
// 2. Dexie Database Definition
// ==========================================

export class ChurchConnectDB extends Dexie {
  users!: Table<UserRecord, number>;
  members!: Table<MemberRecord, number>;
  departments!: Table<DepartmentRecord, number>;
  sections!: Table<SectionRecord, number>;
  cellGroups!: Table<CellGroupRecord, number>;
  cellMeetings!: Table<CellMeetingRecord, number>;
  cellAttendance!: Table<CellAttendanceRecord, number>;
  cellVisitors!: Table<CellVisitorRecord, number>;
  cellReports!: Table<CellReportRecord, number>;
  outbox!: Table<OutboxRecord, number>;
  trainings!: Table<TrainingRecord, number>;
  trainingSessions!: Table<TrainingSessionRecord, number>;
  trainingEnrollments!: Table<TrainingEnrollmentRecord, number>;
  trainingAttendance!: Table<TrainingAttendanceRecord, number>;
  trainingCertificates!: Table<TrainingCertificateRecord, number>;
  prayerRequests!: Table<PrayerRequestRecord, number>;
  prayerAssignments!: Table<PrayerAssignmentRecord, number>;
  intercessoryTeams!: Table<IntercessoryTeamRecord, number>;
  notifications!: Table<NotificationRecord, number>;
  auditLogs!: Table<AuditLogRecord, number>;
  feedback!: Table<FeedbackRecord, number>;
  appSettings!: Table<AppSettingsRecord, number>;

  constructor() {
    super('ChurchConnectDB');
    this.version(1).stores({
      users: '++id, localId, remoteId, email, role, cellGroupId, sectionId, departmentId',
      members: '++id, localId, remoteId, fullName, email, phone, role, cellGroupId, sectionId, qrCode, syncStatus',
      departments: '++id, localId, name, headId',
      sections: '++id, localId, name, pastorId',
      cellGroups: '++id, localId, name, leaderId, sectionId',
      cellMeetings: '++id, localId, cellGroupId, meetingDate, status, syncStatus',
      cellAttendance: '++id, localId, meetingId, memberId, status, syncStatus',
      cellReports: '++id, localId, meetingId, cellGroupId, reportStatus, syncStatus',
      trainings: '++id, localId, title, status',
      trainingSessions: '++id, localId, trainingId, sessionDate',
      trainingEnrollments: '++id, localId, trainingId, memberId',
      trainingAttendance: '++id, localId, sessionId, memberId, syncStatus',
      trainingCertificates: '++id, localId, trainingId, memberId, status',
      prayerRequests: '++id, localId, memberId, category, isSensitive, urgency, status, syncStatus',
      prayerAssignments: '++id, localId, requestId, intercessorId, status, syncStatus',
      intercessoryTeams: '++id, localId, name',
      notifications: '++id, localId, userId, type, isRead, createdAt',
      auditLogs: '++id, localId, userId, action, createdAt',
      feedback: '++id, localId, memberId, type, syncStatus',
      appSettings: '++id, &key'
    });

    this.version(2).stores({
      cellMeetings: '++id, localId, remoteId, cellGroupId, meetingDate, status, syncStatus, cacheOwnerId',
      cellAttendance: '++id, localId, remoteId, meetingId, memberId, visitorId, status, syncStatus, cacheOwnerId',
      cellVisitors: '++id, &localId, remoteId, meetingId, cellGroupId, fullName, followUpStatus, syncStatus, cacheOwnerId',
      cellReports: '++id, localId, remoteId, meetingId, cellGroupId, reportStatus, syncStatus, cacheOwnerId',
      outbox: '++id, &operationId, ownerId, command, entityId, status, nextAttemptAt, createdAt'
    });

    this.version(3).stores({
      trainings: '++id, localId, remoteId, code, title, status, isDraft, syncStatus, cacheOwnerId',
      trainingSessions: '++id, localId, remoteId, trainingId, sessionDate, sessionNumber, status, syncStatus, cacheOwnerId',
      trainingEnrollments: '++id, localId, remoteId, trainingId, memberId, status, syncStatus, cacheOwnerId',
      trainingAttendance: '++id, localId, remoteId, sessionId, memberId, timing, syncStatus, cacheOwnerId',
      trainingCertificates: '++id, localId, remoteId, trainingId, memberId, status, certificateNumber, syncStatus, cacheOwnerId'
    });
  }
}

export const db = new ChurchConnectDB();

// ==========================================
// 3. Helper Functions
// ==========================================

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'local_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now().toString(36);
}

/** PocketBase custom record ids must be exactly 15 lowercase alphanumeric characters. */
export function generatePocketBaseId(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(15);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join('');
}

export function createLocalRecord<T extends LocalFirstRecord>(fields: Omit<T, keyof LocalFirstRecord>): T {
  const now = new Date().toISOString();
  return {
    localId: generateUUID(),
    syncStatus: 'pending',
    createdAt: now,
    updatedAt: now,
    ...fields
  } as unknown as T;
}

/**
 * Upsert a row in appSettings by its unique `key` index.
 * appSettings uses an auto-increment primary key (`++id`) with `key` as a secondary
 * unique index, so a bare `db.appSettings.put({ key, value })` always INSERTS a new
 * row (Dexie's put() only upserts by primary key) — the second write for the same
 * key then violates the unique constraint on `key`. Look up the existing row's `id`
 * first so repeated writes correctly update in place.
 */
export async function putAppSetting(key: string, value: any): Promise<void> {
  const existing = await db.appSettings.where('key').equals(key).first();
  await db.appSettings.put({ id: existing?.id, key, value } as any);
}
