import { useCallback, useEffect, useState } from 'react';
import type PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';
import { useAuth } from './PocketBaseProvider';
import { recordAuditEvent } from './auditEvents';
import { db, putAppSetting } from './churchConnectDB';

export type DirectoryVisibility = 'listed' | 'private';
export const DIRECTORY_VISIBILITY_CHANGED_EVENT = 'churchconnect_directory_visibility_changed';

function messageFor(error: unknown): string {
  const status = (error as { status?: number })?.status || 0;
  const response = (error as { response?: { message?: string; data?: Record<string, { message?: string }> } })?.response;
  const fieldMessage = response?.data ? Object.values(response.data).find((item) => item?.message)?.message : undefined;
  if (status === 401 || status === 403) return 'Your account is not authorized to change this preference.';
  if (status === 400) return fieldMessage || 'PocketBase rejected this privacy preference.';
  if (!status || status === 408 || status === 429 || status >= 500) return 'The preference server is temporarily unreachable. No privacy change was claimed.';
  return response?.message || 'The directory preference could not be saved.';
}

async function findPreference(pb: PocketBase, userId: string): Promise<RecordModel | null> {
  try {
    return await pb.collection('user_preferences').getFirstListItem(`user = "${userId}"`);
  } catch (error) {
    if ((error as { status?: number })?.status === 404) return null;
    throw error;
  }
}

export function useProfilePreferences() {
  const { pb, user } = useAuth();
  const cacheKey = user ? `profilePreferences:${user.id}` : '';
  const [recordId, setRecordId] = useState('');
  const [directoryVisibility, setDirectoryVisibilityState] = useState<DirectoryVisibility>('listed');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user || !pb.authStore.isValid || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const record = await findPreference(pb, user.id);
      setRecordId(record?.id || '');
      const visibility: DirectoryVisibility = record?.directoryVisibility === 'private' ? 'private' : 'listed';
      setDirectoryVisibilityState(visibility);
      await putAppSetting(cacheKey, { recordId: record?.id || '', directoryVisibility: visibility });
      setError(null);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setIsLoading(false);
    }
  }, [cacheKey, pb, user]);

  useEffect(() => {
    let cancelled = false;
    setRecordId('');
    setDirectoryVisibilityState('listed');
    setError(null);
    setIsLoading(true);
    if (!cacheKey) {
      setIsLoading(false);
      return () => { cancelled = true; };
    }
    void db.appSettings.where('key').equals(cacheKey).first().then((cached) => {
      if (cancelled) return;
      const value = cached?.value as { recordId?: string; directoryVisibility?: DirectoryVisibility } | undefined;
      if (value) {
        setRecordId(value.recordId || '');
        setDirectoryVisibilityState(value.directoryVisibility === 'private' ? 'private' : 'listed');
      }
      return refresh();
    }).catch(() => { if (!cancelled) void refresh(); });
    return () => { cancelled = true; };
  }, [cacheKey, refresh]);
  useEffect(() => {
    if (!user) return;
    let disposed = false;
    let stop: (() => void) | undefined;
    pb.collection('user_preferences').subscribe('*', () => void refresh())
      .then((unsubscribe) => { if (disposed) unsubscribe(); else stop = unsubscribe; })
      .catch(() => undefined);
    return () => { disposed = true; stop?.(); };
  }, [pb, refresh, user]);

  const setDirectoryVisibility = useCallback(async (visibility: DirectoryVisibility) => {
    if (!user) throw new Error('Sign in to change your directory preference.');
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      throw new Error('Connect to the internet to change your Saints Directory visibility.');
    }
    setIsSaving(true);
    try {
      let saved: RecordModel;
      if (recordId) {
        saved = await pb.collection('user_preferences').update(recordId, { directoryVisibility: visibility });
      } else {
        try {
          saved = await pb.collection('user_preferences').create({ user: user.id, directoryVisibility: visibility });
        } catch (cause) {
          if ((cause as { status?: number })?.status !== 400) throw cause;
          const existing = await findPreference(pb, user.id);
          if (!existing) throw cause;
          saved = await pb.collection('user_preferences').update(existing.id, { directoryVisibility: visibility });
        }
      }
      setRecordId(saved.id);
      setDirectoryVisibilityState(visibility);
      await putAppSetting(cacheKey, { recordId: saved.id, directoryVisibility: visibility });
      setError(null);
      await recordAuditEvent(pb, user, {
        action: 'directory_visibility_changed',
        summary: visibility === 'private' ? 'Removed profile from the Saints Directory.' : 'Listed profile in the Saints Directory.',
        entityType: 'user_preferences',
        entityId: saved.id
      });
      window.dispatchEvent(new CustomEvent(DIRECTORY_VISIBILITY_CHANGED_EVENT));
    } catch (cause) {
      const friendly = messageFor(cause);
      setError(friendly);
      throw new Error(friendly);
    } finally {
      setIsSaving(false);
    }
  }, [cacheKey, pb, recordId, user]);

  return { directoryVisibility, isLoading, isSaving, error, refresh, setDirectoryVisibility };
}
