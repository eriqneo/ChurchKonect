import React, { useState, useEffect, useRef } from 'react';
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
  QrCode, 
  Plus, 
  FileText, 
  MapPin, 
  Calendar, 
  ChevronRight, 
  Flame, 
  ShieldAlert,
  Send,
  Sliders,
  Settings,
  Megaphone,
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
import { useNotifications } from '../../lib/db/hooks';
import { useAuth } from '../../lib/db/PocketBaseProvider';



// ==========================================
// 7 Role Definitions
// ==========================================
export const ROLES = [
  { id: 'lead_pastor', label: 'Lead Pastor', name: 'Pastor David', avatarText: 'PD', department: 'Executive Clergy', isAdmin: true },
  { id: 'admin', label: 'Administrator', name: 'Sarah Jenkins', avatarText: 'SJ', department: 'Operations & Finance', isAdmin: true },
  { id: 'cell_leader', label: 'Cell Leader', name: 'Brother Michael', avatarText: 'BM', department: 'Hope Cell Group', isAdmin: false },
  { id: 'district_pastor', label: 'District Pastor', name: 'Pastor Abraham', avatarText: 'PA', department: 'North District', isAdmin: true },
  { id: 'department_head', label: 'Department Head', name: 'Sister Grace', avatarText: 'SG', department: 'Worship Ministry', isAdmin: false },
  { id: 'member', label: 'Regular Member', name: 'John Doe', avatarText: 'JD', department: 'General Congregation', isAdmin: false },
  { id: 'guest', label: 'Guest / Seeker', name: 'visitor_492', avatarText: 'VS', department: 'First-time Welcome', isAdmin: false }
];

export function MobileLayout() {
  const { theme, toggleTheme, isDark } = useTheme();
  const { user, login, logout } = useAuth();

  // Navigation and State
  const [activeTab, setActiveTab] = useState<string>('home');
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [currentRoleIndex, setCurrentRoleIndex] = useState<number>(0);

  // Synchronize currentRoleIndex with active authenticated user
  useEffect(() => {
    if (user) {
      const idx = ROLES.findIndex(r => r.id === user.role || (r.id === 'admin' && user.role === 'administrator'));
      if (idx !== -1) {
        setCurrentRoleIndex(idx);
      }
    }
  }, [user]);

  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [pendingChanges, setPendingChanges] = useState<number>(0);
  const [scrolled, setScrolled] = useState<boolean>(false);
  const [notifications, setNotifications] = useState<number>(3);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  
  // Custom expandable state for drawer accordion
  const [isStructureExpanded, setIsStructureExpanded] = useState<boolean>(false);

  // Bottom Sheets & Modals
  const [showRoleSelector, setShowRoleSelector] = useState<boolean>(false);
  const [showQRModal, setShowQRModal] = useState<boolean>(false);
  const [showPrayerForm, setShowPrayerForm] = useState<boolean>(false);
  const [showAttendanceForm, setShowAttendanceForm] = useState<boolean>(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState<boolean>(false);


  // Search filter
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Dynamic States for Interactive Features
  const [prayers, setPrayers] = useState([
    { id: '1', author: 'Sister Clara', request: 'Healing for my mother who is undergoing surgery tomorrow morning.', category: 'Healing', amens: 24, hasAmened: false },
    { id: '2', author: 'Brother Timothy', request: 'Seeking guidance and divine wisdom in career choices and transition.', category: 'Guidance', amens: 18, hasAmened: false },
    { id: '3', author: 'Sister Martha', request: 'Praising God for the breakthrough in our regional cell group expansion!', category: 'Thanksgiving', amens: 35, hasAmened: false }
  ]);

  const [newPrayerText, setNewPrayerText] = useState<string>('');
  const [newPrayerCategory, setNewPrayerCategory] = useState<string>('Guidance');

  const [cellMembers, setCellMembers] = useState([
    { id: 'm1', name: 'Benjamin Cole', present: true },
    { id: 'm2', name: 'Diana Ross', present: true },
    { id: 'm3', name: 'Felix Thorne', present: false },
    { id: 'm4', name: 'Abigail Smith', present: true },
    { id: 'm5', name: 'Hannah Abbott', present: false }
  ]);

  // Handle Online/Offline Status
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Simulate sync completing
      setTimeout(() => {
        setPendingChanges(0);
      }, 2500);
    };
    const handleOffline = () => {
      setIsOnline(false);
      setPendingChanges((prev) => (prev === 0 ? 2 : prev));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check
    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const currentRole = ROLES[currentRoleIndex];
  
  const activeUserId = currentRole.id === 'lead_pastor' ? 'user-pastor-david' : 
                       currentRole.id === 'admin' ? 'user-admin-sarah' :
                       currentRole.id === 'cell_leader' ? 'user-cell-leader-michael' : 'user-member-clara';
  const { unreadCount: activeUnreadCount } = useNotifications(activeUserId);

  // Detect scroll to style the header glassmorphism
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (e.currentTarget.scrollTop > 20) {
      if (!scrolled) setScrolled(true);
    } else {
      if (scrolled) setScrolled(false);
    }
  };

  // Sync Bell Indicator Color
  const getSyncIndicatorColor = () => {
    if (!isOnline) return 'bg-cathedral-500'; // Offline/failed indicator
    if (pendingChanges > 0) return 'bg-gold-500 animate-glow-pulse'; // Syncing
    return 'bg-[#7BC47F]'; // Synced
  };

  const handleAmen = (id: string) => {
    setPrayers(prev => prev.map(p => {
      if (p.id === id) {
        return {
          ...p,
          amens: p.hasAmened ? p.amens - 1 : p.amens + 1,
          hasAmened: !p.hasAmened
        };
      }
      return p;
    }));

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(20);
    }
  };

  const submitPrayer = () => {
    if (!newPrayerText.trim()) return;
    const newReq = {
      id: Date.now().toString(),
      author: currentRole.name,
      request: newPrayerText,
      category: newPrayerCategory,
      amens: 0,
      hasAmened: false
    };
    setPrayers([newReq, ...prayers]);
    setNewPrayerText('');
    setShowPrayerForm(false);
    
    // Increment pending changes if offline
    if (!isOnline) {
      setPendingChanges(prev => prev + 1);
    }
  };

  const toggleAttendance = (memberId: string) => {
    setCellMembers(prev => prev.map(m => {
      if (m.id === memberId) {
        return { ...m, present: !m.present };
      }
      return m;
    }));
  };

  const saveAttendance = () => {
    setShowAttendanceForm(false);
    if (!isOnline) {
      setPendingChanges(prev => prev + 1);
    }
    alert(`Attendance saved: ${cellMembers.filter(m => m.present).length} present, ${cellMembers.filter(m => !m.present).length} absent.`);
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
        
        {/* Quick Simulator Launcher */}
        <button
          onClick={() => setShowRoleSelector(true)}
          className="flex items-center gap-1.5 px-3 py-1 bg-gold-500/10 text-gold-500 border border-gold-500/20 rounded-full text-xs font-semibold hover:bg-gold-500/20 transition-all cursor-pointer"
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Simulate Roles</span>
        </button>

        {/* Offline Toggle Simulator */}
        <button
          onClick={() => {
            if (isOnline) {
              setIsOnline(false);
              setPendingChanges(2);
            } else {
              setIsOnline(true);
              setTimeout(() => setPendingChanges(0), 1500);
            }
          }}
          className={`flex items-center gap-1.5 px-3 py-1 border rounded-full text-xs font-semibold transition-all cursor-pointer ${
            isOnline 
              ? 'bg-[#7BC47F]/10 text-[#7BC47F] border-[#7BC47F]/20 hover:bg-[#7BC47F]/20'
              : 'bg-cathedral-500/10 text-cathedral-400 border-cathedral-500/20 hover:bg-cathedral-500/20'
          }`}
        >
          {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
          <span>{isOnline ? 'Network: Online' : 'Network: Offline'}</span>
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
          className={`absolute top-0 md:top-10 left-0 right-0 min-h-14 pt-[var(--safe-top)] md:pt-0 px-4 flex items-center justify-between z-40 transition-all duration-300 ${
            scrolled
              ? 'bg-white/70 dark:bg-surface-100/70 backdrop-blur-md border-b border-theme-border shadow-sm'
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
          className="flex-1 overflow-y-auto pt-[calc(3.5rem+var(--safe-top))] pb-[calc(var(--bottom-nav-height)+var(--safe-bottom)+0.75rem)] md:pt-24 md:pb-28 px-4 relative z-10 scrollbar-thin scroll-smooth"
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
                  </div>

                  {/* Motivational Quote / Scripture Card (Inspired by Quote of Day) */}
                  <ScriptureCard
                    text="Your word is a lamp for my feet, a light on my path."
                    reference="Psalm 119:105"
                  />

                  {/* Role-Specific Hero Banner */}
                  {currentRole.id === 'lead_pastor' || currentRole.id === 'district_pastor' ? (
                    <HeroCard
                      eyebrow="Pastor's Portal"
                      title="Sunday Gathering Prep"
                      subtitle="Confirm sermon notes, review leader reports, and inspect weekly offerings."
                      actionLabel="Review Agenda"
                      onAction={() => alert('Opening sermon agenda notes...')}
                    />
                  ) : currentRole.id === 'cell_leader' ? (
                    <HeroCard
                      eyebrow="Cell Ministry"
                      title="Take Attendance Today"
                      subtitle="Log today's member responses for the Hope Fellowship gathering."
                      actionLabel="Log Response"
                      onAction={() => setShowAttendanceForm(true)}
                    />
                  ) : currentRole.id === 'guest' ? (
                    <HeroCard
                      eyebrow="New to Church?"
                      title="The First Steps Alpha"
                      subtitle="Join our digital companion class this Thursday to study the foundations of faith."
                      actionLabel="Enroll Now"
                      onAction={() => alert('Thank you! You are registered for Alpha.')}
                    />
                  ) : (
                    <HeroCard
                      eyebrow="This Sunday"
                      title="School of Leaders 1"
                      subtitle="Module 3 study materials are now available in your personal Academy vault."
                      actionLabel="Go to Academy"
                      onAction={() => setActiveTab('academy')}
                    />
                  )}

                  {/* Pending Actions Section */}
                  <div>
                    <SectionTitle title="Pending Actions" />
                    <div className="space-y-2.5">
                      {currentRole.isAdmin || currentRole.id === 'lead_pastor' ? (
                        <>
                          <GlassCard 
                            pressable={true}
                            onPress={() => { triggerHaptic(); setActiveTab('reports'); }}
                            className="p-3 flex items-center justify-between border-l-4 border-l-cathedral-500 cursor-pointer hover:bg-theme-text/5"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-cathedral-500/10 text-cathedral-400 flex items-center justify-center font-bold text-xs flex-shrink-0">
                                2
                              </div>
                              <div>
                                <h4 className="text-xs font-bold text-theme-text">Cell Reports Pending Approval</h4>
                                <p className="text-[10px] text-theme-text-secondary mt-0.5">Review Hope & Faith fellowship submissions</p>
                              </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-theme-text-muted flex-shrink-0" />
                          </GlassCard>

                          <GlassCard 
                            pressable={true}
                            onPress={() => { triggerHaptic(); alert('Sermon Outline Review: Open PDF outline'); }}
                            className="p-3 flex items-center justify-between border-l-4 border-l-gold-500 cursor-pointer hover:bg-theme-text/5"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-gold-500/10 text-gold-500 flex items-center justify-center font-bold text-xs flex-shrink-0">
                                1
                              </div>
                              <div>
                                <h4 className="text-xs font-bold text-theme-text">Review Sunday Sermon Notes</h4>
                                <p className="text-[10px] text-theme-text-secondary mt-0.5">District Sermon Outline for July 5th</p>
                              </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-theme-text-muted flex-shrink-0" />
                          </GlassCard>
                        </>
                      ) : currentRole.id === 'cell_leader' ? (
                        <GlassCard 
                          pressable={true}
                          onPress={() => { triggerHaptic(); setActiveTab('reports'); }}
                          className="p-3 flex items-center justify-between border-l-4 border-l-gold-500 cursor-pointer hover:bg-theme-text/5"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gold-500/10 text-gold-500 flex items-center justify-center font-bold text-xs flex-shrink-0">
                              !
                            </div>
                            <div>
                              <h4 className="text-xs font-bold text-theme-text">Submit Weekly Cell Report</h4>
                              <p className="text-[10px] text-theme-text-secondary mt-0.5">Due today for Hope Fellowship Cell</p>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-theme-text-muted flex-shrink-0" />
                        </GlassCard>
                      ) : (
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
                              <h4 className="text-xs font-bold text-theme-text">Complete Academy Module 3</h4>
                              <p className="text-[10px] text-theme-text-secondary mt-0.5">School of Leaders 1 course progress</p>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-theme-text-muted flex-shrink-0" />
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
                      markedDates={{
                        '2026-07-01': 'complete',
                        '2026-07-03': 'partial',
                        '2026-07-05': 'complete'
                      }}
                    />
                  </div>

                  {/* Stats Block Metrics (Replicating Workout patterns) */}
                  <div>
                    <SectionTitle title="Durable Metrics" />
                    <div className="grid grid-cols-2 gap-3">
                      {currentRole.isAdmin || currentRole.id === 'lead_pastor' ? (
                        <>
                          <StatBlock
                            icon={<Users className="w-4 h-4" />}
                            value="432"
                            label="Worship Attendants"
                            trend={{ direction: 'up', value: '+12%' }}
                            highlight={true}
                          />
                          <StatBlock
                            icon={<Flame className="w-4 h-4" />}
                            value="18"
                            label="Active Cells"
                            trend={{ direction: 'up', value: '3 new' }}
                          />
                        </>
                      ) : (
                        <>
                          <StatBlock
                            icon={<Sparkles className="w-4 h-4" />}
                            value="12"
                            label="Prayer Streaks"
                            trend={{ direction: 'up', value: 'Lv.3' }}
                            highlight={true}
                          />
                          <StatBlock
                            icon={<BookOpen className="w-4 h-4" />}
                            value="84%"
                            label="Academy Progress"
                            trend={{ direction: 'up', value: '8/10' }}
                          />
                        </>
                      )}
                    </div>
                  </div>

                  {/* Gatherings Schedule (inspired by picks for you list) */}
                  <div>
                    <SectionTitle title="Today's Gathers" />
                    <ContentRow
                      title="Sunday Grace Gathering"
                      subtitle="Sanctuary • Main preach"
                      meta="10:00 AM · Full Congregation"
                      onPress={() => alert('Worship service details')}
                    />
                    <ContentRow
                      title="Youth Praise & Study"
                      subtitle="West Chapel • High energy praise"
                      meta="04:30 PM · Youth ministry"
                      onPress={() => alert('Youth ministry details')}
                    />
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
                  onNotificationCountChange={setNotifications} 
                  isStandalone={true}
                  onCloseStandalone={() => setActiveTab('home')}
                />
              )}


            </motion.div>
          </AnimatePresence>
        </div>

        {/* ==========================================
            OFFLINE BANNER (Conditional above tab bar)
           ========================================== */}
        <AnimatePresence>
          {(!isOnline || pendingChanges > 0) && (
            <motion.div
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              className={`absolute bottom-[calc(var(--bottom-nav-height)+var(--safe-bottom))] md:bottom-20 left-0 right-0 h-9 z-40 flex items-center justify-between px-5 transition-all ${
                !isOnline 
                  ? 'bg-cathedral-900 text-white border-t border-cathedral-800' 
                  : 'bg-[#7BC47F] text-black border-t border-[#6BB36E]'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 relative">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${!isOnline ? 'bg-cathedral-400' : 'bg-white'}`}></span>
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${!isOnline ? 'bg-cathedral-500' : 'bg-white'}`}></span>
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider">
                  {!isOnline 
                    ? `Working offline · ${pendingChanges} changes pending` 
                    : 'Reconnected! Synchronizing catalog...'}
                </span>
              </div>
              <span className="text-[9px] font-mono opacity-80">cc_offline_v2</span>
            </motion.div>
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
                              <button onClick={() => alert('Viewing Clergy Districts')} className="block py-1.5 hover:text-gold-500 transition-colors">Districts & Pastors</button>
                              <button onClick={() => alert('Viewing Ministries')} className="block py-1.5 hover:text-gold-500 transition-colors">Ministries & Staff</button>
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
                      onPress={() => { triggerHaptic(); alert('Settings configuration...'); }}
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
        <div className="absolute bottom-[calc(var(--bottom-nav-height)+var(--safe-bottom)+0.75rem)] md:bottom-[92px] right-4 z-40">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => { triggerHaptic(); setShowRoleSelector(true); }}
            className="h-9 px-3.5 rounded-full bg-surface-300/80 hover:bg-surface-300 backdrop-blur border border-gold-500/30 hover:border-gold-500/60 shadow-lg flex items-center justify-center gap-1.5 text-[10px] font-mono font-bold text-gold-400 tracking-wider cursor-pointer"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-gold-500 animate-pulse"></span>
            <span>DEV MODE</span>
          </motion.button>
        </div>

        {/* ==========================================
            DEV ROLE SELECTOR (BottomSheet)
           ========================================== */}
        <BottomSheet
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
                        
                        // Dynamically login simulated user to keep PocketBase session synced
                        const emailMap: Record<string, string> = {
                          lead_pastor: 'pastor.david@churchconnect.com',
                          admin: 'sarah.admin@churchconnect.com',
                          cell_leader: 'michael.hope@churchconnect.com',
                          district_pastor: 'pastor.david@churchconnect.com',
                          department_head: 'michael.hope@churchconnect.com',
                          member: 'clara.saints@churchconnect.com',
                          guest: 'clara.saints@churchconnect.com'
                        };
                        const targetEmail = emailMap[role.id] || 'clara.saints@churchconnect.com';
                        try {
                          await login(targetEmail);
                        } catch (e) {
                          console.error('Failed to sync login:', e);
                        }
                        
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

            <div className="pt-2 grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#5A5A64] block">
                  Offline Simulator
                </span>
                <button
                  onClick={() => {
                    triggerHaptic();
                    if (isOnline) {
                      setIsOnline(false);
                      setPendingChanges(2);
                    } else {
                      setIsOnline(true);
                      setTimeout(() => setPendingChanges(0), 1500);
                    }
                  }}
                  className={`w-full py-2.5 rounded-pill border text-xs font-bold text-center cursor-pointer transition-colors ${
                    isOnline 
                      ? 'bg-cathedral-500/10 text-cathedral-400 border-cathedral-500/25 hover:bg-cathedral-500/20' 
                      : 'bg-[#7BC47F]/15 text-[#7BC47F] border-[#7BC47F]/25'
                  }`}
                >
                  {isOnline ? 'Go Offline' : 'Go Online (Auto-Sync)'}
                </button>
              </div>

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
        </BottomSheet>

        {/* ==========================================
            QR SCANNER SIMULATOR MODAL (BottomSheet Detent)
           ========================================== */}
        <BottomSheet
          isOpen={showQRModal}
          onClose={() => setShowQRModal(false)}
          title="Academy QR check-in"
        >
          <div className="space-y-5 pb-6 text-center">
            <p className="text-xs text-theme-text-secondary font-medium leading-relaxed">
              Scan the classroom QR Board to record attendance and unlock course materials automatically.
            </p>

            {/* Simulated camera scanning window box */}
            <div className="w-56 h-56 mx-auto relative border-2 border-gold-500/30 rounded-2xl bg-black overflow-hidden flex items-center justify-center shadow-inner">
              
              {/* Corner framing indicators */}
              <div className="absolute top-3 left-3 w-4 h-4 border-t-2 border-l-2 border-gold-500"></div>
              <div className="absolute top-3 right-3 w-4 h-4 border-t-2 border-r-2 border-gold-500"></div>
              <div className="absolute bottom-3 left-3 w-4 h-4 border-b-2 border-l-2 border-gold-500"></div>
              <div className="absolute bottom-3 right-3 w-4 h-4 border-b-2 border-r-2 border-gold-500"></div>

              {/* Glowing Scan Line Animation */}
              <motion.div
                animate={{ y: ['-100%', '100%'] }}
                transition={{ repeat: Infinity, duration: 2.2, ease: 'linear' }}
                className="absolute top-0 left-0 right-0 h-1 bg-gold-500 shadow-[0_0_15px_rgba(200,164,92,0.8)] opacity-60 pointer-events-none"
              />

              <div className="flex flex-col items-center justify-center opacity-40">
                <QrCode className="w-24 h-24 text-white" />
                <span className="text-[10px] font-mono text-white mt-1">ALIGN QR CODE</span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#7BC47F] animate-pulse"></span>
              <span className="text-[10px] font-bold text-theme-text-secondary uppercase tracking-wider">
                Awaiting Check-in...
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-4">
              <button
                onClick={() => {
                  triggerHaptic();
                  setShowQRModal(false);
                  setTimeout(() => {
                    alert('Attendance Check-In Completed Successfully! Course credit logged.');
                  }, 300);
                }}
                className="py-2 rounded-pill bg-[#C8A45C] text-black font-extrabold text-xs cursor-pointer shadow-sm"
              >
                Simulate Scan
              </button>
              <button
                onClick={() => setShowQRModal(false)}
                className="py-2 rounded-pill bg-theme-text/5 text-theme-text-secondary font-bold text-xs cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </BottomSheet>

        {/* ==========================================
            SUBMIT PRAYER REQUEST FORM (BottomSheet)
           ========================================== */}
        <BottomSheet
          isOpen={showPrayerForm}
          onClose={() => setShowPrayerForm(false)}
          title="Submit Prayer Request"
        >
          <div className="space-y-4 pb-6">
            <p className="text-xs text-theme-text-secondary font-medium">
              Share your request with the congregation or lead elders for dedicated intercessory circles.
            </p>

            <div className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-widest text-theme-text-muted">
                Your Petition
              </span>
              <textarea
                placeholder="Write your prayer request..."
                value={newPrayerText}
                onChange={(e) => setNewPrayerText(e.target.value)}
                className="w-full h-28 p-3 rounded-card bg-theme-bg border border-theme-border focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500 text-sm text-theme-text outline-none resize-none font-medium placeholder-theme-text-muted"
              />
            </div>

            <div className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-widest text-theme-text-muted">
                Category
              </span>
              <div className="grid grid-cols-3 gap-2">
                {['Guidance', 'Healing', 'Thanksgiving'].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setNewPrayerCategory(cat)}
                    className={`py-2 px-1 text-xs font-bold border rounded-lg text-center cursor-pointer transition-colors ${
                      newPrayerCategory === cat
                        ? 'bg-gold-500/10 border-gold-500 text-gold-500'
                        : 'bg-theme-card border-theme-border text-theme-text-secondary hover:bg-theme-text/5'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-2 flex gap-2">
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={submitPrayer}
                className="flex-1 py-2.5 rounded-pill bg-gold-500 text-black font-extrabold text-xs cursor-pointer shadow-glow-gold text-center flex items-center justify-center gap-1"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Submit Request</span>
              </motion.button>
              <button
                onClick={() => setShowPrayerForm(false)}
                className="px-4 py-2.5 rounded-pill bg-theme-text/5 text-theme-text-secondary font-bold text-xs cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </BottomSheet>

        {/* ==========================================
            TAKE CELL ATTENDANCE FORM (BottomSheet)
           ========================================== */}
        <BottomSheet
          isOpen={showAttendanceForm}
          onClose={() => setShowAttendanceForm(false)}
          title="Take Hope Cell Attendance"
        >
          <div className="space-y-4 pb-6">
            <p className="text-xs text-theme-text-secondary font-medium leading-relaxed">
              Mark the present cell guides and attendants for the regional house fellowship.
            </p>

            <div className="space-y-2">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-theme-text-muted block">
                Cell Members
              </span>

              <div className="space-y-2 bg-theme-bg border border-theme-border rounded-card overflow-hidden">
                {cellMembers.map((member) => (
                  <div key={member.id} className="flex items-center justify-between p-3 border-b border-theme-border">
                    <span className="text-sm font-bold text-theme-text">
                      {member.name}
                    </span>

                    <button
                      onClick={() => toggleAttendance(member.id)}
                      className={`px-3 py-1.5 rounded-pill text-xs font-bold border transition-colors cursor-pointer ${
                        member.present
                          ? 'bg-[#7BC47F]/10 text-[#7BC47F] border-[#7BC47F]/45'
                          : 'bg-transparent text-theme-text-muted border-theme-border'
                      }`}
                    >
                      {member.present ? 'Present' : 'Absent'}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 flex gap-2">
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={saveAttendance}
                className="flex-1 py-2.5 rounded-pill bg-[#C8A45C] text-black font-extrabold text-xs cursor-pointer shadow-sm text-center"
              >
                Save Attendance
              </motion.button>
              <button
                onClick={() => setShowAttendanceForm(false)}
                className="px-4 py-2.5 rounded-pill bg-theme-text/5 text-theme-text-secondary font-bold text-xs cursor-pointer"
              >
                Cancel
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
              currentRole={currentRole}
              onActiveTabChange={setActiveTab}
              onClose={() => setIsNotificationsOpen(false)}
            />
          </div>
        </BottomSheet>


      </div>
    </div>
  );
}
