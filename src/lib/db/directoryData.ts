import { useCallback, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';
import {
  db,
  type DirectoryCountRecord,
  type DirectoryMemberRecord
} from './churchConnectDB';
import { useAuth } from './PocketBaseProvider';
import { DIRECTORY_VISIBILITY_CHANGED_EVENT } from './profilePreferencesData';

const PAGE_SIZE = 100;

function departmentsFor(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value !== 'string' || !value.trim()) return [];
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function mapMember(record: RecordModel, ownerId: string): DirectoryMemberRecord {
  return {
    localId: record.id,
    userId: record.userId || undefined,
    fullName: record.fullName,
    role: record.role || 'member',
    avatarText: record.avatarText || '',
    cellGroupId: record.cellGroup || undefined,
    cellGroupName: record.cellGroupName || undefined,
    sectionId: record.section || undefined,
    sectionName: record.sectionName || undefined,
    departments: departmentsFor(record.departmentNames),
    cacheOwnerId: ownerId
  };
}

function mapCount(record: RecordModel, ownerId: string): DirectoryCountRecord {
  return {
    localId: record.id,
    kind: record.kind,
    targetId: record.targetId,
    memberCount: Number(record.memberCount || 0),
    cacheOwnerId: ownerId,
    updatedAt: new Date().toISOString()
  };
}

function messageFor(error: unknown): string {
  const status = (error as { status?: number })?.status || 0;
  if (status === 401 || status === 403) return 'Your account is not authorized to read the church directory.';
  if (!status || status >= 500 || status === 408 || status === 429) return 'The directory server is temporarily unreachable. Showing the last confirmed cache.';
  return (error as { response?: { message?: string }; message?: string })?.response?.message || 'The directory could not be refreshed.';
}

async function replaceFirstPage(pb: PocketBase, ownerId: string) {
  const [memberPage, cellCountPage, departmentCountPage] = await Promise.all([
    pb.collection('saints_directory').getList(1, PAGE_SIZE, { sort: 'fullName' }),
    pb.collection('saints_directory_cell_counts').getList(1, 200, { sort: 'targetId' }),
    pb.collection('saints_directory_department_counts').getList(1, 200, { sort: 'targetId' })
  ]);
  const members = memberPage.items.map((record) => mapMember(record, ownerId));
  const counts = [...cellCountPage.items, ...departmentCountPage.items].map((record) => mapCount(record, ownerId));
  await db.transaction('rw', db.directoryMembers, db.directoryCounts, async () => {
    await Promise.all([
      db.directoryMembers.where('cacheOwnerId').equals(ownerId).delete(),
      db.directoryCounts.where('cacheOwnerId').equals(ownerId).delete()
    ]);
    if (members.length) await db.directoryMembers.bulkPut(members);
    if (counts.length) await db.directoryCounts.bulkPut(counts);
  });
  return { page: memberPage.page, totalPages: memberPage.totalPages, totalItems: memberPage.totalItems };
}

async function appendPage(pb: PocketBase, ownerId: string, page: number) {
  const result = await pb.collection('saints_directory').getList(page, PAGE_SIZE, { sort: 'fullName' });
  const members = result.items.map((record) => mapMember(record, ownerId));
  await db.transaction('rw', db.directoryMembers, async () => {
    for (const member of members) {
      const existing = await db.directoryMembers
        .where('[cacheOwnerId+localId]')
        .equals([ownerId, member.localId])
        .first();
      await db.directoryMembers.put({ ...member, id: existing?.id });
    }
  });
  return { page: result.page, totalPages: result.totalPages, totalItems: result.totalItems };
}

export function useSaintsDirectoryData() {
  const { pb, user } = useAuth();
  const ownerId = user?.id || '';
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const members = useLiveQuery(async () => {
    if (!ownerId) return [];
    const rows = await db.directoryMembers.where('cacheOwnerId').equals(ownerId).toArray();
    return rows.sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [ownerId]) || [];
  const counts = useLiveQuery(
    () => ownerId ? db.directoryCounts.where('cacheOwnerId').equals(ownerId).toArray() : [],
    [ownerId]
  ) || [];

  const refresh = useCallback(async () => {
    if (!ownerId || !pb.authStore.isValid || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
    setIsRefreshing(true);
    try {
      const result = await replaceFirstPage(pb, ownerId);
      setPage(result.page);
      setTotalPages(result.totalPages);
      setTotalItems(result.totalItems);
      setError(null);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setIsRefreshing(false);
    }
  }, [ownerId, pb]);

  const loadMore = useCallback(async () => {
    if (!ownerId || page >= totalPages || isLoadingMore) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setError('Connect to the internet to load the next directory page.');
      return;
    }
    setIsLoadingMore(true);
    try {
      const result = await appendPage(pb, ownerId, page + 1);
      setPage(result.page);
      setTotalPages(result.totalPages);
      setTotalItems(result.totalItems);
      setError(null);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, ownerId, page, pb, totalPages]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!ownerId) return;
    const onOnline = () => void refresh();
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    const onVisibilityChanged = () => void refresh();
    window.addEventListener('online', onOnline);
    window.addEventListener(DIRECTORY_VISIBILITY_CHANGED_EVENT, onVisibilityChanged);
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 60_000);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener(DIRECTORY_VISIBILITY_CHANGED_EVENT, onVisibilityChanged);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, [ownerId, refresh]);

  const countFor = useCallback((kind: DirectoryCountRecord['kind'], targetId: string) =>
    counts.find((record) => record.kind === kind && record.targetId === targetId)?.memberCount || 0,
  [counts]);

  return {
    members,
    countFor,
    totalItems: totalItems || members.length,
    hasMore: page < totalPages,
    isLoading: isRefreshing && members.length === 0,
    isRefreshing,
    isLoadingMore,
    error,
    refresh,
    loadMore
  };
}
