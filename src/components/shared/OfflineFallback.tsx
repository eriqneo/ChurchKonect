import React from 'react';
import { motion } from 'motion/react';
import { CloudOff } from 'lucide-react';
import * as Typography from '../../lib/theme/typography';
import { AccentBadge } from './index';

interface OfflineFallbackProps {
  onGoToDashboard: () => void;
}

export function OfflineFallback({ onGoToDashboard }: OfflineFallbackProps) {
  return (
    <div className="flex flex-col items-center justify-center p-6 text-center w-full min-h-[80vh] flex-1">
      {/* Cloud-off icon */}
      <div className="w-12 h-12 flex items-center justify-center text-text-muted dark:text-text-muted light:text-text-light-muted animate-float-gentle mb-4">
        <CloudOff className="w-12 h-12 stroke-[1.5]" />
      </div>

      {/* Title */}
      <h3 className={`${Typography.SUBTITLE} text-text-primary dark:text-text-primary light:text-text-light-primary`}>
        This feature needs a connection
      </h3>

      {/* Description */}
      <p className={`${Typography.BODY} text-text-muted dark:text-text-muted light:text-text-light-muted mt-2 max-w-[280px]`}>
        Your local data is still available, but this action requires server sync.
      </p>

      {/* Go to Dashboard button */}
      <motion.button
        whileTap={{ scale: 0.95, opacity: 0.9 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        onClick={onGoToDashboard}
        className="mt-6 cursor-pointer bg-transparent border-0 p-0 focus:outline-none"
      >
        <AccentBadge variant="outline" label="Go to Dashboard" size="md" />
      </motion.button>
    </div>
  );
}
