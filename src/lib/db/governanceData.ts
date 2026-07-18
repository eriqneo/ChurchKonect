import { useCallback, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';
import {
  db,
  generatePocketBaseId,
  type AuditLogRecord,
  type FeedbackRecord
} from './churchConnectDB';
import { useAuth } from './PocketBaseProvider';
import { recordAuditEvent } from './auditEvents';

export type FeedbackType = FeedbackRecord['type'];
export type FeedbackStatus = FeedbackRecord['status'];

const MANAGER_ROLES = new Set(['administrator', 'lead_pastor']);

function online(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine;
}

function messageFor(error: unknown): string {
  if (error instanceof Error && !(error as Error & { status?: number }).status) return error.message;
  const status = (error as { status?: number })?.status || 0;
  const response = (error as { response?: { message?: string; data?: Record<string, { message?: string }> } })?.response;
  const fieldMessage = response?.data ? Object.values(response.data).find((item) => item?.message)?.message : undefined;
  if (status === 401 || status === 403) return 'Your account is not authorized for this activity.';
  if (status === 400) return fieldMessage || response?.message || 'PocketBase rejected these details.';
  if (status === 404) return 'This request is no longer available. The list has been refreshed.';
  if (!status || status >= 500 || status === 408 || status === 429) return 'The support server is temporarily unreachable. Your text remains on this screen.';
  return response?.message || 'The request could not be completed.';
}

function mapAudit(record: RecordModel, cacheOwnerId: string): AuditLogRecord {
  return {
    localId: record.id,
    remoteId: record.id,
    userId: record.actor,
    userName: record.actorName,
    action: record.action,
    details: record.summary,
    entityType: record.entityType || undefined,
    entityId: record.entityId || undefined,
    source: 'client',
    operationId: record.operationId,
    cacheOwnerId,
    createdAt: record.occurredAt || record.created
  };
}

function mapFeedback(record: RecordModel, cacheOwnerId: string): FeedbackRecord {
  return {
    localId: record.id,
    remoteId: record.id,
    memberId: record.submitter,
    memberName: record.submitterName,
    type: record.type,
    content: record.content,
    status: record.status,
    response: record.response || undefined,
    assignedTo: record.assignedTo || undefined,
    reviewedAt: record.reviewedAt || undefined,
    syncStatus: 'synced',
    cacheOwnerId,
    createdAt: record.submittedAt || record.created,
    updatedAt: record.updated
  };
}

async function replaceAuditCache(records: AuditLogRecord[], ownerId: string): Promise<void> {
  await db.transaction('rw', db.auditLogs, async () => {
    await db.auditLogs.where('cacheOwnerId').equals(ownerId).delete();
    if (records.length) await db.auditLogs.bulkPut(records);
  });
}

async function replaceFeedbackCache(records: FeedbackRecord[], ownerId: string): Promise<void> {
  await db.transaction('rw', db.feedback, async () => {
    await db.feedback.where('cacheOwnerId').equals(ownerId).delete();
    if (records.length) await db.feedback.bulkPut(records);
  });
}

async function refreshGovernance(pb: PocketBase, ownerId: string): Promise<void> {
  const [feedbackPage, auditPage] = await Promise.all([
    pb.collection('feedback').getList(1, 100, { sort: '-submittedAt' }),
    pb.collection('audit_logs').getList(1, 100, { sort: '-occurredAt' })
  ]);
  await Promise.all([
    replaceFeedbackCache(feedbackPage.items.map((record) => mapFeedback(record, ownerId)), ownerId),
    replaceAuditCache(auditPage.items.map((record) => mapAudit(record, ownerId)), ownerId)
  ]);
}

export function useGovernanceData() {
  const { pb, user } = useAuth();
  const ownerId = user?.id || '';
  const isManager = Boolean(user && MANAGER_ROLES.has(user.role));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const feedback = useLiveQuery(
    () => ownerId ? db.feedback.where('cacheOwnerId').equals(ownerId).reverse().sortBy('createdAt') : [],
    [ownerId]
  ) || [];
  const auditLogs = useLiveQuery(
    () => ownerId ? db.auditLogs.where('cacheOwnerId').equals(ownerId).reverse().sortBy('createdAt') : [],
    [ownerId]
  ) || [];

  const refresh = useCallback(async () => {
    if (!ownerId || !pb.authStore.isValid || !online()) return;
    setIsRefreshing(true);
    try {
      await refreshGovernance(pb, ownerId);
      setError(null);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setIsRefreshing(false);
    }
  }, [ownerId, pb]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!ownerId) return;
    let disposed = false;
    const stops: Array<() => void> = [];
    const onOnline = () => void refresh();
    window.addEventListener('online', onOnline);
    Promise.allSettled(['feedback', 'audit_logs'].map((collection) =>
      pb.collection(collection).subscribe('*', () => void refresh())
    )).then((results) => {
      for (const result of results) {
        if (result.status !== 'fulfilled') continue;
        if (disposed) void result.value();
        else stops.push(result.value);
      }
    });
    return () => {
      disposed = true;
      window.removeEventListener('online', onOnline);
      stops.forEach((stop) => stop());
    };
  }, [ownerId, pb, refresh]);

  const submitFeedback = useCallback(async (type: FeedbackType, content: string) => {
    if (!user) throw new Error('Sign in to contact support.');
    if (!online()) throw new Error('Sending feedback needs an internet connection. Your text remains on this screen.');
    const cleanContent = content.trim();
    if (cleanContent.length < 10) throw new Error('Please add at least 10 characters so the team can understand the request.');
    const record = await pb.collection('feedback').create({
      id: generatePocketBaseId(),
      submitter: user.id,
      submitterName: user.name,
      type,
      content: cleanContent,
      status: 'new',
      response: '',
      assignedTo: ''
    });
    await refreshGovernance(pb, user.id);
    await recordAuditEvent(pb, user, {
      action: 'feedback_submitted',
      summary: `Submitted a ${type} request.`,
      entityType: 'feedback',
      entityId: record.id
    });
    await refreshGovernance(pb, user.id);
    return mapFeedback(record, user.id);
  }, [pb, user]);

  const reviewFeedback = useCallback(async (feedbackId: string, status: Exclude<FeedbackStatus, 'new'>, response: string) => {
    if (!user || !MANAGER_ROLES.has(user.role)) throw new Error('Only administrators and the Lead Pastor can review support requests.');
    if (!online()) throw new Error('Reviewing support requests needs an internet connection.');
    const record = await pb.collection('feedback').update(feedbackId, {
      status,
      response: response.trim(),
      assignedTo: user.id,
      reviewedAt: new Date().toISOString()
    });
    await recordAuditEvent(pb, user, {
      action: 'feedback_reviewed',
      summary: `Marked a ${record.type} request as ${status}.`,
      entityType: 'feedback',
      entityId: feedbackId
    });
    await refreshGovernance(pb, user.id);
    return mapFeedback(record, user.id);
  }, [pb, user]);

  return {
    feedback,
    auditLogs,
    isManager,
    isLoading: isRefreshing && feedback.length === 0 && auditLogs.length === 0,
    isRefreshing,
    error,
    refresh,
    submitFeedback,
    reviewFeedback,
    messageFor
  };
}
