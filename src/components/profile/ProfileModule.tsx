import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { QRCodeSVG } from 'qrcode.react';
import { db } from '../../lib/db/churchConnectDB';
import { useCurrentUser } from '../../lib/db/hooks';
import { useAuth } from '../../lib/db/PocketBaseProvider';
import { useGovernanceData, type FeedbackStatus, type FeedbackType } from '../../lib/db/governanceData';
import { usePocketBaseMembers } from '../../lib/db/pocketbaseHooks';
import { useOperationalSync } from '../../lib/db/syncData';
import { useProfilePreferences } from '../../lib/db/profilePreferencesData';
import { useTheme } from '../../lib/theme/ThemeProvider';
import * as Typography from '../../lib/theme/typography';
import { 
  GlassCard, 
  AccentBadge, 
  BottomSheet,
  SettingsRow,
  SectionTitle
} from '../shared';
import { useToast } from '../shared/toast/useToast';
import { MemberManagement } from './MemberManagement';
import { 
  Settings, 
  QrCode, 
  User, 
  Mail, 
  Phone, 
  Shield, 
  Database, 
  HelpCircle, 
  Info, 
  Moon, 
  Bell, 
  X, 
  ChevronRight, 
  Check, 
  Sparkles,
  CheckCircle,
  FileText,
  Smartphone,
  LogOut,
  Compass,
  GraduationCap,
  Activity,
  MessageSquareText,
  RefreshCw,
  Send
} from 'lucide-react';

interface ProfileData {
  name: string;
  email: string;
  phone: string;
  cellGroup: string;
  section: string;
  departments: string[];
  memberSince: string;
  idNumber: string;
  avatarText: string;
}

interface ProfileModuleProps {
  currentRole?: any;
  setActiveTab?: (tab: string) => void;
}

export function ProfileModule({ currentRole: passedRole, setActiveTab }: ProfileModuleProps) {
  const { theme, toggleTheme, isDark } = useTheme();
  const toast = useToast();
  const { logout, pb, user: authUser } = useAuth();
  const governance = useGovernanceData();
  const { members: registryMembers, updateMember } = usePocketBaseMembers();
  const { pendingCount: pendingSyncCount, failedCount: failedSyncCount } = useOperationalSync();
  const profilePreferences = useProfilePreferences();
  
  // Get active system user & role
  const { role: userRole } = useCurrentUser();
  const currentRole = passedRole || userRole;

  // Manage view segments for Admin/Pastor: 'profile' | 'cms'
  const [activeSubTab, setActiveSubTab] = useState<'profile' | 'cms'>('profile');

  // Local state for profile details (synchronized from IndexedDB)
  const [profile, setProfile] = useState<ProfileData>({
    name: '',
    email: '',
    phone: '',
    cellGroup: 'Not assigned',
    section: 'District North',
    departments: [],
    memberSince: 'January 2024',
    idNumber: 'Not linked',
    avatarText: ''
  });

  // Modal & sheet controls
  const [showQRFullscreen, setShowQRFullscreen] = useState(false);
  const [showEditSheet, setShowEditSheet] = useState(false);
  const [showSignOutSheet, setShowSignOutSheet] = useState(false);
  const [showGovernanceSheet, setShowGovernanceSheet] = useState(false);
  const [governanceTab, setGovernanceTab] = useState<'feedback' | 'activity'>('feedback');
  const [feedbackType, setFeedbackType] = useState<FeedbackType>('support');
  const [feedbackContent, setFeedbackContent] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [reviewResponses, setReviewResponses] = useState<Record<string, string>>({});
  const [reviewingFeedbackId, setReviewingFeedbackId] = useState<string | null>(null);

  const privacyOn = profilePreferences.directoryVisibility === 'private';

  // Temp edit form states
  const [tempName, setTempName] = useState('');
  const [tempEmail, setTempEmail] = useState('');
  const [tempPhone, setTempPhone] = useState('');

  const currentUserId = authUser?.id;
  const memberRecord = registryMembers.find((member) => member.userId === currentUserId);

  // Keep profile identity aligned with the linked, server-confirmed registry record.
  useEffect(() => {
    if (memberRecord) {
      setProfile({
        name: memberRecord.fullName,
        email: memberRecord.email,
        phone: memberRecord.phone,
        cellGroup: memberRecord.cellGroupName || 'Not assigned',
        section: memberRecord.sectionName || 'Not assigned',
        departments: memberRecord.departments || [],
        memberSince: new Date(memberRecord.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
        idNumber: memberRecord.qrCode,
        avatarText: memberRecord.avatarText || 'M'
      });
    } else if (authUser) {
      setProfile((current) => ({
        ...current,
        name: authUser.name,
        email: authUser.email,
        phone: '',
        cellGroup: 'Not linked',
        section: 'Not linked',
        departments: authUser.department ? [authUser.department] : [],
        memberSince: 'Not linked',
        idNumber: 'Not linked',
        avatarText: authUser.avatarText
      }));
    }
  }, [authUser, memberRecord]);

  // 2. Query enrolled courses & progress dynamically
  const enrolledCourses = useLiveQuery(async () => {
    if (!memberRecord?.localId) return [];
    
    // Find all course enrollments for this member
    const userEnrollments = await db.trainingEnrollments
      .where('memberId')
      .equals(memberRecord.localId)
      .toArray();

    if (userEnrollments.length === 0) return [];

    const trainingIds = userEnrollments.map(e => e.trainingId);
    const courses = await db.trainings
      .filter(t => trainingIds.includes(t.localId))
      .toArray();

    // Derive progress from confirmed completed sessions and attendance.
    const sessions = await db.trainingSessions.toArray();
    const attendance = await db.trainingAttendance.where('memberId').equals(memberRecord.localId).toArray();
    return courses.map(course => {
      const enrollment = userEnrollments.find((item) => item.trainingId === course.localId);
      const occurredSessionIds = sessions
        .filter((session) => session.trainingId === course.localId && session.status === 'completed')
        .map((session) => session.localId);
      const attendedCount = new Set(attendance
        .filter((item) => occurredSessionIds.includes(item.sessionId))
        .map((item) => item.sessionId)).size;
      const progress = enrollment?.status === 'completed'
        ? 100
        : occurredSessionIds.length ? Math.round((attendedCount / occurredSessionIds.length) * 100) : 0;
      return {
        ...course,
        progress
      };
    });
  }, [memberRecord?.localId]) || [];

  // Open edit sheet
  const handleOpenEdit = () => {
    setTempName(profile.name);
    setTempEmail(profile.email);
    setTempPhone(profile.phone);
    setShowEditSheet(true);
  };

  // Save the permitted self-service fields to PocketBase.
  const handleSaveProfile = async () => {
    if (!authUser || !memberRecord) {
      toast.error('Ask an administrator to link your login to a member registry profile first.');
      return;
    }
    if (!tempName.trim() || !tempPhone.trim()) {
      toast.error('Name and phone number are required.');
      return;
    }

    const avatarText = tempName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
    try {
      await updateMember(memberRecord.remoteId, {
        fullName: tempName.trim(),
        phone: tempPhone.trim()
      });
      const updatedUser = await pb.collection('users').update(authUser.id, {
        name: tempName.trim(),
        avatarText
      });
      pb.authStore.save(pb.authStore.token, updatedUser);
      toast.success('Your profile details have been saved.');
      setShowEditSheet(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Your profile could not be updated.');
    }
  };

  // Avatar Ring class resolver
  const getAvatarRingClass = () => {
    const r = currentRole?.id?.toLowerCase();
    if (r === 'lead_pastor' || r === 'administrator' || r === 'admin') {
      return 'border-[3px] border-gold-500 shadow-glow-gold';
    } else if (r === 'cell_leader' || r === 'department_head' || r === 'worker') {
      return 'border-[3px] border-cathedral-500 shadow-glow-cathedral';
    }
    return 'border border-white/10';
  };

  // PWA Install Prompt simulation
  const handleInstallApp = () => {
    toast.success('PWA Install Triggered: Choose Add to Home Screen in your browser!');
  };

  const handlePrivacyToggle = async () => {
    const nextVisibility = privacyOn ? 'listed' : 'private';
    try {
      await profilePreferences.setDirectoryVisibility(nextVisibility);
      toast.success(nextVisibility === 'private'
        ? 'Your profile was removed from the Saints Directory.'
        : 'Your profile is now listed in the Saints Directory.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Your directory visibility could not be changed.');
    }
  };

  const handleSubmitFeedback = async () => {
    setIsSubmittingFeedback(true);
    try {
      await governance.submitFeedback(feedbackType, feedbackContent);
      setFeedbackContent('');
      toast.success('Your request was sent securely.');
    } catch (error) {
      toast.error(governance.messageFor(error));
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  const handleReviewFeedback = async (feedbackId: string, status: Exclude<FeedbackStatus, 'new'>) => {
    setReviewingFeedbackId(feedbackId);
    try {
      await governance.reviewFeedback(feedbackId, status, reviewResponses[feedbackId] || '');
      toast.success(status === 'resolved' ? 'Request resolved.' : 'Request moved to review.');
    } catch (error) {
      toast.error(governance.messageFor(error));
    } finally {
      setReviewingFeedbackId(null);
    }
  };

  const formatGovernanceTime = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  const isWorkerRole = ['cell_leader', 'department_head', 'worker'].includes(currentRole?.id?.toLowerCase());
  const isAdminOrPastor = currentRole?.id === 'administrator' || currentRole?.id === 'lead_pastor';

  return (
    <div className="space-y-6 pb-24 text-text-primary">
      
      {/* --------------------------------------
          ADMIN ONLY SWITCHER (Profile vs CMS)
         -------------------------------------- */}
      {isAdminOrPastor && (
        <div className="flex p-1 rounded-pill bg-surface-100 border border-white/5">
          <button
            onClick={() => { if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(5); setActiveSubTab('profile'); }}
            className={`flex-1 py-2 rounded-pill text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              activeSubTab === 'profile' 
                ? 'bg-gold-500 text-black shadow-glow-gold font-black' 
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            My Profile
          </button>
          <button
            onClick={() => { if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(5); setActiveSubTab('cms'); }}
            className={`flex-1 py-2 rounded-pill text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              activeSubTab === 'cms' 
                ? 'bg-gold-500 text-black shadow-glow-gold font-black' 
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Registry CMS
          </button>
        </div>
      )}

      {/* RENDER SYSTEM MODULES DEPENDING ON SUBTAB */}
      {isAdminOrPastor && activeSubTab === 'cms' ? (
        <MemberManagement />
      ) : (
        <>
          {/* ======================================================================
              SECTION 1: Identity Card
              ====================================================================== */}
          <div className="relative rounded-card-lg overflow-hidden border border-white/5 p-6 flex flex-col items-center justify-center text-center shadow-glow-cathedral bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-cathedral-950 via-surface-0 to-surface-0 dark:from-cathedral-950 dark:via-surface-0 dark:to-surface-0 light:from-gold-100/30 light:via-white light:to-white">
            
            {/* Top Right Action: Edit badge */}
            {memberRecord && (
              <div className="absolute top-4 right-4">
                <button onClick={handleOpenEdit} className="cursor-pointer">
                  <AccentBadge label="Edit" variant="outline" size="md" />
                </button>
              </div>
            )}

            {/* Avatar Circle with Dynamic Borders */}
            <div className="relative mt-2">
              <div className={`w-24 h-24 rounded-full overflow-hidden flex items-center justify-center bg-gradient-to-tr from-cathedral-800 via-cathedral-900 to-gold-500 shadow-lg text-white font-extrabold text-2xl tracking-wider select-none ${getAvatarRingClass()}`}>
                {profile.avatarText}
              </div>
            </div>

            {/* User Info Details */}
            <div className="mt-4 space-y-1">
              <h2 className={`${Typography.DISPLAY} font-extrabold text-text-primary`}>
                {profile.name}
              </h2>
              <p className={`${Typography.BODY} text-text-secondary font-medium`}>
                {profile.phone} · {profile.email}
              </p>
            </div>

            {/* Role Badge */}
            <div className="mt-3.5">
              <AccentBadge 
                label={currentRole?.label ? currentRole.label.toUpperCase() : 'MEMBER'} 
                variant={isAdminOrPastor ? 'gold' : 'muted'} 
                size="md" 
              />
            </div>

            {/* Department Badges (if worker/clergy) */}
            {profile.departments.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-1.5 mt-3 max-w-xs">
                {profile.departments.map((dept) => (
                  <span key={dept} className="text-[10px] font-bold text-teal-400 bg-teal-500/10 border border-teal-500/15 px-2.5 py-1 rounded-full uppercase tracking-wider">
                    {dept}
                  </span>
                ))}
              </div>
            )}

          </div>

          {/* ======================================================================
              SECTION 2: My QR Code Fellowship Pass
              ====================================================================== */}
          {memberRecord ? <GlassCard variant="elevated" className="relative p-6 text-center space-y-4 overflow-hidden border border-gold-500/10">
            
            {/* Subtle Decorative Frame */}
            <div className="absolute inset-2 border border-gold-500/15 rounded-[18px] pointer-events-none" />

            <div className="space-y-1 relative z-10">
              <span className={`${Typography.OVERLINE} text-gold-500 text-center block font-black`}>
                Fellowship Pass
              </span>
            </div>

            {/* Scalable SVG QR Code (Always black on white) */}
            <div 
              onClick={() => setShowQRFullscreen(true)}
              className="w-[180px] h-[180px] bg-white rounded-2xl mx-auto flex items-center justify-center p-3 shadow-md cursor-pointer hover:scale-[1.03] transition-transform relative group"
            >
              <QRCodeSVG value={profile.idNumber} size={156} level="M" bgColor="#ffffff" fgColor="#000000" />
              <svg className="hidden" viewBox="0 0 29 29" fill="currentColor" aria-hidden="true">
                <path d="M0 0h7v7H0zm1 1v5h5V1zm1 1h3v3H2zm20-2h7v7h-7zm1 1v5h5V1zm1 1h3v3h-3zM0 22h7v7H0zm1 1v5h5v-5zm1 1h3v3H2z" />
                <path d="M9 0h1v1H9zm2 0h2v1h-2zm3 0h1v2h-1zm2 0h1v1h-1zm1 0h1v2h-1zm1 0h1v1h-1zm-6 2h1v1H9zm2 0h1v1h-1zm4 0h1v1h-1zm1 0h1v1h-1zm-6 2h1v1h-1zm3 0h1v1h-1zm2 0h2v1h-2zm-5 2h2v1H9zm3 0h1v1h-1zm2 0h1v2h-1zm2 0h1v1h-1zm1 0h1v1h-1zm-7 2h1v1H9zm2 0h2v1h-2zm4 0h1v1h-1zm1 0h1v1h-1zm2 0h1v1h-1zm1 0h1v1h-1zm-10 2h1v1H8zm3 0h1v1h-1zm3 0h1v1h-1zm2 0h1v1h-1zm1 0h1v1h-1zm-8 2h2v1H9zm3 0h1v1h-1zm3 0h1v1h-1zm1 0h2v1h-2zm1 0h1v1h-1zm-8 2h1v1H9zm2 0h1v1h-1zm2 0h2v1h-2zm3 0h1v1h-1zm-6 2h2v1H9zm3 0h1v1h-1zm2 0h1v1h-1zm2 0h1v1h-1z" />
                <path d="M14 14h1v1h-1zm1 1h1v1h-1zm-2 1h1v1h-1zm3 0h1v1h-1zm-2 1h1v1h-1zm3 0h1v1h-1zm-4 2h1v1h-1zm2 0h1v1h-1zm2 0h1v1h-1zm-3 1h1v1h-1zm2 0h1v1h-1zm-4 2h1v1h-1zm2 0h2v1h-2zm3 0h1v1h-1zm1 0h1v1h-1zm-6 2h1v1H9zm3 0h1v1h-1zm2 0h1v1h-1zm2 0h1v1h-1zm1 0h1v1h-1z" />
                <path d="M22 9h1v1h-1zm2 0h1v2h-1zm2 0h1v1h-1zm-3 2h1v1h-1zm2 0h1v1h-1zm-3 2h2v1h-2zm3 0h1v1h-1zm-4 2h1v1h-1zm2 0h1v1h-1zm2 0h1v1h-1zm-3 1h1v1h-1zm2 0h1v1h-1zm-4 2h1v1h-1zm2 0h2v1h-2zm3 0h1v1h-1zm1 0h1v1h-1zm-6 2h1v1H9zm3 0h1v1h-1zm2 0h1v1h-1zm2 0h1v1h-1zm1 0h1v1h-1z" />
              </svg>

              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold rounded-2xl">
                Tap to Enlarge
              </div>
            </div>

            <div className="space-y-1 relative z-10">
              <h4 className={`${Typography.SUBTITLE} text-text-primary font-bold`}>
                {profile.name}
              </h4>
              <p className={`${Typography.CAPTION} text-text-muted font-mono tracking-wider`}>
                ID: {profile.idNumber}
              </p>
              <p className={`${Typography.CAPTION} text-text-muted italic opacity-70`}>
                Show at training check-in
              </p>
            </div>

          </GlassCard> : (
            <GlassCard className="p-5 text-center space-y-2">
              <QrCode className="w-8 h-8 mx-auto text-text-muted opacity-50" />
              <h4 className="text-sm font-bold text-text-primary">Fellowship pass unavailable</h4>
              <p className="text-xs text-text-muted">Ask an administrator to link this login to your member registry profile.</p>
            </GlassCard>
          )}

          {/* ======================================================================
              SECTION 3: Ministry Info (Form-style List)
              ====================================================================== */}
          <GlassCard className="p-4 space-y-3">
            
            <div className="flex items-center justify-between mb-1">
              <span className={`${Typography.OVERLINE} text-text-muted font-bold`}>
                Church Details
              </span>
            </div>

            <div className="divide-y divide-white/[0.03] dark:divide-white/[0.03] light:divide-black/[0.03] text-left">
              
              {/* Cell Group Row */}
              <div className="py-2.5 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className={`${Typography.CAPTION} text-text-muted uppercase tracking-wider`}>Cell Group</span>
                  <span className={`${Typography.BODY} text-text-primary font-bold mt-0.5`}>
                    {profile.cellGroup}
                  </span>
                </div>
              </div>

              {/* Section Row */}
              <div className="py-2.5 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className={`${Typography.CAPTION} text-text-muted uppercase tracking-wider`}>Section</span>
                  <span className={`${Typography.BODY} text-text-primary font-bold mt-0.5`}>
                    {profile.section}
                  </span>
                </div>
              </div>

              {/* Department Row */}
              <div className="py-2.5 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className={`${Typography.CAPTION} text-text-muted uppercase tracking-wider`}>Departments</span>
                  <span className={`${Typography.BODY} text-text-primary font-bold mt-0.5`}>
                    {profile.departments.length > 0 ? profile.departments.join(', ') : 'None assigned'}
                  </span>
                </div>
              </div>

              {/* Member Since Row */}
              <div className="py-2.5 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className={`${Typography.CAPTION} text-text-muted uppercase tracking-wider`}>Member Since</span>
                  <span className={`${Typography.BODY} text-text-primary font-bold mt-0.5 opacity-85`}>
                    {profile.memberSince}
                  </span>
                </div>
              </div>

            </div>

          </GlassCard>

          {/* ======================================================================
              SECTION 4: My Courses & Certificates (Horizontal scroll)
              ====================================================================== */}
          <div className="space-y-2.5 text-left">
            <div className="flex items-center justify-between px-1">
              <span className={`${Typography.OVERLINE} text-text-muted font-bold`}>
                My Courses & Certificates
              </span>
              {setActiveTab && (
                <button
                  onClick={() => setActiveTab('academy')}
                  className="text-xs font-extrabold text-gold-400 hover:text-gold-500 cursor-pointer flex items-center gap-1 transition-colors"
                >
                  <span>View All</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>

            {enrolledCourses.length === 0 ? (
              <GlassCard className="p-6 text-center space-y-3">
                <GraduationCap className="w-8 h-8 mx-auto text-text-muted opacity-40 animate-pulse" />
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-text-primary">No Enrolled Courses Yet</h4>
                  <p className="text-[10px] text-text-muted">Enroll in courses at Discipleship Academy to track progress.</p>
                </div>
                {setActiveTab && (
                  <button
                    onClick={() => setActiveTab('academy')}
                    className="p-2 px-4 rounded-full bg-gold-500/10 text-gold-400 border border-gold-500/20 text-[10px] font-bold cursor-pointer hover:bg-gold-500/20 transition-all"
                  >
                    Browse Academy
                  </button>
                )}
              </GlassCard>
            ) : (
              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none snap-x">
                {enrolledCourses.map((course) => (
                  <GlassCard 
                    key={course.localId}
                    className="p-4 w-[240px] flex-shrink-0 snap-start space-y-3.5 border border-white/5 relative"
                  >
                    <div className="space-y-1">
                      <AccentBadge label={course.status.toUpperCase()} variant="sage" size="sm" />
                      <h4 className="text-xs font-extrabold text-text-primary line-clamp-1">{course.title}</h4>
                      <p className="text-[9px] text-text-muted line-clamp-1">{course.schedule}</p>
                    </div>

                    {/* Completion progress bar */}
                    <div className="space-y-1">
                      <div className="flex justify-between items-center text-[9px] font-mono font-medium">
                        <span className="text-text-muted">Progress</span>
                        <span className="text-gold-400 font-bold">{course.progress}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gold-500 transition-all duration-500" 
                          style={{ width: `${course.progress}%` }}
                        />
                      </div>
                    </div>
                  </GlassCard>
                ))}
              </div>
            )}
          </div>

          {/* ======================================================================
              SECTION 5: Settings (Colored Icon Pattern)
              ====================================================================== */}
          <div className="space-y-4">
            
            {/* Preferences group */}
            <div className="space-y-1.5 text-left">
              <span className={`${Typography.OVERLINE} text-text-muted px-1 block`}>
                Preferences
              </span>
              <GlassCard className="p-1 overflow-hidden">
                
                {/* Appearance Settings Row */}
                <SettingsRow
                  icon={<Moon className="w-4.5 h-4.5 text-black" />}
                  iconColor="bg-gold-500"
                  label="Appearance"
                  trailing={
                    <button
                      onClick={toggleTheme}
                      className="relative w-12 h-6 rounded-full transition-colors focus:outline-none p-0.5 cursor-pointer bg-gold-500"
                    >
                      <motion.div
                        animate={{ x: isDark ? 24 : 0 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                        className="w-5 h-5 rounded-full bg-white shadow-md flex items-center justify-center"
                      />
                    </button>
                  }
                />

                {/* Notifications Settings Row */}
                <SettingsRow
                  icon={<Bell className="w-4.5 h-4.5 text-black" />}
                  iconColor="bg-sage-500"
                  label="Notification receipts"
                  trailing={<AccentBadge label="Synced" variant="sage" size="sm" />}
                />

                {/* Privacy Settings Row */}
                <SettingsRow
                  icon={<Shield className="w-4.5 h-4.5 text-white" />}
                  iconColor="bg-cathedral-500"
                  label="Hide from Saints Directory"
                  trailing={
                    <button
                      onClick={() => void handlePrivacyToggle()}
                      disabled={profilePreferences.isLoading || profilePreferences.isSaving}
                      aria-pressed={privacyOn}
                      aria-label="Hide profile from Saints Directory"
                      className={`relative w-12 h-6 rounded-full transition-colors focus:outline-none p-0.5 cursor-pointer ${
                        privacyOn ? 'bg-gold-500' : 'bg-surface-300'
                      } disabled:cursor-wait disabled:opacity-60`}
                    >
                      <motion.div
                        animate={{ x: privacyOn ? 24 : 0 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                        className="w-5 h-5 rounded-full bg-white shadow-md"
                      />
                    </button>
                  }
                />
                {profilePreferences.error && (
                  <p className="px-4 pb-3 text-[10px] leading-relaxed text-cathedral-500 dark:text-cathedral-300" role="status">
                    {profilePreferences.error}
                  </p>
                )}

              </GlassCard>
            </div>

            {/* System group */}
            <div className="space-y-1.5 text-left">
              <span className={`${Typography.OVERLINE} text-text-muted px-1 block`}>
                System
              </span>
              <GlassCard className="p-1 overflow-hidden">
                
                {/* Install App Settings Row */}
                <SettingsRow
                  icon={<Smartphone className="w-4.5 h-4.5 text-white" />}
                  iconColor="bg-sky-500"
                  label="Install App"
                  onPress={handleInstallApp}
                  trailing={
                    <span className="text-[10px] font-bold text-sky-400 bg-sky-500/10 border border-sky-500/15 px-2 py-0.5 rounded uppercase pr-1.5">
                      Install
                    </span>
                  }
                />

                <SettingsRow
                  icon={<MessageSquareText className="w-4.5 h-4.5 text-white" />}
                  iconColor="bg-violet-500"
                  label={governance.isManager ? 'Support & activity' : 'Help & feedback'}
                  onPress={() => setShowGovernanceSheet(true)}
                  trailing={governance.isManager && governance.feedback.some((item) => item.status === 'new') ? (
                    <span className="min-w-5 h-5 px-1.5 rounded-full bg-cathedral-600 text-white text-[10px] font-black flex items-center justify-center">
                      {governance.feedback.filter((item) => item.status === 'new').length}
                    </span>
                  ) : undefined}
                />

                {/* About Settings Row */}
                <SettingsRow
                  icon={<Info className="w-4.5 h-4.5 text-white" />}
                  iconColor="bg-surface-400"
                  label="About"
                  trailing={
                    <span className="text-xs text-text-muted font-mono pr-2">
                      v2.0
                    </span>
                  }
                  onPress={() => toast.success('ChurchConnect v2.0 · Built with Love')}
                />

                {/* Sign Out Settings Row */}
                <SettingsRow
                  icon={<LogOut className="w-4.5 h-4.5 text-white" />}
                  iconColor="bg-cathedral-400"
                  label="Sign Out"
                  onPress={() => setShowSignOutSheet(true)}
                />

              </GlassCard>
            </div>

          </div>

          {/* SIGN OUT / LOGOUT FOOTER */}
          <div className="pt-6 space-y-4 text-center">
            <div className="space-y-1">
              <p className={`${Typography.CAPTION} text-text-muted opacity-60`}>
                ChurchConnect v2.0
              </p>
              <p className="text-[10px] text-text-muted opacity-40 italic">
                Built with love for the Body of Christ
              </p>
            </div>
          </div>
        </>
      )}

      {/* ==========================================================
          FULLSCREEN QR OVERLAY SCREEN
          ========================================================== */}
      <AnimatePresence>
        {showQRFullscreen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-100 flex items-center justify-center bg-black/85 backdrop-blur-sm p-6"
          >
            <div className="absolute inset-0" onClick={() => setShowQRFullscreen(false)} />
            
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-white rounded-3xl w-full max-w-sm p-6 relative flex flex-col items-center justify-center space-y-6 shadow-2xl text-black"
            >
              
              <button
                onClick={() => setShowQRFullscreen(false)}
                className="absolute top-4 right-4 p-2 rounded-full bg-black/5 hover:bg-black/10 text-black transition-colors cursor-pointer"
              >
                <X className="w-5 h-5 stroke-[2.5]" />
              </button>

              <div className="text-center mt-2">
                <span className={`${Typography.OVERLINE} text-gold-600 block`}>
                  SCAN TO CHECK IN
                </span>
                <h3 className={`${Typography.TITLE} font-black text-black mt-1`}>
                  {profile.name}
                </h3>
              </div>

              {/* Big 280px QR code */}
              <div className="w-[260px] h-[260px] bg-white border border-black/5 p-4 rounded-2xl flex items-center justify-center shadow-inner">
                <QRCodeSVG value={profile.idNumber} size={228} level="M" bgColor="#ffffff" fgColor="#000000" />
                <svg className="hidden" viewBox="0 0 29 29" fill="currentColor" aria-hidden="true">
                  <path d="M0 0h7v7H0zm1 1v5h5V1zm1 1h3v3H2zm20-2h7v7h-7zm1 1v5h5V1zm1 1h3v3h-3zM0 22h7v7H0zm1 1v5h5v-5zm1 1h3v3H2z" />
                  <path d="M9 0h1v1H9zm2 0h2v1h-2zm3 0h1v2h-1zm2 0h1v1h-1zm1 0h1v2h-1zm1 0h1v1h-1zm-6 2h1v1H9zm2 0h1v1h-1zm4 0h1v1h-1zm1 0h1v1h-1zm-6 2h1v1h-1zm3 0h1v1h-1zm2 0h2v1h-2zm-5 2h2v1H9zm3 0h1v1h-1zm2 0h1v2h-1zm2 0h1v1h-1zm1 0h1v1h-1zm-7 2h1v1H9zm2 0h2v1h-2zm4 0h1v1h-1zm1 0h1v1h-1zm2 0h1v1h-1zm1 0h1v1h-1zm-10 2h1v1H8zm3 0h1v1h-1zm3 0h1v1h-1zm2 0h1v1h-1zm1 0h1v1h-1zm-8 2h2v1H9zm3 0h1v1h-1zm3 0h1v1h-1zm1 0h2v1h-2zm1 0h1v1h-1zm-8 2h1v1H9zm2 0h1v1h-1zm2 0h2v1h-2zm3 0h1v1h-1zm-6 2h2v1H9zm3 0h1v1h-1zm2 0h1v1h-1zm2 0h1v1h-1z" />
                  <path d="M14 14h1v1h-1zm1 1h1v1h-1zm-2 1h1v1h-1zm3 0h1v1h-1zm-2 1h1v1h-1zm3 0h1v1h-1zm-4 2h1v1h-1zm2 0h1v1h-1zm2 0h1v1h-1zm-3 1h1v1h-1zm2 0h1v1h-1zm-4 2h1v1h-1zm2 0h2v1h-2zm3 0h1v1h-1zm1 0h1v1h-1zm-6 2h1v1H9zm3 0h1v1h-1zm2 0h1v1h-1zm2 0h1v1h-1zm1 0h1v1h-1z" />
                  <path d="M22 9h1v1h-1zm2 0h1v2h-1zm2 0h1v1h-1zm-3 2h1v1h-1zm2 0h1v1h-1zm-3 2h2v1h-2zm3 0h1v1h-1zm-4 2h1v1h-1zm2 0h1v1h-1zm2 0h1v1h-1zm-3 1h1v1h-1zm2 0h1v1h-1zm-4 2h1v1h-1zm2 0h2v1h-2zm3 0h1v1h-1zm1 0h1v1h-1zm-6 2h1v1H9zm3 0h1v1h-1zm2 0h1v1h-1zm2 0h1v1h-1zm1 0h1v1h-1z" />
                </svg>
              </div>

              <h2 className={`${Typography.DISPLAY} text-black font-black uppercase tracking-wider`}>
                Scan Me
              </h2>

              <div className="flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-black/5 w-full text-center">
                <span className="text-[10px] font-bold text-gold-600 uppercase tracking-widest flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 fill-gold-600" />
                  Brightness Set to Max
                </span>
                <p className="text-[10px] text-black/60 font-medium">
                  ID: {profile.idNumber} · High-Speed Optical Check-In
                </p>
              </div>

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ==========================================================
          EDIT PROFILE BOTTOM SHEET FORM
          ========================================================== */}
      <BottomSheet
        isOpen={showEditSheet}
        onClose={() => setShowEditSheet(false)}
        title="Edit Profile Details"
      >
        <div className="space-y-4 pb-6 text-left">
          <p className="text-xs text-text-secondary font-medium leading-relaxed">
            Update your personal coordinates in the central registry.
          </p>

          <div className="space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
              Full Name
            </span>
            <input
              type="text"
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              className="w-full p-3 rounded-card bg-surface-200 text-sm border border-transparent focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500 text-text-primary outline-none font-bold"
            />
          </div>

          <div className="space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
              Email Address
            </span>
            <input
              type="email"
              value={tempEmail}
              readOnly
              aria-readonly="true"
              className="w-full p-3 rounded-card bg-surface-200/70 text-sm border border-theme-border text-text-muted outline-none cursor-not-allowed"
            />
            <p className="text-[10px] text-text-muted">Login email changes require a separately verified account process.</p>
          </div>

          <div className="space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
              Phone Number
            </span>
            <input
              type="text"
              value={tempPhone}
              onChange={(e) => setTempPhone(e.target.value)}
              className="w-full p-3 rounded-card bg-surface-200 text-sm border border-transparent focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500 text-text-primary outline-none font-medium"
            />
          </div>

          <div className="pt-2 flex gap-2">
            <button
              onClick={handleSaveProfile}
              className="flex-1 py-2.5 rounded-pill bg-gold-500 text-black font-extrabold text-xs cursor-pointer shadow-glow-gold text-center"
            >
              Save Changes
            </button>
            <button
              onClick={() => setShowEditSheet(false)}
              className="px-4 py-2.5 rounded-pill bg-surface-200 text-text-secondary font-bold text-xs cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      </BottomSheet>

      {/* ==========================================================
          SUPPORT, FEEDBACK & OPERATIONAL ACTIVITY
          ========================================================== */}
      <BottomSheet
        isOpen={showGovernanceSheet}
        onClose={() => setShowGovernanceSheet(false)}
        title={governance.isManager ? 'Support & Activity' : 'Help & Feedback'}
        detents={['full']}
      >
        <div className="space-y-4 pb-8 text-left">
          <div className="flex items-center gap-2 p-1 rounded-pill bg-surface-200">
            {(['feedback', 'activity'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setGovernanceTab(tab)}
                className={`flex-1 py-2 rounded-pill text-[11px] font-black uppercase tracking-wider transition-colors cursor-pointer ${
                  governanceTab === tab ? 'bg-gold-500 text-black shadow-sm' : 'text-text-secondary'
                }`}
              >
                {tab === 'feedback' ? (governance.isManager ? 'Support Queue' : 'My Requests') : 'Activity'}
              </button>
            ))}
          </div>

          {governance.error && (
            <div className="rounded-card border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
              {governance.error}
            </div>
          )}

          <button
            onClick={() => void governance.refresh()}
            disabled={governance.isRefreshing}
            className="ml-auto flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-text-muted hover:text-text-primary disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${governance.isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          {governanceTab === 'feedback' ? (
            <>
              <GlassCard variant="solid" className="space-y-3 p-4">
                <div>
                  <span className={`${Typography.OVERLINE} text-gold-600 block`}>Contact the team</span>
                  <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                    Send a support request, report a problem, or suggest an improvement. Only you and authorized leadership can read it.
                  </p>
                </div>
                <select
                  value={feedbackType}
                  onChange={(event) => setFeedbackType(event.target.value as FeedbackType)}
                  className="w-full p-3 rounded-card bg-surface-200 text-sm border border-theme-border text-text-primary outline-none focus:ring-2 focus:ring-gold-500/30"
                >
                  <option value="support">Support request</option>
                  <option value="bug">Report a problem</option>
                  <option value="suggestion">Suggest an improvement</option>
                  <option value="other">Other</option>
                </select>
                <textarea
                  value={feedbackContent}
                  onChange={(event) => setFeedbackContent(event.target.value)}
                  maxLength={2000}
                  rows={4}
                  placeholder="Describe what happened or how we can help…"
                  className="w-full resize-none p-3 rounded-card bg-surface-200 text-sm border border-theme-border text-text-primary placeholder:text-text-muted outline-none focus:ring-2 focus:ring-gold-500/30"
                />
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] text-text-muted">{feedbackContent.length}/2000</span>
                  <button
                    onClick={() => void handleSubmitFeedback()}
                    disabled={isSubmittingFeedback || feedbackContent.trim().length < 10}
                    className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-pill bg-gold-500 text-black text-xs font-black disabled:opacity-45 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {isSubmittingFeedback ? 'Sending…' : 'Send securely'}
                  </button>
                </div>
              </GlassCard>

              <div className="space-y-2.5">
                <div className="flex items-center justify-between px-1">
                  <span className={`${Typography.OVERLINE} text-text-muted`}>
                    {governance.isManager ? 'Recent requests' : 'Request history'}
                  </span>
                  <span className="text-[10px] font-mono text-text-muted">{governance.feedback.length}</span>
                </div>
                {governance.feedback.length === 0 ? (
                  <GlassCard variant="solid" className="py-8 text-center">
                    <MessageSquareText className="w-7 h-7 mx-auto text-text-muted mb-2" />
                    <p className="text-xs font-bold text-text-primary">No support requests yet</p>
                    <p className="text-[11px] text-text-muted mt-1">New requests will appear here after the server confirms them.</p>
                  </GlassCard>
                ) : governance.feedback.map((item) => (
                  <GlassCard key={item.localId} variant="solid" className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-extrabold text-text-primary capitalize">{item.type.replace('_', ' ')}</p>
                        {governance.isManager && <p className="text-[10px] text-text-muted mt-0.5">{item.memberName}</p>}
                      </div>
                      <AccentBadge
                        label={item.status === 'new' ? 'NEW' : item.status === 'reviewing' ? 'REVIEWING' : 'RESOLVED'}
                        variant={item.status === 'resolved' ? 'sage' : item.status === 'reviewing' ? 'gold' : 'cathedral'}
                        size="sm"
                      />
                    </div>
                    <p className="text-xs leading-relaxed text-text-secondary whitespace-pre-wrap">{item.content}</p>
                    <p className="text-[10px] text-text-muted">{formatGovernanceTime(item.createdAt)}</p>
                    {item.response && (
                      <div className="rounded-card bg-sage-50 dark:bg-sage-500/10 border border-sage-500/20 p-3">
                        <span className="text-[9px] font-black uppercase tracking-wider text-sage-700 dark:text-sage-300">Leadership response</span>
                        <p className="text-xs text-text-secondary mt-1 whitespace-pre-wrap">{item.response}</p>
                      </div>
                    )}
                    {governance.isManager && item.status !== 'resolved' && (
                      <div className="space-y-2 pt-1 border-t border-theme-border">
                        <textarea
                          value={reviewResponses[item.localId] ?? item.response ?? ''}
                          onChange={(event) => setReviewResponses((current) => ({ ...current, [item.localId]: event.target.value }))}
                          maxLength={2000}
                          rows={2}
                          placeholder="Add a response for the member…"
                          className="w-full resize-none p-3 rounded-card bg-surface-200 text-xs border border-theme-border text-text-primary placeholder:text-text-muted outline-none"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => void handleReviewFeedback(item.localId, 'reviewing')}
                            disabled={reviewingFeedbackId === item.localId}
                            className="py-2 rounded-pill bg-surface-200 text-text-primary text-[11px] font-bold disabled:opacity-50 cursor-pointer"
                          >
                            Mark reviewing
                          </button>
                          <button
                            onClick={() => void handleReviewFeedback(item.localId, 'resolved')}
                            disabled={reviewingFeedbackId === item.localId}
                            className="py-2 rounded-pill bg-sage-600 text-white text-[11px] font-black disabled:opacity-50 cursor-pointer"
                          >
                            Resolve
                          </button>
                        </div>
                      </div>
                    )}
                  </GlassCard>
                ))}
              </div>
            </>
          ) : (
            <div className="space-y-2.5">
              <div className="px-1">
                <span className={`${Typography.OVERLINE} text-text-muted`}>
                  {governance.isManager ? 'Operational history' : 'My recent activity'}
                </span>
                <p className="text-[11px] text-text-muted mt-1">
                  Append-only records of confirmed app actions. PocketBase server logs remain the forensic source of truth.
                </p>
              </div>
              {governance.auditLogs.length === 0 ? (
                <GlassCard variant="solid" className="py-8 text-center">
                  <Activity className="w-7 h-7 mx-auto text-text-muted mb-2" />
                  <p className="text-xs font-bold text-text-primary">No activity records yet</p>
                </GlassCard>
              ) : governance.auditLogs.map((item) => (
                <GlassCard key={item.localId} variant="solid" className="p-3.5 flex gap-3">
                  <div className="w-9 h-9 shrink-0 rounded-full bg-gold-100 dark:bg-gold-500/15 text-gold-700 dark:text-gold-400 flex items-center justify-center">
                    <Activity className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-extrabold text-text-primary">{item.action.replaceAll('_', ' ')}</p>
                      <span className="text-[9px] text-text-muted shrink-0">{formatGovernanceTime(item.createdAt)}</span>
                    </div>
                    {governance.isManager && <p className="text-[10px] text-gold-700 dark:text-gold-400 mt-0.5">{item.userName}</p>}
                    <p className="text-[11px] leading-relaxed text-text-secondary mt-1">{item.details}</p>
                  </div>
                </GlassCard>
              ))}
            </div>
          )}
        </div>
      </BottomSheet>

      {/* ==========================================================
          SIGN OUT CONFIRMATION BOTTOM SHEET
          ========================================================== */}
      <BottomSheet
        isOpen={showSignOutSheet}
        onClose={() => setShowSignOutSheet(false)}
        title="Sign Out"
      >
        <div className="space-y-4 pb-6 text-center text-text-primary">
          <p className="text-xs text-text-secondary font-medium leading-relaxed max-w-sm mx-auto">
            {pendingSyncCount + failedSyncCount > 0
              ? `${pendingSyncCount + failedSyncCount} saved ${pendingSyncCount + failedSyncCount === 1 ? 'change is' : 'changes are'} still awaiting PocketBase. They will remain tied to this account on this device and resume only after you sign in again.`
              : 'Are you sure you want to sign out of ChurchConnect? Your device settings will remain available.'}
          </p>

          <div className="grid grid-cols-2 gap-2 pt-2">
            <button
              onClick={async () => {
                setShowSignOutSheet(false);
                await logout();
              }}
              className="py-2.5 rounded-pill bg-cathedral-700 text-white font-black text-xs uppercase tracking-wider cursor-pointer hover:bg-cathedral-800 transition-colors"
            >
              Yes, Sign Out
            </button>
            <button
              onClick={() => setShowSignOutSheet(false)}
              className="py-2.5 rounded-pill bg-surface-200 text-text-secondary font-bold text-xs cursor-pointer hover:bg-surface-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </BottomSheet>

    </div>
  );
}
