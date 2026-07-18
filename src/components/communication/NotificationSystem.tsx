import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Award, Bell, Clipboard, Heart, Megaphone, RefreshCw, Trash2 } from 'lucide-react';
import type { NotificationRecord } from '../../lib/db/churchConnectDB';
import { useNotifications } from '../../lib/db/notificationData';
import { setAppBadge } from '../../lib/notifications/pwaService';
import { GlassCard } from '../shared';
import { useToast } from '../shared/toast/useToast';

interface NotificationSystemProps {
  onActiveTabChange?: (tab: string) => void;
  onClose?: () => void;
}

interface GroupedNotifications {
  Today: NotificationRecord[];
  Yesterday: NotificationRecord[];
  'This Week': NotificationRecord[];
  Earlier: NotificationRecord[];
}

function relativeTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function groupNotifications(notifications: NotificationRecord[]): GroupedNotifications {
  const groups: GroupedNotifications = { Today: [], Yesterday: [], 'This Week': [], Earlier: [] };
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const yesterdayStart = todayStart - 86_400_000;
  const weekStart = todayStart - 7 * 86_400_000;
  for (const notification of notifications) {
    const time = new Date(notification.createdAt).getTime();
    if (time >= todayStart) groups.Today.push(notification);
    else if (time >= yesterdayStart) groups.Yesterday.push(notification);
    else if (time >= weekStart) groups['This Week'].push(notification);
    else groups.Earlier.push(notification);
  }
  return groups;
}

function notificationIcon(type: NotificationRecord['type']) {
  if (type === 'announcement') return { icon: <Megaphone className="h-4 w-4" />, style: 'bg-gold-500/10 text-gold-500' };
  if (type === 'prayer') return { icon: <Heart className="h-4 w-4" />, style: 'bg-cathedral-500/15 text-cathedral-400' };
  if (type === 'report') return { icon: <Clipboard className="h-4 w-4" />, style: 'bg-sage-500/15 text-sage-400' };
  if (type === 'certificate') return { icon: <Award className="h-4 w-4" />, style: 'bg-gold-500/15 text-gold-500' };
  return { icon: <Bell className="h-4 w-4" />, style: 'bg-theme-bg-secondary text-theme-text-secondary' };
}

export function NotificationSystem({ onActiveTabChange, onClose }: NotificationSystemProps) {
  const { notifications, unreadCount, isLoading, isRefreshing, error, refresh, markRead, markAllRead, dismiss } = useNotifications();
  const [confirmDismissId, setConfirmDismissId] = useState<string | null>(null);
  const toast = useToast();
  const groups = groupNotifications(notifications);

  useEffect(() => { void setAppBadge(unreadCount); }, [unreadCount]);

  const openNotification = async (notification: NotificationRecord) => {
    await markRead(notification.localId);
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(10); } catch { /* unsupported device */ }
    }
    if (notification.actionUrl && onActiveTabChange) {
      onActiveTabChange(notification.actionUrl);
      onClose?.();
    }
  };

  const confirmDismiss = async () => {
    if (!confirmDismissId) return;
    await dismiss(confirmDismissId);
    setConfirmDismissId(null);
    toast.info('Notification dismissed');
  };

  return (
    <div className="space-y-4 select-none pb-8">
      <div className="flex items-center justify-between gap-3 border-b border-theme-border/10 pb-3 mt-1">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-black text-theme-text uppercase tracking-wider">Notifications</h3>
            {unreadCount > 0 && (
              <span className="rounded-full bg-gold-500 px-1.5 py-0.5 text-[9px] font-black text-black">{unreadCount} NEW</span>
            )}
          </div>
          <p className="mt-1 text-[9px] text-theme-text-secondary">PocketBase events · recent alerts cached for short outages</p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={isRefreshing}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-theme-border/40 text-theme-text-secondary disabled:opacity-50"
            aria-label="Refresh notifications"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => void markAllRead().then(() => toast.success('All notifications marked as read'))}
              className="text-[10px] font-bold text-gold-500"
            >
              Read all
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-gold-500/20 bg-gold-500/5 px-3 py-2 text-[10px] leading-relaxed text-theme-text-secondary">
          {error}
        </div>
      )}

      {isLoading && notifications.length === 0 ? (
        <div className="px-4 py-16 text-center">
          <RefreshCw className="mx-auto mb-3 h-8 w-8 animate-spin text-gold-500" />
          <p className="text-xs font-bold text-theme-text-secondary">Loading your notification feed…</p>
        </div>
      ) : notifications.length === 0 ? (
        <div className="px-4 py-16 text-center">
          <Bell className="mx-auto mb-3 h-10 w-10 text-theme-text-muted" strokeWidth={1.5} />
          <p className="text-sm font-black text-theme-text-secondary">All caught up</p>
          <p className="mt-1 text-xs text-theme-text-muted">New ministry events addressed to you will appear here.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {(['Today', 'Yesterday', 'This Week', 'Earlier'] as const).map((group) => {
            if (!groups[group].length) return null;
            return (
              <section key={group} className="space-y-2">
                <h4 className="px-1 text-[10px] font-black uppercase tracking-widest text-theme-text-muted">{group}</h4>
                <div className="space-y-2">
                  <AnimatePresence mode="popLayout">
                    {groups[group].map((notification) => {
                      const details = notificationIcon(notification.type);
                      return (
                        <motion.div
                          key={notification.localId}
                          layout
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: -240 }}
                          className="relative overflow-hidden rounded-xl"
                        >
                          <div className="absolute inset-0 flex items-center justify-end rounded-xl bg-cathedral-600 pr-5 text-white">
                            <Trash2 className="h-4 w-4" />
                          </div>
                          <motion.div
                            drag="x"
                            dragDirectionLock
                            dragConstraints={{ left: -90, right: 0 }}
                            dragElastic={{ left: 0.1, right: 0 }}
                            onDragEnd={(_, info) => { if (info.offset.x < -55) setConfirmDismissId(notification.localId); }}
                            className="relative z-10 touch-pan-y"
                          >
                            <GlassCard
                              pressable
                              variant={notification.isRead ? 'default' : 'elevated'}
                              onPress={() => void openNotification(notification)}
                              className={`flex cursor-pointer items-center gap-3.5 border border-theme-border/30 bg-theme-bg p-3 ${notification.isRead ? '' : 'border-l-3 border-l-gold-500'}`}
                            >
                              <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${details.style}`}>{details.icon}</div>
                              <div className="min-w-0 flex-1">
                                <h5 className={`truncate text-[11px] uppercase tracking-wide ${notification.isRead ? 'font-bold text-theme-text-secondary' : 'font-black text-theme-text'}`}>{notification.title}</h5>
                                <p className="mt-0.5 line-clamp-2 text-[11px] leading-normal text-theme-text-secondary">{notification.message}</p>
                              </div>
                              <div className="flex flex-shrink-0 flex-col items-end gap-2">
                                <span className="whitespace-nowrap font-mono text-[9px] font-bold text-theme-text-muted">{relativeTime(notification.createdAt)}</span>
                                {!notification.isRead && <span className="h-2 w-2 rounded-full bg-gold-500 shadow-glow-gold" />}
                              </div>
                            </GlassCard>
                          </motion.div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              </section>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {confirmDismissId && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-xs space-y-4 rounded-2xl border border-theme-border bg-theme-bg p-5 shadow-2xl"
            >
              <div className="text-center">
                <Trash2 className="mx-auto mb-2 h-9 w-9 text-cathedral-400" />
                <h4 className="text-sm font-black text-theme-text">Dismiss this notification?</h4>
                <p className="mt-1.5 text-[11px] leading-normal text-theme-text-secondary">It will be hidden on all your signed-in devices.</p>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <button onClick={() => void confirmDismiss()} className="rounded-xl bg-cathedral-600 px-3 py-2 text-[10px] font-black text-white">Dismiss</button>
                <button onClick={() => setConfirmDismissId(null)} className="rounded-xl bg-theme-bg-secondary px-3 py-2 text-[10px] font-black text-theme-text-secondary">Cancel</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
