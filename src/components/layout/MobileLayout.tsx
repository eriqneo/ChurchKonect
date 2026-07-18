import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTheme } from '../../lib/theme/ThemeProvider';
import * as Typography from '../../lib/theme/typography';
import { 
  GlassCard, 
  AccentBadge, 
  SettingsRow, 
  GlowTabBar, 
  BottomSheet, 
  SearchField,
  ScriptureCard,
  StatBlock,
  ContentRow,
  DayStrip,
  HeroCard,
  SectionTitle
} from '../shared';
import { 
  Menu, 
  Bell, 
  Sparkles, 
  Users, 
  Grid, 
  BookOpen, 
  Heart, 
  Compass, 
  Check, 
  ChevronDown, 
  ChevronUp, 
  Info, 
  Activity, 
  Wifi, 
  WifiOff, 
  User, 
  Plus, 
  FileText, 
  MapPin, 
  Calendar, 
  ChevronRight, 
  Flame, 
  ShieldAlert,
  Sliders,
  Settings,
  Megaphone,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  X
} from 'lucide-react';

import { SaintsDirectory } from '../saints/SaintsDirectory';
import { CellGroupModule } from '../cells/CellGroupModule';
import { TrainingModule } from '../training/TrainingModule';
import { PrayerModule } from '../prayer/PrayerModule';
import { ReportsModule } from '../reports/ReportsModule';
import { ProfileModule } from '../profile/ProfileModule';
import { AnnouncementsModule } from '../announcements/AnnouncementsModule';
import { CommunicationModule } from '../communication/CommunicationModule';
import { NotificationSystem } from '../communication/NotificationSystem';
import { useNotifications } from '../../lib/db/notificationData';
import { useAuth } from '../../lib/db/PocketBaseProvider';
import { useOperationalSync } from '../../lib/db/syncData';
import { useHomeDashboard } from '../../lib/db/homeData';
import { APP_ROLES, getRoleView } from '../../lib/auth/roles';



// ==========================================
// 7 Role Definitions
// ==========================================
export const ROLES = APP_ROLES;

const ENABLE_ROLE_SIMULATOR = import.meta.env.DEV && import.meta.env.VITE_ENABLE_ROLE_SIMULATOR === 'true';

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function readableEventTime(value: string): string {
  if (!value) return '';
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return value;
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function MobileLayout() {
  const { theme, toggleTheme, isDark } = useTheme();
  const { user, logout } = useAuth();
  const {
    isOnline,
    isSyncing,
    pendingCount: pendingChanges,
    failedCount: failedChanges,
    items: syncItems,
    message: syncMessage,
    lastAcknowledgedAt,
    syncNow,
    retryFailed
  } = useOperationalSync();

  // Navigation and State
  const [activeTab, setActiveTab] = useState<string>('home');
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [currentRoleIndex, setCurrentRoleIndex] = useState<number>(() => {
    const index = ROLES.findIndex((role) => role.id === user?.role);
    return index >= 0 ? index : 0;
  });

  // Synchronize currentRoleIndex with active authenticated user
  useEffect(() => {
    if (user) {
      const idx = ROLES.findIndex(r => r.id === user.role);
      if (idx !== -1) {
        setCurrentRoleIndex(idx);
      }
    }
  }, [user]);

  const [scrolled, setScrolled] = useState<boolean>(false);
  const [isHeaderVisible, setIsHeaderVisible] = useState<boolean>(true);
  const lastScrollTopRef = useRef(0);
  const directionalTravelRef = useRef(0);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  
  // Custom expandable state for drawer accordion
  const [isStructureExpanded, setIsStructureExpanded] = useState<boolean>(false);

  // Bottom Sheets & Modals
  const [showRoleSelector, setShowRoleSelector] = useState<boolean>(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState<boolean>(false);
  const [isSyncStatusOpen, setIsSyncStatusOpen] = useState<boolean>(false);


  // Search filter
  const [searchQuery, setSearchQuery] = useState<string>('');

  const currentRole = getRoleView(user!);
  const {
    snapshot: homeSnapshot,
    isLoading: isHomeLoading,
    isOfflineSnapshot: isHomeOfflineSnapshot,
    error: homeError
  } = useHomeDashboard(activeTab === 'home');
  const homeSummary = homeSnapshot?.summary;
  const isPastoralDashboard = currentRole.isAdmin || currentRole.id === 'lead_pastor' || currentRole.id === 'district_pastor';
  const selectedDateKey = localDateKey(selectedDate);
  const gatheringMarks = useMemo(() => Object.fromEntries(
    (homeSnapshot?.gatherings ?? []).map((item) => [item.eventDate, 'complete' as const])
  ), [homeSnapshot]);
  const selectedGatherings = useMemo(() => (
    homeSnapshot?.gatherings.filter((item) => item.eventDate === selectedDateKey) ?? []
  ), [homeSnapshot, selectedDateKey]);
  
  const { unreadCount: activeUnreadCount } = useNotifications();

  // Reveal the navigation whenever the active workspace or a global overlay changes.
  useEffect(() => {
    setIsHeaderVisible(true);
    directionalTravelRef.current = 0;
  }, [activeTab, isDrawerOpen, isNotificationsOpen]);

  // Direction-aware mobile header: hide on deliberate downward travel, reveal quickly upward.
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const currentScrollTop = Math.max(0, e.currentTarget.scrollTop);
    const delta = currentScrollTop - lastScrollTopRef.current;

    setScrolled(currentScrollTop > 20);

    if (currentScrollTop <= 24) {
      setIsHeaderVisible(true);
      directionalTravelRef.current = 0;
    } else if (delta > 0) {
      directionalTravelRef.current = Math.max(0, directionalTravelRef.current) + delta;
      if (currentScrollTop > 96 && directionalTravelRef.current > 28) {
        setIsHeaderVisible(false);
        directionalTravelRef.current = 0;
      }
    } else if (delta < 0) {
      directionalTravelRef.current = Math.min(0, directionalTravelRef.current) + delta;
      if (directionalTravelRef.current < -12) {
        setIsHeaderVisible(true);
        directionalTravelRef.current = 0;
      }
    }

    lastScrollTopRef.current = currentScrollTop;
  };

  // Sync Bell Indicator Color
  const getSyncIndicatorColor = () => {
    if (!isOnline || failedChanges > 0) return 'bg-cathedral-500';
    if (pendingChanges > 0 || isSyncing) return 'bg-gold-500 animate-glow-pulse';
    return 'bg-[#7BC47F]'; // Synced
  };

  const triggerHaptic = () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(10);
      } catch (e) {}
    }
  };

  // Navigation tab bar mapping
  const tabs = [
    { id: 'home', label: 'Explore', icon: <Compass className="w-5.5 h-5.5" /> },
    { id: 'saints', label: 'Saints', icon: <Users className="w-5.5 h-5.5" /> },
    { id: 'cells', label: 'Cells', icon: <Grid className="w-5.5 h-5.5" /> },
    { id: 'academy', label: 'Academy', icon: <BookOpen className="w-5.5 h-5.5" /> },
    { id: 'prayers', label: 'Prayers', icon: <Heart className="w-5.5 h-5.5" /> },
  ];

  return (
    <div className="h-[100dvh] overflow-hidden md:h-auto md:min-h-screen md:overflow-visible w-full flex flex-col items-center justify-start p-0 md:p-8 select-none transition-colors duration-300 bg-surface-0 md:bg-[#121214]">
      
      {/* Dynamic desktop controls for preview */}
      <div className="hidden md:flex items-center gap-6 mb-6 z-20 px-5 py-2 bg-surface-100/80 dark:bg-surface-100/40 backdrop-blur-md rounded-full border border-surface-200 shadow-card-light dark:shadow-card-dark">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-gold-500 shadow-glow-gold animate-pulse"></span>
          <span className={`${Typography.CAPTION} text-theme-text`}>
            ChurchConnect Premium Workspace
          </span>
        </div>
        <div className="h-4 w-px bg-surface-200"></div>
        
        {ENABLE_ROLE_SIMULATOR && <button
          onClick={() => setShowRoleSelector(true)}
          className="flex items-center gap-1.5 px-3 py-1 bg-gold-500/10 text-gold-500 border border-gold-500/20 rounded-full text-xs font-semibold hover:bg-gold-500/20 transition-all cursor-pointer"
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Development roles</span>
        </button>}

        <button
          type="button"
          onClick={() => setIsSyncStatusOpen(true)}
          className={`flex items-center gap-1.5 px-3 py-1 border rounded-full text-xs font-semibold transition-all cursor-pointer ${
            isOnline && failedChanges === 0
              ? 'bg-semantic-success/10 text-semantic-success border-semantic-success/20 hover:bg-semantic-success/15'
              : 'bg-cathedral-500/10 text-cathedral-400 border-cathedral-500/20 hover:bg-cathedral-500/20'
          }`}
        >
          {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
          <span>{!isOnline ? 'Offline' : failedChanges ? `${failedChanges} need attention` : pendingChanges ? `${pendingChanges} syncing` : 'PocketBase confirmed'}</span>
        </button>

        {/* Theme switcher */}
        <button
          onClick={toggleTheme}
          className="p-1.5 rounded-full bg-surface-200 dark:bg-surface-200 light:bg-surface-light-secondary hover:scale-105 transition-transform"
        >
          {isDark ? '☀️' : '🌙'}
        </button>
      </div>

      {/* Main Mobile App Frame — full-bleed on real mobile viewports, decorative device mockup on desktop preview */}
      <div
        className={`w-full h-[100dvh] rounded-none border-0 shadow-none md:max-w-[412px] md:h-[892px] md:rounded-[48px] md:border-[10px] md:border-[#222226] relative overflow-hidden bg-theme-bg md:shadow-2xl flex flex-col ${
          isDark ? 'md:[box-shadow:0_25px_50px_-12px_rgba(0,0,0,0.8),0_0_100px_rgba(200,164,92,0.05)]' : 'md:[box-shadow:0_25px_50px_-12px_rgba(12,12,14,0.1),0_0_100px_rgba(123,29,49,0.03)]'
        }`}
      >
        {/* Notch / Status Bar — decorative, desktop preview only. Real devices render their own status bar. */}
        <div className="hidden md:flex absolute top-0 left-0 right-0 h-10 bg-black/40 z-55 items-center justify-between px-6 text-[11px] font-semibold text-white pointer-events-none">
          <span>9:41 AM</span>
          <div className="w-24 h-4.5 bg-black rounded-full absolute left-1/2 -translate-x-1/2 top-1.5"></div>
          <div className="flex items-center gap-1.5">
            {!isOnline && <WifiOff className="w-3 h-3 text-cathedral-400" />}
            <span>LTE</span>
            <span className="w-5 h-2.5 border border-white/60 rounded-xs p-[1px] flex items-center">
              <span className="h-full w-4 bg-white rounded-2xs"></span>
            </span>
          </div>
        </div>

        {/* Dynamic Top Background Glow Accent */}
        <div className="header-glow absolute top-0 left-1/2 -translate-x-1/2 w-72 h-72 bg-gold-500/10 dark:bg-gold-500/10 rounded-full blur-3xl pointer-events-none z-0"></div>

        {/* ==========================================
            SCREEN HEADER BAR (56px)
           ========================================== */}
        <header
          className={`absolute top-0 md:top-10 left-0 right-0 min-h-14 pt-[var(--safe-top)] md:pt-0 px-4 flex items-center justify-between z-40 will-change-transform transition-[transform,opacity,background-color,box-shadow,border-color] duration-250 ease-out md:translate-y-0 md:opacity-100 md:pointer-events-auto ${
            isHeaderVisible || isDrawerOpen || isNotificationsOpen
              ? 'translate-y-0 opacity-100 pointer-events-auto'
              : '-translate-y-full opacity-0 pointer-events-none'
          } ${
            scrolled
              ? 'bg-white/88 dark:bg-surface-100/88 backdrop-blur-xl border-b border-theme-border shadow-sm'
              : 'bg-transparent'
          }`}
        >
          {/* Left: Hamburger menu */}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => { triggerHaptic(); setIsDrawerOpen(true); }}
            className="w-10 h-10 rounded-full flex items-center justify-center text-theme-text hover:bg-theme-text/5 transition-colors cursor-pointer"
          >
            <Menu className="w-5 h-5" />
          </motion.button>

          {/* Center Title or Logo */}
          <div className="flex-1 text-center px-2">
            <AnimatePresence mode="wait">
              <motion.h2
                key={activeTab}
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                transition={{ duration: 0.15 }}
                className={`${Typography.SUBTITLE} text-theme-text font-bold tracking-tight truncate inline-flex items-center justify-center gap-2`}
              >
                {activeTab === 'home' && (
                  <img src="/churchconnect-logo.svg" alt="" aria-hidden="true" className="w-6 h-6" />
                )}
                {activeTab === 'home' 
                  ? 'ChurchConnect' 
                  : activeTab === 'reports' 
                    ? 'REPORTS & ANALYTICS' 
                    : activeTab === 'profile' 
                      ? 'MY PROFILE' 
                      : activeTab === 'announcements' 
                        ? 'ANNOUNCEMENTS' 
                        : activeTab === 'communication' 
                          ? 'COMMUNICATION HUB' 
                          : activeTab.toUpperCase()}
              </motion.h2>
            </AnimatePresence>
          </div>

          {/* Right Cluster */}
          <div className="flex items-center gap-2">
            {/* Sync status & Notification Bell */}
            <div className="relative">
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => { triggerHaptic(); setIsNotificationsOpen(true); }}
                className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-theme-text/5 transition-colors relative cursor-pointer"
              >
                <Bell className="w-4.5 h-4.5 text-theme-text-secondary" />

                {/* Bell sync dot on bottom right of the bell */}
                <span className={`absolute bottom-2.5 right-2.5 w-2 h-2 rounded-full border border-theme-bg ${getSyncIndicatorColor()}`}></span>
              </motion.button>

              <AnimatePresence>
                {activeUnreadCount > 0 && (
                  <motion.span
                    key={activeUnreadCount}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: [0, 1.25, 1], opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                    className="absolute top-0.5 right-0.5 bg-gold-500 text-black font-black text-[8px] w-4.5 h-4.5 rounded-full flex items-center justify-center shadow-glow-gold pointer-events-none"
                  >
                    {activeUnreadCount > 9 ? '9+' : activeUnreadCount}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>

            {/* Avatar with gold ring if admin/clergy */}
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => { triggerHaptic(); setActiveTab('profile'); }}
              className={`w-10 h-10 rounded-full p-[3px] cursor-pointer flex items-center justify-center ${
                currentRole.isAdmin ? 'ring-2 ring-gold-500' : 'border border-theme-border'
              }`}
            >
              <div className="w-full h-full rounded-full bg-gradient-to-tr from-cathedral-700 to-gold-500 flex items-center justify-center text-white text-[10px] font-black">
                {currentRole.avatarText}
              </div>
            </motion.button>
          </div>
        </header>

        {/* ==========================================
            MAIN CONTENT PORTAL (Scrollable)
           ========================================== */}
        <div
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto pt-[calc(3.5rem+var(--safe-top))] pb-[calc(var(--bottom-nav-height)+var(--bottom-nav-safe)+0.75rem)] md:pt-24 md:pb-28 px-4 relative z-10 scrollbar-thin scroll-smooth"
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={`${activeTab}-${currentRole.id}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="space-y-5"
            >
              {/* --------------------------------------
                  TAB 1: HOME (Explore)
                 -------------------------------------- */}
              {activeTab === 'home' && (
                <div className="space-y-5">
                  
                  {/* Custom Welcome Greeting */}
                  <div className="px-1 pt-1">
                    <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-theme-text-secondary mb-1 block">
                      Peace be with you,
                    </span>
                    <h1 className="text-xl font-extrabold tracking-tight text-theme-text flex items-center gap-1.5">
                      {currentRole.name} <Sparkles className="w-4.5 h-4.5 text-gold-500 animate-pulse flex-shrink-0" />
                    </h1>
                    {(homeError || isHomeOfflineSnapshot) && (
                      <p className="mt-2 text-[10px] leading-relaxed text-theme-text-muted" role={homeError ? 'status' : undefined}>
                        {homeError || 'Showing the last confirmed dashboard while freshness is checked.'}
                      </p>
                    )}
                  </div>

                  {/* Motivational Quote / Scripture Card (Inspired by Quote of Day) */}
                  <ScriptureCard
                    text="Your word is a lamp for my feet, a light on my path."
                    reference="Psalm 119:105"
                  />

                  {/* Role-Specific Hero Banner */}
                  {isPastoralDashboard ? (
                    <HeroCard
                      eyebrow="Leadership Portal"
                      title={homeSummary?.pendingActionCount
                        ? `${homeSummary.pendingActionCount} cell ${homeSummary.pendingActionCount === 1 ? 'report' : 'reports'} ready for review`
                        : 'Leadership dashboard is current'}
                      subtitle={homeSummary
                        ? `${homeSummary.weeklyAttendance} recorded attendees across ${homeSummary.activeCellCount} active ${homeSummary.activeCellCount === 1 ? 'cell' : 'cells'} this week.`
                        : 'Loading the latest leadership summary from PocketBase.'}
                      actionLabel="Review Reports"
                      onAction={() => setActiveTab('reports')}
                    />
                  ) : currentRole.id === 'cell_leader' ? (
                    <HeroCard
                      eyebrow="Cell Ministry"
                      title={homeSummary?.pendingActionCount
                        ? `${homeSummary.pendingActionCount} ${homeSummary.pendingActionCount === 1 ? 'report needs' : 'reports need'} submission`
                        : 'Your fellowship records are current'}
                      subtitle={homeSummary
                        ? `${homeSummary.memberCount} active ${homeSummary.memberCount === 1 ? 'member' : 'members'} across your assigned fellowship.`
                        : 'Loading your assigned fellowship summary from PocketBase.'}
                      actionLabel="Open Cells"
                      onAction={() => setActiveTab('cells')}
                    />
                  ) : currentRole.id === 'guest' ? (
                    <HeroCard
                      eyebrow="New to Church?"
                      title="Explore the Church Academy"
                      subtitle={homeSummary
                        ? `${homeSummary.activeCourseCount} ${homeSummary.activeCourseCount === 1 ? 'course is' : 'courses are'} currently open or upcoming.`
                        : 'Loading the current course catalog from PocketBase.'}
                      actionLabel="Browse Academy"
                      onAction={() => setActiveTab('academy')}
                    />
                  ) : (
                    <HeroCard
                      eyebrow={homeSummary?.currentCourseTitle ? 'Your Academy' : 'Church Academy'}
                      title={homeSummary?.currentCourseTitle || 'Explore available courses'}
                      subtitle={homeSummary?.currentCourseTitle
                        ? `${homeSummary.academyProgress}% attendance progress across your active enrollments.`
                        : 'Browse current courses and enroll when you are ready.'}
                      actionLabel="Go to Academy"
                      onAction={() => setActiveTab('academy')}
                    />
                  )}

                  {/* Pending Actions Section */}
                  <div>
                    <SectionTitle title="Pending Actions" />
                    <div className="space-y-2.5">
                      {!homeSummary ? (
                        <GlassCard className="p-4 flex items-center gap-3">
                          {isOnline
                            ? <RefreshCw className={`w-4 h-4 text-gold-500 ${isHomeLoading ? 'animate-spin' : ''}`} />
                            : <WifiOff className="w-4 h-4 text-theme-text-muted" />}
                          <p className="text-xs font-semibold text-theme-text-secondary">
                            {isOnline ? 'Loading confirmed actions…' : 'Connect once to save this dashboard for offline use.'}
                          </p>
                        </GlassCard>
                      ) : isPastoralDashboard && homeSummary.pendingActionCount > 0 ? (
                          <GlassCard 
                            pressable={true}
                            onPress={() => { triggerHaptic(); setActiveTab('reports'); }}
                            className="p-3 flex items-center justify-between border-l-4 border-l-cathedral-500 cursor-pointer hover:bg-theme-text/5"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-cathedral-500/10 text-cathedral-400 flex items-center justify-center font-bold text-xs flex-shrink-0">
                                {homeSummary.pendingActionCount}
                              </div>
                              <div>
                                <h4 className="text-xs font-bold text-theme-text">Cell Reports Pending Approval</h4>
                                <p className="text-[10px] text-theme-text-secondary mt-0.5">Review the latest PocketBase submissions</p>
                              </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-theme-text-muted flex-shrink-0" />
                          </GlassCard>
                      ) : currentRole.id === 'cell_leader' && homeSummary.pendingActionCount > 0 ? (
                        <GlassCard 
                          pressable={true}
                          onPress={() => { triggerHaptic(); setActiveTab('cells'); }}
                          className="p-3 flex items-center justify-between border-l-4 border-l-gold-500 cursor-pointer hover:bg-theme-text/5"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gold-500/10 text-gold-500 flex items-center justify-center font-bold text-xs flex-shrink-0">
                              {homeSummary.pendingActionCount}
                            </div>
                            <div>
                              <h4 className="text-xs font-bold text-theme-text">Complete Fellowship Reports</h4>
                              <p className="text-[10px] text-theme-text-secondary mt-0.5">Completed meetings are waiting for their reports</p>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-theme-text-muted flex-shrink-0" />
                        </GlassCard>
                      ) : !isPastoralDashboard && currentRole.id !== 'cell_leader' && homeSummary.currentCourseTitle && homeSummary.academyProgress < 100 ? (
                        <GlassCard 
                          pressable={true}
                          onPress={() => { triggerHaptic(); setActiveTab('academy'); }}
                          className="p-3 flex items-center justify-between border-l-4 border-l-gold-500 cursor-pointer hover:bg-theme-text/5"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gold-500/10 text-gold-500 flex items-center justify-center font-bold text-xs flex-shrink-0">
                              1
                            </div>
                            <div>
                              <h4 className="text-xs font-bold text-theme-text">Continue {homeSummary.currentCourseTitle}</h4>
                              <p className="text-[10px] text-theme-text-secondary mt-0.5">Current attendance progress: {homeSummary.academyProgress}%</p>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-theme-text-muted flex-shrink-0" />
                        </GlassCard>
                      ) : (
                        <GlassCard className="p-3 flex items-center gap-3 border-l-4 border-l-semantic-success">
                          <div className="w-8 h-8 rounded-full bg-semantic-success/10 text-semantic-success flex items-center justify-center flex-shrink-0">
                            <CheckCircle2 className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-theme-text">You are all caught up</h4>
                            <p className="text-[10px] text-theme-text-secondary mt-0.5">No server-confirmed actions need your attention.</p>
                          </div>
                        </GlassCard>
                      )}
                    </div>
                  </div>

                  {/* Day Strip (Inspired by calendar selectors) */}
                  <div>
                    <SectionTitle title="Weekly Gatherings" />
                    <DayStrip
                      selectedDate={selectedDate}
                      onSelectDate={setSelectedDate}
                      markedDates={gatheringMarks}
                    />
                  </div>

                  {/* Stats Block Metrics (Replicating Workout patterns) */}
                  <div>
                    <SectionTitle title="Live Overview" />
                    <div className="grid grid-cols-2 gap-3">
                      {isPastoralDashboard ? (
                        <>
                          <StatBlock
                            icon={<Users className="w-4 h-4" />}
                            value={homeSummary?.weeklyAttendance ?? '—'}
                            label="Weekly Cell Attendance"
                            highlight={true}
                          />
                          <StatBlock
                            icon={<Flame className="w-4 h-4" />}
                            value={homeSummary?.activeCellCount ?? '—'}
                            label="Active Cells"
                          />
                        </>
                      ) : currentRole.id === 'cell_leader' ? (
                        <>
                          <StatBlock
                            icon={<Users className="w-4 h-4" />}
                            value={homeSummary?.memberCount ?? '—'}
                            label="Fellowship Members"
                            highlight={true}
                          />
                          <StatBlock
                            icon={<FileText className="w-4 h-4" />}
                            value={homeSummary?.pendingActionCount ?? '—'}
                            label="Reports Due"
                          />
                        </>
                      ) : (
                        <>
                          <StatBlock
                            icon={<BookOpen className="w-4 h-4" />}
                            value={homeSummary?.enrollmentCount ?? '—'}
                            label="Academy Enrollments"
                            highlight={true}
                          />
                          <StatBlock
                            icon={<Sparkles className="w-4 h-4" />}
                            value={homeSummary ? `${homeSummary.academyProgress}%` : '—'}
                            label="Academy Progress"
                          />
                        </>
                      )}
                    </div>
                  </div>

                  {/* Server-confirmed gatherings for the selected day */}
                  <div>
                    <SectionTitle title={`Gatherings · ${selectedDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`} />
                    {selectedGatherings.length > 0 ? selectedGatherings.map((item) => (
                      <ContentRow
                        key={item.id}
                        title={item.title}
                        subtitle={item.body}
                        meta={[readableEventTime(item.eventTime), item.eventLocation].filter(Boolean).join(' · ') || undefined}
                        onPress={() => setActiveTab('announcements')}
                      />
                    )) : (
                      <GlassCard className="p-4 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gold-500/10 text-gold-600 dark:text-gold-400 flex items-center justify-center flex-shrink-0">
                          <Calendar className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-theme-text">No published gatherings for this day</h4>
                          <p className="text-[10px] text-theme-text-secondary mt-0.5">Dates with confirmed events are marked above.</p>
                        </div>
                      </GlassCard>
                    )}
                  </div>

                </div>
              )}

              {/* --------------------------------------
                  TAB 2: SAINTS (Saints & Structures)
                 -------------------------------------- */}
              {activeTab === 'saints' && (
                <SaintsDirectory />
              )}

              {/* --------------------------------------
                  TAB 3: CELLS (Cell Groups)
                 -------------------------------------- */}
              {activeTab === 'cells' && (
                <CellGroupModule />
              )}

              {/* --------------------------------------
                  TAB 4: ACADEMY (Courses)
                 -------------------------------------- */}
              {activeTab === 'academy' && (
                <TrainingModule currentRole={currentRole} />
              )}

              {/* --------------------------------------
                  TAB 5: PRAYERS (Prayer Requests)
                 -------------------------------------- */}
              {activeTab === 'prayers' && (
                <PrayerModule />
              )}

              {/* --------------------------------------
                  TAB 6: REPORTS (Reports & Analytics)
                 -------------------------------------- */}
              {activeTab === 'reports' && (
                <ReportsModule />
              )}

              {/* --------------------------------------
                  TAB 7: PROFILE (Identity & Settings)
                 -------------------------------------- */}
              {activeTab === 'profile' && (
                <ProfileModule currentRole={currentRole} />
              )}

              {/* --------------------------------------
                  TAB 8: ANNOUNCEMENTS (Feeds)
                 -------------------------------------- */}
              {activeTab === 'announcements' && (
                <AnnouncementsModule currentRole={currentRole} />
              )}

              {/* --------------------------------------
                  TAB 9: COMMUNICATION (Notification Center)
                 -------------------------------------- */}
              {activeTab === 'communication' && (
                <CommunicationModule 
                  onActiveTabChange={setActiveTab}
                />
              )}


            </motion.div>
          </AnimatePresence>
        </div>

        {/* ==========================================
            OFFLINE BANNER (Conditional above tab bar)
           ========================================== */}
        <AnimatePresence>
          {(!isOnline || pendingChanges > 0 || failedChanges > 0 || isSyncing) && (
            <motion.button
              type="button"
              onClick={() => setIsSyncStatusOpen(true)}
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              className={`absolute bottom-[calc(var(--bottom-nav-height)+var(--bottom-nav-safe))] md:bottom-20 left-0 right-0 h-9 z-40 flex items-center justify-between px-5 text-left transition-all ${
                !isOnline || failedChanges > 0
                  ? 'bg-cathedral-900 text-white border-t border-cathedral-800' 
                  : 'bg-gold-500 text-black border-t border-gold-600'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 relative">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${!isOnline || failedChanges ? 'bg-cathedral-400' : 'bg-white'}`}></span>
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${!isOnline || failedChanges ? 'bg-cathedral-500' : 'bg-white'}`}></span>
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider">
                  {!isOnline
                    ? pendingChanges ? `Offline · ${pendingChanges} saved on this device` : 'Offline · showing confirmed cache'
                    : failedChanges
                      ? `${failedChanges} ${failedChanges === 1 ? 'change needs' : 'changes need'} attention`
                      : isSyncing
                        ? `Synchronizing ${pendingChanges} ${pendingChanges === 1 ? 'change' : 'changes'}…`
                        : `${pendingChanges} ${pendingChanges === 1 ? 'change is' : 'changes are'} queued`}
                </span>
              </div>
              <span className="text-[9px] font-bold opacity-80">Review</span>
            </motion.button>
          )}
        </AnimatePresence>

        {/* ==========================================
            BOTTOM GLOW TAB BAR (64px + Notch)
           ========================================== */}
        <GlowTabBar
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          centerTabId="cells"
        />

        {/* ==========================================
            SIDE DRAWER (Slide from Left)
           ========================================== */}
        <AnimatePresence>
          {isDrawerOpen && (
            <div className="absolute inset-0 z-100 overflow-hidden flex pointer-events-none">
              
              {/* Overlay Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsDrawerOpen(false)}
                className="absolute inset-0 bg-black/60 backdrop-blur-xs cursor-pointer pointer-events-auto"
              />

              {/* Slider Drawer Menu Panel */}
              <motion.div
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', damping: 26, stiffness: 280 }}
                className="absolute top-0 bottom-0 left-0 w-[290px] bg-theme-bg-secondary border-r border-theme-border flex flex-col justify-between z-10 p-5 pb-[calc(1.25rem+var(--safe-bottom))] pt-[calc(3rem+var(--safe-top))] md:pt-12 pointer-events-auto"
              >
                <div className="space-y-5">
                  
                  {/* Close drawer top corner button */}
                  <div className="flex justify-end">
                     <button 
                      onClick={() => setIsDrawerOpen(false)}
                      className="p-1 rounded-full hover:bg-theme-text/5 text-theme-text-muted hover:text-theme-text transition-colors cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Top user profile header card */}
                  <GlassCard 
                    variant="elevated" 
                    pressable={true} 
                    onPress={() => { triggerHaptic(); setActiveTab('profile'); setIsDrawerOpen(false); }}
                    className="p-3.5 flex items-center gap-3 cursor-pointer"
                  >
                    <div className="w-12 h-12 rounded-full p-[1.5px] ring-2 ring-gold-500">
                      <div className="w-full h-full rounded-full bg-gradient-to-tr from-cathedral-700 to-gold-500 flex items-center justify-center font-bold text-white text-sm">
                        {currentRole.avatarText}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className={`${Typography.SUBTITLE} text-theme-text truncate font-bold`}>
                        {currentRole.name}
                      </h3>
                      <p className="text-[10px] text-theme-text-secondary truncate mt-0.5">
                        {currentRole.department}
                      </p>
                      
                      <div className="mt-1.5">
                        <AccentBadge label={currentRole.label} variant="gold" size="sm" />
                      </div>
                    </div>
                  </GlassCard>

                  {/* Navigation Accordions and Links */}
                  <div className="space-y-0.5">
                    
                    <SettingsRow
                      icon={<Compass className="w-4.5 h-4.5" />}
                      iconColor="bg-gold-500/10 text-gold-500"
                      label="Home Dashboard"
                      onPress={() => { setActiveTab('home'); setIsDrawerOpen(false); }}
                      trailing={<ChevronRight className="w-4 h-4 text-theme-text-muted" />}
                    />

                    <SettingsRow
                      icon={<User className="w-4.5 h-4.5" />}
                      iconColor="bg-gold-500/10 text-gold-500"
                      label="My Profile & Pass"
                      onPress={() => { setActiveTab('profile'); setIsDrawerOpen(false); }}
                      trailing={<ChevronRight className="w-4 h-4 text-theme-text-muted" />}
                    />

                    {/* Expandable Church Structure Accordion */}
                    <div className="border-b border-theme-border">
                      <button
                        onClick={() => setIsStructureExpanded(!isStructureExpanded)}
                        className="w-full h-14 flex items-center justify-between px-3 hover:bg-theme-text/5 transition-colors cursor-pointer text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full flex items-center justify-center bg-cathedral-500/10 text-cathedral-400">
                            <Users className="w-4.5 h-4.5" />
                          </div>
                          <span className={`${Typography.BODY} text-theme-text`}>
                            Church Structure
                          </span>
                        </div>
                        {isStructureExpanded ? <ChevronUp className="w-4 h-4 text-theme-text-muted" /> : <ChevronDown className="w-4 h-4 text-theme-text-muted" />}
                      </button>

                      <AnimatePresence>
                        {isStructureExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="pl-12 bg-theme-text/[0.01] overflow-hidden"
                          >
                            <div className="py-1.5 space-y-2 text-xs font-semibold text-theme-text-secondary">
                              <button onClick={() => { setActiveTab('saints'); setIsDrawerOpen(false); }} className="block py-1.5 hover:text-gold-500 transition-colors">Members Directory</button>
                              <button onClick={() => { setActiveTab('cells'); setIsDrawerOpen(false); }} className="block py-1.5 hover:text-gold-500 transition-colors">Cell Groups (Cells)</button>
                              <button onClick={() => { setActiveTab('saints'); setIsDrawerOpen(false); }} className="block py-1.5 hover:text-gold-500 transition-colors">Sections & Pastors</button>
                              <button onClick={() => { setActiveTab('saints'); setIsDrawerOpen(false); }} className="block py-1.5 hover:text-gold-500 transition-colors">Ministries & Staff</button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    <SettingsRow
                      icon={<BookOpen className="w-4.5 h-4.5" />}
                      iconColor="bg-gold-500/10 text-gold-500"
                      label="Training Academy"
                      onPress={() => { setActiveTab('academy'); setIsDrawerOpen(false); }}
                      trailing={<ChevronRight className="w-4 h-4 text-theme-text-muted" />}
                    />

                    <SettingsRow
                      icon={<Heart className="w-4.5 h-4.5" />}
                      iconColor="bg-cathedral-500/10 text-cathedral-400"
                      label="Prayers Hub"
                      onPress={() => { setActiveTab('prayers'); setIsDrawerOpen(false); }}
                      trailing={<ChevronRight className="w-4 h-4 text-theme-text-muted" />}
                    />

                    <SettingsRow
                      icon={<Activity className="w-4.5 h-4.5" />}
                      iconColor="bg-gold-500/10 text-gold-500"
                      label="Reports & Analytics"
                      onPress={() => { setActiveTab('reports'); setIsDrawerOpen(false); }}
                      trailing={<ChevronRight className="w-4 h-4 text-theme-text-muted" />}
                    />

                    <SettingsRow
                      icon={<Megaphone className="w-4.5 h-4.5" />}
                      iconColor="bg-gold-500/10 text-gold-500"
                      label="Announcements Feed"
                      onPress={() => { setActiveTab('announcements'); setIsDrawerOpen(false); }}
                      trailing={<ChevronRight className="w-4 h-4 text-theme-text-muted" />}
                    />

                    <SettingsRow
                      icon={<Bell className="w-4.5 h-4.5" />}
                      iconColor="bg-gold-500/10 text-gold-500"
                      label="Communication Hub"
                      onPress={() => { setActiveTab('communication'); setIsDrawerOpen(false); }}
                      trailing={<ChevronRight className="w-4 h-4 text-theme-text-muted" />}
                    />

                    <SettingsRow
                      icon={<Settings className="w-4.5 h-4.5" />}
                      iconColor="bg-surface-300 text-theme-text-secondary"
                      label="System Settings"
                      onPress={() => { triggerHaptic(); setActiveTab('profile'); setIsDrawerOpen(false); }}
                      trailing={<ChevronRight className="w-4 h-4 text-theme-text-muted" />}
                    />

                  </div>

                </div>

                {/* Bottom Footer Credits */}
                <div className="pt-4 border-t border-theme-border text-center">
                  <p className="text-[10px] font-bold text-theme-text-muted">
                    ChurchConnect v2.0
                  </p>
                  <p className="text-[9px] font-mono text-[#5A5A64] mt-0.5">
                    High-Fidelity Offline Sync Engine
                  </p>
                </div>

              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* ==========================================
            DEV SIMULATOR (Environment-Gated Floating Pill)
           ========================================== */}
        {ENABLE_ROLE_SIMULATOR && <div className="absolute bottom-[calc(var(--bottom-nav-height)+var(--bottom-nav-safe)+0.75rem)] md:bottom-[92px] right-4 z-40">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => { triggerHaptic(); setShowRoleSelector(true); }}
            className="h-9 px-3.5 rounded-full bg-surface-300/80 hover:bg-surface-300 backdrop-blur border border-gold-500/30 hover:border-gold-500/60 shadow-lg flex items-center justify-center gap-1.5 text-[10px] font-mono font-bold text-gold-400 tracking-wider cursor-pointer"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-gold-500 animate-pulse"></span>
            <span>DEV MODE</span>
          </motion.button>
        </div>}

        {/* ==========================================
            DEV ROLE SELECTOR (BottomSheet)
           ========================================== */}
        {ENABLE_ROLE_SIMULATOR && <BottomSheet
          isOpen={showRoleSelector}
          onClose={() => setShowRoleSelector(false)}
          title="Simulator Settings"
        >
          <div className="space-y-4 pb-6">
            <p className="text-xs text-theme-text-secondary font-semibold leading-relaxed">
              Dynamically switch between ChurchConnect's 7 user roles to view custom role-specific dashboards, sync workflows, and layouts.
            </p>

            <div className="space-y-2">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#5A5A64]">
                Active Role Selector
              </span>
              <div className="space-y-1.5">
                {ROLES.map((role, idx) => {
                  const isCurrent = idx === currentRoleIndex;
                  return (
                    <button
                      key={role.id}
                      onClick={async () => {
                        triggerHaptic();
                        setCurrentRoleIndex(idx);
                        
                        setShowRoleSelector(false);
                      }}
                      className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        isCurrent
                          ? 'bg-gold-500/10 border-gold-500 text-gold-500'
                          : 'bg-theme-card border-theme-border text-theme-text hover:bg-theme-text/5'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-extrabold">{role.name}</span>
                          <AccentBadge label={role.label} variant={role.isAdmin ? 'gold' : 'muted'} size="sm" />
                        </div>
                        <p className="text-[11px] text-theme-text-secondary mt-0.5">{role.department}</p>
                      </div>
                      {isCurrent && <Check className="w-4.5 h-4.5 text-gold-500 flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-2">
              <div className="space-y-2">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#5A5A64] block">
                  Security
                </span>
                <button
                  onClick={async () => {
                    triggerHaptic();
                    setShowRoleSelector(false);
                    await logout();
                  }}
                  className="w-full py-2.5 rounded-pill border border-red-500/20 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-bold text-center cursor-pointer transition-colors"
                >
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        </BottomSheet>}

        <BottomSheet
          isOpen={isSyncStatusOpen}
          onClose={() => setIsSyncStatusOpen(false)}
          title="Synchronization"
        >
          <div className="space-y-4 pb-7">
            <div className={`rounded-card border p-4 ${failedChanges ? 'border-cathedral-500/30 bg-cathedral-500/10' : 'border-gold-500/20 bg-gold-500/5'}`}>
              <div className="flex items-start gap-3">
                {!isOnline || failedChanges ? (
                  <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-cathedral-400" />
                ) : pendingChanges || isSyncing ? (
                  <RefreshCw className={`mt-0.5 h-5 w-5 flex-shrink-0 text-gold-500 ${isSyncing ? 'animate-spin' : ''}`} />
                ) : (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-semantic-success" />
                )}
                <div className="min-w-0">
                  <h4 className="text-sm font-black text-theme-text">
                    {!isOnline ? 'Device is offline' : failedChanges ? 'Changes need attention' : pendingChanges || isSyncing ? 'PocketBase acknowledgement pending' : 'PocketBase confirmed'}
                  </h4>
                  <p className="mt-1 text-[11px] leading-relaxed text-theme-text-secondary">{syncMessage}</p>
                  {lastAcknowledgedAt && !pendingChanges && !failedChanges && (
                    <p className="mt-1.5 text-[9px] font-mono text-theme-text-muted">
                      Last confirmed {new Date(lastAcknowledgedAt).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {syncItems.length > 0 && (
              <div className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-theme-text-muted">Saved operations</span>
                {syncItems.map((item) => (
                  <div key={item.operationId} className="rounded-xl border border-theme-border bg-theme-card p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-bold capitalize text-theme-text">{item.command.replaceAll('_', ' ')}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${item.status === 'failed' ? 'bg-cathedral-500/10 text-cathedral-400' : 'bg-gold-500/10 text-gold-500'}`}>
                        {item.status === 'processing' ? 'Sending' : item.status}
                      </span>
                    </div>
                    {item.lastError && <p className="mt-1.5 text-[10px] leading-relaxed text-cathedral-400">{item.lastError}</p>}
                    <p className="mt-1 text-[9px] text-theme-text-muted">Attempts: {item.attempts}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              {failedChanges > 0 && (
                <button
                  type="button"
                  onClick={() => void retryFailed()}
                  disabled={!isOnline || isSyncing}
                  className="flex-1 rounded-pill bg-cathedral-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"
                >
                  Retry rejected changes
                </button>
              )}
              {failedChanges === 0 && pendingChanges > 0 && (
                <button
                  type="button"
                  onClick={() => void syncNow()}
                  disabled={!isOnline || isSyncing}
                  className="flex-1 rounded-pill bg-gold-500 px-4 py-2.5 text-xs font-black text-black disabled:opacity-50"
                >
                  {isSyncing ? 'Synchronizing…' : 'Synchronize now'}
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsSyncStatusOpen(false)}
                className="flex-1 rounded-pill bg-theme-bg-secondary px-4 py-2.5 text-xs font-black text-theme-text-secondary"
              >
                Close
              </button>
            </div>
          </div>
        </BottomSheet>

        {/* ==========================================
            NOTIFICATION CENTER (BottomSheet)
           ========================================== */}
        <BottomSheet
          isOpen={isNotificationsOpen}
          onClose={() => setIsNotificationsOpen(false)}
          title="Notification Center"
          detents={['full']}
        >
          <div className="pb-8 max-h-[75vh] overflow-y-auto">
            <NotificationSystem 
              onActiveTabChange={setActiveTab}
              onClose={() => setIsNotificationsOpen(false)}
            />
          </div>
        </BottomSheet>


      </div>
    </div>
  );
}
