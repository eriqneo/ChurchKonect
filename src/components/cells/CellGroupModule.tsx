import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import * as Typography from '../../lib/theme/typography';
import { 
  db, 
  generateUUID
} from '../../lib/db/churchConnectDB';
import { useCurrentUser } from '../../lib/db/hooks';
import { useCellOperations } from '../../lib/db/cellOperations';
import { useAuth } from '../../lib/db/PocketBaseProvider';
import { sendCellReportReminder } from '../../lib/db/notificationData';
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
import { isRoleSimulatorEnabled } from '../../lib/auth/roles';
import {
  type PocketBaseCellGroup,
  useChurchStructure,
  usePocketBaseMembers
} from '../../lib/db/pocketbaseHooks';
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
  const { pb, user: authUser } = useAuth();
  const {
    members: allMembers,
    updateMember,
    refreshMembers
  } = usePocketBaseMembers();
  const {
    cellGroups,
    sections,
    departments,
    saveCellGroup,
    saveSection,
    saveDepartment,
    isLoading: structureLoading,
    isRefreshing: structureRefreshing,
    error: structureError
  } = useChurchStructure();
  const {
    meetings: cellMeetings,
    attendance: cellAttendances,
    visitors: cellVisitors,
    reports: cellReports,
    pendingCount: operationsPendingCount,
    failedCount: operationsFailedCount,
    error: operationsError,
    startMeeting,
    markAttendance,
    addVisitor,
    submitReport,
    reviewReport
  } = useCellOperations();

  // 1. Role View Emulator Mode: 'admin' | 'leader' | 'pastor'
  const [currentRoleView, setCurrentRoleView] = useState<'admin' | 'leader' | 'pastor'>('leader');

  // Auto-detect role and set initial view mode
  const roleId = role?.id;
  useEffect(() => {
    if (roleId) {
      if (roleId === 'administrator') {
        setCurrentRoleView('admin');
      } else if (roleId === 'lead_pastor' || roleId === 'district_pastor') {
        setCurrentRoleView('pastor');
      } else {
        setCurrentRoleView('leader');
      }
    }
  }, [roleId]);

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
  const [selectedCellForDetail, setSelectedCellForDetail] = useState<PocketBaseCellGroup | null>(null);
  
  // Sheet States
  const [isGroupSheetOpen, setIsGroupSheetOpen] = useState(false);
  const [isAssignSheetOpen, setIsAssignSheetOpen] = useState(false);
  const [isStructureSheetOpen, setIsStructureSheetOpen] = useState(false);
  const [structureTab, setStructureTab] = useState<'section' | 'department'>('section');
  const [structureName, setStructureName] = useState('');
  const [structureDetail, setStructureDetail] = useState('');
  const [structureLeaderId, setStructureLeaderId] = useState('');
  const [isSavingStructure, setIsSavingStructure] = useState(false);
  
  // Create / Edit Group Form State
  const [editingGroup, setEditingGroup] = useState<PocketBaseCellGroup | null>(null);
  const [isSavingGroup, setIsSavingGroup] = useState(false);
  const [isSavingAssignments, setIsSavingAssignments] = useState(false);
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
      const isQualified = Boolean(m.userId) && (m.role === 'cell_leader' || m.role === 'administrator' || m.role === 'lead_pastor');
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
    setFormLeaderId(allMembers.find(m => m.role === 'cell_leader' && m.userId)?.userId || '');
    setFormSectionId(sections.find((section) => section.status !== 'Inactive')?.localId || '');
    setFormMeetingDay('Wednesday');
    setFormMeetingTime('19:30');
    setFormLocation('');
    setFormStatus('Active');
    setLeaderSearchQuery('');
    setIsGroupSheetOpen(true);
  };

  const handleOpenStructureSetup = () => {
    triggerHaptic();
    setStructureTab('section');
    setStructureName('');
    setStructureDetail('');
    setStructureLeaderId('');
    setIsStructureSheetOpen(true);
  };

  const handleSaveStructure = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!structureName.trim()) {
      showToast(`${structureTab === 'section' ? 'Section' : 'Department'} name is required.`);
      return;
    }
    setIsSavingStructure(true);
    const leaderMember = allMembers.find((member) => member.userId === structureLeaderId);
    try {
      if (structureTab === 'section') {
        await saveSection({
          name: structureName,
          code: structureDetail,
          pastorId: structureLeaderId || undefined,
          pastorMemberId: leaderMember?.remoteId
        });
      } else {
        await saveDepartment({
          name: structureName,
          description: structureDetail,
          headId: structureLeaderId || undefined,
          headMemberId: leaderMember?.remoteId
        });
      }
      showToast(`${structureTab === 'section' ? 'Section' : 'Department'} "${structureName}" created.`);
      setStructureName('');
      setStructureDetail('');
      setStructureLeaderId('');
    } catch (error) {
      console.error('[Cells] Structure setup failed:', error);
      showToast(error instanceof Error ? error.message : 'Could not save the church structure.');
    } finally {
      setIsSavingStructure(false);
    }
  };

  // Open Edit Group form
  const handleOpenEditGroup = (group: PocketBaseCellGroup, e: React.MouseEvent) => {
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

    setIsSavingGroup(true);
    try {
      const saved = await saveCellGroup({
        remoteId: editingGroup?.remoteId,
        expectedUpdatedAt: editingGroup?.updatedAt,
        name: formName,
        leaderId: formLeaderId,
        leaderMemberId: allMembers.find((member) => member.userId === formLeaderId)?.remoteId,
        sectionId: formSectionId,
        meetingDay: formMeetingDay,
        meetingTime: formMeetingTime,
        location: formLocation,
        status: formStatus
      });
      showToast(`Cell Group "${formName}" ${editingGroup ? 'updated' : 'created'} successfully!`);
      if (selectedCellForDetail?.remoteId === saved.remoteId) setSelectedCellForDetail(saved);
      setIsGroupSheetOpen(false);
    } catch (error) {
      console.error('[Cells] Save group failed:', error);
      showToast(error instanceof Error ? error.message : 'Could not save the cell group.');
    } finally {
      setIsSavingGroup(false);
    }
  };

  // Remove member from group
  const handleRemoveMemberFromGroup = async (memberRemoteId: string) => {
    triggerHaptic(20);
    const member = allMembers.find((record) => record.remoteId === memberRemoteId);
    if (!member) return;
    try {
      await updateMember(member.remoteId, {
        cellGroupId: undefined,
        sectionId: undefined
      });
      showToast(`${member.fullName} removed from cell group roster.`);
      
      // Auto Audit Log
      await db.auditLogs.add({
        localId: generateUUID(),
        userId: user.localId,
        userName: user.name,
        action: 'cell_member_remove',
        details: `Removed ${member.fullName} from cell group roster.`,
        createdAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('[Cells] Remove roster member failed:', error);
      showToast(error instanceof Error ? error.message : 'Could not remove the member.');
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

    setIsSavingAssignments(true);
    const nowStr = new Date().toISOString();
    try {
      const results = await Promise.allSettled(selectedMemberIdsForAssign.map((memberId) =>
        updateMember(memberId, {
          cellGroupId: selectedCellForDetail.remoteId,
          sectionId: selectedCellForDetail.sectionId || undefined
        }, { refresh: false })
      ));
      const assignedCount = results.filter((result) => result.status === 'fulfilled').length;
      const failedCount = results.length - assignedCount;
      await refreshMembers();
      showToast(failedCount
        ? `${assignedCount} assigned; ${failedCount} need another attempt.`
        : `Successfully assigned ${assignedCount} members to "${selectedCellForDetail.name}"!`);
    
      // Local audit remains informational until the audit-log backend module.
      await db.auditLogs.add({
        localId: generateUUID(),
        userId: user.localId,
        userName: user.name,
        action: 'cell_members_assign',
        details: `Assigned ${assignedCount} members to cell group ${selectedCellForDetail.name}.`,
        createdAt: nowStr
      });

      const failedIds = selectedMemberIdsForAssign.filter((_, index) => results[index].status === 'rejected');
      setSelectedMemberIdsForAssign(failedIds);
      if (!failedCount) setIsAssignSheetOpen(false);
    } catch (error) {
      console.error('[Cells] Roster assignment failed:', error);
      showToast(error instanceof Error ? error.message : 'Could not assign members.');
    } finally {
      setIsSavingAssignments(false);
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
  const canOperateMeeting = roleId === 'cell_leader' || (isRoleSimulatorEnabled && currentRoleView === 'leader');
  const canReviewReports = roleId === 'lead_pastor' || roleId === 'administrator' || (isRoleSimulatorEnabled && currentRoleView === 'pastor');

  // Auto-select cell group for leader
  useEffect(() => {
    if (cellGroups.length > 0) {
      const leaderCell = cellGroups.find(c => c.leaderId === user.localId);
      if (leaderCell) {
        setLeaderCellGroupId(leaderCell.localId);
      } else if (isRoleSimulatorEnabled) {
        setLeaderCellGroupId(cellGroups[0].localId);
      } else {
        const ownMembership = allMembers.find((member) => member.userId === user.localId);
        setLeaderCellGroupId(ownMembership?.cellGroupId || '');
      }
    } else {
      setLeaderCellGroupId('');
    }
  }, [allMembers, cellGroups, user.localId]);

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
    const meetingVisitors = activeMeeting
      ? cellVisitors.filter((visitor) => visitor.meetingId === activeMeeting.localId).map((visitor) => ({
          localId: visitor.localId,
          remoteId: visitor.remoteId || visitor.localId,
          fullName: visitor.fullName,
          phone: visitor.phone || '',
          role: 'visitor',
          avatarText: visitor.fullName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase(),
          cellGroupId: visitor.cellGroupId
        }))
      : [];
    return [
      ...allMembers.filter(m => m.cellGroupId === leaderCellGroupId),
      ...meetingVisitors
    ];
  }, [activeMeeting, allMembers, cellVisitors, leaderCellGroupId]);

  // Meeting Timer State
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (activeMeeting) {
      const fetchStartTime = async () => {
        const timerSetting = await db.appSettings.where('key').equals(`meeting_timer_${activeMeeting.localId}`).first();
        const startTime = timerSetting
          ? timerSetting.value
          : activeMeeting.startedAt
            ? new Date(activeMeeting.startedAt).getTime()
            : Date.now();
        
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
    if (!canOperateMeeting) {
      showToast('Only the assigned cell leader can start attendance.');
      return;
    }
    if (!leaderCellGroupId) {
      showToast('No cell group selected.');
      return;
    }
    triggerHaptic(20);
    try {
      await startMeeting(leaderCellGroupId, allMembers.filter((member) => member.cellGroupId === leaderCellGroupId).map((member) => member.localId));
      showToast(typeof navigator !== 'undefined' && !navigator.onLine
        ? `Meeting started for ${currentLeaderCell?.name}. Saved on this device.`
        : `Fellowship meeting started for ${currentLeaderCell?.name}!`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not start the meeting.');
    }
  };

  // Cycling the attendance status loop
  const handleCycleAttendance = async (personLocalId: string, isVisitor = false) => {
    if (!activeMeeting) {
      showToast('Please start the fellowship meeting first.');
      return;
    }
    triggerHaptic(15);

    const existing = cellAttendances.find((attendance) => attendance.meetingId === activeMeeting.localId && (
      isVisitor ? attendance.visitorId === personLocalId : attendance.memberId === personLocalId
    ));

    let nextStatus: 'present' | 'absent' | 'excused' = 'absent';
    if (!existing || existing.status === 'absent') {
      nextStatus = 'present';
    } else if (existing.status === 'present') {
      nextStatus = 'excused';
    } else if (existing.status === 'excused') {
      nextStatus = 'absent';
    }

    try {
      await markAttendance(activeMeeting.localId, isVisitor ? { visitorId: personLocalId } : { memberId: personLocalId }, nextStatus);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not save attendance.');
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
      const rec = activeAtts.find(a => m.role === 'visitor' ? a.visitorId === m.localId : a.memberId === m.localId);
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

    try {
      const newVisitor = await addVisitor(activeMeeting.localId, leaderCellGroupId, visitorName, visitorPhone);
      setVisitorName('');
      setVisitorPhone('');
      setIsAddingVisitor(false);
      showToast(typeof navigator !== 'undefined' && !navigator.onLine
        ? `Visitor "${newVisitor.fullName}" saved on this device and marked present.`
        : `Visitor "${newVisitor.fullName}" added and marked present!`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not add the visitor.');
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

    try {
      await submitReport({
        meetingId: activeMeeting.localId,
        cellGroupId: leaderCellGroupId,
        highlights: highlightsText.trim(),
        challenges: challengesText.trim(),
        attendanceCount: liveRollCount.present,
        excusedCount: liveRollCount.excused,
        absentCount: liveRollCount.absent,
        visitorCount: cellVisitors.filter((visitor) => visitor.meetingId === activeMeeting.localId).length
      });
      setSubmitSuccess(true);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not submit the report.');
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
    const startOfWeek = new Date();
    const day = startOfWeek.getDay();
    startOfWeek.setDate(startOfWeek.getDate() - (day === 0 ? 6 : day - 1));
    startOfWeek.setHours(0, 0, 0, 0);
    const weekStart = `${startOfWeek.getFullYear()}-${String(startOfWeek.getMonth() + 1).padStart(2, '0')}-${String(startOfWeek.getDate()).padStart(2, '0')}`;
    const reportedCellIds = new Set(cellReports.filter((report) => (report.submittedAt || report.createdAt).slice(0, 10) >= weekStart).map((report) => report.cellGroupId));
    return cellGroups.filter((cell) => cell.status !== 'Inactive' && !reportedCellIds.has(cell.localId));
  }, [cellGroups, cellReports]);

  const handleSendReminder = async (cellGroup: PocketBaseCellGroup) => {
    triggerHaptic(20);
    const leaderName = cellGroup.leaderName || allMembers.find(m => m.userId === cellGroup.leaderId)?.fullName || 'Cell Leader';
    if (!authUser || !cellGroup.leaderId) {
      showToast('Assign a signed-in cell leader before sending a reminder.');
      return;
    }
    try {
      await sendCellReportReminder(pb, authUser.id, cellGroup.leaderId, cellGroup.localId, cellGroup.name);
      showToast(`Weekly report reminder sent to ${leaderName}.`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'The reminder could not be sent.');
    }
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

    try {
      await reviewReport(reportLocalId, 'approved');
      showToast('Cell Group report approved successfully!');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not approve the report.');
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
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[200] bg-theme-card border border-theme-border px-4 py-2.5 rounded-xl shadow-float flex items-center gap-2 max-w-sm w-[90%] text-left"
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
      {isRoleSimulatorEnabled && <div className="flex justify-center px-1">
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
      </div>}

      {currentRoleView !== 'admin' && (operationsPendingCount > 0 || operationsFailedCount > 0 || operationsError) && (
        <div className={`rounded-xl border px-3 py-2 text-[10px] font-semibold ${
          operationsFailedCount > 0
            ? 'border-red-500/20 bg-red-500/5 text-red-700 dark:text-red-300'
            : 'border-gold-500/20 bg-gold-500/5 text-text-secondary'
        }`}>
          {operationsFailedCount > 0
            ? `${operationsFailedCount} change${operationsFailedCount === 1 ? '' : 's'} need attention. ${operationsError || 'Refresh after checking your access and record details.'}`
            : operationsError || `${operationsPendingCount} change${operationsPendingCount === 1 ? '' : 's'} saved on this device and waiting to sync.`}
        </div>
      )}


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
                badge={structureError ? { label: 'Cached', variant: 'gold' } : structureRefreshing ? { label: 'Syncing', variant: 'muted' } : { label: 'Synced', variant: 'sage' }}
                action={{ label: "+ Create Group", onPress: handleOpenCreateGroup }}
              />

              <button
                type="button"
                onClick={handleOpenStructureSetup}
                className="flex min-h-11 w-full items-center justify-between rounded-xl border border-theme-border bg-theme-card px-3.5 text-left transition-colors hover:bg-surface-200"
              >
                <span>
                  <span className="block text-xs font-extrabold text-text-primary">Structure setup</span>
                  <span className="mt-0.5 block text-[10px] text-text-muted">{sections.length} sections · {departments.length} departments</span>
                </span>
                <span className="text-[10px] font-bold text-gold-600 dark:text-gold-400">Configure</span>
              </button>

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
                className="space-y-3 flex-1 pb-4"
              >
                {structureLoading ? (
                  <div className="py-12 text-center rounded-2xl border border-theme-border bg-theme-card p-4">
                    <div className="mx-auto mb-3 h-9 w-9 animate-spin rounded-full border-2 border-gold-500/20 border-t-gold-500" />
                    <p className="text-xs font-semibold text-text-secondary">Loading confirmed cell groups…</p>
                  </div>
                ) : filteredCellGroups.length === 0 ? (
                  <div className="py-12 text-center bg-white/[0.01] border border-white/5 rounded-2xl p-4">
                    <Users className="w-10 h-10 text-text-muted mx-auto mb-2" />
                    <p className="text-xs font-semibold text-text-secondary">No cell groups found</p>
                    <p className="text-[10px] text-text-muted mt-0.5">Try a different search or create a new group.</p>
                  </div>
                ) : (
                  filteredCellGroups.map((group) => {
                    // Gather leader
                    const leader = allMembers.find(m => m.userId === group.leaderId);
                    const leaderName = group.leaderName || leader?.fullName || 'No leader';

                    // Gather district
                    const district = sections.find(s => s.localId === group.sectionId);
                    const districtName = group.sectionName || district?.name || 'No section';

                    // Gather member count
                    const groupMemberCount = allMembers.filter(m => m.cellGroupId === group.localId).length;

                    // Group Status
                    const isActive = group.status !== 'Inactive';

                    return (
                      <motion.div key={group.localId} variants={staggerChildren.child}>
                      <GlassCard
                        id={`cell-card-${group.localId}`}
                        onPress={() => { triggerHaptic(); setSelectedCellForDetail(group); }}
                        className="p-4 border-l-4 border-l-gold-500/40 hover:border-l-gold-500 hover:shadow-md transition-all flex flex-col gap-3 group cursor-pointer"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <Avatar name={leaderName} size="md" />
                            <div className="min-w-0">
                              <h4 className="text-sm font-extrabold text-text-primary group-hover:text-gold-500 transition-colors truncate">
                                {group.name}
                              </h4>
                              <p className="text-[10px] text-text-secondary font-medium truncate mt-0.5">
                                Leader: <strong className="text-text-primary font-bold">{leaderName}</strong>
                              </p>
                            </div>
                          </div>

                          <div className="flex-shrink-0">
                            <span className={`text-[9px] font-black tracking-wide px-2 py-1 rounded-full ${
                              isActive ? 'bg-semantic-success/10 text-semantic-success' : 'bg-surface-200 text-text-muted'
                            }`}>
                              {isActive ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                        </div>

                        {/* Meeting details strip */}
                        <div className="grid grid-cols-2 gap-2 bg-surface-200/45 dark:bg-white/[0.02] px-3 py-2.5 rounded-xl border border-theme-border text-[10px] text-text-secondary font-semibold">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Calendar className="w-3.5 h-3.5 text-gold-500 flex-shrink-0" />
                            <span className="truncate">{group.meetingDay || 'Wednesday'} at {group.meetingTime || '19:30'}</span>
                          </div>
                          <div className="flex items-center gap-1.5 min-w-0">
                            <MapPin className="w-3.5 h-3.5 text-gold-500 flex-shrink-0" />
                            <span className="truncate">{group.location || 'House Fellowship'}</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-3 pt-0.5">
                          <div className="flex items-center gap-3 min-w-0 text-[10px] font-bold text-text-secondary">
                            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                              <Users className="w-3.5 h-3.5 text-cathedral-500" />
                              {groupMemberCount} {groupMemberCount === 1 ? 'member' : 'members'}
                            </span>
                            <span className="w-1 h-1 rounded-full bg-surface-400 flex-shrink-0" />
                            <span className="truncate">{districtName}</span>
                          </div>

                          <button
                            id={`edit-group-btn-${group.localId}`}
                            type="button"
                            onClick={(e) => handleOpenEditGroup(group, e)}
                            className="h-9 px-3 rounded-xl inline-flex items-center gap-1.5 flex-shrink-0 bg-cathedral-50 dark:bg-gold-500/10 border border-cathedral-100 dark:border-gold-500/20 text-cathedral-700 dark:text-gold-400 text-[10px] font-extrabold hover:bg-cathedral-100 dark:hover:bg-gold-500/15 transition-colors cursor-pointer"
                            aria-label={`Configure ${group.name}`}
                          >
                            <SlidersHorizontal className="w-3.5 h-3.5" />
                            Configure
                          </button>
                        </div>
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
                      Section: <span className="text-gold-500 font-extrabold">{selectedCellForDetail.sectionName || sections.find(s => s.localId === selectedCellForDetail.sectionId)?.name || 'Not assigned'}</span>
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
                        key={member.remoteId}
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
                          id={`remove-member-${member.remoteId}`}
                          onClick={() => handleRemoveMemberFromGroup(member.remoteId)}
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
            id="cms-structure-setup-sheet"
            isOpen={isStructureSheetOpen}
            onClose={() => setIsStructureSheetOpen(false)}
            title="Church Structure Setup"
            detents={['full']}
          >
            <div className="space-y-4 p-1 pb-4 text-left">
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-surface-200 p-1">
                {(['section', 'department'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => {
                      setStructureTab(tab);
                      setStructureName('');
                      setStructureDetail('');
                      setStructureLeaderId('');
                    }}
                    className={`min-h-10 rounded-lg text-xs font-bold capitalize ${structureTab === tab ? 'bg-white text-text-primary shadow-sm dark:bg-surface-100' : 'text-text-muted'}`}
                  >
                    {tab === 'section' ? 'Sections' : 'Departments'}
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-text-muted">Configured {structureTab === 'section' ? 'sections' : 'departments'}</span>
                <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-theme-border bg-theme-card p-1.5">
                  {(structureTab === 'section' ? sections : departments).length === 0 ? (
                    <p className="p-5 text-center text-xs text-text-muted">None configured yet.</p>
                  ) : (structureTab === 'section' ? sections : departments).map((record) => (
                    <div key={record.localId} className="flex min-h-12 items-center justify-between rounded-lg px-3 py-2 hover:bg-surface-200/60">
                      <span className="min-w-0">
                        <strong className="block truncate text-xs text-text-primary">{record.name}</strong>
                        <span className="block truncate text-[9px] text-text-muted">
                          {structureTab === 'section'
                            ? ('pastorName' in record && record.pastorName) || ('code' in record && record.code) || 'No pastor assigned'
                            : ('headName' in record && record.headName) || 'No head assigned'}
                        </span>
                      </span>
                      <AccentBadge label={record.status || 'Active'} variant={record.status === 'Inactive' ? 'muted' : 'sage'} size="sm" />
                    </div>
                  ))}
                </div>
              </div>

              <form onSubmit={handleSaveStructure} className="space-y-3 border-t border-theme-border pt-4">
                <h4 className="text-xs font-extrabold text-text-primary">Add {structureTab === 'section' ? 'a section' : 'a department'}</h4>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Name *</label>
                  <input
                    required
                    value={structureName}
                    onChange={(event) => setStructureName(event.target.value)}
                    placeholder={structureTab === 'section' ? 'e.g. North Section' : 'e.g. Worship Ministry'}
                    className="h-11 w-full rounded-xl border border-theme-border bg-surface-100 px-3.5 text-sm text-text-primary outline-none focus:border-gold-500 focus:ring-2 focus:ring-gold-500/30"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">{structureTab === 'section' ? 'Short code' : 'Description'}</label>
                  <input
                    value={structureDetail}
                    onChange={(event) => setStructureDetail(event.target.value)}
                    placeholder={structureTab === 'section' ? 'e.g. NORTH' : 'Purpose of this department'}
                    className="h-11 w-full rounded-xl border border-theme-border bg-surface-100 px-3.5 text-sm text-text-primary outline-none focus:border-gold-500 focus:ring-2 focus:ring-gold-500/30"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-text-muted">{structureTab === 'section' ? 'Pastor' : 'Department head'} (optional)</label>
                  <select
                    value={structureLeaderId}
                    onChange={(event) => setStructureLeaderId(event.target.value)}
                    className="h-11 w-full rounded-xl border border-theme-border bg-surface-100 px-3 text-sm text-text-primary outline-none focus:border-gold-500 focus:ring-2 focus:ring-gold-500/30"
                  >
                    <option value="">Not assigned</option>
                    {allMembers.filter((member) => Boolean(member.userId) && (
                      structureTab === 'section'
                        ? ['lead_pastor', 'district_pastor', 'administrator'].includes(member.role)
                        : ['lead_pastor', 'department_head', 'administrator'].includes(member.role)
                    )).map((member) => <option key={member.remoteId} value={member.userId}>{member.fullName}</option>)}
                  </select>
                  <p className="text-[9px] leading-relaxed text-text-muted">Only registry profiles linked to an app login can hold leadership responsibility.</p>
                </div>
                <button type="submit" disabled={isSavingStructure} className="min-h-12 w-full rounded-pill bg-gold-500 px-4 text-xs font-extrabold text-black shadow-glow-gold disabled:opacity-60">
                  {isSavingStructure ? 'Saving to PocketBase…' : `Create ${structureTab}`}
                </button>
              </form>
            </div>
          </BottomSheet>

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
                    {sections.filter((section) => section.status !== 'Inactive').map(s => (
                      <option key={s.localId} value={s.localId}>{s.name}</option>
                    ))}
                    {sections.length === 0 && <option value="">No section configured</option>}
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
                          key={m.remoteId}
                          type="button"
                          onClick={() => { setFormLeaderId(m.userId || ''); setLeaderSearchQuery(m.fullName); }}
                          className={`w-full text-left p-2 hover:bg-white/[0.03] text-xs transition-colors flex items-center justify-between cursor-pointer ${
                            formLeaderId === m.userId ? 'text-gold-500 font-bold bg-white/[0.01]' : 'text-text-secondary'
                          }`}
                        >
                          <span>{m.fullName} ({m.role.replace('_', ' ')})</span>
                          {formLeaderId === m.userId && <Check className="w-3.5 h-3.5" />}
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
                disabled={isSavingGroup}
                className="w-full h-12 bg-gold-500 hover:bg-gold-400 text-black font-extrabold text-xs rounded-pill shadow-glow-gold transition-all cursor-pointer mt-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingGroup ? 'Saving to PocketBase…' : editingGroup ? "Apply Configuration" : "Create Cell Group"}
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
                    const isSelected = selectedMemberIdsForAssign.includes(m.remoteId);
                    const currentCell = cellGroups.find(c => c.localId === m.cellGroupId);

                    return (
                      <div
                        key={m.remoteId}
                        onClick={() => handleToggleMemberSelection(m.remoteId)}
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
                  disabled={isSavingAssignments}
                  className="h-11 bg-gold-500 hover:bg-gold-400 text-black text-xs font-extrabold rounded-xl transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSavingAssignments ? 'Saving…' : `Add Selected (${selectedMemberIdsForAssign.length})`}
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
            {/* Header / assigned cell group */}
            <div className="flex items-start justify-between">
              <div>
                <SectionTitle
                  title={currentLeaderCell?.name || "My Cell Group"}
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
            {!currentLeaderCell ? (
              <div className="rounded-xl border border-theme-border bg-theme-card p-5 text-center">
                <Users className="mx-auto mb-2 h-7 w-7 text-text-muted" />
                <p className="text-xs font-bold text-text-primary">No cell group assigned</p>
                <p className="mt-1 text-[10px] text-text-muted">An administrator can assign your registry profile to a cell group.</p>
              </div>
            ) : !canOperateMeeting ? (
              <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-3 text-xs text-text-secondary">
                You can view your cell roster and schedule here. Attendance controls are available only to the assigned cell leader.
              </div>
            ) : !activeMeeting ? (
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
                  <div className="w-8 h-8 rounded-full bg-semantic-success/10 flex items-center justify-center text-semantic-success">
                    <Clock className="w-4.5 h-4.5 animate-pulse" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-text-primary">
                      Fellowship Active (Timer)
                    </h4>
                    <span className="text-xs font-mono font-extrabold text-semantic-success">
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
                      ? cellAttendances.find(a => a.meetingId === activeMeeting.localId && (
                          member.role === 'visitor' ? a.visitorId === member.localId : a.memberId === member.localId
                        ))
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
                          onClick={() => handleCycleAttendance(member.localId, member.role === 'visitor')}
                          disabled={!canOperateMeeting}
                          className="w-11 h-11 rounded-full flex items-center justify-center cursor-pointer transition-transform active:scale-[0.9] disabled:cursor-default"
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
                {canOperateMeeting && (!isAddingVisitor ? (
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
                ))}
              </motion.div>
            </div>
          </div>

          {/* Sticky Summary bar above tab navigation */}
          <GlassCard variant="elevated" className="p-3.5 flex items-center justify-between border border-white/5 shadow-lg mt-3">
            <div className="text-[11px] font-bold text-text-secondary flex items-center gap-1.5 w-full justify-between">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#7BC47F] animate-pulse" /> Live Metrics:</span>
              <div className={`flex gap-2.5 text-xs ${Typography.METRIC}`}>
                <span className="text-semantic-success font-black">{presentCount} present</span>
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
                          <span className="block text-lg font-black text-semantic-success font-mono">
                            {liveRollCount.present}
                          </span>
                          <span className="text-[9px] font-black text-semantic-success uppercase tracking-wider">
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
                        Report Saved
                      </h3>
                      <p className="text-xs text-text-secondary font-bold max-w-[250px] mx-auto leading-relaxed">
                        {operationsPendingCount > 0
                          ? 'Your weekly report is safe on this device and will sync automatically when the connection is available.'
                          : 'Your weekly report is synchronized and ready for pastoral review.'}
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
                  const lName = c.leaderName || allMembers.find(m => m.userId === c.leaderId)?.fullName || 'Cell Leader';
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
                        Send reminder
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
                          label={isPending ? 'Pending' : report.reportStatus === 'rejected' ? 'Rejected' : 'Approved'}
                          variant={isPending ? 'gold' : report.reportStatus === 'rejected' ? 'cathedral' : 'sage'}
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
                                    const memberRecord = allMembers.find(m => m.localId === att.memberId);
                                    const visitorRecord = cellVisitors.find(visitor => visitor.localId === att.visitorId);
                                    const displayName = memberRecord?.fullName || visitorRecord?.fullName;
                                    if (!displayName) return null;

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
                                          {displayName}
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
                            {isPending && canReviewReports && (
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
