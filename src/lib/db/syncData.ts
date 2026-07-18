import { useCallback, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type OutboxRecord } from './churchConnectDB';
import { useAuth } from './PocketBaseProvider';
import { syncEngine, type SyncProgress } from './SyncEngine';

export function useOperationalSync() {
  const { user } = useAuth();
  const ownerId = user?.id || '';
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const [progress, setProgress] = useState<SyncProgress>({
    status: 'idle', pendingCount: 0, processedCount: 0, message: 'All operational changes are acknowledged.'
  });
  const outbox = useLiveQuery(
    () => ownerId ? db.outbox.where('ownerId').equals(ownerId).toArray() : [],
    [ownerId]
  ) || [];
  const lastAcknowledgedAt = useLiveQuery(async () => {
    if (!ownerId) return '';
    return (await db.appSettings.where('key').equals(`lastServerAck:${ownerId}`).first())?.value as string || '';
  }, [ownerId]) || '';

  useEffect(() => syncEngine.subscribe(setProgress), []);
  useEffect(() => {
    const onOnline = () => { setIsOnline(true); void syncEngine.syncNow(); };
    const onOffline = () => setIsOnline(false);
    const onSyncRequested = () => { void syncEngine.syncNow(); };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('churchconnect_sync_requested', onSyncRequested);
    setIsOnline(navigator.onLine);
    if (navigator.onLine && ownerId) void syncEngine.syncNow();
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('churchconnect_sync_requested', onSyncRequested);
    };
  }, [ownerId]);

  const retryFailed = useCallback(async () => {
    if (!ownerId) return false;
    await db.outbox.where('ownerId').equals(ownerId)
      .filter((item) => item.status === 'failed')
      .modify({ status: 'pending', lastError: undefined, nextAttemptAt: undefined, updatedAt: new Date().toISOString() });
    return syncEngine.syncNow();
  }, [ownerId]);

  const pending = outbox.filter((item) => item.status === 'pending' || item.status === 'processing');
  const failed = outbox.filter((item) => item.status === 'failed');
  const isSyncing = progress.status === 'syncing' || outbox.some((item) => item.status === 'processing');

  return {
    isOnline,
    isSyncing,
    pendingCount: pending.length,
    failedCount: failed.length,
    items: outbox as OutboxRecord[],
    lastAcknowledgedAt,
    message: failed[0]?.lastError || progress.message,
    syncNow: () => syncEngine.syncNow(),
    retryFailed
  };
}
