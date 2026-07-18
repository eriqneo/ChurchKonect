import { useCallback, useEffect, useRef, useState } from 'react';
import type { RecordModel } from 'pocketbase';
import { db, putAppSetting } from './churchConnectDB';
import { useAuth } from './PocketBaseProvider';

export interface HomeDashboardSummary {
  pendingActionCount: number;
  memberCount: number;
  activeCellCount: number;
  weeklyAttendance: number;
  activeCourseCount: number;
  enrollmentCount: number;
  academyProgress: number;
  currentCourseTitle: string;
}

export interface HomeGathering {
  id: string;
  title: string;
  body: string;
  eventDate: string;
  eventTime: string;
  eventLocation: string;
}

export interface HomeDashboardSnapshot {
  summary: HomeDashboardSummary;
  gatherings: HomeGathering[];
  refreshedAt: string;
}

function numeric(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateOnly(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dashboardSummary(record: RecordModel): HomeDashboardSummary {
  const totalSessions = numeric(record.academyTotalSessions);
  const attendedSessions = numeric(record.academyAttendedSessions);
  const academyProgress = totalSessions ? Math.round((attendedSessions / totalSessions) * 100) : 0;
  return {
    pendingActionCount: record.role === 'cell_leader' ? numeric(record.dueReportCount) : numeric(record.pendingReviewCount),
    memberCount: numeric(record.memberCount),
    activeCellCount: numeric(record.activeCellCount),
    weeklyAttendance: numeric(record.weeklyAttendance),
    activeCourseCount: numeric(record.activeCourseCount),
    enrollmentCount: numeric(record.enrollmentCount),
    academyProgress: Math.max(0, Math.min(100, academyProgress)),
    currentCourseTitle: typeof record.currentCourseTitle === 'string' ? record.currentCourseTitle : ''
  };
}

function gathering(record: RecordModel): HomeGathering {
  return {
    id: record.id,
    title: typeof record.title === 'string' ? record.title : 'Church gathering',
    body: typeof record.body === 'string' ? record.body : '',
    eventDate: record.eventDate ? String(record.eventDate).slice(0, 10) : '',
    eventTime: typeof record.eventTime === 'string' ? record.eventTime : '',
    eventLocation: typeof record.eventLocation === 'string' ? record.eventLocation : ''
  };
}

function friendlyError(error: unknown): string {
  const status = (error as { status?: number })?.status || 0;
  if (status === 401 || status === 403) return 'Your dashboard access could not be confirmed.';
  if (!status || status === 408 || status === 429 || status >= 500) return 'The latest dashboard could not be reached.';
  return 'The dashboard could not be refreshed.';
}

export function useHomeDashboard(enabled = true) {
  const { pb, user } = useAuth();
  const cacheKey = user ? `homeDashboard:${user.id}` : '';
  const [snapshot, setSnapshot] = useState<HomeDashboardSnapshot | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isOfflineSnapshot, setIsOfflineSnapshot] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cacheReadyKey, setCacheReadyKey] = useState('');
  const requestSequence = useRef(0);

  const refresh = useCallback(async () => {
    if (!user || !pb.authStore.isValid || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
    const sequence = ++requestSequence.current;
    setIsRefreshing(true);
    try {
      const start = new Date();
      const day = start.getDay() || 7;
      start.setDate(start.getDate() - day + 1);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 41);
      end.setHours(23, 59, 59, 999);
      const now = new Date().toISOString();
      const eventFilter = [
        'tag = "Event"',
        'status = "published"',
        `publishAt <= "${now}"`,
        `(expiresAt = "" || expiresAt > "${now}")`,
        `eventDate >= "${dateOnly(start)}"`,
        `eventDate <= "${dateOnly(end)}"`
      ].join(' && ');
      const [summaryRecord, eventPage] = await Promise.all([
        pb.collection('home_dashboard').getOne(user.id),
        pb.collection('announcements').getList(1, 20, { filter: eventFilter, sort: 'eventDate,eventTime,title' })
      ]);
      if (sequence !== requestSequence.current) return;
      const next: HomeDashboardSnapshot = {
        summary: dashboardSummary(summaryRecord),
        gatherings: eventPage.items.map(gathering).filter((item) => item.eventDate),
        refreshedAt: new Date().toISOString()
      };
      setSnapshot(next);
      setIsOfflineSnapshot(false);
      setError(null);
      await putAppSetting(cacheKey, next);
    } catch (refreshError) {
      if (sequence !== requestSequence.current) return;
      setError(friendlyError(refreshError));
      setIsOfflineSnapshot(true);
    } finally {
      if (sequence === requestSequence.current) setIsRefreshing(false);
    }
  }, [cacheKey, pb, user]);

  useEffect(() => {
    let cancelled = false;
    const sequence = ++requestSequence.current;
    setSnapshot(null);
    setError(null);
    setIsOfflineSnapshot(false);
    setCacheReadyKey('');
    if (!cacheKey) return () => { cancelled = true; };
    void db.appSettings.where('key').equals(cacheKey).first().then((record) => {
      if (cancelled || sequence !== requestSequence.current) return;
      if (record?.value) {
        setSnapshot(record.value as HomeDashboardSnapshot);
        setIsOfflineSnapshot(true);
      }
      setCacheReadyKey(cacheKey);
    }).catch(() => {
      if (!cancelled && sequence === requestSequence.current) setCacheReadyKey(cacheKey);
    });
    return () => { cancelled = true; };
    // Loading is account-bound; visibility changes are handled by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  useEffect(() => {
    if (!enabled || !user || cacheReadyKey !== cacheKey) return;
    void refresh();
    const onOnline = () => void refresh();
    const onVisibility = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibility);
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 60_000);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(timer);
    };
  }, [cacheKey, cacheReadyKey, enabled, refresh, user]);

  return {
    snapshot,
    isLoading: enabled && !snapshot && isRefreshing,
    isRefreshing,
    isOfflineSnapshot,
    error,
    refresh
  };
}
