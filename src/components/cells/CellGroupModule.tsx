import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import * as Typography from '../../lib/theme/typography';
import { 
  db, 
  generateUUID, 
  createLocalRecord,
  type CellGroupRecord,
  type MemberRecord,
  type CellMeetingRecord,
  type CellAttendanceRecord,
  type CellReportRecord,
  type NotificationRecord
} from '../../lib/db/churchConnectDB';
import { useLiveQuery } from 'dexie-react-hooks';
import { syncEngine } from '../../lib/db/SyncEngine';
import { useCurrentUser } from '../../lib/db/hooks';
import {
  GlassCard,
  AccentBadge,
  SectionTitle,
  StatBlock,
  BottomSheet,
  SearchField,
  Avatar
} from '../shared';
import { staggerChildren, useCountUp } from '../../lib/animations';
import { 
  Check, 
  SlidersHorizontal,
  Plus, 
  ChevronDown, 
  ChevronUp, 
  Flame, 
  TrendingUp, 
  Users, 
  Clock, 
  Sparkles, 
  PlusCircle, 
  MessageSquare, 
  AlertTriangle, 
  FileText, 
  CheckCircle,
  HelpCircle,
  UserCheck,
  Trash2,
  Send,
  Mail,
  Phone,
  Calendar,
  MapPin,
  Search,
  ArrowLeft,
  UserPlus,
  X,
  Bell
} from 'lucide-react';

// ==========================================
// Confetti Animation Types & Component
// ==========================================
interface ConfettiParticle {
  id: number;
  x: number;
  y: number;
  color: string;
  size: number;
  angle: number;
  speed: number;
}

export function CellGroupModule() {
  const { user, role } = useCurrentUser();

  // 1. Role View Emulator Mode: 'admin' | 'leader' | 'pastor'
  const [currentRoleView, setCurrentRoleView] = useState<'admin' | 'leader' | 'pastor'>('leader');

  // Auto-detect role and set initial view mode
  const roleId = role?.id;
  useEffect(() => {
    if (roleId) {
      if (roleId === 'administrator') {
        setCurrentRoleView('admin');
      } else if (roleId === 'lead_pastor') {
        setCurrentRoleView('pastor');
      } else {
        setCurrentRoleView('leader');
      }
    }
  }, [roleId]);

  // --------------------------------------
  // Live Database Queries via useLiveQuery
  // --------------------------------------
  const allMembers = useLiveQuery(async () => {
    const raw = await db.members.filter(m => m.deletedAt === undefined).toArray();
    const seen = new Set<string>();
    return raw.filter(m => {
      if (!m.localId || seen.has(m.localId)) return false;
      seen.add(m.localId);
      return true;
    });
  }) || [];

  const cellGroups = useLiveQuery(async () => {
    const raw = await db.cellGroups.toArray();
    const seen = new Set<string>();
    return raw.filter(g => {
      if (!g.localId || seen.has(g.localId)) return false;
      seen.add(g.localId);
      return true;
    });
  }) || [];

  const sections = useLiveQuery(async () => {
    const raw = await db.sections.toArray();
    const seen = new Set<string>();
    return raw.filter(s => {
      if (!s.localId || seen.has(s.localId)) return false;
      seen.add(s.localId);
      return true;
    });
  }) || [];

  const cellMeetings = useLiveQuery(async () => {
    const raw = await db.cellMeetings.toArray();
    const seen = new Set<string>();
    return raw.filter(m => {
      if (!m.localId || seen.has(m.localId)) return false;
      seen.add(m.localId);
      return true;
    });
  }) || [];

  const cellAttendances = useLiveQuery(async () => {
    const raw = await db.cellAttendance.toArray();
    const seen = new Set<string>();
    return raw.filter(a => {
      if (!a.localId || seen.has(a.localId)) return false;
      seen.add(a.localId);
      return true;
    });
  }) || [];

  const cellReports = useLiveQuery(async () => {
    const raw = await db.cellReports.toArray();
    const seen = new Set<string>();
    return raw.filter(r => {
      if (!r.localId || seen.has(r.localId)) return false;
      seen.add(r.localId);
      return true;
    });
  }) || [];

  // Local state for notifications or audits triggers
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [confetti, setConfetti] = useState<ConfettiParticle[]>([]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const triggerHaptic = (ms = 15) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(ms);
      } catch (e) {}
    }
  };

  // ----------------------------------------------------------------------
  // ======================================================================
  // VIEW A: ADMIN VIEW — Cell Group Management (CMS)
  // ======================================================================
  // ----------------------------------------------------------------------
  const [adminSearch, setAdminSearch] = useState('');
  const [selectedCellForDetail, setSelectedCellForDetail] = useState<CellGroupRecord | null>(null);
  
  // Sheet States
  const [isGroupSheetOpen, setIsGroupSheetOpen] = useState(false);
  const [isAssignSheetOpen, setIsAssignSheetOpen] = useState(false);
  
  // Create / Edit Group Form State
  const [editingGroup, setEditingGroup] = useState<CellGroupRecord | null>(null);
  const [formName, setFormName] = useState('');
  const [formLeaderId, setFormLeaderId] = useState('');
  const [formSectionId, setFormSectionId] = useState('');
  const [formMeetingDay, setFormMeetingDay] = useState('Wednesday');
  const [formMeetingTime, setFormMeetingTime] = useState('19:30');
  const [formLocation, setFormLocation] = useState('');
  const [formStatus, setFormStatus] = useState<'Active' | 'Inactive'>('Active');
  const [leaderSearchQuery, setLeaderSearchQuery] = useState('');

  // Assign Members Selection State
  const [assignSearchQuery, setAssignSearchQuery] = useState('');
  const [selectedMemberIdsForAssign, setSelectedMemberIdsForAssign] = useState<string[]>([]);

  // Filter leaders list in CMS form (only members with 'cell_leader' or 'administrator' roles)
  const candidateLeaders = useMemo(() => {
    return allMembers.filter(m => {
      const isQualified = m.role === 'cell_leader' || m.role === 'administrator' || m.role === 'lead_pastor';
      const matchesSearch = m.fullName.toLowerCase().includes(leaderSearchQuery.toLowerCase()) || 
                            m.email.toLowerCase().includes(leaderSearchQuery.toLowerCase());
      return isQualified && matchesSearch;
    });
  }, [allMembers, leaderSearchQuery]);

  // Filter general members list for cell assignment
  const unassignedOrReassignableMembers = useMemo(() => {
    return allMembers.filter(m => {
      // Don't show if they are already in the CURRENT selected detail group
      if (selectedCellForDetail && m.cellGroupId === selectedCellForDetail.localId) {
        return false;
      }
      const matchesSearch = m.fullName.toLowerCase().includes(assignSearchQuery.toLowerCase()) ||
                            m.email.toLowerCase().includes(assignSearchQuery.toLowerCase());
      return matchesSearch;
    });
  }, [allMembers, selectedCellForDetail, assignSearchQuery]);

  // Open Create Group form
  const handleOpenCreateGroup = () => {
    triggerHaptic();
    setEditingGroup(null);
    setFormName('');
    setFormLeaderId(allMembers.find(m => m.role === 'cell_leader')?.localId || '');
    setFormSectionId(sections[0]?.localId || 'sec-central');
    setFormMeetingDay('Wednesday');
    setFormMeetingTime('19:30');
    setFormLocation('');
    setFormStatus('Active');
    setLeaderSearchQuery('');
    setIsGroupSheetOpen(true);
  };

  // Open Edit Group form
  const handleOpenEditGroup = (group: CellGroupRecord, e: React.MouseEvent) => {
    e.stopPropagation(); // prevent opening details
    triggerHaptic();
    setEditingGroup(group);
    setFormName(group.name);
    setFormLeaderId(group.leaderId);
    setFormSectionId(group.sectionId);
    setFormMeetingDay(group.meetingDay || 'Wednesday');
    setFormMeetingTime(group.meetingTime || '19:30');
    setFormLocation(group.location || '');
    setFormStatus(group.status || 'Active');
    setLeaderSearchQuery('');
    setIsGroupSheetOpen(true);
  };

  // Submit Create / Edit Group
  const handleSaveGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      showToast('Group name is required.');
      return;
    }
    triggerHaptic(20);

    const groupData = {
      name: formName,
      leaderId: formLeaderId,
      sectionId: formSectionId,
      meetingDay: formMeetingDay,
      meetingTime: formMeetingTime,
      location: formLocation,
      status: formStatus,
      syncStatus: 'pending' as const,
      updatedAt: new Date().toISOString()
    };

    if (editingGroup) {
      // Edit mode
      const dbGroup = await db.cellGroups.where('localId').equals(editingGroup.localId).first();
      if (dbGroup && dbGroup.id) {
        await db.cellGroups.update(dbGroup.id, groupData);
        showToast(`Cell Group "${formName}" updated successfully!`);
        // If details panel is open, update details
        if (selectedCellForDetail && selectedCellForDetail.localId === editingGroup.localId) {
          setSelectedCellForDetail({ ...selectedCellForDetail, ...groupData });
        }
      }
    } else {
      // Create mode
      const newCell = createLocalRecord<CellGroupRecord>({
        name: formName,
        leaderId: formLeaderId,
        sectionId: formSectionId,
        meetingDay: formMeetingDay,
        meetingTime: formMeetingTime,
        location: formLocation,
        status: formStatus
      });
      await db.cellGroups.add(newCell);
      showToast(`Cell Group "${formName}" created successfully!`);
    }

    setIsGroupSheetOpen(false);
    if (syncEngine.isOnline()) {
      syncEngine.syncNow().catch(console.error);
    }
  };

  // Remove member from group
  const handleRemoveMemberFromGroup = async (memberLocalId: string) => {
    triggerHaptic(20);
    const mRecord = await db.members.where('localId').equals(memberLocalId).first();
    if (mRecord && mRecord.id) {
      const oldName = mRecord.fullName;
      await db.members.update(mRecord.id, {
        cellGroupId: undefined,
        syncStatus: 'pending',
        updatedAt: new Date().toISOString()
      });
      showToast(`${oldName} removed from cell group roster.`);
      
      // Auto Audit Log
      await db.auditLogs.add({
        localId: generateUUID(),
        userId: user.localId,
        userName: user.name,
        action: 'cell_member_remove',
        details: `Removed ${oldName} from cell group roster.`,
        createdAt: new Date().toISOString()
      });

      if (syncEngine.isOnline()) {
        syncEngine.syncNow().catch(console.error);
      }
    }
  };

  // Toggle member selection for assignment
  const handleToggleMemberSelection = (memberLocalId: string) => {
    triggerHaptic(10);
    setSelectedMemberIdsForAssign(prev => {
      if (prev.includes(memberLocalId)) {
        return prev.filter(id => id !== memberLocalId);
      } else {
        return [...prev, memberLocalId];
      }
    });
  };

  // Save selected member assignments
  const handleSaveAssignments = async () => {
    if (!selectedCellForDetail) return;
    if (selectedMemberIdsForAssign.length === 0) {
      showToast('Please select at least one member to assign.');
      return;
    }
    triggerHaptic(25);

    const nowStr = new Date().toISOString();
    let assignedCount = 0;

    for (const mId of selectedMemberIdsForAssign) {
      const mRecord = await db.members.where('localId').equals(mId).first();
      if (mRecord && mRecord.id) {
        // Enforce ONE cell group: overwrite their cellGroupId
        await db.members.update(mRecord.id, {
          cellGroupId: selectedCellForDetail.localId,
          syncStatus: 'pending',
          updatedAt: nowStr
        });
        assignedCount++;
      }
    }

    showToast(`Successfully assigned ${assignedCount} members to "${selectedCellForDetail.name}"!`);
    
    // Auto Audit Log
    await db.auditLogs.add({
      localId: generateUUID(),
      userId: user.localId,
      userName: user.name,
      action: 'cell_members_assign',
      details: `Assigned ${assignedCount} members to cell group ${selectedCellForDetail.name}.`,
      createdAt: nowStr
    });

    setSelectedMemberIdsForAssign([]);
    setIsAssignSheetOpen(false);
    if (syncEngine.isOnline()) {
      syncEngine.syncNow().catch(console.error);
    }
  };

  // Filter cell groups based on search
  const filteredCellGroups = useMemo(() => {
    return cellGroups.filter(g => {
      const matchesSearch = g.name.toLowerCase().includes(adminSearch.toLowerCase()) ||
                            (g.location && g.location.toLowerCase().includes(adminSearch.toLowerCase()));
      return matchesSearch;
    });
  }, [cellGroups, adminSearch]);

  // Total metrics in CMS
  const totalCellGroups = cellGroups.length;
  const totalAssignedMembers = useMemo(() => {
    return allMembers.filter(m => m.cellGroupId).length;
  }, [allMembers]);


  // ----------------------------------------------------------------------
  // ======================================================================
  // VIEW B: CELL GROUP LEADER VIEW — Attendance Taking
  // ======================================================================
  // ----------------------------------------------------------------------
  const [leaderCellGroupId, setLeaderCellGroupId] = useState<string>('');

  // Auto-select cell group for leader
  useEffect(() => {
    if (cellGroups.length > 0) {
      const leaderCell = cellGroups.find(c => c.leaderId === user.localId);
      if (leaderCell) {
        setLeaderCellGroupId(leaderCell.localId);
      } else {
        setLeaderCellGroupId(cellGroups[0].localId);
      }
    }
  }, [cellGroups, user.localId]);

  // Current active cell group record
  const currentLeaderCell = useMemo(() => {
    return cellGroups.find(c => c.localId === leaderCellGroupId);
  }, [cellGroups, leaderCellGroupId]);

  // Find active meeting for this cell group
  const activeMeeting = useMemo(() => {
    return cellMeetings.find(m => m.cellGroupId === leaderCellGroupId && m.status === 'active');
  }, [cellMeetings, leaderCellGroupId]);

  // Roster of members pre-registered to this group
  const cellGroupRoster = useMemo(() => {
    return allMembers.filter(m => m.cellGroupId === leaderCellGroupId);
  }, [allMembers, leaderCellGroupId]);

  // Meeting Timer State
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (activeMeeting) {
      const fetchStartTime = async () => {
        const timerSetting = await db.appSettings.where('key').equals(`meeting_timer_${activeMeeting.localId}`).first();
        const startTime = timerSetting ? timerSetting.value : Date.now();
        
        const updateTimer = () => {
          const secs = Math.floor((Date.now() - startTime) / 1000);
          setElapsedSeconds(secs > 0 ? secs : 0);
        };
        
        updateTimer();
        interval = setInterval(updateTimer, 1000);
      };
      fetchStartTime();
    } else {
      setElapsedSeconds(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeMeeting]);

  // Start meeting procedure
  const handleStartMeeting = async () => {
    if (!leaderCellGroupId) {
      showToast('No cell group selected.');
      return;
    }
    triggerHaptic(20);
    const dateStr = new Date().toISOString().split('T')[0];

    // Create meeting record
    const newMeeting = createLocalRecord<CellMeetingRecord>({
      cellGroupId: leaderCellGroupId,
      meetingDate: dateStr,
      status: 'active'
    });
    await db.cellMeetings.add(newMeeting);

    // Auto-prepopulate attendance: default to 'absent' (which represents unmarked)
    const attendanceRecords = cellGroupRoster.map(m => createLocalRecord<CellAttendanceRecord>({
      meetingId: newMeeting.localId,
      memberId: m.localId,
      status: 'absent'
    }));

    if (attendanceRecords.length > 0) {
      await db.cellAttendance.bulkAdd(attendanceRecords);
    }

    // Save timer start time
    await db.appSettings.put({ key: `meeting_timer_${newMeeting.localId}`, value: Date.now() });

    showToast(`Fellowship meeting started for ${currentLeaderCell?.name}!`);
    if (syncEngine.isOnline()) {
      syncEngine.syncNow().catch(console.error);
    }
  };

  // Cycling the attendance status loop
  const handleCycleAttendance = async (memberLocalId: string) => {
    if (!activeMeeting) {
      showToast('Please start the fellowship meeting first.');
      return;
    }
    triggerHaptic(15);

    const existing = await db.cellAttendance
      .where('meetingId')
      .equals(activeMeeting.localId)
      .filter(att => att.memberId === memberLocalId)
      .first();

    let nextStatus: 'present' | 'absent' | 'excused' = 'absent';
    if (!existing || existing.status === 'absent') {
      nextStatus = 'present';
    } else if (existing.status === 'present') {
      nextStatus = 'excused';
    } else if (existing.status === 'excused') {
      nextStatus = 'absent';
    }

    if (existing && existing.id) {
      await db.cellAttendance.update(existing.id, {
        status: nextStatus,
        syncStatus: 'pending',
        updatedAt: new Date().toISOString()
      });
    } else {
      const newAtt = createLocalRecord<CellAttendanceRecord>({
        meetingId: activeMeeting.localId,
        memberId: memberLocalId,
        status: nextStatus
      });
      await db.cellAttendance.add(newAtt);
    }

    if (syncEngine.isOnline()) {
      syncEngine.syncNow().catch(console.error);
    }
  };

  // Live roll counts
  const liveRollCount = useMemo(() => {
    if (!activeMeeting) return { present: 0, excused: 0, absent: cellGroupRoster.length };
    
    const activeAtts = cellAttendances.filter(a => a.meetingId === activeMeeting.localId);
    let present = 0;
    let excused = 0;
    let absent = 0;

    cellGroupRoster.forEach(m => {
      const rec = activeAtts.find(a => a.memberId === m.localId);
      if (rec?.status === 'present') present++;
      else if (rec?.status === 'excused') excused++;
      else absent++;
    });

    return { present, excused, absent };
  }, [cellAttendances, activeMeeting, cellGroupRoster]);

  const presentCount = useCountUp(liveRollCount.present, 400);
  const excusedCount = useCountUp(liveRollCount.excused, 400);
  const absentCount = useCountUp(liveRollCount.absent, 400);

  // Adding Visitor Flows in Leader Attendance
  const [isAddingVisitor, setIsAddingVisitor] = useState(false);
  const [visitorName, setVisitorName] = useState('');
  const [visitorPhone, setVisitorPhone] = useState('');

  const handleAddVisitorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeMeeting) return;
    if (!visitorName.trim()) {
      showToast('Please enter the visitor\'s name.');
      return;
    }
    triggerHaptic(15);

    const visitorId = generateUUID();
    const avatarText = visitorName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

    // Create visitor as temporary member in DB
    const newVisitor: MemberRecord = createLocalRecord<MemberRecord>({
      fullName: visitorName,
      email: `${visitorName.toLowerCase().replace(/\s+/g, '')}@visitor.com`,
      phone: visitorPhone || '+1 (555) 019-9000',
      role: 'visitor',
      cellGroupId: leaderCellGroupId,
      qrCode: `VISITOR_${visitorName.replace(/\s+/g, '_').toUpperCase()}`,
      avatarText
    });
    await db.members.add(newVisitor);

    // Record attendance: automatically marked present
    const newAtt = createLocalRecord<CellAttendanceRecord>({
      meetingId: activeMeeting.localId,
      memberId: newVisitor.localId,
      status: 'present'
    });
    await db.cellAttendance.add(newAtt);

    setVisitorName('');
    setVisitorPhone('');
    setIsAddingVisitor(false);
    showToast(`Visitor "${newVisitor.fullName}" added and marked Present!`);

    if (syncEngine.isOnline()) {
      syncEngine.syncNow().catch(console.error);
    }
  };

  // End & Submit Fellowship State
  const [isSubmitOpen, setIsSubmitOpen] = useState(false);
  const [highlightsText, setHighlightsText] = useState('');
  const [challengesText, setChallengesText] = useState('');
  const [showChallengesField, setShowChallengesField] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // Formatted timer text
  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const secs = (totalSeconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  // Submission process
  const handleFinalReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeMeeting) return;
    if (!highlightsText.trim()) {
      showToast('Please summarize meeting highlights.');
      return;
    }
    triggerHaptic(35);

    const nowStr = new Date().toISOString();

    // Create Report Record
    const newReport = createLocalRecord<CellReportRecord>({
      meetingId: activeMeeting.localId,
      cellGroupId: leaderCellGroupId,
      highlights: highlightsText,
      challenges: challengesText || 'No challenges escalated today.',
      reportStatus: 'pending_review',
      submittedBy: user.name,
      attendanceCount: liveRollCount.present
    });
    await db.cellReports.add(newReport);

    // End Fellowship meeting in DB
    const dbMeeting = await db.cellMeetings.where('localId').equals(activeMeeting.localId).first();
    if (dbMeeting && dbMeeting.id) {
      await db.cellMeetings.update(dbMeeting.id, {
        status: 'completed',
        syncStatus: 'pending',
        updatedAt: nowStr
      });
    }

    // Clean up timer start time
    await db.appSettings.where('key').equals(`meeting_timer_${activeMeeting.localId}`).delete();

    // Create notification for Lead Pastor
    await db.notifications.add({
      localId: generateUUID(),
      userId: 'user-pastor-david', // Lead Pastor ID
      type: 'report',
      title: 'New Fellowship Report',
      message: `Cell report submitted by ${user.name} for ${currentLeaderCell?.name}.`,
      isRead: false,
      createdAt: nowStr
    });

    // Fire browser push notification if permitted
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      new Notification('Cell Report Submitted', {
        body: `Leader ${user.name} submitted attendance for ${currentLeaderCell?.name}.`
      });
    }

    setSubmitSuccess(true);
    if (syncEngine.isOnline()) {
      syncEngine.syncNow().catch(console.error);
    }
  };

  const handleDoneReset = () => {
    setIsSubmitOpen(false);
    setSubmitSuccess(false);
    setHighlightsText('');
    setChallengesText('');
    setShowChallengesField(false);
    showToast('Report submitted successfully for pastoral review!');
  };


  // ----------------------------------------------------------------------
  // ======================================================================
  // VIEW C: LEAD PASTOR VIEW — Report Review
  // ======================================================================
  // ----------------------------------------------------------------------
  const [pastorTab, setPastorTab] = useState<'Pending' | 'Approved' | 'All'>('Pending');
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);

  // Missing reports calculations (Delinquents)
  const delinquentCells = useMemo(() => {
    // Find cells that do NOT have any meetings/reports in current week or list all cells with zero reports as a reminder
    // For demonstration, let's list cells that have no active or completed meetings for today
    const activeAndCompletedMeetings = cellMeetings.map(m => m.cellGroupId);
    return cellGroups.filter(c => !activeAndCompletedMeetings.includes(c.localId));
  }, [cellGroups, cellMeetings]);

  const handleSendReminder = async (cellGroup: CellGroupRecord) => {
    triggerHaptic(20);
    const leaderName = allMembers.find(m => m.localId === cellGroup.leaderId)?.fullName || 'Cell Leader';

    // Create Notification in local DB for the leader
    await db.notifications.add({
      localId: generateUUID(),
      userId: cellGroup.leaderId,
      type: 'report',
      title: 'Overdue Fellowship Report',
      message: `Lead Pastor David requested you submit the Weekly Report for "${cellGroup.name}".`,
      isRead: false,
      createdAt: new Date().toISOString()
    });

    showToast(`Push reminder dispatched to cell leader ${leaderName}!`);
  };

  // Confetti Blast Effect on Report Approval
  const handleConfettiBlast = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const startX = rect.left + rect.width / 2;
    const startY = rect.top + rect.height / 2;

    const colors = ['#D4A84A', '#7BC47F', '#C8A45C', '#F3E5AB', '#FFFFFF'];
    const particles: ConfettiParticle[] = [];

    for (let i = 0; i < 45; i++) {
      particles.push({
        id: Date.now() + i,
        x: startX,
        y: startY,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: Math.random() * 6 + 4,
        angle: Math.random() * Math.PI * 2,
        speed: Math.random() * 8 + 4
      });
    }

    setConfetti(particles);

    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      if (elapsed > 900) {
        setConfetti([]);
        clearInterval(interval);
      } else {
        setConfetti(prev => 
          prev.map(p => {
            const angleX = Math.cos(p.angle) * p.speed;
            const angleY = Math.sin(p.angle) * p.speed + 1.4; // subtle gravity pull
            return { ...p, x: p.x + angleX, y: p.y + angleY };
          })
        );
      }
    }, 16);
  };

  // Approve Report Procedure
  const handleApproveReport = async (reportLocalId: string, event: React.MouseEvent) => {
    triggerHaptic(30);
    handleConfettiBlast(event);

    const nowStr = new Date().toISOString();
    const reportRecord = await db.cellReports.where('localId').equals(reportLocalId).first();
    if (reportRecord && reportRecord.id) {
      // Update report status
      await db.cellReports.update(reportRecord.id, {
        reportStatus: 'approved',
        syncStatus: 'pending',
        updatedAt: nowStr
      });

      // Fetch group details to find leader
      const groupRecord = await db.cellGroups.where('localId').equals(reportRecord.cellGroupId).first();
      if (groupRecord) {
        // Send notification to cell leader
        await db.notifications.add({
          localId: generateUUID(),
          userId: groupRecord.leaderId,
          type: 'report',
          title: 'Report Approved ✓',
          message: `Your Weekly Fellowship Report for "${groupRecord.name}" has been approved by Lead Pastor.`,
          isRead: false,
          createdAt: nowStr
        });
      }

      showToast('Cell Group report approved successfully!');
      if (syncEngine.isOnline()) {
        syncEngine.syncNow().catch(console.error);
      }
    }
  };

  // Filter and display reports
  const filteredReports = useMemo(() => {
    return cellReports.filter(r => {
      if (pastorTab === 'All') return true;
      if (pastorTab === 'Pending') return r.reportStatus === 'pending_review';
      if (pastorTab === 'Approved') return r.reportStatus === 'approved';
      return true;
    });
  }, [cellReports, pastorTab]);

  const pendingReportsCount = useMemo(() => {
    return cellReports.filter(r => r.reportStatus === 'pending_review').length;
  }, [cellReports]);


  return (
    <div className="space-y-4 flex flex-col h-full select-none pb-12 relative">
      
      {/* Confetti Particle Layer */}
      {confetti.length > 0 && (
        <div className="fixed inset-0 pointer-events-none z-100 overflow-hidden">
          {confetti.map((p) => (
            <div
              key={p.id}
              className="absolute rounded-full"
              style={{
                left: p.x,
                top: p.y,
                width: p.size,
                height: p.size,
                backgroundColor: p.color,
                boxShadow: `0 0 6px ${p.color}80`
              }}
            />
          ))}
        </div>
      )}

      {/* Floating Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[200] bg-zinc-900 border border-gold-500/30 px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 max-w-sm w-[90%] text-left"
          >
            <div className="w-2 h-2 rounded-full bg-gold-500 animate-ping" />
            <span className="text-xs font-semibold text-text-primary leading-tight">
              {toastMessage}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --------------------------------------
          CAPSULE MODULE SWITCHER (3 ROLES)
         -------------------------------------- */}
      <div className="flex justify-center px-1">
        <div className="bg-surface-100 p-0.5 rounded-full flex gap-1 w-full max-w-[340px] border border-white/5">
          <button
            id="role-btn-admin"
            onClick={() => { triggerHaptic(); setCurrentRoleView('admin'); }}
            className={`flex-1 py-1.5 rounded-full text-[10px] font-black tracking-wider uppercase transition-all flex items-center justify-center gap-1 cursor-pointer ${
              currentRoleView === 'admin'
                ? 'bg-gold-500 text-black shadow-sm'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            <SlidersHorizontal className="w-3 h-3" />
            Admin CMS
          </button>
          
          <button
            id="role-btn-leader"
            onClick={() => { triggerHaptic(); setCurrentRoleView('leader'); }}
            className={`flex-1 py-1.5 rounded-full text-[10px] font-black tracking-wider uppercase transition-all flex items-center justify-center gap-1 cursor-pointer ${
              currentRoleView === 'leader'
                ? 'bg-gold-500 text-black shadow-sm'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            <Users className="w-3 h-3" />
            Leader Roll
          </button>
          
          <button
            id="role-btn-pastor"
            onClick={() => { triggerHaptic(); setCurrentRoleView('pastor'); }}
            className={`flex-1 py-1.5 rounded-full text-[10px] font-black tracking-wider uppercase transition-all flex items-center justify-center gap-1 cursor-pointer ${
              currentRoleView === 'pastor'
                ? 'bg-gold-500 text-black shadow-sm'
                : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            <UserCheck className="w-3 h-3" />
            Pastor Rev
          </button>
        </div>
      </div>


      {/* ======================================================================
          VIEW A: ADMIN VIEW — Cell Group Management (CMS)
          ====================================================================== */}
      {currentRoleView === 'admin' && (
        <div className="space-y-4 flex-1 flex flex-col">
          
          {!selectedCellForDetail ? (
            <>
              {/* CMS Overview Header */}
              <SectionTitle
                title="Cell Groups"
                action={{ label: "+ Create Group", onPress: handleOpenCreateGroup }}
              />

              {/* Bento Stats row */}
              <div className="grid grid-cols-2 gap-3">
                <StatBlock
                  id="stat-total-cells"
                  icon={<Users className="w-4.5 h-4.5" />}
                  value={totalCellGroups}
                  label="Total Cell Groups"
                />
                <StatBlock
                  id="stat-assigned-members"
                  icon={<UserCheck className="w-4.5 h-4.5" />}
                  value={totalAssignedMembers}
                  label="Registered Saints"
                  highlight
                />
              </div>

              {/* Search Bar for registry */}
              <SearchField
                id="cms-registry-search"
                placeholder="Search cells name, leader, location..."
                value={adminSearch}
                onChange={setAdminSearch}
              />

              {/* Roster of Cell Groups Registry */}
              <motion.div
                variants={staggerChildren.container}
                initial="initial"
                animate="animate"
                className="space-y-3 flex-1 overflow-y-auto max-h-[380px] scrollbar-none pb-4"
              >
                {filteredCellGroups.length === 0 ? (
                  <div className="py-12 text-center bg-white/[0.01] border border-white/5 rounded-2xl p-4">
                    <Users className="w-10 h-10 text-text-muted mx-auto mb-2" />
                    <p className="text-xs font-semibold text-text-secondary">No cell groups found</p>
                    <p className="text-[10px] text-text-muted mt-0.5">Try a different search or create a new group.</p>
                  </div>
                ) : (
                  filteredCellGroups.map((group) => {
                    // Gather leader
                    const leader = allMembers.find(m => m.localId === group.leaderId);
                    const leaderName = leader ? leader.fullName : 'No leader';

                    // Gather district
                    const district = sections.find(s => s.localId === group.sectionId);
                    const districtName = district ? district.name : 'Unknown District';

                    // Gather member count
                    const groupMemberCount = allMembers.filter(m => m.cellGroupId === group.localId).length;

                    // Group Status
                    const isActive = group.status !== 'Inactive';

                    return (
                      <motion.div key={group.localId} variants={staggerChildren.child}>
                      <GlassCard
                        id={`cell-card-${group.localId}`}
                        pressable
                        onPress={() => { triggerHaptic(); setSelectedCellForDetail(group); }}
                        className="p-4 border-l-4 border-l-gold-500/40 hover:border-l-gold-500 transition-all flex flex-col gap-2 relative group"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <Avatar name={leaderName} size="md" />
                            <div>
                              <h4 className="text-sm font-extrabold text-text-primary group-hover:text-gold-400 transition-colors">
                                {group.name}
                              </h4>
                              <p className="text-[10px] text-text-secondary font-medium">
                                Leader: <strong className="text-text-primary">{leaderName}</strong>
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-1.5">
                            <span className={`text-[9px] font-black tracking-widest px-2 py-0.5 rounded-full ${
                              isActive ? 'bg-[#7BC47F]/15 text-[#7BC47F]' : 'bg-surface-200 text-text-muted'
                            }`}>
                              {isActive ? 'Active' : 'Inactive'}
                            </span>
                            <span className="text-[10px] font-bold text-text-muted bg-white/5 px-2 py-0.5 rounded-md">
                              {groupMemberCount} members
                            </span>
                          </div>
                        </div>

                        {/* Meeting details strip */}
                        <div className="grid grid-cols-2 gap-1 bg-white/[0.02] p-2 rounded-lg border border-white/5 text-[10px] text-text-secondary font-medium mt-1">
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-gold-500/75" />
                            <span>{group.meetingDay || 'Wednesday'} at {group.meetingTime || '19:30'}</span>
                          </div>
                          <div className="flex items-center gap-1 truncate">
                            <MapPin className="w-3.5 h-3.5 text-gold-500/75" />
                            <span className="truncate">{group.location || 'House Fellowship'}</span>
                          </div>
                        </div>

                        {/* Quick Action Button overlay */}
                        <span
                          id={`edit-group-btn-${group.localId}`}
                          onClick={(e) => handleOpenEditGroup(group, e)}
                          className="absolute bottom-12 right-4 text-[10px] font-extrabold text-gold-500 hover:underline cursor-pointer bg-black/40 px-2.5 py-1 rounded-md border border-gold-500/20"
                          role="button"
                          tabIndex={0}
                        >
                          Configure
                        </span>
                      </GlassCard>
                      </motion.div>
                    );
                  })
                )}
              </motion.div>
            </>
          ) : (
            // ==========================================
            // SUBVIEW: CELL GROUP DETAIL & ROSTER MANAGEMENT
            // ==========================================
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-4 flex-1 flex flex-col text-left"
            >
              {/* Back Header */}
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <button
                  id="cms-detail-back-btn"
                  onClick={() => setSelectedCellForDetail(null)}
                  className="flex items-center gap-1.5 text-xs font-bold text-text-muted hover:text-text-secondary cursor-pointer h-9 px-1"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to Registry
                </button>
                <button
                  id="cms-detail-edit-btn"
                  onClick={(e) => handleOpenEditGroup(selectedCellForDetail, e)}
                  className="px-3.5 py-1 bg-gold-500 text-black font-extrabold text-xs rounded-pill cursor-pointer hover:bg-gold-400 transition-colors"
                >
                  Edit Details
                </button>
              </div>

              {/* Group Overview card */}
              <GlassCard className="p-4 bg-gradient-to-r from-surface-100 to-surface-200 border border-white/10">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-base font-black text-text-primary">{selectedCellForDetail.name}</h3>
                    <p className="text-xs text-text-secondary mt-1 font-semibold">
                      District: <span className="text-gold-500 font-extrabold">{sections.find(s => s.localId === selectedCellForDetail.sectionId)?.name || 'Central District'}</span>
                    </p>
                  </div>
                  <AccentBadge 
                    label={selectedCellForDetail.status || 'Active'} 
                    variant={selectedCellForDetail.status === 'Inactive' ? 'muted' : 'sage'} 
                    size="sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 mt-4 border-t border-white/5 pt-3 text-xs text-text-secondary">
                  <div>
                    <p className="text-[10px] text-text-muted uppercase tracking-wider font-extrabold">Weekly Gathering</p>
                    <p className="font-bold text-text-primary mt-0.5">{selectedCellForDetail.meetingDay || 'Wednesday'}s at {selectedCellForDetail.meetingTime || '19:30'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-text-muted uppercase tracking-wider font-extrabold">Fellowship Host</p>
                    <p className="font-bold text-text-primary mt-0.5 truncate">{selectedCellForDetail.location || 'House Fellowship'}</p>
                  </div>
                </div>
              </GlassCard>

              {/* ROSTER / MEMBERS SECTION */}
              <div className="space-y-2 flex-1 flex flex-col min-h-0">
                <div className="flex justify-between items-center px-1">
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-widest text-text-secondary">
                      Members Roster
                    </h4>
                    <p className="text-[10px] text-text-muted">Pre-registered cell attendees managed by admin</p>
                  </div>
                  <button
                    id="add-roster-member-btn"
                    onClick={() => { triggerHaptic(); setSelectedMemberIdsForAssign([]); setAssignSearchQuery(''); setIsAssignSheetOpen(true); }}
                    className="flex items-center gap-1 text-[11px] font-extrabold text-gold-500 hover:underline cursor-pointer py-1"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    + Add Members
                  </button>
                </div>

                {/* Member Roster List */}
                <div className="flex-1 overflow-y-auto max-h-[240px] border border-white/5 rounded-2xl bg-white/[0.01] p-1.5 scrollbar-none">
                  {allMembers.filter(m => m.cellGroupId === selectedCellForDetail.localId).length === 0 ? (
                    <div className="py-8 text-center text-text-muted flex flex-col items-center justify-center">
                      <Users className="w-8 h-8 opacity-40 mb-2" />
                      <p className="text-xs font-semibold">Roster is empty</p>
                      <p className="text-[9px] mt-0.5">Click "+ Add Members" to populate this cell group.</p>
                    </div>
                  ) : (
                    allMembers.filter(m => m.cellGroupId === selectedCellForDetail.localId).map((member) => (
                      <div
                        key={member.localId}
                        className="h-12 flex items-center justify-between px-3 rounded-xl hover:bg-white/[0.02] border-b border-white/[0.02] transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-surface-200 text-xs font-bold flex items-center justify-center">
                            {member.avatarText || 'M'}
                          </div>
                          <div>
                            <span className="text-xs font-extrabold text-text-primary block">{member.fullName}</span>
                            <span className="text-[9px] text-text-muted mt-0.5 font-medium">{member.phone || 'No phone'}</span>
                          </div>
                        </div>

                        {/* Remove Action Button */}
                        <button
                          id={`remove-member-${member.localId}`}
                          onClick={() => handleRemoveMemberFromGroup(member.localId)}
                          className="w-8 h-8 rounded-full bg-white/[0.03] hover:bg-cathedral-500/10 text-text-muted hover:text-cathedral-400 flex items-center justify-center transition-colors cursor-pointer"
                          title="Remove member from roster"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* CREATE/EDIT CELL GROUP SHEET */}
          <BottomSheet
            id="cms-create-group-sheet"
            isOpen={isGroupSheetOpen}
            onClose={() => setIsGroupSheetOpen(false)}
            title={editingGroup ? "Configure Cell Group" : "Create Cell Group"}
          >
            <form onSubmit={handleSaveGroup} className="space-y-4 pb-6 pt-2 text-left">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-text-muted uppercase tracking-wider block">Group Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Hope Cell, Grace fellowship"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full h-11 bg-surface-100 border border-white/5 rounded-xl px-3.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500 font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-text-muted uppercase tracking-wider block">District / Section</label>
                  <select
                    value={formSectionId}
                    onChange={(e) => setFormSectionId(e.target.value)}
                    className="w-full h-11 bg-surface-100 border border-white/5 rounded-xl px-3 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500 font-semibold"
                  >
                    {sections.map(s => (
                      <option key={s.localId} value={s.localId}>{s.name}</option>
                    ))}
                    {sections.length === 0 && <option value="sec-central">Central District</option>}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-text-muted uppercase tracking-wider block">Status</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as 'Active' | 'Inactive')}
                    className="w-full h-11 bg-surface-100 border border-white/5 rounded-xl px-3 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500 font-semibold"
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              </div>

              {/* Searchable Leader Selection */}
              <div className="space-y-1">
                <label className="text-[10px] font-black text-text-muted uppercase tracking-wider block">Search & Select Leader</label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Type name to filter leaders..."
                    value={leaderSearchQuery}
                    onChange={(e) => setLeaderSearchQuery(e.target.value)}
                    className="w-full h-10 bg-surface-100 border border-white/5 rounded-t-xl px-3.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500 font-medium"
                  />
                  <div className="bg-surface-100 border border-white/5 max-h-[110px] overflow-y-auto rounded-b-xl p-1 divide-y divide-white/5 scrollbar-thin">
                    {candidateLeaders.length === 0 ? (
                      <p className="text-[10px] text-text-muted p-2">No qualified leaders found</p>
                    ) : (
                      candidateLeaders.map(m => (
                        <button
                          key={m.localId}
                          type="button"
                          onClick={() => { setFormLeaderId(m.localId); setLeaderSearchQuery(m.fullName); }}
                          className={`w-full text-left p-2 hover:bg-white/[0.03] text-xs transition-colors flex items-center justify-between cursor-pointer ${
                            formLeaderId === m.localId ? 'text-gold-500 font-bold bg-white/[0.01]' : 'text-text-secondary'
                          }`}
                        >
                          <span>{m.fullName} ({m.role.replace('_', ' ')})</span>
                          {formLeaderId === m.localId && <Check className="w-3.5 h-3.5" />}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-text-muted uppercase tracking-wider block">Meeting Day</label>
                  <select
                    value={formMeetingDay}
                    onChange={(e) => setFormMeetingDay(e.target.value)}
                    className="w-full h-11 bg-surface-100 border border-white/5 rounded-xl px-3 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500 font-semibold"
                  >
                    {['Wednesday', 'Friday', 'Thursday', 'Saturday', 'Sunday', 'Monday', 'Tuesday'].map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-text-muted uppercase tracking-wider block">Meeting Time</label>
                  <input
                    type="time"
                    required
                    value={formMeetingTime}
                    onChange={(e) => setFormMeetingTime(e.target.value)}
                    className="w-full h-11 bg-surface-100 border border-white/5 rounded-xl px-3 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500 font-semibold"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black text-text-muted uppercase tracking-wider block">Host Location</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sister Abigail's residence, Main Annex Room B"
                  value={formLocation}
                  onChange={(e) => setFormLocation(e.target.value)}
                  className="w-full h-11 bg-surface-100 border border-white/5 rounded-xl px-3.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500 font-semibold"
                />
              </div>

              <button
                type="submit"
                className="w-full h-12 bg-gold-500 hover:bg-gold-400 text-black font-extrabold text-xs rounded-pill shadow-glow-gold transition-all cursor-pointer mt-2"
              >
                {editingGroup ? "Apply Configuration" : "Deploy Cell Group"}
              </button>
            </form>
          </BottomSheet>

          {/* ROSTER ADD MEMBERS SELECTION SHEET */}
          <BottomSheet
            id="cms-assign-members-sheet"
            isOpen={isAssignSheetOpen}
            onClose={() => setIsAssignSheetOpen(false)}
            title="Assign Members to Group"
          >
            <div className="space-y-4 pb-6 pt-2 text-left">
              <p className="text-[11px] text-text-muted font-medium">
                Saints selected below will be registered to <strong className="text-gold-500">{selectedCellForDetail?.name}</strong>. Enforcing one group membership.
              </p>

              <SearchField
                placeholder="Search saints by name or email..."
                value={assignSearchQuery}
                onChange={setAssignSearchQuery}
              />

              <div className="bg-surface-100 border border-white/5 rounded-xl divide-y divide-white/5 max-h-[220px] overflow-y-auto p-1.5 scrollbar-thin">
                {unassignedOrReassignableMembers.length === 0 ? (
                  <p className="text-[10px] text-text-muted text-center py-6 font-semibold">No candidates found</p>
                ) : (
                  unassignedOrReassignableMembers.map(m => {
                    const isSelected = selectedMemberIdsForAssign.includes(m.localId);
                    const currentCell = cellGroups.find(c => c.localId === m.cellGroupId);

                    return (
                      <div
                        key={m.localId}
                        onClick={() => handleToggleMemberSelection(m.localId)}
                        className="p-2.5 hover:bg-white/[0.02] flex items-center justify-between transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            readOnly
                            className="rounded text-gold-500 focus:ring-0 focus:ring-offset-0"
                          />
                          <div>
                            <span className="text-xs font-extrabold text-text-primary block">{m.fullName}</span>
                            <span className="text-[9px] text-text-muted">
                              {currentCell ? `Reassign from: ${currentCell.name}` : "Unassigned / Seeker"}
                            </span>
                          </div>
                        </div>

                        <span className="text-[9px] font-bold text-text-muted uppercase tracking-wider px-2 bg-white/5 rounded">
                          {m.role.replace('_', ' ')}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => setIsAssignSheetOpen(false)}
                  className="h-11 border border-white/5 text-text-secondary hover:bg-white/5 text-xs font-bold rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveAssignments}
                  className="h-11 bg-gold-500 hover:bg-gold-400 text-black text-xs font-extrabold rounded-xl transition-all cursor-pointer"
                >
                  Add Selected ({selectedMemberIdsForAssign.length})
                </button>
              </div>
            </div>
          </BottomSheet>
        </div>
      )}


      {/* ======================================================================
          VIEW B: CELL GROUP LEADER VIEW — Attendance Taking
          ====================================================================== */}
      {currentRoleView === 'leader' && (
        <div className="space-y-4 flex-1 flex flex-col justify-between">
          
          <div className="space-y-4 text-left">
            {/* Header / Cell group selector for leaders simulation */}
            <div className="flex items-start justify-between">
              <div>
                <SectionTitle
                  title={currentLeaderCell?.name || "Alpha Cell"}
                  badge={{
                    label: `${cellGroupRoster.length} members`,
                    variant: "muted"
                  }}
                />
                <p className="text-[10px] text-text-muted px-1 mt-0.5">Today is: <strong className="text-text-secondary">{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</strong></p>
              </div>

              {/* Developer Test Cell Selector */}
              {cellGroups.length > 1 && (
                <div className="flex flex-col items-end gap-1">
                  <span className="text-[8px] font-black text-gold-500 uppercase tracking-widest">Active Group</span>
                  <select
                    value={leaderCellGroupId}
                    onChange={(e) => { triggerHaptic(); setLeaderCellGroupId(e.target.value); }}
                    className="bg-surface-100 border border-white/5 rounded-lg px-2 py-1 text-[10px] text-text-primary focus:outline-none"
                  >
                    {cellGroups.map(g => (
                      <option key={g.localId} value={g.localId}>{g.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Sub-Header / Active Meeting Banner */}
            {!activeMeeting ? (
              <button
                id="start-fellowship-btn"
                onClick={handleStartMeeting}
                className="w-full h-12 rounded-xl border border-gold-500/40 text-gold-500 font-extrabold text-sm flex items-center justify-center gap-2 hover:bg-gold-500/5 active:scale-[0.98] transition-all cursor-pointer shadow-sm shadow-glow-gold/5"
              >
                <Flame className="w-4 h-4 text-gold-500 fill-gold-500/25" />
                Start Fellowship Meeting
              </button>
            ) : (
              <GlassCard className="border-l-4 border-l-[#7BC47F] p-4 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-[#7BC47F]/10 flex items-center justify-center text-[#7BC47F]">
                    <Clock className="w-4.5 h-4.5 animate-pulse" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-text-primary">
                      Fellowship Active (Timer)
                    </h4>
                    <span className="text-xs font-mono font-extrabold text-[#7BC47F]">
                      {formatTimer(elapsedSeconds)}
                    </span>
                  </div>
                </div>

                <button
                  id="end-fellowship-trigger"
                  onClick={() => { triggerHaptic(); setIsSubmitOpen(true); }}
                  className="px-4 py-1.5 bg-gold-500/10 hover:bg-gold-500/20 text-gold-500 font-extrabold text-xs rounded-pill transition-all cursor-pointer border border-gold-500/20"
                >
                  End & Submit
                </button>
              </GlassCard>
            )}

            {/* Roster list view */}
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest block px-1">
                Roll Call Checklist
              </span>

              <motion.div
                variants={staggerChildren.container}
                initial="initial"
                animate="animate"
                className="space-y-1 bg-white/[0.01] border border-white/5 rounded-2xl p-1.5 overflow-y-auto max-h-[290px] scrollbar-none"
              >
                {cellGroupRoster.length === 0 ? (
                  <p className="text-xs text-text-muted text-center py-8">No saints pre-registered in this cell group.</p>
                ) : (
                  cellGroupRoster.map((member) => {
                    const attRecord = activeMeeting
                      ? cellAttendances.find(a => a.meetingId === activeMeeting.localId && a.memberId === member.localId)
                      : null;

                    const isPresent = attRecord?.status === 'present';
                    const isExcused = attRecord?.status === 'excused';
                    const isUnmarked = !attRecord || attRecord.status === 'absent';

                    return (
                      <motion.div
                        key={member.localId}
                        variants={staggerChildren.child}
                        className="h-16 flex items-center justify-between px-3 hover:bg-white/[0.01] rounded-xl transition-all border-b border-white/[0.02]"
                      >
                        {/* Avatar + name details */}
                        <div className="flex items-center gap-3">
                          <Avatar
                            name={member.fullName}
                            size="sm"
                            ringClassName={isPresent ? 'ring-2 ring-[#7BC47F] ring-offset-1 ring-offset-background' : ''}
                          />
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-semibold text-text-primary">
                                {member.fullName}
                              </span>
                              {member.role === 'visitor' && (
                                <AccentBadge label="Visitor" variant="gold" size="sm" />
                              )}
                            </div>
                            <span className="text-[10px] text-text-secondary mt-0.5">
                              {member.role === 'visitor' ? 'First-time Seeker' : 'Cell Member'}
                            </span>
                          </div>
                        </div>

                        {/* Three-State Toggle triggers */}
                        <button
                          id={`toggle-btn-${member.localId}`}
                          onClick={() => handleCycleAttendance(member.localId)}
                          className="w-11 h-11 rounded-full flex items-center justify-center cursor-pointer transition-transform active:scale-[0.9]"
                          title="Cycle through Present / Excused / Absent"
                        >
                          <AnimatePresence mode="wait">
                            {isUnmarked && (
                              <motion.div
                                key="unmarked"
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0 }}
                                className="w-7 h-7 rounded-full border border-surface-300 flex items-center justify-center text-text-muted"
                              />
                            )}

                            {isPresent && (
                              <motion.div
                                key="present"
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: [0, 1.2, 1], opacity: 1 }}
                                exit={{ opacity: 0, scale: 0.3 }}
                                transition={{ duration: 0.3, ease: 'easeOut' }}
                                className="w-7 h-7 rounded-full bg-[#7BC47F] flex items-center justify-center text-white"
                              >
                                <Check className="w-4 h-4 stroke-[3px]" />
                              </motion.div>
                            )}

                            {isExcused && (
                              <motion.div
                                key="excused"
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: [0, 1.2, 1], opacity: 1 }}
                                exit={{ opacity: 0, scale: 0.3 }}
                                transition={{ duration: 0.3, ease: 'easeOut' }}
                                className="w-7 h-7 rounded-full bg-gold-500 flex items-center justify-center text-black font-black"
                              >
                                <div className="w-2.5 h-0.5 bg-black rounded" />
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </button>
                      </motion.div>
                    );
                  })
                )}

                {/* Inline Seeker/Visitor form */}
                {!isAddingVisitor ? (
                  <button
                    id="add-visitor-trigger"
                    onClick={() => { triggerHaptic(); setIsAddingVisitor(true); }}
                    className="w-full h-11 mt-1 flex items-center justify-center gap-1.5 text-xs font-bold text-gold-500 hover:bg-gold-500/5 rounded-xl cursor-pointer transition-colors border border-dashed border-gold-500/20"
                  >
                    <PlusCircle className="w-4 h-4" />
                    + Add Visitor
                  </button>
                ) : (
                  <motion.form
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    onSubmit={handleAddVisitorSubmit}
                    className="mt-2 p-3 bg-white/[0.02] border border-white/5 rounded-xl space-y-3"
                  >
                    <div className="grid grid-cols-2 gap-2.5">
                      <input
                        type="text"
                        required
                        placeholder="Visitor Name"
                        value={visitorName}
                        onChange={(e) => setVisitorName(e.target.value)}
                        className="bg-surface-100 border border-white/5 rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500"
                      />
                      <input
                        type="text"
                        placeholder="Phone No"
                        value={visitorPhone}
                        onChange={(e) => setVisitorPhone(e.target.value)}
                        className="bg-surface-100 border border-white/5 rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500"
                      />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => setIsAddingVisitor(false)}
                        className="px-3 py-1 bg-surface-100 hover:bg-surface-200 rounded-pill text-[10px] font-bold text-text-secondary"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-1 bg-gold-500 hover:bg-gold-400 text-black rounded-pill text-[10px] font-black"
                      >
                        Enroll Visitor
                      </button>
                    </div>
                  </motion.form>
                )}
              </motion.div>
            </div>
          </div>

          {/* Sticky Summary bar above tab navigation */}
          <GlassCard variant="elevated" className="p-3.5 flex items-center justify-between border border-white/5 shadow-lg mt-3">
            <div className="text-[11px] font-bold text-text-secondary flex items-center gap-1.5 w-full justify-between">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#7BC47F] animate-pulse" /> Live Metrics:</span>
              <div className={`flex gap-2.5 text-xs ${Typography.METRIC}`}>
                <span className="text-[#7BC47F] font-black">{presentCount} present</span>
                <span className="text-text-muted font-light">•</span>
                <span className="text-gold-400 font-black">{excusedCount} excused</span>
                <span className="text-text-muted font-light">•</span>
                <span className="text-text-muted font-bold">{absentCount} absent</span>
              </div>
            </div>
          </GlassCard>

          {/* ATTENDANCE END REPORT SHEET */}
          <BottomSheet
            id="attendance-end-sheet"
            isOpen={isSubmitOpen}
            onClose={() => { if (!submitSuccess) setIsSubmitOpen(false); }}
            title="House Fellowship Summary"
          >
            <div className="space-y-4 pb-6 text-left">
              
              <AnimatePresence mode="wait">
                {!submitSuccess ? (
                  <form onSubmit={handleFinalReportSubmit} className="space-y-4">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-text-muted block mb-2">
                        Weekly Metrics
                      </span>
                      <div className="grid grid-cols-3 gap-2.5">
                        <div className="bg-[#7BC47F]/10 border border-[#7BC47F]/15 rounded-xl p-3 text-center">
                          <span className="block text-lg font-black text-[#7BC47F] font-mono">
                            {liveRollCount.present}
                          </span>
                          <span className="text-[9px] font-black text-[#7BC47F] uppercase tracking-wider">
                            Present
                          </span>
                        </div>
                        
                        <div className="bg-gold-500/10 border border-gold-500/15 rounded-xl p-3 text-center">
                          <span className="block text-lg font-black text-gold-400 font-mono">
                            {liveRollCount.excused}
                          </span>
                          <span className="text-[9px] font-black text-gold-400 uppercase tracking-wider">
                            Excused
                          </span>
                        </div>

                        <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3 text-center">
                          <span className="block text-lg font-black text-text-muted font-mono">
                            {liveRollCount.absent}
                          </span>
                          <span className="text-[9px] font-black text-text-muted uppercase tracking-wider">
                            Absent
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-text-muted uppercase tracking-wider block">Meeting Highlights</label>
                      <textarea
                        required
                        placeholder="praise reports, scripture break-outs, breakthroughs..."
                        value={highlightsText}
                        onChange={(e) => setHighlightsText(e.target.value)}
                        className="w-full h-20 bg-surface-100 border border-white/5 rounded-xl px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500 resize-none font-medium leading-relaxed"
                      />
                    </div>

                    {/* Collapsible challenges textarea */}
                    <div className="space-y-1">
                      {!showChallengesField ? (
                        <button
                          type="button"
                          onClick={() => setShowChallengesField(true)}
                          className="text-xs font-bold text-gold-500 hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" /> + Add Challenges / Escalations
                        </button>
                      ) : (
                        <div className="space-y-1.5">
                          <div className="flex justify-between items-center">
                            <label className="text-[10px] font-black text-cathedral-400 uppercase tracking-wider">Struggles / Prayer Requests</label>
                            <button
                              type="button"
                              onClick={() => { setShowChallengesField(false); setChallengesText(''); }}
                              className="text-[9px] text-text-muted hover:text-cathedral-400 font-bold"
                            >
                              Hide
                            </button>
                          </div>
                          <textarea
                            placeholder="Struggles or needs requiring Section Pastor attention..."
                            value={challengesText}
                            onChange={(e) => setChallengesText(e.target.value)}
                            className="w-full h-16 bg-surface-100 border border-cathedral-500/20 rounded-xl px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-cathedral-500/40 focus:border-cathedral-500 resize-none font-medium leading-relaxed"
                          />
                        </div>
                      )}
                    </div>

                    <button
                      type="submit"
                      className="w-full h-12 bg-gold-500 hover:bg-gold-400 text-black font-extrabold text-xs rounded-pill shadow-glow-gold transition-colors cursor-pointer mt-2"
                    >
                      Submit Fellowship Report
                    </button>
                  </form>
                ) : (
                  <motion.div
                    key="success"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="py-6 flex flex-col items-center justify-center text-center space-y-4"
                  >
                    <div className="w-16 h-16 rounded-full bg-gold-500/10 border border-gold-500/30 flex items-center justify-center text-gold-500">
                      <CheckCircle className="w-8 h-8" />
                    </div>

                    <div className="space-y-1">
                      <h3 className="text-base font-black text-gold-500">
                        Report Dispatched!
                      </h3>
                      <p className="text-xs text-text-secondary font-bold max-w-[250px] mx-auto leading-relaxed">
                        Weekly report uploaded securely. Lead Pastor notified for review.
                      </p>
                    </div>

                    <button
                      id="done-reseter-btn"
                      onClick={handleDoneReset}
                      className="w-full h-10 bg-gold-500 hover:bg-gold-400 text-black font-extrabold text-xs rounded-pill shadow-md cursor-pointer transition-colors"
                    >
                      Done
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

            </div>
          </BottomSheet>
        </div>
      )}


      {/* ======================================================================
          VIEW C: LEAD PASTOR VIEW — Report Review
          ====================================================================== */}
      {currentRoleView === 'pastor' && (
        <div className="space-y-4 flex-1">
          
          {/* Missing reports alert banner */}
          {delinquentCells.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-gold-500/10 border border-gold-500/20 rounded-xl p-3 text-left space-y-2.5"
            >
              <div className="flex items-center gap-2 text-gold-500">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <h5 className="text-xs font-black uppercase tracking-wider">
                  Delinquent Cells Overdue Alert
                </h5>
              </div>

              <p className="text-[10px] text-text-secondary leading-normal font-semibold">
                <strong>{delinquentCells.length} cells</strong> have not submitted their fellowship logs for the week:
              </p>

              <div className="space-y-1.5 max-h-[100px] overflow-y-auto pr-1">
                {delinquentCells.map(c => {
                  const lName = allMembers.find(m => m.localId === c.leaderId)?.fullName || 'Cell Leader';
                  return (
                    <div key={c.localId} className="flex justify-between items-center bg-black/25 px-2.5 py-1.5 rounded-lg border border-white/5">
                      <div className="text-[10px] text-text-primary">
                        <span className="font-extrabold text-gold-500">{c.name}</span> • <span className="text-text-muted">{lName}</span>
                      </div>
                      <button
                        id={`remind-btn-${c.localId}`}
                        onClick={() => handleSendReminder(c)}
                        className="px-2 py-0.5 bg-gold-500 text-black font-black text-[8px] rounded uppercase cursor-pointer"
                      >
                        Send Reminder
                      </button>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* SectionTitle with Pending Badge count */}
          <SectionTitle
            title="Fellowship Reports"
            badge={{
              label: `${pendingReportsCount} Pending`,
              variant: pendingReportsCount > 0 ? 'gold' : 'muted'
            }}
          />

          {/* Pastor Tab Filters */}
          <div className="flex gap-2 bg-surface-100 p-1 rounded-xl border border-white/5">
            {(['Pending', 'Approved', 'All'] as const).map((tab) => {
              const count = tab === 'All' 
                ? cellReports.length 
                : tab === 'Pending' 
                  ? pendingReportsCount 
                  : cellReports.filter(r => r.reportStatus === 'approved').length;

              return (
                <button
                  key={tab}
                  onClick={() => { triggerHaptic(); setPastorTab(tab); }}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all relative cursor-pointer ${
                    pastorTab === tab
                      ? 'bg-gold-500 text-black shadow-sm'
                      : 'text-text-muted hover:text-text-secondary'
                  }`}
                >
                  <span>{tab}</span>
                  <span className={`text-[9px] ml-1.5 px-1.5 py-0.2 rounded-full ${
                    pastorTab === tab ? 'bg-black/10 text-black font-black' : 'bg-surface-200 text-text-muted'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Expandable Accordion List */}
          <div className="space-y-3 pb-4">
            {filteredReports.length === 0 ? (
              <div className="py-12 text-center bg-white/[0.01] border border-white/5 rounded-2xl p-4">
                <FileText className="w-10 h-10 text-text-muted mx-auto mb-2" />
                <p className="text-xs font-semibold text-text-secondary">No reports found</p>
                <p className="text-[10px] text-text-muted mt-0.5">There are no weekly reports matching status: {pastorTab}.</p>
              </div>
            ) : (
              filteredReports.map((report) => {
                const isExpanded = expandedReportId === report.localId;
                const isPending = report.reportStatus === 'pending_review';

                const cellGroup = cellGroups.find(c => c.localId === report.cellGroupId);
                const cellName = cellGroup ? cellGroup.name : 'Unknown Cell';
                const meetingDateStr = report.createdAt.split('T')[0];

                // Query attendance list
                const reportAttendances = cellAttendances.filter(a => a.meetingId === report.meetingId);

                return (
                  <GlassCard
                    key={report.localId}
                    id={`report-card-${report.localId}`}
                    className={`overflow-hidden transition-all duration-300 border-l-4 text-left ${
                      isPending ? 'border-l-gold-500' : 'border-l-[#7BC47F]'
                    }`}
                  >
                    <button
                      onClick={() => { triggerHaptic(); setExpandedReportId(isExpanded ? null : report.localId); }}
                      className="w-full p-4 flex items-center justify-between text-left cursor-pointer"
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="text-sm font-extrabold text-text-primary">
                            {cellName}
                          </h4>
                          <span className="text-[10px] text-text-muted font-light">•</span>
                          <span className="text-xs font-bold text-text-secondary">
                            {report.submittedBy}
                          </span>
                        </div>
                        <p className="text-[10px] text-text-muted mt-1 font-semibold">
                          Date Logged: {meetingDateStr}
                        </p>

                        {/* Progress Bar of Attendance presents */}
                        <div className="flex items-center gap-2 mt-2 max-w-[150px]">
                          <div className="flex-1 bg-surface-200 h-1 rounded-full overflow-hidden">
                            <div 
                              className="bg-gold-500 h-full rounded-full" 
                              style={{ width: `${(report.attendanceCount / Math.max(1, reportAttendances.length || 5)) * 100}%` }}
                            />
                          </div>
                          <span className="text-[9px] font-mono font-black text-text-muted">
                            {report.attendanceCount} present
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <AccentBadge
                          label={isPending ? 'Pending' : 'Approved'}
                          variant={isPending ? 'gold' : 'sage'}
                          size="sm"
                        />
                        <div className="text-text-muted">
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </div>
                      </div>
                    </button>

                    {/* Expand Details */}
                    <AnimatePresence initial={false}>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="border-t border-white/5"
                        >
                          <div className="p-4 bg-white/[0.01] space-y-4">
                            
                            {/* Roster of members in attendance */}
                            <div className="space-y-1.5">
                              <span className="text-[9px] font-black uppercase tracking-widest text-text-muted">
                                Registered Roll Call
                              </span>
                              <div className="grid grid-cols-2 gap-1.5">
                                {reportAttendances.length === 0 ? (
                                  <p className="text-[9px] text-text-muted italic col-span-2">No detailed roll call logs saved.</p>
                                ) : (
                                  reportAttendances.map((att, idx) => {
                                    const mRecord = allMembers.find(m => m.localId === att.memberId);
                                    if (!mRecord) return null;

                                    return (
                                      <div key={idx} className="flex items-center gap-1.5 bg-white/[0.02] p-1.5 rounded-lg border border-white/5">
                                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                          att.status === 'present' 
                                            ? 'bg-[#7BC47F]' 
                                            : att.status === 'excused' 
                                              ? 'bg-gold-500' 
                                              : 'bg-white/10'
                                        }`} />
                                        <span className="text-[11px] text-text-primary truncate font-semibold">
                                          {mRecord.fullName}
                                        </span>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            </div>

                            {/* highlights box */}
                            <div className="space-y-1">
                              <span className="text-[9px] font-black uppercase tracking-widest text-text-muted">
                                Fellowship Highlights
                              </span>
                              <p className="text-xs text-text-primary leading-relaxed bg-white/[0.02] p-2.5 rounded-xl border border-white/5 italic">
                                "{report.highlights}"
                              </p>
                            </div>

                            {/* challenges box */}
                            {report.challenges && (
                              <div className="space-y-1">
                                <span className="text-[9px] font-black uppercase tracking-widest text-cathedral-400">
                                  Escalated Challenges
                                </span>
                                <div className="text-xs text-cathedral-400 bg-cathedral-500/5 p-2.5 rounded-xl border border-cathedral-500/10 flex gap-2">
                                  <AlertTriangle className="w-4 h-4 text-cathedral-400 flex-shrink-0" />
                                  <p className="leading-relaxed font-semibold italic">"{report.challenges}"</p>
                                </div>
                              </div>
                            )}

                            {/* Approve action */}
                            {isPending && (
                              <div className="pt-2">
                                <button
                                  id={`approve-action-${report.localId}`}
                                  onClick={(e) => handleApproveReport(report.localId, e)}
                                  className="w-full py-2.5 bg-gold-500 hover:bg-gold-400 text-black font-black text-xs rounded-pill shadow-glow-gold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                                >
                                  <Check className="w-4 h-4 stroke-[3px]" />
                                  Approve Cell Report
                                </button>
                              </div>
                            )}

                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </GlassCard>
                );
              })
            )}
          </div>

        </div>
      )}

    </div>
  );
}
