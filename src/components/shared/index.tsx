import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence, useDragControls } from 'motion/react';
import { useTheme } from '../../lib/theme/ThemeProvider';
import * as Typography from '../../lib/theme/typography';
import { useHaptic } from '../../lib/animations';
import {
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Mic,
  Search,
  BookOpen,
  Flame,
  SlidersHorizontal
} from 'lucide-react';

// ==========================================
// Avatar gradient palette (deterministic per name)
// ==========================================
const AVATAR_GRADIENTS = [
  'from-gold-400 to-gold-600',
  'from-cathedral-400 to-cathedral-600',
  'from-sage-400 to-sage-600',
  'from-amber-300 to-orange-500',
  'from-sky-300 to-blue-500',
  'from-violet-300 to-purple-500',
  'from-rose-300 to-pink-500',
  'from-teal-300 to-emerald-500',
];

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// ==========================================
// 1. GlassCard
// ==========================================
interface GlassCardProps {
  children: React.ReactNode;
  variant?: 'default' | 'elevated' | 'solid' | 'hero';
  pressable?: boolean;
  onPress?: () => void;
  className?: string;
  id?: string;
  key?: any;
}

export function GlassCard({
  children,
  variant = 'default',
  pressable = false,
  onPress,
  className = '',
  id
}: GlassCardProps) {
  const isHero = variant === 'hero';

  const cardClasses = {
    default: 'glass-card text-theme-text',
    elevated: 'bg-white/90 dark:bg-white/[0.07] border border-black/[0.06] dark:border-white/[0.09] backdrop-blur-none dark:backdrop-blur-glass shadow-card-light dark:shadow-float text-theme-text',
    solid: 'bg-white dark:bg-surface-100 border border-black/[0.06] dark:border-surface-200 text-theme-text shadow-card-light dark:shadow-card-dark',
    hero: 'bg-cathedral-100 dark:bg-gradient-to-br dark:from-cathedral-950 dark:to-cathedral-900 border border-cathedral-200 dark:border-cathedral-500/20 text-cathedral-700 dark:text-white shadow-card-light dark:shadow-glow-cathedral'
  }[variant];

  const content = (
    <div
      id={id}
      onClick={onPress}
      className={`rounded-card p-4 transition-all duration-300 ${cardClasses} ${
        pressable ? 'cursor-pointer hover:scale-[1.01]' : ''
      } ${className}`}
    >
      {children}
    </div>
  );

  if (pressable) {
    return (
      <motion.button
        id={id ? `${id}-btn` : undefined}
        onClick={onPress}
        whileTap={{ scale: 0.98 }}
        className="w-full text-left bg-transparent border-0 p-0 m-0 block"
      >
        {content}
      </motion.button>
    );
  }

  return content;
}

// ==========================================
// 2. AccentBadge
// ==========================================
interface AccentBadgeProps {
  label: string;
  variant?: 'gold' | 'cathedral' | 'sage' | 'muted' | 'outline';
  icon?: React.ReactNode;
  size?: 'sm' | 'md';
  id?: string;
}

export function AccentBadge({
  label,
  variant = 'gold',
  icon,
  size = 'md',
  id
}: AccentBadgeProps) {
  const badgeClasses = {
    gold: 'bg-gold-100 dark:bg-gold-500/15 text-gold-800 dark:text-gold-400',
    cathedral: 'bg-cathedral-100 dark:bg-cathedral-800 text-cathedral-800 dark:text-white',
    sage: 'bg-sage-50 dark:bg-[#7BC47F]/15 text-sage-700 dark:text-[#7BC47F]',
    muted: 'bg-surface-light-secondary dark:bg-surface-200 text-theme-text-secondary',
    outline: 'bg-transparent border border-cathedral-700 dark:border-gold-500 text-cathedral-700 dark:text-gold-400'
  }[variant];

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[10px]',
    md: 'px-3 py-1 text-xs'
  }[size];

  return (
    <div
      id={id}
      className={`rounded-pill font-semibold flex items-center justify-center gap-1.5 w-fit flex-shrink-0 whitespace-nowrap ${badgeClasses} ${sizeClasses}`}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      <span>{label}</span>
    </div>
  );
}

// ==========================================
// 3. StatBlock
// ==========================================
interface StatBlockProps {
  icon: React.ReactNode;
  value: string | number;
  label: string;
  highlight?: boolean;
  trend?: { direction: 'up' | 'down'; value: string };
  onPress?: () => void;
  id?: string;
}

export function StatBlock({
  icon,
  value,
  label,
  highlight = false,
  trend,
  onPress,
  id
}: StatBlockProps) {
  const isInteractive = !!onPress;

  const content = (
    <div
      id={id}
      className={`rounded-[20px] p-4 flex flex-col justify-between min-h-[115px] shadow-card-light dark:shadow-card-dark w-full transition-all duration-300 ${
        highlight
          ? 'bg-gradient-to-br from-gold-300 to-gold-500 text-[#241B0B] shadow-glow-gold'
          : 'bg-white dark:bg-white/[0.04] border border-black/[0.04] dark:border-white/[0.06] text-theme-text'
      }`}
    >
      <div className="flex items-center justify-between w-full">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
          highlight 
            ? 'bg-black/10 text-[#241B0B]'
            : 'bg-gold-500/10 text-gold-500'
        }`}>
          {icon}
        </div>
        {trend && (
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 ${
            highlight
              ? 'bg-black/15 text-[#241B0B]'
              : trend.direction === 'up'
                ? 'bg-semantic-success/10 text-semantic-success'
                : 'bg-cathedral-500/15 text-cathedral-400'
          }`}>
            {trend.direction === 'up' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {trend.value}
          </span>
        )}
      </div>

      <div className="mt-3">
        <span className={`${Typography.DATA} block leading-none ${
          highlight ? 'text-[#241B0B]' : 'text-theme-text'
        }`}>
          {value}
        </span>
        <span className={`${Typography.CAPTION} mt-1 block ${
          highlight ? 'text-[#3D2E12]/80' : 'text-theme-text-secondary'
        }`}>
          {label}
        </span>
      </div>
    </div>
  );

  if (isInteractive) {
    return (
      <motion.button
        id={id ? `${id}-btn` : undefined}
        onClick={onPress}
        whileTap={{ scale: 0.96 }}
        className="w-full text-left bg-transparent border-0 p-0 m-0 block cursor-pointer"
      >
        {content}
      </motion.button>
    );
  }

  return content;
}

// ==========================================
// 4. DayStrip
// ==========================================
interface DayStripProps {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  markedDates?: Record<string, 'complete' | 'partial' | 'missed'>;
  id?: string;
}

export function DayStrip({
  selectedDate,
  onSelectDate,
  markedDates = {},
  id
}: DayStripProps) {
  const { isDark } = useTheme();

  // Helper: generates 7 days starting from Monday of the selectedDate's week
  const getWeekDays = (baseDate: Date) => {
    const start = new Date(baseDate);
    const day = start.getDay();
    // Adjust day to start from Monday (1) instead of Sunday (0)
    const diff = start.getDate() - day + (day === 0 ? -6 : 1);
    start.setDate(diff);

    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  };

  const weekDays = getWeekDays(selectedDate);
  const dayLabels = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

  return (
    <div
      id={id}
      className="flex justify-between items-center p-3 rounded-[24px] glass-card gap-1 w-full"
    >
      {weekDays.map((date, idx) => {
        const isSelected = date.toDateString() === selectedDate.toDateString();
        const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        const markStatus = markedDates[dateKey];

        const dayName = dayLabels[idx];
        const dateNumber = date.getDate();

        return (
          <motion.button
            key={idx}
            onClick={() => onSelectDate(date)}
            whileTap={{ scale: 0.95 }}
            className={`flex flex-col items-center justify-center flex-1 py-2 rounded-xl transition-all duration-300 min-h-[58px] cursor-pointer ${
              isSelected
                ? isDark
                  ? 'bg-gold-500 text-black shadow-[0_0_15px_rgba(200,164,92,0.3)] scale-[1.05]'
                  : 'bg-cathedral-700 text-white shadow-[0_0_15px_rgba(123,29,49,0.15)] scale-[1.05]'
                : 'hover:bg-surface-light-secondary dark:hover:bg-surface-200/50 text-theme-text-secondary'
            }`}
          >
            <span className={`text-[10px] font-bold tracking-wider mb-1 ${
              isSelected
                ? isDark ? 'text-black' : 'text-white'
                : 'text-theme-text-muted'
            }`}>
              {dayName}
            </span>
            <span className={`text-sm font-extrabold ${
              isSelected
                ? isDark ? 'text-black font-black' : 'text-white font-black'
                : 'text-theme-text'
            }`}>
              {dateNumber}
            </span>

            {/* Marker Dot */}
            {markStatus && (
              <span className={`w-1 h-1 rounded-full mt-1 ${
                markStatus === 'complete'
                  ? isSelected ? (isDark ? 'bg-black' : 'bg-white') : 'bg-gold-500'
                  : markStatus === 'partial'
                    ? isSelected ? (isDark ? 'bg-black' : 'bg-white') : 'bg-cathedral-500'
                    : 'bg-text-muted'
              }`}></span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}

// ==========================================
// 5. ContentRow
// ==========================================
interface ContentRowProps {
  thumbnail?: string | React.ReactNode;
  title: string;
  subtitle?: string;
  meta?: string;
  action?: React.ReactNode;
  onPress?: () => void;
  id?: string;
  key?: any;
}

export function ContentRow({
  thumbnail,
  title,
  subtitle,
  meta,
  action,
  onPress,
  id
}: ContentRowProps) {
  const isInteractive = !!onPress;

  const content = (
    <div
      id={id}
      className={`w-full flex items-center justify-between p-3 border-b border-theme-border min-h-[72px] transition-all ${
        isInteractive 
          ? 'cursor-pointer hover:bg-surface-light-secondary/50 dark:hover:bg-surface-100/30' 
          : ''
      }`}
      onClick={onPress}
    >
      <div className="flex items-center gap-3.5 flex-1 pr-2">
        {/* Thumbnail / Left Slot */}
        {thumbnail && (
          <div className="flex-shrink-0">
            {typeof thumbnail === 'string' ? (
              <img
                src={thumbnail}
                alt={title}
                referrerPolicy="no-referrer"
                className="w-14 h-14 rounded-lg object-cover bg-surface-light-secondary dark:bg-surface-300"
              />
            ) : (
              <div className="w-14 h-14 rounded-lg flex items-center justify-center bg-surface-light-secondary dark:bg-surface-200 text-theme-text">
                {thumbnail}
              </div>
            )}
          </div>
        )}

        {/* Center Text Details */}
        <div className="flex-1 min-w-0 space-y-0.5">
          <h4 className={`${Typography.SUBTITLE} text-theme-text truncate`}>
            {title}
          </h4>
          {subtitle && (
            <p className={`${Typography.CAPTION} text-theme-text-secondary truncate`}>
              {subtitle}
            </p>
          )}
          {meta && (
            <p className="text-[11px] font-medium text-theme-text-muted">
              {meta}
            </p>
          )}
        </div>
      </div>

      {/* Right Action Slot */}
      <div className="flex-shrink-0 pl-1">
        {action ? action : (
          <div className="w-8 h-8 rounded-full bg-surface-light-secondary dark:bg-surface-200 flex items-center justify-center text-theme-text-muted hover:text-theme-text transition-colors">
            <ChevronRight className="w-4 h-4" />
          </div>
        )}
      </div>
    </div>
  );

  if (isInteractive) {
    return (
      <motion.div
        whileTap={{ scale: 0.99 }}
        className="w-full"
      >
        {content}
      </motion.div>
    );
  }

  return content;
}

// ==========================================
// 6. HeroCard
// ==========================================
interface HeroCardProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  meta?: string;
  actionLabel?: string;
  onAction?: () => void;
  backgroundElement?: React.ReactNode;
  id?: string;
}

export function HeroCard({
  eyebrow,
  title,
  subtitle,
  meta,
  actionLabel = 'Discover',
  onAction,
  backgroundElement,
  id
}: HeroCardProps) {
  return (
    <div
      id={id}
      className="relative bg-gradient-to-br from-[#2B1920] via-[#24151A] to-cathedral-950 rounded-card-lg overflow-hidden border border-white/10 p-6 shadow-[0_10px_28px_rgba(61,14,24,0.18)] min-h-[180px] flex flex-col justify-between"
    >
      {/* Absolute Background Pattern / Edge Glow */}
      <div className="absolute inset-0 bg-gradient-to-br from-cathedral-700/30 via-transparent to-black/10 pointer-events-none z-0"></div>
      
      {backgroundElement && (
        <div className="absolute right-0 top-0 bottom-0 flex items-center justify-center opacity-10 pointer-events-none z-0 pr-6">
          {backgroundElement}
        </div>
      )}

      {/* Content details */}
      <div className="relative z-10 space-y-2">
        {eyebrow && (
          <span className="text-[10px] font-bold uppercase tracking-widest text-gold-300 block mb-1">
            {eyebrow}
          </span>
        )}
        <h2 className={`${Typography.TITLE} text-white font-extrabold tracking-tight`}>
          {title}
        </h2>
        {subtitle && (
          <p className="text-sm text-white/72 leading-relaxed">
            {subtitle}
          </p>
        )}
        {meta && (
          <p className="text-xs text-white/55">
            {meta}
          </p>
        )}
      </div>

      {onAction && (
        <div className="relative z-10 mt-5 flex items-center justify-between">
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={onAction}
            className="px-5 py-2 rounded-pill bg-gold-300 text-[#241B0B] font-bold text-xs hover:bg-gold-200 transition-colors cursor-pointer min-h-[40px] flex items-center shadow-md"
          >
            {actionLabel}
          </motion.button>
        </div>
      )}
    </div>
  );
}

// ==========================================
// 7. SectionTitle
// ==========================================
interface SectionTitleProps {
  title: string;
  badge?: { label: string; icon?: React.ReactNode; variant?: 'gold' | 'cathedral' | 'sage' | 'muted' | 'outline' };
  action?: { label: string; icon?: React.ReactNode; onPress: () => void };
  id?: string;
}

export function SectionTitle({
  title,
  badge,
  action,
  id
}: SectionTitleProps) {
  return (
    <div
      id={id}
      className="flex items-center justify-between gap-2 mt-6 mb-3 px-1 w-full"
    >
      <div className="flex items-center gap-2 min-w-0">
        <h3 className={`${Typography.TITLE} text-theme-text truncate`}>
          {title}
        </h3>
        <AnimatePresence>
          {badge && (
            <motion.div
              key={badge.label}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: [0, 1.15, 1], opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            >
              <AccentBadge
                label={badge.label}
                icon={badge.icon}
                size="sm"
                variant={badge.variant || "gold"}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {action && (
        <motion.button
          whileTap={{ scale: 0.94 }}
          onClick={action.onPress}
          className="text-[11px] font-bold text-gold-500 bg-gold-500/10 hover:bg-gold-500/15 border border-gold-500/20 rounded-pill cursor-pointer min-h-[32px] flex items-center gap-1.5 px-3 py-1.5 flex-shrink-0 whitespace-nowrap transition-colors"
        >
          {action.icon && <span className="flex-shrink-0">{action.icon}</span>}
          {action.label}
        </motion.button>
      )}
    </div>
  );
}

// ==========================================
// 8. GlowTabBar
// ==========================================
interface GlowTabBarProps {
  tabs: Array<{ id: string; label: string; icon: React.ReactNode }>;
  activeTab: string;
  onTabChange: (id: string) => void;
  centerTabId: string;
  id?: string;
}

export function GlowTabBar({
  tabs,
  activeTab,
  onTabChange,
  centerTabId,
  id
}: GlowTabBarProps) {
  const haptic = useHaptic();

  const handleTabClick = (tabId: string) => {
    haptic.tap();
    onTabChange(tabId);
  };

  return (
    <div
      id={id}
      className="absolute inset-x-0 bottom-0 h-[calc(var(--bottom-nav-height)+var(--bottom-nav-safe))] box-border pb-[var(--bottom-nav-safe)] pl-[max(0.75rem,var(--safe-left))] pr-[max(0.75rem,var(--safe-right))] bg-theme-bg/92 backdrop-blur-xl border-t border-theme-border flex items-center justify-around z-50 shadow-[0_-8px_24px_rgba(0,0,0,0.06)]"
    >
      {tabs.map((tab) => {
        const isCenter = tab.id === centerTabId;
        const isActive = activeTab === tab.id;

        if (isCenter) {
          return (
            <div key={tab.id} className="relative -translate-y-2 flex flex-col items-center justify-center">
              {/* Backing Glow Aura */}
              <div className="absolute w-16 h-16 bg-gold-500/20 rounded-full blur-xl pointer-events-none -z-10 animate-pulse"></div>

              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={() => handleTabClick(tab.id)}
                className="w-13 h-13 bg-gradient-to-br from-[#D4A84A] to-[#C8A45C] rounded-full flex items-center justify-center text-black shadow-[0_0_15px_rgba(200,164,92,0.4)] border-[3px] border-theme-bg cursor-pointer z-10 hover:scale-105 transition-transform"
                aria-label={tab.label}
                aria-current={isActive ? 'page' : undefined}
                title={tab.label}
              >
                {tab.icon}
              </motion.button>
              <span className="text-[9px] leading-none font-extrabold text-gold-500 tracking-wider mt-1 drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
                {tab.label}
              </span>
            </div>
          );
        }

        return (
          <motion.button
            key={tab.id}
            whileTap={{ scale: 0.9 }}
            onClick={() => handleTabClick(tab.id)}
            aria-label={tab.label}
            aria-current={isActive ? 'page' : undefined}
            className={`relative flex flex-col items-center justify-center transition-colors cursor-pointer min-h-[44px] min-w-[44px] ${
              isActive
                ? 'text-gold-500 font-bold'
                : 'text-theme-text-muted hover:text-theme-text-secondary'
            }`}
          >
            {isActive && (
              <motion.div
                layoutId="tabPillHighlight"
                className="absolute -inset-x-3 -inset-y-1.5 bg-gold-500/10 rounded-2xl -z-10"
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              />
            )}
            <div className={`${isActive ? 'scale-105 text-gold-500' : ''} transition-transform`}>
              {tab.icon}
            </div>
            <span className="text-[9px] leading-none mt-1 font-bold">
              {tab.label}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}

// ==========================================
// 9. BottomSheet
// ==========================================
interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  detents?: ('half' | 'full')[];
  id?: string;
}

export function BottomSheet({
  isOpen,
  onClose,
  title,
  children,
  detents = ['half'],
  id
}: BottomSheetProps) {
  const dragControls = useDragControls();

  // Simple check for escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const isFullDetent = detents.includes('full') && !detents.includes('half');

  const handleDragEnd = (_: PointerEvent, info: { offset: { y: number }; velocity: { y: number } }) => {
    if (info.offset.y > 120 || info.velocity.y > 500) {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div id={id} className="absolute inset-0 z-100 overflow-hidden flex items-end justify-center pointer-events-none">
          {/* Background Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-xs cursor-pointer pointer-events-auto"
          />

          {/* Bottom Sheet Slide Up Panel */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 1 }}
            onDragEnd={handleDragEnd}
            className={`w-full max-w-[412px] rounded-t-sheet bg-white dark:bg-surface-100 p-5 pb-[calc(1.25rem+var(--safe-bottom))] flex flex-col z-10 shadow-sheet border-t border-theme-border pointer-events-auto ${
              isFullDetent ? 'h-[90%]' : 'max-h-[75%]'
            }`}
          >
            {/* Grab Handle */}
            <div
              className="w-full flex justify-center mb-4 py-1 cursor-grab active:cursor-grabbing"
              style={{ touchAction: 'none' }}
              onPointerDown={(e) => dragControls.start(e)}
              onClick={onClose}
            >
              <div className="w-12 h-1 bg-surface-light-secondary dark:bg-surface-400 rounded-full" />
            </div>

            {/* Title Block */}
            {title && (
              <div className="flex items-center justify-between mb-4">
                <h3 className={`${Typography.TITLE} text-theme-text`}>
                  {title}
                </h3>
                <button
                  onClick={onClose}
                  className="text-xs font-bold text-theme-text-muted hover:text-theme-text cursor-pointer px-2 py-1"
                >
                  Close
                </button>
              </div>
            )}

            {/* Scrollable sheet body content */}
            <div className="flex-1 overflow-y-auto pr-1 scrollbar-thin">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// ==========================================
// 10. SettingsRow
// ==========================================
interface SettingsRowProps {
  icon: React.ReactNode;
  iconColor: string; // Tailwind background classes e.g. 'bg-gold-500' or 'bg-cathedral-700'
  label: string;
  onPress?: () => void;
  trailing?: React.ReactNode;
  id?: string;
}

export function SettingsRow({
  icon,
  iconColor,
  label,
  onPress,
  trailing,
  id
}: SettingsRowProps) {
  const isInteractive = !!onPress;

  const content = (
    <div
      id={id}
      onClick={onPress}
      className={`w-full h-14 flex items-center justify-between px-3 border-b border-theme-border transition-colors ${
        isInteractive 
          ? 'cursor-pointer hover:bg-surface-light-secondary/40 dark:hover:bg-surface-100/30' 
          : ''
      }`}
    >
      <div className="flex items-center gap-3">
        {/* Left Circular Colored Accent Wrapper */}
        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-semibold ${iconColor}`}>
          {icon}
        </div>
        <span className={`${Typography.BODY} text-theme-text`}>
          {label}
        </span>
      </div>

      {/* Right Trailing Slot */}
      <div className="flex items-center">
        {trailing ? trailing : (
          <ChevronRight className="w-4 h-4 text-theme-text-muted" />
        )}
      </div>
    </div>
  );

  if (isInteractive) {
    return (
      <motion.div
        whileTap={{ scale: 0.99 }}
        className="w-full"
      >
        {content}
      </motion.div>
    );
  }

  return content;
}

// ==========================================
// 11. ScriptureCard
// ==========================================
interface ScriptureCardProps {
  text: string;
  reference: string;
  id?: string;
}

export function ScriptureCard({
  text,
  reference,
  id
}: ScriptureCardProps) {
  return (
    <div
      id={id}
      className="glass-card rounded-card border-l-[3px] border-l-gold-500 p-4.5 flex items-start gap-4.5 shadow-card-light dark:shadow-card-dark"
    >
      {/* Decorative Book/Cross Roundlet */}
      <div className="w-10 h-10 rounded-full bg-gold-500/10 dark:bg-gold-500/10 flex items-center justify-center text-gold-500 flex-shrink-0">
        <BookOpen className="w-5 h-5" />
      </div>

      {/* Scripture Passage */}
      <div className="space-y-1.5 flex-1">
        <p className={`${Typography.BODY} text-theme-text italic leading-relaxed font-normal`}>
          "{text}"
        </p>
        <span className={`${Typography.CAPTION} text-gold-500 font-bold tracking-wide uppercase`}>
          {reference}
        </span>
      </div>
    </div>
  );
}

// ==========================================
// 12. SearchField
// ==========================================
interface SearchFieldProps {
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  onVoice?: () => void;
  onFilter?: () => void;
  id?: string;
}

export function SearchField({
  placeholder = 'Search gathers, teachings, messages...',
  value,
  onChange,
  onVoice,
  onFilter,
  id
}: SearchFieldProps) {
  return (
    <div
      id={id}
      className="relative w-full h-12 flex items-center rounded-pill bg-white dark:bg-surface-100 border border-theme-border focus-within:ring-2 focus-within:ring-gold-500/30 focus-within:border-gold-600 dark:focus-within:border-gold-500 px-4 gap-3 transition-all duration-300 shadow-sm"
    >
      {/* Decorative Gold Ring / Standard Search Icon */}
      <div className="flex-shrink-0 flex items-center justify-center">
        <Search className="w-4 h-4 text-theme-text-muted" />
      </div>

      {/* Core Input Field */}
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 h-full bg-transparent border-none outline-none text-sm text-theme-text placeholder-theme-text-muted font-medium"
      />

      {/* Voice Dictation Slot */}
      {onVoice && (
        <button
          onClick={onVoice}
          className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-light-secondary dark:hover:bg-surface-200 text-theme-text-muted hover:text-gold-500 transition-colors cursor-pointer min-h-[32px]"
          title="Voice search"
        >
          <Mic className="w-4 h-4" />
        </button>
      )}

      {/* Filter Slot */}
      {onFilter && (
        <button
          onClick={onFilter}
          className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center hover:bg-surface-light-secondary dark:hover:bg-surface-200 text-theme-text-muted hover:text-gold-500 transition-colors cursor-pointer min-h-[32px]"
          title="Filter results"
        >
          <SlidersHorizontal className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

// ==========================================
// 11. Avatar — deterministic pastel-gradient initials avatar
// ==========================================
interface AvatarProps {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  ringClassName?: string;
  className?: string;
}

export function Avatar({ name, size = 'md', ringClassName = '', className = '' }: AvatarProps) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  const gradient = AVATAR_GRADIENTS[hashName(name) % AVATAR_GRADIENTS.length];

  const sizeClasses = {
    sm: 'w-8 h-8 text-[10px]',
    md: 'w-10 h-10 text-xs',
    lg: 'w-14 h-14 text-base'
  }[size];

  return (
    <div
      className={`${sizeClasses} rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center font-bold text-white shadow-sm flex-shrink-0 ${ringClassName} ${className}`}
    >
      {initials}
    </div>
  );
}

// ==========================================
// 12. SwipeableRow — drag-x reveal action rail
// ==========================================
interface SwipeableAction {
  icon: React.ReactNode;
  label: string;
  colorClassName: string;
  onPress: () => void;
}

interface SwipeableRowProps {
  children: React.ReactNode;
  actions: SwipeableAction[];
  id?: string;
  /** Fires once the drag gesture actually starts moving — use to cancel a competing long-press timer. */
  onSwipeStart?: () => void;
}

export function SwipeableRow({ children, actions, id, onSwipeStart }: SwipeableRowProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const actionWidth = 72;
  const totalActionWidth = actions.length * actionWidth;

  const handleDragEnd = (_: unknown, info: { offset: { x: number }; velocity: { x: number } }) => {
    if (info.offset.x < -totalActionWidth / 2 || info.velocity.x < -500) {
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  return (
    <div id={id} className="relative overflow-hidden">
      {/* Action rail revealed behind the row */}
      <div
        className="absolute inset-y-0 right-0 flex items-stretch"
        style={{ width: totalActionWidth }}
      >
        {actions.map((action, i) => (
          <motion.button
            key={i}
            whileTap={{ scale: 0.92 }}
            onClick={() => { action.onPress(); setIsOpen(false); }}
            className={`flex-1 flex flex-col items-center justify-center gap-1 text-white text-[10px] font-bold cursor-pointer ${action.colorClassName}`}
          >
            {action.icon}
            <span>{action.label}</span>
          </motion.button>
        ))}
      </div>

      {/* Foreground draggable content */}
      <motion.div
        drag="x"
        dragConstraints={{ left: -totalActionWidth, right: 0 }}
        dragElastic={{ left: 0.15, right: 0 }}
        dragMomentum={false}
        animate={{ x: isOpen ? -totalActionWidth : 0 }}
        transition={{ type: 'spring', stiffness: 420, damping: 38 }}
        onDragStart={onSwipeStart}
        onDragEnd={handleDragEnd}
        className="relative bg-theme-bg"
      >
        {children}
        {isOpen && (
          <div
            className="absolute inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
        )}
      </motion.div>
    </div>
  );
}

// ==========================================
// 13. ProgressRing — animated SVG radial progress meter
// ==========================================
interface ProgressRingProps {
  percent: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  centerLabel?: React.ReactNode;
  caption?: string;
  className?: string;
}

export function ProgressRing({
  percent,
  size = 72,
  strokeWidth,
  color = '#D4A84A',
  trackColor,
  centerLabel,
  caption,
  className = ''
}: ProgressRingProps) {
  const { isDark } = useTheme();
  const sw = strokeWidth ?? size * 0.1;
  const radius = (size - sw) / 2;
  const circumference = radius * 2 * Math.PI;
  const clamped = Math.min(100, Math.max(0, percent));

  const [animatedPercent, setAnimatedPercent] = React.useState(0);
  React.useEffect(() => {
    const frame = requestAnimationFrame(() => setAnimatedPercent(clamped));
    return () => cancelAnimationFrame(frame);
  }, [clamped]);

  const dashOffset = circumference - (animatedPercent / 100) * circumference;
  const resolvedTrack = trackColor ?? (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)');

  return (
    <div className={`relative flex flex-col items-center justify-center flex-shrink-0 ${className}`} style={{ width: size, height: size }}>
      <svg height={size} width={size} className="-rotate-90">
        <circle stroke={resolvedTrack} fill="transparent" strokeWidth={sw} r={radius} cx={size / 2} cy={size / 2} />
        <circle
          stroke={color}
          fill="transparent"
          strokeWidth={sw}
          strokeDasharray={`${circumference} ${circumference}`}
          style={{ strokeDashoffset: dashOffset }}
          strokeLinecap="round"
          r={radius}
          cx={size / 2}
          cy={size / 2}
          className="transition-all duration-[900ms] ease-out"
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center">
        <span className="font-mono font-black text-theme-text leading-none" style={{ fontSize: size * 0.2 }}>
          {centerLabel ?? `${Math.round(clamped)}%`}
        </span>
        {caption && (
          <span className="text-[8px] font-bold uppercase tracking-wider text-theme-text-secondary mt-0.5">
            {caption}
          </span>
        )}
      </div>
    </div>
  );
}
