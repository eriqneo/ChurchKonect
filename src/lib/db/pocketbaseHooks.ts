import { useCallback, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { RecordModel } from 'pocketbase';
import {
  db,
  generateUUID,
  type CellGroupRecord,
  type DepartmentRecord,
  type MemberRecord,
  type SectionRecord
} from './churchConnectDB';
import { useAuth } from './PocketBaseProvider';

export interface PocketBaseMember {
  id?: number;
  localId: string;
  remoteId: string;
  userId?: string;
  fullName: string;
  email: string;
  phone: string;
  role: string;
  departments: string[];
  departmentIds: string[];
  cellGroupId?: string;
  cellGroupName?: string;
  sectionId?: string;
  sectionName?: string;
  qrCode: string;
  avatarText: string;
  address?: string;
  dateOfBirth?: string;
  status: 'Active' | 'Inactive';
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  cacheOwnerId: string;
}

export interface MemberReference {
  id: string;
  name: string;
}

export interface DepartmentReference extends MemberReference {
  description?: string;
  headId?: string;
  headName?: string;
}

export interface SectionReference extends MemberReference {
  code?: string;
  pastorId?: string;
  pastorName?: string;
}

export interface CellGroupReference extends MemberReference {
  sectionId?: string;
  sectionName?: string;
}

export interface PocketBaseCellGroup {
  id?: number;
  localId: string;
  remoteId: string;
  name: string;
  leaderId: string;
  leaderMemberId?: string;
  leaderName?: string;
  sectionId: string;
  sectionName?: string;
  meetingDay?: string;
  meetingTime?: string;
  location?: string;
  status: 'Active' | 'Inactive';
  syncStatus: 'synced';
  createdAt: string;
  updatedAt: string;
  cacheOwnerId: string;
}

function expandedName(record: RecordModel, key: string): string | undefined {
  const value = record.expand?.[key];
  if (!value || Array.isArray(value)) return undefined;
  return typeof value.name === 'string' ? value.name : undefined;
}

function expandedDisplayName(record: RecordModel, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record.expand?.[key];
    if (!value || Array.isArray(value)) continue;
    if (typeof value.fullName === 'string' && value.fullName) return value.fullName;
    if (typeof value.name === 'string' && value.name) return value.name;
  }
  return undefined;
}

function mapRemoteMember(record: RecordModel, cacheOwnerId: string): PocketBaseMember {
  const departmentRecords = Array.isArray(record.expand?.departments)
    ? record.expand.departments
    : [];
  const departmentIds = Array.isArray(record.departments) ? record.departments : [];

  return {
    localId: record.id,
    remoteId: record.id,
    userId: record.user || undefined,
    fullName: record.fullName,
    email: record.email || '',
    phone: record.phone || '',
    role: record.role || 'member',
    departments: departmentRecords.map((department) => department.name).filter(Boolean),
    departmentIds,
    cellGroupId: record.cellGroup || undefined,
    cellGroupName: expandedName(record, 'cellGroup'),
    sectionId: record.section || undefined,
    sectionName: expandedName(record, 'section'),
    qrCode: record.qrCode,
    avatarText: record.avatarText || initials(record.fullName),
    address: record.address || '',
    dateOfBirth: typeof record.dateOfBirth === 'string' ? record.dateOfBirth.slice(0, 10) : '',
    status: record.status === 'inactive' ? 'Inactive' : 'Active',
    createdAt: record.created,
    updatedAt: record.updated,
    deletedAt: record.deleted ? record.updated : undefined,
    cacheOwnerId
  };
}

function mapRemoteCellGroup(record: RecordModel, cacheOwnerId: string): PocketBaseCellGroup {
  return {
    localId: record.id,
    remoteId: record.id,
    name: record.name,
    leaderId: record.leader || '',
    leaderMemberId: record.leaderMember || undefined,
    leaderName: expandedDisplayName(record, 'leaderMember', 'leader'),
    sectionId: record.section || '',
    sectionName: expandedName(record, 'section'),
    meetingDay: record.meetingDay || '',
    meetingTime: record.meetingTime || '',
    location: record.location || '',
    status: record.status === 'inactive' ? 'Inactive' : 'Active',
    syncStatus: 'synced',
    createdAt: record.created,
    updatedAt: record.updated,
    cacheOwnerId
  };
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'CC';
}

function toPocketBaseDate(value?: string): string {
  if (!value) return '';
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value} 00:00:00.000Z` : value;
}

async function cacheMembers(records: RecordModel[], cacheOwnerId: string, replaceComplete = true): Promise<void> {
  const remoteIds = new Set(records.map((record) => record.id));
  await db.transaction('rw', db.members, async () => {
    const existingCached = await db.members
      .filter((member) => Boolean(member.remoteId) && (member as MemberRecord & { cacheOwnerId?: string }).cacheOwnerId === cacheOwnerId)
      .toArray();

    if (replaceComplete) {
      for (const cached of existingCached) {
        if (cached.id && cached.remoteId && !remoteIds.has(cached.remoteId)) {
          await db.members.delete(cached.id);
        }
      }
    }

    for (const record of records) {
      const mapped = mapRemoteMember(record, cacheOwnerId);
      const existing = await db.members.where('remoteId').equals(record.id).first();
      await db.members.put({
        ...mapped,
        id: existing?.id,
        syncStatus: 'synced'
      } as unknown as MemberRecord);
    }
  });
}

async function cacheChurchStructure(
  departmentRecords: RecordModel[],
  sectionRecords: RecordModel[],
  cellRecords: RecordModel[],
  cacheOwnerId: string,
  replaceComplete: boolean
): Promise<void> {
  await db.transaction('rw', db.departments, db.sections, db.cellGroups, async () => {
    const syncTable = async <T extends { id?: number; remoteId?: string; cacheOwnerId?: string }>(
      table: { toArray: () => Promise<T[]>; delete: (key: number) => Promise<void> },
      records: RecordModel[]
    ) => {
      if (!replaceComplete) return;
      const remoteIds = new Set(records.map((record) => record.id));
      for (const cached of await table.toArray()) {
        if (cached.id && cached.remoteId && cached.cacheOwnerId === cacheOwnerId && !remoteIds.has(cached.remoteId)) {
          await table.delete(cached.id);
        }
      }
    };

    await syncTable(db.departments, departmentRecords);
    await syncTable(db.sections, sectionRecords);
    await syncTable(db.cellGroups, cellRecords);

    for (const record of departmentRecords) {
      const existing = await db.departments.where('localId').equals(record.id).first();
      await db.departments.put({
        id: existing?.id,
        localId: record.id,
        remoteId: record.id,
        name: record.name,
        headId: record.head || '',
        headMemberId: record.headMember || undefined,
        headName: expandedDisplayName(record, 'headMember', 'head'),
        description: record.description || '',
        status: record.status === 'inactive' ? 'Inactive' : 'Active',
        syncStatus: 'synced',
        createdAt: record.created,
        updatedAt: record.updated,
        cacheOwnerId
      } as DepartmentRecord);
    }

    for (const record of sectionRecords) {
      const existing = await db.sections.where('localId').equals(record.id).first();
      await db.sections.put({
        id: existing?.id,
        localId: record.id,
        remoteId: record.id,
        name: record.name,
        code: record.code || '',
        pastorId: record.pastor || '',
        pastorMemberId: record.pastorMember || undefined,
        pastorName: expandedDisplayName(record, 'pastorMember', 'pastor'),
        status: record.status === 'inactive' ? 'Inactive' : 'Active',
        syncStatus: 'synced',
        createdAt: record.created,
        updatedAt: record.updated,
        cacheOwnerId
      } as SectionRecord);
    }

    for (const record of cellRecords) {
      const mapped = mapRemoteCellGroup(record, cacheOwnerId);
      const existing = await db.cellGroups.where('localId').equals(record.id).first();
      await db.cellGroups.put({ ...mapped, id: existing?.id } as CellGroupRecord);
    }
  });
}

export function useChurchStructure() {
  const { pb, user } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const cached = useLiveQuery(async () => {
    if (!user) return { departments: [], sections: [], cellGroups: [] };
    const ownerFilter = <T extends { remoteId?: string; cacheOwnerId?: string }>(record: T) =>
      Boolean(record.remoteId) && record.cacheOwnerId === user.id;
    const [departments, sections, cellGroups] = await Promise.all([
      db.departments.filter(ownerFilter).toArray(),
      db.sections.filter(ownerFilter).toArray(),
      db.cellGroups.filter(ownerFilter).toArray()
    ]);
    return {
      departments: departments.sort((a, b) => a.name.localeCompare(b.name)),
      sections: sections.sort((a, b) => a.name.localeCompare(b.name)),
      cellGroups: cellGroups.sort((a, b) => a.name.localeCompare(b.name)) as PocketBaseCellGroup[]
    };
  }, [user?.id]) ?? { departments: [], sections: [], cellGroups: [] };

  const refresh = useCallback(async () => {
    if (!user) return;
    setIsRefreshing(true);
    setError(null);
    try {
      const [departmentPage, sectionPage, cellPage] = await Promise.all([
        pb.collection('departments').getList(1, 200, { sort: 'name', expand: 'head,headMember' }),
        pb.collection('sections').getList(1, 200, { sort: 'name', expand: 'pastor,pastorMember' }),
        pb.collection('cell_groups').getList(1, 200, { sort: 'name', expand: 'leader,leaderMember,section' })
      ]);
      const more = [departmentPage, sectionPage, cellPage].some((page) => page.totalPages > 1);
      setHasMore(more);
      await cacheChurchStructure(
        departmentPage.items,
        sectionPage.items,
        cellPage.items,
        user.id,
        !more
      );
    } catch (referenceError) {
      console.error('[Structure] Refresh failed:', referenceError);
      setError('Could not refresh church structures. Showing the last confirmed cache.');
    } finally {
      setIsRefreshing(false);
    }
  }, [pb, user]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!user) return;
    let disposed = false;
    const unsubscribers: Array<() => void> = [];
    Promise.all(['departments', 'sections', 'cell_groups'].map((collection) =>
      pb.collection(collection).subscribe('*', () => { void refresh(); })
    )).then((stops) => {
      if (disposed) stops.forEach((stop) => stop());
      else unsubscribers.push(...stops);
    }).catch((subscriptionError) => console.warn('[Structure] Realtime unavailable:', subscriptionError));
    return () => {
      disposed = true;
      unsubscribers.forEach((stop) => stop());
    };
  }, [pb, refresh, user]);

  const saveCellGroup = useCallback(async (fields: {
    remoteId?: string;
    expectedUpdatedAt?: string;
    name: string;
    leaderId?: string;
    leaderMemberId?: string;
    sectionId?: string;
    meetingDay?: string;
    meetingTime?: string;
    location?: string;
    status: 'Active' | 'Inactive';
  }) => {
    if (!user) throw new Error('Authentication is required.');
    const payload = {
      name: fields.name.trim(),
      leader: fields.leaderId || '',
      leaderMember: fields.leaderMemberId || '',
      section: fields.sectionId || '',
      meetingDay: fields.meetingDay || '',
      meetingTime: fields.meetingTime || '',
      location: fields.location?.trim() || '',
      status: fields.status.toLowerCase()
    };

    let record: RecordModel;
    if (fields.remoteId) {
      if (fields.expectedUpdatedAt) {
        const latest = await pb.collection('cell_groups').getOne(fields.remoteId);
        if (latest.updated !== fields.expectedUpdatedAt) {
          throw new Error('This cell group changed on another device. Refresh and try again.');
        }
      }
      record = await pb.collection('cell_groups').update(fields.remoteId, payload, { expand: 'leader,leaderMember,section' });
    } else {
      record = await pb.collection('cell_groups').create(payload, { expand: 'leader,leaderMember,section' });
    }
    await refresh();
    return mapRemoteCellGroup(record, user.id);
  }, [pb, refresh, user]);

  const saveSection = useCallback(async (fields: {
    remoteId?: string;
    expectedUpdatedAt?: string;
    name: string;
    code?: string;
    pastorId?: string;
    pastorMemberId?: string;
    status?: 'Active' | 'Inactive';
  }) => {
    if (!user) throw new Error('Authentication is required.');
    const payload = {
      name: fields.name.trim(),
      code: fields.code?.trim().toUpperCase() || '',
      pastor: fields.pastorId || '',
      pastorMember: fields.pastorMemberId || '',
      status: (fields.status || 'Active').toLowerCase()
    };
    if (fields.remoteId && fields.expectedUpdatedAt) {
      const latest = await pb.collection('sections').getOne(fields.remoteId);
      if (latest.updated !== fields.expectedUpdatedAt) throw new Error('This section changed on another device. Refresh and try again.');
    }
    const record = fields.remoteId
      ? await pb.collection('sections').update(fields.remoteId, payload, { expand: 'pastor,pastorMember' })
      : await pb.collection('sections').create(payload, { expand: 'pastor,pastorMember' });
    await refresh();
    return record;
  }, [pb, refresh, user]);

  const saveDepartment = useCallback(async (fields: {
    remoteId?: string;
    expectedUpdatedAt?: string;
    name: string;
    description?: string;
    headId?: string;
    headMemberId?: string;
    status?: 'Active' | 'Inactive';
  }) => {
    if (!user) throw new Error('Authentication is required.');
    const payload = {
      name: fields.name.trim(),
      description: fields.description?.trim() || '',
      head: fields.headId || '',
      headMember: fields.headMemberId || '',
      status: (fields.status || 'Active').toLowerCase()
    };
    if (fields.remoteId && fields.expectedUpdatedAt) {
      const latest = await pb.collection('departments').getOne(fields.remoteId);
      if (latest.updated !== fields.expectedUpdatedAt) throw new Error('This department changed on another device. Refresh and try again.');
    }
    const record = fields.remoteId
      ? await pb.collection('departments').update(fields.remoteId, payload, { expand: 'head,headMember' })
      : await pb.collection('departments').create(payload, { expand: 'head,headMember' });
    await refresh();
    return record;
  }, [pb, refresh, user]);

  return {
    ...cached,
    saveCellGroup,
    saveSection,
    saveDepartment,
    refresh,
    isLoading: isRefreshing && cached.cellGroups.length === 0 && cached.sections.length === 0,
    isRefreshing,
    error,
    hasMore
  };
}

export function useMemberReferences() {
  const structure = useChurchStructure();
  const departments: DepartmentReference[] = structure.departments
    .filter((record) => record.status !== 'Inactive')
    .map((record) => ({
      id: record.remoteId || record.localId,
      name: record.name,
      description: record.description,
      headId: record.headId || undefined,
      headName: record.headName
    }));
  const sections: SectionReference[] = structure.sections
    .filter((record) => record.status !== 'Inactive')
    .map((record) => ({
      id: record.remoteId || record.localId,
      name: record.name,
      code: record.code,
      pastorId: record.pastorId || undefined,
      pastorName: record.pastorName
    }));
  const cellGroups: CellGroupReference[] = structure.cellGroups
    .filter((record) => record.status !== 'Inactive')
    .map((record) => ({
      id: record.remoteId,
      name: record.name,
      sectionId: record.sectionId || undefined,
      sectionName: record.sectionName
    }));
  return {
    departments,
    sections,
    cellGroups,
    isLoading: structure.isLoading,
    isRefreshing: structure.isRefreshing,
    error: structure.error,
    refresh: structure.refresh
  };
}

export function usePocketBaseMembers() {
  const { pb, user } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const members = useLiveQuery(async () => {
    if (!user) return [];
    const cached = await db.members
      .filter((member) => Boolean(member.remoteId) && (member as MemberRecord & { cacheOwnerId?: string }).cacheOwnerId === user.id)
      .toArray();
    return cached as unknown as PocketBaseMember[];
  }, [user?.id]) ?? [];

  const refreshMembers = useCallback(async () => {
    if (!user) return;
    setIsRefreshing(true);
    setError(null);
    try {
      const page = await pb.collection('members').getList(1, 200, {
        sort: 'fullName',
        expand: 'departments,cellGroup,section'
      });
      await cacheMembers(page.items, user.id, page.totalPages <= 1);
    } catch (refreshError) {
      console.error('[Members] Refresh failed:', refreshError);
      setError('Could not refresh the member directory. Showing the last confirmed cache.');
    } finally {
      setIsRefreshing(false);
    }
  }, [pb, user]);

  useEffect(() => { void refreshMembers(); }, [refreshMembers]);

  useEffect(() => {
    if (!user) return;
    let unsubscribe: (() => void) | undefined;
    pb.collection('members').subscribe('*', () => { void refreshMembers(); })
      .then((stop) => { unsubscribe = stop; })
      .catch((subscriptionError) => console.warn('[Members] Realtime subscription unavailable:', subscriptionError));
    return () => unsubscribe?.();
  }, [pb, refreshMembers, user]);

  const enrollMember = useCallback(async (fields: {
    fullName: string;
    phone: string;
    email?: string;
    role: string;
    departments?: string[];
    cellGroupId?: string;
    sectionId?: string;
    dateOfBirth?: string;
    address?: string;
  }) => {
    if (!user) throw new Error('Authentication is required.');
    const year = new Date().getFullYear();
    const qrCode = `CC-${year}-${generateUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
    const record = await pb.collection('members').create({
      fullName: fields.fullName.trim(),
      phone: fields.phone.trim(),
      email: fields.email?.trim() || '',
      role: fields.role,
      departments: fields.departments ?? [],
      cellGroup: fields.cellGroupId || '',
      section: fields.sectionId || '',
      dateOfBirth: toPocketBaseDate(fields.dateOfBirth),
      address: fields.address?.trim() || '',
      qrCode,
      avatarText: initials(fields.fullName),
      status: 'active',
      deleted: false,
      createdBy: user.id
    }, { expand: 'departments,cellGroup,section' });
    await refreshMembers();
    return mapRemoteMember(record, user.id);
  }, [pb, refreshMembers, user]);

  const updateMember = useCallback(async (
    remoteId: string,
    updates: Partial<PocketBaseMember>,
    options: { refresh?: boolean } = {}
  ) => {
    const departmentRecords = updates.departments
      ? (await pb.collection('departments').getList(1, 200, { sort: 'name' })).items
      : [];
    const departmentIds = updates.departments?.map((value) =>
      departmentRecords.find((department) => department.id === value || department.name === value)?.id
    ).filter((value): value is string => Boolean(value));

    const payload: Record<string, unknown> = {};
    if (updates.fullName !== undefined) payload.fullName = updates.fullName;
    if (updates.email !== undefined) payload.email = updates.email;
    if (updates.phone !== undefined) payload.phone = updates.phone;
    if (updates.role !== undefined) payload.role = updates.role;
    if (updates.address !== undefined) payload.address = updates.address;
    if (updates.dateOfBirth !== undefined) payload.dateOfBirth = toPocketBaseDate(updates.dateOfBirth);
    if ('cellGroupId' in updates) payload.cellGroup = updates.cellGroupId || '';
    if ('sectionId' in updates) payload.section = updates.sectionId || '';
    if (departmentIds !== undefined) payload.departments = departmentIds;
    if (updates.status !== undefined) payload.status = updates.status.toLowerCase();

    const record = await pb.collection('members').update(remoteId, payload, { expand: 'departments,cellGroup,section' });
    if (options.refresh !== false) await refreshMembers();
    return mapRemoteMember(record, user?.id ?? '');
  }, [pb, refreshMembers, user?.id]);

  const deleteMember = useCallback(async (remoteId: string) => {
    await pb.collection('members').update(remoteId, { status: 'inactive', deleted: true });
    await refreshMembers();
    return true;
  }, [pb, refreshMembers]);

  const resetPassword = useCallback(async (remoteId: string) => {
    const existing = members.find((member) => member.remoteId === remoteId || member.localId === remoteId);
    if (!existing?.userId || !existing.email) {
      throw new Error('This registry profile is not linked to a login account.');
    }
    await pb.collection('users').requestPasswordReset(existing.email);
    return { email: existing.email, fullName: existing.fullName, delivery: 'email' as const };
  }, [members, pb]);

  return {
    members,
    enrollMember,
    updateMember,
    deleteMember,
    resetPassword,
    refreshMembers,
    isLoading: isRefreshing && members.length === 0,
    isRefreshing,
    error
  };
}
