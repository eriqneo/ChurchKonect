import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RecordModel } from 'pocketbase';
import { db, putAppSetting } from './churchConnectDB';
import { useAuth } from './PocketBaseProvider';
import { pb } from '../pocketbase/client';

export type ReportDateRange = 'This Week' | 'This Month' | 'This Quarter' | 'This Year';

export interface ReportCellPerformance {
  id: string;
  name: string;
  leader: string;
  membersCount: number;
  avgAttendance: number;
  reportsSubmitted: number;
  trend: number[];
}

export interface ReportCoursePerformance {
  id: string;
  name: string;
  enrolled: number;
  completed: number;
  certificates: number;
  completionRate: number;
}

export interface ReportCategoryMetric {
  name: string;
  count: number;
  percentage: number;
}

export interface ReportAnnouncementMetric {
  id: string;
  tag: string;
  total: number;
  active: number;
  scheduled: number;
  archived: number;
}

export interface ReportSnapshot {
  range: ReportDateRange;
  periodStart: string;
  generatedAt: string;
  totalMembers: number;
  activeCells: number;
  averageAttendance: number;
  totalPrayers: number;
  activePrayers: number;
  answeredPrayers: number;
  averagePrayerResponseDays: number;
  activeIntercessors: number;
  verifiedCertificates: number;
  activeAnnouncements: number;
  cellPerformance: ReportCellPerformance[];
  attendanceTrend: Array<Record<string, string | number>>;
  prayerCategories: ReportCategoryMetric[];
  prayerTrend: Array<{ name: string; count: number }>;
  courses: ReportCoursePerformance[];
  announcements: ReportAnnouncementMetric[];
}

interface UseReportDataResult {
  snapshot: ReportSnapshot | null;
  isAuthorized: boolean;
  isRefreshing: boolean;
  isOfflineSnapshot: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const REPORT_ROLES = new Set(['administrator', 'lead_pastor', 'district_pastor']);
const PRAYER_CATEGORIES = ['Healing', 'Guidance', 'Family', 'Deliverance', 'Thanksgiving', 'Financial', 'Spiritual Growth', 'Other'];

function numberValue(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateOnly(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startForRange(range: ReportDateRange, now = new Date()): Date {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range === 'This Week') {
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - day + 1);
  } else if (range === 'This Month') {
    start.setDate(1);
  } else if (range === 'This Quarter') {
    start.setMonth(Math.floor(start.getMonth() / 3) * 3, 1);
  } else {
    start.setMonth(0, 1);
  }
  return start;
}

function parseMetricDate(value: unknown): Date {
  const date = typeof value === 'string' ? value.slice(0, 10) : '';
  return new Date(`${date || '1970-01-01'}T12:00:00`);
}

function bucketForDate(date: Date, range: ReportDateRange): string {
  if (range === 'This Week') return date.toLocaleDateString(undefined, { weekday: 'short' });
  if (range === 'This Month') return `Week ${Math.ceil(date.getDate() / 7)}`;
  return date.toLocaleDateString(undefined, { month: 'short' });
}

function bucketLabels(range: ReportDateRange, start: Date, now = new Date()): string[] {
  if (range === 'This Week') {
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start); date.setDate(start.getDate() + index);
      return bucketForDate(date, range);
    });
  }
  if (range === 'This Month') {
    const lastDay = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
    return Array.from({ length: Math.ceil(lastDay / 7) }, (_, index) => `Week ${index + 1}`);
  }
  const labels: string[] = [];
  const cursor = new Date(start);
  const end = range === 'This Quarter'
    ? new Date(start.getFullYear(), start.getMonth() + 3, 0)
    : new Date(start.getFullYear(), 11, 31);
  while (cursor <= end && cursor <= now) {
    labels.push(bucketForDate(cursor, range));
    cursor.setMonth(cursor.getMonth() + 1, 1);
  }
  return labels;
}

async function getAllRecords(collection: string, options: { filter?: string; sort?: string } = {}): Promise<RecordModel[]> {
  const pageSize = 200;
  const records: RecordModel[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const result = await pb.collection(collection).getList(page, pageSize, options);
    records.push(...result.items);
    totalPages = result.totalPages;
    page += 1;
  } while (page <= totalPages);
  return records;
}

function buildSnapshot(
  range: ReportDateRange,
  overview: RecordModel,
  cellSummaries: RecordModel[],
  cellDaily: RecordModel[],
  trainingSummaries: RecordModel[],
  prayerDaily: RecordModel[],
  announcementSummaries: RecordModel[]
): ReportSnapshot {
  const start = startForRange(range);
  const labels = bucketLabels(range, start);
  const cellDailyById = new Map<string, RecordModel[]>();
  for (const row of cellDaily) {
    const rows = cellDailyById.get(String(row.cellGroup)) ?? [];
    rows.push(row);
    cellDailyById.set(String(row.cellGroup), rows);
  }

  const cellPerformance = cellSummaries.map((cell): ReportCellPerformance => {
    const rows = cellDailyById.get(cell.id) ?? [];
    const attendance = rows.reduce((sum, row) => sum + numberValue(row.attendanceCount), 0);
    const present = rows.reduce((sum, row) => sum + numberValue(row.presentCount), 0);
    const meetings = rows.reduce((sum, row) => sum + numberValue(row.meetingsCount), 0);
    const reports = rows.reduce((sum, row) => sum + numberValue(row.reportsCount), 0);
    const trendByBucket = new Map<string, { present: number; attendance: number }>();
    for (const row of rows) {
      const bucket = bucketForDate(parseMetricDate(row.metricDate), range);
      const current = trendByBucket.get(bucket) ?? { present: 0, attendance: 0 };
      current.present += numberValue(row.presentCount);
      current.attendance += numberValue(row.attendanceCount);
      trendByBucket.set(bucket, current);
    }
    return {
      id: cell.id,
      name: String(cell.name || 'Unnamed cell'),
      leader: String(cell.leader || 'Not assigned'),
      membersCount: numberValue(cell.membersCount),
      avgAttendance: attendance ? Math.round((present / attendance) * 100) : 0,
      reportsSubmitted: meetings ? Math.min(100, Math.round((reports / meetings) * 100)) : 0,
      trend: labels.map((label) => {
        const value = trendByBucket.get(label);
        return value?.attendance ? Math.round((value.present / value.attendance) * 100) : 0;
      })
    };
  });

  const attendanceTrend = labels.map((label) => {
    let present = 0; let attendance = 0;
    for (const row of cellDaily) {
      if (bucketForDate(parseMetricDate(row.metricDate), range) !== label) continue;
      present += numberValue(row.presentCount);
      attendance += numberValue(row.attendanceCount);
    }
    return { name: label, 'Overall Average': attendance ? Math.round((present / attendance) * 100) : 0 };
  });
  const totalAttendance = cellDaily.reduce((sum, row) => sum + numberValue(row.attendanceCount), 0);
  const totalPresent = cellDaily.reduce((sum, row) => sum + numberValue(row.presentCount), 0);

  const categoryCounts = new Map<string, number>();
  const prayerBuckets = new Map<string, number>();
  let totalPrayers = 0; let activePrayers = 0; let answeredPrayers = 0; let responseDays = 0;
  for (const row of prayerDaily) {
    const count = numberValue(row.requestCount);
    const answered = numberValue(row.answeredCount);
    totalPrayers += count;
    activePrayers += numberValue(row.activeCount);
    answeredPrayers += answered;
    responseDays += numberValue(row.averageResponseDays) * answered;
    categoryCounts.set(String(row.category), (categoryCounts.get(String(row.category)) ?? 0) + count);
    const bucket = bucketForDate(parseMetricDate(row.metricDate), range);
    prayerBuckets.set(bucket, (prayerBuckets.get(bucket) ?? 0) + count);
  }

  return {
    range,
    periodStart: dateOnly(start),
    generatedAt: new Date().toISOString(),
    totalMembers: numberValue(overview.totalMembers),
    activeCells: numberValue(overview.activeCells),
    averageAttendance: totalAttendance ? Math.round((totalPresent / totalAttendance) * 100) : 0,
    totalPrayers,
    activePrayers,
    answeredPrayers,
    averagePrayerResponseDays: answeredPrayers ? Math.round((responseDays / answeredPrayers) * 10) / 10 : 0,
    activeIntercessors: numberValue(overview.activeIntercessors),
    verifiedCertificates: numberValue(overview.verifiedCertificates),
    activeAnnouncements: numberValue(overview.activeAnnouncements),
    cellPerformance,
    attendanceTrend,
    prayerCategories: PRAYER_CATEGORIES.map((name) => ({
      name,
      count: categoryCounts.get(name) ?? 0,
      percentage: totalPrayers ? Math.round(((categoryCounts.get(name) ?? 0) / totalPrayers) * 100) : 0
    })).filter((item) => item.count > 0),
    prayerTrend: labels.map((name) => ({ name, count: prayerBuckets.get(name) ?? 0 })),
    courses: trainingSummaries.map((course) => {
      const enrolled = numberValue(course.enrolledCount);
      const completed = numberValue(course.completedCount);
      return {
        id: course.id, name: String(course.name || 'Untitled course'), enrolled, completed,
        certificates: numberValue(course.certificateCount),
        completionRate: enrolled ? Math.round((completed / enrolled) * 100) : 0
      };
    }),
    announcements: announcementSummaries.map((item) => ({
      id: item.id, tag: String(item.tag || 'General'), total: numberValue(item.totalCount),
      active: numberValue(item.activeCount), scheduled: numberValue(item.scheduledCount),
      archived: numberValue(item.archivedCount)
    }))
  };
}

export function useReportData(range: ReportDateRange): UseReportDataResult {
  const { user } = useAuth();
  const isAuthorized = Boolean(user && REPORT_ROLES.has(user.role));
  const [snapshot, setSnapshot] = useState<ReportSnapshot | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isOfflineSnapshot, setIsOfflineSnapshot] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const cacheKey = useMemo(() => user ? `reportSnapshot:${user.id}:${range}` : '', [range, user]);

  const refresh = useCallback(async () => {
    if (!user || !isAuthorized) return;
    const sequence = ++requestSequence.current;
    setIsRefreshing(true);
    setError(null);
    const start = dateOnly(startForRange(range));
    const filter = `metricDate >= "${start}"`;
    try {
      const [overviewRows, cells, cellDaily, trainings, prayers, announcements] = await Promise.all([
        getAllRecords('report_overview'),
        getAllRecords('report_cell_summary', { sort: 'name' }),
        getAllRecords('report_cell_daily', { filter, sort: 'metricDate' }),
        getAllRecords('report_training_summary', { sort: 'name' }),
        getAllRecords('report_prayer_daily', { filter, sort: 'metricDate' }),
        getAllRecords('report_announcement_summary', { sort: 'tag' })
      ]);
      if (sequence !== requestSequence.current) return;
      if (!overviewRows[0]) throw new Error('The analytics overview is unavailable.');
      const next = buildSnapshot(range, overviewRows[0], cells, cellDaily, trainings, prayers, announcements);
      setSnapshot(next);
      setIsOfflineSnapshot(false);
      await putAppSetting(cacheKey, next);
    } catch (cause) {
      if (sequence !== requestSequence.current) return;
      setError(cause instanceof Error ? cause.message : 'Could not refresh analytics.');
      setIsOfflineSnapshot(true);
    } finally {
      if (sequence === requestSequence.current) setIsRefreshing(false);
    }
  }, [cacheKey, isAuthorized, range, snapshot, user]);

  useEffect(() => {
    let cancelled = false;
    requestSequence.current += 1;
    if (!cacheKey || !isAuthorized) {
      setSnapshot(null);
      return;
    }
    setSnapshot(null);
    setError(null);
    void db.appSettings.where('key').equals(cacheKey).first().then((record) => {
      if (cancelled) return;
      if (record?.value) {
        setSnapshot(record.value as ReportSnapshot);
        setIsOfflineSnapshot(true);
      }
      return refresh();
    });
    return () => { cancelled = true; };
    // refresh intentionally runs once per authenticated user/range; button presses call it explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, isAuthorized]);

  return { snapshot, isAuthorized, isRefreshing, isOfflineSnapshot, error, refresh };
}
