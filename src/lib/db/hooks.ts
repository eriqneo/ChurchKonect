import { useLiveQuery } from 'dexie-react-hooks';
import { useState, useEffect, useCallback } from 'react';
import {
  db,
  generateUUID,
  createLocalRecord,
  type MemberRecord,
  type CellGroupRecord,
  type CellMeetingRecord,
  type CellAttendanceRecord,
  type CellReportRecord,
  type TrainingRecord,
  type TrainingEnrollmentRecord,
  type TrainingSessionRecord,
  type TrainingAttendanceRecord,
  type TrainingCertificateRecord,
  type AuditLogRecord,
  type UserRecord,
  type FeedbackRecord
} from './churchConnectDB';
import { syncEngine, type SyncProgress } from './SyncEngine';
import { useAuth } from './PocketBaseProvider';
import { getRoleView } from '../auth/roles';

// Helper to trigger background sync when modifications happen
const triggerAutoSync = () => {
  if (syncEngine.isOnline()) {
    syncEngine.syncNow().catch(console.error);
  }
};

// Helper for haptic vibrate feedback
const triggerHaptic = () => {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      navigator.vibrate(10);
    } catch (e) {}
  }
};

// ==========================================
// 1. useMembers() Hook
// ==========================================
export function useMembers() {
  const members = useLiveQuery(async () => {
    // Return all members that are not soft-deleted
    const raw = await db.members
      .filter(m => m.deletedAt === undefined)
      .toArray();
    const seen = new Set<string>();
    return raw.filter(m => {
      if (!m.localId || seen.has(m.localId)) return false;
      seen.add(m.localId);
      return true;
    });
  }, []);

  const addMember = useCallback(async (fields: Omit<MemberRecord, 'localId' | 'syncStatus' | 'createdAt' | 'updatedAt' | 'qrCode' | 'avatarText'>) => {
    const avatarText = fields.fullName
      .split(' ')
      .map(n => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();

    const newMember = createLocalRecord<MemberRecord>({
      ...fields,
      qrCode: `PASS_${fields.fullName.replace(/\s+/g, '_').toUpperCase()}`,
      avatarText
    });

    await db.members.add(newMember);
    await db.auditLogs.add({
      localId: generateUUID(),
      userId: 'current-user',
      userName: 'System User',
      action: 'member_add',
      details: `Added new member: ${fields.fullName}`,
      createdAt: new Date().toISOString()
    });

    triggerAutoSync();
    return newMember;
  }, []);

  const updateMember = useCallback(async (localId: string, updates: Partial<MemberRecord>) => {
    const existing = await db.members.where('localId').equals(localId).first();
    if (!existing || !existing.id) return;

    await db.members.update(existing.id, {
      ...updates,
      syncStatus: 'pending',
      updatedAt: new Date().toISOString()
    });

    triggerAutoSync();
  }, []);

  const deleteMember = useCallback(async (localId: string) => {
    const existing = await db.members.where('localId').equals(localId).first();
    if (!existing || !existing.id) return;

    // Soft delete
    await db.members.update(existing.id, {
      deletedAt: new Date().toISOString(),
      syncStatus: 'pending',
      updatedAt: new Date().toISOString()
    });

    await db.auditLogs.add({
      localId: generateUUID(),
      userId: 'current-user',
      userName: 'System User',
      action: 'member_delete',
      details: `Soft deleted member: ${existing.fullName}`,
      createdAt: new Date().toISOString()
    });

    triggerAutoSync();
  }, []);

  return {
    members: members || [],
    addMember,
    updateMember,
    deleteMember,
    isLoading: members === undefined
  };
}


// ==========================================
// 2. useCellGroups() Hook
// ==========================================
export function useCellGroups() {
  const cellGroups = useLiveQuery(async () => {
    const raw = await db.cellGroups.toArray();
    const seen = new Set<string>();
    return raw.filter(g => {
      if (!g.localId || seen.has(g.localId)) return false;
      seen.add(g.localId);
      return true;
    });
  }, []);

  const getCellMembers = useCallback(async (cellGroupId: string) => {
    return await db.members
      .where('cellGroupId')
      .equals(cellGroupId)
      .filter(m => m.deletedAt === undefined)
      .toArray();
  }, []);

  const addCellGroup = useCallback(async (name: string, leaderId: string, sectionId: string) => {
    const newCell = createLocalRecord<CellGroupRecord>({
      name,
      leaderId,
      sectionId
    });
    await db.cellGroups.add(newCell);
    triggerAutoSync();
    return newCell;
  }, []);

  return {
    cellGroups: cellGroups || [],
    getCellMembers,
    addCellGroup,
    isLoading: cellGroups === undefined
  };
}


// ==========================================
// 3. useCellMeeting(cellGroupId) Hook
// ==========================================
export function useCellMeeting(cellGroupId: string) {
  // Find currently active meeting
  const currentMeeting = useLiveQuery(async () => {
    return await db.cellMeetings
      .where('cellGroupId')
      .equals(cellGroupId)
      .filter(m => m.status === 'active')
      .first();
  }, [cellGroupId]);

  // Find attendance for current active meeting
  const attendance = useLiveQuery(async () => {
    if (!currentMeeting) return [];
    return await db.cellAttendance
      .where('meetingId')
      .equals(currentMeeting.localId)
      .toArray();
  }, [currentMeeting]);

  const startMeeting = useCallback(async (meetingDateStr?: string) => {
    const date = meetingDateStr || new Date().toISOString().split('T')[0];
    // Check if active one already exists
    const existing = await db.cellMeetings
      .where('cellGroupId')
      .equals(cellGroupId)
      .filter(m => m.status === 'active')
      .first();

    if (existing) return existing;

    const newMeeting = createLocalRecord<CellMeetingRecord>({
      cellGroupId,
      meetingDate: date,
      status: 'active'
    });

    await db.cellMeetings.add(newMeeting);

    // Auto-prepopulate attendance with all cell members as 'absent' by default
    const cellSaints = await db.members
      .where('cellGroupId')
      .equals(cellGroupId)
      .filter(m => m.deletedAt === undefined)
      .toArray();

    const attendanceRecords = cellSaints.map(m => createLocalRecord<CellAttendanceRecord>({
      meetingId: newMeeting.localId,
      memberId: m.localId,
      status: 'absent'
    }));

    if (attendanceRecords.length > 0) {
      await db.cellAttendance.bulkAdd(attendanceRecords);
    }

    triggerAutoSync();
    return newMeeting;
  }, [cellGroupId]);

  const endMeeting = useCallback(async () => {
    if (!currentMeeting || !currentMeeting.id) return;
    await db.cellMeetings.update(currentMeeting.id, {
      status: 'completed',
      syncStatus: 'pending',
      updatedAt: new Date().toISOString()
    });
    triggerAutoSync();
  }, [currentMeeting]);

  const toggleAttendance = useCallback(async (memberId: string, status: 'present' | 'absent' | 'excused') => {
    if (!currentMeeting) return;
    
    const existing = await db.cellAttendance
      .where('meetingId')
      .equals(currentMeeting.localId)
      .filter(att => att.memberId === memberId)
      .first();

    if (existing && existing.id) {
      await db.cellAttendance.update(existing.id, {
        status,
        syncStatus: 'pending',
        updatedAt: new Date().toISOString()
      });
    } else {
      const newAtt = createLocalRecord<CellAttendanceRecord>({
        meetingId: currentMeeting.localId,
        memberId,
        status
      });
      await db.cellAttendance.add(newAtt);
    }
    triggerAutoSync();
  }, [currentMeeting]);

  const addVisitor = useCallback(async (fullName: string, email: string, phone: string) => {
    if (!currentMeeting) return;

    // Create visitor as general member first with visitor/seeker label
    const avatarText = fullName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    const newVisitor = createLocalRecord<MemberRecord>({
      fullName,
      email,
      phone,
      role: 'visitor',
      cellGroupId,
      qrCode: `VISITOR_${fullName.replace(/\s+/g, '_').toUpperCase()}`,
      avatarText
    });

    await db.members.add(newVisitor);

    // Auto mark as present in active meeting
    const newAtt = createLocalRecord<CellAttendanceRecord>({
      meetingId: currentMeeting.localId,
      memberId: newVisitor.localId,
      status: 'present'
    });
    await db.cellAttendance.add(newAtt);

    triggerAutoSync();
  }, [currentMeeting, cellGroupId]);

  const submitReport = useCallback(async (highlights: string, challenges: string, submittedBy: string) => {
    if (!currentMeeting) return;

    // Count presents
    const presentCount = await db.cellAttendance
      .where('meetingId')
      .equals(currentMeeting.localId)
      .filter(att => att.status === 'present')
      .count();

    const newReport = createLocalRecord<CellReportRecord>({
      meetingId: currentMeeting.localId,
      cellGroupId,
      highlights,
      challenges,
      reportStatus: 'pending_review',
      submittedBy,
      attendanceCount: presentCount
    });

    await db.cellReports.add(newReport);
    await endMeeting(); // automatically end the active meeting
    triggerAutoSync();
  }, [currentMeeting, cellGroupId, endMeeting]);

  return {
    currentMeeting: currentMeeting || null,
    startMeeting,
    endMeeting,
    attendance: attendance || [],
    toggleAttendance,
    addVisitor,
    submitReport,
    isLoading: currentMeeting === undefined
  };
}


// ==========================================
// 4. useTrainings() Hook
// ==========================================
export function useTrainings() {
  const courses = useLiveQuery(async () => {
    return await db.trainings.toArray();
  }, []);

  const enroll = useCallback(async (trainingId: string, memberId: string) => {
    const existing = await db.trainingEnrollments
      .where('trainingId')
      .equals(trainingId)
      .filter(e => e.memberId === memberId)
      .first();

    if (existing) return existing;

    const enrollment = createLocalRecord<TrainingEnrollmentRecord>({
      trainingId,
      memberId,
      enrolledAt: new Date().toISOString()
    });

    await db.trainingEnrollments.add(enrollment);
    triggerAutoSync();
    return enrollment;
  }, []);

  const scanAttendance = useCallback(async (sessionId: string, memberId: string) => {
    const existing = await db.trainingAttendance
      .where('sessionId')
      .equals(sessionId)
      .filter(a => a.memberId === memberId)
      .first();

    if (existing) return existing;

    const attendanceRec = createLocalRecord<TrainingAttendanceRecord>({
      sessionId,
      memberId,
      scannedAt: new Date().toISOString()
    });

    await db.trainingAttendance.add(attendanceRec);
    triggerAutoSync();
    return attendanceRec;
  }, []);

  return {
    courses: courses || [],
    enroll,
    scanAttendance,
    isLoading: courses === undefined
  };
}


// ==========================================
// 6. useReports() Hook
// ==========================================
export function useReports(roleId: string) {
  const pendingReports = useLiveQuery(async () => {
    return await db.cellReports
      .where('reportStatus')
      .equals('pending_review')
      .toArray();
  }, []);

  const approvedReports = useLiveQuery(async () => {
    return await db.cellReports
      .where('reportStatus')
      .equals('approved')
      .toArray();
  }, []);

  const approveReport = useCallback(async (reportId: string) => {
    const existing = await db.cellReports.where('localId').equals(reportId).first();
    if (!existing || !existing.id) return;

    await db.cellReports.update(existing.id, {
      reportStatus: 'approved',
      syncStatus: 'pending',
      updatedAt: new Date().toISOString()
    });

    // Create a clergy audit log
    await db.auditLogs.add({
      localId: generateUUID(),
      userId: 'clergy-user',
      userName: 'Clergy Supervisor',
      action: 'report_approved',
      details: `Approved cell group report with localId: ${reportId}`,
      createdAt: new Date().toISOString()
    });

    triggerAutoSync();
  }, []);

  return {
    pendingReports: pendingReports || [],
    approvedReports: approvedReports || [],
    approveReport,
    isLoading: pendingReports === undefined || approvedReports === undefined
  };
}


// ==========================================
// 8. useAuditLog() Hook
// ==========================================
export function useAuditLog() {
  const logs = useLiveQuery(async () => {
    return await db.auditLogs
      .reverse()
      .sortBy('createdAt');
  }, []);

  const addLog = useCallback(async (action: string, details: string, userId = 'current-user', userName = 'System User') => {
    await db.auditLogs.add({
      localId: generateUUID(),
      userId,
      userName,
      action,
      details,
      createdAt: new Date().toISOString()
    });
  }, []);

  return {
    logs: logs || [],
    addLog
  };
}


// ==========================================
// 9. useSync() Hook
// ==========================================
export function useSync() {
  const [syncStatus, setSyncStatus] = useState<SyncProgress>({
    status: 'idle',
    pendingCount: 0,
    processedCount: 0,
    message: 'Ready'
  });

  const [lastSyncTime, setLastSyncTime] = useState<string>('');

  useEffect(() => {
    const getInitialProgress = async () => {
      const pending = await syncEngine.getPendingCount();
      const lastSyncRecord = await db.appSettings.where('key').equals('lastSyncTime').first();
      
      setSyncStatus({
        status: 'idle',
        pendingCount: pending,
        processedCount: 0,
        message: pending > 0 ? `${pending} local changes ready to sync` : 'All records synchronized.'
      });

      if (lastSyncRecord) {
        setLastSyncTime(lastSyncRecord.value);
      }
    };

    getInitialProgress();

    // Subscribe to SyncEngine state changes
    const unsubscribe = syncEngine.subscribe((progress) => {
      setSyncStatus(progress);
      if (progress.status === 'success') {
        db.appSettings.where('key').equals('lastSyncTime').first().then(rec => {
          if (rec) setLastSyncTime(rec.value);
        });
      }
    });

    return unsubscribe;
  }, []);

  const triggerSync = useCallback(async () => {
    triggerHaptic();
    await syncEngine.syncNow();
  }, []);

  return {
    syncStatus,
    pendingCount: syncStatus.pendingCount,
    lastSyncTime,
    syncNow: triggerSync
  };
}


// ==========================================
// 10. useCurrentUser() Hook
// ==========================================
export function useCurrentUser() {
  const { user } = useAuth();
  const currentRole = user ? getRoleView(user) : null;

  const switchRole = useCallback(async (roleId: string) => {
    if (user && roleId !== user.role) {
      console.warn('[Auth] Role switching is disabled; authenticate with the intended test account instead.');
    }
    triggerHaptic();
  }, [user]);

  return {
    user: user ? { localId: user.id, name: user.name, email: user.email } : null,
    role: currentRole,
    switchRole
  };
}
