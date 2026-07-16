import React, { createContext, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, Info, AlertTriangle, AlertCircle, X } from 'lucide-react';

export type ToastType = 'success' | 'info' | 'warning' | 'error';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
  action?: () => void;
}

interface ToastContextType {
  show: (message: string, type?: ToastType, duration?: number, action?: () => void) => void;
  success: (message: string, duration?: number, action?: () => void) => void;
  info: (message: string, duration?: number, action?: () => void) => void;
  warning: (message: string, duration?: number, action?: () => void) => void;
  error: (message: string, duration?: number, action?: () => void) => void;
  dismiss: (id: string) => void;
}

export const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((message: string, type: ToastType = 'info', duration?: number, action?: () => void) => {
    const id = Math.random().toString(36).substring(2, 9);
    
    // Auto-dismiss duration: 4s default, 6s for error
    const finalDuration = duration ?? (type === 'error' ? 6000 : 4000);
    
    const newToast: Toast = { id, message, type, duration: finalDuration, action };
    setToasts((prev) => {
      // Stack: max 2 visible, newest on top
      const next = [newToast, ...prev];
      if (next.length > 2) {
        return next.slice(0, 2);
      }
      return next;
    });

    setTimeout(() => {
      dismiss(id);
    }, finalDuration);
  }, [dismiss]);

  const success = useCallback((msg: string, dur?: number, act?: () => void) => show(msg, 'success', dur, act), [show]);
  const info = useCallback((msg: string, dur?: number, act?: () => void) => show(msg, 'info', dur, act), [show]);
  const warning = useCallback((msg: string, dur?: number, act?: () => void) => show(msg, 'warning', dur, act), [show]);
  const error = useCallback((msg: string, dur?: number, act?: () => void) => show(msg, 'error', dur, act), [show]);

  return (
    <ToastContext.Provider value={{ show, success, info, warning, error, dismiss }}>
      {children}
      {/* Toast Render Area - 12px below header bar (header is 56px (top-14), so top-[68px] is exactly 12px below) */}
      <div className="fixed top-[68px] left-1/2 -translate-x-1/2 z-[9999] w-11/12 max-w-sm flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => {
            let bgClass = '';
            let textClass = '';
            let icon = null;

            switch (toast.type) {
              case 'success':
                bgClass = 'bg-sage-500'; // sage bg
                textClass = 'text-white';
                icon = <Check className="w-4.5 h-4.5 stroke-[2.5]" />;
                break;
              case 'info':
                bgClass = 'bg-surface-200 dark:bg-surface-200 light:bg-surface-light-secondary border border-white/5 dark:border-white/5 light:border-black/5 backdrop-blur-md';
                textClass = 'text-text-primary dark:text-text-primary light:text-text-light-primary';
                icon = <Info className="w-4.5 h-4.5 stroke-[2.5]" />;
                break;
              case 'warning':
                bgClass = 'bg-gold-500';
                textClass = 'text-cathedral-950 font-black';
                icon = <AlertTriangle className="w-4.5 h-4.5 stroke-[2.5]" />;
                break;
              case 'error':
                bgClass = 'bg-cathedral-500';
                textClass = 'text-white';
                icon = <AlertCircle className="w-4.5 h-4.5 stroke-[2.5]" />;
                break;
            }

            return (
              <motion.div
                key={toast.id}
                initial={{ opacity: 0, y: -24, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -24, scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 450, damping: 30 }}
                drag="y"
                dragDirectionLock
                dragConstraints={{ top: -100, bottom: 0 }}
                onDragEnd={(event, info) => {
                  // Swipe up to dismiss
                  if (info.offset.y < -20) {
                    dismiss(toast.id);
                  }
                }}
                onClick={() => {
                  if (toast.action) {
                    toast.action();
                  }
                }}
                className={`pointer-events-auto flex items-center justify-between gap-3 px-4 py-3 rounded-pill shadow-float min-h-[48px] w-full cursor-pointer touch-pan-y ${bgClass} ${textClass}`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex-shrink-0">
                    {icon}
                  </div>
                  <span className="text-xs font-bold tracking-wide">
                    {toast.message}
                  </span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    dismiss(toast.id);
                  }}
                  className="flex-shrink-0 opacity-70 hover:opacity-100 cursor-pointer p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
