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
  Avatar
} from '../shared';
import { staggerChildren } from '../../lib/animations';
import { useAuth } from '../../lib/db/PocketBaseProvider';
import { useChurchStructure } from '../../lib/db/pocketbaseHooks';
import { type DirectoryMemberRecord } from '../../lib/db/churchConnectDB';
import { useSaintsDirectoryData } from '../../lib/db/directoryData';
import { EnrollMemberForm } from '../profile/EnrollMemberForm';
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
  ShieldCheck,
  MapPin
} from 'lucide-react';

// ==========================================
// Directory view models
// ==========================================

export interface Member {
  id: string;
  userId?: string;
  name: string;
  role: string;
  roleId: 'lead_pastor' | 'administrator' | 'cell_leader' | 'district_pastor' | 'department_head' | 'member' | 'guest';
  department: string;
  departments: string[];
  cellGroup: string;
  section: string;
}

const MEMBER_ROLE_LABELS: Record<Member['roleId'], string> = {
  lead_pastor: 'Lead Pastor',
  administrator: 'Administrator',
  cell_leader: 'Cell Leader',
  district_pastor: 'District Pastor',
  department_head: 'Department Head',
  member: 'Member',
  guest: 'Guest / Seeker'
};

function directoryRole(role: string): Member['roleId'] {
  return role in MEMBER_ROLE_LABELS ? role as Member['roleId'] : 'member';
}

function toDirectoryMember(member: DirectoryMemberRecord): Member {
  const roleId = directoryRole(member.role);
  return {
    id: member.localId,
    userId: member.userId,
    name: member.fullName,
    role: MEMBER_ROLE_LABELS[roleId],
    roleId,
    department: member.departments.join(', ') || 'General congregation',
    departments: member.departments,
    cellGroup: member.cellGroupName || 'Not assigned',
    section: member.sectionName || 'Not assigned'
  };
}

interface Cell {
  id: string;
  name: string;
  leader: string;
  memberCount: number;
  status: 'Active' | 'Inactive';
  meetingDay?: string;
  meetingTime?: string;
  location?: string;
  sectionName?: string;
}

interface District {
  id: string;
  name: string;
  pastor: string;
  cellCount: number;
  cells: string[];
}


interface Pillar {
  id: string;
  name: string;
  head: string;
  description?: string;
  membersCount: number;
  iconName: 'Worship' | 'Media' | 'Youth' | 'Children';
}


const PILLAR_ICONS = {
  Worship: <Music className="w-6 h-6 text-gold-500" />,
  Media: <Monitor className="w-6 h-6 text-gold-500" />,
  Youth: <Flame className="w-6 h-6 text-gold-500" />,
  Children: <Baby className="w-6 h-6 text-gold-500" />
};

export function SaintsDirectory() {
  const { user } = useAuth();
  const {
    members: directoryMembers,
    countFor,
    totalItems,
    hasMore,
    loadMore,
    isLoadingMore,
    refresh: refreshDirectory,
    isLoading: membersLoading,
    isRefreshing: membersRefreshing,
    error: membersError
  } = useSaintsDirectoryData();
  const {
    cellGroups: remoteCellGroups,
    sections: remoteSections,
    departments: remoteDepartments,
    isLoading: structuresLoading
  } = useChurchStructure();
  const members = directoryMembers.map(toDirectoryMember);
  const cells: Cell[] = remoteCellGroups.map((group) => ({
    id: group.remoteId,
    name: group.name,
    leader: group.leaderName || members.find((member) => member.userId === group.leaderId)?.name || 'No leader assigned',
    memberCount: countFor('cell', group.remoteId),
    status: group.status,
    meetingDay: group.meetingDay,
    meetingTime: group.meetingTime,
    location: group.location,
    sectionName: group.sectionName
  }));
  const districts: District[] = remoteSections.map((section) => {
    const sectionCells = remoteCellGroups.filter((group) => group.sectionId === section.localId);
    return {
      id: section.remoteId || section.localId,
      name: section.name,
      pastor: section.pastorName || 'No pastor assigned',
      cellCount: sectionCells.length,
      cells: sectionCells.map((group) => group.name)
    };
  });
  const pillarIcons: Pillar['iconName'][] = ['Worship', 'Media', 'Youth', 'Children'];
  const pillars: Pillar[] = remoteDepartments.map((department, index) => ({
    id: department.remoteId || department.localId,
    name: department.name,
    head: department.headName || 'No head assigned',
    description: department.description,
    membersCount: countFor('department', department.remoteId || department.localId),
    iconName: pillarIcons[index % pillarIcons.length]
  }));
  const canManageMembers = user?.role === 'lead_pastor' || user?.role === 'administrator';
  // Navigation tabs list
  const TABS = [
    { id: 'members', label: 'Members' },
    { id: 'cells', label: 'Cells' },
    { id: 'districts', label: 'Sections' },
    { id: 'pillars', label: 'Pillars' }
  ] as const;

  type TabId = typeof TABS[number]['id'];

  // Component States
  const [activeTab, setActiveTab] = useState<TabId>('members');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedQuery, setDebouncedQuery] = useState<string>('');
  
  // Detail Modal States
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [selectedCell, setSelectedCell] = useState<Cell | null>(null);
  const [selectedPillar, setSelectedPillar] = useState<Pillar | null>(null);

  // Swipe gesture variables
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  // Accordion state (Districts) - only one open at a time
  const [openDistrictId, setOpenDistrictId] = useState<string | null>(null);

  // Long press / Context Action Sheet states
  const [longPressedMember, setLongPressedMember] = useState<Member | null>(null);
  const pressTimerRef = useRef<NodeJS.Timeout | null>(null);

  // New item forms modal states
  const [showAddMember, setShowAddMember] = useState(false);
  // Filter bottom sheet state
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [roleFilter, setRoleFilter] = useState<Record<string, boolean>>({
    lead_pastor: true,
    administrator: true,
    cell_leader: true,
    district_pastor: true,
    department_head: true,
    member: true,
    guest: true
  });
  const [departmentFilter, setDepartmentFilter] = useState<string>('All');
  const [sortOption, setSortOption] = useState<'A-Z' | 'Role'>('A-Z');

  // Haptic feedback where the device supports it.
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
      administrator: true,
      cell_leader: true,
      district_pastor: true,
      department_head: true,
      member: true,
      guest: true
    });
    setDepartmentFilter('All');
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
        m.cellGroup.toLowerCase().includes(debouncedQuery.toLowerCase()) ||
        m.section.toLowerCase().includes(debouncedQuery.toLowerCase()) ||
        m.department.toLowerCase().includes(debouncedQuery.toLowerCase()) ||
        m.role.toLowerCase().includes(debouncedQuery.toLowerCase());
      
      // Role filter check
      const matchesRole = roleFilter[m.roleId] !== false;

      // Section Filter
      const matchesDepartment = departmentFilter === 'All' || m.departments.includes(departmentFilter);

      return matchesSearch && matchesRole && matchesDepartment;
    })
    .sort((a, b) => {
      if (sortOption === 'A-Z') {
        return a.name.localeCompare(b.name);
      } else {
        // Sort by role hierarchy weight
        const weight: Record<Member['roleId'], number> = { lead_pastor: 7, administrator: 6, district_pastor: 5, department_head: 4, cell_leader: 3, member: 2, guest: 1 };
        return weight[b.roleId] - weight[a.roleId];
      }
    });
  const departmentOptions = Array.from(new Set(members.flatMap((member) => member.departments))).sort();

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
      case 'administrator':
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
          label: membersError ? 'Cached' : membersRefreshing ? 'Syncing' : 'Synced',
          variant: membersError ? 'gold' : 'sage',
          icon: <span className={`h-1.5 w-1.5 rounded-full ${membersError ? 'bg-amber-500' : 'bg-[#7BC47F]'}`}></span>
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
          onVoice={() => showToast('Voice search is not available yet')}
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
                    {filteredMembers.length} shown · {totalItems} confirmed
                  </span>
                  {canManageMembers && (
                    <button onClick={() => { triggerHaptic(); setShowAddMember(true); }} className="cursor-pointer">
                      <AccentBadge label="Enroll" variant="gold" size="md" icon={<Plus className="w-3 h-3 text-black fill-black stroke-[3px]" />} />
                    </button>
                  )}
                </div>

                {/* Main list & Alphabetical column layout */}
                <div className="relative pr-6">
                  {/* Empty state check */}
                  {membersLoading ? (
                    <div className="flex flex-col items-center justify-center space-y-3 py-12 text-center">
                      <div className="h-10 w-10 animate-spin rounded-full border-2 border-gold-500/25 border-t-gold-500" />
                      <p className={`${Typography.CAPTION} text-text-muted`}>Loading the confirmed member registry…</p>
                    </div>
                  ) : filteredMembers.length === 0 ? (
                    <div className="py-12 text-center flex flex-col items-center justify-center space-y-3">
                      <motion.div
                        animate={{ y: [0, -4, 0] }}
                        transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                        className="w-12 h-12 rounded-full bg-surface-100 flex items-center justify-center text-text-muted"
                      >
                        <Users className="w-6 h-6" />
                      </motion.div>
                      <div>
                        <h3 className={`${Typography.SUBTITLE} text-text-primary`}>{members.length === 0 ? 'No members enrolled yet' : 'No members found'}</h3>
                        <p className={`${Typography.CAPTION} text-text-muted mt-1 max-w-[220px]`}>
                          {membersError
                            ? 'The server could not be reached and there is no confirmed cache on this device.'
                            : members.length === 0
                              ? canManageMembers ? 'Enroll the first member to begin the church registry.' : 'An administrator has not added any members yet.'
                              : 'Try expanding your search query or role filters.'}
                        </p>
                      </div>
                      {members.length > 0 && <button onClick={resetFilters} className="px-4 py-1.5 border border-gold-500/30 text-gold-500 rounded-pill text-xs font-bold hover:bg-gold-500/10 transition-colors">Reset Filters</button>}
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
                          <ContentRow
                            thumbnail={<Avatar name={member.name} size="md" ringClassName={getRoleColorClass(member.roleId)} />}
                            title={member.name}
                            subtitle={member.cellGroup}
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
                        </motion.div>
                      ))}
                    </motion.div>
                  )}

                  {hasMore && (
                    <button
                      onClick={() => void loadMore()}
                      disabled={isLoadingMore}
                      className="w-full mt-3 py-2.5 rounded-pill border border-gold-500/25 bg-gold-500/5 text-gold-700 dark:text-gold-400 text-xs font-bold disabled:opacity-50 cursor-pointer"
                    >
                      {isLoadingMore ? 'Loading more…' : `Load more members (${members.length} of ${totalItems})`}
                    </button>
                  )}

                  {/* Thin elegant alphabetical index bar on the right edge */}
                  {filteredMembers.length > 0 && <div className="absolute right-0 top-0 bottom-0 w-5 flex flex-col justify-between py-2 text-[8px] font-bold text-text-muted bg-surface-100/50 rounded-pill">
                    {letters.filter((_, i) => i % 2 === 0).map((letter) => (
                      <button
                        key={letter}
                        onClick={() => handleLetterClick(letter)}
                        className="hover:text-gold-500 active:text-gold-500 transition-colors"
                      >
                        {letter}
                      </button>
                    ))}
                  </div>}
                </div>

              </div>
            )}

            {/* ==========================================
                TAB 2: CELLS TAB (Grid of Cards)
               ========================================== */}
            {activeTab === 'cells' && (
              <div className="space-y-4">
                {structuresLoading ? (
                  <div className="flex flex-col items-center justify-center space-y-3 py-12 text-center">
                    <div className="h-9 w-9 animate-spin rounded-full border-2 border-gold-500/20 border-t-gold-500" />
                    <p className={`${Typography.CAPTION} text-text-muted`}>Loading confirmed church structures…</p>
                  </div>
                ) : filteredCells.length === 0 ? (
                  <div className="py-12 text-center flex flex-col items-center justify-center space-y-3">
                    <div className="w-12 h-12 rounded-full bg-surface-100 flex items-center justify-center text-text-muted">
                      <Flame className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className={`${Typography.SUBTITLE} text-text-primary`}>No cell groups found</h3>
                      <p className={`${Typography.CAPTION} text-text-muted mt-1`}>{cells.length === 0 ? 'No cell groups have been configured yet.' : 'No cells matched your query.'}</p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3.5">
                    {filteredCells.map((cell) => {
                      const statusVariant = {
                        'Active': 'sage',
                        'Inactive': 'muted'
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
                    <h3 className={`${Typography.SUBTITLE} text-text-primary`}>No sections found</h3>
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
                                  Fellowships in Section
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
                                    subtitle="Configured house fellowship"
                                    meta={dist.name}
                                    onPress={() => {
                                      triggerHaptic();
                                      const selected = cells.find((cell) => cell.name === cellName);
                                      if (selected) setSelectedCell(selected);
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
                        <span>{p.membersCount} members</span>
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
                  administrator: 'Administrator',
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
              value={departmentFilter}
              onChange={(e) => { triggerHaptic(); setDepartmentFilter(e.target.value); }}
              className="w-full bg-surface-100 dark:bg-surface-100 light:bg-surface-light-secondary border border-white/5 rounded-xl px-3.5 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500"
            >
              <option value="All">All Departments</option>
              {departmentOptions.map((department) => <option key={department} value={department}>{department}</option>)}
            </select>
          </div>

          {/* Section: Sort */}
          <div className="space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
              Sort Order
            </span>
            <div className="flex gap-2">
              {(['A-Z', 'Role'] as const).map((opt) => {
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
                  setSelectedMember(longPressedMember);
                }}
                className="w-full flex items-center gap-3 p-3 bg-white/[0.01] hover:bg-white/5 border border-white/5 rounded-xl text-left text-sm font-bold text-text-primary"
              >
                <Users className="w-4 h-4 text-gold-500" />
                <span>View Profile</span>
              </button>
              <p className="px-2 text-[10px] leading-relaxed text-text-muted">
                Contact details are kept in the protected registry and are not published in the church-wide directory.
              </p>
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
        title="Member Profile"
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
                <span className="text-text-muted font-bold">Fellowship</span>
                <span className="text-text-primary font-semibold text-right">{selectedMember.cellGroup}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-text-muted font-bold">Section</span>
                <span className="text-text-primary font-semibold text-right">{selectedMember.section}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-text-muted font-bold">Ministry</span>
                <span className="text-text-primary font-semibold text-right">{selectedMember.department}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-text-muted font-bold">Registry status</span>
                <span className="text-semantic-success font-bold flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> CONFIRMED
                </span>
              </div>
            </div>

            <div className="pt-4 space-y-3">
              <div className="rounded-card border border-sage-500/20 bg-sage-500/10 p-3 text-[10px] leading-relaxed text-sage-800 dark:text-sage-300">
                This directory intentionally shows ministry placement only. Administrators can access contact details from the protected Registry CMS when ministry work requires it.
              </div>
              <button
                onClick={() => setSelectedMember(null)}
                className="w-full py-2.5 bg-gold-500 text-black font-bold text-xs rounded-pill text-center hover:bg-gold-400 transition-all cursor-pointer"
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
                  {selectedCell.sectionName || 'House Fellowship'}
                </span>
                <AccentBadge label={selectedCell.status} variant="sage" size="sm" />
              </div>
              <h3 className="text-lg font-extrabold text-theme-text">
                {selectedCell.name}
              </h3>
              <p className="text-xs text-theme-text-secondary">
                Meets {selectedCell.meetingDay || 'on the configured day'} at {selectedCell.meetingTime || 'the configured time'}.
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
                <span className="text-text-muted font-bold">Host location</span>
                <span className="text-text-primary font-bold text-right">{selectedCell.location || 'Not specified'}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-white/[0.04]">
                <span className="text-text-muted font-bold">Registry status</span>
                <span className="text-semantic-success font-bold">{selectedCell.status}</span>
              </div>
            </div>

            <div className="pt-4">
              <button
                onClick={() => setSelectedCell(null)}
                className="w-full py-2.5 bg-gold-500 text-black font-bold text-xs rounded-pill cursor-pointer hover:bg-gold-400"
              >
                Close Fellowship
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
                {selectedPillar.description || 'No department description has been added yet.'}
              </p>

              <div className="pt-2 border-t border-white/[0.04] space-y-2.5">
                <div className="flex justify-between">
                  <span className="text-text-muted font-bold">Active Members</span>
                  <span className="text-text-primary font-bold">{selectedPillar.membersCount}</span>
                </div>
              </div>
            </div>

            <div className="pt-4">
              <button
                onClick={() => setSelectedPillar(null)}
                className="w-full py-2.5 bg-gold-500 text-black font-bold text-xs rounded-pill cursor-pointer hover:bg-gold-400"
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
        detents={['full']}
      >
        <EnrollMemberForm
          onClose={() => setShowAddMember(false)}
          onSuccess={() => { void refreshDirectory(); }}
        />
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
