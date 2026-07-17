import { useCallback, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';
import {
  db,
  generatePocketBaseId,
  putAppSetting,
  type CellAttendanceRecord,
  type CellMeetingRecord,
  type CellReportRecord,
  type CellVisitorRecord,
  type OutboxRecord
} from './churchConnectDB';
import { useAuth } from './PocketBaseProvider';

type AttendanceStatus = CellAttendanceRecord['status'];
type ReportStatus = CellReportRecord['reportStatus'];

interface StartMeetingPayload {
  meeting: CellMeetingRecord;
  attendance: CellAttendanceRecord[];
}

interface AttendancePayload { attendance: CellAttendanceRecord }
interface VisitorPayload { visitor: CellVisitorRecord; attendance: CellAttendanceRecord }
interface SubmitReportPayload { report: CellReportRecord; meetingId: string; endedAt: string }
interface ReviewReportPayload { reportId: string; reportStatus: 'approved' | 'rejected'; reviewedBy: string; reviewedAt: string; reviewNotes: string }

let processingPromise: Promise<void> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function expandedName(record: RecordModel, key: string): string | undefined {
  const expanded = record.expand?.[key];
  return expanded && !Array.isArray(expanded) && typeof expanded.name === 'string' ? expanded.name : undefined;
}

function mapMeeting(record: RecordModel, ownerId: string): CellMeetingRecord {
  return {
    localId: record.id, remoteId: record.id, operationId: record.operationId,
    cellGroupId: record.cellGroup, meetingDate: String(record.meetingDate).slice(0, 10),
    startedAt: record.startedAt, endedAt: record.endedAt || undefined,
    status: record.status, createdBy: record.createdBy, syncStatus: 'synced',
    createdAt: record.created, updatedAt: record.updated, cacheOwnerId: ownerId
  };
}

function mapAttendance(record: RecordModel, ownerId: string): CellAttendanceRecord {
  return {
    localId: record.id, remoteId: record.id, operationId: record.operationId,
    meetingId: record.meeting, memberId: record.member || undefined, visitorId: record.visitor || undefined,
    status: record.status, markedBy: record.markedBy, syncStatus: 'synced',
    createdAt: record.created, updatedAt: record.updated, cacheOwnerId: ownerId
  };
}

function mapVisitor(record: RecordModel, ownerId: string): CellVisitorRecord {
  return {
    localId: record.id, remoteId: record.id, operationId: record.operationId,
    meetingId: record.meeting, cellGroupId: record.cellGroup, fullName: record.fullName,
    phone: record.phone || '', followUpStatus: record.followUpStatus || 'new', createdBy: record.createdBy,
    syncStatus: 'synced', createdAt: record.created, updatedAt: record.updated, cacheOwnerId: ownerId
  };
}

function mapReport(record: RecordModel, ownerId: string): CellReportRecord {
  return {
    localId: record.id, remoteId: record.id, operationId: record.operationId,
    meetingId: record.meeting, cellGroupId: record.cellGroup, highlights: record.highlights,
    challenges: record.challenges || '', reportStatus: record.reportStatus,
    submittedBy: expandedName(record, 'submittedBy') || record.submittedBy,
    submittedById: record.submittedBy, submittedAt: record.submittedAt,
    attendanceCount: Number(record.attendanceCount || 0), excusedCount: Number(record.excusedCount || 0),
    absentCount: Number(record.absentCount || 0), visitorCount: Number(record.visitorCount || 0),
    reviewedBy: expandedName(record, 'reviewedBy') || record.reviewedBy || undefined,
    reviewedAt: record.reviewedAt || undefined, reviewNotes: record.reviewNotes || undefined,
    syncStatus: 'synced', createdAt: record.created, updatedAt: record.updated, cacheOwnerId: ownerId
  };
}

async function upsertCache<T extends { id?: number; localId: string; syncStatus: string }>(
  table: { where: (index: string) => { equals: (value: string) => { first: () => Promise<T | undefined> } }; put: (value: T) => Promise<unknown> },
  record: T
) {
  const existing = await table.where('localId').equals(record.localId).first();
  if (existing && existing.syncStatus !== 'synced') return;
  await table.put({ ...record, id: existing?.id });
}

export async function refreshCellOperations(pb: PocketBase, ownerId: string): Promise<void> {
  const options = { sort: '-created' };
  const [meetings, attendance, visitors, reports] = await Promise.all([
    pb.collection('cell_meetings').getList(1, 200, options),
    pb.collection('cell_attendance').getList(1, 200, options),
    pb.collection('cell_visitors').getList(1, 200, options),
    pb.collection('cell_reports').getList(1, 200, { ...options, expand: 'submittedBy,reviewedBy' })
  ]);
  await db.transaction('rw', db.cellMeetings, db.cellAttendance, db.cellVisitors, db.cellReports, async () => {
    for (const record of meetings.items) await upsertCache(db.cellMeetings, mapMeeting(record, ownerId));
    for (const record of attendance.items) await upsertCache(db.cellAttendance, mapAttendance(record, ownerId));
    for (const record of visitors.items) await upsertCache(db.cellVisitors, mapVisitor(record, ownerId));
    for (const record of reports.items) await upsertCache(db.cellReports, mapReport(record, ownerId));
  });
}

async function getOrCreate(pb: PocketBase, collection: string, id: string, payload: Record<string, unknown>) {
  try { return await pb.collection(collection).getOne(id); } catch (error) {
    if ((error as { status?: number })?.status !== 404) throw error;
  }
  return pb.collection(collection).create({ id, ...payload });
}

function meetingPayload(record: CellMeetingRecord) {
  return {
    operationId: record.operationId, cellGroup: record.cellGroupId,
    meetingDate: /^\d{4}-\d{2}-\d{2}$/.test(record.meetingDate) ? `${record.meetingDate} 00:00:00.000Z` : record.meetingDate,
    endedAt: record.endedAt || '', status: record.status, createdBy: record.createdBy
  };
}

function attendancePayload(record: CellAttendanceRecord) {
  return {
    operationId: record.operationId, meeting: record.meetingId,
    member: record.memberId || '', visitor: record.visitorId || '',
    status: record.status, markedBy: record.markedBy
  };
}

async function processCommand(pb: PocketBase, item: OutboxRecord): Promise<void> {
  if (item.command === 'start_meeting') {
    const payload = item.payload as unknown as StartMeetingPayload;
    await getOrCreate(pb, 'cell_meetings', payload.meeting.localId, meetingPayload(payload.meeting));
    for (const attendance of payload.attendance) {
      await getOrCreate(pb, 'cell_attendance', attendance.localId, attendancePayload(attendance));
    }
    await db.cellMeetings.where('localId').equals(payload.meeting.localId).modify({ syncStatus: 'synced', remoteId: payload.meeting.localId });
    for (const attendance of payload.attendance) {
      await db.cellAttendance.where('localId').equals(attendance.localId).modify({ syncStatus: 'synced', remoteId: attendance.localId });
    }
    return;
  }

  if (item.command === 'mark_attendance') {
    const { attendance } = item.payload as unknown as AttendancePayload;
    try {
      await pb.collection('cell_attendance').update(attendance.localId, attendancePayload(attendance));
    } catch (error) {
      if ((error as { status?: number })?.status !== 404) throw error;
      await getOrCreate(pb, 'cell_attendance', attendance.localId, attendancePayload(attendance));
    }
    await db.cellAttendance.where('localId').equals(attendance.localId).modify({ syncStatus: 'synced', remoteId: attendance.localId });
    return;
  }

  if (item.command === 'add_visitor') {
    const { visitor, attendance } = item.payload as unknown as VisitorPayload;
    await getOrCreate(pb, 'cell_visitors', visitor.localId, {
      operationId: visitor.operationId, meeting: visitor.meetingId, cellGroup: visitor.cellGroupId,
      fullName: visitor.fullName, phone: visitor.phone || '', followUpStatus: visitor.followUpStatus,
      createdBy: visitor.createdBy
    });
    await getOrCreate(pb, 'cell_attendance', attendance.localId, attendancePayload(attendance));
    await db.cellVisitors.where('localId').equals(visitor.localId).modify({ syncStatus: 'synced', remoteId: visitor.localId });
    await db.cellAttendance.where('localId').equals(attendance.localId).modify({ syncStatus: 'synced', remoteId: attendance.localId });
    return;
  }

  if (item.command === 'submit_report') {
    const { report, meetingId, endedAt } = item.payload as unknown as SubmitReportPayload;
    await getOrCreate(pb, 'cell_reports', report.localId, {
      operationId: report.operationId, meeting: report.meetingId, cellGroup: report.cellGroupId,
      highlights: report.highlights, challenges: report.challenges, reportStatus: 'pending_review',
      submittedBy: report.submittedById, submittedAt: report.submittedAt,
      attendanceCount: report.attendanceCount, excusedCount: report.excusedCount || 0,
      absentCount: report.absentCount || 0, visitorCount: report.visitorCount || 0
    });
    await pb.collection('cell_meetings').update(meetingId, { status: 'completed', endedAt });
    await db.cellReports.where('localId').equals(report.localId).modify({ syncStatus: 'synced', remoteId: report.localId });
    await db.cellMeetings.where('localId').equals(meetingId).modify({ syncStatus: 'synced', remoteId: meetingId });
    return;
  }

  const payload = item.payload as unknown as ReviewReportPayload;
  await pb.collection('cell_reports').update(payload.reportId, {
    reportStatus: payload.reportStatus, reviewedBy: payload.reviewedBy,
    reviewedAt: payload.reviewedAt, reviewNotes: payload.reviewNotes
  });
  await db.cellReports.where('localId').equals(payload.reportId).modify({ syncStatus: 'synced', remoteId: payload.reportId });
}

function friendlyError(error: unknown): string {
  const response = (error as { response?: { message?: string } })?.response;
  const status = (error as { status?: number })?.status;
  if (status === 401 || status === 403) return 'Sign in again or ask an administrator to verify your access.';
  if (status === 400) return response?.message || 'PocketBase rejected this record. Check its details.';
  if (!status || status >= 500 || status === 408 || status === 429) return 'Connection interrupted. This change remains saved on this device.';
  return response?.message || 'This change could not be synchronized.';
}

function isTransient(error: unknown): boolean {
  const status = (error as { status?: number })?.status || 0;
  return status === 0 || status === 401 || status === 408 || status === 429 || status >= 500;
}

async function runOutbox(pb: PocketBase, ownerId: string): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  const cellCommands = new Set(['start_meeting', 'mark_attendance', 'add_visitor', 'submit_report', 'review_report']);
  // A tab or app process may have closed after claiming an item. Reclaim it safely;
  // every server command below is idempotent.
  await db.outbox.where('ownerId').equals(ownerId)
    .filter((item) => item.status === 'processing' && cellCommands.has(item.command))
    .modify({ status: 'pending' });
  const items = await db.outbox.where('ownerId').equals(ownerId)
    .filter((item) => item.status === 'pending' && cellCommands.has(item.command))
    .sortBy('createdAt');
  for (const item of items) {
    if (!item.id) continue;
    await db.outbox.update(item.id, { status: 'processing', attempts: item.attempts + 1, updatedAt: new Date().toISOString() });
    try {
      await processCommand(pb, item);
      await db.outbox.delete(item.id);
    } catch (error) {
      const transient = isTransient(error);
      const status = (error as { status?: number })?.status || 0;
      const delay = Math.min(30_000, 1000 * (2 ** Math.min(item.attempts, 5)));
      await db.outbox.update(item.id, {
        status: transient ? 'pending' : 'failed', lastError: friendlyError(error),
        nextAttemptAt: transient ? new Date(Date.now() + delay).toISOString() : undefined,
        updatedAt: new Date().toISOString()
      });
      if (transient && status !== 401 && !retryTimer) {
        retryTimer = setTimeout(() => {
          retryTimer = null;
          if (pb.authStore.record?.id === ownerId) void processCellOutbox(pb, ownerId);
        }, delay);
      }
      break;
    }
  }
}

export function processCellOutbox(pb: PocketBase, ownerId: string): Promise<void> {
  if (!processingPromise) {
    processingPromise = runOutbox(pb, ownerId).finally(() => { processingPromise = null; });
  }
  return processingPromise;
}

function outboxRecord(ownerId: string, command: OutboxRecord['command'], entityId: string, payload: Record<string, unknown>): OutboxRecord {
  const now = new Date().toISOString();
  return { operationId: `${command}:${entityId}`, ownerId, command, entityId, payload, status: 'pending', attempts: 0, createdAt: now, updatedAt: now };
}

function localDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function useCellOperations() {
  const { pb, user } = useAuth();
  const ownerId = user?.id || '';
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const meetings = useLiveQuery(() => ownerId ? db.cellMeetings.filter((item) => item.cacheOwnerId === ownerId).toArray() : [], [ownerId]) || [];
  const attendance = useLiveQuery(() => ownerId ? db.cellAttendance.filter((item) => item.cacheOwnerId === ownerId).toArray() : [], [ownerId]) || [];
  const visitors = useLiveQuery(() => ownerId ? db.cellVisitors.filter((item) => item.cacheOwnerId === ownerId).toArray() : [], [ownerId]) || [];
  const reports = useLiveQuery(() => ownerId ? db.cellReports.filter((item) => item.cacheOwnerId === ownerId).toArray() : [], [ownerId]) || [];
  const outbox = useLiveQuery(() => ownerId ? db.outbox.where('ownerId').equals(ownerId).toArray() : [], [ownerId]) || [];

  const refresh = useCallback(async () => {
    if (!ownerId || !pb.authStore.isValid || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
    setIsRefreshing(true);
    try {
      await processCellOutbox(pb, ownerId);
      await refreshCellOperations(pb, ownerId);
      setError(null);
    } catch (refreshError) {
      setError(friendlyError(refreshError));
    } finally {
      setIsRefreshing(false);
    }
  }, [ownerId, pb]);

  useEffect(() => {
    if (!ownerId) return;
    void refresh();
    const onOnline = () => void refresh();
    window.addEventListener('online', onOnline);
    const unsubscribers = ['cell_meetings', 'cell_attendance', 'cell_visitors', 'cell_reports'].map((collection) =>
      pb.collection(collection).subscribe('*', () => void refresh()).catch(() => undefined)
    );
    return () => {
      window.removeEventListener('online', onOnline);
      void Promise.all(unsubscribers).then(() => Promise.all(['cell_meetings', 'cell_attendance', 'cell_visitors', 'cell_reports'].map((collection) => pb.collection(collection).unsubscribe('*'))));
    };
  }, [ownerId, pb, refresh]);

  const startMeeting = useCallback(async (cellGroupId: string, memberIds: string[]) => {
    if (!user) throw new Error('Sign in before starting a meeting.');
    const active = await db.cellMeetings.where('cellGroupId').equals(cellGroupId).filter((item) => item.cacheOwnerId === user.id && item.status === 'active').first();
    if (active) return active;
    const now = new Date().toISOString();
    const meetingId = generatePocketBaseId();
    const meeting: CellMeetingRecord = {
      localId: meetingId, operationId: `meeting-${meetingId}`, cellGroupId,
      meetingDate: localDateString(), startedAt: now, status: 'active', createdBy: user.id,
      syncStatus: 'pending', createdAt: now, updatedAt: now, cacheOwnerId: user.id
    };
    const attendanceRows = memberIds.map((memberId): CellAttendanceRecord => {
      const id = generatePocketBaseId();
      return {
        localId: id, operationId: `attendance-${id}`, meetingId, memberId, status: 'absent', markedBy: user.id,
        syncStatus: 'pending', createdAt: now, updatedAt: now, cacheOwnerId: user.id
      };
    });
    await db.transaction('rw', db.cellMeetings, db.cellAttendance, db.outbox, async () => {
      await db.cellMeetings.add(meeting);
      if (attendanceRows.length) await db.cellAttendance.bulkAdd(attendanceRows);
      await db.outbox.add(outboxRecord(user.id, 'start_meeting', meetingId, { meeting, attendance: attendanceRows }));
    });
    await putAppSetting(`meeting_timer_${meetingId}`, Date.now());
    void processCellOutbox(pb, user.id);
    return meeting;
  }, [pb, user]);

  const markAttendance = useCallback(async (meetingId: string, person: { memberId?: string; visitorId?: string }, status: AttendanceStatus) => {
    if (!user) throw new Error('Sign in before marking attendance.');
    let savedRecord: CellAttendanceRecord | undefined;
    await db.transaction('rw', db.cellAttendance, db.outbox, async () => {
      let record = await db.cellAttendance.where('meetingId').equals(meetingId).filter((item) =>
        person.memberId ? item.memberId === person.memberId : item.visitorId === person.visitorId
      ).first();
      const now = new Date().toISOString();
      if (!record) {
        const id = generatePocketBaseId();
        record = { localId: id, operationId: `attendance-${id}`, meetingId, ...person, status, markedBy: user.id, syncStatus: 'pending', createdAt: now, updatedAt: now, cacheOwnerId: user.id };
        await db.cellAttendance.add(record);
      } else if (record.id) {
        record = { ...record, status, markedBy: user.id, syncStatus: 'pending', updatedAt: now };
        await db.cellAttendance.put(record);
      }
      const queued = await db.outbox.where('operationId').equals(`mark_attendance:${record.localId}`).first();
      const next = outboxRecord(user.id, 'mark_attendance', record.localId, { attendance: record });
      if (queued?.id) await db.outbox.put({ ...next, id: queued.id, attempts: queued.attempts, createdAt: queued.createdAt });
      else await db.outbox.add(next);
      savedRecord = record;
    });
    if (!savedRecord) throw new Error('Attendance could not be saved on this device.');
    void processCellOutbox(pb, user.id);
    return savedRecord;
  }, [pb, user]);

  const addVisitor = useCallback(async (meetingId: string, cellGroupId: string, fullName: string, phone: string) => {
    if (!user) throw new Error('Sign in before adding a visitor.');
    const now = new Date().toISOString();
    const visitorId = generatePocketBaseId();
    const attendanceId = generatePocketBaseId();
    const visitor: CellVisitorRecord = {
      localId: visitorId, operationId: `visitor-${visitorId}`, meetingId, cellGroupId,
      fullName: fullName.trim(), phone: phone.trim(), followUpStatus: 'new', createdBy: user.id,
      syncStatus: 'pending', createdAt: now, updatedAt: now, cacheOwnerId: user.id
    };
    const visitorAttendance: CellAttendanceRecord = {
      localId: attendanceId, operationId: `attendance-${attendanceId}`, meetingId, visitorId,
      status: 'present', markedBy: user.id, syncStatus: 'pending', createdAt: now, updatedAt: now, cacheOwnerId: user.id
    };
    await db.transaction('rw', db.cellVisitors, db.cellAttendance, db.outbox, async () => {
      await db.cellVisitors.add(visitor);
      await db.cellAttendance.add(visitorAttendance);
      await db.outbox.add(outboxRecord(user.id, 'add_visitor', visitorId, { visitor, attendance: visitorAttendance }));
    });
    void processCellOutbox(pb, user.id);
    return visitor;
  }, [pb, user]);

  const submitReport = useCallback(async (input: {
    meetingId: string; cellGroupId: string; highlights: string; challenges: string;
    attendanceCount: number; excusedCount: number; absentCount: number; visitorCount: number;
  }) => {
    if (!user) throw new Error('Sign in before submitting a report.');
    const now = new Date().toISOString();
    const reportId = generatePocketBaseId();
    const report: CellReportRecord = {
      localId: reportId, operationId: `report-${reportId}`, meetingId: input.meetingId,
      cellGroupId: input.cellGroupId, highlights: input.highlights, challenges: input.challenges,
      reportStatus: 'pending_review', submittedBy: user.name, submittedById: user.id,
      attendanceCount: input.attendanceCount, excusedCount: input.excusedCount,
      absentCount: input.absentCount, visitorCount: input.visitorCount, submittedAt: now,
      syncStatus: 'pending', createdAt: now, updatedAt: now, cacheOwnerId: user.id
    };
    await db.transaction('rw', db.cellReports, db.cellMeetings, db.outbox, async () => {
      await db.cellReports.add(report);
      await db.cellMeetings.where('localId').equals(input.meetingId).modify({ status: 'completed', endedAt: now, syncStatus: 'pending', updatedAt: now });
      await db.outbox.add(outboxRecord(user.id, 'submit_report', reportId, { report, meetingId: input.meetingId, endedAt: now }));
    });
    await db.appSettings.where('key').equals(`meeting_timer_${input.meetingId}`).delete();
    void processCellOutbox(pb, user.id);
    return report;
  }, [pb, user]);

  const reviewReport = useCallback(async (reportId: string, reportStatus: Exclude<ReportStatus, 'pending_review'>, reviewNotes = '') => {
    if (!user) throw new Error('Sign in before reviewing a report.');
    const now = new Date().toISOString();
    const payload: ReviewReportPayload = { reportId, reportStatus, reviewedBy: user.id, reviewedAt: now, reviewNotes };
    await db.transaction('rw', db.cellReports, db.outbox, async () => {
      await db.cellReports.where('localId').equals(reportId).modify({ reportStatus, reviewedBy: user.name, reviewedAt: now, reviewNotes, syncStatus: 'pending', updatedAt: now });
      await db.outbox.add(outboxRecord(user.id, 'review_report', reportId, payload as unknown as Record<string, unknown>));
    });
    void processCellOutbox(pb, user.id);
  }, [pb, user]);

  return {
    meetings, attendance, visitors, reports, outbox, isRefreshing,
    error: outbox.find((item) => item.status === 'failed')?.lastError || error,
    pendingCount: outbox.filter((item) => item.status !== 'failed').length,
    failedCount: outbox.filter((item) => item.status === 'failed').length,
    refresh, startMeeting, markAttendance, addVisitor, submitReport, reviewReport
  };
}
