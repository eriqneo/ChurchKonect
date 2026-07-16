import { useEffect, useState } from 'react';
import { Calendar, Check, Copy, Mail, MapPin, Phone, ShieldCheck, Sparkles, User } from 'lucide-react';
import { AccentBadge, GlassCard } from '../shared';
import { useAuth } from '../../lib/db/PocketBaseProvider';
import {
  type PocketBaseMember,
  useMemberReferences,
  usePocketBaseMembers
} from '../../lib/db/pocketbaseHooks';
import { useToast } from '../shared/toast/useToast';

type RegistryRole = 'member' | 'cell_leader' | 'department_head' | 'administrator';

const ROLE_OPTIONS: Array<{ id: RegistryRole; label: string }> = [
  { id: 'member', label: 'Member' },
  { id: 'cell_leader', label: 'Cell Leader' },
  { id: 'department_head', label: 'Department Head' },
  { id: 'administrator', label: 'Administrator' }
];

interface EnrollMemberFormProps {
  onClose: () => void;
  onSuccess?: () => void;
}

function friendlyError(error: unknown): string {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { message?: string; data?: Record<string, { message?: string }> } }).response;
    const fieldMessage = response?.data && Object.values(response.data).find((item) => item?.message)?.message;
    return fieldMessage || response?.message || 'The member could not be enrolled.';
  }
  return error instanceof Error ? error.message : 'The member could not be enrolled.';
}

export function EnrollMemberForm({ onClose, onSuccess }: EnrollMemberFormProps) {
  const { user } = useAuth();
  const { enrollMember } = usePocketBaseMembers();
  const { departments, cellGroups, isLoading: referencesLoading } = useMemberReferences();
  const toast = useToast();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<RegistryRole>('member');
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [cellGroupId, setCellGroupId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [sectionName, setSectionName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [address, setAddress] = useState('');
  const [enrolledResult, setEnrolledResult] = useState<PocketBaseMember | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isLeadPastor = user?.role === 'lead_pastor';

  useEffect(() => {
    const selectedCell = cellGroups.find((cell) => cell.id === cellGroupId);
    setSectionId(selectedCell?.sectionId || '');
    setSectionName(selectedCell?.sectionName || '');
  }, [cellGroupId, cellGroups]);

  const toggleDepartment = (departmentId: string) => {
    setSelectedDepartments((current) => current.includes(departmentId)
      ? current.filter((id) => id !== departmentId)
      : [...current, departmentId]);
  };

  const handleEnroll = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!fullName.trim() || !phone.trim() || !email.trim()) {
      toast.error('Full name, phone, and email are required.');
      return;
    }
    if (role === 'administrator' && !isLeadPastor) {
      toast.error('Only the Lead Pastor can assign the Administrator role.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await enrollMember({
        fullName,
        phone,
        email,
        role,
        departments: selectedDepartments,
        cellGroupId: cellGroupId || undefined,
        sectionId: sectionId || undefined,
        dateOfBirth: dateOfBirth || undefined,
        address: address || undefined
      });
      setEnrolledResult(result);
      toast.success(`${result.fullName} was added to the registry.`);
      onSuccess?.();
    } catch (error) {
      console.error('[Members] Enrollment failed:', error);
      toast.error(friendlyError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyRegistryDetails = async () => {
    if (!enrolledResult) return;
    const details = [
      'ChurchConnect member registration',
      `Name: ${enrolledResult.fullName}`,
      `Member ID: ${enrolledResult.qrCode}`,
      `Email: ${enrolledResult.email}`,
      `Role: ${enrolledResult.role.replaceAll('_', ' ')}`
    ].join('\n');
    try {
      await navigator.clipboard.writeText(details);
      toast.success('Registration details copied.');
    } catch {
      toast.error('Copy is unavailable on this device.');
    }
  };

  if (enrolledResult) {
    return (
      <div className="space-y-5 p-4 pb-7 text-left text-text-primary">
        <div className="flex flex-col items-center py-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Sparkles className="h-7 w-7" />
          </div>
          <h3 className="mt-3 text-lg font-extrabold">Member enrolled</h3>
          <p className="mt-1 max-w-sm text-xs leading-relaxed text-text-muted">
            The registry profile is safely stored in PocketBase and is now available to authorized church users.
          </p>
        </div>

        <GlassCard className="space-y-3 border border-gold-500/20 p-4">
          <div className="flex items-center justify-between border-b border-border-subtle pb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gold-600 dark:text-gold-400">Registration details</span>
            <button type="button" onClick={copyRegistryDetails} className="flex items-center gap-1.5 rounded-lg bg-surface-200 px-2.5 py-1.5 text-[10px] font-bold text-text-secondary">
              <Copy className="h-3 w-3" /> Copy
            </button>
          </div>
          <dl className="space-y-2 text-xs">
            <div className="flex justify-between gap-4"><dt className="text-text-muted">Full name</dt><dd className="text-right font-bold">{enrolledResult.fullName}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-text-muted">Member ID</dt><dd className="font-mono font-bold text-gold-600 dark:text-gold-400">{enrolledResult.qrCode}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-text-muted">Email</dt><dd className="truncate font-medium">{enrolledResult.email}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-text-muted">Role</dt><dd className="font-bold capitalize">{enrolledResult.role.replaceAll('_', ' ')}</dd></div>
          </dl>
        </GlassCard>

        <div className="flex gap-3 rounded-xl border border-sky-500/20 bg-sky-500/5 p-3.5 text-xs text-text-secondary">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
          <p className="leading-relaxed">This enrollment does not create a login or password. A login account can be linked separately when the member needs app access.</p>
        </div>

        <button type="button" onClick={onClose} className="w-full rounded-pill bg-gold-500 py-3 text-center text-xs font-extrabold uppercase tracking-wider text-black shadow-glow-gold">
          Return to registry
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleEnroll} className="max-h-[80vh] space-y-4 overflow-y-auto p-4 pb-8 text-left">
      <p className="text-xs font-medium leading-relaxed text-text-secondary">
        Add a member to the central church registry. Required fields are marked below.
      </p>

      <Field label="Full name" required icon={<User className="h-4 w-4" />}>
        <input required value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="e.g. Grace Wanjiku" className="registry-input" />
      </Field>
      <Field label="Phone number" required icon={<Phone className="h-4 w-4" />}>
        <input type="tel" required value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="e.g. +254 700 000 000" className="registry-input" />
      </Field>
      <Field label="Email address" required icon={<Mail className="h-4 w-4" />}>
        <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="member@example.com" className="registry-input" />
      </Field>

      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Registry role <span className="text-gold-500">*</span></label>
        <div className="grid grid-cols-2 gap-2">
          {ROLE_OPTIONS.map((option) => {
            const disabled = option.id === 'administrator' && !isLeadPastor;
            return (
              <button key={option.id} type="button" disabled={disabled} onClick={() => setRole(option.id)} className={`rounded-xl border p-2.5 text-xs font-bold transition-colors ${disabled ? 'cursor-not-allowed border-border-subtle text-text-muted opacity-45' : role === option.id ? 'border-gold-500 bg-gold-500 text-black' : 'border-border-subtle bg-surface-100 text-text-secondary'}`}>
                {option.label}
              </button>
            );
          })}
        </div>
        {!isLeadPastor && <p className="text-[10px] text-text-muted">Administrator assignment is restricted to the Lead Pastor.</p>}
      </div>

      {departments.length > 0 && (
        <div className="space-y-2">
          <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Departments</label>
          <div className="grid max-h-40 grid-cols-2 gap-1.5 overflow-y-auto rounded-xl border border-border-subtle bg-surface-100 p-2">
            {departments.map((department) => {
              const selected = selectedDepartments.includes(department.id);
              return (
                <button key={department.id} type="button" onClick={() => toggleDepartment(department.id)} className={`flex items-center gap-2 rounded-lg border p-2 text-left text-xs font-semibold ${selected ? 'border-gold-500/30 bg-gold-500/15 text-gold-700 dark:text-gold-400' : 'border-border-subtle text-text-secondary'}`}>
                  <span className={`flex h-3.5 w-3.5 items-center justify-center rounded border ${selected ? 'border-gold-500 bg-gold-500 text-black' : 'border-border-strong'}`}>{selected && <Check className="h-2.5 w-2.5 stroke-[3]" />}</span>
                  <span className="truncate">{department.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-3 border-t border-border-subtle pt-3">
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Church and personal details (optional)</h4>
        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Cell group</label>
          <select value={cellGroupId} onChange={(event) => setCellGroupId(event.target.value)} disabled={referencesLoading} className="w-full rounded-card border border-border-subtle bg-surface-100 p-3 text-sm font-bold text-text-primary outline-none focus:border-gold-500 focus:ring-2 focus:ring-gold-500/30">
            <option value="">{referencesLoading ? 'Loading cell groups…' : 'Not assigned'}</option>
            {cellGroups.map((cell) => <option key={cell.id} value={cell.id}>{cell.name}</option>)}
          </select>
        </div>
        {sectionName && <div className="flex items-center justify-between rounded-xl border border-border-subtle bg-surface-100 p-3 text-xs"><span><span className="block text-[10px] uppercase text-text-muted">Section</span><strong className="mt-0.5 block text-gold-700 dark:text-gold-400">{sectionName}</strong></span><AccentBadge label="Auto" variant="sage" size="sm" /></div>}
        <Field label="Date of birth" icon={<Calendar className="h-4 w-4" />}>
          <input type="date" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} className="registry-input" />
        </Field>
        <Field label="Residential address" icon={<MapPin className="h-4 w-4" />}>
          <input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Town, estate, or landmark" className="registry-input" />
        </Field>
      </div>

      <button type="submit" disabled={isSubmitting} className="flex w-full items-center justify-center gap-2 rounded-pill bg-gold-500 py-3.5 text-xs font-extrabold uppercase tracking-wider text-black shadow-glow-gold disabled:cursor-not-allowed disabled:opacity-50">
        {isSubmitting ? 'Enrolling member…' : 'Enroll member'}
      </button>
    </form>
  );
}

function Field({ label, required, icon, children }: { label: string; required?: boolean; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">{label} {required && <span className="text-gold-500">*</span>}</label>
      <div className="relative [&_.registry-input]:w-full [&_.registry-input]:rounded-card [&_.registry-input]:border [&_.registry-input]:border-border-subtle [&_.registry-input]:bg-surface-100 [&_.registry-input]:p-3 [&_.registry-input]:pl-10 [&_.registry-input]:text-sm [&_.registry-input]:text-text-primary [&_.registry-input]:outline-none [&_.registry-input]:focus:border-gold-500 [&_.registry-input]:focus:ring-2 [&_.registry-input]:focus:ring-gold-500/30">
        <span className="pointer-events-none absolute left-3 top-3.5 text-text-muted">{icon}</span>
        {children}
      </div>
    </div>
  );
}
