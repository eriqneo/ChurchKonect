import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RecordModel } from 'pocketbase';
import { db, generatePocketBaseId, putAppSetting } from './churchConnectDB';
import { useAuth } from './PocketBaseProvider';
import type { AnnouncementView } from './announcementData';

export type CalendarExportMethod = 'ics' | 'google';

export interface CalendarEventExport {
  id: string;
  announcementId: string;
  method: CalendarExportMethod;
  announcementVersion: string;
  exportedAt: string;
}

function mapExport(record: RecordModel): CalendarEventExport {
  return {
    id: record.id,
    announcementId: record.announcement,
    method: record.method === 'google' ? 'google' : 'ics',
    announcementVersion: [
      record.titleSnapshot || '',
      record.bodySnapshot || '',
      String(record.eventDateSnapshot || '').slice(0, 10),
      record.eventTimeSnapshot || '',
      record.eventLocationSnapshot || ''
    ].join('\u001f'),
    exportedAt: record.updated || record.created
  };
}

function messageFor(error: unknown): string {
  const status = (error as { status?: number })?.status || 0;
  const response = (error as { response?: { message?: string; data?: Record<string, { message?: string }> } })?.response;
  const fieldMessage = response?.data ? Object.values(response.data).find((item) => item?.message)?.message : undefined;
  if (status === 401 || status === 403) return 'Your account cannot save this calendar export.';
  if (status === 400) return fieldMessage || 'This event is no longer eligible for calendar export tracking.';
  if (!status || status === 408 || status === 429 || status >= 500) return 'The calendar status could not sync. The calendar export itself is still available on this device.';
  return response?.message || 'The calendar export status could not be saved.';
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine;
}

export function isCurrentCalendarExport(item: CalendarEventExport | undefined, announcement: AnnouncementView): boolean {
  return Boolean(item && item.announcementVersion === calendarEventVersion(announcement));
}

export function calendarEventVersion(announcement: AnnouncementView): string {
  return [
    announcement.title,
    announcement.body,
    announcement.eventDate || '',
    announcement.eventTime || '',
    announcement.eventLocation || ''
  ].join('\u001f');
}

function calendarEventSnapshot(announcement: AnnouncementView) {
  return {
    titleSnapshot: announcement.title,
    bodySnapshot: announcement.body,
    eventDateSnapshot: announcement.eventDate || '',
    eventTimeSnapshot: announcement.eventTime || '',
    eventLocationSnapshot: announcement.eventLocation || ''
  };
}

export function useCalendarEventExports() {
  const { pb, user } = useAuth();
  const cacheKey = user ? `calendarExports:${user.id}` : '';
  const [items, setItems] = useState<CalendarEventExport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [savingAnnouncementId, setSavingAnnouncementId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const persistCache = useCallback(async (next: CalendarEventExport[]) => {
    if (cacheKey) await putAppSetting(cacheKey, next);
  }, [cacheKey]);

  const refresh = useCallback(async () => {
    if (!user || !pb.authStore.isValid || !isOnline()) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const records = await pb.collection('calendar_event_exports').getFullList({ sort: '-updated' });
      const next = records.map(mapExport);
      setItems(next);
      await persistCache(next);
      setError(null);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setIsLoading(false);
    }
  }, [pb, persistCache, user]);

  useEffect(() => {
    let cancelled = false;
    setItems([]);
    setError(null);
    setIsLoading(true);
    if (!cacheKey) {
      setIsLoading(false);
      return () => { cancelled = true; };
    }
    void db.appSettings.where('key').equals(cacheKey).first().then((cached) => {
      if (cancelled) return;
      if (Array.isArray(cached?.value)) setItems(cached.value as CalendarEventExport[]);
      return refresh();
    }).catch(() => { if (!cancelled) void refresh(); });
    return () => { cancelled = true; };
  }, [cacheKey, refresh]);

  useEffect(() => {
    if (!user) return;
    const onOnline = () => void refresh();
    window.addEventListener('online', onOnline);
    let disposed = false;
    let stop: (() => void) | undefined;
    pb.collection('calendar_event_exports').subscribe('*', () => void refresh())
      .then((unsubscribe) => { if (disposed) unsubscribe(); else stop = unsubscribe; })
      .catch(() => undefined);
    return () => {
      disposed = true;
      window.removeEventListener('online', onOnline);
      stop?.();
    };
  }, [pb, refresh, user]);

  const recordExport = useCallback(async (announcement: AnnouncementView, method: CalendarExportMethod) => {
    if (!user) throw new Error('Sign in to sync calendar export status.');
    if (!isOnline()) throw new Error('The event was exported on this device, but its status will not sync until you reconnect.');
    setSavingAnnouncementId(announcement.id);
    try {
      const existing = items.find((item) => item.announcementId === announcement.id);
      let saved: RecordModel;
      if (existing) {
        saved = await pb.collection('calendar_event_exports').update(existing.id, {
          method,
          ...calendarEventSnapshot(announcement)
        });
      } else {
        try {
          saved = await pb.collection('calendar_event_exports').create({
            id: generatePocketBaseId(),
            user: user.id,
            announcement: announcement.id,
            method,
            ...calendarEventSnapshot(announcement)
          });
        } catch (cause) {
          if ((cause as { status?: number })?.status !== 400) throw cause;
          const duplicate = await pb.collection('calendar_event_exports').getFirstListItem(`announcement = "${announcement.id}"`);
          saved = await pb.collection('calendar_event_exports').update(duplicate.id, {
            method,
            ...calendarEventSnapshot(announcement)
          });
        }
      }
      const mapped = mapExport(saved);
      const next = [mapped, ...items.filter((item) => item.announcementId !== announcement.id)];
      setItems(next);
      await persistCache(next);
      setError(null);
      return mapped;
    } catch (cause) {
      const friendly = cause instanceof Error && cause.message.startsWith('The event was exported')
        ? cause.message
        : messageFor(cause);
      setError(friendly);
      throw new Error(friendly);
    } finally {
      setSavingAnnouncementId('');
    }
  }, [items, pb, persistCache, user]);

  const byAnnouncementId = useMemo(
    () => Object.fromEntries(items.map((item) => [item.announcementId, item])),
    [items]
  );

  return { items, byAnnouncementId, isLoading, savingAnnouncementId, error, refresh, recordExport };
}
