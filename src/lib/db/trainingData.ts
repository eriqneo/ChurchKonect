import { useCallback, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';
import {
  db,
  generatePocketBaseId,
  type OutboxRecord,
  type TrainingAttendanceRecord,
  type TrainingCertificateRecord,
  type TrainingEnrollmentRecord,
  type TrainingRecord,
  type TrainingSessionRecord
} from './churchConnectDB';
import { useAuth } from './PocketBaseProvider';
import { recordAuditEvent } from './auditEvents';

let processingPromise: Promise<void> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function displayName(record: RecordModel, key: string): string {
  const expanded = record.expand?.[key];
  return expanded && !Array.isArray(expanded) && typeof expanded.name === 'string' ? expanded.name : '';
}

function mapTraining(record: RecordModel, ownerId: string): TrainingRecord {
  return {
    localId: record.id, remoteId: record.id, code: record.code, title: record.title,
    description: record.description || '', schedule: record.schedule || '',
    status: record.status === 'draft' ? 'upcoming' : record.status,
    startDate: record.startDate ? String(record.startDate).slice(0, 10) : '',
    endDate: record.endDate ? String(record.endDate).slice(0, 10) : '',
    totalSessions: Number(record.totalSessions || 0), requiredAttendanceRate: Number(record.requiredAttendanceRate || 80),
    maxEnrollment: Number(record.maxEnrollment || 0), isDraft: record.status === 'draft',
    startTime: record.startTime || '', lateGraceMinutes: Number(record.lateGraceMinutes || 0),
    createdBy: record.createdBy, syncStatus: 'synced', createdAt: record.created,
    updatedAt: record.updated, cacheOwnerId: ownerId
  };
}

function mapSession(record: RecordModel, ownerId: string): TrainingSessionRecord {
  return {
    localId: record.id, remoteId: record.id, trainingId: record.training,
    sessionNumber: Number(record.sessionNumber || 0), sessionDate: String(record.sessionDate).slice(0, 10),
    location: record.location || '', status: record.status,
    isOccurred: record.status === 'completed', createdBy: record.createdBy,
    syncStatus: 'synced', createdAt: record.created, updatedAt: record.updated, cacheOwnerId: ownerId
  };
}

function mapEnrollment(record: RecordModel, ownerId: string): TrainingEnrollmentRecord {
  return {
    localId: record.id, remoteId: record.id, trainingId: record.training, memberId: record.member,
    enrolledAt: record.enrolledAt, status: record.status, enrolledBy: record.enrolledBy,
    syncStatus: 'synced', createdAt: record.created, updatedAt: record.updated, cacheOwnerId: ownerId
  };
}

function mapAttendance(record: RecordModel, ownerId: string): TrainingAttendanceRecord {
  return {
    localId: record.id, remoteId: record.id, operationId: record.operationId,
    sessionId: record.session, memberId: record.member, scannedAt: record.scannedAt,
    timing: record.timing, markedBy: record.markedBy, syncStatus: 'synced',
    createdAt: record.created, updatedAt: record.updated, cacheOwnerId: ownerId
  };
}

function mapCertificate(record: RecordModel, ownerId: string): TrainingCertificateRecord {
  return {
    localId: record.id, remoteId: record.id, trainingId: record.training, memberId: record.member,
    certificateNumber: record.certificateNumber, status: record.status,
    attendanceRate: Number(record.attendanceRate || 0), issuedAt: record.issuedAt,
    requestedBy: record.requestedBy, verifiedById: record.verifiedBy || undefined,
    verifiedBy: displayName(record, 'verifiedBy') || record.verifiedBy || '',
    verifiedAt: record.verifiedAt || undefined, syncStatus: 'synced',
    createdAt: record.created, updatedAt: record.updated, cacheOwnerId: ownerId
  };
}

async function replaceSyncedCache<T extends { id?: number; localId: string; cacheOwnerId?: string; syncStatus: string }>(
  table: {
    toArray: () => Promise<T[]>;
    delete: (id: number) => Promise<void>;
    where: (index: string) => { equals: (value: string) => { first: () => Promise<T | undefined> } };
    put: (record: T) => Promise<unknown>;
  },
  records: T[],
  ownerId: string,
  preservePending = false
) {
  const remoteIds = new Set(records.map((record) => record.localId));
  for (const cached of await table.toArray()) {
    if (cached.id && cached.cacheOwnerId === ownerId && !remoteIds.has(cached.localId) && (!preservePending || cached.syncStatus === 'synced')) {
      await table.delete(cached.id);
    }
  }
  for (const record of records) {
    const existing = await table.where('localId').equals(record.localId).first();
    if (preservePending && existing && existing.syncStatus !== 'synced') continue;
    await table.put({ ...record, id: existing?.id });
  }
}

async function cacheConfirmed<T extends { id?: number; localId: string }>(
  table: { where: (index: string) => { equals: (value: string) => { first: () => Promise<T | undefined> } }; put: (record: T) => Promise<unknown> },
  record: T
) {
  const existing = await table.where('localId').equals(record.localId).first();
  await table.put({ ...record, id: existing?.id });
}

export async function refreshTrainingData(pb: PocketBase, ownerId: string): Promise<void> {
  const [trainingPage, sessionPage, enrollmentPage, attendancePage, certificatePage] = await Promise.all([
    pb.collection('trainings').getList(1, 200, { sort: 'startDate,title' }),
    pb.collection('training_sessions').getList(1, 200, { sort: 'sessionDate,sessionNumber' }),
    pb.collection('training_enrollments').getList(1, 200, { sort: '-enrolledAt' }),
    pb.collection('training_attendance').getList(1, 200, { sort: '-scannedAt' }),
    pb.collection('training_certificates').getList(1, 200, { sort: '-issuedAt', expand: 'verifiedBy' })
  ]);
  await db.transaction('rw', [db.trainings, db.trainingSessions, db.trainingEnrollments, db.trainingAttendance, db.trainingCertificates], async () => {
    await replaceSyncedCache(db.trainings, trainingPage.items.map((item) => mapTraining(item, ownerId)), ownerId);
    await replaceSyncedCache(db.trainingSessions, sessionPage.items.map((item) => mapSession(item, ownerId)), ownerId);
    await replaceSyncedCache(db.trainingEnrollments, enrollmentPage.items.map((item) => mapEnrollment(item, ownerId)), ownerId);
    await replaceSyncedCache(db.trainingAttendance, attendancePage.items.map((item) => mapAttendance(item, ownerId)), ownerId, true);
    await replaceSyncedCache(db.trainingCertificates, certificatePage.items.map((item) => mapCertificate(item, ownerId)), ownerId);
  });
}

function requireConnection() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('This action needs an internet connection. Your selections remain on this screen.');
  }
}

function dateForPocketBase(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value} 00:00:00.000Z` : value;
}

function localDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function messageFor(error: unknown): string {
  const status = (error as { status?: number })?.status || 0;
  const response = (error as { response?: { message?: string; data?: Record<string, { message?: string }> } })?.response;
  const fieldMessage = response?.data ? Object.values(response.data).find((item) => item?.message)?.message : undefined;
  if (status === 401 || status === 403) return 'Your account is not authorized for this Academy action.';
  if (status === 400) return fieldMessage || response?.message || 'PocketBase rejected these Academy details.';
  if (!status || status >= 500 || status === 408 || status === 429) return 'The Academy server is temporarily unreachable. Try again when the connection stabilizes.';
  return response?.message || 'The Academy action could not be completed.';
}

async function getOrCreateAttendance(pb: PocketBase, attendance: TrainingAttendanceRecord) {
  try { return await pb.collection('training_attendance').getOne(attendance.localId); } catch (error) {
    if ((error as { status?: number })?.status !== 404) throw error;
  }
  return pb.collection('training_attendance').create({
    id: attendance.localId, operationId: attendance.operationId,
    session: attendance.sessionId, member: attendance.memberId,
    scannedAt: attendance.scannedAt, timing: attendance.timing || 'on_time', markedBy: attendance.markedBy
  });
}

async function runAttendanceOutbox(pb: PocketBase, ownerId: string) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  await db.outbox.where('ownerId').equals(ownerId)
    .filter((item) => item.command === 'training_check_in' && item.status === 'processing')
    .modify({ status: 'pending' });
  const items = await db.outbox.where('ownerId').equals(ownerId)
    .filter((item) => item.command === 'training_check_in' && item.status === 'pending')
    .sortBy('createdAt');
  for (const item of items) {
    if (!item.id) continue;
    await db.outbox.update(item.id, { status: 'processing', attempts: item.attempts + 1, updatedAt: new Date().toISOString() });
    try {
      const attendance = item.payload.attendance as unknown as TrainingAttendanceRecord;
      await getOrCreateAttendance(pb, attendance);
      await db.trainingAttendance.where('localId').equals(attendance.localId).modify({
        remoteId: attendance.localId, syncStatus: 'synced', updatedAt: new Date().toISOString()
      });
      await db.outbox.delete(item.id);
    } catch (error) {
      const status = (error as { status?: number })?.status || 0;
      const transient = status === 0 || status === 401 || status === 408 || status === 429 || status >= 500;
      const delay = Math.min(30_000, 1000 * (2 ** Math.min(item.attempts, 5)));
      await db.outbox.update(item.id, {
        status: transient ? 'pending' : 'failed', lastError: messageFor(error),
        nextAttemptAt: transient ? new Date(Date.now() + delay).toISOString() : undefined,
        updatedAt: new Date().toISOString()
      });
      if (transient && status !== 401 && !retryTimer) {
        retryTimer = setTimeout(() => {
          retryTimer = null;
          if (pb.authStore.record?.id === ownerId) void processTrainingOutbox(pb, ownerId);
        }, delay);
      }
      break;
    }
  }
}

export function processTrainingOutbox(pb: PocketBase, ownerId: string): Promise<void> {
  if (!processingPromise) processingPromise = runAttendanceOutbox(pb, ownerId).finally(() => { processingPromise = null; });
  return processingPromise;
}

function attendanceOutbox(ownerId: string, attendance: TrainingAttendanceRecord): OutboxRecord {
  const now = new Date().toISOString();
  return {
    operationId: `training_check_in:${attendance.localId}`, ownerId, command: 'training_check_in',
    entityId: attendance.localId, payload: { attendance }, status: 'pending', attempts: 0,
    createdAt: now, updatedAt: now
  };
}

export function useTrainingData() {
  const { pb, user } = useAuth();
  const ownerId = user?.id || '';
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trainingRows = useLiveQuery(() => ownerId ? db.trainings.filter((item) => item.cacheOwnerId === ownerId).toArray() : [], [ownerId]);
  const sessionRows = useLiveQuery(() => ownerId ? db.trainingSessions.filter((item) => item.cacheOwnerId === ownerId).toArray() : [], [ownerId]);
  const enrollmentRows = useLiveQuery(() => ownerId ? db.trainingEnrollments.filter((item) => item.cacheOwnerId === ownerId).toArray() : [], [ownerId]);
  const attendanceRows = useLiveQuery(() => ownerId ? db.trainingAttendance.filter((item) => item.cacheOwnerId === ownerId).toArray() : [], [ownerId]);
  const certificateRows = useLiveQuery(() => ownerId ? db.trainingCertificates.filter((item) => item.cacheOwnerId === ownerId).toArray() : [], [ownerId]);
  const outboxRows = useLiveQuery(() => ownerId ? db.outbox.where('ownerId').equals(ownerId).filter((item) => item.command === 'training_check_in').toArray() : [], [ownerId]);

  const refresh = useCallback(async () => {
    if (!ownerId || !pb.authStore.isValid || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
    setIsRefreshing(true);
    try {
      await processTrainingOutbox(pb, ownerId);
      await refreshTrainingData(pb, ownerId);
      setError(null);
    } catch (refreshError) {
      setError(messageFor(refreshError));
    } finally {
      setIsRefreshing(false);
    }
  }, [ownerId, pb]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!ownerId) return;
    const onOnline = () => void refresh();
    window.addEventListener('online', onOnline);
    let disposed = false;
    const stops: Array<() => void> = [];
    Promise.all(['trainings', 'training_sessions', 'training_enrollments', 'training_attendance', 'training_certificates'].map((collection) =>
      pb.collection(collection).subscribe('*', () => void refresh())
    )).then((subscriptions) => {
      if (disposed) subscriptions.forEach((stop) => stop());
      else stops.push(...subscriptions);
    }).catch(() => undefined);
    return () => {
      disposed = true;
      window.removeEventListener('online', onOnline);
      stops.forEach((stop) => stop());
    };
  }, [ownerId, pb, refresh]);

  const saveCourse = useCallback(async (fields: {
    title: string; description: string; schedule: string; startDate: string; endDate: string;
    totalSessions: number; requiredAttendanceRate: number; maxEnrollment: number;
    startTime: string; lateGraceMinutes: number; isDraft: boolean;
  }) => {
    if (!user) throw new Error('Sign in to manage Academy courses.');
    requireConnection();
    const courseId = generatePocketBaseId();
    const codeStem = fields.title.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'COURSE';
    const course = await pb.collection('trainings').create({
      id: courseId, code: `${codeStem}-${courseId.slice(-5).toUpperCase()}`,
      title: fields.title.trim(), description: fields.description.trim(), schedule: fields.schedule.trim(),
      status: fields.isDraft ? 'draft' : 'ongoing', startDate: dateForPocketBase(fields.startDate),
      endDate: dateForPocketBase(fields.endDate), totalSessions: fields.totalSessions,
      requiredAttendanceRate: fields.requiredAttendanceRate, maxEnrollment: fields.maxEnrollment,
      startTime: fields.startTime, lateGraceMinutes: fields.lateGraceMinutes, createdBy: user.id
    });
    const start = new Date(`${fields.startDate}T12:00:00`);
    await cacheConfirmed(db.trainings, mapTraining(course, user.id));
    const sessionPayloads = Array.from({ length: fields.totalSessions }, (_, index) => {
      const sessionDate = new Date(start);
      sessionDate.setDate(start.getDate() + index * 7);
      return {
        id: generatePocketBaseId(), training: course.id, sessionNumber: index + 1,
        sessionDate: dateForPocketBase(localDate(sessionDate)), location: 'Cathedral Hall A',
        status: 'scheduled', createdBy: user.id
      };
    });
    for (let index = 0; index < sessionPayloads.length; index += 5) {
      const createdSessions = await Promise.all(sessionPayloads.slice(index, index + 5).map((payload) =>
        pb.collection('training_sessions').create(payload)
      ));
      await Promise.all(createdSessions.map((session) => cacheConfirmed(db.trainingSessions, mapSession(session, user.id))));
    }
    await recordAuditEvent(pb, user, {
      action: 'academy_course_created', summary: `Created Academy course “${course.title}”.`, entityType: 'training', entityId: course.id
    });
    await refreshTrainingData(pb, user.id).catch(() => undefined);
    return course;
  }, [pb, user]);

  const enrollMember = useCallback(async (trainingId: string, memberId: string) => {
    if (!user) throw new Error('Sign in to enroll in Academy courses.');
    requireConnection();
    const existing = await db.trainingEnrollments.where('trainingId').equals(trainingId)
      .filter((item) => item.cacheOwnerId === user.id && item.memberId === memberId && item.status !== 'withdrawn').first();
    if (existing) return existing;
    const now = new Date().toISOString();
    const record = await pb.collection('training_enrollments').create({
      id: generatePocketBaseId(), training: trainingId, member: memberId,
      status: 'enrolled', enrolledAt: now, enrolledBy: user.id
    });
    const mapped = mapEnrollment(record, user.id);
    await recordAuditEvent(pb, user, {
      action: 'academy_member_enrolled', summary: 'Enrolled a member in an Academy course.', entityType: 'training_enrollment', entityId: record.id
    });
    await cacheConfirmed(db.trainingEnrollments, mapped);
    await refreshTrainingData(pb, user.id).catch(() => undefined);
    return mapped;
  }, [pb, user]);

  const checkIn = useCallback(async (sessionId: string, memberId: string, timing: 'on_time' | 'late') => {
    if (!user) throw new Error('Sign in to record Academy attendance.');
    const existing = await db.trainingAttendance.where('sessionId').equals(sessionId)
      .filter((item) => item.cacheOwnerId === user.id && item.memberId === memberId).first();
    if (existing) return { record: existing, duplicate: true };
    const now = new Date().toISOString();
    const id = generatePocketBaseId();
    const record: TrainingAttendanceRecord = {
      localId: id, operationId: `training-attendance-${id}`, sessionId, memberId,
      scannedAt: now, timing, markedBy: user.id, syncStatus: 'pending',
      createdAt: now, updatedAt: now, cacheOwnerId: user.id
    };
    await db.transaction('rw', db.trainingAttendance, db.outbox, async () => {
      await db.trainingAttendance.add(record);
      await db.outbox.add(attendanceOutbox(user.id, record));
    });
    void processTrainingOutbox(pb, user.id);
    return { record, duplicate: false };
  }, [pb, user]);

  const setSessionOccurred = useCallback(async (sessionId: string, occurred: boolean) => {
    if (!user) throw new Error('Sign in to manage Academy sessions.');
    requireConnection();
    const record = await pb.collection('training_sessions').update(sessionId, { status: occurred ? 'completed' : 'scheduled' });
    await recordAuditEvent(pb, user, {
      action: 'academy_session_updated', summary: `Marked an Academy session as ${record.status}.`, entityType: 'training_session', entityId: sessionId
    });
    await cacheConfirmed(db.trainingSessions, mapSession(record, user.id));
    await refreshTrainingData(pb, user.id).catch(() => undefined);
  }, [pb, user]);

  const issueCertificate = useCallback(async (trainingId: string, memberId: string, attendanceRate: number) => {
    if (!user) throw new Error('Sign in to issue Academy certificates.');
    requireConnection();
    const id = generatePocketBaseId();
    const now = new Date().toISOString();
    const verified = user.role === 'lead_pastor';
    const record = await pb.collection('training_certificates').create({
      id, training: trainingId, member: memberId,
      certificateNumber: `CC-CERT-${new Date().getFullYear()}-${id.slice(-8).toUpperCase()}`,
      status: verified ? 'verified' : 'pending', attendanceRate, issuedAt: now,
      requestedBy: user.id, verifiedBy: verified ? user.id : '', verifiedAt: verified ? now : ''
    });
    await recordAuditEvent(pb, user, {
      action: 'academy_certificate_issued', summary: `Issued an Academy certificate request${verified ? ' and verified it' : ''}.`, entityType: 'training_certificate', entityId: record.id
    });
    await cacheConfirmed(db.trainingCertificates, mapCertificate(record, user.id));
    await refreshTrainingData(pb, user.id).catch(() => undefined);
    return record;
  }, [pb, user]);

  const verifyCertificate = useCallback(async (certificateId: string) => {
    if (!user) throw new Error('Sign in to verify Academy certificates.');
    requireConnection();
    const now = new Date().toISOString();
    const record = await pb.collection('training_certificates').update(certificateId, { status: 'verified', verifiedBy: user.id, verifiedAt: now }, { expand: 'verifiedBy' });
    await recordAuditEvent(pb, user, {
      action: 'academy_certificate_verified', summary: 'Verified an Academy certificate.', entityType: 'training_certificate', entityId: certificateId
    });
    await cacheConfirmed(db.trainingCertificates, mapCertificate(record, user.id));
    await refreshTrainingData(pb, user.id).catch(() => undefined);
  }, [pb, user]);

  const rows = outboxRows || [];
  return {
    courses: trainingRows || [], sessions: sessionRows || [], enrollments: enrollmentRows || [],
    attendance: attendanceRows || [], certificates: certificateRows || [],
    isLoading: [trainingRows, sessionRows, enrollmentRows, attendanceRows, certificateRows].some((value) => value === undefined),
    isRefreshing, pendingCount: rows.filter((item) => item.status !== 'failed').length,
    failedCount: rows.filter((item) => item.status === 'failed').length,
    error: rows.find((item) => item.status === 'failed')?.lastError || error,
    refresh, saveCourse, enrollMember, checkIn, setSessionOccurred, issueCertificate, verifyCertificate
  };
}
