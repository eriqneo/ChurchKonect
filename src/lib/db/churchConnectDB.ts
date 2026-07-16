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
}

export interface SectionRecord extends LocalFirstRecord {
  name: string;
  pastorId: string;        // user's localId
}

export interface CellGroupRecord extends LocalFirstRecord {
  name: string;
  leaderId: string;        // user's localId
  sectionId: string;       // section's localId
  meetingDay?: string;     // e.g., 'Wednesday'
  meetingTime?: string;    // e.g., '19:00'
  location?: string;
  status?: 'Active' | 'Inactive';
}

export interface CellMeetingRecord extends LocalFirstRecord {
  cellGroupId: string;
  meetingDate: string;     // YYYY-MM-DD
  status: 'scheduled' | 'active' | 'completed';
}

export interface CellAttendanceRecord extends LocalFirstRecord {
  meetingId: string;
  memberId: string;
  status: 'present' | 'absent' | 'excused';
}

export interface CellReportRecord extends LocalFirstRecord {
  meetingId: string;
  cellGroupId: string;
  highlights: string;
  challenges: string;
  reportStatus: 'pending_review' | 'approved' | 'rejected';
  submittedBy: string;
  attendanceCount: number;
}

export interface TrainingRecord extends LocalFirstRecord {
  title: string;
  description: string;
  schedule: string;
  status: 'upcoming' | 'ongoing' | 'completed';
}

export interface TrainingSessionRecord extends LocalFirstRecord {
  trainingId: string;
  sessionDate: string;     // YYYY-MM-DD
  location: string;
}

export interface TrainingEnrollmentRecord extends LocalFirstRecord {
  trainingId: string;
  memberId: string;
  enrolledAt: string;
}

export interface TrainingAttendanceRecord extends LocalFirstRecord {
  sessionId: string;
  memberId: string;
  scannedAt: string;
}

export interface TrainingCertificateRecord extends LocalFirstRecord {
  trainingId: string;
  memberId: string;
  issuedAt: string;
  verifiedBy: string;      // user name / localId
  status: 'pending' | 'verified';
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
  cellReports!: Table<CellReportRecord, number>;
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
