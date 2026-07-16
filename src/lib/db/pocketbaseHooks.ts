import { useCallback, useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { RecordModel } from 'pocketbase';
import { db, generateUUID, type MemberRecord } from './churchConnectDB';
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

export interface CellGroupReference extends MemberReference {
  sectionId?: string;
  sectionName?: string;
}

function expandedName(record: RecordModel, key: string): string | undefined {
  const value = record.expand?.[key];
  if (!value || Array.isArray(value)) return undefined;
  return typeof value.name === 'string' ? value.name : undefined;
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

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'CC';
}

function toPocketBaseDate(value?: string): string {
  if (!value) return '';
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value} 00:00:00.000Z` : value;
}

async function cacheMembers(records: RecordModel[], cacheOwnerId: string): Promise<void> {
  const remoteIds = new Set(records.map((record) => record.id));
  await db.transaction('rw', db.members, async () => {
    const existingCached = await db.members
      .filter((member) => Boolean(member.remoteId) && (member as MemberRecord & { cacheOwnerId?: string }).cacheOwnerId === cacheOwnerId)
      .toArray();

    for (const cached of existingCached) {
      if (cached.id && cached.remoteId && !remoteIds.has(cached.remoteId)) {
        await db.members.delete(cached.id);
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

export function useMemberReferences() {
  const { pb, user } = useAuth();
  const [departments, setDepartments] = useState<MemberReference[]>([]);
  const [sections, setSections] = useState<MemberReference[]>([]);
  const [cellGroups, setCellGroups] = useState<CellGroupReference[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    setError(null);
    try {
      const [departmentRecords, sectionRecords, cellRecords] = await Promise.all([
        pb.collection('departments').getFullList({ sort: 'name', filter: 'status = "active"' }),
        pb.collection('sections').getFullList({ sort: 'name', filter: 'status = "active"' }),
        pb.collection('cell_groups').getFullList({ sort: 'name', filter: 'status = "active"', expand: 'section' })
      ]);
      setDepartments(departmentRecords.map((record) => ({ id: record.id, name: record.name })));
      setSections(sectionRecords.map((record) => ({ id: record.id, name: record.name })));
      setCellGroups(cellRecords.map((record) => ({
        id: record.id,
        name: record.name,
        sectionId: record.section || undefined,
        sectionName: expandedName(record, 'section')
      })));
    } catch (referenceError) {
      console.error('[Members] Reference data refresh failed:', referenceError);
      setError('Cell groups and departments could not be loaded.');
    } finally {
      setIsLoading(false);
    }
  }, [pb, user]);

  useEffect(() => { void refresh(); }, [refresh]);
  return { departments, sections, cellGroups, isLoading, error, refresh };
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
      const records = await pb.collection('members').getFullList({
        sort: 'fullName',
        expand: 'departments,cellGroup,section'
      });
      await cacheMembers(records, user.id);
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

  const updateMember = useCallback(async (remoteId: string, updates: Partial<PocketBaseMember>) => {
    const departmentRecords = updates.departments
      ? await pb.collection('departments').getFullList({ sort: 'name' })
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
    await refreshMembers();
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
