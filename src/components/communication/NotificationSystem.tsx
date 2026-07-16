import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Megaphone, 
  Heart, 
  Clipboard, 
  Award, 
  Bell, 
  Trash2, 
  Check, 
  Sparkles, 
  Clock, 
  X, 
  UserCheck, 
  BookOpen, 
  ShieldAlert, 
  ArrowRight,
  ShieldCheck,
  CalendarDays
} from 'lucide-react';
import { useNotifications, useCurrentUser } from '../../lib/db/hooks';
import { db, generateUUID, type NotificationRecord } from '../../lib/db/churchConnectDB';
import { GlassCard, AccentBadge } from '../shared';
import { useToast } from '../shared/toast/useToast';
import { setAppBadge } from '../../lib/notifications/pwaService';

// Define the 12 triggers and events
export interface TriggerTemplate {
  id: string;
  event: string;
  roleDescription: string;
  type: 'announcement' | 'prayer' | 'report' | 'certificate' | 'system';
  title: string;
  message: string;
  actionUrl: string;
  isPush: boolean;
  isInApp: boolean;
  targetRole: 'all' | 'admin' | 'intercessor' | 'submitter' | 'pastor' | 'cell_leader' | 'member';
}

export const NOTIFICATION_TRIGGER_TEMPLATES: TriggerTemplate[] = [
  {
    id: 'trig-1',
    event: 'New announcement published',
    roleDescription: 'All members',
    type: 'announcement',
    title: 'Divine Awakening Convocation 2026',
    message: 'The annual Holy Convocation starts next Friday. Make plans to attend with your cell group!',
    actionUrl: 'announcements',
    isPush: true,
    isInApp: true,
    targetRole: 'all'
  },
  {
    id: 'trig-2',
    event: 'Prayer request submitted',
    roleDescription: 'Admins (for triage)',
    type: 'prayer',
    title: 'New Healing Request For Triage',
    message: 'Sister Elizabeth has submitted a prayer request regarding a critical surgery scheduled for Monday.',
    actionUrl: 'prayer',
    isPush: true,
    isInApp: true,
    targetRole: 'admin'
  },
  {
    id: 'trig-3',
    event: 'Prayer assigned to intercessor',
    roleDescription: 'The assigned intercessor',
    type: 'prayer',
    title: 'Intercessory Assignment Received',
    message: 'You have been assigned to cover Brother Daniel\'s spiritual guidance prayer request.',
    actionUrl: 'prayer',
    isPush: true,
    isInApp: true,
    targetRole: 'intercessor'
  },
  {
    id: 'trig-4',
    event: 'Prayer marked as answered',
    roleDescription: 'Original submitter',
    type: 'prayer',
    title: 'Hallelujah! Your prayer is answered',
    message: 'Pastor Michael has updated the healing prayer list with testimonies of complete restoration.',
    actionUrl: 'prayer',
    isPush: true,
    isInApp: true,
    targetRole: 'submitter'
  },
  {
    id: 'trig-5',
    event: 'Cell report submitted',
    roleDescription: 'Lead Pastor + section admin',
    type: 'report',
    title: 'New Fellowship Cell Report submitted',
    message: 'Hope Fellowship Cell report has been submitted by Michael. 12 Saints attended.',
    actionUrl: 'reports',
    isPush: true,
    isInApp: true,
    targetRole: 'pastor'
  },
  {
    id: 'trig-6',
    event: 'Cell report approved',
    roleDescription: 'The cell leader who submitted',
    type: 'report',
    title: 'Your Cell Report is Approved',
    message: 'Section Pastor David approved your Cell Meeting attendance report for week 26.',
    actionUrl: 'reports',
    isPush: true,
    isInApp: true,
    targetRole: 'cell_leader'
  },
  {
    id: 'trig-7',
    event: 'Certificate ready',
    roleDescription: 'The member who earned it',
    type: 'certificate',
    title: 'Discipleship Diploma Ready!',
    message: 'Congratulations! Your Leadership Academy Level 2 Certificate has been verified and signed.',
    actionUrl: 'profile',
    isPush: true,
    isInApp: true,
    targetRole: 'member'
  },
  {
    id: 'trig-8',
    event: 'Missed fellowship reminder',
    roleDescription: 'Cell leaders who haven\'t submitted',
    type: 'system',
    title: 'Pending Cell Fellowship Report',
    message: 'Reminder: Cell reports are due within 24 hours of fellowship. Please submit attendance.',
    actionUrl: 'reports',
    isPush: true,
    isInApp: true,
    targetRole: 'cell_leader'
  },
  {
    id: 'trig-9',
    event: 'New member enrolled',
    roleDescription: 'The new member (welcome)',
    type: 'system',
    title: 'Welcome to the Church Family! 🕊',
    message: 'We are overjoyed to welcome you. Your QR Saints Membership Pass is now live in your profile.',
    actionUrl: 'profile',
    isPush: false,
    isInApp: true,
    targetRole: 'member'
  },
  {
    id: 'trig-10',
    event: 'Course enrollment confirmed',
    roleDescription: 'The enrolled member',
    type: 'system',
    title: 'Course Enrollment Confirmed',
    message: 'You are enrolled in Discipleship 101: Foundation Principles. Classes begin this Saturday.',
    actionUrl: 'profile',
    isPush: false,
    isInApp: true,
    targetRole: 'member'
  },
  {
    id: 'trig-11',
    event: 'Training session reminder',
    roleDescription: 'Enrolled members, 1 day before',
    type: 'system',
    title: 'Academy Training Session Tomorrow',
    message: 'Reminder: The next classroom session of leadership starts tomorrow at 10:00 AM.',
    actionUrl: 'profile',
    isPush: true,
    isInApp: true,
    targetRole: 'member'
  },
  {
    id: 'trig-12',
    event: 'Role or department change',
    roleDescription: 'The affected member',
    type: 'system',
    title: 'Department Clearance Granted',
    message: 'Admin sarah approved your shift request to the Intercessory Ministry department.',
    actionUrl: 'profile',
    isPush: false,
    isInApp: true,
    targetRole: 'member'
  }
];

// Relative time formatting helper
export function getRelativeTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (diffMs < 0) return 'Just now';

    const diffMins = Math.floor(diffMs / (60 * 1000));
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch (e) {
    return 'Recently';
  }
}

// Grouping helper
interface GroupedNotifications {
  Today: NotificationRecord[];
  Yesterday: NotificationRecord[];
  'This Week': NotificationRecord[];
  Earlier: NotificationRecord[];
}

export function groupNotifications(notifs: NotificationRecord[]): GroupedNotifications {
  const grouped: GroupedNotifications = {
    Today: [],
    Yesterday: [],
    'This Week': [],
    Earlier: []
  };

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
  const thisWeekStart = todayStart - 7 * 24 * 60 * 60 * 1000;

  notifs.forEach(notif => {
    try {
      const time = new Date(notif.createdAt).getTime();
      if (time >= todayStart) {
        grouped.Today.push(notif);
      } else if (time >= yesterdayStart) {
        grouped.Yesterday.push(notif);
      } else if (time >= thisWeekStart) {
        grouped['This Week'].push(notif);
      } else {
        grouped.Earlier.push(notif);
      }
    } catch (e) {
      grouped.Earlier.push(notif);
    }
  });

  return grouped;
}

// Icon mapper matching SettingsRow style circles
export function getNotificationIcon(type: NotificationRecord['type']) {
  switch (type) {
    case 'announcement':
      return {
        icon: <Megaphone className="w-4 h-4 text-gold-500 stroke-[2.5]" />,
        bg: 'bg-gold-500/10 dark:bg-gold-500/15 text-gold-500'
      };
    case 'prayer':
      return {
        icon: <Heart className="w-4 h-4 text-cathedral-400 stroke-[2.5]" />,
        bg: 'bg-cathedral-500/15 text-cathedral-400'
      };
    case 'report':
      return {
        icon: <Clipboard className="w-4 h-4 text-sage-400 stroke-[2.5]" />,
        bg: 'bg-sage-500/15 text-sage-400'
      };
    case 'certificate':
      return {
        icon: <Award className="w-4 h-4 text-gold-500 stroke-[2.5]" />,
        bg: 'bg-gold-500/15 text-gold-500'
      };
    case 'system':
    default:
      return {
        icon: <Bell className="w-4 h-4 text-text-secondary stroke-[2.5]" />,
        bg: 'bg-surface-300 dark:bg-surface-300/80 text-text-secondary'
      };
  }
}

interface NotificationSystemProps {
  onActiveTabChange?: (tab: string) => void;
  onClose?: () => void;
  currentRole?: any;
}

export function NotificationSystem({ onActiveTabChange, onClose, currentRole }: NotificationSystemProps) {
  const { user: dbUser, role: dbRole } = useCurrentUser();
  
  const activeRole = currentRole || dbRole;
  const activeUserId = currentRole
    ? (currentRole.id === 'lead_pastor' ? 'user-pastor-david' : 
       currentRole.id === 'admin' ? 'user-admin-sarah' :
       currentRole.id === 'cell_leader' ? 'user-cell-leader-michael' : 'user-member-clara')
    : dbUser.localId;

  const { notifications, unreadCount, markRead, markAllRead } = useNotifications(activeUserId);
  const toast = useToast();

  const [confirmDismissId, setConfirmDismissId] = useState<string | null>(null);
  const [showSimPanel, setShowSimPanel] = useState<boolean>(false);

  // Sync PWA badge count
  useEffect(() => {
    if ('setAppBadge' in navigator) {
      setAppBadge(unreadCount).catch(console.error);
    }
  }, [unreadCount]);

  // Subscribe to real-time notification simulation
  useEffect(() => {
    console.log('[PocketBase] Initializing mock real-time subscriptions for announcements, cell_meetings, notifications');
    
    // Simulate periodic announcement and meeting updates
    const interval = setInterval(() => {
      // 10% chance to simulate a real-time event
      if (Math.random() < 0.15) {
        // Pick a random template
        const randTemplate = NOTIFICATION_TRIGGER_TEMPLATES[Math.floor(Math.random() * NOTIFICATION_TRIGGER_TEMPLATES.length)];
        
        // Filter whether the active user is a suitable target
        let shouldDeliver = false;
        if (randTemplate.targetRole === 'all') {
          shouldDeliver = true;
        } else if (randTemplate.targetRole === 'admin' && activeRole.isAdmin) {
          shouldDeliver = true;
        } else if (randTemplate.targetRole === 'pastor' && activeRole.id === 'lead_pastor') {
          shouldDeliver = true;
        } else if (randTemplate.targetRole === 'cell_leader' && activeRole.id === 'cell_leader') {
          shouldDeliver = true;
        } else if (randTemplate.targetRole === 'member' && activeRole.id === 'member') {
          shouldDeliver = true;
        } else if (randTemplate.targetRole === 'intercessor' && (activeRole.id === 'cell_leader' || activeRole.isAdmin)) {
          shouldDeliver = true;
        } else if (randTemplate.targetRole === 'submitter' && activeRole.id === 'member') {
          shouldDeliver = true;
        }

        if (shouldDeliver) {
          triggerEvent(randTemplate);
        }
      }
    }, 45000); // Check every 45s

    return () => clearInterval(interval);
  }, [activeUserId, activeRole.id, activeRole.isAdmin]);

  const triggerEvent = async (template: TriggerTemplate) => {
    // 1. Create database record
    const newNotif: NotificationRecord = {
      localId: generateUUID(),
      userId: template.targetRole === 'all' ? 'all' : activeUserId,
      type: template.type,
      title: template.title,
      message: template.message,
      isRead: false,
      createdAt: new Date().toISOString(),
      actionUrl: template.actionUrl
    };

    await db.notifications.add(newNotif);

    // 2. Play subtle haptic feedback
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate([100, 50, 100]); } catch (e) {}
    }

    // 3. Show dynamic toast notification based on type
    const toastType = 
      template.type === 'announcement' ? 'success' : 
      template.type === 'prayer' ? 'error' : 
      template.type === 'report' ? 'info' : 
      template.type === 'certificate' ? 'warning' : 'info';

    toast.show(
      template.title,
      toastType,
      4000,
      () => {
        // Execute action URL on click
        if (onActiveTabChange && template.actionUrl) {
          onActiveTabChange(template.actionUrl);
          if (onClose) onClose();
        }
      }
    );

    // 4. Register Local Mock PWA Push Notification if enabled
    if (template.isPush && 'Notification' in window && Notification.permission === 'granted') {
      try {
        const reg = await navigator.serviceWorker.ready;
        reg.showNotification(template.title, {
          body: template.message,
          icon: '/churchconnect-logo.svg',
          badge: '/churchconnect-logo.svg',
          tag: template.id,
          vibrate: [100, 50, 100],
          data: { url: template.actionUrl }
        } as any);
      } catch (e) {
        new Notification(template.title, { body: template.message });
      }
    }
  };

  const handleDismiss = async (localId: string) => {
    const existing = await db.notifications.where('localId').equals(localId).first();
    if (existing && existing.id) {
      await db.notifications.delete(existing.id);
      toast.info('Notification dismissed');
    }
    setConfirmDismissId(null);
  };

  const handleNotificationTap = async (notif: NotificationRecord) => {
    // Mark as read
    await markRead(notif.localId);
    
    // Play haptic
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(10); } catch (e) {}
    }

    // Navigate to target tab
    if (notif.actionUrl && onActiveTabChange) {
      onActiveTabChange(notif.actionUrl);
      if (onClose) onClose();
    }
  };

  const groups = groupNotifications(notifications);
  const timeGroupKeys: (keyof GroupedNotifications)[] = ['Today', 'Yesterday', 'This Week', 'Earlier'];
  const hasNotifications = notifications.length > 0;

  return (
    <div className="space-y-4 select-none pb-8">
      {/* Header with Title & Action */}
      <div className="flex items-center justify-between border-b border-theme-border/10 pb-3 mt-1">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-black text-theme-text uppercase tracking-wider">
            Notifications
          </h3>
          {unreadCount > 0 && (
            <span className="bg-gold-500 text-black text-[9px] font-black px-1.5 py-0.5 rounded-full">
              {unreadCount} NEW
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSimPanel(!showSimPanel)}
            className="text-[10px] font-black text-theme-text-secondary border border-theme-border/30 px-2 py-1 rounded-md bg-theme-bg-secondary hover:bg-theme-text/5 cursor-pointer transition-colors"
          >
            {showSimPanel ? 'Hide Dev Sim' : 'Simulate Alerts'}
          </button>
          
          {unreadCount > 0 && (
            <button
              onClick={() => {
                markAllRead();
                toast.success('All notifications marked as read');
              }}
              className="text-xs font-bold text-gold-500 hover:underline cursor-pointer"
            >
              Mark All Read
            </button>
          )}
        </div>
      </div>

      {/* DEV SIMULATION PANEL */}
      <AnimatePresence>
        {showSimPanel && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <GlassCard className="p-3 border border-gold-500/20 bg-gold-500/[0.02] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-gold-500 uppercase tracking-widest flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Real-time Trigger Panel</span>
                </span>
                <span className="text-[9px] text-text-muted font-bold font-mono">
                  Target Role: {activeRole.label}
                </span>
              </div>
              
              <p className="text-[10px] text-theme-text-secondary leading-normal">
                Click any church event below to immediately trigger a **real-time subscription event** which adds to local state, triggers a custom **header-float Toast**, updates **home screen PWA badges**, and fires service worker native pushes.
              </p>

              <div className="grid grid-cols-2 gap-1.5 max-h-[160px] overflow-y-auto pr-1">
                {NOTIFICATION_TRIGGER_TEMPLATES.map((tmpl) => (
                  <button
                    key={tmpl.id}
                    onClick={() => triggerEvent(tmpl)}
                    className="p-1.5 rounded-lg border border-theme-border bg-theme-bg/60 text-left hover:bg-theme-text/5 cursor-pointer text-[9px] leading-snug flex flex-col justify-between hover:border-gold-500/40 transition-all"
                  >
                    <span className="font-extrabold text-theme-text truncate">{tmpl.event}</span>
                    <span className="text-text-muted mt-0.5 text-[8px] font-bold">To: {tmpl.roleDescription}</span>
                  </button>
                ))}
              </div>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Notifications List Grouped by Time */}
      <div className="space-y-4">
        {!hasNotifications ? (
          <div className="text-center py-16 px-4">
            <span className="text-3xl block mb-2">🕊</span>
            <p className="text-sm font-black text-theme-text-secondary">
              All caught up! 🕊
            </p>
            <p className="text-xs text-text-muted mt-1">
              You have no pending notification alerts at this time.
            </p>
          </div>
        ) : (
          timeGroupKeys.map((group) => {
            const list = groups[group];
            if (list.length === 0) return null;

            return (
              <div key={group} className="space-y-2">
                {/* Time Group Divider */}
                <h5 className="text-[10px] font-black uppercase tracking-widest text-text-muted px-1">
                  {group}
                </h5>

                <div className="space-y-2">
                  <AnimatePresence mode="popLayout">
                    {list.map((notif) => {
                      const details = getNotificationIcon(notif.type);
                      
                      return (
                        <motion.div
                          key={notif.localId}
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: -300 }}
                          transition={{ type: 'spring', stiffness: 350, damping: 28 }}
                          layout
                          className="relative overflow-hidden rounded-xl"
                        >
                          {/* Swipe background color (Cathedral color) */}
                          <div className="absolute inset-0 bg-cathedral-600 flex items-center justify-end pr-5 text-white rounded-xl">
                            <div className="flex flex-col items-center justify-center gap-1 select-none">
                              <Trash2 className="w-4.5 h-4.5" />
                              <span className="text-[9px] font-bold">Dismiss</span>
                            </div>
                          </div>

                          {/* Swipeable Foreground GlassCard */}
                          <motion.div
                            drag="x"
                            dragDirectionLock
                            dragConstraints={{ left: -100, right: 0 }}
                            dragElastic={{ left: 0.1, right: 0 }}
                            onDragEnd={(event, info) => {
                              // If they drag past -60px, open dismissal confirmation dialog
                              if (info.offset.x < -60) {
                                setConfirmDismissId(notif.localId);
                              }
                            }}
                            className="relative z-10 touch-pan-y"
                          >
                            <GlassCard
                              variant={notif.isRead ? "default" : "elevated"}
                              pressable={true}
                              onPress={() => handleNotificationTap(notif)}
                              className={`p-3 flex gap-3.5 items-center bg-surface-100 dark:bg-surface-100/95 light:bg-white border border-theme-border/30 hover:border-theme-border transition-all cursor-pointer relative ${
                                !notif.isRead ? 'border-l-3 border-l-gold-500' : ''
                              }`}
                            >
                              {/* Left Icon circle */}
                              <div className={`w-9.5 h-9.5 rounded-full flex items-center justify-center flex-shrink-0 ${details.bg}`}>
                                {details.icon}
                              </div>

                              {/* Center text elements */}
                              <div className="flex-1 min-w-0 pr-1.5">
                                <h4 className={`text-[11px] uppercase tracking-wide truncate leading-tight ${
                                  !notif.isRead 
                                    ? 'font-black text-theme-text' 
                                    : 'font-extrabold text-theme-text-secondary'
                                }`}>
                                  {notif.title}
                                </h4>
                                <p className="text-[11px] text-text-muted mt-0.5 leading-normal line-clamp-2">
                                  {notif.message}
                                </p>
                              </div>

                              {/* Right elements: relative timestamp & unread gold dot */}
                              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                                <span className="text-[9px] font-bold text-text-muted font-mono whitespace-nowrap">
                                  {getRelativeTime(notif.createdAt)}
                                </span>
                                {!notif.isRead ? (
                                  <span className="w-2 h-2 rounded-full bg-gold-500 shadow-glow-gold" />
                                ) : (
                                  <div className="w-2 h-2" />
                                )}
                              </div>
                            </GlassCard>
                          </motion.div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* CONFIRMATION DIALOG FOR DISMISSAL */}
      <AnimatePresence>
        {confirmDismissId !== null && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-surface-100 dark:bg-surface-100 border border-theme-border rounded-2xl p-5 max-w-xs w-full shadow-2xl space-y-4"
            >
              <div className="text-center">
                <Trash2 className="w-10 h-10 text-cathedral-400 mx-auto mb-2" />
                <h4 className="text-sm font-black text-theme-text uppercase tracking-wide">
                  Dismiss Notification?
                </h4>
                <p className="text-[11px] text-theme-text-secondary mt-1.5 leading-normal">
                  Are you sure you want to permanently clear this alert from your log?
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  onClick={() => handleDismiss(confirmDismissId)}
                  className="px-3 py-2 bg-cathedral-600 hover:bg-cathedral-500 text-white rounded-xl text-[10px] font-black cursor-pointer transition-all"
                >
                  Yes, Dismiss
                </button>
                <button
                  onClick={() => setConfirmDismissId(null)}
                  className="px-3 py-2 bg-surface-200 hover:bg-theme-text/5 text-text-secondary rounded-xl text-[10px] font-black cursor-pointer transition-all"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
