import { useCallback, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';
import { APP_ROLES, normalizeRoleId } from '../auth/roles';
import {
  db,
  generatePocketBaseId,
  type AnnouncementRecord
} from './churchConnectDB';
import { useAuth } from './PocketBaseProvider';

export interface AnnouncementView extends Omit<AnnouncementRecord, 'id'> {
  id: string;
  timestamp: string;
  createdAt: string;
  createdAtMs: number;
  updatedAt: string;
  scheduledDate?: string;
  scheduledTime?: string;
  expiryDate?: string;
  status: 'Active' | 'Scheduled' | 'Expired';
}

export interface AnnouncementFields {
  title: string;
  body: string;
  tag: AnnouncementRecord['tag'];
  pinned: boolean;
  eventDate?: string;
  eventTime?: string;
  eventLocation?: string;
  expiryDate?: string;
  scheduledDate?: string;
  scheduledTime?: string;
}

function expandedUser(record: RecordModel): RecordModel | undefined {
  const value = record.expand?.createdBy;
  return value && !Array.isArray(value) ? value : undefined;
}

function roleLabel(role: string): string {
  const roleId = normalizeRoleId(role);
  return APP_ROLES.find((item) => item.id === roleId)?.label || 'Church Leader';
}

function localDateParts(value: string): { date: string; time: string } | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return {
    date: `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`,
    time: `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`
  };
}

function mapAnnouncement(record: RecordModel, ownerId: string): AnnouncementRecord {
  const creator = expandedUser(record);
  return {
    localId: record.id,
    remoteId: record.id,
    title: record.title,
    body: record.body,
    author: typeof record.authorName === 'string' && record.authorName.trim()
      ? record.authorName
      : typeof creator?.name === 'string' && creator.name.trim() ? creator.name : 'Church Leadership',
    authorId: record.createdBy,
    roleLabel: roleLabel(typeof record.authorRole === 'string' ? record.authorRole : typeof creator?.role === 'string' ? creator.role : ''),
    tag: record.tag,
    pinned: Boolean(record.pinned),
    publishAt: record.publishAt,
    expiresAt: record.expiresAt || undefined,
    eventDate: record.eventDate ? String(record.eventDate).slice(0, 10) : undefined,
    eventTime: record.eventTime || undefined,
    eventLocation: record.eventLocation || undefined,
    backendStatus: record.status,
    syncStatus: 'synced',
    createdAt: record.created,
    updatedAt: record.updated,
    cacheOwnerId: ownerId
  };
}

function toView(record: AnnouncementRecord): AnnouncementView {
  const now = Date.now();
  const publish = localDateParts(record.publishAt);
  const expires = record.expiresAt ? localDateParts(record.expiresAt) : undefined;
  const publishMs = new Date(record.publishAt).getTime();
  const expiresMs = record.expiresAt ? new Date(record.expiresAt).getTime() : Number.POSITIVE_INFINITY;
  const status = publishMs > now ? 'Scheduled' : expiresMs <= now ? 'Expired' : 'Active';
  return {
    ...record,
    id: record.localId,
    timestamp: '',
    createdAtMs: new Date(record.createdAt).getTime(),
    scheduledDate: status === 'Scheduled' ? publish?.date : undefined,
    scheduledTime: status === 'Scheduled' ? publish?.time : undefined,
    expiryDate: expires?.date,
    status
  };
}

async function replaceCache(records: AnnouncementRecord[], ownerId: string): Promise<void> {
  const remoteIds = new Set(records.map((record) => record.localId));
  await db.transaction('rw', db.announcements, async () => {
    for (const cached of await db.announcements.toArray()) {
      if (cached.id && cached.cacheOwnerId === ownerId && !remoteIds.has(cached.localId)) {
        await db.announcements.delete(cached.id);
      }
    }
    for (const record of records) {
      const existing = await db.announcements.where('localId').equals(record.localId).first();
      await db.announcements.put({ ...record, id: existing?.id });
    }
  });
}

async function cacheConfirmed(record: AnnouncementRecord): Promise<void> {
  const existing = await db.announcements.where('localId').equals(record.localId).first();
  await db.announcements.put({ ...record, id: existing?.id });
}

export async function refreshAnnouncements(pb: PocketBase, ownerId: string): Promise<void> {
  const page = await pb.collection('announcements').getList(1, 200, {
    sort: '-pinned,-publishAt,-created',
    expand: 'createdBy'
  });
  const records = page.items
    .filter((item) => item.status !== 'archived')
    .map((item) => mapAnnouncement(item, ownerId));
  await replaceCache(records, ownerId);
}

function requireConnection(): void {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Managing announcements needs an internet connection. The feed remains available offline.');
  }
}

function dateTimeForPocketBase(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString();
}

function expiryForPocketBase(date?: string): string {
  return date ? new Date(`${date}T23:59:59.999`).toISOString() : '';
}

function eventDateForPocketBase(date?: string): string {
  return date ? `${date} 00:00:00.000Z` : '';
}

function messageFor(error: unknown): string {
  const status = (error as { status?: number })?.status || 0;
  const response = (error as { response?: { message?: string; data?: Record<string, { message?: string }> } })?.response;
  const fieldMessage = response?.data ? Object.values(response.data).find((item) => item?.message)?.message : undefined;
  if (status === 401 || status === 403) return 'Your account is not authorized to manage announcements.';
  if (status === 400) return fieldMessage || response?.message || 'PocketBase rejected these announcement details.';
  if (status === 404) return 'This announcement no longer exists. The feed has been refreshed.';
  if (status === 409) return 'This announcement changed elsewhere. Refresh it before editing again.';
  if (!status || status >= 500 || status === 408 || status === 429) return 'The announcement server is temporarily unreachable. Please try again.';
  return response?.message || 'The announcement action could not be completed.';
}

function payload(fields: AnnouncementFields, existing?: AnnouncementView) {
  const preservePublishedAt = existing && new Date(existing.publishAt).getTime() <= Date.now();
  return {
    title: fields.title.trim(),
    body: fields.body.trim(),
    tag: fields.tag,
    pinned: fields.pinned,
    eventDate: fields.tag === 'Event' ? eventDateForPocketBase(fields.eventDate) : '',
    eventTime: fields.tag === 'Event' ? fields.eventTime || '' : '',
    eventLocation: fields.tag === 'Event' ? fields.eventLocation?.trim() || '' : '',
    expiresAt: expiryForPocketBase(fields.expiryDate),
    publishAt: fields.scheduledDate
      ? dateTimeForPocketBase(fields.scheduledDate, fields.scheduledTime || '00:00')
      : preservePublishedAt ? existing.publishAt : new Date().toISOString(),
    status: 'published'
  };
}

export function useAnnouncementsData() {
  const { pb, user } = useAuth();
  const ownerId = user?.id || '';
  const rows = useLiveQuery(
    () => ownerId ? db.announcements.filter((item) => item.cacheOwnerId === ownerId).toArray() : [],
    [ownerId]
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!ownerId || !pb.authStore.isValid || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
    setIsRefreshing(true);
    try {
      await refreshAnnouncements(pb, ownerId);
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
    const releaseTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 60_000);
    let disposed = false;
    let stop: (() => void) | undefined;
    pb.collection('announcements').subscribe('*', () => void refresh())
      .then((unsubscribe) => { if (disposed) unsubscribe(); else stop = unsubscribe; })
      .catch(() => undefined);
    return () => {
      disposed = true;
      window.removeEventListener('online', onOnline);
      window.clearInterval(releaseTimer);
      stop?.();
    };
  }, [ownerId, pb, refresh]);

  const saveAnnouncement = useCallback(async (fields: AnnouncementFields, existing?: AnnouncementView) => {
    if (!user) throw new Error('Sign in to manage announcements.');
    requireConnection();
    if (existing) {
      const current = await pb.collection('announcements').getOne(existing.id);
      if (current.updated !== existing.updatedAt) {
        await refreshAnnouncements(pb, user.id);
        const conflict = new Error('This announcement changed elsewhere. Review the refreshed version before saving.');
        Object.assign(conflict, { status: 409 });
        throw conflict;
      }
      const record = await pb.collection('announcements').update(existing.id, payload(fields, existing), { expand: 'createdBy' });
      await cacheConfirmed(mapAnnouncement(record, user.id));
      return record;
    }
    const record = await pb.collection('announcements').create({
      id: generatePocketBaseId(),
      ...payload(fields),
      createdBy: user.id,
      authorName: user.name,
      authorRole: user.role
    }, { expand: 'createdBy' });
    await cacheConfirmed(mapAnnouncement(record, user.id));
    return record;
  }, [pb, user]);

  const archiveAnnouncement = useCallback(async (announcement: AnnouncementView) => {
    if (!user) throw new Error('Sign in to manage announcements.');
    requireConnection();
    await pb.collection('announcements').update(announcement.id, { status: 'archived' });
    await db.announcements.where('localId').equals(announcement.id).delete();
  }, [pb, user]);

  const setPinned = useCallback(async (announcement: AnnouncementView, pinned: boolean) => {
    if (!user) throw new Error('Sign in to manage announcements.');
    requireConnection();
    const record = await pb.collection('announcements').update(announcement.id, { pinned }, { expand: 'createdBy' });
    await cacheConfirmed(mapAnnouncement(record, user.id));
  }, [pb, user]);

  return {
    announcements: (rows || []).map(toView),
    isLoading: rows === undefined,
    isRefreshing,
    error,
    refresh,
    saveAnnouncement,
    archiveAnnouncement,
    setPinned,
    messageFor
  };
}
