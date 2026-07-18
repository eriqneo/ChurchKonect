import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTheme } from '../../lib/theme/ThemeProvider';
import * as Typography from '../../lib/theme/typography';
import { useAuth } from '../../lib/db/PocketBaseProvider';
import { useReportData, type ReportDateRange } from '../../lib/db/reportData';
import {
  GlassCard,
  AccentBadge,
  SectionTitle,
  BottomSheet,
  StatBlock,
  ProgressRing
} from '../shared';
import { 
  ChevronRight, 
  Calendar, 
  Users, 
  Heart, 
  Award, 
  Share2, 
  TrendingUp, 
  ArrowUpDown, 
  X, 
  Activity, 
  Printer, 
  Check, 
  RefreshCw,
  Lock
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  PieChart, 
  Pie, 
  Cell, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip,
  ComposedChart
} from 'recharts';

export function ReportsModule() {
  const { isDark } = useTheme();
  const { user } = useAuth();

  // Date range state
  const [dateRange, setDateRange] = useState<ReportDateRange>('This Month');
  const { snapshot, isAuthorized, isRefreshing, isOfflineSnapshot, error, refresh } = useReportData(dateRange);
  
  // Table sorting states
  const [sortField, setSortField] = useState<string>('avgAttendance');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Interactive Bottom Sheets & Modal Views
  const [selectedCell, setSelectedCell] = useState<any | null>(null);
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const totalMembersCount = snapshot?.totalMembers ?? 0;
  const totalPrayersCount = snapshot?.activePrayers ?? 0;
  const totalCertificatesCount = snapshot?.verifiedCertificates ?? 0;
  const averageAttendance = snapshot?.averageAttendance ?? 0;

  // Helper for clipboard copies & small vibrations
  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate([15, 30]);
      } catch (e) {}
    }
    setTimeout(() => setToastMessage(null), 3000);
  };

  // --------------------------------------
  // COMPONENT THEME STYLING DICTIONARY
  // --------------------------------------
  const styles = useMemo(() => {
    if (isDark) {
      return {
        text: '#8A8A92',
        grid: 'rgba(255, 255, 255, 0.08)',
        primary: '#D4A84A', // gold-500
        secondary: '#8F7744', // cathedral-400
        positive: '#7BC47F', // sage-400
        negative: '#A7905E', // cathedral-300
        gradientFrom: 'rgba(212, 168, 74, 0.25)',
        gradientTo: 'rgba(212, 168, 74, 0.0)',
        tooltipBg: 'rgba(26, 26, 30, 0.72)',
        tooltipBorder: 'rgba(212, 168, 74, 0.2)',
        tooltipText: '#F5F5F5'
      };
    } else {
      return {
        text: '#71717A', // text-light-secondary
        grid: 'rgba(0, 0, 0, 0.06)', // black 6%
        primary: '#5C4B2E', // cathedral-700
        secondary: '#B88E3E', // gold-600
        positive: '#4E9254', // sage-600
        negative: '#7B663E', // cathedral-500
        gradientFrom: 'rgba(92, 75, 46, 0.15)',
        gradientTo: 'rgba(92, 75, 46, 0.0)',
        tooltipBg: 'rgba(255, 255, 255, 0.78)',
        tooltipBorder: 'rgba(92, 75, 46, 0.18)',
        tooltipText: '#1A1A1E'
      };
    }
  }, [isDark]);

  // Shared translucent, blurred tooltip style for all Recharts instances
  const tooltipContentStyle: React.CSSProperties = {
    backgroundColor: styles.tooltipBg,
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    border: `1px solid ${styles.tooltipBorder}`,
    borderRadius: '12px',
    fontSize: '11px',
    color: styles.tooltipText,
    boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.35)' : '0 8px 24px rgba(0,0,0,0.08)'
  };

  const attendanceTrendData = snapshot?.attendanceTrend ?? [];

  // --------------------------------------
  // PRAYER ANALYTICS DATA
  // --------------------------------------
  const categoryColors = [styles.primary, styles.secondary, '#D4C094', '#A7905E', '#8A7A5A', '#6E805F', '#9B775C', styles.text];
  const prayerCategoriesData = (snapshot?.prayerCategories ?? []).map((item, index) => ({
    name: item.name, value: item.percentage, count: item.count, color: categoryColors[index % categoryColors.length]
  }));
  const prayerTrendData = snapshot?.prayerTrend ?? [];

  // --------------------------------------
  // SORTABLE CELL GROUP LIST
  // --------------------------------------
  const cellPerformanceRows = useMemo(() => {
    const cells = [...(snapshot?.cellPerformance ?? [])];

    return cells.sort((a: any, b: any) => {
      let valA = a[sortField];
      let valB = b[sortField];

      if (typeof valA === 'string') {
        return sortDirection === 'asc' 
          ? valA.localeCompare(valB) 
          : valB.localeCompare(valA);
      } else {
        return sortDirection === 'asc' 
          ? (valA as number) - (valB as number) 
          : (valB as number) - (valA as number);
      }
    });
  }, [sortField, sortDirection, snapshot]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Determine cell group health status
  const getCellStatus = (avgAttendance: number, reportsSubmitted: number) => {
    if (avgAttendance === 0 && reportsSubmitted === 0) {
      return { label: 'No Data', variant: 'cathedral' as const };
    }
    if (avgAttendance >= 80 && reportsSubmitted >= 95) {
      return { label: 'Healthy', variant: 'sage' as const };
    } else if (avgAttendance >= 60 || reportsSubmitted >= 80) {
      return { label: 'At Risk', variant: 'gold' as const };
    } else {
      return { label: 'Needs Attention', variant: 'cathedral' as const };
    }
  };

  // --------------------------------------
  // WHATSAPP SHARE GENERATOR
  // --------------------------------------
  const handleShareSummary = () => {
    const summary = `ChurchConnect Weekly Summary (${dateRange}):
👥 ${totalMembersCount} active members
📊 ${averageAttendance}% average attendance across cell groups
🙏 ${totalPrayersCount} active prayer requests
📜 ${totalCertificatesCount} discipleship training certificates issued
🕒 Refreshed ${snapshot ? new Date(snapshot.generatedAt).toLocaleString() : 'not yet'}
🔗 Access your leadership panel: ${window.location.origin}`;

    if (navigator.clipboard) {
      navigator.clipboard.writeText(summary);
      triggerToast('Summary copied for WhatsApp/Email!');
    } else {
      triggerToast('Failed to copy. Sharing API not supported.');
    }
  };

  // --------------------------------------
  // PRINT UTILITY / PDF SIMULATOR
  // --------------------------------------
  const handlePrintReport = () => {
    const styleId = 'church-connect-print-style';
    let existingStyle = document.getElementById(styleId);
    if (!existingStyle) {
      const style = document.createElement('style');
      style.id = styleId;
      style.innerHTML = `
        @media print {
          body * {
            visibility: hidden;
          }
          #print-area, #print-area * {
            visibility: visible;
          }
          #print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white !important;
            color: black !important;
            padding: 24px;
            box-shadow: none !important;
            border: none !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `;
      document.head.appendChild(style);
    }
    window.print();
  };

  // --------------------------------------
  // ACCESS DENIED RENDER
  // --------------------------------------
  if (!isAuthorized) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[75vh] px-4 text-center space-y-6">
        <div className="w-16 h-16 rounded-full bg-cathedral-500/10 flex items-center justify-center text-cathedral-400">
          <Lock className="w-8 h-8" />
        </div>
        <div className="space-y-2 max-w-sm">
          <h3 className={`${Typography.SUBTITLE} font-black text-theme-text`}>
            Oversight Restricted
          </h3>
          <p className={`${Typography.CAPTION} text-theme-text-secondary leading-relaxed`}>
            This Ministry Analytics Dashboard is reserved for Lead Pastors, District Pastors, and Operational Administrators. PocketBase rules enforce this access on every report query.
          </p>
        </div>

      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24 relative select-none">
      
      {/* Toast Overlay */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -20, x: '-50%' }}
            className="fixed top-14 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-full bg-gold-500 text-black text-[11px] font-black tracking-wide uppercase shadow-lg flex items-center gap-1.5 border border-gold-600"
          >
            <Check className="w-3.5 h-3.5 stroke-[3]" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ======================================================================
          HEADER SECTION & DATE PICKER
          ====================================================================== */}
      <div className="space-y-3.5">
        <div className="flex items-start justify-between gap-3">
          <SectionTitle 
            title="Ministry Dashboard" 
            badge={{ label: 'Leadership', variant: 'gold' }}
          />
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={isRefreshing}
            className="mt-0.5 inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-theme-border/50 bg-theme-bg-secondary text-theme-text-secondary transition-colors hover:text-gold-500 disabled:opacity-50"
            aria-label="Refresh analytics"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className={`rounded-xl border px-3 py-2 text-[10px] leading-relaxed ${error ? 'border-cathedral-500/30 bg-cathedral-500/5 text-theme-text' : 'border-theme-border/40 bg-theme-bg-secondary/60 text-theme-text-secondary'}`}>
          {error && !snapshot
            ? `Analytics unavailable: ${error}`
            : snapshot
              ? `${isOfflineSnapshot ? 'Offline snapshot' : 'Server aggregates'} · Refreshed ${new Date(snapshot.generatedAt).toLocaleString()}`
              : 'Loading authoritative ministry aggregates…'}
        </div>

        {/* Date Selector scrollable strip */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1.5 -mx-4 px-4">
          {(['This Week', 'This Month', 'This Quarter', 'This Year'] as const).map((range) => {
            const isActive = dateRange === range;
            return (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={`px-4 py-1.5 rounded-full text-xs font-black transition-all duration-200 whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-gold-500 text-black shadow-glow-gold font-extrabold'
                    : 'bg-theme-bg-secondary text-theme-text-secondary border border-theme-border/40 hover:bg-theme-text/5'
                }`}
              >
                {range}
              </button>
            );
          })}
        </div>
      </div>

      {/* ======================================================================
          SECTION 1: KEY METRICS ROW (HORIZONTAL SCROLL)
          ====================================================================== */}
      <div className="grid grid-cols-2 gap-3">

        {/* Hero tile: Average Cell Attendance — spans full width, ring visual */}
        <div className="col-span-2 rounded-[20px] p-4 flex items-center justify-between bg-gradient-to-br from-gold-300 to-gold-500 text-[#241B0B] shadow-glow-gold">
          <div>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-black/10 text-[#241B0B] inline-flex items-center gap-0.5 mb-2">
              <TrendingUp className="w-3 h-3" />
              {snapshot ? dateRange : 'Loading'}
            </span>
            <p className={`${Typography.SUBTITLE} font-black text-[#241B0B]`}>Average Cell Attendance</p>
            <p className={`${Typography.CAPTION} text-[#3D2E12]/80 mt-0.5`}>Across all active fellowship groups</p>
          </div>
          <ProgressRing percent={averageAttendance} size={72} color="#0C0C0E" trackColor="rgba(0,0,0,0.15)" />
        </div>

        {/* Metric: Total Saints */}
        <StatBlock
          icon={<Users className="w-4.5 h-4.5" />}
          value={totalMembersCount}
          label="Total Saints"
        />

        {/* Metric: Prayers Registered */}
        <StatBlock
          icon={<Heart className="w-4.5 h-4.5" />}
          value={totalPrayersCount}
          label="Active Prayers"
        />

        {/* Metric: Academy Certificates — spans full width */}
        <div className="col-span-2">
          <StatBlock
            icon={<Award className="w-4.5 h-4.5" />}
            value={totalCertificatesCount}
            label="Certificates Issued"
          />
        </div>

      </div>

      {/* ======================================================================
          SECTION 2: CELL ATTENDANCE TRENDS (MAIN CHART)
          ====================================================================== */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className={`${Typography.SUBTITLE} font-black text-theme-text`}>
            Attendance Trend
          </h4>
          <span className="text-[10px] font-mono text-theme-text-secondary opacity-70">
            {dateRange === 'This Week' ? 'Daily Average' : 'Weekly Average'}
          </span>
        </div>

        <GlassCard className="p-4 relative overflow-hidden">
          <p className="text-xs font-black text-theme-text mb-3">
            Cell Attendance Over Time
          </p>

          <div className="w-full h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={attendanceTrendData}
                margin={{ top: 10, right: 5, left: -25, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="averageGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={styles.primary} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={styles.primary} stopOpacity={0} />
                  </linearGradient>
                </defs>
                
                <CartesianGrid 
                  stroke={styles.grid} 
                  strokeDasharray="3 3" 
                  vertical={false}
                />
                
                <XAxis 
                  dataKey="name" 
                  stroke={styles.text} 
                  fontSize={9}
                  tickLine={false}
                  axisLine={false}
                />
                
                <YAxis 
                  stroke={styles.text} 
                  fontSize={9}
                  domain={[0, 100]}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => `${val}%`}
                />
                
                <Tooltip
                  contentStyle={tooltipContentStyle}
                  formatter={(value: any, name: any) => [`${value}%`, name]}
                />

                {/* Area Gradient beneath overall average line */}
                <Area 
                  type="monotone" 
                  dataKey="Overall Average" 
                  fill="url(#averageGradient)" 
                  stroke="none"
                />

                {/* Thick Gold Overall Average Line */}
                <Line 
                  type="monotone" 
                  dataKey="Overall Average" 
                  stroke={styles.primary} 
                  strokeWidth={2.5}
                  activeDot={{ r: 6 }}
                  name="Overall Average"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Chart Legends */}
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 mt-3 pt-2.5 border-t border-theme-border/20 text-[9px] font-bold text-theme-text-secondary">
            <div className="flex items-center gap-1">
              <span className="w-2.5 h-0.5 bg-gold-500 rounded-full" />
              <span>Overall Avg ({attendanceTrendData.length} periods)</span>
            </div>
            <span className="opacity-70">Attendance records acknowledged by PocketBase</span>
          </div>
        </GlassCard>
      </div>

      {/* ======================================================================
          SECTION 3: CELL GROUP PERFORMANCE TABLE
          ====================================================================== */}
      <div className="space-y-3">
        <h4 className={`${Typography.SUBTITLE} font-black text-theme-text`}>
          Cell Group Standings
        </h4>

        <GlassCard className="p-0 overflow-hidden">
          <div className="overflow-x-auto max-w-full">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-theme-bg-secondary/70 border-b border-theme-border text-theme-text-secondary select-none font-black text-[9px] uppercase tracking-wider">
                  <th 
                    onClick={() => handleSort('name')}
                    className="p-3 pl-4 cursor-pointer hover:bg-theme-text/5 min-w-[130px]"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Cell Group</span>
                      <ArrowUpDown className="w-3 h-3 text-gold-500/80" />
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('leader')}
                    className="p-3 cursor-pointer hover:bg-theme-text/5"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Leader</span>
                      <ArrowUpDown className="w-3 h-3 text-gold-500/80" />
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('membersCount')}
                    className="p-3 text-center cursor-pointer hover:bg-theme-text/5"
                  >
                    <div className="flex items-center gap-1.5 justify-center">
                      <span>Saints</span>
                      <ArrowUpDown className="w-3 h-3 text-gold-500/80" />
                    </div>
                  </th>
                  <th 
                    onClick={() => handleSort('avgAttendance')}
                    className="p-3 text-center cursor-pointer hover:bg-theme-text/5"
                  >
                    <div className="flex items-center gap-1.5 justify-center">
                      <span>Avg Attendance</span>
                      <ArrowUpDown className="w-3 h-3 text-gold-500/80" />
                    </div>
                  </th>
                  <th className="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-theme-border/40 text-theme-text">
                {cellPerformanceRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-[11px] text-theme-text-secondary">
                      No active cell records are available for this period.
                    </td>
                  </tr>
                )}
                {cellPerformanceRows.map((cell) => {
                  const status = getCellStatus(cell.avgAttendance, cell.reportsSubmitted);
                  return (
                    <tr 
                      key={cell.id}
                      onClick={() => setSelectedCell(cell)}
                      className="hover:bg-theme-text/[0.02] cursor-pointer transition-colors"
                    >
                      <td className="p-3 pl-4 font-black text-[11px] text-theme-text flex flex-col">
                        <span>{cell.name}</span>
                        <span className="text-[9px] text-theme-text-secondary font-medium">
                          {cell.reportsSubmitted}% reports submitted
                        </span>
                      </td>
                      <td className="p-3 font-semibold text-[11px] text-theme-text-secondary">
                        {cell.leader}
                      </td>
                      <td className="p-3 text-center font-mono font-bold">
                        {cell.membersCount}
                      </td>
                      <td className="p-3 text-center font-mono font-black text-gold-500">
                        {cell.avgAttendance}%
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex justify-center">
                          <AccentBadge 
                            label={status.label} 
                            variant={status.variant}
                            size="sm"
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </GlassCard>
      </div>

      {/* ======================================================================
          SECTION 4: PRAYER BANK ANALYTICS
          ====================================================================== */}
      <div className="space-y-3">
        <h4 className={`${Typography.SUBTITLE} font-black text-theme-text`}>
          Prayer Analytics
        </h4>

        <div className="grid grid-cols-2 gap-3">
          
          {/* Two-Column Mini Stat Cards */}
          <GlassCard className="p-3.5 space-y-3 flex flex-col justify-between">
            <div>
              <p className="text-[9px] font-black uppercase tracking-wider text-theme-text-secondary">
                Total Requests Received
              </p>
              <h5 className="text-2xl font-black font-mono text-theme-text mt-1">
                {snapshot?.totalPrayers ?? 0}
              </h5>
            </div>
            <div className="border-t border-theme-border/20 pt-2 flex items-center justify-between text-[10px] text-theme-text-secondary">
              <span>Answered Prayers</span>
              <span className="font-mono font-bold text-gold-500">
                {snapshot?.answeredPrayers ?? 0}{snapshot?.totalPrayers ? ` (${Math.round((snapshot.answeredPrayers / snapshot.totalPrayers) * 100)}%)` : ''}
              </span>
            </div>
          </GlassCard>

          <GlassCard className="p-3.5 space-y-3 flex flex-col justify-between">
            <div>
              <p className="text-[9px] font-black uppercase tracking-wider text-theme-text-secondary">
                Avg Response Window
              </p>
              <h5 className="text-2xl font-black font-mono text-theme-text mt-1">
                {snapshot?.averagePrayerResponseDays ?? 0} Days
              </h5>
            </div>
            <div className="border-t border-theme-border/20 pt-2 flex items-center justify-between text-[10px] text-theme-text-secondary">
              <span>Active Intercessors</span>
              <span className="font-mono font-bold text-gold-500">{snapshot?.activeIntercessors ?? 0} Saints</span>
            </div>
          </GlassCard>

        </div>

        {/* Categories breakdown & trend bars — stacked full-width rows, not squeezed columns */}
        <div className="flex flex-col gap-4">

          {/* Category Pie Chart */}
          <GlassCard className="p-4 flex flex-col justify-between">
            <p className="text-xs font-black text-theme-text mb-3">
              Prayer Request Categories
            </p>

            <div className="flex items-center justify-between gap-4">
              <div className="w-[140px] h-[140px] flex-shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip contentStyle={tooltipContentStyle} formatter={(value: any, name: any) => [`${value}%`, name]} />
                    <Pie
                      data={prayerCategoriesData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={60}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {prayerCategoriesData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Legends column */}
              <div className="flex-1 space-y-2 text-[11px] font-bold">
                {prayerCategoriesData.map((item) => (
                  <div key={item.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-theme-text-secondary">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                      <span>{item.name}</span>
                    </div>
                      <span className="font-mono text-theme-text">{item.count} · {item.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          </GlassCard>

          {/* Bar Chart Trend */}
          <GlassCard className="p-4">
            <p className="text-xs font-black text-theme-text mb-3">
              Weekly Volume Trend
            </p>

            <div className="w-full h-[140px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={prayerTrendData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <CartesianGrid stroke={styles.grid} vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="name" stroke={styles.text} fontSize={9} tickLine={false} axisLine={false} />
                  <YAxis stroke={styles.text} fontSize={9} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: 'rgba(212, 168, 74, 0.05)' }} contentStyle={tooltipContentStyle} />
                  <Bar dataKey="count" fill={styles.primary} radius={[4, 4, 0, 0]} barSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>

        </div>
      </div>

      {/* ======================================================================
          SECTION 5: TRAINING ACADEMY STATS
          ====================================================================== */}
      <div className="space-y-3">
        <h4 className={`${Typography.SUBTITLE} font-black text-theme-text`}>
          Training Academy Overview
        </h4>

        <GlassCard className="p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-theme-border/20 pb-2.5">
            <p className="text-xs font-black text-theme-text">
              Published Courses Completion Rate
            </p>
            <div className="flex items-center gap-1 text-[10px] font-mono text-gold-500">
              <Award className="w-3.5 h-3.5" />
              <span>{totalCertificatesCount} Verified Certs</span>
            </div>
          </div>

          <div className="space-y-3.5">
            {(snapshot?.courses ?? []).map((course) => (
              <div key={course.id} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex flex-col">
                    <span className="font-black text-theme-text leading-tight">{course.name}</span>
                    <span className="text-[10px] text-theme-text-secondary">{course.enrolled} Enrolled Saints</span>
                  </div>
                  <span className="font-mono font-black text-gold-500">{course.completionRate}%</span>
                </div>

                {/* Flat Gold Progress Bar */}
                <div className="h-2 w-full bg-theme-text/[0.04] dark:bg-white/[0.04] rounded-full overflow-hidden border border-theme-border/10">
                  <div 
                    className="h-full bg-gradient-to-r from-cathedral-500 to-gold-500 rounded-full"
                    style={{ width: `${course.completionRate}%` }}
                  />
                </div>
              </div>
            ))}
            {snapshot?.courses.length === 0 && (
              <p className="py-5 text-center text-[11px] text-theme-text-secondary">No published Academy courses are available.</p>
            )}
          </div>
        </GlassCard>
      </div>

      {/* ======================================================================
          SECTION 6: ANNOUNCEMENT PUBLICATION STATUS
          ====================================================================== */}
      <div className="space-y-3">
        <h4 className={`${Typography.SUBTITLE} font-black text-theme-text`}>
          Communication Publication Status
        </h4>

        <GlassCard className="p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-theme-border/20 pb-2">
            <p className="text-xs font-black text-theme-text">
              Announcement Categories
            </p>
            <span className="text-[9px] font-mono font-bold text-theme-text-secondary">
              {snapshot?.activeAnnouncements ?? 0} live now
            </span>
          </div>

          <div className="space-y-3.5">
            {(snapshot?.announcements ?? []).map((announce) => (
              <div key={announce.id} className="flex items-center justify-between">
                <div className="flex items-start gap-2.5 max-w-[65%]">
                  <div className="w-7 h-7 rounded-lg bg-theme-bg-secondary flex items-center justify-center text-gold-500 mt-0.5">
                    <Activity className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-black text-theme-text leading-tight truncate">
                      {announce.tag}
                    </span>
                    <span className="text-[9px] text-theme-text-secondary">
                      {announce.total} total · {announce.archived} archived or expired
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 font-mono font-bold text-[10px]">
                  <span className="rounded-full bg-sage-400/10 px-2 py-1 text-sage-400">{announce.active} live</span>
                  <span className="rounded-full bg-gold-500/10 px-2 py-1 text-gold-500">{announce.scheduled} queued</span>
                </div>
              </div>
            ))}
            {snapshot?.announcements.length === 0 && (
              <p className="py-5 text-center text-[11px] text-theme-text-secondary">No announcement publication records are available.</p>
            )}
          </div>

          <div className="pt-2 border-t border-theme-border/10 text-[10px] leading-relaxed text-theme-text-secondary">
            Engagement rates are intentionally omitted until verifiable view and reminder events are recorded by the backend.
          </div>

        </GlassCard>
      </div>

      {/* ======================================================================
          SECTION 7: EXPORT & SHARING UTILITIES
          ====================================================================== */}
      <GlassCard className="p-4 border border-gold-500/10 bg-gold-500/[0.01]">
        <div className="flex flex-col space-y-3">
          <div className="space-y-1">
            <p className="text-xs font-black text-theme-text">
              Operational Export & Archiving
            </p>
            <p className="text-[10px] text-theme-text-secondary leading-normal">
              Generate print-ready executive summaries or share instant text digests across church communications networks.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2.5 pt-1">
            
            {/* Download/Print Button */}
            <button
              onClick={() => setShowPrintModal(true)}
              disabled={!snapshot}
              className="px-3.5 py-2.5 bg-theme-text text-theme-bg dark:bg-white dark:text-black rounded-xl text-xs font-black hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-1.5 shadow-md disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Printer className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Print Report</span>
            </button>

            {/* WhatsApp Share Button */}
            <button
              onClick={handleShareSummary}
              disabled={!snapshot}
              className="px-3.5 py-2.5 bg-gold-500 text-black rounded-xl text-xs font-black hover:bg-gold-600 active:scale-95 transition-all flex items-center justify-center gap-1.5 shadow-glow-gold border border-gold-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Share2 className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Share Summary</span>
            </button>

          </div>
        </div>
      </GlassCard>


      {/* ======================================================================
          BOTTOM SHEET: CELL GROUP ANNOTATED ANALYTICS
          ====================================================================== */}
      <BottomSheet
        isOpen={selectedCell !== null}
        onClose={() => setSelectedCell(null)}
        title="Cell Group Oversight Details"
      >
        {selectedCell && (
          <div className="space-y-6 pb-6 select-none">
            
            {/* Header Badge overview */}
            <div className="flex items-start justify-between">
              <div>
                <h4 className="text-lg font-black text-theme-text leading-tight">
                  {selectedCell.name}
                </h4>
                <p className="text-xs text-theme-text-secondary mt-0.5">
                  Led by {selectedCell.leader} · {selectedCell.membersCount} Saints registered
                </p>
              </div>
              <AccentBadge 
                label={getCellStatus(selectedCell.avgAttendance, selectedCell.reportsSubmitted).label} 
                variant={getCellStatus(selectedCell.avgAttendance, selectedCell.reportsSubmitted).variant}
              />
            </div>

            {/* Performance Indicators Grid */}
            <div className="grid grid-cols-3 gap-2.5 text-center">
              <div className="p-3 rounded-2xl bg-theme-bg-secondary/40 border border-theme-border/40">
                <span className="text-[10px] font-bold text-theme-text-secondary uppercase block">
                  Attendance
                </span>
                <span className="text-lg font-black font-mono text-gold-500 block mt-1">
                  {selectedCell.avgAttendance}%
                </span>
              </div>

              <div className="p-3 rounded-2xl bg-theme-bg-secondary/40 border border-theme-border/40">
                <span className="text-[10px] font-bold text-theme-text-secondary uppercase block">
                  Reports Rate
                </span>
                <span className="text-lg font-black font-mono text-theme-text block mt-1">
                  {selectedCell.reportsSubmitted}%
                </span>
              </div>

              <div className="p-3 rounded-2xl bg-theme-bg-secondary/40 border border-theme-border/40">
                <span className="text-[10px] font-bold text-theme-text-secondary uppercase block">
                  Active Trend
                </span>
                <span className="text-lg font-black text-theme-text block mt-1">
                  {selectedCell.avgAttendance >= 80 ? '📈 Stable' : '⚠️ Alert'}
                </span>
              </div>
            </div>

            {/* Mini Trend Line */}
            <div className="space-y-2">
              <p className="text-xs font-black text-theme-text">
                Attendance Trend for {dateRange}
              </p>
              <div className="w-full h-[110px] bg-theme-text/[0.01] rounded-2xl p-2.5 border border-theme-border/30">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart 
                    data={selectedCell.trend.map((val: number, i: number) => ({ name: `F${i+1}`, attendance: val }))}
                    margin={{ top: 5, right: 0, left: -40, bottom: 0 }}
                  >
                    <CartesianGrid stroke={styles.grid} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" stroke={styles.text} fontSize={9} />
                    <YAxis stroke={styles.text} fontSize={9} domain={[0, 100]} />
                    <Tooltip contentStyle={tooltipContentStyle} />
                    <Area type="monotone" dataKey="attendance" stroke={styles.primary} strokeWidth={2} fill="url(#averageGradient)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Ministry checklist */}
            <div className="space-y-3">
              <p className="text-xs font-black text-theme-text">
                Leadership Checklist Status
              </p>
              <div className="space-y-2">
                <div className="flex items-center gap-2.5 text-xs text-theme-text">
                  <span className="w-4.5 h-4.5 rounded-full bg-sage-400/20 text-sage-400 flex items-center justify-center text-[10px] font-bold">
                    ✓
                  </span>
                  <span>{selectedCell.leader === 'Not assigned' ? 'Cell leader assignment is missing' : 'Cell leader is assigned'}</span>
                </div>
                <div className="flex items-center gap-2.5 text-xs text-theme-text">
                  <span className="w-4.5 h-4.5 rounded-full bg-sage-400/20 text-sage-400 flex items-center justify-center text-[10px] font-bold">
                    ✓
                  </span>
                  <span>{selectedCell.avgAttendance > 0 ? 'Attendance records are available for this period' : 'No attendance captured for this period'}</span>
                </div>
                <div className="flex items-center gap-2.5 text-xs text-theme-text">
                  <span className={`w-4.5 h-4.5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    selectedCell.reportsSubmitted === 100 
                      ? 'bg-sage-400/20 text-sage-400' 
                      : 'bg-gold-500/20 text-gold-500'
                  }`}>
                    {selectedCell.reportsSubmitted === 100 ? '✓' : '!'}
                  </span>
                  <span>{selectedCell.reportsSubmitted}% of recorded meetings have submitted reports</span>
                </div>
              </div>
            </div>

          </div>
        )}
      </BottomSheet>


      {/* ======================================================================
          PRINT PREVIEW MODAL (IN-APP PDF REPLICA)
          ====================================================================== */}
      <AnimatePresence>
        {showPrintModal && (
          <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white text-black w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]"
            >
              
              {/* Preview controls (non-printable) */}
              <div className="bg-gray-100 p-4 border-b border-gray-200 flex items-center justify-between no-print select-none">
                <div className="flex items-center gap-2">
                  <Printer className="w-4 h-4 text-gray-700" />
                  <span className="text-xs font-black text-gray-800 uppercase tracking-wide">
                    Executive Report Preview
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePrintReport}
                    className="px-3.5 py-1.5 bg-black text-white hover:bg-gray-800 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print Summary</span>
                  </button>
                  <button
                    onClick={() => setShowPrintModal(false)}
                    className="w-7 h-7 rounded-full bg-gray-200 hover:bg-gray-300 transition-all flex items-center justify-center text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* PDF Document Container */}
              <div 
                id="print-area" 
                className="p-8 overflow-y-auto bg-white text-black font-sans space-y-6 leading-relaxed"
              >
                
                {/* Official Branding Header */}
                <div className="flex justify-between items-start border-b-2 border-gray-900 pb-5">
                  <div className="space-y-1">
                    <h2 className="text-2xl font-black tracking-tight text-gray-900">
                      ChurchConnect
                    </h2>
                    <p className="text-[10px] uppercase font-bold tracking-widest text-gray-500">
                      Ministry Executive Summary
                    </p>
                  </div>
                  <div className="text-right text-[10px] font-mono text-gray-500 space-y-0.5">
                    <p>Snapshot: {snapshot ? new Date(snapshot.generatedAt).toLocaleString() : 'Unavailable'}</p>
                    <p>Oversight: Administrator & Lead Pastor Panel</p>
                    <p>Range: {dateRange} Analytics</p>
                  </div>
                </div>

                {/* Key Stats Block Grid */}
                <div className="grid grid-cols-4 gap-4">
                  <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl">
                    <span className="text-[8px] uppercase tracking-wider font-bold text-gray-500 block">
                      Total Saints
                    </span>
                    <span className="text-xl font-black font-mono text-gray-900 block mt-1">
                      {totalMembersCount}
                    </span>
                  </div>

                  <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl">
                    <span className="text-[8px] uppercase tracking-wider font-bold text-gray-500 block">
                      Avg Attendance
                    </span>
                    <span className="text-xl font-black font-mono text-gray-900 block mt-1">
                      {averageAttendance}%
                    </span>
                  </div>

                  <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl">
                    <span className="text-[8px] uppercase tracking-wider font-bold text-gray-500 block">
                      Active Prayers
                    </span>
                    <span className="text-xl font-black font-mono text-gray-900 block mt-1">
                      {totalPrayersCount}
                    </span>
                  </div>

                  <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl">
                    <span className="text-[8px] uppercase tracking-wider font-bold text-gray-500 block">
                      Certs Issued
                    </span>
                    <span className="text-xl font-black font-mono text-gray-900 block mt-1">
                      {totalCertificatesCount}
                    </span>
                  </div>
                </div>

                {/* Cell Group Standing Tables */}
                <div className="space-y-2">
                  <h4 className="text-xs font-black text-gray-900 uppercase tracking-wider">
                    Cell Group Performance Registry
                  </h4>
                  <table className="w-full text-left text-[10px] border-collapse border border-gray-200">
                    <thead>
                      <tr className="bg-gray-100 border-b border-gray-300 font-bold uppercase text-[8px] tracking-wide text-gray-600">
                        <th className="p-2 border-r border-gray-200">Cell Group</th>
                        <th className="p-2 border-r border-gray-200">Leader Assigned</th>
                        <th className="p-2 text-center border-r border-gray-200">Members</th>
                        <th className="p-2 text-center border-r border-gray-200">Avg Attendance</th>
                        <th className="p-2 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 text-gray-800">
                      {cellPerformanceRows.map((cell) => {
                        const status = getCellStatus(cell.avgAttendance, cell.reportsSubmitted);
                        return (
                          <tr key={cell.id} className="hover:bg-gray-50">
                            <td className="p-2 font-black border-r border-gray-200">{cell.name}</td>
                            <td className="p-2 border-r border-gray-200">{cell.leader}</td>
                            <td className="p-2 text-center border-r border-gray-200">{cell.membersCount}</td>
                            <td className="p-2 text-center font-bold border-r border-gray-200">{cell.avgAttendance}%</td>
                            <td className="p-2 text-center font-bold">{status.label}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Prayer bank category analysis list */}
                <div className="grid grid-cols-2 gap-6 pt-2">
                  <div className="space-y-2">
                    <h4 className="text-xs font-black text-gray-900 uppercase tracking-wider">
                      Prayer Category Distribution
                    </h4>
                    <div className="space-y-1.5 text-[10px]">
                      {prayerCategoriesData.map((item) => (
                        <div key={item.name} className="flex justify-between border-b border-gray-100 pb-1">
                          <span className="text-gray-600">{item.name} Intercession:</span>
                          <span className="font-bold text-gray-900">{item.value}% of requests</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-xs font-black text-gray-900 uppercase tracking-wider">
                      Discipleship Training Metrics
                    </h4>
                    <div className="space-y-1.5 text-[10px]">
                      {(snapshot?.courses ?? []).map((course) => (
                        <div key={course.id} className="flex justify-between border-b border-gray-100 pb-1">
                          <span className="text-gray-600">{course.name}:</span>
                          <span className="font-bold text-gray-900">{course.completionRate}% completions</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Sign-off signatures */}
                <div className="pt-8 flex justify-between text-[9px] text-gray-500 font-mono select-none">
                  <div className="w-48 text-center border-t border-gray-400 pt-1.5">
                    Prepared By: {user?.name || 'Authorized user'}
                  </div>
                  <div className="w-48 text-center border-t border-gray-400 pt-1.5">
                    Source: PocketBase reporting views
                  </div>
                </div>

              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
