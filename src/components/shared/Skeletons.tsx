import React from 'react';

// ==========================================
// 1. SkeletonCard Component
// ==========================================
interface SkeletonCardProps {
  className?: string;
}

export function SkeletonCard({ className = '' }: SkeletonCardProps) {
  return (
    <div 
      className={`rounded-card p-5 glass-card border border-white/5 dark:border-white/5 light:border-black/5 flex flex-col gap-4 shadow-card-dark ${className}`}
    >
      <div className="w-1/4 h-3.5 rounded shimmer-base" />
      <div className="space-y-2">
        <div className="w-full h-4 rounded shimmer-base" />
        <div className="w-5/6 h-4 rounded shimmer-base" />
      </div>
      <div className="w-2/3 h-3 rounded shimmer-base mt-2" />
    </div>
  );
}

// ==========================================
// 2. SkeletonRow Component
// ==========================================
interface SkeletonRowProps {
  className?: string;
  showAvatar?: boolean;
}

export function SkeletonRow({ className = '', showAvatar = true }: SkeletonRowProps) {
  return (
    <div 
      className={`w-full flex items-center justify-between p-3 border-b border-white/[0.04] dark:border-white/[0.04] light:border-black/[0.04] min-h-[72px] ${className}`}
    >
      <div className="flex items-center gap-3.5 flex-1 pr-2">
        {showAvatar && (
          <div className="w-14 h-14 rounded-lg shimmer-base flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="w-2/3 h-4 rounded shimmer-base" />
          <div className="w-1/2 h-3 rounded shimmer-base" />
        </div>
      </div>
      <div className="w-8 h-8 rounded-full shimmer-base flex-shrink-0" />
    </div>
  );
}

// ==========================================
// 3. SkeletonStat Component
// ==========================================
interface SkeletonStatProps {
  className?: string;
}

export function SkeletonStat({ className = '' }: SkeletonStatProps) {
  return (
    <div 
      className={`rounded-[20px] p-4 flex flex-col justify-between min-h-[115px] bg-white/[0.02] border border-white/[0.04] dark:border-white/[0.04] light:bg-black/[0.01] light:border-black/[0.04] shadow-card-dark w-full ${className}`}
    >
      <div className="flex items-center justify-between w-full">
        <div className="w-8 h-8 rounded-full shimmer-base" />
      </div>
      <div className="mt-4 space-y-2">
        <div className="w-3/4 h-6 rounded shimmer-base" />
        <div className="w-1/2 h-3 rounded shimmer-base" />
      </div>
    </div>
  );
}

// ==========================================
// 4. SkeletonAvatar Component
// ==========================================
interface SkeletonAvatarProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function SkeletonAvatar({ size = 'md', className = '' }: SkeletonAvatarProps) {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16'
  }[size];

  return (
    <div className={`rounded-full shimmer-base ${sizeClasses} ${className}`} />
  );
}

// ==========================================
// 5. SkeletonText Component
// ==========================================
interface SkeletonTextProps {
  lines?: number;
  className?: string;
}

export function SkeletonText({ lines = 3, className = '' }: SkeletonTextProps) {
  const widths = ['w-full', 'w-11/12', 'w-4/5', 'w-5/6', 'w-2/3', 'w-3/4'];
  return (
    <div className={`space-y-2.5 ${className}`}>
      {Array.from({ length: lines }).map((_, idx) => {
        const widthClass = widths[idx % widths.length];
        return (
          <div
            key={idx}
            className={`${widthClass} h-3 rounded shimmer-base`}
          />
        );
      })}
    </div>
  );
}
