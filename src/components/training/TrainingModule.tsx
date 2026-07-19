import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import * as Typography from '../../lib/theme/typography';
import { 
  type TrainingRecord,
  type TrainingSessionRecord,
  type TrainingCertificateRecord
} from '../../lib/db/churchConnectDB';
import { useCurrentUser } from '../../lib/db/hooks';
import { useTrainingData } from '../../lib/db/trainingData';
import { type PocketBaseMember, usePocketBaseMembers } from '../../lib/db/pocketbaseHooks';
import {
  GlassCard,
  AccentBadge,
  SectionTitle,
  BottomSheet,
  ContentRow,
  ProgressRing
} from '../shared';
import { useToast } from '../shared/toast/useToast';
import { APP_ROLES, isRoleSimulatorEnabled } from '../../lib/auth/roles';
import { 
  Check, 
  Plus, 
  ChevronDown, 
  ChevronUp, 
  Users, 
  Clock, 
  Sparkles, 
  AlertTriangle, 
  FileText, 
  CheckCircle,
  HelpCircle,
  UserCheck,
  QrCode,
  X,
  Award,
  Download,
  BookOpen,
  ArrowLeft,
  Camera,
  Search,
  Calendar,
  CheckSquare,
  Square,
  Info,
  Volume2
} from 'lucide-react';

// ==========================================
// Custom High-Fidelity Vector QR Code Component
// ==========================================
export function SimulatedQRCode({ value, size = 180 }: { value: string, size?: number }) {
  const gridSize = 21;
  const grid: boolean[][] = Array(gridSize).fill(null).map(() => Array(gridSize).fill(false));

  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = value.charCodeAt(i) + ((hash << 5) - hash);
  }

  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      const seed = Math.sin(r * 12.9898 + c * 78.233 + hash) * 43758.5453;
      grid[r][c] = (seed - Math.floor(seed)) > 0.52;
    }
  }

  const applyFinder = (startRow: number, startCol: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const globalRow = startRow + r;
        const globalCol = startCol + c;
        if (globalRow < gridSize && globalCol < gridSize) {
          const isOuter = r === 0 || r === 6 || c === 0 || c === 6;
          const isInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          const isWhite = (r === 1 || r === 5 || c === 1 || c === 5);
          
          if (isOuter || isInner) {
            grid[globalRow][globalCol] = true;
          } else if (isWhite) {
            grid[globalRow][globalCol] = false;
          }
        }
      }
    }
  };

  applyFinder(0, 0);
  applyFinder(0, gridSize - 7);
  applyFinder(gridSize - 7, 0);
  grid[gridSize - 8][gridSize - 8] = true;

  const cellSize = size / gridSize;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="bg-white p-2 rounded-xl" id="member-qr-code">
      {grid.map((row, r) => 
        row.map((cell, c) => {
          if (cell) {
            return (
              <rect
                key={`${r}-${c}`}
                x={c * cellSize}
                y={r * cellSize}
                width={cellSize}
                height={cellSize}
                fill="#000000"
              />
            );
          }
          return null;
        })
      )}
    </svg>
  );
}


// Custom interfaces for dynamic extended attributes stored in Dexie
interface ExtendedTraining extends TrainingRecord {
  startDate?: string;
  endDate?: string;
  totalSessions?: number;
  requiredAttendanceRate?: number;
  maxEnrollment?: number;
  isDraft?: boolean;
  startTime?: string;        // 'HH:MM' 24-hour, e.g. '08:00'
  lateGraceMinutes?: number; // minutes after startTime still counted on-time
}

// ==========================================
// Timing Rule Helpers
// ==========================================

/** Formats 'HH:MM' (24h) into a friendly 12-hour clock string, e.g. '08:00' -> '8:00 AM'. */
function formatClockTime(time24: string): string {
  const [h, m] = time24.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return time24;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

/** The clock time after which a check-in counts as late, given a course's start time + grace period. */
function getLateCutoffLabel(course: Pick<ExtendedTraining, 'startTime' | 'lateGraceMinutes'>): string | null {
  if (!course.startTime) return null;
  const [h, m] = course.startTime.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const grace = course.lateGraceMinutes ?? 15;
  const cutoff = new Date(2000, 0, 1, h, m + grace);
  const hh = String(cutoff.getHours()).padStart(2, '0');
  const mm = String(cutoff.getMinutes()).padStart(2, '0');
  return formatClockTime(`${hh}:${mm}`);
}

/**
 * Classifies a check-in as on-time or late against a course's timing rule.
 * Returns null when the course has no start time configured (rule not in use).
 */
function classifyCheckInTiming(
  course: Pick<ExtendedTraining, 'startTime' | 'lateGraceMinutes'>,
  scannedAtISO: string
): 'on-time' | 'late' | null {
  if (!course.startTime) return null;
  const [h, m] = course.startTime.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  const grace = course.lateGraceMinutes ?? 15;

  const scanned = new Date(scannedAtISO);
  const cutoff = new Date(scanned);
  cutoff.setHours(h, m + grace, 0, 0);

  return scanned.getTime() > cutoff.getTime() ? 'late' : 'on-time';
}

interface ExtendedSession extends TrainingSessionRecord {
  sessionNumber?: number;
  isOccurred?: boolean;
}

interface ExtendedCertificate extends TrainingCertificateRecord {
  certificateNumber?: string;
  courseTitle?: string;
  studentName?: string;
  completionDate?: string;
  attendanceRate?: number;
}

function certificateRoleLabel(role?: string): string {
  return APP_ROLES.find((item) => item.id === role)?.label || 'Authorized Church Leader';
}

export function TrainingModule({ currentRole: passedRole }: { currentRole?: any } = {}) {
  const toast = useToast();
  const { user: currentUser, role: userRole } = useCurrentUser();
  const currentRole = passedRole || userRole;
  const [roleView, setRoleView] = useState<'admin' | 'member'>('member');

  const { members } = usePocketBaseMembers();
  const {
    courses: coursesRaw,
    enrollments,
    sessions: sessionsRaw,
    attendance: attendanceLogs,
    certificates: certificatesRaw,
    isLoading: trainingLoading,
    isRefreshing: trainingRefreshing,
    pendingCount: trainingPendingCount,
    failedCount: trainingFailedCount,
    error: trainingError,
    saveCourse,
    enrollMember,
    checkIn,
    setSessionOccurred,
    issueCertificate,
    verifyCertificate,
    getVerifiedCertificate
  } = useTrainingData();
  const currentMember = members.find((member) => member.userId === currentUser?.localId);
  const currentMemberId = currentMember?.localId || '';

  // Extended DB records mapping safely
  const courses = coursesRaw as ExtendedTraining[];
  const sessions = sessionsRaw as ExtendedSession[];
  const certificates = certificatesRaw as ExtendedCertificate[];

  // Navigation states
  const [isCreatingCourse, setIsCreatingCourse] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [isFullscreenBadgeOpen, setIsFullscreenBadgeOpen] = useState(false);

  // Filter tab for courses CMS list
  const [activeCmsTab, setActiveCmsTab] = useState<'Active' | 'Draft' | 'Completed' | 'All'>('Active');

  // Course Details Active Tab
  const [courseDetailTab, setCourseDetailTab] = useState<'overview' | 'roster' | 'sessions' | 'certificates'>('overview');

  // Create Course Form States
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newSchedule, setNewSchedule] = useState('');
  const [newStartDate, setNewStartDate] = useState('');
  const [newEndDate, setNewEndDate] = useState('');
  const [newTotalSessions, setNewTotalSessions] = useState(8);
  const [newRequiredRate, setNewRequiredRate] = useState(80);
  const [newMaxEnrollment, setNewMaxEnrollment] = useState(0);
  const [newStartTime, setNewStartTime] = useState('08:00');
  const [newLateGraceMinutes, setNewLateGraceMinutes] = useState(15);

  // Roster enrollment action modal
  const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);
  const [searchStudentQuery, setSearchStudentQuery] = useState('');

  // Scanner states
  const [scannerSelectedTrainingId, setScannerSelectedTrainingId] = useState<string>('');
  const [scannerSelectedSessionId, setScannerSelectedSessionId] = useState<string>('');
  const [scanResultState, setScanResultState] = useState<'idle' | 'success' | 'late' | 'not-enrolled' | 'already-checked-in'>('idle');
  const [scannedMemberName, setScannedMemberName] = useState('');
  const [scannedMemberAvatar, setScannedMemberAvatar] = useState('');
  const [lastScans, setLastScans] = useState<{ id: string; name: string; avatar: string; courseTitle: string; time: string; status: string }[]>([]);
  const [manualCode, setManualCode] = useState('');
  const [unregisteredScannedMemberId, setUnregisteredScannedMemberId] = useState<string | null>(null);

  // Audio success chime synth
  const playSuccessChime = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      osc.start();
      
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.12); // E5
      gain.gain.setValueAtTime(0.08, ctx.currentTime + 0.12);
      
      gain.gain.exponentialRampToValueAtTime(0.005, ctx.currentTime + 0.45);
      osc.stop(ctx.currentTime + 0.5);
    } catch (err) {
      console.log('Audio chime block or not supported', err);
    }
  };

  // Generate badge code helper
  const getMemberBadgeCode = (memberId: string) => {
    const digits = memberId.replace(/\D/g, '') || '101';
    return `CC-2026-${digits.padStart(4, '0')}`;
  };

  // Set default view based on user role admin status
  const currentRoleAdmin = currentRole?.id === 'administrator' || currentRole?.id === 'lead_pastor';
  const currentRoleId = currentRole?.id;
  useEffect(() => {
    if (currentRoleId) {
      setRoleView(currentRoleAdmin ? 'admin' : 'member');
    }
  }, [currentRoleAdmin, currentRoleId]);

  // Set default values for dates when entering Create Course screen
  useEffect(() => {
    if (isCreatingCourse) {
      const today = new Date().toISOString().split('T')[0];
      setNewStartDate(today);
      const future = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      setNewEndDate(future);
    }
  }, [isCreatingCourse]);

  // Auto select active training and session when opening QR Scanner
  useEffect(() => {
    if (isScannerOpen) {
      const activeCourse = courses.find(c => c.status === 'ongoing' || !c.isDraft);
      if (activeCourse) {
        setScannerSelectedTrainingId(activeCourse.localId);
        const courseSessions = sessions.filter(s => s.trainingId === activeCourse.localId);
        const nextSession = courseSessions.find(s => !s.isOccurred) || courseSessions[0];
        if (nextSession) {
          setScannerSelectedSessionId(nextSession.localId);
        }
      }
    }
  }, [isScannerOpen, coursesRaw]);

  // Sync selected session when scanner course changes
  const handleScannerCourseChange = (courseId: string) => {
    setScannerSelectedTrainingId(courseId);
    const courseSessions = sessions.filter(s => s.trainingId === courseId);
    const nextSession = courseSessions.find(s => !s.isOccurred) || courseSessions[0];
    if (nextSession) {
      setScannerSelectedSessionId(nextSession.localId);
    } else {
      setScannerSelectedSessionId('');
    }
  };

  // Execute scan check-in logic
  const handleBarcodeDecoded = async (rawCode: string) => {
    if (!scannerSelectedSessionId || !scannerSelectedTrainingId) {
      toast.warning('Please select a course and session first.');
      return;
    }

    const cleanCode = rawCode.trim().toUpperCase();
    
    // Look up member
    let foundMember: PocketBaseMember | undefined;
    
    // Try to extract parsed id digits e.g. CC-2026-0003
    const match = cleanCode.match(/CC-2026-(\d+)/);
    if (match) {
      const numStr = parseInt(match[1], 10).toString();
      foundMember = members.find(m => 
        m.localId === `mem-${numStr}` || 
        m.localId.endsWith(`-${numStr}`) ||
        m.localId.includes(numStr) ||
        getMemberBadgeCode(m.localId) === cleanCode
      );
    }

    if (!foundMember) {
      // Fallback search
      foundMember = members.find(m => 
        m.qrCode === cleanCode || 
        m.fullName.toUpperCase().includes(cleanCode) || 
        m.localId.toUpperCase() === cleanCode
      );
    }

    if (!foundMember) {
      toast.error('Member badge code not recognized in system.');
      return;
    }

    const memberId = foundMember.localId;
    const memberName = foundMember.fullName;
    const memberAvatar = foundMember.avatarText || memberName.split(' ').map(n => n[0]).join('').substring(0, 2);
    const selectedCourse = courses.find(c => c.localId === scannerSelectedTrainingId);
    const courseTitle = selectedCourse?.title || 'Selected Course';

    setScannedMemberName(memberName);
    setScannedMemberAvatar(memberAvatar);

    // Check enrollment
    const isEnrolled = enrollments.some(e => e.trainingId === scannerSelectedTrainingId && e.memberId === memberId);
    
    if (!isEnrolled) {
      setUnregisteredScannedMemberId(memberId);
      setScanResultState('not-enrolled');
      
      // Update scan history
      setLastScans(prev => [
        {
          id: 'scan-' + Date.now(),
          name: memberName,
          avatar: memberAvatar,
          courseTitle,
          time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
          status: 'Not Enrolled'
        },
        ...prev.slice(0, 4)
      ]);
      
      return;
    }

    // Check if already checked in today for this session
    const isAlreadyCheckedIn = attendanceLogs.some(
      a => a.sessionId === scannerSelectedSessionId && a.memberId === memberId
    );

    if (isAlreadyCheckedIn) {
      setScanResultState('already-checked-in');
      setTimeout(() => setScanResultState('idle'), 1800);
      
      setLastScans(prev => [
        {
          id: 'scan-' + Date.now(),
          name: memberName,
          avatar: memberAvatar,
          courseTitle,
          time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
          status: 'Duplicate Check-in'
        },
        ...prev.slice(0, 4)
      ]);
      return;
    }

    const scannedAt = new Date().toISOString();
    const timing = selectedCourse ? classifyCheckInTiming(selectedCourse, scannedAt) : null;
    const isLate = timing === 'late';
    try {
      const result = await checkIn(scannerSelectedSessionId, memberId, isLate ? 'late' : 'on_time');
      if (result.duplicate) {
        setScanResultState('already-checked-in');
        toast.info(`${memberName} is already checked in for this session.`);
        return;
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save this check-in.');
      return;
    }

    setScanResultState(isLate ? 'late' : 'success');
    if (isLate) {
      toast.warning(`${memberName} checked in late (after ${getLateCutoffLabel(selectedCourse!)}).`);
    }
    playSuccessChime();

    // Log in scanning feed
    setLastScans(prev => [
      {
        id: 'scan-' + Date.now(),
        name: memberName,
        avatar: memberAvatar,
        courseTitle,
        time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
        status: typeof navigator !== 'undefined' && !navigator.onLine
          ? 'Saved Offline'
          : isLate ? '⏰ Late Check-in' : '✓ Checked In'
      },
      ...prev.slice(0, 4)
    ]);

    setTimeout(() => {
      setScanResultState('idle');
    }, 1800);
  };

  // Quick enroll from scanner overlay
  const handleQuickEnrollAndCheckIn = async () => {
    if (!unregisteredScannedMemberId || !scannerSelectedTrainingId || !scannerSelectedSessionId) return;
    const scannedAt = new Date().toISOString();
    const enrollCourse = courses.find(c => c.localId === scannerSelectedTrainingId);
    const timing = enrollCourse ? classifyCheckInTiming(enrollCourse, scannedAt) : null;
    const isLate = timing === 'late';

    try {
      await enrollMember(scannerSelectedTrainingId, unregisteredScannedMemberId);
      await checkIn(scannerSelectedSessionId, unregisteredScannedMemberId, isLate ? 'late' : 'on_time');
      toast.success('Member enrolled and checked in successfully!');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not enroll and check in this member.');
      return;
    }

    setScanResultState(isLate ? 'late' : 'success');
    playSuccessChime();
    setUnregisteredScannedMemberId(null);

    // Update history
    const memberObj = members.find(m => m.localId === unregisteredScannedMemberId);
    const mName = memberObj?.fullName || 'Member';
    const courseTitle = enrollCourse?.title || 'Course';

    if (isLate) {
      toast.warning(`${mName} enrolled but is checking in late (after ${getLateCutoffLabel(enrollCourse!)}).`);
    }

    setLastScans(prev => [
      {
        id: 'scan-' + Date.now(),
        name: mName,
        avatar: memberObj?.avatarText || 'M',
        courseTitle,
        time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
        status: isLate ? '⏰ Enrolled & Late' : '✓ Enrolled & Checked In'
      },
      ...prev.slice(0, 4)
    ]);

    setTimeout(() => {
      setScanResultState('idle');
    }, 1800);
  };

  // Manual code check-in fallback
  const handleManualCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    handleBarcodeDecoded(manualCode.trim());
    setManualCode('');
  };

  // Save new course
  const handleCreateCourseSubmit = async (isDraft: boolean) => {
    if (!newTitle.trim()) {
      toast.error('Course Title is required');
      return;
    }
    if (!newStartDate || !newEndDate || newEndDate < newStartDate) {
      toast.error('Choose a valid course date range. The end date must follow the start date.');
      return;
    }

    try {
      await saveCourse({
        title: newTitle,
        description: newDescription || 'No description provided.',
        schedule: newSchedule || 'TBD',
        startDate: newStartDate,
        endDate: newEndDate,
        totalSessions: Number(newTotalSessions) || 8,
        requiredAttendanceRate: Number(newRequiredRate) || 80,
        maxEnrollment: Number(newMaxEnrollment) || 0,
        startTime: newStartTime,
        lateGraceMinutes: Number(newLateGraceMinutes) || 0,
        isDraft
      });
      toast.success(isDraft ? 'Course saved as a server-confirmed draft.' : 'Course created successfully!');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create this course.');
      return;
    }
    
    // Clear states
    setNewTitle('');
    setNewDescription('');
    setNewSchedule('');
    setNewStartDate('');
    setNewEndDate('');
    setNewTotalSessions(8);
    setNewRequiredRate(80);
    setNewMaxEnrollment(0);
    setNewStartTime('08:00');
    setNewLateGraceMinutes(15);
    setIsCreatingCourse(false);
  };

  // Add student manually to course roster
  const handleManualStudentEnroll = async (memberId: string) => {
    if (!selectedCourseId) return;

    // Check duplicate
    const alreadyEnrolled = enrollments.some(e => e.trainingId === selectedCourseId && e.memberId === memberId);
    if (alreadyEnrolled) {
      toast.warning('This student is already enrolled in this course.');
      return;
    }

    try {
      await enrollMember(selectedCourseId, memberId);
      toast.success('Student added to the confirmed course roster.');
      setSearchStudentQuery('');
      setIsAddStudentOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not enroll this member.');
    }
  };

  // Toggle session occurrence status
  const handleToggleSessionOccurred = async (sessionId: string, currentStatus: boolean) => {
    const sessionObj = sessions.find(s => s.localId === sessionId);
    if (sessionObj) {
      try {
        await setSessionOccurred(sessionObj.remoteId || sessionObj.localId, !currentStatus);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Could not update this session.');
        return;
      }
      toast.success(!currentStatus ? 'Session marked as occurred!' : 'Session reopened!');
    }
  };

  // Certificate approval / issue action
  const handleIssueCertificate = async (trainingId: string, memberId: string) => {
    // Check if already issued
    const alreadyIssued = certificates.some(c => c.trainingId === trainingId && c.memberId === memberId);
    if (alreadyIssued) {
      toast.info('Certificate already generated or awaiting approval.');
      return;
    }

    const courseSessionIds = sessions.filter((session) => session.trainingId === trainingId && session.isOccurred).map((session) => session.localId);
    const attended = attendanceLogs.filter((attendance) => attendance.memberId === memberId && courseSessionIds.includes(attendance.sessionId)).length;
    const rate = courseSessionIds.length ? Math.round((attended / courseSessionIds.length) * 100) : 0;
    try {
      await issueCertificate(trainingId, memberId, rate);
      toast.success(currentRole?.id === 'lead_pastor'
        ? 'Certificate officially verified and issued!'
        : 'Certificate requested for Lead Pastor signature approval.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not issue this certificate.');
    }
  };

  // Bulk issue certificates
  const handleBulkIssueCertificates = async (trainingId: string, eligibleIds: string[]) => {
    if (eligibleIds.length === 0) {
      toast.info('No eligible students found.');
      return;
    }

    let count = 0;

    for (const mId of eligibleIds) {
      const alreadyHas = certificates.some(c => c.trainingId === trainingId && c.memberId === mId);
      if (!alreadyHas) {
        const occurredIds = sessions.filter((session) => session.trainingId === trainingId && session.isOccurred).map((session) => session.localId);
        const attended = attendanceLogs.filter((attendance) => attendance.memberId === mId && occurredIds.includes(attendance.sessionId)).length;
        const rate = occurredIds.length ? Math.round((attended / occurredIds.length) * 100) : 0;
        try {
          await issueCertificate(trainingId, mId, rate);
          count++;
        } catch (error) {
          toast.error(error instanceof Error ? error.message : `Could not issue a certificate for one member.`);
        }
      }
    }

    if (count > 0) {
      toast.success(
        currentRole?.id === 'lead_pastor'
          ? `Bulk issued ${count} certificates successfully!` 
          : `Requested Lead Pastor approval for ${count} eligible certificates!`
      );
    } else {
      toast.info('All eligible students already have certificates.');
    }
  };

  // Lead pastor certificate verification
  const handleVerifyCertificateApproval = async (certificateId: string) => {
    try {
      await verifyCertificate(certificateId);
      toast.success('Certificate signed and verified successfully!');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not verify this certificate.');
    }
  };

  // Member course enrollment action
  const handleMemberEnroll = async (courseId: string) => {
    if (!currentMemberId) {
      toast.error('Your login is not linked to an active member registry profile.');
      return;
    }
    const isEnrolled = enrollments.some(e => e.trainingId === courseId && e.memberId === currentMemberId);
    if (isEnrolled) return;

    const courseObj = courses.find(c => c.localId === courseId);
    if (!courseObj) return;

    try {
      await enrollMember(courseId, currentMemberId);
      playSuccessChime();
      toast.success(`You are confirmed for ${courseObj.title}!`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not complete your enrollment.');
    }
  };

  // Revalidate the server authority before rendering a certificate document.
  const handleDownloadCertificate = async (certificate: ExtendedCertificate, courseTitle: string, studentName: string) => {
    toast.info('Confirming certificate authority with PocketBase…');
    try {
      const confirmed = await getVerifiedCertificate(certificate.remoteId || certificate.localId);
      const attendanceRate = confirmed.attendanceRate ?? 0;
      const issuedDate = new Date(confirmed.issuedAt).toLocaleDateString();
      const verifiedDate = confirmed.verifiedAt ? new Date(confirmed.verifiedAt).toLocaleDateString() : issuedDate;
      const verifierName = confirmed.verifiedBy || 'Authorized Church Leader';
      const verifierRole = certificateRoleLabel(confirmed.verifiedByRole);
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 850;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Soft luxury cream background
      ctx.fillStyle = '#FCFAF2';
      ctx.fillRect(0, 0, 1200, 850);

      // Crimson luxury border
      ctx.lineWidth = 14;
      ctx.strokeStyle = '#7B1D31'; // cathedral-700
      ctx.strokeRect(20, 20, 1160, 810);

      // Gold inner accent border
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#D4A84A'; // gold-500
      ctx.strokeRect(38, 38, 1124, 774);

      // Gold corner details
      ctx.fillStyle = '#D4A84A';
      ctx.fillRect(38, 38, 50, 4);
      ctx.fillRect(38, 38, 4, 50);
      ctx.fillRect(1112, 38, 50, 4);
      ctx.fillRect(1158, 38, 4, 50);
      ctx.fillRect(38, 808, 50, 4);
      ctx.fillRect(38, 762, 4, 50);
      ctx.fillRect(1112, 808, 50, 4);
      ctx.fillRect(1158, 762, 4, 50);

      // Header Banner Text
      ctx.textAlign = 'center';
      ctx.fillStyle = '#7B1D31';
      ctx.font = 'bold 22px Georgia, serif';
      ctx.fillText('CHURCHCONNECT LEADERSHIP ACADEMY', 600, 115);

      // Gold stars decoration
      ctx.fillStyle = '#D4A84A';
      ctx.font = '36px Georgia, serif';
      ctx.fillText('★  ★  ★  ★  ★', 600, 165);

      // Main header
      ctx.fillStyle = '#111827';
      ctx.font = 'italic 54px Georgia, serif';
      ctx.fillText('Certificate of Completion', 600, 245);

      // Presentation sentence
      ctx.fillStyle = '#4B5563';
      ctx.font = '20px sans-serif';
      ctx.fillText('This official document proudly certifies that', 600, 315);

      // Student Name
      ctx.fillStyle = '#7B1D31';
      ctx.font = 'bold italic 62px Georgia, serif';
      ctx.fillText(studentName, 600, 395);

      // Description text
      ctx.fillStyle = '#4B5563';
      ctx.font = '18px sans-serif';
      ctx.fillText('has diligently attended and successfully completed all rigorous academic units,', 600, 460);
      ctx.fillText('ministry practical assignments, and fellowship criteria for', 600, 490);

      // Course Name
      ctx.fillStyle = '#111827';
      ctx.font = 'bold 38px Georgia, serif';
      ctx.fillText(courseTitle, 600, 555);

      // Stats and verification details
      ctx.fillStyle = '#6B7280';
      ctx.font = 'italic 16px sans-serif';
      ctx.fillText(`Completed with ${attendanceRate}% recorded attendance — Issued on ${issuedDate}`, 600, 610);

      ctx.font = '14px monospace';
      ctx.fillText(`PocketBase verification record: ${confirmed.certificateNumber}`, 600, 645);

      // Divider
      ctx.strokeStyle = '#D4A84A';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(350, 680);
      ctx.lineTo(850, 680);
      ctx.stroke();

      // Server-confirmed verification authority
      ctx.fillStyle = '#111827';
      ctx.font = 'bold italic 22px Georgia, serif';
      ctx.fillText(verifierName, 450, 720);
      ctx.fillStyle = '#4B5563';
      ctx.font = '13px sans-serif';
      ctx.fillText(`${verifierRole} • Verified ${verifiedDate}`, 450, 755);
      ctx.strokeStyle = '#D1D5DB';
      ctx.beginPath();
      ctx.moveTo(320, 735);
      ctx.lineTo(580, 735);
      ctx.stroke();

      // Visual server-verification seal (the record number above is authoritative)
      ctx.fillStyle = 'rgba(212, 168, 74, 0.12)';
      ctx.beginPath();
      ctx.arc(820, 725, 48, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#D4A84A';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#D4A84A';
      ctx.font = 'bold 11px Georgia, serif';
      ctx.fillText('SERVER', 820, 720);
      ctx.fillText('✓ VERIFIED', 820, 738);

      const link = document.createElement('a');
      link.download = `Certificate_${studentName.replace(/\s+/g, '_')}_${courseTitle.replace(/\s+/g, '_')}.png`;
      link.href = canvas.toDataURL('image/png');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success('Server-verified certificate downloaded.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The certificate could not be verified for download.');
    }
  };

  // Compute stats for selected course
  const getCourseStats = (courseId: string) => {
    const course = courses.find(c => c.localId === courseId);
    if (!course) return { totalEnrolled: 0, requiredRate: 80, attendanceRate: 0, completedCount: 0, totalSessionsCount: 8 };

    const totalSessionsCount = course.totalSessions || 8;
    const requiredRate = course.requiredAttendanceRate || 80;

    const courseEnrollments = enrollments.filter(e => e.trainingId === courseId);
    const totalEnrolled = courseEnrollments.length;

    const courseSessions = sessions.filter(s => s.trainingId === courseId);
    const occurredSessions = courseSessions.filter(s => s.isOccurred);
    const occurredCount = occurredSessions.length;

    const sessionIds = courseSessions.map(s => s.localId);
    const courseAttendance = sessionIds.length > 0 
      ? attendanceLogs.filter(a => sessionIds.includes(a.sessionId))
      : [];

    let totalAttendancePercentSum = 0;
    let completedCount = 0;

    courseEnrollments.forEach(enroll => {
      const studentAttendanceCount = courseAttendance.filter(a => a.memberId === enroll.memberId).length;
      const rate = occurredCount > 0 
        ? Math.round((studentAttendanceCount / occurredCount) * 100)
        : Math.round((studentAttendanceCount / totalSessionsCount) * 100);

      totalAttendancePercentSum += rate;

      if (rate >= requiredRate) {
        completedCount++;
      }
    });

    const averageAttendanceRate = totalEnrolled > 0 
      ? Math.round(totalAttendancePercentSum / totalEnrolled)
      : 100;

    return {
      totalEnrolled,
      requiredRate,
      attendanceRate: averageAttendanceRate,
      completedCount,
      totalSessionsCount,
      occurredCount
    };
  };

  return (
    <div className="space-y-4 flex flex-col h-full select-none pb-20 relative text-text-primary" id="training-module-root">
      
      {/* --------------------------------------
          TOP SWITCHER / ROLE EMULATOR
         -------------------------------------- */}
      {isRoleSimulatorEnabled && <div className="flex justify-center px-1" id="role-switcher-container">
        <div className="bg-surface-100 p-1 rounded-full flex gap-1 w-full max-w-[280px] border border-white/5">
          <button
            id="role-switch-admin"
            onClick={() => { setRoleView('admin'); }}
            className={`flex-1 py-1.5 rounded-full text-[10px] font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 ${
              roleView === 'admin'
                ? 'bg-gold-500 text-black shadow-md font-black'
                : 'text-text-muted hover:text-text-secondary cursor-pointer'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            Admin View
          </button>
          <button
            id="role-switch-member"
            onClick={() => { setRoleView('member'); }}
            className={`flex-1 py-1.5 rounded-full text-[10px] font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 ${
              roleView === 'member'
                ? 'bg-gold-500 text-black shadow-md font-black'
                : 'text-text-muted hover:text-text-secondary cursor-pointer'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Member View
          </button>
        </div>
      </div>}

      {(trainingPendingCount > 0 || trainingFailedCount > 0 || trainingError || trainingRefreshing) && (
        <div className={`rounded-xl border px-3 py-2 text-[10px] font-semibold ${
          trainingFailedCount > 0
            ? 'border-red-500/20 bg-red-500/5 text-red-700 dark:text-red-300'
            : 'border-gold-500/20 bg-gold-500/5 text-text-secondary'
        }`}>
          {trainingFailedCount > 0
            ? `${trainingFailedCount} attendance check-in${trainingFailedCount === 1 ? '' : 's'} need attention. ${trainingError || ''}`
            : trainingError || (trainingPendingCount > 0
              ? `${trainingPendingCount} check-in${trainingPendingCount === 1 ? '' : 's'} saved on this device and waiting to sync.`
              : 'Refreshing the Academy catalog…')}
        </div>
      )}

      {/* ======================================================================
          ADMIN VIEW — COURSE MANAGEMENT (CMS) & QR SCANNER
          ====================================================================== */}
      {roleView === 'admin' && (
        <AnimatePresence mode="wait">
          {/* A1. CREATE COURSE FULL PAGE FORM */}
          {isCreatingCourse ? (
            <motion.div
              key="create-course-form"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-5 text-left"
              id="create-course-form-page"
            >
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setIsCreatingCourse(false)}
                  className="w-8 h-8 rounded-full bg-surface-100 border border-white/5 flex items-center justify-center text-text-primary cursor-pointer hover:bg-surface-200"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <h3 className="text-lg font-extrabold tracking-tight text-text-primary">
                  Create New Course
                </h3>
              </div>

              <div className="space-y-4 bg-surface-100 p-5 rounded-3xl border border-white/5">
                <div>
                  <label className="text-xs font-bold text-gold-400 uppercase tracking-widest block mb-1.5">
                    Course Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="e.g. Discipleship Academy 101"
                    className="w-full bg-surface-200 border border-white/5 rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500 font-medium"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-gold-400 uppercase tracking-widest block mb-1.5">
                    Course Description *
                  </label>
                  <textarea
                    rows={4}
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Understanding the fundamentals of christian theology, prayers altars, and building family bible values..."
                    className="w-full bg-surface-200 border border-white/5 rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500 font-medium resize-none leading-relaxed"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-gold-400 uppercase tracking-widest block mb-1.5">
                    Weekly Schedule Details *
                  </label>
                  <input
                    type="text"
                    value={newSchedule}
                    onChange={(e) => setNewSchedule(e.target.value)}
                    placeholder="e.g. Saturdays at 10:00 AM, Gym Cafe"
                    className="w-full bg-surface-200 border border-white/5 rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500 font-medium"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3.5">
                  <div>
                    <label className="text-xs font-bold text-gold-400 uppercase tracking-widest block mb-1.5">
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={newStartDate}
                      onChange={(e) => setNewStartDate(e.target.value)}
                      className="w-full bg-surface-200 border border-white/5 rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500 font-medium"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gold-400 uppercase tracking-widest block mb-1.5">
                      End Date
                    </label>
                    <input
                      type="date"
                      value={newEndDate}
                      onChange={(e) => setNewEndDate(e.target.value)}
                      className="w-full bg-surface-200 border border-white/5 rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500 font-medium"
                    />
                  </div>
                </div>

                {/* Class Timing Rule */}
                <div className="bg-surface-200/40 border border-gold-500/10 rounded-2xl p-4 space-y-3.5">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-gold-500" />
                    <span className="text-xs font-black text-gold-400 uppercase tracking-widest">
                      Class Timing Rule
                    </span>
                  </div>
                  <p className="text-[11px] text-text-muted leading-relaxed -mt-1.5">
                    Class may start at 8:00 AM while members trickle in until 8:50 — set when it really
                    starts and how much grace late-comers get before they're marked Late instead of Present.
                  </p>

                  <div className="grid grid-cols-2 gap-3.5">
                    <div>
                      <label className="text-xs font-bold text-gold-400 uppercase tracking-widest block mb-1.5">
                        Class Start Time
                      </label>
                      <input
                        type="time"
                        value={newStartTime}
                        onChange={(e) => setNewStartTime(e.target.value)}
                        className="w-full bg-surface-200 border border-white/5 rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500 font-semibold"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-gold-400 uppercase tracking-widest block mb-1.5">
                        Late Grace Period
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          min={0}
                          max={120}
                          value={newLateGraceMinutes}
                          onChange={(e) => setNewLateGraceMinutes(Number(e.target.value))}
                          className="w-full bg-surface-200 border border-white/5 rounded-xl px-4 py-3 pr-11 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500 font-semibold"
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[11px] font-bold text-text-muted pointer-events-none">
                          min
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-1.5">
                    {[0, 10, 15, 20, 30].map((mins) => (
                      <button
                        key={mins}
                        type="button"
                        onClick={() => setNewLateGraceMinutes(mins)}
                        className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer ${
                          newLateGraceMinutes === mins
                            ? 'bg-gold-500/15 border-gold-500 text-gold-400'
                            : 'bg-transparent border-white/10 text-text-muted hover:text-text-secondary'
                        }`}
                      >
                        {mins === 0 ? 'None' : `${mins}m`}
                      </button>
                    ))}
                  </div>

                  {newStartTime && (
                    <div className="flex items-start gap-2 pt-3 border-t border-white/5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                      <p className="text-[11px] text-text-secondary leading-relaxed">
                        Class starts <strong className="text-text-primary">{formatClockTime(newStartTime)}</strong>.
                        Members checking in after{' '}
                        <strong className="text-amber-400">
                          {getLateCutoffLabel({ startTime: newStartTime, lateGraceMinutes: newLateGraceMinutes })}
                        </strong>{' '}
                        will be marked <strong className="text-amber-400">Late</strong> instead of Present.
                      </p>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3.5">
                  <div>
                    <label className="text-xs font-bold text-gold-400 uppercase tracking-widest block mb-1.5">
                      Total Sessions
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={24}
                      value={newTotalSessions}
                      onChange={(e) => setNewTotalSessions(Number(e.target.value))}
                      className="w-full bg-surface-200 border border-white/5 rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500 font-semibold"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gold-400 uppercase tracking-widest block mb-1.5">
                      Max Enrollment
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={newMaxEnrollment}
                      onChange={(e) => setNewMaxEnrollment(Number(e.target.value))}
                      placeholder="0 = Unlimited"
                      className="w-full bg-surface-200 border border-white/5 rounded-xl px-4 py-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500 font-semibold"
                    />
                    <span className="text-[10px] text-text-muted block mt-1">Use 0 for unlimited size</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-bold text-gold-400 uppercase tracking-widest block">
                      Required Attendance Rate
                    </label>
                    <span className="text-xs font-mono font-bold text-gold-500">{newRequiredRate}%</span>
                  </div>
                  <input
                    type="range"
                    min={50}
                    max={100}
                    step={5}
                    value={newRequiredRate}
                    onChange={(e) => setNewRequiredRate(Number(e.target.value))}
                    className="w-full accent-gold-500 cursor-pointer"
                  />
                  <p className="text-[10px] text-text-muted mt-1 leading-normal italic">
                    Members must attend {newRequiredRate}% of sessions to earn a verified certificate.
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-4 pt-2">
                <button
                  type="button"
                  onClick={() => handleCreateCourseSubmit(true)}
                  className="w-full py-3.5 rounded-full border border-white/10 text-text-secondary font-extrabold text-xs uppercase tracking-wider hover:bg-surface-100 cursor-pointer transition-colors text-center"
                >
                  Save as Draft
                </button>
                <button
                  type="button"
                  onClick={() => handleCreateCourseSubmit(false)}
                  className="w-full py-3.5 rounded-full bg-gold-500 text-black font-extrabold text-xs uppercase tracking-wider hover:bg-gold-400 cursor-pointer shadow-glow-gold transition-all text-center"
                >
                  Create Course
                </button>
              </div>
            </motion.div>
          ) : selectedCourseId ? (
            /* A2. COURSE DETAILS PAGE */
            <motion.div
              key="course-detail-view"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-4 text-left"
              id="course-detail-panel"
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => { setSelectedCourseId(null); setCourseDetailTab('overview'); }}
                    className="w-8 h-8 rounded-full bg-surface-100 border border-white/5 flex items-center justify-center text-text-primary cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <div>
                    <span className="text-[10px] font-bold text-gold-500 uppercase tracking-widest block">Academy CMS</span>
                    <h3 className="text-base font-black text-text-primary leading-tight truncate max-w-[200px]">
                      {courses.find(c => c.localId === selectedCourseId)?.title}
                    </h3>
                  </div>
                </div>

                <div className="flex gap-2">
                  <AccentBadge 
                    label={courses.find(c => c.localId === selectedCourseId)?.isDraft ? "Draft" : "Active"} 
                    variant={courses.find(c => c.localId === selectedCourseId)?.isDraft ? "gold" : "sage"} 
                  />
                </div>
              </div>

              {/* Tab Strip */}
              <div className="flex border-b border-white/5 pb-px" id="detail-tabs">
                {(['overview', 'roster', 'sessions', 'certificates'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setCourseDetailTab(tab)}
                    className={`flex-1 py-2 text-xs font-bold tracking-wide capitalize border-b-2 transition-all ${
                      courseDetailTab === tab
                        ? 'border-gold-500 text-gold-400'
                        : 'border-transparent text-text-muted hover:text-text-secondary cursor-pointer'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* Tab Contents */}
              <div className="min-h-[300px]">
                {/* 1. OVERVIEW TAB */}
                {courseDetailTab === 'overview' && (
                  <div className="space-y-4 animate-fadeIn">
                    <GlassCard className="p-4 space-y-3.5 border-white/5">
                      <div className="space-y-1">
                        <h4 className="text-sm font-extrabold text-gold-400 uppercase tracking-widest">About Course</h4>
                        <p className="text-xs text-text-secondary leading-relaxed">
                          {courses.find(c => c.localId === selectedCourseId)?.description}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <div className="bg-surface-200/50 p-3 rounded-2xl border border-white/5 text-left">
                          <span className="text-[10px] text-text-muted block">SCHEDULE</span>
                          <span className="text-xs font-bold text-text-primary mt-1 block">
                            {courses.find(c => c.localId === selectedCourseId)?.schedule}
                          </span>
                        </div>
                        <div className="bg-surface-200/50 p-3 rounded-2xl border border-white/5 text-left">
                          <span className="text-[10px] text-text-muted block">CERTIFICATE THRESHOLD</span>
                          <span className="text-xs font-bold text-gold-400 mt-1 block">
                            {courses.find(c => c.localId === selectedCourseId)?.requiredAttendanceRate || 80}% Attendance
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-surface-200/50 p-3 rounded-2xl border border-white/5 text-left">
                          <span className="text-[10px] text-text-muted block">START DATE</span>
                          <span className="text-xs font-bold text-text-primary mt-1 block">
                            {courses.find(c => c.localId === selectedCourseId)?.startDate || 'N/A'}
                          </span>
                        </div>
                        <div className="bg-surface-200/50 p-3 rounded-2xl border border-white/5 text-left">
                          <span className="text-[10px] text-text-muted block">END DATE</span>
                          <span className="text-xs font-bold text-text-primary mt-1 block">
                            {courses.find(c => c.localId === selectedCourseId)?.endDate || 'N/A'}
                          </span>
                        </div>
                      </div>

                      {(() => {
                        const detailCourse = courses.find(c => c.localId === selectedCourseId);
                        if (!detailCourse?.startTime) return null;
                        return (
                          <div className="grid grid-cols-2 gap-3">
                            <div className="bg-surface-200/50 p-3 rounded-2xl border border-white/5 text-left">
                              <span className="text-[10px] text-text-muted block flex items-center gap-1">
                                <Clock className="w-3 h-3" /> CLASS START TIME
                              </span>
                              <span className="text-xs font-bold text-text-primary mt-1 block">
                                {formatClockTime(detailCourse.startTime)}
                              </span>
                            </div>
                            <div className="bg-amber-500/10 p-3 rounded-2xl border border-amber-500/15 text-left">
                              <span className="text-[10px] text-amber-400/80 block flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> LATE AFTER
                              </span>
                              <span className="text-xs font-bold text-amber-400 mt-1 block">
                                {getLateCutoffLabel(detailCourse)}
                                {typeof detailCourse.lateGraceMinutes === 'number' && (
                                  <span className="text-amber-400/60 font-medium"> ({detailCourse.lateGraceMinutes}m grace)</span>
                                )}
                              </span>
                            </div>
                          </div>
                        );
                      })()}

                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/5">
                        <div className="text-center">
                          <span className="text-[9px] text-text-muted block">TOTAL SESSIONS</span>
                          <span className="text-lg font-mono font-black text-text-primary">
                            {getCourseStats(selectedCourseId!).totalSessionsCount}
                          </span>
                        </div>
                        <div className="text-center">
                          <span className="text-[9px] text-text-muted block">OCCURRED SESSIONS</span>
                          <span className="text-lg font-mono font-black text-gold-400">
                            {getCourseStats(selectedCourseId!).occurredCount}
                          </span>
                        </div>
                        <div className="text-center">
                          <span className="text-[9px] text-text-muted block">MAX ENROLLMENT</span>
                          <span className="text-lg font-mono font-black text-text-primary">
                            {courses.find(c => c.localId === selectedCourseId)?.maxEnrollment || '∞'}
                          </span>
                        </div>
                      </div>
                    </GlassCard>

                    <button
                      onClick={() => toast.info('Detailed Course Editor is under development')}
                      className="w-full py-3 bg-surface-100 border border-white/5 rounded-full text-center text-xs text-text-secondary font-bold hover:bg-surface-200 cursor-pointer"
                    >
                      Edit Course Information
                    </button>
                  </div>
                )}

                {/* 2. ROSTER TAB */}
                {courseDetailTab === 'roster' && (
                  <div className="space-y-4 animate-fadeIn">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black uppercase text-text-muted tracking-wider">
                        Enrolled Students ({enrollments.filter(e => e.trainingId === selectedCourseId).length})
                      </span>
                      <button
                        onClick={() => setIsAddStudentOpen(true)}
                        className="px-3 py-1.5 bg-gold-500/10 hover:bg-gold-500/20 text-gold-500 rounded-full font-black text-[10px] tracking-wider uppercase border border-gold-500/20 flex items-center gap-1.5 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Student
                      </button>
                    </div>

                    <div className="space-y-2 max-h-[350px] overflow-y-auto scrollbar-none">
                      {enrollments.filter(e => e.trainingId === selectedCourseId).length === 0 ? (
                        <div className="p-8 text-center text-xs text-text-muted italic bg-white/[0.01] border border-dashed border-white/5 rounded-2xl">
                          Roster is empty. Click "Add Student" or use the QR Scanner to automatically check them in!
                        </div>
                      ) : (
                        enrollments.filter(e => e.trainingId === selectedCourseId).map((enroll) => {
                          const mInfo = members.find(m => m.localId === enroll.memberId);
                          const stats = getCourseStats(selectedCourseId!);
                          
                          // Attendance logs for this student
                          const courseSessions = sessions.filter(s => s.trainingId === selectedCourseId);
                          const sessionIds = courseSessions.map(s => s.localId);
                          const attendedLogs = attendanceLogs.filter(
                            a => a.memberId === enroll.memberId && sessionIds.includes(a.sessionId)
                          );
                          const countAttended = attendedLogs.length;
                          const rate = stats.occurredCount > 0 
                            ? Math.round((countAttended / stats.occurredCount) * 100)
                            : 100;

                          // Color Code: Sage >= required, Gold < required but >= 60, Cathedral < 60
                          const reqRate = stats.requiredRate;
                          let rateColor = 'text-semantic-success bg-semantic-success/10 border-semantic-success/20';
                          let statusLabel = 'On Track';
                          if (rate < reqRate && rate >= 50) {
                            rateColor = 'text-[#D4A84A] bg-[#D4A84A]/10 border-[#D4A84A]/20'; // Gold
                            statusLabel = 'At Risk';
                          } else if (rate < 50) {
                            rateColor = 'text-rose-500 bg-rose-500/10 border-rose-500/20'; // Cathedral
                            statusLabel = 'Low Progress';
                          }

                          return (
                            <div 
                              key={enroll.localId}
                              className="p-3.5 bg-surface-100 rounded-2xl border border-white/5 flex justify-between items-center"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-9 h-9 rounded-full bg-surface-200 flex items-center justify-center font-extrabold text-gold-500 text-xs">
                                  {mInfo?.avatarText || mInfo?.fullName.split(' ').map(n => n[0]).join('') || 'M'}
                                </div>
                                <div className="min-w-0">
                                  <h5 className="text-xs font-black text-text-primary truncate">{mInfo?.fullName || 'Unknown member'}</h5>
                                  <p className="text-[10px] text-text-muted mt-0.5 font-mono">{mInfo?.qrCode || getMemberBadgeCode(enroll.memberId)}</p>
                                </div>
                              </div>

                              <div className="text-right flex flex-col items-end gap-1 flex-shrink-0">
                                <span className="text-[10px] text-text-secondary font-semibold font-mono">
                                  {countAttended} / {stats.totalSessionsCount} sessions
                                </span>
                                <div className={`px-2 py-0.5 rounded-full border text-[9px] font-bold ${rateColor}`}>
                                  {rate}% · {statusLabel}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                {/* 3. SESSIONS TAB */}
                {courseDetailTab === 'sessions' && (
                  <div className="space-y-4 animate-fadeIn">
                    <span className="text-xs font-black uppercase text-text-muted tracking-wider block">
                      Scheduled Sessions ({sessions.filter(s => s.trainingId === selectedCourseId).length})
                    </span>

                    <div className="space-y-2.5 max-h-[350px] overflow-y-auto scrollbar-none">
                      {sessions.filter(s => s.trainingId === selectedCourseId).map((session, index) => (
                        <div 
                          key={session.localId}
                          className="p-3.5 bg-surface-100 rounded-2xl border border-white/5 flex justify-between items-center"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-surface-200 text-text-muted flex items-center justify-center font-mono font-extrabold text-xs">
                              #{index + 1}
                            </div>
                            <div>
                              <h5 className="text-xs font-bold text-text-primary">Session {session.sessionNumber || (index + 1)}</h5>
                              <p className="text-[10px] text-text-muted mt-0.5 flex items-center gap-1">
                                <Calendar className="w-3.5 h-3.5" />
                                {session.sessionDate} · {session.location}
                              </p>
                            </div>
                          </div>

                          <button
                            onClick={() => handleToggleSessionOccurred(session.localId, !!session.isOccurred)}
                            className={`px-3 py-1 rounded-full text-[9px] font-black tracking-wider uppercase transition-all flex items-center gap-1 cursor-pointer border ${
                              session.isOccurred 
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                : 'bg-surface-200 hover:bg-surface-300 text-text-secondary border-transparent'
                            }`}
                          >
                            {session.isOccurred ? (
                              <>
                                <CheckCircle className="w-3 h-3 text-emerald-400" />
                                Occurred
                              </>
                            ) : (
                              'Mark Occurred'
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 4. CERTIFICATES TAB */}
                {courseDetailTab === 'certificates' && (
                  <div className="space-y-4 animate-fadeIn">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-black uppercase text-text-muted tracking-wider">
                        Certificate Generation
                      </span>

                      {/* Bulk button */}
                      <button
                        onClick={() => {
                          const stats = getCourseStats(selectedCourseId!);
                          const eligibleIds = enrollments
                            .filter(e => e.trainingId === selectedCourseId)
                            .filter(enroll => {
                              const attendedCount = attendanceLogs.filter(
                                a => a.memberId === enroll.memberId && sessions.filter(s => s.trainingId === selectedCourseId).map(s => s.localId).includes(a.sessionId)
                              ).length;
                              const rate = stats.occurredCount > 0 
                                ? Math.round((attendedCount / stats.occurredCount) * 100)
                                : 100;
                              return rate >= stats.requiredRate;
                            })
                            .map(e => e.memberId);
                          handleBulkIssueCertificates(selectedCourseId!, eligibleIds);
                        }}
                        className="px-3 py-1.5 bg-gold-500 text-black rounded-full font-black text-[10px] tracking-wider uppercase shadow-md flex items-center gap-1 cursor-pointer hover:bg-gold-400"
                      >
                        <Award className="w-3.5 h-3.5" />
                        Bulk Issue Eligible
                      </button>
                    </div>

                    <div className="space-y-2.5 max-h-[350px] overflow-y-auto scrollbar-none">
                      {enrollments.filter(e => e.trainingId === selectedCourseId).length === 0 ? (
                        <div className="p-8 text-center text-xs text-text-muted italic bg-white/[0.01] border border-dashed border-white/5 rounded-2xl">
                          No students enrolled.
                        </div>
                      ) : (
                        enrollments.filter(e => e.trainingId === selectedCourseId).map((enroll) => {
                          const mInfo = members.find(m => m.localId === enroll.memberId);
                          const stats = getCourseStats(selectedCourseId!);
                          const attendedCount = attendanceLogs.filter(
                            a => a.memberId === enroll.memberId && sessions.filter(s => s.trainingId === selectedCourseId).map(s => s.localId).includes(a.sessionId)
                          ).length;
                          const rate = stats.occurredCount > 0 
                            ? Math.round((attendedCount / stats.occurredCount) * 100)
                            : 100;

                          const isEligible = rate >= stats.requiredRate;
                          const certInfo = certificates.find(c => c.trainingId === selectedCourseId && c.memberId === enroll.memberId);

                          return (
                            <div 
                              key={enroll.localId}
                              className="p-3.5 bg-surface-100 rounded-2xl border border-white/5 flex justify-between items-center"
                            >
                              <div>
                                <h5 className="text-xs font-black text-text-primary">{mInfo?.fullName}</h5>
                                <p className="text-[10px] text-text-muted mt-0.5">Attendance: {rate}% ({attendedCount}/{stats.totalSessionsCount} sessions)</p>
                                
                                {certInfo && (
                                  <div className="mt-1.5 flex items-center gap-1.5">
                                    <span className="text-[9px] font-mono font-bold text-gold-400">{certInfo.certificateNumber}</span>
                                    <AccentBadge 
                                      label={certInfo.status === 'verified' ? 'Signed & Issued' : 'Awaiting Pastor Approval'} 
                                      variant={certInfo.status === 'verified' ? 'sage' : 'gold'} 
                                      size="sm"
                                    />
                                  </div>
                                )}
                              </div>

                              <div>
                                {certInfo ? (
                                  certInfo.status === 'pending' && currentRole?.id === 'lead_pastor' ? (
                                    <button
                                      onClick={() => handleVerifyCertificateApproval(certInfo.remoteId || certInfo.localId)}
                                      className="px-2.5 py-1.5 bg-gold-500 hover:bg-gold-400 text-black rounded-pill font-black text-[9px] tracking-wider uppercase cursor-pointer transition-colors flex items-center gap-1"
                                    >
                                      <Check className="w-3 h-3" />
                                      Pastor Sign
                                    </button>
                                  ) : certInfo.status === 'verified' ? (
                                    <button
                                      onClick={() => handleDownloadCertificate(
                                        certInfo,
                                        courses.find(c => c.localId === selectedCourseId)?.title || 'Academy Course',
                                        mInfo?.fullName || 'Member'
                                      )}
                                      className="px-2.5 py-1.5 bg-surface-200 text-text-secondary rounded-pill font-black text-[9px] tracking-wider uppercase cursor-pointer transition-colors flex items-center gap-1 border border-white/5"
                                    >
                                      <Download className="w-3 h-3 text-gold-500" />
                                      View Certificate
                                    </button>
                                  ) : (
                                    <span className="text-[9px] font-bold text-text-muted italic">Pending signature</span>
                                  )
                                ) : isEligible ? (
                                  <button
                                    onClick={() => handleIssueCertificate(selectedCourseId!, enroll.memberId)}
                                    className="px-2.5 py-1.5 bg-gold-500/10 border border-gold-500/20 text-gold-500 hover:bg-gold-500 hover:text-black rounded-pill font-black text-[9px] tracking-wider uppercase cursor-pointer transition-all flex items-center gap-1"
                                  >
                                    <Sparkles className="w-3 h-3" />
                                    Issue
                                  </button>
                                ) : (
                                  <span className="text-[9px] font-bold text-rose-400 bg-rose-500/5 px-2.5 py-1 border border-rose-500/10 rounded-full">Ineligible</span>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            /* A3. COURSE LIST */
            <motion.div
              key="course-list-cms"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
              id="courses-cms-list"
            >
              <SectionTitle
                title="Courses"
                action={{
                  label: "+ New Course",
                  onPress: () => { setIsCreatingCourse(true); }
                }}
              />

              {/* Tab Strip */}
              <div className="flex bg-surface-100 p-1 rounded-xl border border-white/5" id="cms-tab-strip">
                {(['Active', 'Draft', 'Completed', 'All'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveCmsTab(tab)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold tracking-wider uppercase transition-all ${
                      activeCmsTab === tab
                        ? 'bg-gold-500 text-black shadow-sm font-black'
                        : 'text-text-muted hover:text-text-secondary cursor-pointer'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* List */}
              <div className="grid grid-cols-1 gap-3.5">
                {courses.length === 0 ? (
                  <div className="p-8 text-center space-y-4 bg-surface-100 border border-white/5 rounded-3xl">
                    <p className="text-xs text-text-secondary italic leading-relaxed">
                      {trainingLoading
                        ? 'Loading the confirmed Academy catalog…'
                        : 'No Academy courses have been published yet. Create the first course to begin.'}
                    </p>
                  </div>
                ) : (
                  courses
                    .filter(c => {
                      if (activeCmsTab === 'Active') return c.status === 'ongoing' && !c.isDraft;
                      if (activeCmsTab === 'Draft') return c.isDraft;
                      if (activeCmsTab === 'Completed') return c.status === 'completed' && !c.isDraft;
                      return true; // All
                    })
                    .map((course) => {
                      const stats = getCourseStats(course.localId);
                      return (
                        <GlassCard
                          key={course.localId}
                          pressable
                          onPress={() => {
                            setSelectedCourseId(course.localId);
                          }}
                          className="p-4 flex flex-col justify-between border border-white/5 min-h-[115px] hover:scale-[1.01] transition-transform"
                        >
                          <div className="flex justify-between items-start text-left">
                            <div className="space-y-0.5">
                              <h4 className="text-sm font-extrabold text-text-primary leading-tight">
                                {course.title}
                              </h4>
                              <p className="text-[11px] text-text-secondary leading-relaxed line-clamp-2">
                                {course.description}
                              </p>
                              <p className="text-[10px] text-text-muted flex items-center gap-1.5 mt-1">
                                <Clock className="w-3.5 h-3.5 text-gold-500" />
                                {course.schedule}
                              </p>
                            </div>
                            <AccentBadge 
                              label={course.isDraft ? 'Draft' : course.status} 
                              variant={course.isDraft ? 'gold' : course.status === 'ongoing' ? 'sage' : 'muted'} 
                              size="sm"
                            />
                          </div>

                          <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <AccentBadge label={`${stats.totalEnrolled} Enrolled`} variant="muted" size="sm" />
                              <span className="text-[10px] text-text-muted">Avg Attendance:</span>
                              <span className="text-xs font-mono font-bold text-gold-400">{stats.attendanceRate}%</span>
                            </div>

                            <span className="text-[10px] text-gold-500 font-extrabold flex items-center gap-1">
                              View Details
                              <ChevronDown className="w-3 h-3 transform -rotate-90" />
                            </span>
                          </div>
                        </GlassCard>
                      );
                    })
                )}
              </div>

              {/* QUICK SCANNER CTA */}
              <div className="pt-3" id="quick-scanner-bar">
                <button
                  onClick={() => setIsScannerOpen(true)}
                  className="w-full h-12 bg-gold-500 text-black font-extrabold text-sm uppercase tracking-wider rounded-full shadow-glow-gold flex items-center justify-center gap-2 hover:bg-gold-400 cursor-pointer hover:scale-[1.01] transition-all"
                >
                  <QrCode className="w-5 h-5 stroke-[2.5]" />
                  Scan Attendance QR
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* ======================================================================
          MEMBER VIEW — MY ACADEMY
          ====================================================================== */}
      {roleView === 'member' && (
        <div className="space-y-5 text-left animate-fadeIn">
          {!currentMember && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-text-secondary">
              Your login is not linked to an active member registry profile yet. You can browse the Academy catalog, but enrollment and your QR pass require an administrator to link your profile.
            </div>
          )}
          <SectionTitle title="My Academy" />

          {/* MY QR BADGE CARD */}
          {currentMember && <div className="flex justify-center px-1" id="member-badge-card">
            <GlassCard
              variant="elevated"
              className="p-5 w-full max-w-[290px] text-center border-white/10 relative overflow-hidden flex flex-col items-center justify-center cursor-pointer hover:scale-[1.01] transition-transform shadow-glow-gold/10"
              pressable
              onPress={() => setIsFullscreenBadgeOpen(true)}
            >
              {/* Gold border insets */}
              <div className="absolute inset-2 border border-gold-500/20 rounded-2xl pointer-events-none" />

              <span className="text-[10px] font-bold text-gold-500 tracking-[0.16em] uppercase block mb-3.5">
                Fellowship Pass
              </span>

              {/* QR Container (White bg, never inverted) */}
              <div className="bg-white p-3.5 rounded-2xl shadow-lg ring-4 ring-gold-500/10 flex items-center justify-center mb-4 cursor-pointer hover:scale-[1.02] transition-transform">
                <SimulatedQRCode value={currentMember?.qrCode || getMemberBadgeCode(currentUser.localId)} size={160} />
              </div>

              <h4 className="text-base font-black text-text-primary leading-tight">
                {currentUser.name}
              </h4>
              <span className="text-xs font-mono font-bold text-text-muted mt-1 block tracking-wider">
                {currentMember?.qrCode || getMemberBadgeCode(currentUser.localId)}
              </span>

              <span className="text-[10px] font-bold text-text-muted mt-4 block flex items-center justify-center gap-1">
                <Sparkles className="w-3 h-3 text-gold-500" />
                Tap to expand fullscreen check-in
              </span>
            </GlassCard>
          </div>}

          {/* MY ENROLLED COURSES */}
          <div className="space-y-3">
            <SectionTitle
              title="My Courses"
              badge={{
                label: `${enrollments.filter(e => e.memberId === currentMemberId).length} Enrolled`,
                variant: 'gold'
              }}
            />

            <div className="grid grid-cols-1 gap-3">
              {enrollments.filter(e => e.memberId === currentMemberId).length === 0 ? (
                <div className="py-8 text-center text-xs text-text-muted italic bg-surface-100 rounded-3xl border border-white/5">
                  You are not enrolled in any training courses yet. Browse catalog below to register!
                </div>
              ) : (
                enrollments
                  .filter(e => e.memberId === currentMemberId)
                  .map((enroll) => {
                    const courseObj = courses.find(c => c.localId === enroll.trainingId);
                    if (!courseObj) return null;

                    const stats = getCourseStats(enroll.trainingId);
                    const courseSessions = sessions.filter(s => s.trainingId === enroll.trainingId);
                    const sessionIds = courseSessions.map(s => s.localId);
                    
                    const attendedCount = attendanceLogs.filter(
                      a => a.memberId === currentMemberId && sessionIds.includes(a.sessionId)
                    ).length;

                    const currentRate = stats.occurredCount > 0 
                      ? Math.round((attendedCount / stats.occurredCount) * 100)
                      : 100;

                    const isBelowThreshold = currentRate < courseObj.requiredAttendanceRate && stats.occurredCount > 1;

                    return (
                      <GlassCard 
                        key={enroll.localId} 
                        className="p-4 flex flex-col gap-3.5 border border-white/5"
                        id={`member-course-${enroll.trainingId}`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3.5 min-w-0">
                            <ProgressRing
                              percent={(attendedCount / (courseObj.totalSessions || 8)) * 100}
                              centerLabel={`${attendedCount}/${courseObj.totalSessions || 8}`}
                              size={42}
                            />
                            
                            <div className="min-w-0 space-y-0.5">
                              <h4 className="text-sm font-extrabold text-text-primary truncate">
                                {courseObj.title}
                              </h4>
                              <p className="text-[10px] text-text-secondary truncate">
                                Next Session: <span className="font-bold text-gold-400">{courseObj.schedule}</span>
                              </p>
                              <p className="text-[10px] text-text-muted">
                                Required: {courseObj.requiredAttendanceRate || 80}% · Current: {currentRate}%
                              </p>
                            </div>
                          </div>

                          <AccentBadge 
                            label={courseObj.status} 
                            variant={courseObj.status === 'ongoing' ? 'sage' : 'muted'} 
                            size="sm" 
                          />
                        </div>

                        {/* Attendance Warning if below threshold */}
                        {isBelowThreshold && (
                          <div className="bg-rose-500/10 border border-rose-500/20 p-2.5 rounded-xl flex gap-2" id="attendance-warning-box">
                            <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0" />
                            <p className="text-[10px] text-rose-400 leading-normal font-semibold">
                              You need {courseObj.requiredAttendanceRate || 80}% attendance for your certificate — don't miss the next session!
                            </p>
                          </div>
                        )}
                      </GlassCard>
                    );
                  })
              )}
            </div>
          </div>

          {/* MY CERTIFICATES */}
          <div className="space-y-3">
            <SectionTitle title="My Certificates" />
            
            {certificates.filter(c => c.memberId === currentMemberId && c.status === 'verified').length === 0 ? (
              <div className="p-8 text-center text-xs text-text-muted italic bg-surface-100 rounded-3xl border border-white/5">
                No verified certificates earned yet. Keep attending courses to graduate!
              </div>
            ) : (
              <div className="flex gap-3.5 overflow-x-auto pb-2 px-0.5 scrollbar-none snap-x snap-mandatory" id="earned-certificates-slider">
                {certificates
                  .filter(c => c.memberId === currentMemberId && c.status === 'verified')
                  .map((cert) => {
                    const courseObj = courses.find(co => co.localId === cert.trainingId);
                    const courseTitle = courseObj?.title || 'Academy Course';
                    const stats = getCourseStats(cert.trainingId);
                    
                    return (
                      <div 
                        key={cert.localId}
                        className="snap-start flex-shrink-0 w-[240px] bg-gold-500/5 border border-gold-500/25 rounded-2xl p-4 flex flex-col justify-between min-h-[130px]"
                      >
                        <div>
                          <div className="flex justify-between items-start">
                            <span className="text-[9px] font-bold text-gold-400 uppercase tracking-widest">Leadership Academy</span>
                            <Award className="w-4 h-4 text-gold-500 fill-gold-500/10" />
                          </div>
                          <h5 className="text-xs font-black text-text-primary mt-1.5 leading-tight line-clamp-2">
                            {courseTitle}
                          </h5>
                          <p className="text-[10px] text-text-muted mt-1 font-semibold">Graduated: {new Date(cert.issuedAt).toLocaleDateString()}</p>
                        </div>

                        <div className="mt-3 pt-2 border-t border-gold-500/10 flex justify-between items-center">
                          <span className="text-[9px] font-mono text-text-muted">{cert.certificateNumber}</span>
                          <button
                            onClick={() => handleDownloadCertificate(
                              cert,
                              courseTitle,
                              currentMember?.fullName || currentUser?.name || 'Member'
                            )}
                            className="px-2.5 py-1 bg-gold-500/10 hover:bg-gold-500/20 text-gold-500 font-extrabold text-[10px] rounded-full border border-gold-500/25 flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <Download className="w-3 h-3" />
                            Download
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* COURSE CATALOG */}
          <div className="space-y-3">
            <SectionTitle title="Course Catalog" />
            <div className="space-y-2 bg-surface-100 border border-white/5 rounded-3xl p-2" id="course-catalog">
              {courses.filter(c => c.status === 'upcoming' || c.status === 'ongoing').length === 0 ? (
                <p className="text-xs text-text-muted p-4 italic text-center">No active courses cataloged at this time.</p>
              ) : (
                courses
                  .filter(c => c.status === 'upcoming' || c.status === 'ongoing')
                  .map((course) => {
                    const isEnrolled = enrollments.some(e => e.trainingId === course.localId && e.memberId === currentMemberId);
                    const maxCount = course.maxEnrollment || 0;

                    return (
                      <ContentRow
                        key={course.localId}
                        title={course.title}
                        subtitle={course.description}
                        meta={`${course.schedule} · ${maxCount > 0 ? 'Limited enrollment' : 'Open enrollment'}`}
                        action={
                          isEnrolled ? (
                            <span className="px-3 py-1 bg-semantic-success/10 border border-semantic-success/20 text-semantic-success font-bold text-[10px] rounded-full">
                              Enrolled ✓
                            </span>
                          ) : (
                            <button
                              onClick={() => handleMemberEnroll(course.localId)}
                              className="px-3 py-1 bg-gold-500/15 border border-gold-500/25 text-gold-500 font-black text-[10px] rounded-full hover:bg-gold-500 hover:text-black cursor-pointer transition-colors"
                            >
                              Enroll
                            </button>
                          )
                        }
                      />
                    );
                  })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================================
          SUB-SCREEN: QR SCANNER OVERLAY
          ====================================================================== */}
      <AnimatePresence>
        {isScannerOpen && (
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            className="fixed inset-0 bg-black z-50 overflow-hidden flex flex-col justify-between"
            id="qr-scanner-overlay"
          >
            {/* Viewfinder Camera Area */}
            <div className="relative flex-1 bg-black flex flex-col items-center justify-center">
              
              {/* SUCCESS FLASH OVERLAYS */}
              <AnimatePresence>
                {scanResultState === 'success' && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 0.8, 0] }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.35 }}
                    className="absolute inset-0 bg-emerald-500/40 mix-blend-screen z-40 pointer-events-none"
                  />
                )}
                {scanResultState === 'late' && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 0.8, 0] }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.35 }}
                    className="absolute inset-0 bg-amber-500/40 mix-blend-screen z-40 pointer-events-none"
                  />
                )}
                {scanResultState === 'not-enrolled' && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 0.8, 0] }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.35 }}
                    className="absolute inset-0 bg-amber-500/40 mix-blend-screen z-40 pointer-events-none"
                  />
                )}
                {scanResultState === 'already-checked-in' && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 0.8, 0] }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.35 }}
                    className="absolute inset-0 bg-surface-200/20 mix-blend-screen z-40 pointer-events-none"
                  />
                )}
              </AnimatePresence>

              {/* Viewfinder Target Frame */}
              <div className="relative w-[245px] h-[245px] border border-white/10 rounded-2xl flex items-center justify-center z-10 overflow-hidden bg-white/[0.02]">
                {/* Gold corner brackets */}
                <span className="absolute top-0 left-0 w-6 h-6 border-t-[4px] border-l-[4px] border-gold-500 rounded-tl-xl animate-pulse" />
                <span className="absolute top-0 right-0 w-6 h-6 border-t-[4px] border-r-[4px] border-gold-500 rounded-tr-xl animate-pulse" />
                <span className="absolute bottom-0 left-0 w-6 h-6 border-b-[4px] border-l-[4px] border-gold-500 rounded-bl-xl animate-pulse" />
                <span className="absolute bottom-0 right-0 w-6 h-6 border-b-[4px] border-r-[4px] border-gold-500 rounded-br-xl animate-pulse" />

                {/* Pulsing scanning red/gold laser line */}
                <motion.div
                  animate={{ y: [-110, 110, -110] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute left-0 right-0 h-1 bg-gold-500 shadow-[0_0_12px_#D4A84A] z-20"
                />

                {/* Align Badge Guide Text */}
                <div className="absolute inset-4 border border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center opacity-60">
                  <Camera className="w-8 h-8 text-white/30 mb-2 animate-pulse" />
                  <span className="text-[10px] text-white/40 font-bold uppercase tracking-widest text-center">
                    Align QR Badge
                  </span>
                </div>

                {/* SUCCESS / RESULT POPUP OVERLAYS */}
                <AnimatePresence>
                  {scanResultState === 'success' && (
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      className="absolute inset-2 bg-black/90 rounded-xl flex flex-col items-center justify-center text-center space-y-3 z-30 border border-emerald-500/40 shadow-2xl p-4"
                    >
                      <div className="w-14 h-14 rounded-full bg-emerald-500 flex items-center justify-center text-black font-black text-lg shadow-lg">
                        {scannedMemberAvatar}
                      </div>
                      <div>
                        <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest block">CHECKED IN</span>
                        <h4 className="text-sm font-black text-white mt-0.5">{scannedMemberName}</h4>
                        <span className="text-[10px] text-[#7BC47F] mt-1 block font-bold">✓ Success</span>
                      </div>
                    </motion.div>
                  )}

                  {scanResultState === 'late' && (
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      className="absolute inset-2 bg-black/90 rounded-xl flex flex-col items-center justify-center text-center space-y-3 z-30 border border-amber-500/40 shadow-2xl p-4"
                    >
                      <div className="w-14 h-14 rounded-full bg-amber-500 flex items-center justify-center text-black font-black text-lg shadow-lg">
                        {scannedMemberAvatar}
                      </div>
                      <div>
                        <span className="text-[9px] font-bold text-amber-400 uppercase tracking-widest block">CHECKED IN LATE</span>
                        <h4 className="text-sm font-black text-white mt-0.5">{scannedMemberName}</h4>
                        <span className="text-[10px] text-amber-400 mt-1 block font-bold">⏰ Past grace period</span>
                      </div>
                    </motion.div>
                  )}

                  {scanResultState === 'already-checked-in' && (
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      className="absolute inset-2 bg-black/90 rounded-xl flex flex-col items-center justify-center text-center space-y-3 z-30 border border-white/20 shadow-2xl p-4"
                    >
                      <div className="w-12 h-12 rounded-full bg-surface-200 flex items-center justify-center text-text-primary font-black text-sm">
                        {scannedMemberAvatar}
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-white">{scannedMemberName}</h4>
                        <span className="text-[10px] text-text-muted block mt-1 leading-normal font-semibold">
                          Already checked in today
                        </span>
                      </div>
                    </motion.div>
                  )}

                  {scanResultState === 'not-enrolled' && (
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      className="absolute inset-2 bg-black/95 rounded-xl flex flex-col items-center justify-center text-center space-y-3.5 z-30 border border-gold-500/40 shadow-2xl p-4"
                    >
                      <div className="w-12 h-12 rounded-full bg-amber-500/15 text-gold-500 flex items-center justify-center font-bold text-sm">
                        {scannedMemberAvatar}
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-white truncate max-w-[150px]">{scannedMemberName}</h4>
                        <span className="text-[10px] text-amber-400 block font-semibold leading-tight mt-1">
                          ⚠ Not enrolled in this course
                        </span>
                      </div>
                      <button
                        onClick={handleQuickEnrollAndCheckIn}
                        className="px-4 py-2 bg-gold-500 text-black text-[10px] font-black uppercase tracking-wider rounded-full hover:bg-gold-400 cursor-pointer shadow-md"
                      >
                        Enroll Now
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* TOP HEADER SELECTORS BAR */}
              <div className="absolute top-0 left-0 right-0 p-5 bg-gradient-to-b from-black/90 to-transparent flex flex-col gap-3.5 z-20">
                <div className="flex items-center justify-between">
                  <div className="text-left">
                    <h3 className="text-sm font-black text-white flex items-center gap-2">
                      <QrCode className="w-4 h-4 text-gold-500" />
                      Scan Member Badge
                    </h3>
                    <p className="text-[11px] text-white/50">Hold Pass inside target box to verify</p>
                  </div>
                  <button
                    onClick={() => { setIsScannerOpen(false); setScanResultState('idle'); }}
                    className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Dropdowns */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[9px] font-black text-white/40 uppercase tracking-widest block mb-1 text-left">Course</label>
                    <select
                      value={scannerSelectedTrainingId}
                      onChange={(e) => handleScannerCourseChange(e.target.value)}
                      className="w-full bg-white/10 text-white border border-white/10 text-[11px] font-semibold p-2 rounded-lg focus:outline-none"
                    >
                      <option value="" className="text-black">-- Select Course --</option>
                      {courses.filter(c => !c.isDraft).map(c => (
                        <option key={c.localId} value={c.localId} className="text-black">{c.title}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-white/40 uppercase tracking-widest block mb-1 text-left">Session</label>
                    <select
                      value={scannerSelectedSessionId}
                      onChange={(e) => setScannerSelectedSessionId(e.target.value)}
                      className="w-full bg-white/10 text-white border border-white/10 text-[11px] font-semibold p-2 rounded-lg focus:outline-none"
                    >
                      <option value="" className="text-black">-- Select Session --</option>
                      {sessions
                        .filter(s => s.trainingId === scannerSelectedTrainingId)
                        .map(s => (
                          <option key={s.localId} value={s.localId} className="text-black">Session #{s.sessionNumber} ({s.sessionDate})</option>
                        ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Development-only scanner simulator */}
              {isRoleSimulatorEnabled && <div className="absolute bottom-[220px] left-0 right-0 px-5 z-20 space-y-2">
                <span className="text-[10px] font-black text-white/40 uppercase tracking-wider block text-left">
                  💻 Simulator Testing Console
                </span>
                <div className="bg-white/5 border border-white/10 rounded-2xl p-3 grid grid-cols-2 gap-2">
                  <div className="col-span-2 text-left">
                    <span className="text-[9px] text-white/60 block mb-1 font-bold">Select member pass to emulate:</span>
                    <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                      {members.slice(0, 5).map(m => (
                        <button
                          key={m.localId}
                          onClick={() => handleBarcodeDecoded(m.qrCode || getMemberBadgeCode(m.localId))}
                          className="px-2.5 py-1 bg-gold-500/20 border border-gold-500/30 text-gold-400 rounded-full text-[10px] font-bold hover:bg-gold-500 hover:text-black cursor-pointer transition-colors flex-shrink-0"
                        >
                          Scan {m.fullName.split(' ')[0]}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>}

              {/* MANUAL CODE ENTRY FALLBACK */}
              <div className="absolute bottom-[135px] left-0 right-0 px-5 z-20">
                <form onSubmit={handleManualCodeSubmit} className="flex gap-2 bg-white/10 border border-white/10 p-1.5 rounded-xl">
                  <input
                    type="text"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    placeholder="Enter CC-2026-XXXX manually"
                    className="flex-1 bg-transparent border-none text-xs font-mono font-bold text-white focus:outline-none px-2"
                  />
                  <button
                    type="submit"
                    className="px-3.5 py-1.5 bg-gold-500 text-black font-extrabold text-[10px] uppercase tracking-wider rounded-lg cursor-pointer hover:bg-gold-400"
                  >
                    Submit
                  </button>
                </form>
              </div>

              {/* BOTTOM SCAN FEED FEEDBACK */}
              <div className="absolute bottom-0 left-0 right-0 h-[125px] bg-black border-t border-white/10 p-4 overflow-y-auto scrollbar-none z-20 text-left">
                <span className="text-[9px] font-black text-white/40 uppercase tracking-widest block mb-2">Live Session Scan Feed (Last 5)</span>
                {lastScans.length === 0 ? (
                  <p className="text-[11px] text-white/30 italic">No attendance scans recorded in this session yet.</p>
                ) : (
                  <div className="space-y-2">
                    {lastScans.map((scan) => (
                      <div key={scan.id} className="flex items-center justify-between text-xs text-white/90">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-6 h-6 rounded-full bg-gold-500 text-black flex items-center justify-center font-bold text-[9px]">
                            {scan.avatar}
                          </div>
                          <span className="font-bold truncate">{scan.name}</span>
                          <span className="text-[9px] text-white/40 truncate">({scan.courseTitle})</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 font-mono text-[9px] text-white/50">
                          <span>{scan.time}</span>
                          <span className={`px-2 py-0.5 rounded-full font-bold ${
                            scan.status.includes('Checked') ? 'text-emerald-400 bg-emerald-500/10' : 'text-amber-400 bg-amber-500/10'
                          }`}>
                            {scan.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ======================================================================
          SUB-SCREEN: FULLSCREEN QR EXPANSION overlay
          ====================================================================== */}
      <AnimatePresence>
        {isFullscreenBadgeOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-white z-50 flex flex-col justify-between p-6 text-black select-none"
            id="fullscreen-qr-badge"
          >
            {/* Upper Spacer */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase text-[#7B1D31] tracking-widest">Leadership Academy pass</span>
              <button
                onClick={() => setIsFullscreenBadgeOpen(false)}
                className="w-10 h-10 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center cursor-pointer transition-colors"
              >
                <X className="w-5 h-5 text-black" />
              </button>
            </div>

            {/* Centered Large QR Badge */}
            <div className="flex flex-col items-center justify-center space-y-6">
              <h3 className="text-lg font-black text-[#7B1D31] uppercase tracking-[0.15em] text-center">Fellowship Pass</h3>
              
              <div className="p-5 bg-white border-4 border-[#D4A84A] rounded-3xl shadow-xl">
                <SimulatedQRCode value={currentMember?.qrCode || getMemberBadgeCode(currentUser.localId)} size={260} />
              </div>

              <div className="text-center space-y-1">
                <h4 className="text-2xl font-black text-black">{currentUser.name}</h4>
                <p className="text-sm font-mono font-bold text-gray-500 tracking-wider">
                  {currentMember?.qrCode || getMemberBadgeCode(currentUser.localId)}
                </p>
              </div>

              <div className="bg-[#FCFAF2] border border-[#D4A84A]/30 p-3.5 rounded-2xl max-w-[280px]">
                <p className="text-xs text-center text-gray-600 leading-normal font-semibold">
                  Show this scannable Fellowship Pass to the Training Academy coordinator for rapid check-in.
                </p>
              </div>
            </div>

            {/* Bottom guide footer */}
            <div className="text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest pb-4">
              ChurchConnect Academy System 2026
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ======================================================================
          SUB-MODAL: ADD STUDENT SEARCH SHEET
          ====================================================================== */}
      <AnimatePresence>
        {isAddStudentOpen && (
          <BottomSheet
            id="add-student-modal"
            title="Enroll Member to Course"
            onClose={() => { setIsAddStudentOpen(false); setSearchStudentQuery(''); }}
            isOpen={isAddStudentOpen}
          >
            <div className="space-y-4 text-left p-4">
              <div>
                <label className="text-xs font-bold text-gold-400 uppercase tracking-widest block mb-1.5">
                  Search Member
                </label>
                <div className="flex items-center bg-surface-200 border border-white/5 rounded-xl px-3 py-2">
                  <Search className="w-4 h-4 text-text-muted mr-2" />
                  <input
                    type="text"
                    value={searchStudentQuery}
                    onChange={(e) => setSearchStudentQuery(e.target.value)}
                    placeholder="Search name, phone, or email..."
                    className="bg-transparent border-none text-xs text-text-primary focus:outline-none w-full"
                  />
                </div>
              </div>

              <div className="space-y-2 max-h-[220px] overflow-y-auto scrollbar-none">
                {members
                  .filter(m => 
                    m.fullName.toLowerCase().includes(searchStudentQuery.toLowerCase()) ||
                    m.email.toLowerCase().includes(searchStudentQuery.toLowerCase())
                  )
                  .slice(0, 5)
                  .map((member) => (
                    <div 
                      key={member.localId}
                      className="p-3 bg-surface-200 rounded-xl flex justify-between items-center"
                    >
                      <div>
                        <h5 className="text-xs font-bold text-text-primary">{member.fullName}</h5>
                        <p className="text-[10px] text-text-muted mt-0.5">{member.email}</p>
                      </div>
                      <button
                        onClick={() => handleManualStudentEnroll(member.localId)}
                        className="px-3 py-1 bg-gold-500 text-black text-[10px] font-black uppercase tracking-wider rounded-lg hover:bg-gold-400"
                      >
                        Enroll
                      </button>
                    </div>
                  ))}
                {members.filter(m => 
                  m.fullName.toLowerCase().includes(searchStudentQuery.toLowerCase())
                ).length === 0 && (
                  <p className="text-xs text-text-muted text-center py-4">No matching church members found.</p>
                )}
              </div>
            </div>
          </BottomSheet>
        )}
      </AnimatePresence>

    </div>
  );
}
