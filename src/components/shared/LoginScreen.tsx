import React, { useState } from 'react';
import { motion } from 'motion/react';
import { useAuth } from '../../lib/db/PocketBaseProvider';
import { useTheme } from '../../lib/theme/ThemeProvider';
import { 
  KeyRound, 
  Mail, 
  Sparkles, 
  Heart, 
  ArrowRight, 
  Eye, 
  EyeOff, 
  ShieldAlert,
  HelpCircle,
  Smartphone
} from 'lucide-react';
import { useToast } from './toast/useToast';
import { GlassCard } from './index';

export function LoginScreen() {
  const { login } = useAuth();
  const { isDark } = useTheme();
  const toast = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'email' | 'phone'>('email');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error('Please enter your email or phone number');
      return;
    }
    
    setIsLoading(true);
    try {
      await login(email, password);
      toast.success('Welcome back to ChurchConnect 🕊');
    } catch (err) {
      toast.error('Authentication failed. Check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickLogin = async (roleEmail: string, roleName: string) => {
    setIsLoading(true);
    try {
      await login(roleEmail, 'password');
      toast.success(`Logged in as ${roleName} ⚡`);
    } catch (err) {
      toast.error('Failed to log in');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-[100dvh] bg-[#0d0f12] dark:bg-[#0d0f12] light:bg-slate-50 flex flex-col items-center justify-center p-5 select-none relative overflow-hidden transition-colors duration-300">
      
      {/* Dynamic Background Light Accents */}
      <div className="absolute top-[-20%] left-[-20%] w-[80%] h-[80%] bg-gold-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-20%] w-[80%] h-[80%] bg-cathedral-500/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-md w-full z-10 space-y-6">
        
        {/* Logo and Header Block */}
        <div className="text-center space-y-2">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15 }}
            className="inline-flex items-center justify-center w-16 h-16 mb-2 relative"
          >
            <div className="absolute inset-1 rounded-2xl bg-gold-500/20 blur-lg animate-pulse" />
            <img
              src="/churchconnect-logo.svg"
              alt="ChurchConnect"
              className="relative w-full h-full drop-shadow-xl"
            />
          </motion.div>

          <motion.h1
            initial={{ y: 15, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-2xl font-black tracking-tight text-white dark:text-white light:text-slate-900 uppercase font-sans flex items-center justify-center gap-1.5"
          >
            Church<span className="text-gold-500">Connect</span>
          </motion.h1>

          <motion.p
            initial={{ y: 15, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.15 }}
            className="text-xs font-black text-gold-500/80 dark:text-gold-500/80 light:text-gold-600/90 uppercase tracking-widest"
          >
            PWA Sanctuary Management
          </motion.p>
          
          <motion.p
            initial={{ y: 15, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-[11px] text-text-muted dark:text-text-muted light:text-slate-500"
          >
            Secure, offline-first member & fellowship coordination engine
          </motion.p>
        </div>

        {/* Credentials Form */}
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 220, damping: 20, delay: 0.25 }}
        >
          <GlassCard className="p-5 border border-white/5 dark:border-white/5 light:border-slate-200/80 shadow-2xl bg-[#12161a]/80 dark:bg-[#12161a]/80 light:bg-white/90 backdrop-blur-md space-y-4">
            
            {/* Login Tab selector */}
            <div className="grid grid-cols-2 p-1 bg-black/20 dark:bg-black/20 light:bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => { setActiveTab('email'); setEmail(''); }}
                className={`py-1.5 text-[10px] font-black uppercase tracking-wider rounded-md transition-all cursor-pointer ${
                  activeTab === 'email'
                    ? 'bg-gold-500 text-black shadow-sm'
                    : 'text-text-secondary hover:text-white dark:hover:text-white light:hover:text-slate-900'
                }`}
              >
                Email Portal
              </button>
              <button
                type="button"
                onClick={() => { setActiveTab('phone'); setEmail(''); }}
                className={`py-1.5 text-[10px] font-black uppercase tracking-wider rounded-md transition-all cursor-pointer ${
                  activeTab === 'phone'
                    ? 'bg-gold-500 text-black shadow-sm'
                    : 'text-text-secondary hover:text-white dark:hover:text-white light:hover:text-slate-900'
                }`}
              >
                Phone Pass
              </button>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              
              {/* Login Input */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-text-secondary dark:text-text-secondary light:text-slate-600 block">
                  {activeTab === 'email' ? 'Clergy / Member Email' : 'Mobile Phone Number'}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-text-muted">
                    {activeTab === 'email' ? (
                      <Mail className="w-4 h-4" />
                    ) : (
                      <Smartphone className="w-4 h-4" />
                    )}
                  </div>
                  <input
                    type={activeTab === 'email' ? 'email' : 'tel'}
                    required
                    placeholder={activeTab === 'email' ? 'yourname@churchconnect.com' : '+1 (555) 000-0000'}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-black/20 dark:bg-black/20 light:bg-slate-100 border border-white/5 dark:border-white/5 light:border-slate-200 rounded-xl text-xs font-semibold text-white dark:text-white light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500 transition-colors placeholder-text-muted"
                  />
                </div>
              </div>

              {/* Password Input */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black uppercase tracking-widest text-text-secondary dark:text-text-secondary light:text-slate-600">
                    Access Pin / Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      toast.info('Credential Recovery: Please contact your administrator Sarah Jenkins to retrieve or reset passwords.');
                    }}
                    className="text-[10px] font-black text-gold-500/80 dark:text-gold-500/80 light:text-gold-600 hover:underline cursor-pointer"
                  >
                    Forgot?
                  </button>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-text-muted">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-10 py-3 bg-black/20 dark:bg-black/20 light:bg-slate-100 border border-white/5 dark:border-white/5 light:border-slate-200 rounded-xl text-xs font-semibold text-white dark:text-white light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500 transition-colors placeholder-text-muted"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-text-muted hover:text-white cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 bg-gold-500 hover:bg-gold-400 text-black font-black uppercase tracking-widest text-xs rounded-xl shadow-glow-gold hover:shadow-glow-gold-active transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <div className="w-4 h-4 rounded-full border-2 border-black border-t-transparent animate-spin" />
                ) : (
                  <>
                    <span>Enter Sanctuary</span>
                    <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                  </>
                )}
              </button>
            </form>
          </GlassCard>
        </motion.div>

        {/* QUICK SIMULATOR LOGINS FOR CONVENIENT USER EVALUATION */}
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 220, damping: 20, delay: 0.35 }}
          className="space-y-2.5"
        >
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] font-black uppercase tracking-wider text-text-secondary dark:text-text-secondary light:text-slate-600 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-gold-500" />
              <span>Developer Test Logins</span>
            </span>
            <span className="text-[9px] text-text-muted font-bold font-mono">
              Auto-fill bypass
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {[
              {
                role: 'LEAD PASTOR',
                name: 'Pastor David',
                email: 'pastor.david@churchconnect.com',
                color: 'border-l-gold-500',
                desc: 'Full Global Access'
              },
              {
                role: 'ADMINISTRATOR',
                name: 'Sarah Jenkins',
                email: 'sarah.admin@churchconnect.com',
                color: 'border-l-blue-500',
                desc: 'Enrollment & CMS'
              },
              {
                role: 'CELL LEADER',
                name: 'Michael Sterns',
                email: 'michael.hope@churchconnect.com',
                color: 'border-l-sage-500',
                desc: 'Attendance & Reports'
              },
              {
                role: 'CHURCH SAINT',
                name: 'Clara Oswald',
                email: 'clara.saints@churchconnect.com',
                color: 'border-l-cathedral-500',
                desc: 'Announcements & Pass'
              }
            ].map((item) => (
              <button
                key={item.role}
                onClick={() => handleQuickLogin(item.email, item.name)}
                className={`p-2.5 rounded-xl border border-white/5 dark:border-white/5 light:border-slate-200 text-left bg-surface-200/40 dark:bg-surface-200/40 light:bg-white hover:bg-white/10 dark:hover:bg-white/10 light:hover:bg-slate-50 transition-all cursor-pointer flex flex-col justify-between border-l-3 ${item.color}`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-[8px] font-black text-gold-500 dark:text-gold-500 light:text-gold-600 tracking-wider">
                    {item.role}
                  </span>
                  <span className="text-[7px] text-text-muted font-mono whitespace-nowrap">
                    {item.desc}
                  </span>
                </div>
                <span className="text-[10px] font-black text-white dark:text-white light:text-slate-900 mt-1 truncate">
                  {item.name}
                </span>
                <span className="text-[8px] text-text-muted truncate">
                  {item.email}
                </span>
              </button>
            ))}
          </div>
        </motion.div>

        {/* Bottom Security / Copyright Banner */}
        <div className="text-center">
          <p className="text-[9px] text-text-muted dark:text-text-muted light:text-slate-500">
            🔒 Fully encrypted end-to-end Local indexed ledger.
          </p>
          <p className="text-[8px] text-text-muted/70 mt-1">
            ChurchConnect PWA v2.0 • Secured under Discipleship Protocol.
          </p>
        </div>

      </div>
    </div>
  );
}
