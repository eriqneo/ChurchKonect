import { useCallback, useEffect, useMemo, useState } from 'react';
import type PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';
import { db, generatePocketBaseId } from './churchConnectDB';
import { useAuth } from './PocketBaseProvider';
import { recordAuditEvent } from './auditEvents';

export type PrayerStatus = 'submitted' | 'assigned' | 'answered' | 'sealed';
export type PrayerUrgency = 'low' | 'medium' | 'high';

export interface PrayerNoteView {
  id: string;
  text: string;
  timestamp: string;
  authorName: string;
}

export interface PrayerRequestView {
  localId: string;
  remoteId: string;
  memberId: string;
  memberName: string;
  category: string;
  content: string;
  isSensitive: boolean;
  isAnonymous: boolean;
  urgency: PrayerUrgency;
  status: PrayerStatus;
  prayersOfferedCount: number;
  assignedTo: string;
  assignedToId?: string;
  assignedIntercessorIds: string[];
  watchDuration: number;
  submitterAvatar: string;
  rhemaNotes: PrayerNoteView[];
  syncStatus: 'synced';
  createdAt: string;
  updatedAt: string;
}

export interface PrayerAssignmentView {
  localId: string;
  remoteId: string;
  requestId: string;
  intercessorId: string;
  intercessorName: string;
  prayerCount: number;
  status: 'active' | 'completed';
  assignedAt: string;
  syncStatus: 'synced';
  createdAt: string;
  updatedAt: string;
}

export interface IntercessorTarget {
  userId: string;
  name: string;
}

interface PrayerSnapshot {
  requests: PrayerRequestView[];
  assignments: PrayerAssignmentView[];
}

function statusFor(value: string): PrayerStatus {
  return value === 'archived' ? 'sealed' : value as PrayerStatus;
}

function displayTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

function messageFor(error: unknown): string {
  if (error instanceof Error && !(error as Error & { status?: number }).status) return error.message;
  const status = (error as { status?: number })?.status || 0;
  const response = (error as { response?: { message?: string; data?: Record<string, { message?: string }> } })?.response;
  const fieldMessage = response?.data ? Object.values(response.data).find((item) => item?.message)?.message : undefined;
  if (status === 401 || status === 403) return 'Your account is not authorized for this prayer action.';
  if (status === 400) return fieldMessage || response?.message || 'PocketBase rejected these prayer details.';
  if (status === 404) return 'This prayer request is no longer available to your account.';
  if (!status || status >= 500 || status === 408 || status === 429) return 'The prayer server is temporarily unreachable. Your text remains on this screen.';
  return response?.message || 'The prayer action could not be completed.';
}

function requireConnection(): void {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Prayer submission and shared prayer actions need an internet connection. Your text remains on this screen.');
  }
}

async function fetchSnapshot(pb: PocketBase, ownerId: string): Promise<PrayerSnapshot> {
  const [requestPage, assignmentPage, notePage, watchPage, outcomePage] = await Promise.all([
    pb.collection('prayer_requests').getList(1, 200, { sort: '-submittedAt' }),
    pb.collection('prayer_assignments').getList(1, 200, { sort: '-assignedAt' }),
    pb.collection('prayer_notes').getList(1, 200),
    pb.collection('prayer_watch_events').getList(1, 200, { sort: '-offeredAt' }),
    pb.collection('prayer_outcomes').getList(1, 200, { sort: '-reportedAt' })
  ]);

  const answeredRequestIds = new Set(outcomePage.items.map((item) => String(item.request)));
  const assignmentsByRequest = new Map<string, RecordModel[]>();
  for (const assignment of assignmentPage.items) {
    const list = assignmentsByRequest.get(assignment.request) || [];
    list.push(assignment);
    assignmentsByRequest.set(assignment.request, list);
  }
  const notesByRequest = new Map<string, PrayerNoteView[]>();
  const sortedNotes = [...notePage.items].sort((a, b) =>
    new Date(String(b.created || '')).getTime() - new Date(String(a.created || '')).getTime()
  );
  for (const note of sortedNotes) {
    const list = notesByRequest.get(note.request) || [];
    list.push({ id: note.id, text: note.text, timestamp: displayTimestamp(note.created), authorName: note.authorName });
    notesByRequest.set(note.request, list);
  }
  const counts = new Map<string, number>();
  for (const event of watchPage.items) counts.set(event.request, (counts.get(event.request) || 0) + 1);

  const requestViews = requestPage.items.map((record): PrayerRequestView => {
    const requestAssignments = assignmentsByRequest.get(record.id) || [];
    const activeAssignments = requestAssignments.filter((item) => item.status === 'active');
    const allAssignments = activeAssignments.length ? activeAssignments : requestAssignments;
    return {
      localId: record.id,
      remoteId: record.id,
      memberId: record.submitter === ownerId ? ownerId : '',
      memberName: record.displayName,
      category: record.category,
      content: record.content,
      isSensitive: Boolean(record.isAnonymous),
      isAnonymous: Boolean(record.isAnonymous),
      urgency: record.urgency,
      status: record.status === 'archived' ? 'sealed' : answeredRequestIds.has(record.id) ? 'answered' : statusFor(record.status),
      prayersOfferedCount: counts.get(record.id) || 0,
      assignedTo: allAssignments.map((item) => item.intercessorName).join(', '),
      assignedToId: allAssignments[0]?.intercessor || undefined,
      assignedIntercessorIds: Array.isArray(record.assignedIntercessors) ? record.assignedIntercessors : [],
      watchDuration: 0,
      submitterAvatar: record.displayAvatar || '??',
      rhemaNotes: notesByRequest.get(record.id) || [],
      syncStatus: 'synced',
      createdAt: record.submittedAt || record.created,
      updatedAt: record.updated
    };
  });

  const assignments = assignmentPage.items.map((record): PrayerAssignmentView => ({
    localId: record.id,
    remoteId: record.id,
    requestId: record.request,
    intercessorId: record.intercessor,
    intercessorName: record.intercessorName,
    prayerCount: counts.get(record.request) || 0,
    status: record.status,
    assignedAt: record.assignedAt,
    syncStatus: 'synced',
    createdAt: record.created,
    updatedAt: record.updated
  }));

  const knownRequestIds = new Set(requestViews.map((request) => request.localId));
  for (const assignment of assignmentPage.items) {
    if (knownRequestIds.has(assignment.request)) continue;
    const requestAssignments = assignmentsByRequest.get(assignment.request) || [];
    requestViews.push({
      localId: assignment.request,
      remoteId: assignment.request,
      memberId: '',
      memberName: assignment.requestDisplayName,
      category: assignment.requestCategory,
      content: assignment.requestContent,
      isSensitive: Boolean(assignment.requestIsAnonymous),
      isAnonymous: Boolean(assignment.requestIsAnonymous),
      urgency: assignment.requestUrgency,
      status: answeredRequestIds.has(assignment.request) ? 'answered' : 'assigned',
      prayersOfferedCount: counts.get(assignment.request) || 0,
      assignedTo: requestAssignments.map((item) => item.intercessorName).join(', '),
      assignedToId: requestAssignments[0]?.intercessor || undefined,
      assignedIntercessorIds: requestAssignments.map((item) => item.intercessor),
      watchDuration: 0,
      submitterAvatar: assignment.requestDisplayAvatar || '??',
      rhemaNotes: notesByRequest.get(assignment.request) || [],
      syncStatus: 'synced',
      createdAt: assignment.requestCreatedAt || assignment.created,
      updatedAt: assignment.updated
    });
    knownRequestIds.add(assignment.request);
  }

  return { requests: requestViews, assignments };
}

export function usePrayerData() {
  const { pb, user } = useAuth();
  const ownerId = user?.id || '';
  const [snapshot, setSnapshot] = useState<PrayerSnapshot>({ requests: [], assignments: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!ownerId || !pb.authStore.isValid || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      setIsLoading(false);
      return;
    }
    setIsRefreshing(true);
    try {
      setSnapshot(await fetchSnapshot(pb, ownerId));
      setError(null);
    } catch (refreshError) {
      setError(messageFor(refreshError));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [ownerId, pb]);

  useEffect(() => {
    // Prayer bodies from the old demo database are intentionally not retained.
    void db.transaction('rw', [db.prayerRequests, db.prayerAssignments], async () => {
      await Promise.all([db.prayerRequests.clear(), db.prayerAssignments.clear()]);
    });
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!ownerId) return;
    const onOnline = () => void refresh();
    window.addEventListener('online', onOnline);
    let disposed = false;
    const stops: Array<() => void> = [];
    Promise.all(['prayer_requests', 'prayer_assignments', 'prayer_notes', 'prayer_watch_events', 'prayer_outcomes'].map((collection) =>
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

  const run = useCallback(async <T,>(operation: () => Promise<T>): Promise<T> => {
    requireConnection();
    try {
      const result = await operation();
      await refresh();
      return result;
    } catch (operationError) {
      throw new Error(messageFor(operationError));
    }
  }, [refresh]);

  const submitPrayer = useCallback(async (category: string, content: string, isAnonymous: boolean) => {
    if (!user) throw new Error('Sign in to submit a prayer request.');
    return run(async () => {
      const requestId = generatePocketBaseId();
      const displayName = isAnonymous ? 'Anonymous Member' : user.name;
      const displayAvatar = isAnonymous ? '??' : user.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
      const request = await pb.collection('prayer_requests').create({
        id: requestId,
        submitter: user.id,
        displayName,
        displayAvatar,
        isAnonymous,
        category,
        content: content.trim(),
        urgency: 'low',
        status: 'submitted',
        assignedIntercessors: [],
        answeredAt: '',
        archivedAt: ''
      });
      await recordAuditEvent(pb, user, {
        action: 'prayer_submitted', summary: `Submitted a ${category} prayer request${isAnonymous ? ' anonymously' : ''}.`, entityType: 'prayer_request', entityId: request.id
      });
      return request;
    });
  }, [pb, run, user]);

  const assignPrayers = useCallback(async (requestIds: string[], intercessors: IntercessorTarget[]) => {
    if (!user) throw new Error('Sign in to assign prayer watches.');
    return run(async () => {
      for (const requestId of requestIds) {
        const request = await pb.collection('prayer_requests').getOne(requestId);
        const existingPage = await pb.collection('prayer_assignments').getList(1, 200, { filter: `request = "${requestId}"` });
        const existingUserIds = new Set(existingPage.items.map((item) => String(item.intercessor)));
        for (const intercessor of intercessors) {
          if (existingUserIds.has(intercessor.userId)) continue;
          await pb.collection('prayer_assignments').create({
            id: generatePocketBaseId(), request: requestId, intercessor: intercessor.userId,
            intercessorName: intercessor.name, status: 'active', assignedBy: user.id, assignedAt: new Date().toISOString(),
            requestCategory: request.category, requestContent: request.content,
            requestDisplayName: request.displayName, requestDisplayAvatar: request.displayAvatar,
            requestIsAnonymous: request.isAnonymous, requestUrgency: request.urgency,
            requestCreatedAt: request.submittedAt || new Date().toISOString()
          });
          existingUserIds.add(intercessor.userId);
        }
        const allAssignments = await pb.collection('prayer_assignments').getList(1, 200, { filter: `request = "${requestId}" && status = "active"` });
        await pb.collection('prayer_requests').update(requestId, {
          assignedIntercessors: allAssignments.items.map((item) => item.intercessor),
          status: 'assigned'
        });
      }
      await recordAuditEvent(pb, user, {
        action: 'prayers_assigned', summary: `Assigned ${requestIds.length} prayer request${requestIds.length === 1 ? '' : 's'} to ${intercessors.length} intercessor${intercessors.length === 1 ? '' : 's'}.`, entityType: 'prayer_request'
      });
    });
  }, [pb, run, user]);

  const setUrgency = useCallback((requestId: string, urgency: PrayerUrgency) => run(async () => {
    await pb.collection('prayer_requests').update(requestId, { urgency });
    const assignmentPage = await pb.collection('prayer_assignments').getList(1, 200, { filter: `request = "${requestId}" && status = "active"` });
    for (const assignment of assignmentPage.items) {
      await pb.collection('prayer_assignments').update(assignment.id, { requestUrgency: urgency });
    }
    if (user) await recordAuditEvent(pb, user, {
      action: 'prayer_urgency_changed', summary: `Changed a prayer request urgency to ${urgency}.`, entityType: 'prayer_request', entityId: requestId
    });
  }), [pb, run, user]);

  const archivePrayers = useCallback((requestIds: string[]) => run(async () => {
    for (const requestId of requestIds) {
      const activeAssignments = await pb.collection('prayer_assignments').getList(1, 200, { filter: `request = "${requestId}" && status = "active"` });
      for (const assignment of activeAssignments.items) {
        await pb.collection('prayer_assignments').update(assignment.id, { status: 'completed' });
      }
      await pb.collection('prayer_requests').update(requestId, { status: 'archived', archivedAt: new Date().toISOString() });
    }
    if (user) await recordAuditEvent(pb, user, {
      action: 'prayers_archived', summary: `Archived ${requestIds.length} prayer request${requestIds.length === 1 ? '' : 's'}.`, entityType: 'prayer_request'
    });
  }), [pb, run, user]);

  const incrementPrayer = useCallback((requestId: string) => {
    if (!user) return Promise.reject(new Error('Sign in to record a prayer watch.'));
    const id = generatePocketBaseId();
    return run(() => pb.collection('prayer_watch_events').create({
      id,
      operationId: `prayer-watch-${id}`,
      request: requestId,
      offeredBy: user.id,
      offeredAt: new Date().toISOString()
    }));
  }, [pb, run, user]);

  const addNote = useCallback((requestId: string, text: string) => {
    if (!user) return Promise.reject(new Error('Sign in to add an intercessory note.'));
    return run(() => pb.collection('prayer_notes').create({
      id: generatePocketBaseId(), request: requestId, author: user.id, authorName: user.name, text: text.trim()
    }));
  }, [pb, run, user]);

  const markAnswered = useCallback((requestId: string) => {
    if (!user) return Promise.reject(new Error('Sign in to complete a prayer watch.'));
    return run(async () => {
      const existingOutcome = await pb.collection('prayer_outcomes').getList(1, 1, { filter: `request = "${requestId}"` });
      if (!existingOutcome.items.length) {
        await pb.collection('prayer_outcomes').create({
          id: generatePocketBaseId(), request: requestId, reportedBy: user.id,
          reporterName: user.name, reportedAt: new Date().toISOString()
        });
      }
      const active = await pb.collection('prayer_assignments').getList(1, 200, { filter: `request = "${requestId}" && status = "active"` });
      for (const assignment of active.items) {
        if (user.role === 'administrator' || user.role === 'lead_pastor' || assignment.intercessor === user.id) {
          await pb.collection('prayer_assignments').update(assignment.id, { status: 'completed' });
        }
      }
      await recordAuditEvent(pb, user, {
        action: 'prayer_answered', summary: 'Recorded an answered prayer outcome.', entityType: 'prayer_request', entityId: requestId
      });
    });
  }, [pb, run, user]);

  return useMemo(() => ({
    requests: snapshot.requests,
    assignments: snapshot.assignments,
    isLoading,
    isRefreshing,
    error,
    refresh,
    submitPrayer,
    assignPrayers,
    setUrgency,
    archivePrayers,
    incrementPrayer,
    addNote,
    markAnswered
  }), [snapshot, isLoading, isRefreshing, error, refresh, submitPrayer, assignPrayers, setUrgency, archivePrayers, incrementPrayer, addNote, markAnswered]);
}
