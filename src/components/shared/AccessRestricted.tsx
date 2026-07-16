import React from 'react';
import { motion } from 'motion/react';
import { ShieldAlert, Lock, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../lib/db/PocketBaseProvider';
import { useToast } from './toast/useToast';
import { GlassCard } from './index';

interface AccessRestrictedProps {
  requiredRole: string;
  onGoBack?: () => void;
}

export function AccessRestricted({ requiredRole, onGoBack }: AccessRestrictedProps) {
  const { user } = useAuth();
  const toast = useToast();

  const handleReportError = () => {
    toast.info('Access request logged. Clergy section notified.');
  };

  const getFriendlyRoleName = (roleId: string) => {
    switch (roleId) {
      case 'lead_pastor':
        return 'Lead Pastor';
      case 'administrator':
        return 'Church Administrator';
      case 'cell_leader':
        return 'Cell Group Leader / Worker';
      case 'member':
        return 'Church Saint';
      default:
        return roleId;
    }
  };

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center select-none">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className="max-w-sm w-full space-y-6"
      >
        <GlassCard className="p-6 border border-cathedral-500/20 bg-cathedral-500/[0.02] flex flex-col items-center space-y-4">
          
          {/* Animated lock icon with subtle golden light glow */}
          <motion.div
            initial={{ rotate: -10 }}
            animate={{ rotate: [0, -5, 5, -5, 5, 0] }}
            transition={{ repeat: Infinity, repeatDelay: 4, duration: 0.6 }}
            className="w-16 h-16 bg-gold-500/10 border border-gold-500/30 rounded-full flex items-center justify-center text-gold-500 relative shadow-glow-gold"
          >
            <Lock className="w-7 h-7 stroke-[2]" />
            <span className="absolute -bottom-1 -right-1 bg-cathedral-600 border border-theme-border/20 p-1 rounded-full text-white">
              <ShieldAlert className="w-3.5 h-3.5" />
            </span>
          </motion.div>

          <div className="space-y-1.5">
            <h3 className="text-sm font-black text-theme-text uppercase tracking-widest">
              Access Restricted
            </h3>
            <p className="text-[11px] text-text-muted leading-relaxed">
              You need <span className="font-bold text-gold-500">{getFriendlyRoleName(requiredRole)}</span> authority to coordinates actions in this module.
            </p>
          </div>

          <div className="text-[10px] bg-black/15 dark:bg-black/15 light:bg-slate-100 rounded-lg p-2.5 w-full font-mono text-text-secondary dark:text-text-secondary light:text-slate-600 text-left space-y-1">
            <div>• Current Identity: <span className="text-theme-text font-bold">{user?.name}</span></div>
            <div>• Current Role: <span className="text-gold-500 font-bold uppercase">{user?.role}</span></div>
          </div>

          {/* Go Back / Dashboard Button */}
          {onGoBack && (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={onGoBack}
              className="w-full py-2.5 bg-gold-500 hover:bg-gold-400 text-black text-[10px] font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
            >
              <ArrowLeft className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Go to Dashboard</span>
            </motion.button>
          )}

          {/* Report this text link */}
          <button
            onClick={handleReportError}
            className="text-[10px] text-text-muted hover:text-gold-500 underline cursor-pointer bg-transparent border-0 font-medium"
          >
            Report error with clearance
          </button>

        </GlassCard>
      </motion.div>
    </div>
  );
}
