import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bell,
  Check,
  Trash2,
  Flame,
  Heart,
  Award,
  UserPlus,
  Tag,
  CheckSquare,
  Sparkles,
  Wifi,
  BookmarkCheck,
  ChevronLeft
} from 'lucide-react';
import { GlassCard, AccentBadge, SectionTitle } from '../shared';
import { useToast } from '../shared/toast/useToast';

export interface CCNotification {
  id: string;
  type: 'report' | 'prayer' | 'certificate' | 'member' | 'announcement';
  title: string;
  description: string;
  timestamp: string;
  timeGroup: 'Today' | 'Yesterday' | 'Earlier';
  unread: boolean;
  createdAt: number;
}

const DEFAULT_NOTIFICATIONS: CCNotification[] = [
  {
    id: 'not-1',
    type: 'announcement',
    title: 'Divine Awakening Convocation',
    description: 'Pastor David published a pinned announcement: Holy Convocation 2026 starting next Friday.',
    timestamp: '3 hours ago',
    timeGroup: 'Today',
    unread: true,
    createdAt: Date.now() - 3 * 3600 * 1000
  },
  {
    id: 'not-2',
    type: 'prayer',
    title: 'Intercession Duty Assigned',
    description: 'You have been assigned to cover Sister Clara\'s healing request in the regional prayer chain.',
    timestamp: '5 hours ago',
    timeGroup: 'Today',
    unread: true,
    createdAt: Date.now() - 5 * 3600 * 1000
  },
  {
    id: 'not-3',
    type: 'certificate',
    title: 'Leadership Level 2 Verified',
    description: 'Your Discipleship Academy certificate for Class 4 is signed by Clergy and ready in your Profile.',
    timestamp: 'Yesterday at 4:15 PM',
    timeGroup: 'Yesterday',
    unread: false,
    createdAt: Date.now() - 20 * 3600 * 1000
  },
  {
    id: 'not-4',
    type: 'report',
    title: 'Cell Attendance Submitted',
    description: 'Hope Cell Leader Michael submitted attendance log details for 12 members yesterday.',
    timestamp: 'Yesterday at 11:30 AM',
    timeGroup: 'Yesterday',
    unread: false,
    createdAt: Date.now() - 26 * 3600 * 1000
  },
  {
    id: 'not-5',
    type: 'member',
    title: 'First-time Seeker Card Recieved',
    description: 'visitor_492 (John Doe) has completed the Seeker form and would like to join Hope Cell.',
    timestamp: '3 days ago',
    timeGroup: 'Earlier',
    unread: false,
    createdAt: Date.now() - 3 * 24 * 3600 * 1000
  }
];

interface CommunicationModuleProps {
  onNotificationCountChange?: (count: number) => void;
  isStandalone?: boolean;
  onCloseStandalone?: () => void;
}

export function CommunicationModule({
  onNotificationCountChange,
  isStandalone = true,
  onCloseStandalone
}: CommunicationModuleProps) {
  const toast = useToast();
  const [notifications, setNotifications] = useState<CCNotification[]>(() => {
    const saved = localStorage.getItem('churchconnect_notifications');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return DEFAULT_NOTIFICATIONS;
      }
    }
    return DEFAULT_NOTIFICATIONS;
  });

  const [swipeActiveId, setSwipeActiveId] = useState<string | null>(null);

  // Sync back notification counts
  useEffect(() => {
    localStorage.setItem('churchconnect_notifications', JSON.stringify(notifications));
    const unreadCount = notifications.filter(n => n.unread).length;
    if (onNotificationCountChange) {
      onNotificationCountChange(unreadCount);
    }
  }, [notifications, onNotificationCountChange]);

  // Listen for new announcements to dynamically trigger notifications
  useEffect(() => {
    const handleNewAnn = (e: any) => {
      const ann = e.detail;
      const newNot: CCNotification = {
        id: `not-ann-${ann.id}`,
        type: 'announcement',
        title: 'New Announcement Published',
        description: `${ann.author} published: "${ann.title}"`,
        timestamp: 'Just now',
        timeGroup: 'Today',
        unread: true,
        createdAt: Date.now()
      };
      setNotifications(prev => [newNot, ...prev]);
    };

    window.addEventListener('new_church_announcement', handleNewAnn);
    return () => window.removeEventListener('new_church_announcement', handleNewAnn);
  }, []);

  const triggerHaptic = () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(10);
      } catch (e) {}
    }
  };

  const markAllRead = () => {
    triggerHaptic();
    setNotifications(prev => prev.map(n => ({ ...n, unread: false })));
    toast.success('All notifications marked as read');
  };

  const dismissNotification = (id: string) => {
    triggerHaptic();
    setNotifications(prev => prev.filter(n => n.id !== id));
    toast.info('Notification dismissed');
  };

  const getIconDetails = (type: CCNotification['type']) => {
    switch (type) {
      case 'report':
        return {
          icon: <CheckSquare className="w-4.5 h-4.5" />,
          colorClass: 'bg-gold-500/10 text-gold-500 dark:bg-gold-500/10 dark:text-gold-500'
        };
      case 'prayer':
        return {
          icon: <Heart className="w-4.5 h-4.5" />,
          colorClass: 'bg-cathedral-500/10 text-cathedral-400 dark:bg-cathedral-500/10 dark:text-cathedral-400'
        };
      case 'certificate':
        return {
          icon: <Award className="w-4.5 h-4.5" />,
          colorClass: 'bg-sage-500/10 text-sage-400 dark:bg-sage-500/10 dark:text-sage-400'
        };
      case 'member':
        return {
          icon: <UserPlus className="w-4.5 h-4.5" />,
          colorClass: 'bg-surface-300 text-text-secondary dark:bg-surface-300 dark:text-text-secondary'
        };
      case 'announcement':
      default:
        return {
          icon: <Tag className="w-4.5 h-4.5" />,
          colorClass: 'bg-gold-500/10 text-gold-500 dark:bg-gold-500/10 dark:text-gold-500'
        };
    }
  };

  const timeGroups: ('Today' | 'Yesterday' | 'Earlier')[] = ['Today', 'Yesterday', 'Earlier'];
  const unreadCount = notifications.filter(n => n.unread).length;

  return (
    <div className="space-y-4">
      {/* Header with Title & Action link */}
      <SectionTitle
        title="Notification Hub"
        badge={unreadCount > 0 ? { label: `${unreadCount} NEW` } : undefined}
        action={unreadCount > 0 ? { label: 'Read All', icon: <BookmarkCheck className="w-3.5 h-3.5" />, onPress: markAllRead } : undefined}
      />

      {/* Standalone View close button, or simply instructions */}
      {isStandalone && onCloseStandalone && (
        <motion.button
          whileTap={{ scale: 0.94 }}
          onClick={onCloseStandalone}
          className="min-h-[32px] flex items-center gap-1 px-3 py-1.5 rounded-pill bg-surface-200/60 dark:bg-surface-200/60 light:bg-surface-light-secondary border border-white/5 text-xs font-bold text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Back to home
        </motion.button>
      )}

      {/* Notifications List Grouped by Time */}
      <div className="space-y-4">
        {notifications.length === 0 ? (
          <div className="text-center py-16 px-4">
            <Bell className="w-10 h-10 text-text-muted mx-auto mb-3 stroke-[1.5]" />
            <p className="text-sm font-bold text-text-secondary dark:text-text-secondary light:text-text-light-secondary">
              Quiet skies
            </p>
            <p className="text-xs text-text-muted mt-1">
              You do not have any notification logs at the moment.
            </p>
          </div>
        ) : (
          timeGroups.map((group) => {
            const groupNotifs = notifications.filter(n => n.timeGroup === group);
            if (groupNotifs.length === 0) return null;

            return (
              <div key={group} className="space-y-2">
                {/* Group Divider / Time Header */}
                <h5 className="text-[10px] font-black uppercase tracking-widest text-text-muted dark:text-text-muted light:text-text-light-muted px-1.5">
                  {group}
                </h5>

                <div className="space-y-2">
                  <AnimatePresence mode="popLayout">
                    {groupNotifs.map((notif) => {
                      const { icon, colorClass } = getIconDetails(notif.type);
                      return (
                        <motion.div
                          key={notif.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: -300 }}
                          transition={{ type: 'spring', stiffness: 350, damping: 28 }}
                          className="relative overflow-hidden rounded-card"
                          layout
                        >
                          {/* Cathedral background swipe tray */}
                          <div className="absolute inset-0 bg-cathedral-600 flex items-center justify-end pr-5 text-white rounded-card">
                            <div className="flex flex-col items-center justify-center gap-1">
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
                              // If they drag past -60px, trigger dismissal
                              if (info.offset.x < -60) {
                                dismissNotification(notif.id);
                              }
                            }}
                            className="relative z-10 touch-pan-y"
                          >
                            <GlassCard
                              variant={notif.unread ? "elevated" : "default"}
                              className={`relative p-3.5 flex gap-3.5 items-center rounded-2xl border transition-colors duration-300 ${
                                notif.unread
                                  ? 'bg-gradient-to-br from-gold-500/[0.09] via-surface-100 to-surface-100 dark:from-gold-500/[0.12] dark:via-surface-100 dark:to-surface-100 light:from-gold-500/[0.06] light:via-white light:to-white border-gold-500/25 shadow-[0_10px_28px_-14px_rgba(212,168,74,0.45)]'
                                  : 'bg-surface-100 dark:bg-surface-100/95 light:bg-white border-white/5 dark:border-white/5 light:border-black/5'
                              }`}
                            >
                              {/* Notification Left Type Circle Icon */}
                              <div className={`relative w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${colorClass} ${
                                notif.unread ? 'ring-2 ring-gold-500/40' : ''
                              }`}>
                                {icon}
                                {notif.unread && (
                                  <motion.span
                                    initial={{ scale: 0 }}
                                    animate={{ scale: [0, 1.3, 1] }}
                                    transition={{ duration: 0.35, ease: 'easeOut' }}
                                    className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-gold-500 border-2 border-surface-100 shadow-glow-gold"
                                  />
                                )}
                              </div>

                              {/* Notification Middle Text Elements */}
                              <div className="flex-1 min-w-0 pr-1">
                                <div className="flex items-start justify-between gap-2">
                                  <h4 className="text-xs font-extrabold text-text-primary dark:text-text-primary light:text-text-light-primary leading-tight truncate">
                                    {notif.title}
                                  </h4>
                                  {notif.unread && (
                                    <span className="flex-shrink-0 mt-0.5 text-[8px] font-black uppercase tracking-wider text-gold-500 bg-gold-500/15 px-1.5 py-0.5 rounded-full">
                                      New
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-text-secondary dark:text-text-secondary light:text-text-light-secondary mt-0.5 leading-normal line-clamp-2">
                                  {notif.description}
                                </p>
                                <span className="text-[9px] font-bold text-text-muted dark:text-text-muted light:text-text-light-muted block mt-1.5">
                                  {notif.timestamp}
                                </span>
                              </div>

                              {/* Quick Dismiss Trigger for Click / Fallback */}
                              <motion.button
                                whileTap={{ scale: 0.85 }}
                                onClick={() => dismissNotification(notif.id)}
                                className="w-7 h-7 rounded-full bg-surface-200/50 hover:bg-surface-200 dark:bg-surface-200/50 dark:hover:bg-surface-200 light:bg-surface-light-secondary/80 flex items-center justify-center text-text-muted hover:text-cathedral-400 transition-colors flex-shrink-0 cursor-pointer"
                                title="Dismiss notification"
                              >
                                <XIcon className="w-3.5 h-3.5" />
                              </motion.button>
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
    </div>
  );
}

// Minimal internal helper
function XIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
