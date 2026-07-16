import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import * as Typography from '../../lib/theme/typography';
import {
  GlassCard,
  AccentBadge,
  SearchField,
  ContentRow,
  BottomSheet,
  SectionTitle,
  Avatar,
  SwipeableRow
} from '../shared';
import { staggerChildren } from '../../lib/animations';
import { 
  Users, 
  Check, 
  Plus, 
  ChevronDown, 
  ChevronUp, 
  ChevronRight, 
  X, 
  Sparkles, 
  Music, 
  Monitor, 
  Flame, 
  Baby, 
  SlidersHorizontal,
  Mail,
  Phone,
  MessageSquare,
  ShieldCheck,
  UserCheck,
  Building,
  MapPin,
  Calendar,
  AlertCircle
} from 'lucide-react';

// ==========================================
// Mock Data Configurations
// ==========================================

export interface Member {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  roleId: 'lead_pastor' | 'admin' | 'cell_leader' | 'district_pastor' | 'department_head' | 'member' | 'guest';
  department: string;
  joinedDate: string; // YYYY-MM-DD
}

const INITIAL_MEMBERS: Member[] = [
  { id: 'm1', name: 'Pastor David', email: 'david@church.org', phone: '+1 (555) 019-2831', role: 'Lead Pastor', roleId: 'lead_pastor', department: 'Executive Clergy', joinedDate: '2015-08-15' },
  { id: 'm2', name: 'Sarah Jenkins', email: 'sarah@church.org', phone: '+1 (555) 012-9988', role: 'Administrator', roleId: 'admin', department: 'Operations & Finance', joinedDate: '2018-02-10' },
  { id: 'm3', name: 'Brother Michael', email: 'michael@hope.org', phone: '+1 (555) 014-4422', role: 'Cell Leader', roleId: 'cell_leader', department: 'Hope Cell Group', joinedDate: '2019-11-04' },
  { id: 'm4', name: 'Pastor Abraham', email: 'abraham@north.org', phone: '+1 (555) 017-5500', role: 'District Pastor', roleId: 'district_pastor', department: 'North District', joinedDate: '2016-05-20' },
  { id: 'm5', name: 'Sister Grace', email: 'grace@worship.org', phone: '+1 (555) 011-7711', role: 'Department Head', roleId: 'department_head', department: 'Worship Ministry', joinedDate: '2017-09-01' },
  { id: 'm6', name: 'John Doe', email: 'john.doe@gmail.com', phone: '+1 (555) 013-3344', role: 'Regular Member', roleId: 'member', department: 'General Congregation', joinedDate: '2021-04-12' },
  { id: 'm7', name: 'Sister Clara', email: 'clara.s@gmail.com', phone: '+1 (555) 016-8899', role: 'Regular Member', roleId: 'member', department: 'Worship Ministry', joinedDate: '2020-01-25' },
  { id: 'm8', name: 'Brother Timothy', email: 'timothy.b@gmail.com', phone: '+1 (555) 015-2277', role: 'Regular Member', roleId: 'member', department: 'Hope Cell Group', joinedDate: '2022-07-15' },
  { id: 'm9', name: 'Sister Martha', email: 'martha.m@gmail.com', phone: '+1 (555) 018-1122', role: 'Regular Member', roleId: 'member', department: 'Youth Ministry', joinedDate: '2023-03-10' },
  { id: 'm10', name: 'visitor_492', email: 'visitor492@welcome.com', phone: '+1 (555) 010-0099', role: 'Guest / Seeker', roleId: 'guest', department: 'First-time Welcome', joinedDate: '2026-06-28' }
];

interface Cell {
  id: string;
  name: string;
  leader: string;
  memberCount: number;
  status: 'Active' | 'Pending Report' | 'Missed';
}

const INITIAL_CELLS: Cell[] = [
  { id: 'c1', name: 'Alpha Cell', leader: 'Brother Michael', memberCount: 8, status: 'Active' },
  { id: 'c2', name: 'Hope Fellowship', leader: 'Sister Clara', memberCount: 6, status: 'Pending Report' },
  { id: 'c3', name: 'North Youth Rock', leader: 'Brother Timothy', memberCount: 5, status: 'Missed' }
];

interface District {
  id: string;
  name: string;
  pastor: string;
  cellCount: number;
  cells: string[];
}

const INITIAL_DISTRICTS: District[] = [
  { id: 'd1', name: 'North District', pastor: 'Pastor Abraham', cellCount: 5, cells: ['Alpha Cell', 'Hope Fellowship', 'Grace Gather', 'Hebron House', 'Ebenezer Cell'] },
  { id: 'd2', name: 'South District', pastor: 'Pastor Stephen', cellCount: 3, cells: ['Covenant Cell', 'Faith Light', 'Zion Rock'] }
];

interface Pillar {
  id: string;
  name: string;
  head: string;
  membersCount: number;
  iconName: 'Worship' | 'Media' | 'Youth' | 'Children';
}

const INITIAL_PILLARS: Pillar[] = [
  { id: 'p1', name: 'Worship Ministry', head: 'Sister Grace', membersCount: 24, iconName: 'Worship' },
  { id: 'p2', name: 'Media & Tech', head: 'Brother Felix', membersCount: 12, iconName: 'Media' },
  { id: 'p3', name: 'Youth Ministry', head: 'Sister Martha', membersCount: 35, iconName: 'Youth' },
  { id: 'p4', name: 'Children Care', head: 'Sister Abigail', membersCount: 15, iconName: 'Children' }
];

const PILLAR_ICONS = {
  Worship: <Music className="w-6 h-6 text-gold-500" />,
  Media: <Monitor className="w-6 h-6 text-gold-500" />,
  Youth: <Flame className="w-6 h-6 text-gold-500" />,
  Children: <Baby className="w-6 h-6 text-gold-500" />
};

export function SaintsDirectory() {
  // Navigation tabs list
  const TABS = [
    { id: 'members', label: 'Members', count: 10 },
    { id: 'cells', label: 'Cells', count: 3 },
    { id: 'districts', label: 'Districts', count: 2 },
    { id: 'pillars', label: 'Pillars', count: 4 }
  ] as const;

  type TabId = typeof TABS[number]['id'];

  // Component States
  const [activeTab, setActiveTab] = useState<TabId>('members');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedQuery, setDebouncedQuery] = useState<string>('');
  
  // Storage states for full creation flows
  const [members, setMembers] = useState<Member[]>(INITIAL_MEMBERS);
  const [cells, setCells] = useState<Cell[]>(INITIAL_CELLS);
  const [districts, setDistricts] = useState<District[]>(INITIAL_DISTRICTS);
  const [pillars, setPillars] = useState<Pillar[]>(INITIAL_PILLARS);

  // Detail Modal States
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [selectedCell, setSelectedCell] = useState<Cell | null>(null);
  const [selectedPillar, setSelectedPillar] = useState<Pillar | null>(null);

  // Swipe gesture variables
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  // Accordion state (Districts) - only one open at a time
  const [openDistrictId, setOpenDistrictId] = useState<string | null>('d1');

  // Long press / Context Action Sheet states
  const [longPressedMember, setLongPressedMember] = useState<Member | null>(null);
  const pressTimerRef = useRef<NodeJS.Timeout | null>(null);

  // New item forms modal states
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMemberForm, setNewMemberForm] = useState({
    name: '',
    email: '',
    phone: '',
    roleId: 'member' as Member['roleId'],
    department: 'General Congregation'
  });

  const [showAddCell, setShowAddCell] = useState(false);
  const [newCellForm, setNewCellForm] = useState({
    name: '',
    leader: '',
    memberCount: 6,
    status: 'Active' as Cell['status']
  });

  // Filter bottom sheet state
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [roleFilter, setRoleFilter] = useState<Record<string, boolean>>({
    lead_pastor: true,
    admin: true,
    cell_leader: true,
    district_pastor: true,
    department_head: true,
    member: true,
    guest: true
  });
  const [sectionFilter, setSectionFilter] = useState<string>('All');
  const [sortOption, setSortOption] = useState<'A-Z' | 'Newest' | 'Role'>('A-Z');

  // Haptic feedback simulator
  const triggerHaptic = () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(12);
      } catch (e) {}
    }
  };

  // Toast notifier
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Debounced search query handler
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 250);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Tab change handler with haptic feedback
  const handleTabChange = (tabId: TabId) => {
    triggerHaptic();
    setActiveTab(tabId);
  };

  // Swipe detection to switch tabs
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX - touchEndX;
    const threshold = 60; // minimum distance for swipe

    const tabIds: TabId[] = ['members', 'cells', 'districts', 'pillars'];
    const currentIdx = tabIds.indexOf(activeTab);

    if (diff > threshold) {
      // swipe left -> next tab
      if (currentIdx < tabIds.length - 1) {
        handleTabChange(tabIds[currentIdx + 1]);
      }
    } else if (diff < -threshold) {
      // swipe right -> previous tab
      if (currentIdx > 0) {
        handleTabChange(tabIds[currentIdx - 1]);
      }
    }
    setTouchStartX(null);
  };

  // Alphabetical Index Scroll helper (A-Z indicator)
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const handleLetterClick = (letter: string) => {
    triggerHaptic();
    // Scroll or set search to match the starting letter of members
    setSearchQuery(letter);
    showToast(`Filtering by letter: ${letter}`);
  };

  // Long press listeners for members
  const handleMemberPressStart = (member: Member) => {
    pressTimerRef.current = setTimeout(() => {
      triggerHaptic();
      setLongPressedMember(member);
    }, 600); // long press threshold
  };

  const handleMemberPressEnd = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  // Save New Member
  const handleCreateMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemberForm.name || !newMemberForm.email) {
      showToast('Please fill in required fields');
      return;
    }
    const roleLabelMap: Record<Member['roleId'], string> = {
      lead_pastor: 'Lead Pastor',
      admin: 'Administrator',
      cell_leader: 'Cell Leader',
      district_pastor: 'District Pastor',
      department_head: 'Department Head',
      member: 'Regular Member',
      guest: 'Guest / Seeker'
    };

    const added: Member = {
      id: `m${Date.now()}`,
      name: newMemberForm.name,
      email: newMemberForm.email,
      phone: newMemberForm.phone || '+1 (555) 012-3456',
      roleId: newMemberForm.roleId,
      role: roleLabelMap[newMemberForm.roleId],
      department: newMemberForm.department,
      joinedDate: new Date().toISOString().split('T')[0]
    };

    setMembers([added, ...members]);
    setShowAddMember(false);
    setNewMemberForm({
      name: '',
      email: '',
      phone: '',
      roleId: 'member',
      department: 'General Congregation'
    });
    showToast(`Successfully enrolled ${added.name}!`);
  };

  // Save New Cell
  const handleCreateCell = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCellForm.name || !newCellForm.leader) {
      showToast('Please fill in required fields');
      return;
    }
    const added: Cell = {
      id: `c${Date.now()}`,
      name: newCellForm.name,
      leader: newCellForm.leader,
      memberCount: Number(newCellForm.memberCount) || 0,
      status: newCellForm.status
    };

    setCells([...cells, added]);
    setShowAddCell(false);
    setNewCellForm({
      name: '',
      leader: '',
      memberCount: 6,
      status: 'Active'
    });
    showToast(`Successfully created ${added.name}!`);
  };

  // Filter application & Reset
  const applyFilters = () => {
    triggerHaptic();
    setIsFilterOpen(false);
    showToast('Applied active directory filters');
  };

  const resetFilters = () => {
    triggerHaptic();
    setRoleFilter({
      lead_pastor: true,
      admin: true,
      cell_leader: true,
      district_pastor: true,
      department_head: true,
      member: true,
      guest: true
    });
    setSectionFilter('All');
    setSortOption('A-Z');
    setSearchQuery('');
    showToast('Filters reset successfully');
  };

  // Dynamic filter lists
  // 1. FILTER MEMBERS
  const filteredMembers = members
    .filter(m => {
      // Search text filter
      const matchesSearch = 
        m.name.toLowerCase().includes(debouncedQuery.toLowerCase()) ||
        m.email.toLowerCase().includes(debouncedQuery.toLowerCase()) ||
        m.department.toLowerCase().includes(debouncedQuery.toLowerCase()) ||
        m.role.toLowerCase().includes(debouncedQuery.toLowerCase());
      
      // Role filter check
      const matchesRole = roleFilter[m.roleId] !== false;

      // Section Filter
      const matchesSection = sectionFilter === 'All' || m.department === sectionFilter;

      return matchesSearch && matchesRole && matchesSection;
    })
    .sort((a, b) => {
      if (sortOption === 'A-Z') {
        return a.name.localeCompare(b.name);
      } else if (sortOption === 'Newest') {
        return b.joinedDate.localeCompare(a.joinedDate);
      } else {
        // Sort by role hierarchy weight
        const weight = { lead_pastor: 7, admin: 6, district_pastor: 5, department_head: 4, cell_leader: 3, member: 2, guest: 1 };
        return weight[b.roleId] - weight[a.roleId];
      }
    });

  // 2. FILTER CELLS
  const filteredCells = cells.filter(c => {
    return c.name.toLowerCase().includes(debouncedQuery.toLowerCase()) ||
      c.leader.toLowerCase().includes(debouncedQuery.toLowerCase());
  });

  // 3. FILTER DISTRICTS
  const filteredDistricts = districts.filter(d => {
    return d.name.toLowerCase().includes(debouncedQuery.toLowerCase()) ||
      d.pastor.toLowerCase().includes(debouncedQuery.toLowerCase());
  });

  // 4. FILTER PILLARS
  const filteredPillars = pillars.filter(p => {
    return p.name.toLowerCase().includes(debouncedQuery.toLowerCase()) ||
      p.head.toLowerCase().includes(debouncedQuery.toLowerCase());
  });

  // Role Color helper
  const getRoleColorClass = (roleId: Member['roleId']) => {
    switch (roleId) {
      case 'lead_pastor':
      case 'admin':
      case 'district_pastor':
        return 'ring-2 ring-gold-500';
      case 'cell_leader':
      case 'department_head':
        return 'ring-2 ring-cathedral-500';
      default:
        return 'ring-1 ring-white/20 dark:ring-white/20 light:ring-black/10';
    }
  };

  return (
    <div className="space-y-4 flex flex-col h-full select-none pb-12 relative">
      
      {/* --------------------------------------
          1. HEADER COMPONENT WITH SECTIONTITLE
         -------------------------------------- */}
      <SectionTitle
        title="Saints & Structures"
        badge={{
          label: "Online",
          variant: "sage",
          icon: <span className="w-1.5 h-1.5 rounded-full bg-[#7BC47F] animate-pulse"></span>
        }}
      />

      {/* --------------------------------------
          2. SEARCHFIELD with voice & filter icon
         -------------------------------------- */}
      <div className="px-1">
        <SearchField
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search members, cells, groups..."
          onVoice={() => {
            triggerHaptic();
            setSearchQuery('Sister Grace');
          }}
          onFilter={() => {
            triggerHaptic();
            setIsFilterOpen(true);
          }}
        />
      </div>

      {/* --------------------------------------
          3. STICKY INLINE TAB SYSTEM
         -------------------------------------- */}
      <div className="relative border-b border-white/[0.04] dark:border-white/[0.04] light:border-black/[0.04] pb-1 overflow-x-auto scrollbar-none scroll-smooth">
        <div className="flex gap-4.5 px-2 relative min-w-max">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            // Get actual count dynamically based on state
            const tabCounts = {
              members: filteredMembers.length,
              cells: filteredCells.length,
              districts: filteredDistricts.length,
              pillars: filteredPillars.length
            };
            const count = tabCounts[tab.id];

            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`relative py-2 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer pb-2.5 ${
                  isActive 
                    ? 'text-gold-500 font-extrabold' 
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <span>{tab.label}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  isActive ? 'bg-gold-500/10 text-gold-400' : 'bg-surface-100 text-text-muted'
                }`}>
                  {count}
                </span>

                {/* Sliding underline indicator (with spring motion physics) */}
                {isActive && (
                  <motion.div
                    layoutId="activeTabUnderline"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-gold-500 rounded-full"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* --------------------------------------
          4. CORE CONTENT PORTAL (Swipeable via Touch)
         -------------------------------------- */}
      <div 
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="flex-1 min-h-[380px]"
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.18 }}
            className="space-y-4"
          >

            {/* ==========================================
                TAB 1: MEMBERS TAB
               ========================================== */}
            {activeTab === 'members' && (
              <div className="space-y-3 relative">
                
                {/* Count and CTA trigger */}
                <div className="flex items-center justify-between px-1">
                  <span className={`${Typography.CAPTION} text-text-muted font-bold tracking-wide`}>
                    {filteredMembers.length} {filteredMembers.length === 1 ? 'member' : 'members'} found
                  </span>
                  <button
                    onClick={() => { triggerHaptic(); setShowAddMember(true); }}
                    className="cursor-pointer"
                  >
                    <AccentBadge 
                      label="Enroll" 
                      variant="gold" 
                      size="md" 
                      icon={<Plus className="w-3 h-3 text-black fill-black stroke-[3px]" />}
                    />
                  </button>
                </div>

                {/* Main list & Alphabetical column layout */}
                <div className="relative pr-6">
                  {/* Empty state check */}
                  {filteredMembers.length === 0 ? (
                    <div className="py-12 text-center flex flex-col items-center justify-center space-y-3">
                      <motion.div
                        animate={{ y: [0, -4, 0] }}
                        transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                        className="w-12 h-12 rounded-full bg-surface-100 flex items-center justify-center text-text-muted"
                      >
                        <Users className="w-6 h-6" />
                      </motion.div>
                      <div>
                        <h3 className={`${Typography.SUBTITLE} text-text-primary`}>No members found</h3>
                        <p className={`${Typography.CAPTION} text-text-muted mt-1 max-w-[220px]`}>
                          Try expanding your search query or role filters.
                        </p>
                      </div>
                      <button
                        onClick={resetFilters}
                        className="px-4 py-1.5 border border-gold-500/30 text-gold-500 rounded-pill text-xs font-bold hover:bg-gold-500/10 transition-colors"
                      >
                        Reset Filters
                      </button>
                    </div>
                  ) : (
                    <motion.div
                      variants={staggerChildren.container}
                      initial="initial"
                      animate="animate"
                      className="space-y-2 bg-white/[0.01] border border-white/5 dark:border-white/5 light:border-black/5 rounded-card overflow-hidden"
                    >
                      {filteredMembers.map((member) => (
                        <motion.div
                          key={member.id}
                          variants={staggerChildren.child}
                          className="relative active:scale-[0.99] transition-transform"
                          onMouseDown={() => handleMemberPressStart(member)}
                          onMouseUp={handleMemberPressEnd}
                          onMouseLeave={handleMemberPressEnd}
                          onTouchStart={() => handleMemberPressStart(member)}
                          onTouchEnd={handleMemberPressEnd}
                        >
                          <SwipeableRow
                            onSwipeStart={handleMemberPressEnd}
                            actions={[
                              {
                                icon: <Phone className="w-4 h-4" />,
                                label: 'Call',
                                colorClassName: 'bg-[#7BC47F]',
                                onPress: () => { triggerHaptic(); window.location.href = `tel:${member.phone}`; }
                              },
                              {
                                icon: <MessageSquare className="w-4 h-4" />,
                                label: 'Message',
                                colorClassName: 'bg-gold-500',
                                onPress: () => { triggerHaptic(); window.location.href = `sms:${member.phone}`; }
                              }
                            ]}
                          >
                            <ContentRow
                              thumbnail={<Avatar name={member.name} size="md" ringClassName={getRoleColorClass(member.roleId)} />}
                              title={member.name}
                              subtitle={member.email}
                              meta={member.department}
                              action={
                                <AccentBadge
                                  label={member.role}
                                  variant="muted"
                                  size="sm"
                                />
                              }
                              onPress={() => { triggerHaptic(); setSelectedMember(member); }}
                            />
                          </SwipeableRow>
                        </motion.div>
                      ))}
                    </motion.div>
                  )}

                  {/* Thin elegant alphabetical index bar on the right edge */}
                  <div className="absolute right-0 top-0 bottom-0 w-5 flex flex-col justify-between py-2 text-[8px] font-bold text-text-muted bg-surface-100/50 rounded-pill">
                    {letters.filter((_, i) => i % 2 === 0).map((letter) => (
                      <button
                        key={letter}
                        onClick={() => handleLetterClick(letter)}
                        className="hover:text-gold-500 active:text-gold-500 transition-colors"
                      >
                        {letter}
                      </button>
                    ))}
                  </div>
                </div>

              </div>
            )}

            {/* ==========================================
                TAB 2: CELLS TAB (Grid of Cards)
               ========================================== */}
            {activeTab === 'cells' && (
              <div className="space-y-4">
                {filteredCells.length === 0 ? (
                  <div className="py-12 text-center flex flex-col items-center justify-center space-y-3">
                    <div className="w-12 h-12 rounded-full bg-surface-100 flex items-center justify-center text-text-muted">
                      <Flame className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className={`${Typography.SUBTITLE} text-text-primary`}>No cell groups found</h3>
                      <p className={`${Typography.CAPTION} text-text-muted mt-1`}>No cells matched your query.</p>
                    </div>
                    <button
                      onClick={() => setShowAddCell(true)}
                      className="px-4 py-1.5 bg-gold-500 text-black font-bold text-xs rounded-pill"
                    >
                      Create Cell
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3.5">
                    {filteredCells.map((cell) => {
                      const statusVariant = {
                        'Active': 'sage',
                        'Pending Report': 'gold',
                        'Missed': 'cathedral'
                      }[cell.status] as any;

                      return (
                        <GlassCard
                          key={cell.id}
                          pressable={true}
                          onPress={() => { triggerHaptic(); setSelectedCell(cell); }}
                          className="p-3.5 flex flex-col justify-between min-h-[110px]"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-gold-400 uppercase tracking-wider truncate max-w-[80px]">
                                {cell.status}
                              </span>
                              <AccentBadge label={cell.status} variant={statusVariant} size="sm" />
                            </div>
                            <h4 className={`${Typography.SUBTITLE} text-text-primary truncate font-bold mt-1`}>
                              {cell.name}
                            </h4>
                            <p className="text-[11px] text-text-muted truncate">
                              Lead: {cell.leader}
                            </p>
                          </div>
                          
                          <div className="mt-3.5 pt-2 border-t border-white/[0.04] flex items-center justify-between text-[10px] font-semibold text-text-secondary">
                            <span>{cell.memberCount} members</span>
                            <ChevronRight className="w-3.5 h-3.5 text-text-muted" />
                          </div>
                        </GlassCard>
                      );
                    })}

                    {/* "+ New Cell" card */}
                    <button
                      onClick={() => { triggerHaptic(); setShowAddCell(true); }}
                      className="border border-dashed border-gold-500/40 rounded-card p-3.5 flex flex-col items-center justify-center min-h-[110px] gap-2 hover:bg-gold-500/5 hover:border-gold-500/60 active:scale-[0.98] transition-all text-center cursor-pointer"
                    >
                      <div className="w-9 h-9 rounded-full bg-gold-500/10 flex items-center justify-center text-gold-500">
                        <Plus className="w-5 h-5 stroke-[2.5]" />
                      </div>
                      <span className="text-xs font-bold text-gold-500">Create Cell</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ==========================================
                TAB 3: DISTRICTS TAB (Accordions)
               ========================================== */}
            {activeTab === 'districts' && (
              <div className="space-y-3">
                {filteredDistricts.length === 0 ? (
                  <div className="py-12 text-center flex flex-col items-center justify-center space-y-3">
                    <div className="w-12 h-12 rounded-full bg-surface-100 flex items-center justify-center text-text-muted">
                      <MapPin className="w-6 h-6" />
                    </div>
                    <h3 className={`${Typography.SUBTITLE} text-text-primary`}>No districts found</h3>
                  </div>
                ) : (
                  filteredDistricts.map((dist) => {
                    const isOpen = openDistrictId === dist.id;
                    return (
                      <GlassCard
                        key={dist.id}
                        className="overflow-hidden transition-all duration-300"
                      >
                        {/* Accordion Trigger Header */}
                        <button
                          onClick={() => {
                            triggerHaptic();
                            setOpenDistrictId(isOpen ? null : dist.id);
                          }}
                          className="w-full flex items-center justify-between p-4 cursor-pointer text-left"
                        >
                          <div>
                            <h4 className={`${Typography.SUBTITLE} font-extrabold text-text-primary`}>
                              {dist.name}
                            </h4>
                            <p className="text-[11px] text-text-muted mt-0.5 font-semibold">
                              Overseer: {dist.pastor}
                            </p>
                          </div>
                          
                          <div className="flex items-center gap-2.5">
                            <AccentBadge label={`${dist.cellCount} Cells`} variant="gold" size="sm" />
                            <div className="text-text-muted">
                              {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </div>
                          </div>
                        </button>

                        {/* Collapsible content (nested cells list) */}
                        <AnimatePresence initial={false}>
                          {isOpen && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="border-t border-white/[0.04] dark:border-white/[0.04] light:border-black/[0.04]"
                            >
                              <div className="p-3 bg-white/[0.01] space-y-1">
                                <span className="text-[9px] font-bold uppercase tracking-widest text-text-muted px-2 block mb-1">
                                  Cells Under District
                                </span>
                                {dist.cells.map((cellName, i) => (
                                  <ContentRow
                                    key={i}
                                    thumbnail={
                                      <div className="w-7 h-7 rounded-full bg-gold-500/15 flex items-center justify-center text-gold-500 font-bold text-[10px]">
                                        H
                                      </div>
                                    }
                                    title={cellName}
                                    subtitle="Meets Weekly Wednesday"
                                    meta="General District"
                                    onPress={() => {
                                      triggerHaptic();
                                      showToast(`Viewing details for nested cell: ${cellName}`);
                                    }}
                                  />
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </GlassCard>
                    );
                  })
                )}
              </div>
            )}

            {/* ==========================================
                TAB 4: PILLARS TAB (2-Column Grid)
               ========================================== */}
            {activeTab === 'pillars' && (
              <div className="grid grid-cols-2 gap-3.5">
                {filteredPillars.map((p) => {
                  return (
                    <GlassCard
                      key={p.id}
                      pressable={true}
                      onPress={() => { triggerHaptic(); setSelectedPillar(p); }}
                      className="p-4 h-[130px] flex flex-col justify-between cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-full bg-gold-500/10 flex items-center justify-center flex-shrink-0">
                          {PILLAR_ICONS[p.iconName]}
                        </div>
                        <div className="min-w-0">
                          <h4 className={`${Typography.SUBTITLE} text-text-primary font-bold truncate`}>
                            {p.name}
                          </h4>
                          <p className="text-[10px] text-text-muted truncate">
                            {p.head}
                          </p>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-white/[0.04] flex items-center justify-between text-[11px] font-bold text-text-secondary">
                        <span>{p.membersCount} staff members</span>
                        <ChevronRight className="w-4 h-4 text-text-muted" />
                      </div>
                    </GlassCard>
                  );
                })}
              </div>
            )}

          </motion.div>
        </AnimatePresence>
      </div>

      {/* --------------------------------------
          5. FILTER BOTTOM SHEET
         -------------------------------------- */}
      <BottomSheet
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        title="Directory Filters"
      >
        <div className="space-y-5 pb-8">
          
          {/* Section: Roles Filter */}
          <div className="space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
              Filter by Role
            </span>
            <div className="grid grid-cols-2 gap-2">
              {Object.keys(roleFilter).map((roleKey) => {
                const labelMap: Record<string, string> = {
                  lead_pastor: 'Lead Pastor',
                  admin: 'Administrator',
                  cell_leader: 'Cell Leader',
                  district_pastor: 'District Pastor',
                  department_head: 'Dept. Head',
                  member: 'Regular Member',
                  guest: 'Visitor / Seeker'
                };
                const isSelected = roleFilter[roleKey];
                return (
                  <button
                    key={roleKey}
                    onClick={() => {
                      triggerHaptic();
                      setRoleFilter(prev => ({ ...prev, [roleKey]: !prev[roleKey] }));
                    }}
                    className={`flex items-center justify-between px-3 py-2 rounded-xl border text-left text-xs font-semibold cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-gold-500/10 border-gold-500/50 text-gold-500'
                        : 'bg-white/[0.01] border-white/5 text-text-secondary hover:bg-white/5'
                    }`}
                  >
                    <span>{labelMap[roleKey]}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-gold-500" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section: Department Filter */}
          <div className="space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
              Filter by Department
            </span>
            <select
              value={sectionFilter}
              onChange={(e) => { triggerHaptic(); setSectionFilter(e.target.value); }}
              className="w-full bg-surface-100 dark:bg-surface-100 light:bg-surface-light-secondary border border-white/5 rounded-xl px-3.5 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500"
            >
              <option value="All">All Departments</option>
              <option value="Executive Clergy">Executive Clergy</option>
              <option value="Operations & Finance">Operations & Finance</option>
              <option value="Hope Cell Group">Hope Cell Group</option>
              <option value="North District">North District</option>
              <option value="Worship Ministry">Worship Ministry</option>
              <option value="General Congregation">General Congregation</option>
              <option value="Youth Ministry">Youth Ministry</option>
            </select>
          </div>

          {/* Section: Sort */}
          <div className="space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
              Sort Order
            </span>
            <div className="flex gap-2">
              {(['A-Z', 'Newest', 'Role'] as const).map((opt) => {
                const isSelected = sortOption === opt;
                return (
                  <button
                    key={opt}
                    onClick={() => { triggerHaptic(); setSortOption(opt); }}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold border text-center transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-gold-500 text-black border-gold-500'
                        : 'bg-white/[0.01] border-white/5 text-text-secondary hover:bg-white/5'
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Action buttons */}
          <div className="pt-4 space-y-3">
            <button
              onClick={applyFilters}
              className="w-full py-3 bg-gold-500 text-black font-extrabold text-xs rounded-pill shadow-lg hover:bg-gold-400 transition-colors cursor-pointer"
            >
              Apply Filters
            </button>
            <div className="text-center">
              <button
                onClick={resetFilters}
                className="text-xs font-bold text-text-muted hover:text-gold-500 transition-colors"
              >
                Reset
              </button>
            </div>
          </div>

        </div>
      </BottomSheet>

      {/* --------------------------------------
          6. LONG PRESS CONTEXT ACTION SHEET (MEMBERS)
         -------------------------------------- */}
      <BottomSheet
        isOpen={longPressedMember !== null}
        onClose={() => setLongPressedMember(null)}
        title="Quick Actions"
      >
        {longPressedMember && (
          <div className="space-y-4 pb-6">
            <div className="flex items-center gap-3 p-3 bg-white/[0.02] border border-white/5 rounded-xl">
              <div className="w-10 h-10 rounded-full bg-gold-500/10 flex items-center justify-center font-bold text-gold-500">
                {longPressedMember.name.substring(0, 2).toUpperCase()}
              </div>
              <div>
                <h4 className={`${Typography.SUBTITLE} font-bold text-text-primary`}>
                  {longPressedMember.name}
                </h4>
                <p className="text-xs text-text-muted">
                  {longPressedMember.role} • {longPressedMember.department}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => {
                  triggerHaptic();
                  setLongPressedMember(null);
                  showToast(`Simulated message dispatched to ${longPressedMember.name}`);
                }}
                className="w-full flex items-center gap-3 p-3 bg-white/[0.01] hover:bg-white/5 border border-white/5 rounded-xl text-left text-sm font-bold text-text-primary"
              >
                <MessageSquare className="w-4 h-4 text-gold-500" />
                <span>Message Member</span>
              </button>

              <button
                onClick={() => {
                  triggerHaptic();
                  setLongPressedMember(null);
                  showToast(`Role assignment pending verification for ${longPressedMember.name}`);
                }}
                className="w-full flex items-center gap-3 p-3 bg-white/[0.01] hover:bg-white/5 border border-white/5 rounded-xl text-left text-sm font-bold text-text-primary"
              >
                <UserCheck className="w-4 h-4 text-gold-500" />
                <span>Assign Role</span>
              </button>

              <button
                onClick={() => {
                  triggerHaptic();
                  setLongPressedMember(null);
                  setSelectedMember(longPressedMember);
                }}
                className="w-full flex items-center gap-3 p-3 bg-white/[0.01] hover:bg-white/5 border border-white/5 rounded-xl text-left text-sm font-bold text-text-primary"
              >
                <Users className="w-4 h-4 text-gold-500" />
                <span>View Profile</span>
              </button>
            </div>
          </div>
        )}
      </BottomSheet>

      {/* --------------------------------------
          7. FULL DETAILS BOTTOM SHEET MODALS
         -------------------------------------- */}
      {/* A. Member profile Detail Sheet */}
      <BottomSheet
        isOpen={selectedMember !== null}
        onClose={() => setSelectedMember(null)}
        title="Saints Profile Profile"
      >
        {selectedMember && (
          <div className="space-y-5 pb-8 text-left">
            <div className="flex flex-col items-center text-center space-y-2.5">
              <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-cathedral-900 to-gold-500 p-0.5 shadow-lg">
                <div className="w-full h-full rounded-full bg-surface-50 flex items-center justify-center font-black text-white text-lg">
                  {selectedMember.name.substring(0, 2).toUpperCase()}
                </div>
              </div>
              <div>
                <h3 className={`${Typography.TITLE} font-extrabold text-text-primary`}>
                  {selectedMember.name}
                </h3>
                <p className="text-xs text-text-secondary font-bold mt-1">
                  {selectedMember.department}
                </p>
                <div className="mt-2.5 flex justify-center">
                  <AccentBadge label={selectedMember.role} variant="gold" size="md" />
                </div>
              </div>
            </div>

            <div className="border-t border-white/[0.04] pt-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-text-muted font-bold">Email Address</span>
                <span className="text-text-primary font-semibold flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5 text-gold-500" /> {selectedMember.email}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-text-muted font-bold">Contact Number</span>
                <span className={`text-text-primary flex items-center gap-1 ${Typography.METRIC}`}>
                  <Phone className="w-3.5 h-3.5 text-gold-500" /> {selectedMember.phone}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-text-muted font-bold">Enrollment Date</span>
                <span className="text-text-primary font-semibold flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-gold-500" /> {selectedMember.joinedDate}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-text-muted font-bold">Account Verification</span>
                <span className="text-[#7BC47F] font-bold flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> SECURE
                </span>
              </div>
            </div>

            <div className="pt-4 flex gap-3">
              <button
                onClick={() => {
                  triggerHaptic();
                  setSelectedMember(null);
                  showToast(`Email invitation logged to ${selectedMember.email}`);
                }}
                className="flex-1 py-2.5 bg-gold-500 text-black font-bold text-xs rounded-pill text-center hover:bg-gold-400 transition-all cursor-pointer"
              >
                Send Message
              </button>
              <button
                onClick={() => setSelectedMember(null)}
                className="flex-1 py-2.5 bg-surface-100 text-text-primary font-bold text-xs rounded-pill text-center hover:bg-surface-200 transition-all cursor-pointer"
              >
                Close Profile
              </button>
            </div>
          </div>
        )}
      </BottomSheet>

      {/* B. Cell Group Detail Sheet */}
      <BottomSheet
        isOpen={selectedCell !== null}
        onClose={() => setSelectedCell(null)}
        title="Cell Group Details"
      >
        {selectedCell && (
          <div className="space-y-4 pb-8 text-left">
            <div className="p-4 bg-gold-500/10 border border-gold-500/20 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className={`${Typography.OVERLINE} text-gold-400`}>
                  District House Fellowship
                </span>
                <AccentBadge label={selectedCell.status} variant="sage" size="sm" />
              </div>
              <h3 className="text-lg font-extrabold text-white">
                {selectedCell.name}
              </h3>
              <p className="text-xs text-white/70">
                Meets every Wednesday evening at 7:00 PM for Worship, Word & Communion.
              </p>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between py-1.5 border-b border-white/[0.04]">
                <span className="text-text-muted font-bold">Assigned Guide</span>
                <span className="text-text-primary font-bold">{selectedCell.leader}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-white/[0.04]">
                <span className="text-text-muted font-bold">Total Members</span>
                <span className="text-text-primary font-bold">{selectedCell.memberCount} active saints</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-white/[0.04]">
                <span className="text-text-muted font-bold">Gathering Format</span>
                <span className="text-text-primary font-bold">Hybrid / In-Person</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-white/[0.04]">
                <span className="text-text-muted font-bold">Weekly reports submitted</span>
                <span className="text-[#7BC47F] font-bold">98% compliance</span>
              </div>
            </div>

            <div className="pt-4 flex gap-3">
              <button
                onClick={() => {
                  triggerHaptic();
                  setSelectedCell(null);
                  showToast('Syllabus studies opened for cell leaders');
                }}
                className="flex-1 py-2.5 bg-gold-500 text-black font-bold text-xs rounded-pill cursor-pointer hover:bg-gold-400"
              >
                Access Study Guide
              </button>
              <button
                onClick={() => setSelectedCell(null)}
                className="flex-1 py-2.5 bg-surface-100 text-text-primary font-bold text-xs rounded-pill"
              >
                Back
              </button>
            </div>
          </div>
        )}
      </BottomSheet>

      {/* C. Pillar/Department Detail Sheet */}
      <BottomSheet
        isOpen={selectedPillar !== null}
        onClose={() => setSelectedPillar(null)}
        title="Department Briefing"
      >
        {selectedPillar && (
          <div className="space-y-4 pb-8 text-left">
            <div className="flex items-center gap-3.5 p-3.5 bg-white/[0.02] border border-white/5 rounded-xl">
              <div className="w-12 h-12 rounded-xl bg-gold-500/10 flex items-center justify-center">
                {PILLAR_ICONS[selectedPillar.iconName]}
              </div>
              <div>
                <h3 className={`${Typography.SUBTITLE} font-extrabold text-text-primary`}>
                  {selectedPillar.name}
                </h3>
                <p className="text-xs text-text-muted">
                  Directed by {selectedPillar.head}
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-text-secondary leading-relaxed">
                The {selectedPillar.name} operates to build active service pathways for congregation members, supporting regular liturgies and Sunday gathering infrastructure.
              </p>

              <div className="pt-2 border-t border-white/[0.04] space-y-2.5">
                <div className="flex justify-between">
                  <span className="text-text-muted font-bold">Volunteers / Staff</span>
                  <span className="text-text-primary font-bold">{selectedPillar.membersCount} active volunteers</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-muted font-bold">Meeting Cadence</span>
                  <span className="text-text-primary font-bold">Monthly Strategy / Weekly Prep</span>
                </div>
              </div>
            </div>

            <div className="pt-4 flex gap-3">
              <button
                onClick={() => {
                  triggerHaptic();
                  setSelectedPillar(null);
                  showToast('Volunteer onboarding flow initialized');
                }}
                className="flex-1 py-2.5 bg-gold-500 text-black font-bold text-xs rounded-pill cursor-pointer"
              >
                Volunteer Onboard
              </button>
              <button
                onClick={() => setSelectedPillar(null)}
                className="flex-1 py-2.5 bg-surface-100 text-text-primary font-bold text-xs rounded-pill"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </BottomSheet>

      {/* --------------------------------------
          8. CREATION FORM MODALS (HIGH-FIDELITY CTA FLOWS)
         -------------------------------------- */}
      {/* Form A: Enroll Member */}
      <BottomSheet
        isOpen={showAddMember}
        onClose={() => setShowAddMember(false)}
        title="Enroll New Saint"
      >
        <form onSubmit={handleCreateMember} className="space-y-4 pb-8 text-left">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Full Name *</label>
            <input
              type="text"
              required
              value={newMemberForm.name}
              onChange={(e) => setNewMemberForm({ ...newMemberForm, name: e.target.value })}
              placeholder="e.g. Timothy Clark"
              className="w-full bg-surface-100 border border-white/5 rounded-xl px-3.5 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Email Address *</label>
            <input
              type="email"
              required
              value={newMemberForm.email}
              onChange={(e) => setNewMemberForm({ ...newMemberForm, email: e.target.value })}
              placeholder="e.g. timothy@fellowship.com"
              className="w-full bg-surface-100 border border-white/5 rounded-xl px-3.5 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Phone Number</label>
            <input
              type="text"
              value={newMemberForm.phone}
              onChange={(e) => setNewMemberForm({ ...newMemberForm, phone: e.target.value })}
              placeholder="e.g. +1 (555) 019-3388"
              className="w-full bg-surface-100 border border-white/5 rounded-xl px-3.5 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Initial Role</label>
              <select
                value={newMemberForm.roleId}
                onChange={(e) => setNewMemberForm({ ...newMemberForm, roleId: e.target.value as any })}
                className="w-full bg-surface-100 border border-white/5 rounded-xl px-3 py-2.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500"
              >
                <option value="member">Regular Member</option>
                <option value="cell_leader">Cell Leader</option>
                <option value="department_head">Department Head</option>
                <option value="guest">Guest / Seeker</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Department</label>
              <select
                value={newMemberForm.department}
                onChange={(e) => setNewMemberForm({ ...newMemberForm, department: e.target.value })}
                className="w-full bg-surface-100 border border-white/5 rounded-xl px-3 py-2.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500"
              >
                <option value="General Congregation">General Congregation</option>
                <option value="Worship Ministry">Worship Ministry</option>
                <option value="Hope Cell Group">Hope Cell Group</option>
                <option value="Youth Ministry">Youth Ministry</option>
                <option value="First-time Welcome">First-time Welcome</option>
              </select>
            </div>
          </div>

          <div className="pt-4 flex gap-3">
            <button
              type="submit"
              className="flex-1 py-3 bg-gold-500 text-black font-extrabold text-xs rounded-pill text-center cursor-pointer shadow-lg hover:bg-gold-400"
            >
              Enroll Saint
            </button>
            <button
              type="button"
              onClick={() => setShowAddMember(false)}
              className="flex-1 py-3 bg-surface-100 text-text-primary font-bold text-xs rounded-pill text-center"
            >
              Cancel
            </button>
          </div>
        </form>
      </BottomSheet>

      {/* Form B: Create Cell */}
      <BottomSheet
        isOpen={showAddCell}
        onClose={() => setShowAddCell(false)}
        title="Establish New Cell Group"
      >
        <form onSubmit={handleCreateCell} className="space-y-4 pb-8 text-left">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Cell Name *</label>
            <input
              type="text"
              required
              value={newCellForm.name}
              onChange={(e) => setNewCellForm({ ...newCellForm, name: e.target.value })}
              placeholder="e.g. Grace Fellowship"
              className="w-full bg-surface-100 border border-white/5 rounded-xl px-3.5 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Host / Leader *</label>
            <input
              type="text"
              required
              value={newCellForm.leader}
              onChange={(e) => setNewCellForm({ ...newCellForm, leader: e.target.value })}
              placeholder="e.g. Sister Abigail"
              className="w-full bg-surface-100 border border-white/5 rounded-xl px-3.5 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Start Members</label>
              <input
                type="number"
                min="1"
                value={newCellForm.memberCount}
                onChange={(e) => setNewCellForm({ ...newCellForm, memberCount: Number(e.target.value) })}
                className="w-full bg-surface-100 border border-white/5 rounded-xl px-3.5 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Report Status</label>
              <select
                value={newCellForm.status}
                onChange={(e) => setNewCellForm({ ...newCellForm, status: e.target.value as any })}
                className="w-full bg-surface-100 border border-white/5 rounded-xl px-3 py-2.5 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500"
              >
                <option value="Active">Active</option>
                <option value="Pending Report">Pending Report</option>
                <option value="Missed">Missed</option>
              </select>
            </div>
          </div>

          <div className="pt-4 flex gap-3">
            <button
              type="submit"
              className="flex-1 py-3 bg-gold-500 text-black font-extrabold text-xs rounded-pill text-center cursor-pointer shadow-lg hover:bg-gold-400"
            >
              Create Cell
            </button>
            <button
              type="button"
              onClick={() => setShowAddCell(false)}
              className="flex-1 py-3 bg-surface-100 text-text-primary font-bold text-xs rounded-pill text-center"
            >
              Cancel
            </button>
          </div>
        </form>
      </BottomSheet>

      {/* --------------------------------------
          9. FLOATING TOAST NOTIFICATION
         -------------------------------------- */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-surface-200 border border-gold-500/30 px-4 py-2.5 rounded-full text-xs font-bold text-gold-400 flex items-center gap-2 shadow-xl z-100"
          >
            <Sparkles className="w-4 h-4 text-gold-500 animate-spin" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
