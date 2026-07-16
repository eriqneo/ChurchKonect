import { useState, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, generateUUID, createLocalRecord, MemberRecord, UserRecord } from './churchConnectDB';
import { useCurrentUser } from './hooks';

export interface PocketBaseMember {
  id?: number;
  localId: string;
  fullName: string;
  email: string;
  phone: string;
  role: string;               // 'member' | 'worker' | 'admin'
  departments?: string[];     // ['Intercessory', 'ICT', 'Protocol', etc.]
  cellGroupId?: string;       // localId of cell
  sectionId?: string;         // localId of section
  qrCode: string;             // CC-2026-XXXX
  avatarText?: string;
  address?: string;
  dateOfBirth?: string;
  status: 'Active' | 'Inactive';
  passwordSimulated?: string;
  createdAt: string;
  updatedAt: string;
}

export function usePocketBaseMembers() {
  const { user: currentAdmin } = useCurrentUser();

  // Live query of members from the IndexedDB (Dexie)
  const members = useLiveQuery(async () => {
    const raw = await db.members.filter(m => m.deletedAt === undefined).toArray();
    
    // De-duplicate members by localId
    const seen = new Set<string>();
    return raw.filter(m => {
      if (!m.localId || seen.has(m.localId)) return false;
      seen.add(m.localId);
      return true;
    }).map(m => {
      // Ensure default status is Active if not specified
      const status = (m as any).status || 'Active';
      const departments = (m as any).departments || [];
      return {
        ...m,
        status,
        departments,
      } as PocketBaseMember;
    });
  }) || [];

  // Enroll New Member (Create)
  const enrollMember = useCallback(async (fields: {
    fullName: string;
    phone: string;
    email: string;
    role: string;
    departments?: string[];
    cellGroupId?: string;
    sectionId?: string;
    dateOfBirth?: string;
    address?: string;
  }) => {
    // Generate sequential or random 4-digit ID
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const qrCode = `CC-2026-${randomSuffix}`;
    const avatarText = fields.fullName
      .split(' ')
      .map(n => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();

    const tempPassword = `ChurchPass_${Math.random().toString(36).substring(2, 8).toUpperCase()}!`;

    // Create localized member record
    const newMemberData = createLocalRecord<MemberRecord>({
      fullName: fields.fullName,
      email: fields.email,
      phone: fields.phone,
      role: fields.role,
      cellGroupId: fields.cellGroupId,
      sectionId: fields.sectionId,
      qrCode,
      avatarText,
    });

    // Inject any additional fields
    const finalMember = {
      ...newMemberData,
      departments: fields.departments || [],
      address: fields.address || '',
      dateOfBirth: fields.dateOfBirth || '',
      status: 'Active',
      passwordSimulated: tempPassword,
    };

    // Save to members table
    await db.members.add(finalMember as any);

    // Create a corresponding user account record in db.users (PocketBase auth simulation)
    const newUserRecord = createLocalRecord<UserRecord>({
      email: fields.email,
      name: fields.fullName,
      role: fields.role === 'admin' ? 'administrator' : fields.role === 'worker' ? 'cell_leader' : 'member',
      cellGroupId: fields.cellGroupId,
      sectionId: fields.sectionId,
    });
    await db.users.add(newUserRecord);

    // Audit Log Entry
    const adminName = currentAdmin?.name || 'Admin';
    await db.auditLogs.add({
      localId: generateUUID(),
      userId: currentAdmin?.localId || 'admin-system',
      userName: adminName,
      action: 'member_enroll',
      details: `Admin ${adminName} enrolled ${fields.fullName} (${qrCode})`,
      createdAt: new Date().toISOString()
    });

    return {
      ...finalMember,
      passwordSimulated: tempPassword
    };
  }, [currentAdmin]);

  // Update Member
  const updateMember = useCallback(async (localId: string, updates: Partial<PocketBaseMember>) => {
    const existing = await db.members.where('localId').equals(localId).first();
    if (!existing || !existing.id) return null;

    const finalUpdates = {
      ...updates,
      syncStatus: 'pending' as const,
      updatedAt: new Date().toISOString()
    };

    await db.members.update(existing.id, finalUpdates);

    // If roles changed, also sync user table
    if (updates.role || updates.fullName || updates.email) {
      const userRec = await db.users.where('email').equals(existing.email).first();
      if (userRec && userRec.id) {
        await db.users.update(userRec.id, {
          name: updates.fullName || existing.fullName,
          email: updates.email || existing.email,
          role: updates.role === 'admin' ? 'administrator' : updates.role === 'worker' ? 'cell_leader' : 'member',
        });
      }
    }

    return {
      ...existing,
      ...finalUpdates
    } as PocketBaseMember;
  }, []);

  // Delete Member
  const deleteMember = useCallback(async (localId: string) => {
    const existing = await db.members.where('localId').equals(localId).first();
    if (!existing || !existing.id) return false;

    // Soft Delete
    await db.members.update(existing.id, {
      deletedAt: new Date().toISOString(),
      syncStatus: 'pending',
      updatedAt: new Date().toISOString()
    });

    // Log in Audit Logs
    const adminName = currentAdmin?.name || 'Admin';
    await db.auditLogs.add({
      localId: generateUUID(),
      userId: currentAdmin?.localId || 'admin-system',
      userName: adminName,
      action: 'member_delete',
      details: `Admin ${adminName} deactivated ${existing.fullName}`,
      createdAt: new Date().toISOString()
    });

    return true;
  }, [currentAdmin]);

  // Reset Password
  const resetPassword = useCallback(async (localId: string) => {
    const existing = await db.members.where('localId').equals(localId).first();
    if (!existing) return null;

    const tempPassword = `Reset_${Math.random().toString(36).substring(2, 8).toUpperCase()}!`;
    
    // Log resetting in Audit logs
    const adminName = currentAdmin?.name || 'Admin';
    await db.auditLogs.add({
      localId: generateUUID(),
      userId: currentAdmin?.localId || 'admin-system',
      userName: adminName,
      action: 'member_password_reset',
      details: `Admin ${adminName} reset password for ${existing.fullName}`,
      createdAt: new Date().toISOString()
    });

    return {
      email: existing.email,
      fullName: existing.fullName,
      temporaryPassword: tempPassword,
      resetLink: `https://churchconnect.org/auth/reset?token=${generateUUID().substring(0, 8)}`
    };
  }, [currentAdmin]);

  return {
    members,
    enrollMember,
    updateMember,
    deleteMember,
    resetPassword
  };
}
