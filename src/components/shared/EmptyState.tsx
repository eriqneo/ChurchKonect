import React from 'react';
import { motion } from 'motion/react';
import * as Typography from '../../lib/theme/typography';
import { AccentBadge } from './index';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: { label: string; onPress: () => void };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-6 text-center h-full min-h-[350px] -translate-y-[8%]">
      {/* Icon with float-gentle animation */}
      <div className="w-14 h-14 flex items-center justify-center text-text-muted dark:text-text-muted light:text-text-light-muted animate-float-gentle mb-4">
        {React.isValidElement(icon) ? (
          React.cloneElement(icon as React.ReactElement<any>, { className: 'w-14 h-14 stroke-[1.5]' })
        ) : (
          icon
        )}
      </div>

      {/* Title */}
      <h3 className={`${Typography.SUBTITLE} text-text-primary dark:text-text-primary light:text-text-light-primary`}>
        {title}
      </h3>

      {/* Description */}
      <p className={`${Typography.BODY} text-text-muted dark:text-text-muted light:text-text-light-muted max-w-[280px] mt-1.5 line-clamp-2`}>
        {description}
      </p>

      {/* Action Button */}
      {action && (
        <motion.button
          whileTap={{ scale: 0.95, opacity: 0.9 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          onClick={action.onPress}
          className="mt-5 cursor-pointer bg-transparent border-0 p-0 focus:outline-none"
        >
          <AccentBadge variant="outline" label={action.label} size="md" />
        </motion.button>
      )}
    </div>
  );
}
