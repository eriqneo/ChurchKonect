import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useLiveQuery } from 'dexie-react-hooks';
import * as Typography from '../../lib/theme/typography';
import { useTheme } from '../../lib/theme/ThemeProvider';
import { 
  db,
  type MemberRecord
} from '../../lib/db/churchConnectDB';
import { useCurrentUser } from '../../lib/db/hooks';
import { usePrayerData, type PrayerRequestView } from '../../lib/db/prayerData';
import { 
  GlassCard, 
  AccentBadge, 
  SectionTitle, 
  BottomSheet,
  ContentRow
} from '../shared';
import { 
  Heart,
  Compass,
  Home,
  Sparkles,
  Sun,
  HelpCircle,
  Lock,
  Unlock,
  ChevronDown,
  User,
  Users,
  Check,
  Feather,
  AlertCircle,
  Plus,
  Clock,
  Send,
  X,
  ShieldAlert,
  Inbox,
  UserCheck,
  CheckCircle,
  Flame,
  Award,
  BookOpen,
  Calendar,
  Printer,
  Download,
  Filter,
  CheckSquare,
  Square,
  FileText,
  Bookmark
} from 'lucide-react';
import { staggerChildren } from '../../lib/animations';

// ==========================================
// Sacred Elements & Icon Renderers
// ==========================================
const HolyCrossIcon = ({ className = "text-gold-500" }: { className?: string }) => (
  <svg width="24" height="32" viewBox="0 0 24 32" fill="none" className={`${className} drop-shadow-[0_0_8px_rgba(212,168,74,0.4)]`}>
    <path d="M12 2V30M5 10H19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
  </svg>
);

const AltarHandsIcon = () => (
  <svg width="64" height="64" viewBox="0 0 64 64" fill="none" className="text-gold-500/40 mx-auto mb-3">
    <path d="M32 10C24 10 16 16 12 24C10 28 8 34 8 40C8 46 12 50 16 52C22 55 30 50 32 46C34 50 42 55 48 52C52 50 56 46 56 40C56 34 54 28 52 24C48 16 40 10 32 10Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M28 20C28 20 30 15 32 15C34 15 36 20 36 20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M24 32C24 32 28 28 32 28C36 28 40 32 40 32" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

// Map of categories to beautiful icons
const CATEGORIES_MAP: { [key: string]: { label: string; icon: React.ReactNode; color: string } } = {
  'Healing': { label: 'Healing', icon: <Heart className="w-3.5 h-3.5" />, color: 'rose' },
  'Guidance': { label: 'Guidance', icon: <Compass className="w-3.5 h-3.5" />, color: 'sky' },
  'Family': { label: 'Family', icon: <Users className="w-3.5 h-3.5" />, color: 'amber' },
  'Deliverance': { label: 'Deliverance', icon: <Flame className="w-3.5 h-3.5" />, color: 'violet' },
  'Thanksgiving': { label: 'Thanksgiving', icon: <Sun className="w-3.5 h-3.5" />, color: 'gold' },
  'Financial': { label: 'Financial', icon: <Sparkles className="w-3.5 h-3.5" />, color: 'emerald' },
  'Spiritual Growth': { label: 'Spiritual Growth', icon: <BookOpen className="w-3.5 h-3.5" />, color: 'indigo' },
  'Other': { label: 'Other', icon: <HelpCircle className="w-3.5 h-3.5" />, color: 'gray' },
};

type PrayerRequestRecordExtended = PrayerRequestView;
type PrayerCandidate = MemberRecord & { userId?: string };

export function PrayerModule() {
  const { isDark } = useTheme();
  const { user: currentUser, role: currentRole } = useCurrentUser();
  const {
    requests: dbRequests,
    assignments: dbAssignments,
    isLoading,
    isRefreshing,
    error,
    submitPrayer,
    assignPrayers,
    setUrgency,
    archivePrayers,
    incrementPrayer,
    addNote,
    markAnswered
  } = usePrayerData();
  const [isWorking, setIsWorking] = useState(false);

  // --------------------------------------
  // Simulated Roles & Dept controls (Oversight/Vigil controls)
  // --------------------------------------
  const isIntercessoryWorker =
    currentRole?.id === 'lead_pastor' ||
    currentRole?.id === 'administrator' ||
    currentRole?.id === 'cell_leader' ||
    dbAssignments.some((assignment) => assignment.intercessorId === currentUser?.localId) ||
    currentRole?.department.toLowerCase().includes('intercess');

  const hasPrayerBankAccess = currentRole?.id === 'lead_pastor' || currentRole?.id === 'administrator' || isIntercessoryWorker;
  const hasTriageAccess = currentRole?.id === 'lead_pastor' || currentRole?.id === 'administrator';

  // --------------------------------------
  // Tabs & Navigation State
  // --------------------------------------
  const [activeTab, setActiveTab] = useState<'submit' | 'history' | 'bank' | 'triage'>('submit');

  // If role changes, ensure current tab is authorized, else fallback to 'submit'
  const currentRoleId = currentRole?.id;
  useEffect(() => {
    if (activeTab === 'bank' && !hasPrayerBankAccess) {
      setActiveTab('submit');
    }
    if (activeTab === 'triage' && !hasTriageAccess) {
      setActiveTab('submit');
    }
  }, [activeTab, hasPrayerBankAccess, hasTriageAccess, currentRoleId, isIntercessoryWorker]);

  const dbMembers = useLiveQuery(async () => {
    return await db.members.toArray() as PrayerCandidate[];
  }, []);

  // --------------------------------------
  // State: Form Submissions (Member)
  // --------------------------------------
  const [selectedCategory, setSelectedCategory] = useState<string>('Healing');
  const [prayerText, setPrayerText] = useState<string>('');
  const [isAnonymous, setIsAnonymous] = useState<boolean>(false);
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [showPulseAnimation, setShowPulseAnimation] = useState<boolean>(false);

  // --------------------------------------
  // State: Prayer Counter Ripples
  // --------------------------------------
  const [rippleMap, setRippleMap] = useState<{ [key: string]: { id: number; x: number; y: number }[] }>({});
  const [scaledId, setScaledId] = useState<string | null>(null);

  // --------------------------------------
  // State: Timeline Rhema Notes Expand & Timelines
  // --------------------------------------
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);
  const [noteTextMap, setNoteTextMap] = useState<{ [key: string]: string }>({});

  // --------------------------------------
  // State: Answered Seal Animation & Dialogs
  // --------------------------------------
  const [sealingId, setSealingId] = useState<string | null>(null);
  const [confirmAnsweredRequest, setConfirmAnsweredRequest] = useState<any | null>(null);

  // --------------------------------------
  // State: Admin Triage & Selection
  // --------------------------------------
  const [activeTriageTab, setActiveTriageTab] = useState<'New' | 'Assigned' | 'In Prayer' | 'Answered' | 'Archived'>('New');
  const [selectedRequestIds, setSelectedRequestIds] = useState<string[]>([]);
  const [assignTargetRequest, setAssignTargetRequest] = useState<any | null>(null);
  const [intercessorDeptFilter, setIntercessorDeptFilter] = useState<string>('Intercessory');
  const [selectedIntercessorIds, setSelectedIntercessorIds] = useState<string[]>([]);

  // --------------------------------------
  // State: Prayer Report Bottom Sheet / Reports View
  // --------------------------------------
  const [isReportOpen, setIsReportOpen] = useState<boolean>(false);
  const [reportStartDate, setReportStartDate] = useState<string>('2026-06-01');
  const [reportEndDate, setReportEndDate] = useState<string>('2026-06-30');
  const [reportFilterCategory, setReportFilterCategory] = useState<string>('All');
  const [reportFilterStatus, setReportFilterStatus] = useState<string>('All');
  const [generatedReport, setGeneratedReport] = useState<any | null>(null);

  // --------------------------------------
  // Intercessor View Tabs
  // --------------------------------------
  const [intercessorSubTab, setIntercessorSubTab] = useState<'my' | 'all' | 'reports'>('my');

  // --------------------------------------
  // Toast Alert Notification
  // --------------------------------------
  const [toastText, setToastText] = useState<string | null>(null);
  const triggerToast = (text: string) => {
    setToastText(text);
    setTimeout(() => setToastText(null), 3000);
  };

  // --------------------------------------
  // Vibration / Haptic feedback simulator
  // --------------------------------------
  const playHaptic = (ms: number | number[] = 15) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(ms);
      } catch (e) {}
    }
  };

  // --------------------------------------
  // Submit Prayer Request (Member Form)
  // --------------------------------------
  const handlePrayerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prayerText.trim()) {
      triggerToast('Please pour out your heart before submitting.');
      return;
    }

    playHaptic([15, 65, 15]);
    setIsWorking(true);
    try {
      await submitPrayer(selectedCategory, prayerText, isAnonymous);
      setShowPulseAnimation(true);
      setIsSubmitted(true);
    } catch (submitError) {
      triggerToast(submitError instanceof Error ? submitError.message : 'Could not submit this prayer request.');
    } finally {
      setIsWorking(false);
    }
  };

  const resetForm = () => {
    setPrayerText('');
    setSelectedCategory('Healing');
    setIsAnonymous(false);
    setIsSubmitted(false);
    setShowPulseAnimation(false);
  };

  // --------------------------------------
  // Prayer Watch Counter Increment
  // --------------------------------------
  const handleCounterIncrement = async (requestId: string, e: React.MouseEvent<HTMLButtonElement>) => {
    playHaptic(10);
    
    // Scale spring simulation
    setScaledId(requestId);
    setTimeout(() => setScaledId(null), 150);

    // Dynamic ripple math
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const newRipple = { id: Date.now(), x, y };
    setRippleMap(prev => ({
      ...prev,
      [requestId]: [...(prev[requestId] || []), newRipple]
    }));

    setTimeout(() => {
      setRippleMap(prev => ({
        ...prev,
        [requestId]: (prev[requestId] || []).filter(r => r.id !== newRipple.id)
      }));
    }, 450);

    try {
      await incrementPrayer(requestId);
    } catch (incrementError) {
      triggerToast(incrementError instanceof Error ? incrementError.message : 'Could not record this prayer watch.');
    }
  };

  // --------------------------------------
  // Inline Add Rhema Note (Timeline)
  // --------------------------------------
  const handleAddRhemaNote = async (requestId: string) => {
    const text = noteTextMap[requestId];
    if (!text || !text.trim()) return;

    playHaptic(15);
    setIsWorking(true);
    try {
      await addNote(requestId, text);
      setNoteTextMap(prev => ({ ...prev, [requestId]: '' }));
      setExpandedNoteId(null);
      triggerToast('Rhema note recorded on prayer scroll.');
    } catch (noteError) {
      triggerToast(noteError instanceof Error ? noteError.message : 'Could not save this intercessory note.');
    } finally {
      setIsWorking(false);
    }
  };

  // --------------------------------------
  // Mark Prayer Request as Answered
  // --------------------------------------
  const handleMarkAsAnswered = async (prayer: any) => {
    playHaptic([40, 90, 40]);
    setConfirmAnsweredRequest(null);
    setSealingId(prayer.localId);

    setIsWorking(true);
    await new Promise((resolve) => setTimeout(resolve, 900));
    try {
      await markAnswered(prayer.localId);
      triggerToast('Testimony sealed for the original submitter.');
    } catch (answerError) {
      triggerToast(answerError instanceof Error ? answerError.message : 'Could not mark this prayer as answered.');
    } finally {
      setSealingId(null);
      setIsWorking(false);
    }
  };

  // --------------------------------------
  // Admin Triage: Single / Bulk Assignments
  // --------------------------------------
  const openAssignSheet = (prayer: any) => {
    playHaptic(15);
    setSelectedIntercessorIds([]);
    setAssignTargetRequest(prayer);
  };

  const toggleIntercessorSelection = (intercessorId: string) => {
    playHaptic(5);
    setSelectedIntercessorIds(prev =>
      prev.includes(intercessorId) ? prev.filter(id => id !== intercessorId) : [...prev, intercessorId]
    );
  };

  const handleExecuteAssignment = async () => {
    if (!assignTargetRequest && selectedRequestIds.length === 0) return;
    if (selectedIntercessorIds.length === 0) return;

    playHaptic(25);
    const targetIds = assignTargetRequest ? [assignTargetRequest.localId] : selectedRequestIds;
    const intercessors = (dbMembers || [])
      .map((member) => ({ userId: member.userId || '', name: member.fullName }))
      .filter((member) => member.userId && selectedIntercessorIds.includes(member.userId));

    setIsWorking(true);
    try {
      await assignPrayers(targetIds, intercessors);
      triggerToast(`Watch assigned to ${intercessors.map((item) => item.name).join(', ')}.`);
      setAssignTargetRequest(null);
      setSelectedRequestIds([]);
      setSelectedIntercessorIds([]);
    } catch (assignmentError) {
      triggerToast(assignmentError instanceof Error ? assignmentError.message : 'Could not assign this prayer watch.');
    } finally {
      setIsWorking(false);
    }
  };

  const handleSetUrgency = async (requestId: string, urgency: 'Normal' | 'Urgent' | 'Critical') => {
    playHaptic(10);
    const dbUrgency = urgency === 'Normal' ? 'low' : urgency === 'Urgent' ? 'medium' : 'high';
    try {
      await setUrgency(requestId, dbUrgency);
      triggerToast(`Urgency set to ${urgency}.`);
    } catch (urgencyError) {
      triggerToast(urgencyError instanceof Error ? urgencyError.message : 'Could not update prayer urgency.');
    }
  };

  const handleArchiveRequest = async (requestId: string) => {
    playHaptic(20);
    try {
      await archivePrayers([requestId]);
      triggerToast('Prayer request moved to archived sanctuary.');
    } catch (archiveError) {
      triggerToast(archiveError instanceof Error ? archiveError.message : 'Could not archive this prayer request.');
    }
  };

  // Bulk Actions
  const toggleSelectRequest = (requestId: string) => {
    playHaptic(5);
    setSelectedRequestIds(prev => 
      prev.includes(requestId) ? prev.filter(id => id !== requestId) : [...prev, requestId]
    );
  };

  const handleBulkArchive = async () => {
    playHaptic([20, 50]);
    try {
      await archivePrayers(selectedRequestIds);
      triggerToast(`Archived ${selectedRequestIds.length} requests.`);
      setSelectedRequestIds([]);
    } catch (archiveError) {
      triggerToast(archiveError instanceof Error ? archiveError.message : 'Could not archive the selected prayer requests.');
    }
  };

  // --------------------------------------
  // Formatted Printable Report Generator
  // --------------------------------------
  const generateReportData = () => {
    playHaptic(30);
    if (!dbRequests) return;

    // Filter requests in the date range
    const inRange = dbRequests.filter(req => {
      const createdAt = req.createdAt ? new Date(req.createdAt) : new Date();
      const start = new Date(reportStartDate);
      const end = new Date(reportEndDate);
      // set hours to inclusive range
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      
      const inDate = createdAt >= start && createdAt <= end;
      const inCat = reportFilterCategory === 'All' || req.category === reportFilterCategory;
      
      let inStat = true;
      if (reportFilterStatus !== 'All') {
        if (reportFilterStatus === 'New') inStat = req.status === 'submitted';
        else if (reportFilterStatus === 'Being Prayed For') inStat = req.status === 'assigned';
        else if (reportFilterStatus === 'Answered') inStat = req.status === 'answered';
      }

      return inDate && inCat && inStat;
    });

    // Counts
    const total = inRange.length;
    const answeredCount = inRange.filter(r => r.status === 'answered').length;
    const activeCount = inRange.filter(r => r.status === 'assigned').length;
    const newCount = inRange.filter(r => r.status === 'submitted').length;

    // Category breakdown
    const categoryCounts: { [key: string]: number } = {};
    Object.keys(CATEGORIES_MAP).forEach(cat => { categoryCounts[cat] = 0; });
    inRange.forEach(r => {
      if (categoryCounts[r.category] !== undefined) {
        categoryCounts[r.category]++;
      } else {
        categoryCounts[r.category] = 1;
      }
    });

    // Testimonies (Answered prayers)
    const testimonies = inRange.filter(r => r.status === 'answered').map(r => ({
      category: r.category,
      content: r.content,
      submitterName: (r as any).isAnonymous ? 'Anonymous Member' : r.memberName,
      date: new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      notes: (r as any).rhemaNotes?.[0]?.text || r.rhemaNotes || 'Continuous intercessory vigil complete.'
    }));

    setGeneratedReport({
      total,
      answeredCount,
      activeCount,
      newCount,
      categoryCounts,
      testimonies,
      range: `${new Date(reportStartDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} — ${new Date(reportEndDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    });

    setIsReportOpen(false);
  };

  const triggerPrintReport = () => {
    playHaptic(10);
    window.print();
  };

  // --------------------------------------
  // Filtering & Mapping Lists for Screens
  // --------------------------------------
  const mySubmissions = dbRequests?.filter(p => p.memberId === currentUser.localId) || [];

  // Active assignments for the logged-in intercessor (checks every co-assignee, not just the primary one)
  const myAssignments = dbRequests?.filter(p =>
    p.status === 'assigned' && dbAssignments?.some(
      a => a.requestId === p.localId && a.intercessorId === currentUser.localId && a.status === 'active'
    )
  ) || [];

  // All active watches in the system (for pastors / admins)
  const allActiveWatches = dbRequests?.filter(p => p.status === 'assigned') || [];

  // Triage lists based on state
  const getMappedTriageStatus = (tab: string) => {
    switch (tab) {
      case 'New': return 'submitted';
      case 'Assigned': return 'assigned';
      case 'In Prayer': return 'assigned'; // Can overlap or represent active watch
      case 'Answered': return 'answered';
      case 'Archived': return 'sealed';
      default: return 'submitted';
    }
  };

  const filteredTriageList = dbRequests?.filter(p => {
    const status = p.status;
    if (activeTriageTab === 'New') return status === 'submitted';
    if (activeTriageTab === 'Assigned') return status === 'assigned';
    if (activeTriageTab === 'In Prayer') return status === 'assigned' && (p as any).prayersOfferedCount > 0;
    if (activeTriageTab === 'Answered') return status === 'answered';
    if (activeTriageTab === 'Archived') return status === 'sealed';
    return false;
  }) || [];

  // --------------------------------------
  // Visual Render Styles for Themes
  // --------------------------------------
  const isAltThemeScreen = activeTab === 'bank' || activeTab === 'submit';
  
  const containerBgClass = isAltThemeScreen
    ? (isDark ? 'bg-cathedral-950 text-cathedral-50' : 'bg-cathedral-50 text-cathedral-950')
    : 'bg-transparent text-theme-text';

  const cardStyleClass = isAltThemeScreen
    ? (isDark 
        ? 'bg-cathedral-900/35 border border-cathedral-800/40 text-cathedral-50' 
        : 'bg-cathedral-100 border border-cathedral-200 text-cathedral-900')
    : 'bg-theme-card border border-theme-border text-theme-text';

  return (
    <div className={`-mx-4 -mt-24 px-4 pt-24 pb-32 min-h-[820px] transition-colors duration-500 relative overflow-hidden select-none ${containerBgClass}`}>
      {(isLoading || isRefreshing || error) && (
        <div className={`no-print relative z-20 mb-3 rounded-xl border px-3 py-2 text-[11px] font-semibold ${
          error
            ? 'border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300'
            : 'border-gold-500/15 bg-white/40 dark:bg-black/20 text-text-secondary'
        }`}>
          {error || (isLoading ? 'Loading authorized prayer records…' : 'Refreshing prayer records…')}
        </div>
      )}
      
      {/* Dynamic Sacred Ambient Gradients for Contemplative Views */}
      {isAltThemeScreen && (
        <>
          <div 
            className="absolute inset-0 pointer-events-none opacity-[0.035] bg-repeat mix-blend-overlay z-0"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
            }}
          />
          <div className="absolute top-[20%] left-1/2 -translate-x-1/2 w-80 h-80 rounded-full bg-gold-500/5 blur-[100px] pointer-events-none z-0 animate-pulse duration-[5000ms]" />
        </>
      )}

      {/* Embedded Animations Stylesheet */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes ripple-effect {
          0% { transform: scale(0.5); opacity: 0.9; }
          100% { transform: scale(3.5); opacity: 0; }
        }
        .animate-ripple {
          animation: ripple-effect 450ms cubic-bezier(0.1, 0.8, 0.3, 1) forwards;
        }
        @keyframes custom-pulse {
          0%, 100% { transform: scale(1); opacity: 0.4; filter: drop-shadow(0 0 4px rgba(212,168,74,0.3)); }
          50% { transform: scale(1.1); opacity: 0.75; filter: drop-shadow(0 0 16px rgba(212,168,74,0.7)); }
        }
        .animate-sacred-pulse {
          animation: custom-pulse 3s infinite ease-in-out;
        }
        @keyframes seal-contract {
          0% { transform: scale(1.7); opacity: 0.1; border: 4px solid #D4A84A; }
          40% { transform: scale(1.1); opacity: 1; border: 2.5px solid #D4A84A; }
          100% { transform: scale(0.1); opacity: 0; border: 1px solid #D4A84A; }
        }
        .animate-seal-contract {
          animation: seal-contract 850ms cubic-bezier(0.15, 0.85, 0.45, 1) forwards;
        }
        .scrollbar-none::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-none {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-report-area, #printable-report-area * {
            visibility: visible;
          }
          #printable-report-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white !important;
            color: black !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}} />

      {/* ======================================================================
          PRIMARY MODULE TAB STRIP (Adapts based on simulation credentials)
          ====================================================================== */}
      <div className="no-print flex justify-center px-1 mb-6 relative z-10 max-w-md mx-auto">
        <div className="bg-surface-100/35 dark:bg-black/35 backdrop-blur-md p-1 rounded-full flex gap-1 w-full border border-white/5 shadow-inner overflow-x-auto scrollbar-none">
          <button
            id="tab-submit"
            onClick={() => { playHaptic(); setActiveTab('submit'); }}
            className={`flex-1 min-w-[65px] py-2 rounded-full text-[10px] font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-1 ${
              activeTab === 'submit'
                ? 'bg-gold-500 text-[#0C0607] shadow-sm font-black'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Petition
          </button>
          <button
            id="tab-history"
            onClick={() => { playHaptic(); setActiveTab('history'); }}
            className={`flex-1 min-w-[70px] py-2 rounded-full text-[10px] font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-1 ${
              activeTab === 'history'
                ? 'bg-gold-500 text-[#0C0607] shadow-sm font-black'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            My Prayers
          </button>
          {hasPrayerBankAccess && (
            <button
              id="tab-bank"
              onClick={() => { playHaptic(); setActiveTab('bank'); }}
              className={`flex-1 min-w-[75px] py-2 rounded-full text-[10px] font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-1 ${
                activeTab === 'bank'
                  ? 'bg-gold-500 text-[#0C0607] shadow-sm font-black'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Prayer Bank
            </button>
          )}
          {hasTriageAccess && (
            <button
              id="tab-triage"
              onClick={() => { playHaptic(); setActiveTab('triage'); }}
              className={`flex-1 min-w-[65px] py-2 rounded-full text-[10px] font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-1 ${
                activeTab === 'triage'
                  ? 'bg-gold-500 text-[#0C0607] shadow-sm font-black'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Triage
            </button>
          )}
        </div>
      </div>

      {/* ======================================================================
          VIEW 1: MEMBER — PRAYER PETITION SUBMISSION
          ====================================================================== */}
      {activeTab === 'submit' && (
        <div className="no-print relative z-10 max-w-md mx-auto">
          <AnimatePresence mode="wait">
            {!isSubmitted ? (
              <motion.div
                key="prayer-form-view"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-6 pt-2"
              >
                {/* Contemplative Header */}
                <div className="text-center space-y-2.5">
                  <div className="flex justify-center">
                    <HolyCrossIcon />
                  </div>
                  <h1 className="text-xl font-black text-gold-500 tracking-widest uppercase font-mono">
                    Prayer Request
                  </h1>
                  <p className="text-xs text-text-secondary max-w-[280px] mx-auto leading-relaxed">
                    Lay your burden down. Your request enters a continuous altar watch of dedicated intercessors.
                  </p>
                </div>

                <form onSubmit={handlePrayerSubmit} className="space-y-6">
                  
                  {/* Anonymous Toggle (Prominent, Top of Form) */}
                  <div className={`p-4 rounded-2xl border ${isDark ? 'bg-cathedral-900/40 border-cathedral-800/40' : 'bg-cathedral-100/50 border-cathedral-200'} space-y-2`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <Lock className="w-4 h-4 text-gold-500" />
                        <span className="text-sm font-bold text-text-primary">Submit Anonymously</span>
                      </div>
                      <button
                        id="btn-anonymous-toggle"
                        type="button"
                        onClick={() => { playHaptic(); setIsAnonymous(!isAnonymous); }}
                        className={`w-11 h-6 rounded-full p-1 transition-all ${
                          isAnonymous ? 'bg-gold-500' : 'bg-surface-300 dark:bg-white/10'
                        }`}
                      >
                        <div 
                          className={`w-4 h-4 rounded-full bg-[#0C0607] transition-all transform ${
                            isAnonymous ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                    
                    <p className="text-[11px] text-text-secondary leading-relaxed">
                      {isAnonymous 
                        ? "Your identity will be hidden from intercessors" 
                        : "Your name will be visible to intercessors during prayer watches"}
                    </p>
                  </div>

                  {/* Submitter Name Field (Disappears or shows "Anonymous") */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black tracking-wider uppercase text-gold-500">
                      Submitter Identity
                    </label>
                    <div className="px-4 py-3 rounded-xl bg-white/5 border border-white/5 text-xs text-text-primary font-bold">
                      {isAnonymous ? '✦ Anonymous Member' : currentUser.name}
                    </div>
                  </div>

                  {/* Category Selector Pills (Horizontal Scroll) */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black tracking-wider uppercase text-gold-500">
                      Petition Category
                    </label>
                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none snap-x">
                      {Object.keys(CATEGORIES_MAP).map((catKey) => {
                        const cat = CATEGORIES_MAP[catKey];
                        const active = selectedCategory === catKey;
                        return (
                          <button
                            id={`category-pill-${catKey}`}
                            key={catKey}
                            type="button"
                            onClick={() => { playHaptic(); setSelectedCategory(catKey); }}
                            className={`snap-start flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-bold transition-all border ${
                              active
                                ? 'bg-gold-500 text-[#0C0607] border-gold-500 shadow-glow-gold font-black'
                                : 'bg-white/5 text-text-secondary border-white/5 hover:bg-white/10'
                            }`}
                          >
                            <span className="flex items-center gap-1.5">
                              {cat.icon}
                              {cat.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Prayer Content Textarea (120px min, gold focus ring) */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black tracking-wider uppercase text-gold-500">
                      Prayer Request Content
                    </label>
                    <div className="relative rounded-2xl overflow-hidden bg-white/5 border border-white/10 focus-within:ring-2 focus-within:ring-gold-500/85 focus-within:border-transparent transition-all shadow-inner">
                      <textarea
                        id="prayer-textarea"
                        value={prayerText}
                        onChange={(e) => setPrayerText(e.target.value)}
                        placeholder="Pour out your heart..."
                        className="w-full min-h-[130px] px-5 py-4 bg-transparent text-text-primary text-sm leading-relaxed placeholder-text-secondary/45 focus:outline-none resize-none"
                      />
                    </div>
                  </div>

                  {/* Send Prayer Button */}
                  <button
                    id="btn-submit-prayer"
                    type="submit"
                    disabled={isWorking}
                    className="w-full h-12 rounded-full bg-gold-500 hover:bg-gold-400 disabled:opacity-60 disabled:cursor-wait text-black font-black text-sm tracking-widest uppercase flex items-center justify-center gap-2 shadow-md hover:scale-[1.01] transition-all duration-300"
                  >
                    <Send className="w-4 h-4 stroke-[2.5]" />
                    {isWorking ? 'Sending…' : 'Send Prayer'}
                  </button>

                </form>
              </motion.div>
            ) : (
              <motion.div
                key="prayer-success-view"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="text-center py-12 space-y-8 flex flex-col items-center justify-center min-h-[480px]"
              >
                {/* Expanding Sacred Golden Pulse circles */}
                <div className="relative w-24 h-24 flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full border border-gold-500/35 animate-sacred-pulse" />
                  <div className="absolute inset-3 rounded-full border border-gold-500/20 animate-sacred-pulse [animation-delay:1.1s]" />
                  <div className="w-12 h-12 rounded-full bg-gold-500/10 border border-gold-500/30 flex items-center justify-center">
                    <HolyCrossIcon />
                  </div>
                </div>

                <div className="space-y-2">
                  <h2 className="text-lg font-black text-gold-500 uppercase tracking-widest font-mono">
                    Your prayer has been received
                  </h2>
                  <p className="text-xs text-text-secondary max-w-[260px] mx-auto leading-relaxed">
                    Our intercessors will lift you up in prayer. Stand firm in your faith.
                  </p>
                </div>

                <div className="flex flex-col gap-3 w-full max-w-[200px]">
                  <button
                    id="btn-submit-another"
                    onClick={resetForm}
                    className="text-gold-500 hover:text-gold-400 font-bold text-xs tracking-wider uppercase transition-colors"
                  >
                    Submit Another
                  </button>
                  <button
                    id="btn-back-home"
                    onClick={() => setActiveTab('history')}
                    className="px-6 h-10 rounded-full bg-gold-500 text-black font-black text-xs tracking-wider uppercase transition-all duration-300 hover:scale-105"
                  >
                    Back to History
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ======================================================================
          VIEW 2: MEMBER — SUBMISSION HISTORY ("My Prayers")
          ====================================================================== */}
      {activeTab === 'history' && (
        <div className="no-print relative z-10 max-w-md mx-auto space-y-4">
          <SectionTitle
            title="My Past Petitions"
            badge={{
              label: `${mySubmissions.length} Prayers`,
              variant: 'gold'
            }}
          />

          <p className="text-xs text-text-secondary leading-relaxed">
            Here is the sacred history of your requests placed upon the altar watch.
          </p>

          <motion.div
            variants={staggerChildren.container}
            initial="initial"
            animate="animate"
            className="space-y-4 pt-2"
          >
            {mySubmissions.length === 0 ? (
              <div className="py-16 text-center text-text-secondary text-xs italic space-y-2 bg-white/5 rounded-2xl border border-white/10">
                <Inbox className="w-8 h-8 text-text-secondary/30 mx-auto" />
                <p>You have not submitted any prayer petitions yet.</p>
                <button
                  id="btn-go-submit"
                  onClick={() => setActiveTab('submit')}
                  className="mt-3 px-4 py-1.5 bg-gold-500/10 text-gold-500 font-bold uppercase tracking-wider text-[10px] rounded-full hover:bg-gold-500/20"
                >
                  Place Petition Now
                </button>
              </div>
            ) : (
              mySubmissions.map((prayer) => {
                const isExpanded = expandedNoteId === prayer.localId;

                // Mapped Status Labels
                const uiStatus =
                  prayer.status === 'submitted' ? { label: 'New', variant: 'gold' as const } :
                  prayer.status === 'assigned' ? { label: 'Being Prayed For', variant: 'sage' as const } :
                  { label: 'Answered', variant: 'gold' as const, icon: <Check className="w-3 h-3 stroke-[3]" /> };

                return (
                  <motion.div key={prayer.localId} variants={staggerChildren.child}>
                  <GlassCard
                    id={`history-card-${prayer.localId}`}
                    pressable
                    onPress={() => { playHaptic(10); setExpandedNoteId(isExpanded ? null : prayer.localId); }}
                    className="p-4.5 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AccentBadge 
                          label={prayer.category} 
                          variant="muted" 
                          size="sm"
                          icon={CATEGORIES_MAP[prayer.category]?.icon}
                        />
                        <span className="text-[10px] text-text-secondary">
                          {new Date(prayer.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>

                      <AccentBadge 
                        label={uiStatus.label} 
                        variant={uiStatus.variant} 
                        size="sm"
                        icon={(uiStatus as any).icon}
                      />
                    </div>

                    <p className="text-sm text-text-primary leading-relaxed line-clamp-2">
                      "{prayer.content}"
                    </p>

                    {/* Assigned intercessor visibility */}
                    {prayer.status === 'assigned' && (
                      <div className="pt-2 flex items-center justify-between text-[11px] text-semantic-success border-t border-white/5 font-semibold">
                        <span className="flex items-center gap-1">
                          <User className="w-3.5 h-3.5" />
                          {prayer.isAnonymous ? 'Private Watch' : `Intercessor: ${prayer.assignedTo || 'Assigned Worker'}`}
                        </span>
                        <span className="text-text-secondary/50 font-medium">
                          {prayer.prayersOfferedCount || 0} prayers offered
                        </span>
                      </div>
                    )}

                    {prayer.status === 'answered' && (
                      <div className="pt-2 flex items-center gap-1.5 text-[11px] text-gold-500 border-t border-white/5 font-bold">
                        <Award className="w-3.5 h-3.5" />
                        Sealed Thanksgiving Testimony
                      </div>
                    )}

                    {/* Expanded view for details */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden pt-3 border-t border-white/5 space-y-3 text-xs"
                        >
                          <div className="text-text-primary font-medium leading-relaxed bg-black/10 p-3 rounded-xl border border-white/5">
                            "{prayer.content}"
                          </div>

                          {prayer.isAnonymous && (
                            <div className="flex items-center gap-1.5 text-[10px] text-text-secondary italic">
                              <Lock className="w-3.5 h-3.5 text-gold-500" />
                              Submitted anonymously. Your name is hidden from intercessors.
                            </div>
                          )}

                          {/* Notes/timeline */}
                          {(prayer as any).rhemaNotes && (prayer as any).rhemaNotes.length > 0 ? (
                            <div className="space-y-2">
                              <h4 className="text-[10px] font-black uppercase text-gold-500 tracking-wider">
                                Rhema Notes Timeline ({ (prayer as any).rhemaNotes.length })
                              </h4>
                              <div className="relative border-l border-gold-500/20 pl-3 ml-1.5 space-y-3">
                                {(prayer as any).rhemaNotes.map((note: any) => (
                                  <div key={note.id} className="relative space-y-0.5">
                                    <span className="absolute -left-[16px] top-1.5 w-1.5 h-1.5 rounded-full bg-gold-500" />
                                    <p className="text-[11px] text-text-primary font-medium">"{note.text}"</p>
                                    <span className="text-[9px] text-text-secondary block">{note.timestamp}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <p className="text-[10px] text-text-secondary italic">
                              No rhema notes recorded yet. Our watchmen are actively lifting this petition up.
                            </p>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </GlassCard>
                  </motion.div>
                );
              })
            )}
          </motion.div>
        </div>
      )}

      {/* ======================================================================
          VIEW 3: INTERCESSOR — THE PRAYER BANK
          ====================================================================== */}
      {activeTab === 'bank' && (
        <div className="no-print relative z-10 max-w-md mx-auto space-y-6">
          
          {/* Reverent Prayer Bank Header */}
          <div className="text-center pt-2 pb-1 space-y-2">
            <h1 className="text-2xl font-black text-gold-500 tracking-[0.2em] uppercase font-mono">
              Prayer Bank
            </h1>
            <div className="w-24 h-[1px] bg-gradient-to-r from-transparent via-gold-500 to-transparent mx-auto" />
            <p className="text-[11px] font-bold text-text-secondary uppercase tracking-widest flex items-center justify-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-gold-500 animate-pulse" />
              {myAssignments.length} active prayers assigned to you
            </p>
          </div>

          {/* Intercessor Tab strip */}
          <div className="flex border-b border-white/5 pb-px">
            {[
              { id: 'my', label: 'My Assignments' },
              ...(hasTriageAccess ? [{ id: 'all', label: 'All Prayers' }] : []),
              { id: 'reports', label: 'Reports' }
            ].map(tab => (
              <button
                key={tab.id}
                id={`bank-subtab-${tab.id}`}
                onClick={() => { playHaptic(); setIntercessorSubTab(tab.id as any); }}
                className="flex-1 py-2 text-center relative text-xs font-bold transition-all focus:outline-none"
              >
                <span className={intercessorSubTab === tab.id ? 'text-gold-500 font-extrabold' : 'text-text-secondary'}>
                  {tab.label}
                </span>
                {intercessorSubTab === tab.id && (
                  <motion.div
                    layoutId="activeBankSubtabIndicator"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-gold-500"
                  />
                )}
              </button>
            ))}
          </div>

          {/* Sub Tab: My Assignments */}
          {intercessorSubTab === 'my' && (
            <motion.div
              variants={staggerChildren.container}
              initial="initial"
              animate="animate"
              className="space-y-5"
            >
              {myAssignments.length === 0 ? (
                <div className="text-center py-16 space-y-4">
                  <AltarHandsIcon />
                  <div className="space-y-1">
                    <h3 className="text-sm font-black text-gold-500/80 uppercase tracking-widest font-mono">
                      No active assignments
                    </h3>
                    <p className="text-[10px] text-text-secondary max-w-[250px] mx-auto leading-relaxed">
                      Rest in peace — you will be notified when prayers need your watch.
                    </p>
                  </div>
                </div>
              ) : (
                myAssignments.map((prayer: any) => {
                  const isNotesExpanded = expandedNoteId === prayer.localId;
                  const isSealing = sealingId === prayer.localId;
                  const isCurrentScaled = scaledId === prayer.localId;

                  // Bottom border color based on urgency: low=gold/35, medium=cathedral, high=rose-500
                  const borderCol = 
                    prayer.urgency === 'high' ? 'border-b-red-500' :
                    prayer.urgency === 'medium' ? 'border-b-cathedral-500' :
                    'border-b-gold-500/40';

                  return (
                    <motion.div
                      key={prayer.localId}
                      variants={staggerChildren.child}
                      className={`rounded-2xl relative overflow-hidden transition-all shadow-xl border border-white/5 bg-[#0C0607]/75 backdrop-blur-md p-5 border-b-[3px] ${borderCol} ${
                        isSealing ? 'animate-seal-contract' : ''
                      }`}
                    >
                      {/* Card Header */}
                      <div className="flex items-center justify-between mb-3.5">
                        <AccentBadge 
                          label={prayer.category.toUpperCase()} 
                          variant="gold" 
                          size="sm"
                          icon={CATEGORIES_MAP[prayer.category]?.icon}
                        />

                        {prayer.isAnonymous ? (
                          <span className="text-[10px] font-bold text-gold-500 flex items-center gap-1">
                            <Lock className="w-3 h-3" />
                            Anonymous Member
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-text-secondary">
                            Submitted by: {prayer.memberName}
                          </span>
                        )}
                      </div>

                      {/* Prayer Content (Readable BODY typography) */}
                      <p className="text-sm text-text-primary leading-relaxed mb-4 italic pl-3 border-l-2 border-gold-500/25">
                        "{prayer.content}"
                      </p>

                      <div className="flex items-center justify-between text-[11px] text-text-secondary border-t border-white/5 pt-3 mb-4">
                        <span className="flex items-center gap-1 text-gold-500/80">
                          <Clock className="w-3.5 h-3.5 animate-pulse" />
                          Watch duration: {Math.floor((prayer.watchDuration || 0) / 60)}m { (prayer.watchDuration || 0) % 60 }s
                        </span>
                        <span className="font-medium text-text-secondary/60">
                          Assigned: {new Date(prayer.createdAt).toLocaleDateString()}
                        </span>
                      </div>

                      {/* SIGNATURE INTERACTION: PRAYER WATCH INCREMENT COUNTER */}
                      <div className="flex flex-col items-center justify-center py-4 space-y-1.5 bg-white/[0.02] border border-white/5 rounded-2xl mb-4 relative overflow-hidden">
                        
                        <motion.button
                          id={`btn-increment-${prayer.localId}`}
                          onClick={(e) => handleCounterIncrement(prayer.localId, e)}
                          animate={{ scale: isCurrentScaled ? 1.12 : 1 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                          className="relative w-16 h-16 rounded-full border-2 border-gold-500 flex items-center justify-center text-gold-500 bg-[#0C0607] shadow-lg hover:bg-gold-500/5 focus:outline-none"
                        >
                          {/* Ripple elements inside the button */}
                          <AnimatePresence>
                            {(rippleMap[prayer.localId] || []).map(r => (
                              <span 
                                key={r.id} 
                                className="absolute rounded-full bg-gold-500/35 pointer-events-none animate-ripple"
                                style={{ left: r.x - 10, top: r.y - 10, width: 20, height: 20 }}
                              />
                            ))}
                          </AnimatePresence>

                          {/* Vertical slide-up transition of numbers */}
                          <AnimatePresence mode="popLayout">
                            <motion.span
                              key={prayer.prayersOfferedCount}
                              initial={{ y: 15, opacity: 0 }}
                              animate={{ y: 0, opacity: 1 }}
                              exit={{ y: -15, opacity: 0 }}
                              transition={{ duration: 0.15 }}
                              className="text-lg font-black font-mono tracking-tight"
                            >
                              {prayer.prayersOfferedCount || 0}
                            </motion.span>
                          </AnimatePresence>
                        </motion.button>

                        <span className="text-[9px] font-black uppercase tracking-widest text-text-secondary/60">
                          prayers offered
                        </span>
                      </div>

                      {/* Notes Timeline Toggle & Trigger */}
                      <div className="space-y-3.5">
                        <div className="flex items-center justify-between">
                          <button
                            id={`btn-expand-notes-${prayer.localId}`}
                            onClick={() => { playHaptic(10); setExpandedNoteId(isNotesExpanded ? null : prayer.localId); }}
                            className="text-gold-500 hover:text-gold-400 font-bold text-[11px] uppercase tracking-wider flex items-center gap-1 cursor-pointer"
                          >
                            <Feather className="w-3.5 h-3.5" />
                            {isNotesExpanded ? 'Collapse notes' : `Add Note (${prayer.rhemaNotes?.length || 0})`}
                          </button>

                          <button
                            id={`btn-confirm-answered-${prayer.localId}`}
                            onClick={() => { playHaptic(15); setConfirmAnsweredRequest(prayer); }}
                            className="px-4 py-1.5 rounded-full bg-cathedral-700 hover:bg-cathedral-600 border border-cathedral-500/30 text-white font-black text-[10px] tracking-wider uppercase transition-colors"
                          >
                            Mark as Answered
                          </button>
                        </div>

                        {/* Expandable Notes Panel */}
                        <AnimatePresence>
                          {isNotesExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden space-y-3.5 border-t border-white/5 pt-3.5"
                            >
                              {/* inline note input */}
                              <div className="space-y-2">
                                <textarea
                                  id={`textarea-note-${prayer.localId}`}
                                  value={noteTextMap[prayer.localId] || ''}
                                  onChange={(e) => setNoteTextMap(prev => ({ ...prev, [prayer.localId]: e.target.value }))}
                                  placeholder="Write a rhema note or breakthrough felt during watch..."
                                  className="w-full h-18 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-600 resize-none placeholder-text-secondary/40 font-medium"
                                />
                                <div className="flex justify-end">
                                  <button
                                    id={`btn-save-note-${prayer.localId}`}
                                    onClick={() => handleAddRhemaNote(prayer.localId)}
                                    className="px-3.5 py-1 bg-gold-500 text-black font-black text-[10px] rounded-full uppercase tracking-wider"
                                  >
                                    Save Note
                                  </button>
                                </div>
                              </div>

                              {/* past notes timeline */}
                              {prayer.rhemaNotes && prayer.rhemaNotes.length > 0 && (
                                <div className="space-y-2.5">
                                  <h4 className="text-[9px] font-black uppercase text-gold-500/80 tracking-widest">
                                    Vigil Scroll Timeline
                                  </h4>
                                  <div className="relative border-l border-gold-500/25 pl-3 ml-1.5 space-y-3.5">
                                    {prayer.rhemaNotes.map((note: any) => (
                                      <div key={note.id} className="relative space-y-0.5 text-xs text-left">
                                        <span className="absolute -left-[16px] top-1.5 w-1.5 h-1.5 rounded-full bg-gold-500" />
                                        <p className="text-text-primary font-medium">"{note.text}"</p>
                                        <span className="text-[9px] text-text-secondary block font-semibold">{note.timestamp}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                    </motion.div>
                  );
                })
              )}
            </motion.div>
          )}

          {/* Sub Tab: All Active Watches (Pastor/Admin only) */}
          {intercessorSubTab === 'all' && (
            <div className="space-y-4">
              <SectionTitle
                title="All Active Watches"
                badge={{
                  label: `${allActiveWatches.length} Vigil watches`,
                  variant: 'muted'
                }}
              />

              <div className="space-y-3.5">
                {allActiveWatches.length === 0 ? (
                  <div className="py-12 text-center text-text-secondary text-xs italic bg-white/5 rounded-2xl border border-white/10">
                    No active watches currently.
                  </div>
                ) : (
                  allActiveWatches.map((prayer: any) => (
                    <GlassCard key={prayer.localId} className="p-4 space-y-2">
                      <div className="flex justify-between items-center text-[10px]">
                        <AccentBadge label={prayer.category} variant="gold" size="sm" />
                        <span className="font-semibold text-text-secondary">
                          Watchman: {prayer.assignedTo || 'Unassigned'}
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed text-text-primary line-clamp-2">
                        "{prayer.content}"
                      </p>
                      <div className="flex justify-between text-[10px] text-text-secondary pt-1">
                        <span>{prayer.prayersOfferedCount || 0} prayers offered</span>
                        <span>Watch: {Math.floor((prayer.watchDuration || 0) / 60)}m</span>
                      </div>
                    </GlassCard>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Sub Tab: Reports List & Creator */}
          {intercessorSubTab === 'reports' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-extrabold text-gold-500 font-mono uppercase tracking-wider">
                    Prayer Reports
                  </h3>
                  <p className="text-[10px] text-text-secondary">
                    View ministry impact audits & print summaries.
                  </p>
                </div>
                <button
                  id="btn-trigger-report-form"
                  onClick={() => { playHaptic(); setIsReportOpen(true); }}
                  className="px-4 py-2 bg-gold-500 text-black font-black text-xs rounded-full uppercase tracking-wider flex items-center gap-1.5 shadow-md"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                  Generate Report
                </button>
              </div>

              {/* Display Generated Report Result */}
              {generatedReport ? (
                <div id="printable-report-area" className="p-5 rounded-2xl border border-gold-500/25 bg-cathedral-900/35 space-y-6 text-left">
                  
                  {/* Ministry Header (Logo / Title) */}
                  <div className="flex items-center justify-between border-b border-gold-500/25 pb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-gold-500/10 flex items-center justify-center border border-gold-500/35">
                        <HolyCrossIcon className="text-gold-500" />
                      </div>
                      <div>
                        <h2 className="text-sm font-black tracking-widest uppercase text-gold-500 font-mono">
                          ChurchConnect
                        </h2>
                        <span className="text-[9px] font-bold text-text-secondary uppercase tracking-widest">
                          Intercessory Prayer Ministry
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] font-black uppercase text-gold-500 block">
                        Prayer Ministry Report
                      </span>
                      <span className="text-[9px] text-text-secondary font-medium">
                        Period: {generatedReport.range}
                      </span>
                    </div>
                  </div>

                  {/* Summary Dashboard Bento Grid */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3.5 rounded-xl bg-white/5 border border-white/5 text-center">
                      <span className="text-2xl font-black text-gold-500 font-mono block">
                        {generatedReport.total}
                      </span>
                      <span className="text-[9px] text-text-secondary font-black uppercase tracking-widest">
                        Total Requests
                      </span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-white/5 border border-white/5 text-center">
                      <span className="text-2xl font-black text-gold-500 font-mono block">
                        {generatedReport.answeredCount}
                      </span>
                      <span className="text-[9px] text-text-secondary font-black uppercase tracking-widest">
                        Answered ✓
                      </span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-white/5 border border-white/5 text-center">
                      <span className="text-2xl font-black text-gold-500 font-mono block">
                        {generatedReport.activeCount}
                      </span>
                      <span className="text-[9px] text-text-secondary font-black uppercase tracking-widest">
                        In Prayer Watch
                      </span>
                    </div>
                  </div>

                  {/* Custom CSS Styled Category breakdown chart */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-black uppercase tracking-widest text-gold-500 font-mono">
                      Category Breakdown Chart
                    </h3>
                    
                    <div className="p-4 bg-white/5 border border-white/5 rounded-xl space-y-3">
                      {Object.keys(generatedReport.categoryCounts).map(catKey => {
                        const count = generatedReport.categoryCounts[catKey];
                        const pct = generatedReport.total > 0 ? (count / generatedReport.total) * 100 : 0;
                        if (count === 0) return null;
                        return (
                          <div key={catKey} className="space-y-1">
                            <div className="flex justify-between text-[11px] font-bold">
                              <span className="text-text-primary">{catKey}</span>
                              <span className="text-gold-500 font-mono">{count} ({Math.round(pct)}%)</span>
                            </div>
                            <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                              <div 
                                className="h-full bg-gold-500 rounded-full" 
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Testimonies list section */}
                  {generatedReport.testimonies && generatedReport.testimonies.length > 0 && (
                    <div className="space-y-3.5">
                      <h3 className="text-xs font-black uppercase tracking-widest text-gold-500 font-mono">
                        Answered Prayer Testimonies
                      </h3>

                      <div className="space-y-3">
                        {generatedReport.testimonies.map((test: any, idx: number) => (
                          <div key={idx} className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 text-xs space-y-2">
                            <div className="flex items-center justify-between text-[10px] font-bold">
                              <span className="text-gold-500">{test.category} Testimony</span>
                              <span className="text-text-secondary">{test.submitterName} · {test.date}</span>
                            </div>
                            <p className="text-text-primary leading-relaxed italic">
                              "{test.content}"
                            </p>
                            <div className="p-2.5 rounded-lg bg-gold-500/5 text-gold-500/80 border border-gold-500/10">
                              <span className="font-black text-[9px] uppercase tracking-wider block mb-0.5">Vigil Note:</span>
                              "{test.notes}"
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Confidentially Notice Footer */}
                  <div className="border-t border-white/5 pt-4 text-center">
                    <p className="text-[10px] text-text-secondary italic">
                      Confidential Ministry Report. For Intercessors and clergy oversight review only. ✦ ChurchConnect Altar
                    </p>
                  </div>

                  {/* PDF Download and Printing Actions */}
                  <div className="no-print flex gap-3 pt-2">
                    <button
                      id="btn-print-report"
                      onClick={triggerPrintReport}
                      className="flex-1 h-10 rounded-full border border-gold-500/25 hover:bg-gold-500/10 text-gold-500 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5"
                    >
                      <Printer className="w-4 h-4" />
                      Print Report
                    </button>
                    <button
                      id="btn-download-pdf"
                      onClick={() => {
                        playHaptic();
                        alert("Select 'Save as PDF' from your system print options to download the report.");
                        window.print();
                      }}
                      className="flex-1 h-10 rounded-full bg-gold-500 text-black font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-md"
                    >
                      <Download className="w-4 h-4" />
                      Download PDF
                    </button>
                  </div>

                </div>
              ) : (
                <div className="py-16 text-center text-text-secondary text-xs italic bg-white/5 rounded-2xl border border-white/10 space-y-2">
                  <FileText className="w-8 h-8 text-text-secondary/35 mx-auto" />
                  <p>No reports generated yet for this ministry period.</p>
                  <p className="text-[10px] text-text-secondary/60">Generate a report above to aggregate active petitions, testimonies and categories stats.</p>
                </div>
              )}

            </div>
          )}

        </div>
      )}

      {/* ======================================================================
          VIEW 4: ADMIN — PRAYER MANAGEMENT TRIAGE
          ====================================================================== */}
      {activeTab === 'triage' && (
        <div className="no-print relative z-10 max-w-md mx-auto space-y-4">
          
          <SectionTitle
            title="Prayer Management"
            badge={{
              label: `${filteredTriageList.length} Requests`,
              variant: 'cathedral'
            }}
          />

          {/* Tab Strip with counts */}
          <div className="flex border-b border-white/5 pb-px overflow-x-auto scrollbar-none">
            {[
              { id: 'New', label: 'New', count: dbRequests?.filter(p => p.status === 'submitted').length || 0 },
              { id: 'Assigned', label: 'Assigned', count: dbRequests?.filter(p => p.status === 'assigned' && (p as any).prayersOfferedCount === 0).length || 0 },
              { id: 'In Prayer', label: 'In Prayer', count: dbRequests?.filter(p => p.status === 'assigned' && (p as any).prayersOfferedCount > 0).length || 0 },
              { id: 'Answered', label: 'Answered', count: dbRequests?.filter(p => p.status === 'answered').length || 0 },
              { id: 'Archived', label: 'Archived', count: dbRequests?.filter(p => p.status === 'sealed').length || 0 }
            ].map(tab => (
              <button
                key={tab.id}
                id={`triage-tab-${tab.id}`}
                onClick={() => { playHaptic(); setActiveTriageTab(tab.id as any); }}
                className="flex-shrink-0 px-4 py-2.5 text-center relative text-xs font-bold transition-all focus:outline-none"
              >
                <span className={activeTriageTab === tab.id ? 'text-gold-500 font-extrabold' : 'text-text-secondary'}>
                  {tab.label} ({tab.count})
                </span>
                {activeTriageTab === tab.id && (
                  <motion.div
                    layoutId="activeTriageTabIndicator"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-gold-500"
                  />
                )}
              </button>
            ))}
          </div>

          {/* List of Triage requests */}
          <div className="space-y-3.5 pt-2">
            {filteredTriageList.length === 0 ? (
              <div className="py-16 text-center text-text-secondary text-xs italic bg-white/5 rounded-2xl border border-white/10 space-y-2">
                <Inbox className="w-8 h-8 text-text-secondary/40 mx-auto" />
                <p>No prayers in {activeTriageTab} triage bucket.</p>
              </div>
            ) : (
              filteredTriageList.map((prayer: any) => {
                const isSelected = selectedRequestIds.includes(prayer.localId);
                const isExpanded = expandedNoteId === prayer.localId;

                // Urgency mapping
                const urgencyLabel = 
                  prayer.urgency === 'high' ? 'Critical' :
                  prayer.urgency === 'medium' ? 'Urgent' : 'Normal';

                const leftBorder = 
                  prayer.urgency === 'high' ? 'border-l-4 border-l-rose-500' :
                  prayer.urgency === 'medium' ? 'border-l-4 border-l-gold-500' : 'border-l-4 border-l-gold-500/40';

                return (
                  <GlassCard
                    key={prayer.localId}
                    id={`triage-card-${prayer.localId}`}
                    className={`p-4.5 space-y-3 transition-all relative ${leftBorder} ${
                      isSelected ? 'ring-2 ring-gold-500 border-transparent bg-gold-500/5' : ''
                    }`}
                  >
                    
                    {/* Header Row */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        {/* Checkbox for multi-select */}
                        <button
                          id={`select-check-${prayer.localId}`}
                          onClick={(e) => { e.stopPropagation(); toggleSelectRequest(prayer.localId); }}
                          className="text-gold-500 mr-1 cursor-pointer"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-5.5 h-5.5 stroke-[2.5]" />
                          ) : (
                            <Square className="w-5.5 h-5.5 text-text-secondary/40" />
                          )}
                        </button>

                        <AccentBadge 
                          label={prayer.category.toUpperCase()} 
                          variant="muted" 
                          size="sm"
                          icon={CATEGORIES_MAP[prayer.category]?.icon}
                        />

                        {prayer.isAnonymous && (
                          <AccentBadge 
                            label="Anonymous" 
                            variant="cathedral" 
                            size="sm" 
                            icon={<Lock className="w-3 h-3" />}
                          />
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] uppercase font-black tracking-wider text-text-secondary">Urgency:</span>
                        <span className={`text-[10px] font-black uppercase ${
                          prayer.urgency === 'high' ? 'text-rose-400' :
                          prayer.urgency === 'medium' ? 'text-gold-400' : 'text-text-secondary'
                        }`}>
                          {urgencyLabel}
                        </span>
                      </div>
                    </div>

                    {/* Content snippet */}
                    <p 
                      onClick={() => setExpandedNoteId(isExpanded ? null : prayer.localId)}
                      className="text-sm text-text-primary leading-relaxed cursor-pointer"
                    >
                      "{isExpanded ? prayer.content : (prayer.content.substring(0, 100) + (prayer.content.length > 100 ? '...' : ''))}"
                    </p>

                    {/* Submitter Info */}
                    <div className="flex items-center justify-between text-xs text-text-secondary pt-2 border-t border-white/5">
                      <div className="flex items-center gap-2">
                        <div className="w-5.5 h-5.5 rounded-full bg-gold-500/10 flex items-center justify-center font-bold text-[10px] text-gold-500 border border-gold-500/15">
                          {prayer.submitterAvatar || '??'}
                        </div>
                        <span className="font-semibold text-text-primary">
                          {prayer.isAnonymous ? 'Anonymous' : prayer.memberName}
                        </span>
                        <span>· {new Date(prayer.createdAt).toLocaleDateString()}</span>
                      </div>

                      {prayer.assignedTo && (
                        <span className="text-[10px] font-bold text-semantic-success bg-semantic-success/10 border border-semantic-success/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {prayer.assignedTo}
                        </span>
                      )}
                    </div>

                    {/* Actions Menu */}
                    <div className="pt-3 border-t border-white/5 flex items-center justify-between">
                      <div className="flex gap-2">
                        <button
                          id={`btn-triage-assign-${prayer.localId}`}
                          onClick={() => openAssignSheet(prayer)}
                          className="px-3 py-1 rounded-full border border-gold-500 text-gold-500 font-black text-[10px] tracking-wider uppercase hover:bg-gold-500/10"
                        >
                          {prayer.status === 'assigned' ? 'Reassign' : 'Assign Watch'}
                        </button>

                        {/* Set Urgency Dropdown */}
                        <div className="relative group">
                          <button
                            id={`btn-triage-classify-${prayer.localId}`}
                            onClick={() => {
                              playHaptic();
                              const nextUrgency = 
                                prayer.urgency === 'low' ? 'Urgent' :
                                prayer.urgency === 'medium' ? 'Critical' : 'Normal';
                              handleSetUrgency(prayer.localId, nextUrgency);
                            }}
                            className="px-3 py-1 rounded-full border border-white/10 text-text-secondary hover:text-text-primary font-bold text-[10px] tracking-wider uppercase flex items-center gap-1"
                          >
                            Classify
                            <ChevronDown className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      <button
                        id={`btn-triage-archive-${prayer.localId}`}
                        onClick={() => handleArchiveRequest(prayer.localId)}
                        className="text-[10px] font-black uppercase text-text-secondary/70 hover:text-rose-400 tracking-widest"
                      >
                        Archive
                      </button>
                    </div>

                  </GlassCard>
                );
              })
            )}
          </div>

          {/* Bulk Action Controls Bar (At bottom of page when items are selected) */}
          <AnimatePresence>
            {selectedRequestIds.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 50 }}
                className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-black/90 backdrop-blur-md border border-gold-500/25 p-4 rounded-2xl shadow-2xl flex flex-col gap-3 z-50 w-full max-w-[340px]"
              >
                <div className="flex justify-between items-center text-xs font-bold text-text-primary px-1">
                  <span>Selected {selectedRequestIds.length} Petitions</span>
                  <button
                    id="btn-clear-selection"
                    onClick={() => setSelectedRequestIds([])}
                    className="text-[10px] uppercase font-bold text-text-secondary hover:text-text-primary"
                  >
                    Clear
                  </button>
                </div>

                <div className="flex gap-2 text-xs uppercase font-black tracking-wider">
                  <button
                    id="btn-bulk-assign"
                    onClick={() => { playHaptic(); setAssignTargetRequest(null); }}
                    className="flex-1 py-2.5 rounded-xl bg-gold-500 text-black text-center"
                  >
                    Bulk Assign
                  </button>
                  <button
                    id="btn-bulk-archive"
                    onClick={handleBulkArchive}
                    className="flex-1 py-2.5 rounded-xl bg-cathedral-700 hover:bg-cathedral-600 text-white text-center border border-cathedral-500/20"
                  >
                    Bulk Archive
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      )}

      {/* ======================================================================
          BOTTOM SHEET: PRAYER REPORT CREATOR
          ====================================================================== */}
      <BottomSheet
        isOpen={isReportOpen}
        onClose={() => { playHaptic(); setIsReportOpen(false); }}
        title="Generate Prayer Report"
      >
        <div className="space-y-4 pb-8 text-left text-text-primary">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-text-secondary">
              Date Range From
            </label>
            <input
              id="report-from-date"
              type="date"
              value={reportStartDate}
              onChange={(e) => setReportStartDate(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs text-text-primary font-bold focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-text-secondary">
              Date Range To
            </label>
            <input
              id="report-to-date"
              type="date"
              value={reportEndDate}
              onChange={(e) => setReportEndDate(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs text-text-primary font-bold focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-text-secondary">
              Filter by Category
            </label>
            <select
              id="report-category-select"
              value={reportFilterCategory}
              onChange={(e) => setReportFilterCategory(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs text-text-primary font-bold focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500"
            >
              <option value="All" className="bg-surface-100 dark:bg-surface-0">All Categories</option>
              {Object.keys(CATEGORIES_MAP).map(catKey => (
                <option key={catKey} value={catKey} className="bg-surface-100 dark:bg-surface-0">
                  {catKey}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-text-secondary">
              Filter by Status
            </label>
            <select
              id="report-status-select"
              value={reportFilterStatus}
              onChange={(e) => setReportFilterStatus(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs text-text-primary font-bold focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500"
            >
              <option value="All" className="bg-surface-100 dark:bg-surface-0">All Statuses</option>
              <option value="New" className="bg-surface-100 dark:bg-surface-0">New / Unassigned</option>
              <option value="Being Prayed For" className="bg-surface-100 dark:bg-surface-0">Being Prayed For</option>
              <option value="Answered" className="bg-surface-100 dark:bg-surface-0">Answered Testimony</option>
            </select>
          </div>

          <button
            id="btn-generate-report"
            onClick={generateReportData}
            className="w-full h-11 bg-gold-500 text-black font-black text-xs uppercase tracking-widest rounded-full shadow-md mt-4 flex items-center justify-center gap-1.5"
          >
            <FileText className="w-4 h-4" />
            Generate Report
          </button>
        </div>
      </BottomSheet>

      {/* ======================================================================
          BOTTOM SHEET: CONFIRM SEAL TESTIMONY DIALOG
          ====================================================================== */}
      <BottomSheet
        isOpen={confirmAnsweredRequest !== null}
        onClose={() => { playHaptic(); setConfirmAnsweredRequest(null); }}
        title="Seal Thanksgiving Testimony"
      >
        <div className="space-y-5 pb-8 text-center text-text-primary">
          <div className="w-12 h-12 rounded-full bg-gold-500/10 flex items-center justify-center text-gold-500 mx-auto">
            <Award className="w-6 h-6 fill-gold-500/10" />
          </div>

          <div className="space-y-2">
            <h3 className="text-base font-extrabold text-text-primary">Seal this petition with thanksgiving?</h3>
            <p className="text-xs text-text-secondary max-w-[280px] mx-auto leading-relaxed">
              This will officially seal the prayer vigil watch as an answered testimony, celebrating God's grace with the submitter.
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              id="btn-execute-answered-seal"
              onClick={() => handleMarkAsAnswered(confirmAnsweredRequest)}
              className="flex-1 h-11 rounded-full bg-gold-500 hover:bg-gold-400 text-[#0C0607] font-black text-xs uppercase tracking-wider shadow-md"
            >
              Confirm & Seal ✦
            </button>
            <button
              id="btn-cancel-answered-seal"
              onClick={() => { playHaptic(); setConfirmAnsweredRequest(null); }}
              className="flex-1 h-11 rounded-full bg-surface-200 hover:bg-surface-300 text-text-primary font-bold text-xs uppercase tracking-wider"
            >
              Cancel
            </button>
          </div>
        </div>
      </BottomSheet>

      {/* ======================================================================
          BOTTOM SHEET: SELECT INTERCESSORS SHEET
          ====================================================================== */}
      <BottomSheet
        isOpen={assignTargetRequest !== null || selectedRequestIds.length > 0}
        onClose={() => { playHaptic(); setAssignTargetRequest(null); setSelectedIntercessorIds([]); }}
        title="Assign Altar Intercessors"
      >
        <div className="space-y-4 pb-8 text-left text-text-primary">

          <div className="flex items-center justify-between border-b border-white/5 pb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-text-secondary">
              Tap to select one or more intercessors
            </span>

            {/* Department Filter Selector */}
            <select
              id="intercessor-dept-filter"
              value={intercessorDeptFilter}
              onChange={(e) => setIntercessorDeptFilter(e.target.value)}
              className="bg-transparent text-[11px] font-bold text-gold-500 outline-none"
            >
              <option value="Intercessory" className="bg-surface-100 dark:bg-surface-0 text-text-primary">Intercessory Ministry</option>
              <option value="Pastoral" className="bg-surface-100 dark:bg-surface-0 text-text-primary">Pastoral Staff</option>
              <option value="All" className="bg-surface-100 dark:bg-surface-0 text-text-primary">All Members</option>
            </select>
          </div>

          {/* List of candidates */}
          <div className="space-y-1 max-h-[300px] overflow-y-auto pr-1">
            {dbMembers?.filter(member => {
              if (!member.userId) return false;
              if (intercessorDeptFilter === 'All') return true;
              if (intercessorDeptFilter === 'Intercessory') {
                // Return cell leaders, pastors, or specific intercessor roles
                return member.role === 'cell_leader' || member.role === 'district_pastor' || member.role === 'lead_pastor';
              }
              if (intercessorDeptFilter === 'Pastoral') {
                return member.role === 'district_pastor' || member.role === 'lead_pastor';
              }
              return true;
            }).map((intercessor) => {
              const intercessorUserId = intercessor.userId!;
              // Calculate active watch count
              const assignmentCount = dbAssignments.filter((assignment) => assignment.status === 'active' && assignment.intercessorId === intercessorUserId).length;
              const availabilityLabel = assignmentCount >= 4 ? 'Busy watchman' : 'Ready Watchman';

              const alreadyAssigned = !!assignTargetRequest && dbAssignments?.some(
                a => a.requestId === assignTargetRequest.localId && a.intercessorId === intercessorUserId
              );
              const isChecked = alreadyAssigned || selectedIntercessorIds.includes(intercessorUserId);

              return (
                <ContentRow
                  key={intercessor.localId}
                  title={intercessor.fullName}
                  subtitle={alreadyAssigned ? 'Already watching this request' : `${assignmentCount} Active watches · ${availabilityLabel}`}
                  onPress={alreadyAssigned ? undefined : () => toggleIntercessorSelection(intercessorUserId)}
                  action={
                    <motion.button
                      id={`btn-select-intercessor-${intercessor.localId}`}
                      whileTap={alreadyAssigned ? undefined : { scale: 0.9 }}
                      disabled={alreadyAssigned}
                      onClick={() => toggleIntercessorSelection(intercessorUserId)}
                      className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-colors ${
                        isChecked
                          ? 'bg-gold-500 border-gold-500 text-black'
                          : 'bg-transparent border-white/15 text-transparent hover:border-gold-500/50'
                      } ${alreadyAssigned ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <Check className="w-4 h-4 stroke-[3]" />
                    </motion.button>
                  }
                />
              );
            })}
          </div>

          <div className="p-3 bg-white/5 border border-white/5 rounded-2xl flex items-center gap-2.5">
            <ShieldAlert className="w-4 h-4 text-gold-500 flex-shrink-0" />
            <p className="text-[10px] text-text-secondary leading-relaxed">
              Assigned watchmen receive instant real-time notification alerts with sacred credentials.
            </p>
          </div>

          <motion.button
            id="btn-confirm-assignment"
            whileTap={selectedIntercessorIds.length > 0 ? { scale: 0.97 } : undefined}
            disabled={selectedIntercessorIds.length === 0 || isWorking}
            onClick={handleExecuteAssignment}
            className="w-full py-3 rounded-pill bg-gold-500 disabled:bg-white/10 text-black disabled:text-text-muted font-extrabold text-sm uppercase tracking-wider transition-colors disabled:cursor-not-allowed"
          >
            {isWorking ? 'Assigning…' : selectedIntercessorIds.length > 0
              ? `Assign to ${selectedIntercessorIds.length} Intercessor${selectedIntercessorIds.length > 1 ? 's' : ''}`
              : 'Select Intercessors to Assign'}
          </motion.button>
        </div>
      </BottomSheet>

      {/* Floating dynamic toast alert notifications */}
      <AnimatePresence>
        {toastText && (
          <motion.div
            initial={{ opacity: 0, y: 30, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 30, x: '-50%' }}
            className="fixed bottom-24 left-1/2 bg-[#1E0710]/95 backdrop-blur-md border border-gold-500/20 px-5 py-3 rounded-full shadow-2xl flex items-center gap-2 z-100 w-max max-w-[320px]"
          >
            <Sparkles className="w-4 h-4 text-gold-500 animate-pulse" />
            <span className="text-xs font-bold text-gold-400">{toastText}</span>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
