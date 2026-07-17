import { db, putAppSetting } from './churchConnectDB';

export interface SyncProgress {
  status: 'idle' | 'syncing' | 'success' | 'failed';
  pendingCount: number;
  processedCount: number;
  message: string;
}

type SyncProgressCallback = (progress: SyncProgress) => void;

class SyncEngine {
  private isSyncing = false;
  private listeners: Set<SyncProgressCallback> = new Set();
  private onlineStatus = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private backoffDelay = 1000; // start with 1s backoff for failures

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.handleConnectionChange(true));
      window.addEventListener('offline', () => this.handleConnectionChange(false));
    }
  }

  private handleConnectionChange(isOnline: boolean) {
    this.onlineStatus = isOnline;
    console.log(`[SyncEngine] Network connection status: ${isOnline ? 'ONLINE' : 'OFFLINE'}`);
    this.broadcastProgress({
      status: isOnline ? 'idle' : 'failed',
      pendingCount: 0,
      processedCount: 0,
      message: isOnline ? 'Back online. Ready to synchronize.' : 'Offline mode active. Edits saved locally.'
    });

    if (isOnline) {
      // Trigger sync automatically when reconnected
      this.syncNow().catch(console.error);
    }
  }

  public isOnline(): boolean {
    return this.onlineStatus;
  }

  public subscribe(callback: SyncProgressCallback) {
    this.listeners.add(callback);
    // Initial callback
    this.getPendingCount().then((pending) => {
      callback({
        status: this.isSyncing ? 'syncing' : 'idle',
        pendingCount: pending,
        processedCount: 0,
        message: this.isOnline() ? 'Ready' : 'Offline Mode'
      });
    });
    return () => {
      this.listeners.delete(callback);
    };
  }

  private broadcastProgress(progress: SyncProgress) {
    this.listeners.forEach((cb) => cb(progress));
    // Also trigger custom event for easy access without hook subscription
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('churchconnect_sync_progress', { detail: progress });
      window.dispatchEvent(event);
    }
  }

  public async getPendingCount(): Promise<number> {
    let total = 0;
    try {
      // Tables that track syncStatus
      const syncableTables = [
        db.members,
        db.prayerRequests,
        db.prayerAssignments,
        db.feedback
      ];

      for (const table of syncableTables) {
        // Dexie query for pending or failed
        const pending = await table.where('syncStatus').equals('pending').count();
        const failed = await table.where('syncStatus').equals('failed').count();
        total += (pending + failed);
      }
    } catch (e) {
      console.error('[SyncEngine] Failed counting pending:', e);
    }
    return total;
  }

  public async syncNow(): Promise<boolean> {
    if (this.isSyncing) return false;
    if (!this.onlineStatus) {
      this.broadcastProgress({
        status: 'failed',
        pendingCount: await this.getPendingCount(),
        processedCount: 0,
        message: 'Sync failed: Device is offline.'
      });
      return false;
    }

    this.isSyncing = true;
    const pendingTotal = await this.getPendingCount();

    if (pendingTotal === 0) {
      this.isSyncing = false;
      this.broadcastProgress({
        status: 'success',
        pendingCount: 0,
        processedCount: 0,
        message: 'All records synchronized.'
      });
      return true;
    }

    this.broadcastProgress({
      status: 'syncing',
      pendingCount: pendingTotal,
      processedCount: 0,
      message: `Syncing ${pendingTotal} pending logs...`
    });

    try {
      const tablesToSync = [
        { table: db.members, name: 'Members' },
        { table: db.prayerRequests, name: 'Prayer Requests' },
        { table: db.prayerAssignments, name: 'Prayer Assignments' },
        { table: db.feedback, name: 'Feedback' }
      ];

      let processed = 0;

      for (const { table, name } of tablesToSync) {
        // Fetch both 'pending' and 'failed'
        const pendingRecords = await table
          .where('syncStatus')
          .anyOf(['pending', 'failed'])
          .toArray();

        if (pendingRecords.length === 0) continue;

        console.log(`[SyncEngine] Uploading ${pendingRecords.length} records for ${name}`);

        // Simulate realistic network batch upload delay of 120ms per record
        await new Promise((resolve) => setTimeout(resolve, Math.min(600, pendingRecords.length * 100)));

        // Update each record state in local db to 'synced'
        const nowStr = new Date().toISOString();
        for (const record of pendingRecords) {
          if (record.id) {
            await table.update(record.id, {
              syncStatus: 'synced',
              updatedAt: nowStr
            });
            processed++;
            this.broadcastProgress({
              status: 'syncing',
              pendingCount: pendingTotal,
              processedCount: processed,
              message: `Synchronized ${processed}/${pendingTotal} items...`
            });
          }
        }
      }

      // Reset exponential backoff on success
      this.backoffDelay = 1000;
      this.isSyncing = false;

      // Track last sync time in settings
      const syncTime = new Date().toISOString();
      await putAppSetting('lastSyncTime', syncTime);

      this.broadcastProgress({
        status: 'success',
        pendingCount: 0,
        processedCount: pendingTotal,
        message: `Synchronization complete. ${pendingTotal} records uploaded.`
      });

      return true;
    } catch (error) {
      console.error('[SyncEngine] Sync failed:', error);
      this.isSyncing = false;

      this.broadcastProgress({
        status: 'failed',
        pendingCount: await this.getPendingCount(),
        processedCount: 0,
        message: 'Synchronization failed. Retrying in background.'
      });

      // Exponential backoff retry
      setTimeout(() => {
        this.backoffDelay = Math.min(60000, this.backoffDelay * 2);
        this.syncNow().catch(console.error);
      }, this.backoffDelay);

      return false;
    }
  }
}

export const syncEngine = new SyncEngine();
