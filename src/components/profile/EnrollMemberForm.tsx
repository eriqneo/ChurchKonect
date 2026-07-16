import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { motion } from 'motion/react';
import { db } from '../../lib/db/churchConnectDB';
import { usePocketBaseMembers } from '../../lib/db/pocketbaseHooks';
import { useCurrentUser } from '../../lib/db/hooks';
import { useToast } from '../shared/toast/useToast';
import { GlassCard, AccentBadge } from '../shared';
import { User, Phone, Mail, Calendar, MapPin, Check, Eye, HelpCircle, ShieldAlert, Sparkles, Copy } from 'lucide-react';

const DEPARTMENTS_LIST = [
  'Intercessory',
  'ICT',
  'Protocol',
  'Media',
  'Ushering',
  'Choir',
  'Worship Leader',
  'Youth Crew',
  'Children Ministry'
];

interface EnrollMemberFormProps {
  onClose: () => void;
  onSuccess?: () => void;
}

export function EnrollMemberForm({ onClose, onSuccess }: EnrollMemberFormProps) {
  const { enrollMember } = usePocketBaseMembers();
  const { role: currentUserRole } = useCurrentUser();
  const toast = useToast();

  // Load Cells & Sections from Database
  const cellGroups = useLiveQuery(() => db.cellGroups.toArray()) || [];
  const sections = useLiveQuery(() => db.sections.toArray()) || [];

  // Form Field States
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'member' | 'worker' | 'admin'>('member');
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [cellGroupId, setCellGroupId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [sectionName, setSectionName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [address, setAddress] = useState('');

  // Enroll Credentials Screen
  const [enrolledResult, setEnrolledResult] = useState<any | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-fill Section based on selected Cell Group
  useEffect(() => {
    if (cellGroupId) {
      const selectedCell = cellGroups.find(c => c.localId === cellGroupId);
      if (selectedCell) {
        setSectionId(selectedCell.sectionId);
        const associatedSection = sections.find(s => s.localId === selectedCell.sectionId);
        if (associatedSection) {
          setSectionName(associatedSection.name);
        } else {
          setSectionName('');
        }
      }
    } else {
      setSectionId('');
      setSectionName('');
    }
  }, [cellGroupId, cellGroups, sections]);

  const handleToggleDepartment = (dept: string) => {
    if (selectedDepartments.includes(dept)) {
      setSelectedDepartments(selectedDepartments.filter(d => d !== dept));
    } else {
      setSelectedDepartments([...selectedDepartments, dept]);
    }
  };

  const handleEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !phone.trim() || !email.trim()) {
      toast.error('Please fill in all required fields.');
      return;
    }

    if (role === 'admin' && currentUserRole?.id !== 'lead_pastor') {
      toast.error('Only the Lead Pastor is authorized to assign Admin roles.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await enrollMember({
        fullName,
        phone,
        email,
        role,
        departments: role === 'worker' ? selectedDepartments : [],
        cellGroupId: cellGroupId || undefined,
        sectionId: sectionId || undefined,
        dateOfBirth: dateOfBirth || undefined,
        address: address || undefined
      });

      if (result) {
        toast.success(`Success! Enrolled ${fullName}`);
        setEnrolledResult(result);
        if (onSuccess) onSuccess();
      }
    } catch (err) {
      console.error(err);
      toast.error('Enrollment failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyCredentials = () => {
    if (!enrolledResult) return;
    const textToCopy = `ChurchConnect Enrollment
Name: ${enrolledResult.fullName}
Member ID: ${enrolledResult.qrCode}
Login Email: ${enrolledResult.email}
Temp Password: ${enrolledResult.passwordSimulated}
Role: ${enrolledResult.role.toUpperCase()}`;
    
    navigator.clipboard.writeText(textToCopy);
    toast.success('Credentials copied to clipboard!');
  };

  // Render credentials card for admin to copy
  if (enrolledResult) {
    return (
      <div className="p-4 space-y-6 text-left text-text-primary">
        <div className="flex flex-col items-center justify-center text-center space-y-2 py-4">
          <div className="w-14 h-14 rounded-full bg-gold-500/10 border border-gold-500/30 flex items-center justify-center text-gold-500">
            <Sparkles className="w-7 h-7" />
          </div>
          <h3 className="font-extrabold text-lg text-gold-400">Saint Enrolled Successfully</h3>
          <p className="text-xs text-text-muted max-w-sm">
            Account created in PocketBase Auth collection. Inform the member manually of their credentials.
          </p>
        </div>

        <GlassCard className="p-4 space-y-3 border border-gold-500/20 bg-gold-500/[0.02]">
          <div className="flex justify-between items-center border-b border-white/5 pb-2">
            <span className="text-[10px] font-bold text-gold-400 uppercase tracking-wider">Credentials Slip</span>
            <button
              onClick={handleCopyCredentials}
              className="p-1 px-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-gold-400 flex items-center gap-1.5 text-[10px] font-bold cursor-pointer transition-colors"
            >
              <Copy className="w-3 h-3" /> Copy
            </button>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-text-muted font-medium">Full Name</span>
              <span className="text-text-primary font-bold">{enrolledResult.fullName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted font-medium">Member ID / Pass</span>
              <span className="text-gold-400 font-mono font-bold">{enrolledResult.qrCode}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted font-medium">Auth Email</span>
              <span className="text-text-primary font-medium">{enrolledResult.email}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-text-muted font-medium">Temporary Password</span>
              <span className="bg-black/40 px-2 py-0.5 rounded text-white font-mono font-bold border border-white/5">{enrolledResult.passwordSimulated}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted font-medium">Assigned Role</span>
              <span className="text-text-primary uppercase font-bold">{enrolledResult.role}</span>
            </div>
          </div>
        </GlassCard>

        <div className="bg-white/[0.02] border border-white/5 p-3.5 rounded-xl text-xs space-y-1 text-text-secondary">
          <p className="font-bold text-text-primary flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-amber-500" /> Administrative Policy
          </p>
          <p className="leading-relaxed text-[11px]">
            Password generated locally. PocketBase push services are muted; you must transmit these credentials securely (WhatsApp, SMS, or Print) to the member.
          </p>
        </div>

        <button
          onClick={onClose}
          className="w-full py-3 rounded-pill bg-gold-500 hover:bg-gold-600 text-black font-extrabold text-xs uppercase tracking-wider transition-colors shadow-glow-gold cursor-pointer text-center block"
        >
          Return to Registry
        </button>
      </div>
    );
  }

  const isPastor = currentUserRole?.id === 'lead_pastor';

  return (
    <form onSubmit={handleEnroll} className="space-y-4 text-left p-4 pb-8 max-h-[80vh] overflow-y-auto">
      <p className="text-xs text-text-secondary font-medium leading-relaxed">
        Enroll a new saint into the central registry. This generates a secure fellowship pass ID and spins up an authenticated account.
      </p>

      {/* REQUIRED FIELD: Full Name */}
      <div className="space-y-1">
        <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted flex items-center gap-1">
          Full Name <span className="text-gold-500">*</span>
        </label>
        <div className="relative">
          <input
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="e.g. Brother Barnabas"
            className="w-full p-3 pl-10 rounded-card bg-surface-200 dark:bg-surface-200 light:bg-surface-light-secondary text-sm border border-transparent focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500 text-text-primary outline-none font-bold"
          />
          <User className="absolute left-3 top-3.5 w-4.5 h-4.5 text-text-muted" />
        </div>
      </div>

      {/* REQUIRED FIELD: Phone */}
      <div className="space-y-1">
        <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted flex items-center gap-1">
          Phone Number <span className="text-gold-500">*</span>
        </label>
        <div className="relative">
          <input
            type="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+1 (555) 019-3281"
            className="w-full p-3 pl-10 rounded-card bg-surface-200 dark:bg-surface-200 light:bg-surface-light-secondary text-sm border border-transparent focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500 text-text-primary outline-none font-bold"
          />
          <Phone className="absolute left-3 top-3.5 w-4.5 h-4.5 text-text-muted" />
        </div>
      </div>

      {/* REQUIRED FIELD: Email */}
      <div className="space-y-1">
        <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted flex items-center gap-1">
          Email Address <span className="text-gold-500">*</span>
        </label>
        <div className="relative">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="barnabas@grace.com"
            className="w-full p-3 pl-10 rounded-card bg-surface-200 dark:bg-surface-200 light:bg-surface-light-secondary text-sm border border-transparent focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500 text-text-primary outline-none"
          />
          <Mail className="absolute left-3 top-3.5 w-4.5 h-4.5 text-text-muted" />
        </div>
      </div>

      {/* REQUIRED FIELD: Role */}
      <div className="space-y-1">
        <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
          Registry Role <span className="text-gold-500">*</span>
        </label>
        <div className="grid grid-cols-3 gap-2">
          {['member', 'worker', 'admin'].map((r) => {
            const isSelected = role === r;
            const isDisabled = r === 'admin' && !isPastor;

            return (
              <button
                key={r}
                type="button"
                disabled={isDisabled}
                onClick={() => setRole(r as any)}
                className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer relative ${
                  isDisabled ? 'opacity-40 cursor-not-allowed border-white/5 bg-transparent text-text-muted' :
                  isSelected 
                    ? 'bg-gold-500 text-black border-gold-500 font-bold shadow-glow-gold' 
                    : 'bg-white/[0.01] border-white/5 hover:bg-white/5 text-text-secondary font-semibold'
                }`}
              >
                <span className="text-xs uppercase tracking-wider">{r}</span>
                {isDisabled && (
                  <span className="absolute -top-1.5 -right-1 text-[8px] bg-red-600 text-white rounded p-0.5 font-bold scale-75">
                    Pastor Only
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* WORKER SPECIFIC: Department Selection */}
      {role === 'worker' && (
        <div className="space-y-2 pt-1">
          <label className="text-[10px] font-bold uppercase tracking-widest text-gold-400">
            Select Departments <span className="text-gold-500">*</span>
          </label>
          <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto p-2 border border-white/5 bg-white/[0.01] rounded-xl">
            {DEPARTMENTS_LIST.map((dept) => {
              const isChecked = selectedDepartments.includes(dept);
              return (
                <button
                  key={dept}
                  type="button"
                  onClick={() => handleToggleDepartment(dept)}
                  className={`flex items-center gap-2 p-2 rounded-lg text-left text-xs font-semibold cursor-pointer transition-colors ${
                    isChecked 
                      ? 'bg-gold-500/15 text-gold-400 border border-gold-500/30' 
                      : 'bg-transparent border border-white/5 hover:bg-white/5 text-text-secondary'
                  }`}
                >
                  <div className={`w-3.5 h-3.5 rounded flex items-center justify-center border ${
                    isChecked ? 'border-gold-500 bg-gold-500 text-black' : 'border-white/20'
                  }`}>
                    {isChecked && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                  </div>
                  <span className="truncate">{dept}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* OPTIONAL FIELDS SECTIONS */}
      <div className="border-t border-white/5 pt-3 mt-4 space-y-3">
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
          Church Metadata & Personal (Optional)
        </h4>

        {/* Cell Group Dropdown */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
            Assign Cell Group
          </label>
          <select
            value={cellGroupId}
            onChange={(e) => setCellGroupId(e.target.value)}
            className="w-full p-3 rounded-card bg-surface-200 dark:bg-surface-200 light:bg-surface-light-secondary text-sm border border-transparent focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500 text-text-primary outline-none font-bold"
          >
            <option value="">-- Not Assigned --</option>
            {cellGroups.map((cg) => (
              <option key={cg.localId} value={cg.localId}>
                {cg.name}
              </option>
            ))}
          </select>
        </div>

        {/* Section/District Auto-Fill */}
        {sectionName && (
          <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between">
            <div className="flex flex-col text-xs">
              <span className="text-[10px] font-semibold text-text-muted uppercase">District / Section (Auto-Fills)</span>
              <span className="text-gold-400 font-bold mt-0.5">{sectionName}</span>
            </div>
            <AccentBadge label="Auto" variant="sage" size="sm" />
          </div>
        )}

        {/* Date of Birth Picker */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted flex items-center gap-1">
            Date of Birth
          </label>
          <div className="relative">
            <input
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              className="w-full p-3 pl-10 rounded-card bg-surface-200 dark:bg-surface-200 light:bg-surface-light-secondary text-sm border border-transparent focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500 text-text-primary outline-none"
            />
            <Calendar className="absolute left-3 top-3.5 w-4.5 h-4.5 text-text-muted" />
          </div>
        </div>

        {/* Address Input */}
        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
            Residential Address
          </label>
          <div className="relative">
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. 14 Grace Avenue, District North"
              className="w-full p-3 pl-10 rounded-card bg-surface-200 dark:bg-surface-200 light:bg-surface-light-secondary text-sm border border-transparent focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500 text-text-primary outline-none"
            />
            <MapPin className="absolute left-3 top-3.5 w-4.5 h-4.5 text-text-muted" />
          </div>
        </div>
      </div>

      {/* SUBMIT BUTTON */}
      <button
        type="submit"
        disabled={isSubmitting}
        className={`w-full mt-4 py-3.5 rounded-pill bg-gold-500 text-black font-extrabold text-xs uppercase tracking-wider transition-colors shadow-glow-gold cursor-pointer text-center flex items-center justify-center gap-2 ${
          isSubmitting ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gold-600'
        }`}
      >
        {isSubmitting ? 'Enrolling Saint...' : 'Enroll Member'}
      </button>
    </form>
  );
}
