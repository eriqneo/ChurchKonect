import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';
import { db, generatePocketBaseId, type NotificationRecord } from './churchConnectDB';
import { useAuth } from './PocketBaseProvider';

const SOURCE_COLLECTIONS = [
  'announcements',
  'prayer_assignments',
  'prayer_outcomes',
  'cell_reports',
  'training_certificates',
  'training_enrollments',
  'notification_receipts',
  'notification_reminders'
];
const FEED_COLLECTIONS = [
  'notification_announcements',
  'notification_prayer_assignments',
  'notification_prayer_outcomes',
  'notification_report_submissions',
  'notification_report_reviews',
  'notification_certificates',
  'notification_enrollments',
  'notification_report_reminders'
];

export async function sendCellReportReminder(
  pb: PocketBase,
  senderId: string,
  recipientId: string,
  cellGroupId: string,
  cellGroupName: string
): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Report reminders need an internet connection.');
  }
  const now = new Date();
  const day = now.getDay() || 7;
  now.setDate(now.getDate() - day + 1);
  const week = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  try {
    await pb.collection('notification_reminders').create({
      id: generatePocketBaseId(),
      recipient: recipientId,
      sender: senderId,
      eventType: 'cell_report_reminder',
      contextId: cellGroupId,
      contextLabel: cellGroupName,
      sourceKey: `cell-report:${cellGroupId}:${week}`
    });
  } catch (error) {
    if ((error as { status?: number })?.status === 400) {
      throw new Error('A reminder has already been sent to this leader for the current week.');
    }
    throw error;
  }
}

function messageFor(error: unknown): string {
  const status = (error as { status?: number })?.status || 0;
  if (status === 401 || status === 403) return 'Your account is not authorized to read these notifications.';
  if (!status || status >= 500 || status === 408 || status === 429) return 'The notification server is temporarily unreachable. Recent alerts remain available.';
  return (error as { message?: string })?.message || 'Notifications could not be refreshed.';
}

async function findReceipt(pb: PocketBase, notificationKey: string): Promise<RecordModel | null> {
  const result = await pb.collection('notification_receipts').getList(1, 1, {
    filter: `notificationKey = "${notificationKey}"`
  });
  return result.items[0] ?? null;
}

async function syncReceipt(pb: PocketBase, userId: string, notification: NotificationRecord): Promise<string> {
  const payload = {
    recipient: userId,
    notificationKey: notification.localId,
    isRead: notification.isRead,
    dismissed: Boolean(notification.dismissed),
    readAt: notification.isRead ? new Date().toISOString() : '',
    dismissedAt: notification.dismissed ? new Date().toISOString() : ''
  };
  const existing = await findReceipt(pb, notification.localId);
  if (existing) {
    const saved = await pb.collection('notification_receipts').update(existing.id, payload);
    return saved.id;
  }
  try {
    const saved = await pb.collection('notification_receipts').create({ id: generatePocketBaseId(), ...payload });
    return saved.id;
  } catch (error) {
    const raced = await findReceipt(pb, notification.localId);
    if (!raced) throw error;
    const saved = await pb.collection('notification_receipts').update(raced.id, payload);
    return saved.id;
  }
}

async function flushPendingReceipts(pb: PocketBase, userId: string): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  const pending = await db.notifications
    .where('cacheOwnerId').equals(userId)
    .filter((item) => item.receiptSyncStatus === 'pending')
    .toArray();
  for (const item of pending) {
    try {
      const remoteReceiptId = await syncReceipt(pb, userId, item);
      await db.notifications.where('localId').equals(item.localId).modify({ remoteReceiptId, receiptSyncStatus: 'synced' });
    } catch {
      // Keep the local receipt pending. The next reconnect/refresh retries it.
    }
  }
}

async function refreshNotifications(pb: PocketBase, userId: string): Promise<void> {
  await flushPendingReceipts(pb, userId);
  const [feedPages, receipts, pending] = await Promise.all([
    Promise.all(FEED_COLLECTIONS.map((collection) => pb.collection(collection).getList(1, 100, { sort: '-eventAt' }))),
    pb.collection('notification_receipts').getList(1, 200, { sort: '-updatedAt' }),
    db.notifications.where('cacheOwnerId').equals(userId).filter((item) => item.receiptSyncStatus === 'pending').toArray()
  ]);
  const receiptsByKey = new Map(receipts.items.map((item) => [String(item.notificationKey), item]));
  const pendingByKey = new Map(pending.map((item) => [item.localId, item]));
  const feed = feedPages.flatMap((page) => page.items).sort((a, b) => String(b.eventAt).localeCompare(String(a.eventAt))).slice(0, 100);
  const rows = feed.map((item): NotificationRecord => {
    const receipt = receiptsByKey.get(item.id);
    const localPending = pendingByKey.get(item.id);
    return {
      localId: item.id,
      userId,
      type: item.type,
      title: item.title,
      message: item.message,
      actionUrl: item.actionUrl || undefined,
      createdAt: item.eventAt,
      isRead: localPending?.isRead ?? Boolean(receipt?.isRead),
      dismissed: localPending?.dismissed ?? Boolean(receipt?.dismissed),
      cacheOwnerId: userId,
      remoteReceiptId: receipt?.id || localPending?.remoteReceiptId,
      receiptSyncStatus: localPending ? 'pending' : 'synced'
    };
  });

  await db.transaction('rw', db.notifications, async () => {
    await db.notifications.where('cacheOwnerId').equals(userId).delete();
    if (rows.length) await db.notifications.bulkPut(rows);
  });
}

export function useNotifications() {
  const { pb, user } = useAuth();
  const ownerId = user?.id || '';
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cached = useLiveQuery(async () => {
    if (!ownerId) return [];
    const records = await db.notifications.where('cacheOwnerId').equals(ownerId).toArray();
    return records
      .filter((item) => !item.dismissed)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [ownerId]) || [];

  const refresh = useCallback(async () => {
    if (!ownerId || !pb.authStore.isValid || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      setIsLoading(false);
      return;
    }
    setIsRefreshing(true);
    try {
      await refreshNotifications(pb, ownerId);
      setError(null);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setIsRefreshing(false);
      setIsLoading(false);
    }
  }, [ownerId, pb]);

  useEffect(() => {
    setIsLoading(true);
    void db.notifications.filter((item) => !item.cacheOwnerId).delete();
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!ownerId) return;
    let disposed = false;
    const stops: Array<() => void> = [];
    const onOnline = () => void refresh();
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    const releaseTimer = window.setInterval(() => void refresh(), 60_000);
    Promise.allSettled(SOURCE_COLLECTIONS.map((collection) =>
      pb.collection(collection).subscribe('*', () => void refresh())
    )).then((results) => {
      for (const result of results) {
        if (result.status !== 'fulfilled') continue;
        const stop = () => { void result.value(); };
        if (disposed) stop();
        else stops.push(stop);
      }
    });
    return () => {
      disposed = true;
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(releaseTimer);
      stops.forEach((stop) => stop());
    };
  }, [ownerId, pb, refresh]);

  const persistState = useCallback(async (localId: string, changes: Pick<NotificationRecord, 'isRead' | 'dismissed'>) => {
    if (!ownerId) return;
    await db.notifications.where('localId').equals(localId).modify({ ...changes, receiptSyncStatus: 'pending' });
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      const current = await db.notifications.where('localId').equals(localId).first();
      if (current) {
        try {
          const remoteReceiptId = await syncReceipt(pb, ownerId, current);
          await db.notifications.where('localId').equals(localId).modify({ remoteReceiptId, receiptSyncStatus: 'synced' });
        } catch (cause) {
          setError(messageFor(cause));
        }
      }
    }
  }, [ownerId, pb]);

  const markRead = useCallback(async (localId: string) => {
    const current = await db.notifications.where('localId').equals(localId).first();
    if (!current || current.isRead) return;
    await persistState(localId, { isRead: true, dismissed: Boolean(current.dismissed) });
  }, [persistState]);

  const dismiss = useCallback(async (localId: string) => {
    const current = await db.notifications.where('localId').equals(localId).first();
    if (!current) return;
    await persistState(localId, { isRead: true, dismissed: true });
  }, [persistState]);

  const markAllRead = useCallback(async () => {
    const unread = cached.filter((item) => !item.isRead);
    await db.transaction('rw', db.notifications, async () => {
      for (const item of unread) {
        await db.notifications.where('localId').equals(item.localId).modify({
          isRead: true, dismissed: false, receiptSyncStatus: 'pending'
        });
      }
    });
    if (ownerId && (typeof navigator === 'undefined' || navigator.onLine)) {
      await flushPendingReceipts(pb, ownerId);
    }
  }, [cached, ownerId, pb]);

  return useMemo(() => ({
    notifications: cached,
    unreadCount: cached.filter((item) => !item.isRead).length,
    isLoading,
    isRefreshing,
    error,
    refresh,
    markRead,
    markAllRead,
    dismiss
  }), [cached, isLoading, isRefreshing, error, refresh, markRead, markAllRead, dismiss]);
}
