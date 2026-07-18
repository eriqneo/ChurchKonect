import { processCellOutbox } from './cellOperations';
import { db, putAppSetting } from './churchConnectDB';
import { processTrainingOutbox } from './trainingData';
import { pb } from '../pocketbase/client';

export interface SyncProgress {
  status: 'idle' | 'syncing' | 'success' | 'failed';
  pendingCount: number;
  processedCount: number;
  message: string;
}

type SyncProgressCallback = (progress: SyncProgress) => void;

/**
 * Coordinates the real, module-owned outboxes. It never changes a domain row to
 * `synced`; only a successful PocketBase command in the owning processor may do that.
 */
class SyncEngine {
  private processing: { ownerId: string; promise: Promise<boolean> } | null = null;
  private listeners = new Set<SyncProgressCallback>();

  constructor() {
    if (typeof window === 'undefined') return;
    window.addEventListener('online', () => { void this.syncNow(); });
    window.addEventListener('offline', () => { void this.publishCurrent('failed', 'Offline mode active. Changes remain saved on this device.'); });
  }

  public isOnline(): boolean {
    return typeof navigator === 'undefined' || navigator.onLine;
  }

  public subscribe(callback: SyncProgressCallback): () => void {
    this.listeners.add(callback);
    void this.currentProgress().then(callback);
    return () => this.listeners.delete(callback);
  }

  public async getPendingCount(): Promise<number> {
    const ownerId = pb.authStore.record?.id;
    if (!ownerId) return 0;
    return db.outbox.where('ownerId').equals(ownerId)
      .filter((item) => item.status === 'pending' || item.status === 'processing')
      .count();
  }

  public syncNow(): Promise<boolean> {
    const ownerId = pb.authStore.record?.id || '';
    if (this.processing?.ownerId === ownerId) return this.processing.promise;
    const previous = this.processing?.promise;
    const run = () => this.run();
    const promise = previous ? previous.then(run, run) : run();
    this.processing = { ownerId, promise };
    void promise.finally(() => {
      if (this.processing?.promise === promise) this.processing = null;
    });
    return promise;
  }

  private async currentProgress(): Promise<SyncProgress> {
    const ownerId = pb.authStore.record?.id;
    if (!ownerId) return { status: 'idle', pendingCount: 0, processedCount: 0, message: 'Sign in to synchronize.' };
    const rows = await db.outbox.where('ownerId').equals(ownerId).toArray();
    const pendingCount = rows.filter((item) => item.status !== 'failed').length;
    const failedCount = rows.filter((item) => item.status === 'failed').length;
    if (!this.isOnline()) return { status: 'failed', pendingCount, processedCount: 0, message: 'Offline mode active. Changes remain saved on this device.' };
    if (failedCount) return { status: 'failed', pendingCount, processedCount: 0, message: `${failedCount} change${failedCount === 1 ? '' : 's'} need attention.` };
    return { status: 'idle', pendingCount, processedCount: 0, message: pendingCount ? `${pendingCount} change${pendingCount === 1 ? '' : 's'} waiting for PocketBase.` : 'All operational changes are acknowledged.' };
  }

  private broadcast(progress: SyncProgress): void {
    this.listeners.forEach((callback) => callback(progress));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('churchconnect_sync_progress', { detail: progress }));
    }
  }

  private async publishCurrent(status: SyncProgress['status'], message: string): Promise<void> {
    const current = await this.currentProgress();
    this.broadcast({ ...current, status, message });
  }

  private async run(): Promise<boolean> {
    const ownerId = pb.authStore.record?.id;
    if (!ownerId || !pb.authStore.isValid) {
      await this.publishCurrent('failed', 'Sign in again before synchronizing.');
      return false;
    }
    if (!this.isOnline()) {
      await this.publishCurrent('failed', 'Offline mode active. Changes remain saved on this device.');
      return false;
    }

    const before = await this.getPendingCount();
    this.broadcast({ status: 'syncing', pendingCount: before, processedCount: 0, message: before ? `Sending ${before} saved change${before === 1 ? '' : 's'} to PocketBase…` : 'Checking PocketBase acknowledgement state…' });

    try {
      await processCellOutbox(pb, ownerId);
      await processTrainingOutbox(pb, ownerId);
      const rows = await db.outbox.where('ownerId').equals(ownerId).toArray();
      const pendingCount = rows.filter((item) => item.status !== 'failed').length;
      const failedCount = rows.filter((item) => item.status === 'failed').length;
      const processedCount = Math.max(0, before - pendingCount);
      if (failedCount) {
        this.broadcast({ status: 'failed', pendingCount, processedCount, message: `${failedCount} change${failedCount === 1 ? '' : 's'} were rejected and need attention.` });
        return false;
      }
      if (pendingCount) {
        this.broadcast({ status: 'idle', pendingCount, processedCount, message: `${pendingCount} change${pendingCount === 1 ? '' : 's'} remain queued for retry.` });
        return false;
      }
      const acknowledgedAt = new Date().toISOString();
      await putAppSetting(`lastServerAck:${ownerId}`, acknowledgedAt);
      this.broadcast({ status: 'success', pendingCount: 0, processedCount, message: processedCount ? `${processedCount} change${processedCount === 1 ? '' : 's'} acknowledged by PocketBase.` : 'All operational changes are acknowledged.' });
      return true;
    } catch (error) {
      console.error('[Sync] PocketBase reconciliation failed:', error);
      await this.publishCurrent('failed', 'PocketBase could not confirm the queued changes. They remain saved on this device.');
      return false;
    }
  }
}

export const syncEngine = new SyncEngine();
