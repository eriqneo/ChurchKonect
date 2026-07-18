import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Pin, 
  Calendar, 
  User, 
  Tag, 
  Send, 
  X, 
  Plus, 
  MoreVertical, 
  Archive,
  Copy, 
  Edit3, 
  PinOff,
  Clock,
  MapPin,
  Filter,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Download
} from 'lucide-react';
import { GlassCard, AccentBadge, SectionTitle, BottomSheet } from '../shared';
import * as Typography from '../../lib/theme/typography';
import { useToast } from '../shared/toast/useToast';
import { useAnnouncementsData, type AnnouncementView as Announcement } from '../../lib/db/announcementData';
import { exportToIcs, buildGoogleCalendarUrl, copyEventDetails } from './CalendarExport';

interface AnnouncementsModuleProps {
  currentRole: {
    id: string;
    label: string;
    name: string;
    isAdmin: boolean;
  };
}

export function AnnouncementsModule({ currentRole }: AnnouncementsModuleProps) {
  const toast = useToast();
  const {
    announcements,
    isLoading,
    isRefreshing,
    error,
    saveAnnouncement,
    archiveAnnouncement,
    setPinned
  } = useAnnouncementsData();
  const [isSaving, setIsSaving] = useState(false);

  // Calendar Sheet & Saved States
  const [isCalendarSheetOpen, setIsCalendarSheetOpen] = useState(false);
  const [selectedCalendarEvent, setSelectedCalendarEvent] = useState<Announcement | null>(null);
  const [addedEventIds, setAddedEventIds] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem('churchconnect_added_events');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return {};
      }
    }
    return {};
  });

  useEffect(() => {
    localStorage.setItem('churchconnect_added_events', JSON.stringify(addedEventIds));
  }, [addedEventIds]);

  // Basic Form States
  const [isNewFormOpen, setIsNewFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [selectedTag, setSelectedTag] = useState<'General' | 'Urgent' | 'Event' | 'Reminder'>('General');
  const [isPinned, setIsPinned] = useState(false);
  
  // Event-specific States
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [eventLocation, setEventLocation] = useState('');
  
  // Expiry State
  const [expiryDate, setExpiryDate] = useState('');
  
  // Scheduling States
  const [isScheduling, setIsScheduling] = useState(false);
  const [schedDate, setSchedDate] = useState('');
  const [schedTime, setSchedTime] = useState('');

  // Dropdown management
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Filters
  const [activeFilter, setActiveFilter] = useState<string>('All'); // Member View
  const [adminTab, setAdminTab] = useState<'Active' | 'Scheduled' | 'Expired'>('Active'); // Admin View
  const [showMemberFilters, setShowMemberFilters] = useState(false); // Toggle Member Filters
  const [, setClockTick] = useState(0);
  
  // Inline expansion
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  // Helper to dynamically calculate announcement status based on date/time
  function refreshStatus(ann: Announcement): Announcement {
    const now = Date.now();
    const expiry = ann.expiresAt ? new Date(ann.expiresAt).getTime() : Number.POSITIVE_INFINITY;
    if (expiry <= now) {
      return { ...ann, status: 'Expired' };
    }
    const publish = new Date(ann.publishAt).getTime();
    if (publish > now) {
      return { ...ann, status: 'Scheduled' };
    }
    return { ...ann, status: 'Active' };
  }

  useEffect(() => {
    const interval = setInterval(() => setClockTick((value) => value + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  const triggerHaptic = () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(10);
      } catch (e) {}
    }
  };

  const handleOpenNewForm = () => {
    triggerHaptic();
    setEditingId(null);
    setTitle('');
    setBody('');
    setSelectedTag('General');
    setIsPinned(false);
    setEventDate('');
    setEventTime('');
    setEventLocation('');
    setExpiryDate('');
    setIsScheduling(false);
    setSchedDate('');
    setSchedTime('');
    setIsNewFormOpen(true);
  };

  const handleEditClick = (ann: Announcement) => {
    triggerHaptic();
    setOpenMenuId(null);
    setEditingId(ann.id);
    setTitle(ann.title);
    setBody(ann.body);
    setSelectedTag(ann.tag);
    setIsPinned(ann.pinned);
    setEventDate(ann.eventDate || '');
    setEventTime(ann.eventTime || '');
    setEventLocation(ann.eventLocation || '');
    setExpiryDate(ann.expiryDate || '');
    
    if (ann.scheduledDate) {
      setIsScheduling(true);
      setSchedDate(ann.scheduledDate);
      setSchedTime(ann.scheduledTime || '');
    } else {
      setIsScheduling(false);
      setSchedDate('');
      setSchedTime('');
    }
    
    setIsNewFormOpen(true);
  };

  const handleDuplicate = async (ann: Announcement) => {
    triggerHaptic();
    setOpenMenuId(null);
    setIsSaving(true);
    try {
      await saveAnnouncement({
        title: `${ann.title} (Copy)`, body: ann.body, tag: ann.tag, pinned: false,
        eventDate: ann.eventDate, eventTime: ann.eventTime, eventLocation: ann.eventLocation,
        expiryDate: ann.expiryDate
      });
      toast.success('Announcement duplicated and published.');
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : 'Could not duplicate this announcement.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchive = async (ann: Announcement) => {
    triggerHaptic();
    setOpenMenuId(null);
    setIsSaving(true);
    try {
      await archiveAnnouncement(ann);
      toast.success('Announcement archived.');
    } catch (archiveError) {
      toast.error(archiveError instanceof Error ? archiveError.message : 'Could not archive this announcement.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTogglePin = async (ann: Announcement) => {
    triggerHaptic();
    setOpenMenuId(null);
    setIsSaving(true);
    try {
      await setPinned(ann, !ann.pinned);
      toast.success(ann.pinned ? 'Announcement unpinned.' : 'Announcement pinned to top.');
    } catch (pinError) {
      toast.error(pinError instanceof Error ? pinError.message : 'Could not update this announcement.');
    } finally {
      setIsSaving(false);
    }
  };

  const insertFormat = (formatType: 'bold' | 'italic' | 'link') => {
    const textarea = document.getElementById('ann-body-textarea') as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selectedText = text.substring(start, end);

    let replacement = '';
    if (formatType === 'bold') {
      replacement = `**${selectedText || 'bold'}**`;
    } else if (formatType === 'italic') {
      replacement = `*${selectedText || 'italic'}*`;
    } else if (formatType === 'link') {
      replacement = `[${selectedText || 'link text'}](https://)`;
    }

    const newValue = text.substring(0, start) + replacement + text.substring(end);
    setBody(newValue);
    
    setTimeout(() => {
      textarea.focus();
      const offset = selectedText ? selectedText.length : (formatType === 'link' ? 9 : 4);
      textarea.setSelectionRange(start + 2, start + 2 + offset);
    }, 50);
    triggerHaptic();
  };

  const handlePublish = async (e: React.FormEvent, isSaveScheduled: boolean) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      toast.warning('Please fill in all required fields');
      return;
    }

    if (selectedTag === 'Event' && (!eventDate || !eventLocation)) {
      toast.warning('Events require a date and location');
      return;
    }

    if (isSaveScheduled && (!schedDate || !schedTime)) {
      toast.warning('Please provide schedule date and time');
      return;
    }

    const existing = editingId ? announcements.find((ann) => ann.id === editingId) : undefined;
    if (editingId && !existing) {
      toast.error('This announcement is no longer available.');
      return;
    }

    setIsSaving(true);
    try {
      await saveAnnouncement({
        title,
        body,
        tag: selectedTag,
        pinned: isPinned,
        eventDate: selectedTag === 'Event' ? eventDate : undefined,
        eventTime: selectedTag === 'Event' ? eventTime : undefined,
        eventLocation: selectedTag === 'Event' ? eventLocation : undefined,
        expiryDate: expiryDate || undefined,
        scheduledDate: isSaveScheduled ? schedDate : undefined,
        scheduledTime: isSaveScheduled ? schedTime : undefined
      }, existing);
      toast.success(editingId
        ? 'Announcement updated successfully.'
        : isSaveScheduled ? 'Announcement scheduled.' : 'Announcement published.');
      setIsNewFormOpen(false);
      triggerHaptic();
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : 'Could not save this announcement.');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleExpand = (id: string) => {
    triggerHaptic();
    setExpandedIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Human Event Date formatter
  const formatEventDate = (dateStr?: string) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });
  };

  // Human Event Time formatter
  const formatEventTime = (timeStr?: string) => {
    if (!timeStr) return 'All Day';
    const [hourStr, minStr] = timeStr.split(':');
    const hour = parseInt(hourStr, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 === 0 ? 12 : hour % 12;
    return `${displayHour}:${minStr} ${ampm}`;
  };

  // Dynamic time elapsed string
  const formatPublishedDate = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);

    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  // Custom Rich Text parsing into safe HTML elements
  const parseFormatting = (text: string): React.ReactNode[] => {
    const regex = /(\*\*.*?\*\*|\*.*?\*|\[.*?\]\(.*?\))/g;
    const parts = text.split(regex);
    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={index} className="font-extrabold text-theme-text">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('*') && part.endsWith('*')) {
        return <em key={index} className="italic text-theme-text-secondary">{part.slice(1, -1)}</em>;
      }
      if (part.startsWith('[') && part.includes('](') && part.endsWith(')')) {
        const mid = part.indexOf('](');
        const linkText = part.slice(1, mid);
        const url = part.slice(mid + 2, -1);
        return (
          <a
            key={index}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gold-500 font-bold hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {linkText}
          </a>
        );
      }
      return part;
    });
  };

  // Open Calendar choices BottomSheet
  const handleAddToCalendarClick = (ann: Announcement) => {
    if (!ann.eventDate) return;
    triggerHaptic();
    setSelectedCalendarEvent(ann);
    setIsCalendarSheetOpen(true);
  };

  const handleSelectIcs = () => {
    if (!selectedCalendarEvent) return;
    triggerHaptic();
    const success = exportToIcs({
      title: selectedCalendarEvent.title,
      body: selectedCalendarEvent.body,
      eventDate: selectedCalendarEvent.eventDate!,
      eventTime: selectedCalendarEvent.eventTime,
      eventLocation: selectedCalendarEvent.eventLocation
    });
    if (success) {
      setAddedEventIds(prev => ({ ...prev, [selectedCalendarEvent.id]: true }));
      toast.success('Added to calendar ✓');
      setIsCalendarSheetOpen(false);
    } else {
      toast.error('Failed to export event');
    }
  };

  const handleSelectGoogle = () => {
    if (!selectedCalendarEvent) return;
    triggerHaptic();
    const url = buildGoogleCalendarUrl({
      title: selectedCalendarEvent.title,
      body: selectedCalendarEvent.body,
      eventDate: selectedCalendarEvent.eventDate!,
      eventTime: selectedCalendarEvent.eventTime,
      eventLocation: selectedCalendarEvent.eventLocation
    });
    window.open(url, '_blank');
    setAddedEventIds(prev => ({ ...prev, [selectedCalendarEvent.id]: true }));
    toast.success('Added to calendar ✓');
    setIsCalendarSheetOpen(false);
  };

  const handleSelectCopy = async () => {
    if (!selectedCalendarEvent) return;
    triggerHaptic();
    const success = await copyEventDetails({
      title: selectedCalendarEvent.title,
      body: selectedCalendarEvent.body,
      eventDate: selectedCalendarEvent.eventDate!,
      eventTime: selectedCalendarEvent.eventTime,
      eventLocation: selectedCalendarEvent.eventLocation
    });
    if (success) {
      toast.success('Event details copied to clipboard!');
      setIsCalendarSheetOpen(false);
    } else {
      toast.error('Failed to copy details');
    }
  };

  // Calculate sort lists
  const getSortedAnnouncements = (list: Announcement[]) => {
    return [...list].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return b.createdAtMs - a.createdAtMs;
    });
  };

  // Filter lists based on role view
  const activeAdminList = getSortedAnnouncements(
    announcements.filter(ann => refreshStatus(ann).status === adminTab)
  );

  const activeMemberList = getSortedAnnouncements(
    announcements.filter(ann => {
      const refreshed = refreshStatus(ann);
      if (refreshed.status !== 'Active') return false; // Members only see Active
      
      if (activeFilter === 'Events') return refreshed.tag === 'Event';
      if (activeFilter === 'Urgent') return refreshed.tag === 'Urgent';
      if (activeFilter === 'Pinned') return refreshed.pinned;
      return true; // "All" filter
    })
  );

  const tagColors: Record<string, 'gold' | 'cathedral' | 'sage' | 'muted'> = {
    General: 'muted',
    Urgent: 'cathedral',
    Event: 'gold',
    Reminder: 'sage'
  };

  return (
    <div className="space-y-4">
      {(isLoading || error || isRefreshing) && (
        <div className={`rounded-xl border px-3 py-2 text-[11px] font-semibold ${
          error
            ? 'border-cathedral-500/25 bg-cathedral-500/5 text-cathedral-600 dark:text-cathedral-300'
            : 'border-theme-border bg-theme-bg-secondary text-theme-text-muted'
        }`}>
          {error || (isLoading ? 'Loading saved announcements…' : 'Refreshing announcements…')}
        </div>
      )}
      {/* ==========================================
          ADMIN / PASTOR VIEW
          ========================================== */}
      {currentRole.isAdmin ? (
        <div className="space-y-4">
          <SectionTitle
            id="admin-ann-section-title"
            title="Announcements"
            action={{
              label: '+ New',
              onPress: handleOpenNewForm
            }}
          />

          {/* Admin Tab Strip */}
          <div id="admin-tab-strip" className="flex gap-1.5 p-1 rounded-2xl bg-theme-bg-secondary border border-theme-border">
            {(['Active', 'Scheduled', 'Expired'] as const).map((tab) => {
              const count = announcements.filter(ann => refreshStatus(ann).status === tab).length;
              const isActive = adminTab === tab;
              return (
                <button
                  id={`admin-tab-${tab.toLowerCase()}`}
                  key={tab}
                  onClick={() => { triggerHaptic(); setAdminTab(tab); }}
                  className={`flex-1 py-2 text-center text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer ${
                    isActive 
                      ? 'bg-gold-500 text-black shadow-md font-black' 
                      : 'text-theme-text-secondary hover:bg-theme-text/5'
                  }`}
                >
                  {tab} ({count})
                </button>
              );
            })}
          </div>

          {/* Announcement List - Admin */}
          <div className="space-y-3.5">
            <AnimatePresence mode="popLayout">
              {activeAdminList.length === 0 ? (
                <motion.div
                  key={`admin-empty-${adminTab}`}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center py-12 px-4 rounded-3xl bg-theme-bg-secondary/20 border border-theme-border border-dashed"
                >
                  <Calendar className="w-10 h-10 text-theme-text-muted mx-auto mb-3 stroke-[1.5]" />
                  <p className="text-sm font-bold text-theme-text-secondary">
                    No {adminTab.toLowerCase()} announcements
                  </p>
                  <p className="text-xs text-theme-text-muted mt-1">
                    Tap "+ New" above to create or schedule a message.
                  </p>
                </motion.div>
              ) : (
                activeAdminList.map((ann) => (
                  <motion.div
                    key={ann.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    layout
                  >
                    <GlassCard
                      id={`admin-card-${ann.id}`}
                      variant={ann.pinned ? 'elevated' : 'default'}
                      className={`relative overflow-hidden transition-all ${
                        ann.pinned ? 'border-l-4 border-l-gold-500' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1.5 flex-1">
                          <div className="flex items-center gap-2">
                            <AccentBadge
                              label={ann.tag}
                              variant={tagColors[ann.tag] || 'muted'}
                              size="sm"
                            />
                            {ann.pinned && (
                              <Pin className="w-3.5 h-3.5 text-gold-500 fill-gold-500" />
                            )}
                          </div>

                          <h4 className={`${Typography.SUBTITLE} text-theme-text font-black pr-6`}>
                            {ann.title}
                          </h4>

                          <p className="text-[10px] text-theme-text-muted font-bold font-mono uppercase">
                            Published {ann.timestamp || formatPublishedDate(ann.createdAtMs)} · By {ann.author} ({ann.roleLabel})
                          </p>
                        </div>

                        {/* Three dot drop-down trigger */}
                        <div className="relative">
                          <button
                            id={`menu-trigger-${ann.id}`}
                            onClick={() => { triggerHaptic(); setOpenMenuId(openMenuId === ann.id ? null : ann.id); }}
                            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-theme-text/5 text-theme-text-muted hover:text-theme-text transition-colors cursor-pointer"
                          >
                            <MoreVertical className="w-4.5 h-4.5" />
                          </button>

                          {/* Absolute Dropdown */}
                          <AnimatePresence>
                            {openMenuId === ann.id && (
                              <>
                                {/* Click Out Backdrop overlay */}
                                <div 
                                  className="fixed inset-0 z-40" 
                                  onClick={() => setOpenMenuId(null)} 
                                />
                                <motion.div
                                  initial={{ opacity: 0, scale: 0.95, y: -5 }}
                                  animate={{ opacity: 1, scale: 1, y: 0 }}
                                  exit={{ opacity: 0, scale: 0.95, y: -5 }}
                                  transition={{ duration: 0.15 }}
                                  className="absolute right-0 mt-1 w-40 bg-theme-bg-secondary border border-theme-border rounded-2xl shadow-xl z-50 py-1.5 overflow-hidden"
                                >
                                  <button
                                    id={`menu-edit-${ann.id}`}
                                    onClick={() => handleEditClick(ann)}
                                    className="w-full px-4 py-2 text-left text-xs font-bold text-theme-text hover:bg-theme-text/5 flex items-center gap-2 transition-colors cursor-pointer"
                                  >
                                    <Edit3 className="w-3.5 h-3.5 text-gold-500" />
                                    <span>Edit</span>
                                  </button>

                                  <button
                                    id={`menu-pin-${ann.id}`}
                                    onClick={() => handleTogglePin(ann)}
                                    className="w-full px-4 py-2 text-left text-xs font-bold text-theme-text hover:bg-theme-text/5 flex items-center gap-2 transition-colors cursor-pointer"
                                  >
                                    {ann.pinned ? (
                                      <>
                                        <PinOff className="w-3.5 h-3.5 text-theme-text-muted" />
                                        <span>Unpin</span>
                                      </>
                                    ) : (
                                      <>
                                        <Pin className="w-3.5 h-3.5 text-gold-500 fill-gold-500" />
                                        <span>Pin to top</span>
                                      </>
                                    )}
                                  </button>

                                  <button
                                    id={`menu-duplicate-${ann.id}`}
                                    onClick={() => handleDuplicate(ann)}
                                    className="w-full px-4 py-2 text-left text-xs font-bold text-theme-text hover:bg-theme-text/5 flex items-center gap-2 transition-colors cursor-pointer"
                                  >
                                    <Copy className="w-3.5 h-3.5 text-sage-400" />
                                    <span>Duplicate</span>
                                  </button>

                                  <div className="border-t border-theme-border my-1" />

                                  <button
                                    id={`menu-archive-${ann.id}`}
                                    onClick={() => void handleArchive(ann)}
                                    className="w-full px-4 py-2 text-left text-xs font-bold text-cathedral-500 hover:bg-cathedral-500/10 flex items-center gap-2 transition-colors cursor-pointer"
                                  >
                                    <Archive className="w-3.5 h-3.5" />
                                    <span>Archive</span>
                                  </button>
                                </motion.div>
                              </>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>

                      {/* Display prominent Event Box if Event Category */}
                      {ann.tag === 'Event' && ann.eventDate && (
                        <div className="mt-3.5 p-3 rounded-2xl bg-theme-bg-secondary border border-theme-border flex items-center gap-3.5 text-xs">
                          <div className="w-9 h-9 rounded-xl bg-gold-500/15 text-gold-500 flex items-center justify-center flex-shrink-0">
                            <Calendar className="w-5 h-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-extrabold text-theme-text leading-snug">
                              {formatEventDate(ann.eventDate)}
                            </p>
                            <p className="text-[10px] text-theme-text-secondary mt-0.5 font-semibold">
                              {formatEventTime(ann.eventTime)} · {ann.eventLocation || 'Main Sanctuary'}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Snippet / Expanded Text */}
                      <div className="mt-3 text-xs leading-relaxed text-theme-text-secondary font-medium">
                        <p className={expandedIds[ann.id] ? '' : 'line-clamp-2 text-ellipsis overflow-hidden'}>
                          {parseFormatting(ann.body)}
                        </p>
                        
                        {ann.body.length > 100 && (
                          <button
                            id={`admin-expand-btn-${ann.id}`}
                            onClick={() => toggleExpand(ann.id)}
                            className="text-gold-500 font-extrabold text-xs mt-1.5 flex items-center gap-1 cursor-pointer hover:underline"
                          >
                            <span>{expandedIds[ann.id] ? 'Read Less' : 'Read More'}</span>
                            {expandedIds[ann.id] ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </div>

                      {/* Footer Details */}
                      {ann.expiryDate && (
                        <div className="mt-3 pt-2.5 border-t border-theme-border flex items-center gap-1 text-[10px] text-theme-text-muted font-semibold uppercase">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Expires after: {ann.expiryDate}</span>
                        </div>
                      )}
                      {ann.scheduledDate && (
                        <div className="mt-3 pt-2.5 border-t border-theme-border flex items-center gap-1 text-[10px] text-gold-500 font-semibold uppercase">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>Scheduled: {ann.scheduledDate} at {ann.scheduledTime}</span>
                        </div>
                      )}
                    </GlassCard>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        </div>
      ) : (
        /* ==========================================
            MEMBER VIEW
            ========================================== */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <SectionTitle
              id="member-ann-section-title"
              title="Announcements"
            />
            <button
              id="member-filter-toggle-btn"
              onClick={() => { triggerHaptic(); setShowMemberFilters(!showMemberFilters); }}
              className={`w-9 h-9 rounded-full flex items-center justify-center border transition-all cursor-pointer ${
                showMemberFilters 
                  ? 'bg-gold-500 border-gold-500 text-black shadow-md shadow-gold-500/20' 
                  : 'bg-theme-bg-secondary border-theme-border text-theme-text hover:bg-theme-text/5'
              }`}
            >
              <Filter className="w-4 h-4" />
            </button>
          </div>

          {/* Collapsible Member Filters */}
          <AnimatePresence>
            {(showMemberFilters || activeFilter !== 'All') && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div id="member-filter-row" className="flex items-center gap-1.5 overflow-x-auto pb-2 px-1 scrollbar-none">
                  {['All', 'Events', 'Urgent', 'Pinned'].map((filter) => (
                    <button
                      id={`member-filter-${filter.toLowerCase()}`}
                      key={filter}
                      onClick={() => {
                        triggerHaptic();
                        setActiveFilter(filter);
                      }}
                      className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                        activeFilter === filter
                          ? 'bg-gold-500 text-black shadow-md shadow-gold-500/10'
                          : 'bg-theme-bg-secondary border border-theme-border text-theme-text-secondary hover:bg-theme-text/5'
                      }`}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Member Feed Cards */}
          <div className="space-y-3.5">
            <AnimatePresence mode="popLayout">
              {activeMemberList.length === 0 ? (
                <motion.div
                  key={`member-empty-${activeFilter}`}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center py-12 px-4 rounded-3xl bg-theme-bg-secondary/10 border border-theme-border"
                >
                  <Tag className="w-10 h-10 text-theme-text-muted mx-auto mb-3 stroke-[1.5]" />
                  <p className="text-sm font-bold text-theme-text-secondary">
                    No active announcements found
                  </p>
                  <p className="text-xs text-theme-text-muted mt-1">
                    There are no current postings in this section. Check back soon!
                  </p>
                </motion.div>
              ) : (
                activeMemberList.map((ann) => {
                  const isExpanded = expandedIds[ann.id];
                  const isUrgent = ann.tag === 'Urgent';
                  
                  return (
                    <motion.div
                      key={ann.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      layout
                    >
                      <GlassCard
                        id={`member-card-${ann.id}`}
                        variant={ann.pinned ? 'elevated' : 'default'}
                        className={`relative overflow-hidden transition-all duration-300 ${
                          ann.pinned
                            ? 'border-l-4 border-l-gold-500 dark:bg-gold-500/[0.03] bg-gold-50/20'
                            : isUrgent
                              ? 'border-l-4 border-l-cathedral-500'
                              : ''
                        }`}
                      >
                        {/* Pin Icon Top-Right for Members */}
                        {ann.pinned && (
                          <div className="absolute top-4.5 right-4.5 text-gold-500 flex items-center justify-center">
                            <Pin className="w-4 h-4 fill-gold-500" />
                          </div>
                        )}

                        <div className="space-y-2 pr-6">
                          {/* Badge layout */}
                          <div className="flex items-center gap-2">
                            {isUrgent ? (
                              <AccentBadge
                                label="URGENT"
                                variant="cathedral"
                                size="sm"
                              />
                            ) : (
                              <AccentBadge
                                label={ann.tag}
                                variant={tagColors[ann.tag] || 'muted'}
                                size="sm"
                              />
                            )}
                          </div>

                          {/* Title */}
                          <h4 className={`${Typography.SUBTITLE} text-theme-text font-black tracking-tight leading-snug`}>
                            {ann.title}
                          </h4>

                          {/* Author Caption */}
                          <p className={`${Typography.CAPTION} text-theme-text-muted font-bold font-mono uppercase`}>
                            Published by: {ann.author} · {ann.timestamp || formatPublishedDate(ann.createdAtMs)}
                          </p>
                        </div>

                        {/* Event Date Block (highlighted styled surface block) */}
                        {ann.tag === 'Event' && ann.eventDate && (
                          <div className="mt-3.5 p-3.5 bg-cathedral-50 dark:bg-surface-200 rounded-button border border-theme-border flex flex-col gap-2 shadow-sm">
                            <div className="flex items-center gap-2 text-theme-text">
                              <Calendar className="w-4.5 h-4.5 text-gold-500" />
                              <span className="font-extrabold text-xs">
                                📅 {formatEventDate(ann.eventDate)}
                              </span>
                            </div>
                            
                            <div className="text-xs text-theme-text-secondary font-semibold pl-6 flex flex-col gap-0.5">
                              <span>{formatEventTime(ann.eventTime)} · {ann.eventLocation || 'Main Sanctuary'}</span>
                            </div>

                            {/* Add to Calendar Button with dynamic state */}
                            {addedEventIds[ann.id] ? (
                              <div className="mt-1.5 w-full h-8.5 rounded-full bg-sage-500/10 text-sage-600 dark:text-sage-400 font-extrabold text-[11px] uppercase tracking-wider flex items-center justify-center gap-1.5 border border-sage-500/20">
                                <span>Added ✓</span>
                              </div>
                            ) : (
                              <button
                                id={`calendar-add-btn-${ann.id}`}
                                onClick={() => handleAddToCalendarClick(ann)}
                                className="mt-1.5 w-full h-8.5 rounded-full bg-gold-500/10 hover:bg-gold-500 text-gold-500 hover:text-black font-extrabold text-[11px] uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>+ Add to Calendar</span>
                              </button>
                            )}
                          </div>
                        )}

                        {/* Body previews with height expand transition */}
                        <div className="mt-3 text-xs leading-relaxed text-theme-text-secondary font-medium">
                          <p className={isExpanded ? '' : 'line-clamp-3 text-ellipsis overflow-hidden'}>
                            {parseFormatting(ann.body)}
                          </p>
                          
                          {ann.body.length > 130 && (
                            <button
                              id={`member-expand-btn-${ann.id}`}
                              onClick={() => toggleExpand(ann.id)}
                              className="text-gold-500 font-extrabold text-xs mt-2 flex items-center gap-0.5 cursor-pointer hover:underline"
                            >
                              <span>{isExpanded ? 'Read Less' : 'Read More'}</span>
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>
                      </GlassCard>
                    </motion.div>
                  );
                })
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* ==========================================
          ADMIN EDIT/NEW BOTTOM SHEET FORM
          ========================================== */}
      <BottomSheet
        id="announcement-editor-bottomsheet"
        isOpen={isNewFormOpen}
        onClose={() => setIsNewFormOpen(false)}
        title={editingId ? "Edit Announcement" : "Create New Announcement"}
        detents={['full']}
      >
        <form onSubmit={(e) => handlePublish(e, isScheduling)} className="space-y-4 px-4 pb-10 pt-1.5 text-left">
          
          {/* Title block */}
          <div className="space-y-1.5">
            <label className="text-xs font-extrabold text-theme-text-secondary block">
              Title <span className="text-cathedral-500">*</span>
            </label>
            <GlassCard variant="solid" className="p-0 h-12 flex items-center overflow-hidden">
              <input
                id="ann-title-input"
                type="text"
                placeholder="E.g., Holy Convocation Opening Ceremony"
                className="w-full h-full px-4 bg-transparent outline-none text-sm text-theme-text font-bold placeholder:font-normal placeholder:text-theme-text-muted/60"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={80}
                required
              />
            </GlassCard>
          </div>

          {/* Category Pill selector */}
          <div className="space-y-2">
            <label className="text-xs font-extrabold text-theme-text-secondary block">
              Category Channel <span className="text-cathedral-500">*</span>
            </label>
            <div id="form-category-row" className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {(['General', 'Urgent', 'Event', 'Reminder'] as const).map((tag) => {
                const isActive = selectedTag === tag;
                return (
                  <button
                    id={`form-category-${tag.toLowerCase()}`}
                    key={tag}
                    type="button"
                    onClick={() => {
                      triggerHaptic();
                      setSelectedTag(tag);
                    }}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-extrabold transition-all cursor-pointer whitespace-nowrap ${
                      isActive
                        ? 'bg-gold-500 text-black shadow-md'
                        : 'bg-theme-bg-secondary border border-theme-border text-theme-text-secondary hover:bg-theme-text/5'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Rich Body details with Insert buttons */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-extrabold text-theme-text-secondary">
                Announcement Body Details <span className="text-cathedral-500">*</span>
              </label>
              
              {/* Toolbar */}
              <div id="formatting-toolbar" className="flex items-center gap-1">
                <button
                  id="format-bold-btn"
                  type="button"
                  onClick={() => insertFormat('bold')}
                  className="px-2 py-0.5 rounded bg-theme-bg-secondary border border-theme-border text-[11px] font-extrabold text-theme-text-secondary hover:text-theme-text transition-colors cursor-pointer"
                  title="Insert Bold Text"
                >
                  B
                </button>
                <button
                  id="format-italic-btn"
                  type="button"
                  onClick={() => insertFormat('italic')}
                  className="px-2 py-0.5 rounded bg-theme-bg-secondary border border-theme-border text-[11px] italic font-semibold text-theme-text-secondary hover:text-theme-text transition-colors cursor-pointer"
                  title="Insert Italic Text"
                >
                  I
                </button>
                <button
                  id="format-link-btn"
                  type="button"
                  onClick={() => insertFormat('link')}
                  className="px-2 py-0.5 rounded bg-theme-bg-secondary border border-theme-border text-[11px] font-bold text-theme-text-secondary hover:text-theme-text transition-colors cursor-pointer"
                  title="Insert Markdown Link"
                >
                  🔗 Link
                </button>
              </div>
            </div>

            <GlassCard variant="solid" className="p-0 h-[130px] flex items-start overflow-hidden">
              <textarea
                id="ann-body-textarea"
                placeholder="Describe the announcement details. Use buttons above for formatting: **bold**, *italics*, [Links](url)."
                className="w-full h-full p-3.5 bg-transparent outline-none text-xs text-theme-text resize-none placeholder:font-normal leading-relaxed"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={600}
                required
              />
            </GlassCard>
          </div>

          {/* Event Details Section (shown only when category is Event) */}
          <AnimatePresence>
            {selectedTag === 'Event' && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="space-y-3 p-3.5 rounded-2xl bg-theme-bg-secondary border border-theme-border overflow-hidden"
              >
                <p className="text-[10px] font-bold text-gold-500 uppercase tracking-widest flex items-center gap-1 mb-1">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Event Logistics</span>
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-theme-text-secondary">
                      Event Date <span className="text-cathedral-500">*</span>
                    </label>
                    <input
                      id="event-date-input"
                      type="date"
                      className="w-full h-10 px-3 rounded-xl bg-theme-bg border border-theme-border text-xs text-theme-text outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500"
                      value={eventDate}
                      onChange={(e) => setEventDate(e.target.value)}
                      required={selectedTag === 'Event'}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-theme-text-secondary">
                      Event Time
                    </label>
                    <input
                      id="event-time-input"
                      type="time"
                      className="w-full h-10 px-3 rounded-xl bg-theme-bg border border-theme-border text-xs text-theme-text outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500"
                      value={eventTime}
                      onChange={(e) => setEventTime(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-theme-text-secondary">
                    Location Location Location <span className="text-cathedral-500">*</span>
                  </label>
                  <div className="relative h-10 flex items-center bg-theme-bg border border-theme-border rounded-xl px-3.5 gap-2 focus-within:border-gold-500">
                    <MapPin className="w-3.5 h-3.5 text-theme-text-muted" />
                    <input
                      id="event-location-input"
                      type="text"
                      placeholder="E.g., Main Sanctuary, Galilee Hall"
                      className="w-full h-full bg-transparent outline-none text-xs text-theme-text"
                      value={eventLocation}
                      onChange={(e) => setEventLocation(e.target.value)}
                      required={selectedTag === 'Event'}
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Pin to Top Toggle */}
          <div id="pin-toggle-row" className="flex items-center justify-between py-2.5 border-y border-theme-border">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full flex items-center justify-center bg-gold-500/10 text-gold-500">
                <Pin className="w-4 h-4 fill-gold-500" />
              </div>
              <div className="text-left">
                <span className="text-xs font-bold text-theme-text block">
                  Pin to Top
                </span>
                <span className="text-[9px] text-theme-text-secondary block">
                  Pinned posts appear at the top of feeds
                </span>
              </div>
            </div>
            
            <button
              id="form-pin-toggle"
              type="button"
              onClick={() => {
                triggerHaptic();
                setIsPinned(!isPinned);
              }}
              className={`w-11 h-6.5 rounded-full p-0.5 transition-colors duration-300 focus:outline-none cursor-pointer ${
                isPinned ? 'bg-gold-500' : 'bg-theme-bg-secondary border border-theme-border'
              }`}
            >
              <div
                className={`w-5.5 h-5.5 rounded-full shadow-md transform transition-transform duration-300 ${
                  isPinned ? 'translate-x-4.5 bg-black' : 'translate-x-0 bg-theme-text-secondary'
                }`}
              />
            </button>
          </div>

          {/* Expiry Date (Optional) */}
          <div className="space-y-1.5 text-left">
            <div className="flex items-center justify-between">
              <label className="text-xs font-extrabold text-theme-text-secondary block">
                Auto-Expire Date (Optional)
              </label>
              {expiryDate && (
                <button
                  id="clear-expiry-btn"
                  type="button"
                  onClick={() => setExpiryDate('')}
                  className="text-[10px] text-cathedral-500 hover:underline font-bold"
                >
                  Clear Expiry
                </button>
              )}
            </div>
            <input
              id="expiry-date-input"
              type="date"
              className="w-full h-10 px-3.5 rounded-xl bg-theme-bg border border-theme-border text-xs text-theme-text outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
            />
            <span className="text-[9px] text-theme-text-muted block">
              Announcement will be auto-hidden from feed after this date.
            </span>
          </div>

          {/* Publishing Mode: Immediate or Scheduled */}
          <div className="space-y-3 p-3.5 rounded-2xl bg-theme-bg-secondary border border-theme-border text-left">
            <div className="flex items-center justify-between">
              <label className="text-xs font-extrabold text-theme-text-secondary">
                Publishing Schedule
              </label>
              
              <div id="schedule-toggle" className="flex gap-1 bg-theme-bg p-0.5 rounded-lg border border-theme-border">
                <button
                  id="sched-now-btn"
                  type="button"
                  onClick={() => { triggerHaptic(); setIsScheduling(false); }}
                  className={`px-2.5 py-1 text-[10px] font-black uppercase rounded transition-all ${!isScheduling ? 'bg-gold-500 text-black' : 'text-theme-text-secondary'}`}
                >
                  Immediate
                </button>
                <button
                  id="sched-later-btn"
                  type="button"
                  onClick={() => { triggerHaptic(); setIsScheduling(true); }}
                  className={`px-2.5 py-1 text-[10px] font-black uppercase rounded transition-all ${isScheduling ? 'bg-gold-500 text-black' : 'text-theme-text-secondary'}`}
                >
                  Later
                </button>
              </div>
            </div>

            <AnimatePresence>
              {isScheduling && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="grid grid-cols-2 gap-3 pt-2 border-t border-theme-border/60 overflow-hidden"
                >
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-theme-text-secondary block">
                      Release Date <span className="text-cathedral-500">*</span>
                    </label>
                    <input
                      id="sched-date-input"
                      type="date"
                      className="w-full h-10 px-3 rounded-xl bg-theme-bg border border-theme-border text-xs text-theme-text outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500"
                      value={schedDate}
                      onChange={(e) => setSchedDate(e.target.value)}
                      required={isScheduling}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-theme-text-secondary block">
                      Release Time <span className="text-cathedral-500">*</span>
                    </label>
                    <input
                      id="sched-time-input"
                      type="time"
                      className="w-full h-10 px-3 rounded-xl bg-theme-bg border border-theme-border text-xs text-theme-text outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500"
                      value={schedTime}
                      onChange={(e) => setSchedTime(e.target.value)}
                      required={isScheduling}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Publish / Schedule Buttons */}
          <div className="pt-2 flex flex-col gap-2">
            {!isScheduling ? (
              <button
                id="form-publish-now-btn"
                type="submit"
                disabled={isSaving}
                className="w-full h-12 bg-gold-500 hover:bg-gold-600 disabled:opacity-60 disabled:cursor-wait text-black font-black tracking-wider text-xs rounded-button transition-colors shadow-lg cursor-pointer flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                <span>{isSaving ? 'Saving…' : editingId ? "Save & Publish Changes" : "Publish Announcement Now"}</span>
              </button>
            ) : (
              <button
                id="form-schedule-later-btn"
                type="submit"
                disabled={isSaving}
                className="w-full h-12 border border-gold-500 text-gold-500 hover:bg-gold-500/10 disabled:opacity-60 disabled:cursor-wait font-black tracking-wider text-xs rounded-button transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <Calendar className="w-4 h-4" />
                <span>{isSaving ? 'Saving…' : editingId ? "Save Scheduled Settings" : "Schedule Announcement"}</span>
              </button>
            )}
          </div>
        </form>
      </BottomSheet>

      {/* Calendar Export Options BottomSheet */}
      <BottomSheet
        id="calendar-export-sheet"
        isOpen={isCalendarSheetOpen}
        onClose={() => setIsCalendarSheetOpen(false)}
        title="Add Event to Calendar"
      >
        <div className="space-y-4 pb-6 pt-2">
          <p className="text-xs text-theme-text-secondary leading-relaxed font-semibold">
            Select your preferred calendar application to import <strong className="text-theme-text">"{selectedCalendarEvent?.title}"</strong>:
          </p>

          <div className="grid grid-cols-1 gap-2.5">
            <button
              id="calendar-option-apple"
              onClick={handleSelectIcs}
              className="w-full h-13 px-4 rounded-xl bg-theme-bg-secondary hover:bg-theme-text/5 border border-theme-border flex items-center justify-between text-left transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-cathedral-500/10 text-cathedral-600 dark:text-cathedral-400 flex items-center justify-center">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-black text-theme-text">Apple Calendar / Outlook</p>
                  <p className="text-[10px] text-theme-text-muted font-medium">Downloads standard universal .ics file</p>
                </div>
              </div>
              <ChevronDown className="w-4 h-4 text-theme-text-muted -rotate-90 group-hover:text-theme-text transition-colors" />
            </button>

            <button
              id="calendar-option-google"
              onClick={handleSelectGoogle}
              className="w-full h-13 px-4 rounded-xl bg-theme-bg-secondary hover:bg-theme-text/5 border border-theme-border flex items-center justify-between text-left transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-gold-500/10 text-gold-600 dark:text-gold-400 flex items-center justify-center">
                  <Send className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-black text-theme-text">Google Calendar (Web/Android)</p>
                  <p className="text-[10px] text-theme-text-muted font-medium">Opens Google Calendar with prefilled details</p>
                </div>
              </div>
              <ChevronDown className="w-4 h-4 text-theme-text-muted -rotate-90 group-hover:text-theme-text transition-colors" />
            </button>

            <button
              id="calendar-option-copy"
              onClick={handleSelectCopy}
              className="w-full h-13 px-4 rounded-xl bg-theme-bg-secondary hover:bg-theme-text/5 border border-theme-border flex items-center justify-between text-left transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-theme-text/5 text-theme-text-secondary flex items-center justify-center">
                  <Copy className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-black text-theme-text">Copy Event Details</p>
                  <p className="text-[10px] text-theme-text-muted font-medium">Copies formatted date, time, and info</p>
                </div>
              </div>
              <ChevronDown className="w-4 h-4 text-theme-text-muted -rotate-90 group-hover:text-theme-text transition-colors" />
            </button>
          </div>

          <button
            id="calendar-cancel-btn"
            onClick={() => setIsCalendarSheetOpen(false)}
            className="w-full h-11 border border-theme-border text-theme-text-secondary hover:bg-theme-text/5 text-xs font-bold rounded-xl transition-all cursor-pointer mt-2"
          >
            Cancel
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
