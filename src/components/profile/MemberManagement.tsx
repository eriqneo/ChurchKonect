import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useMemberReferences, usePocketBaseMembers, type PocketBaseMember } from '../../lib/db/pocketbaseHooks';
import { useAuth } from '../../lib/db/PocketBaseProvider';
import { useToast } from '../shared/toast/useToast';
import { EnrollMemberForm } from './EnrollMemberForm';
import { 
  GlassCard, 
  AccentBadge, 
  SearchField, 
  ContentRow, 
  BottomSheet,
  SectionTitle 
} from '../shared';
import { 
  Users, 
  Plus, 
  SlidersHorizontal, 
  Check, 
  X, 
  ChevronRight, 
  Calendar, 
  MapPin, 
  Mail, 
  Phone, 
  ShieldAlert, 
  UserCog, 
  UserX, 
  KeyRound, 
  Network, 
  Briefcase,
  Grid,
  CheckSquare,
  Square,
  Eye,
  Lock,
  Compass
} from 'lucide-react';

export function MemberManagement() {
  const { members, updateMember, deleteMember, resetPassword } = usePocketBaseMembers();
  const { departments, cellGroups } = useMemberReferences();
  const { user } = useAuth();
  const toast = useToast();

  // Search & Filtering States
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  
  // Selected Filters
  const [filterRoles, setFilterRoles] = useState<string[]>([]);
  const [filterDepartments, setFilterDepartments] = useState<string[]>([]);
  const [filterCellGroup, setFilterCellGroup] = useState('');
  const [filterStatus, setFilterStatus] = useState<'All' | 'Active' | 'Inactive'>('All');
  const [sortOption, setSortOption] = useState<'A-Z' | 'Newest' | 'Role'>('A-Z');

  // Drawer / Sheet Open states
  const [isEnrollOpen, setIsEnrollOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<PocketBaseMember | null>(null);

  // Sub-actions in Member Detail Sheet
  const [showEditSheet, setShowEditSheet] = useState(false);
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);
  const [passwordResetResult, setPasswordResetResult] = useState<{ email: string; fullName: string; delivery: 'email' } | null>(null);

  // Edit fields temp states
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editDob, setEditDob] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editCellGroupId, setEditCellGroupId] = useState('');
  const [editDepartments, setEditDepartments] = useState<string[]>([]);

  // Open member details
  const handleOpenDetails = (member: PocketBaseMember) => {
    setSelectedMember(member);
    setEditName(member.fullName);
    setEditPhone(member.phone);
    setEditEmail(member.email);
    setEditAddress(member.address || '');
    setEditDob(member.dateOfBirth || '');
    setEditRole(member.role);
    setEditCellGroupId(member.cellGroupId || '');
    setEditDepartments(member.departments || []);
    setPasswordResetResult(null);
  };

  // Toggle filter selections
  const handleToggleRoleFilter = (roleId: string) => {
    if (filterRoles.includes(roleId)) {
      setFilterRoles(filterRoles.filter(r => r !== roleId));
    } else {
      setFilterRoles([...filterRoles, roleId]);
    }
  };

  const handleToggleDeptFilter = (dept: string) => {
    if (filterDepartments.includes(dept)) {
      setFilterDepartments(filterDepartments.filter(d => d !== dept));
    } else {
      setFilterDepartments([...filterDepartments, dept]);
    }
  };

  const handleClearFilters = () => {
    setFilterRoles([]);
    setFilterDepartments([]);
    setFilterCellGroup('');
    setFilterStatus('All');
    setSortOption('A-Z');
    toast.success('Filters cleared!');
  };

  // Filter & Sort Logic
  const filteredMembers = members.filter(m => {
    // 1. Search Query Match
    const matchesSearch = 
      m.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.phone.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.qrCode.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    // 2. Role Filter Match
    if (filterRoles.length > 0) {
      if (!filterRoles.includes(m.role.toLowerCase())) return false;
    }

    // 3. Department Filter Match
    if (filterDepartments.length > 0) {
      const memberDepts = m.departments || [];
      const hasDept = filterDepartments.some(d => memberDepts.includes(d));
      if (!hasDept) return false;
    }

    // 4. Cell Group Filter Match
    if (filterCellGroup && m.cellGroupId !== filterCellGroup) {
      return false;
    }

    // 5. Status Filter Match
    if (filterStatus !== 'All') {
      const isActive = m.status === 'Active';
      if (filterStatus === 'Active' && !isActive) return false;
      if (filterStatus === 'Inactive' && isActive) return false;
    }

    return true;
  });

  // Sorting
  const sortedMembers = [...filteredMembers].sort((a, b) => {
    if (sortOption === 'A-Z') {
      return a.fullName.localeCompare(b.fullName);
    } else if (sortOption === 'Newest') {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    } else if (sortOption === 'Role') {
      const roleOrder: Record<string, number> = { lead_pastor: 0, administrator: 1, district_pastor: 2, department_head: 3, cell_leader: 4, member: 5, guest: 6 };
      const roleA = roleOrder[a.role.toLowerCase()] ?? 9;
      const roleB = roleOrder[b.role.toLowerCase()] ?? 9;
      return roleA - roleB;
    }
    return 0;
  });

  // Admin CRUD action handlers
  const handleSaveChanges = async () => {
    if (!selectedMember) return;
    if (!editName.trim() || !editPhone.trim() || !editEmail.trim()) {
      toast.error('Name, Phone, and Email are required.');
      return;
    }

    const updates: Partial<PocketBaseMember> = {
      fullName: editName,
      phone: editPhone,
      email: editEmail,
      address: editAddress,
      dateOfBirth: editDob,
      role: editRole,
      cellGroupId: editCellGroupId || undefined,
      departments: editDepartments,
    };

    // If cell changed, look up section
    if (editCellGroupId) {
      const selectedCell = cellGroups.find(c => c.id === editCellGroupId);
      if (selectedCell) {
        updates.sectionId = selectedCell.sectionId;
      }
    } else {
      updates.cellGroupId = undefined;
      updates.sectionId = undefined;
    }

    try {
      const updated = await updateMember(selectedMember.remoteId, updates);
      toast.success('Member updated successfully!');
      setSelectedMember(updated);
      setShowEditSheet(false);
    } catch (error) {
      console.error('[Members] Update failed:', error);
      toast.error(error instanceof Error ? error.message : 'Member update failed.');
    }
  };

  const handleDeactivate = async () => {
    if (!selectedMember) return;
    try {
      await deleteMember(selectedMember.remoteId);
      toast.success(`${selectedMember.fullName} deactivated.`);
      setShowDeactivateConfirm(false);
      setSelectedMember(null);
    } catch (error) {
      console.error('[Members] Deactivation failed:', error);
      toast.error(error instanceof Error ? error.message : 'Member deactivation failed.');
    }
  };

  const handleResetPasswordAction = async () => {
    if (!selectedMember) return;
    try {
      const result = await resetPassword(selectedMember.remoteId);
      setPasswordResetResult(result);
      toast.success(`Password reset instructions were sent to ${result.email}.`);
    } catch (error) {
      console.error('[Members] Password reset failed:', error);
      toast.error(error instanceof Error ? error.message : 'Password reset could not be requested.');
    }
  };

  const handleToggleEditDept = (dept: string) => {
    if (editDepartments.includes(dept)) {
      setEditDepartments(editDepartments.filter(d => d !== dept));
    } else {
      setEditDepartments([...editDepartments, dept]);
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    const r = role.toLowerCase();
    if (r === 'administrator' || r === 'lead_pastor') return 'gold';
    if (r === 'cell_leader' || r === 'department_head' || r === 'district_pastor') return 'sage';
    return 'muted';
  };

  const isPastor = user?.role === 'lead_pastor';
  const canManage = isPastor || user?.role === 'administrator';

  return (
    <div className="space-y-4 pb-12">
      {/* SECTION HEADER */}
      <SectionTitle
        title="Member Registry"
        badge={{ label: 'CMS', variant: 'gold' }}
        action={canManage ? {
          label: 'Enroll New',
          onPress: () => setIsEnrollOpen(true)
        } : undefined}
      />

      {/* SEARCH AND FILTER BUTTON */}
      <div className="flex gap-2">
        <div className="flex-1">
          <SearchField
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search name, ID, or phone..."
          />
        </div>
        <button
          onClick={() => setShowFilterSheet(true)}
          className="p-3 rounded-card bg-surface-100 border border-white/5 text-text-primary hover:bg-surface-200 transition-all cursor-pointer flex items-center justify-center relative"
        >
          <SlidersHorizontal className="w-5 h-5" />
          {(filterRoles.length > 0 || filterDepartments.length > 0 || filterCellGroup || filterStatus !== 'All') && (
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-gold-500 rounded-full border-2 border-surface-0 animate-pulse" />
          )}
        </button>
      </div>

      {/* MEMBERS DIRECTORY LIST */}
      <GlassCard className="p-1 overflow-hidden divide-y divide-white/[0.03] dark:divide-white/[0.03] light:divide-black/[0.03]">
        {sortedMembers.length === 0 ? (
          <div className="p-8 text-center text-text-muted flex flex-col items-center justify-center space-y-2">
            <Users className="w-8 h-8 opacity-40 animate-bounce" />
            <span className="text-xs font-bold">No match found in registry</span>
            <p className="text-[10px] opacity-70">Try adjusting your filters or search keywords.</p>
          </div>
        ) : (
          sortedMembers.map((member) => {
            const assignedCell = cellGroups.find(c => c.id === member.cellGroupId);
            const departments = member.departments || [];

            const cellTag = assignedCell ? `🏡 ${assignedCell.name}` : '';
            const deptsTag = departments.length > 0 ? `💼 ${departments.join(', ')}` : '';
            const metadataString = [cellTag, deptsTag].filter(Boolean).join('  |  ') || 'No cell/department assigned';

            return (
              <ContentRow
                key={member.localId}
                thumbnail={
                  <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-cathedral-700 to-gold-500 flex items-center justify-center text-white font-extrabold text-xs">
                    {member.avatarText || 'M'}
                  </div>
                }
                title={member.fullName}
                subtitle={member.email}
                meta={metadataString}
                action={
                  <div className="flex flex-col items-end gap-1 select-none">
                    <AccentBadge 
                      label={member.role.toUpperCase()} 
                      variant={getRoleBadgeVariant(member.role)} 
                      size="sm" 
                    />
                    <span className="text-[9px] font-mono text-text-muted">
                      {member.qrCode}
                    </span>
                  </div>
                }
                onPress={() => handleOpenDetails(member)}
              />
            );
          })
        )}
      </GlassCard>

      {/* FILTER BOTTOM SHEET */}
      <BottomSheet
        isOpen={showFilterSheet}
        onClose={() => setShowFilterSheet(false)}
        title="Registry Filters"
      >
        <div className="space-y-4 pb-6 text-left">
          {/* Status Selection */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Registry Status</span>
            <div className="grid grid-cols-3 gap-2">
              {(['All', 'Active', 'Inactive'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setFilterStatus(st)}
                  className={`p-2 rounded-xl border text-xs font-bold text-center cursor-pointer transition-colors ${
                    filterStatus === st 
                      ? 'bg-gold-500 text-black border-gold-500 shadow-glow-gold' 
                      : 'bg-white/[0.01] border-white/5 text-text-secondary hover:bg-white/5'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {/* Role Checkboxes */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Role Filtering</span>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'member', label: 'Regular Member' },
                { id: 'cell_leader', label: 'Cell Leader' },
                { id: 'department_head', label: 'Department Head' },
                { id: 'administrator', label: 'Administrator' },
                { id: 'lead_pastor', label: 'Lead Pastor' }
              ].map((r) => {
                const isSelected = filterRoles.includes(r.id);
                return (
                  <button
                    key={r.id}
                    onClick={() => handleToggleRoleFilter(r.id)}
                    className={`flex items-center justify-between p-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                      isSelected 
                        ? 'bg-gold-500/10 border-gold-500/50 text-gold-500' 
                        : 'bg-white/[0.01] border-white/5 text-text-secondary hover:bg-white/5'
                    }`}
                  >
                    <span>{r.label}</span>
                    {isSelected ? <CheckSquare className="w-4 h-4 text-gold-500" /> : <Square className="w-4 h-4 text-white/10" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cell Group Selector */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Filter by Cell Group</span>
            <select
              value={filterCellGroup}
              onChange={(e) => setFilterCellGroup(e.target.value)}
              className="w-full p-3 rounded-card bg-surface-200 dark:bg-surface-200 light:bg-surface-light-secondary text-xs border border-transparent focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500 text-text-primary outline-none font-bold"
            >
              <option value="">-- All Cell Groups --</option>
              {cellGroups.map((cg) => (
                <option key={cg.id} value={cg.id}>
                  {cg.name}
                </option>
              ))}
            </select>
          </div>

          {/* Department Selection */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Filter by Department</span>
            <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto p-2 border border-white/5 bg-white/[0.01] rounded-xl">
              {departments.map((department) => {
                const isSelected = filterDepartments.includes(department.name);
                return (
                  <button
                    key={department.id}
                    onClick={() => handleToggleDeptFilter(department.name)}
                    className={`flex items-center justify-between p-2 rounded-lg text-left text-xs font-semibold cursor-pointer transition-colors ${
                      isSelected 
                        ? 'bg-gold-500/10 text-gold-500 border border-gold-500/20' 
                        : 'bg-transparent border border-white/5 hover:bg-white/5 text-text-secondary'
                    }`}
                  >
                    <span className="truncate">{department.name}</span>
                    {isSelected ? <Check className="w-3.5 h-3.5 text-gold-500" /> : null}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sort Setting */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Sort Directory</span>
            <div className="grid grid-cols-3 gap-2">
              {(['A-Z', 'Newest', 'Role'] as const).map((opt) => (
                <button
                  key={opt}
                  onClick={() => setSortOption(opt)}
                  className={`p-2 rounded-xl border text-xs font-bold text-center cursor-pointer transition-colors ${
                    sortOption === opt 
                      ? 'bg-gold-500 text-black border-gold-500 shadow-glow-gold' 
                      : 'bg-white/[0.01] border-white/5 text-text-secondary hover:bg-white/5'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* Filter Actions */}
          <div className="pt-2 flex gap-2">
            <button
              onClick={() => setShowFilterSheet(false)}
              className="flex-1 py-2.5 rounded-pill bg-gold-500 text-black font-extrabold text-xs cursor-pointer shadow-glow-gold text-center"
            >
              Apply Filters
            </button>
            <button
              onClick={handleClearFilters}
              className="px-4 py-2.5 rounded-pill bg-white/5 hover:bg-white/10 text-text-secondary border border-white/5 font-bold text-xs cursor-pointer"
            >
              Reset
            </button>
          </div>
        </div>
      </BottomSheet>

      {/* ENROLL MEMBER BOTTOM SHEET */}
      <BottomSheet
        isOpen={isEnrollOpen}
        onClose={() => setIsEnrollOpen(false)}
        title="Enroll New Member"
      >
        <EnrollMemberForm 
          onClose={() => setIsEnrollOpen(false)} 
        />
      </BottomSheet>

      {/* MEMBER DETAILS MODAL (SAME AS PROFILE VIEW BUT WITH ADMINISTRATIVE CONTROLS) */}
      <BottomSheet
        isOpen={selectedMember !== null}
        onClose={() => setSelectedMember(null)}
        title="Member Registry Card"
      >
        {selectedMember && (
          <div className="space-y-5 pb-6 text-left">
            
            {/* Identity Card Mini Details */}
            <div className="relative rounded-2xl overflow-hidden border border-white/5 p-4 flex flex-col items-center justify-center text-center bg-gradient-to-tr from-cathedral-950 via-surface-0 to-surface-0 dark:from-cathedral-950 light:from-cathedral-100 light:via-white light:to-white">
              <div className="w-16 h-16 rounded-full border-[2.5px] border-gold-500 flex items-center justify-center bg-gradient-to-tr from-cathedral-700 to-gold-500 text-white font-extrabold text-xl shadow-lg">
                {selectedMember.avatarText}
              </div>
              
              <h3 className="font-extrabold text-md mt-2 text-text-primary">{selectedMember.fullName}</h3>
              <p className="text-xs text-text-muted mt-0.5">{selectedMember.phone} · {selectedMember.email}</p>
              
              <div className="flex items-center gap-1.5 mt-2">
                <AccentBadge label={selectedMember.role.toUpperCase()} variant={getRoleBadgeVariant(selectedMember.role)} size="sm" />
                <span className="text-[10px] font-mono text-text-muted bg-white/5 px-2 py-0.5 rounded border border-white/5">
                  ID: {selectedMember.qrCode}
                </span>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                  selectedMember.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                }`}>
                  {selectedMember.status}
                </span>
              </div>
            </div>

            {/* PASSWORD RESET SLIP DISPLAY */}
            {passwordResetResult && (
              <GlassCard className="p-4 space-y-2 border border-emerald-500/30 bg-emerald-500/[0.02]">
                <div className="flex justify-between items-center pb-1">
                  <span className="text-[10px] font-black text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5" /> Reset Email Sent
                  </span>
                  <button 
                    onClick={() => setPasswordResetResult(null)}
                    className="p-1 rounded-full bg-white/5 text-text-muted"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Member Name</span>
                    <span className="font-bold">{passwordResetResult.fullName}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-text-secondary">Delivered to</span>
                    <span className="truncate font-medium text-emerald-600 dark:text-emerald-400">{passwordResetResult.email}</span>
                  </div>
                  <div className="border-t border-white/5 pt-2 text-[10px] leading-relaxed text-text-muted">
                    PocketBase sent a one-time reset link. No password is displayed or stored by ChurchConnect.
                  </div>
                </div>
              </GlassCard>
            )}

            {/* ADMISTRATIVE ACTION ITEMS PANEL */}
            <div className="space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted px-1">
                Administrative Control Panel
              </span>

              <div className="grid grid-cols-2 gap-2">
                
                {/* 1. Quick Edit Button */}
                <button
                  onClick={() => setShowEditSheet(true)}
                  className="p-3 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/5 hover:border-gold-500/20 text-xs font-bold text-text-primary flex items-center gap-2.5 transition-all cursor-pointer"
                >
                  <UserCog className="w-4.5 h-4.5 text-gold-400 flex-shrink-0" />
                  <div className="flex flex-col text-left">
                    <span>Edit Profile</span>
                    <span className="text-[9px] text-text-muted font-normal mt-0.5">Change standard fields</span>
                  </div>
                </button>

                {/* 2. Reset Password Button */}
                <button
                  onClick={handleResetPasswordAction}
                  className="p-3 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/5 hover:border-emerald-500/20 text-xs font-bold text-text-primary flex items-center gap-2.5 transition-all cursor-pointer"
                >
                  <KeyRound className="w-4.5 h-4.5 text-emerald-400 flex-shrink-0" />
                  <div className="flex flex-col text-left">
                    <span>Reset password</span>
                    <span className="text-[9px] text-text-muted font-normal mt-0.5">Send secure email link</span>
                  </div>
                </button>

                {/* 3. Soft Delete / Deactivate */}
                <button
                  onClick={() => setShowDeactivateConfirm(true)}
                  className="p-3 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-red-500/5 hover:border-red-500/20 text-xs font-bold text-text-primary flex items-center gap-2.5 transition-all cursor-pointer"
                >
                  <UserX className="w-4.5 h-4.5 text-red-500 flex-shrink-0" />
                  <div className="flex flex-col text-left">
                    <span>Deactivate</span>
                    <span className="text-[9px] text-text-muted font-normal mt-0.5">Suspend from database</span>
                  </div>
                </button>

                {/* Info Card Row */}
                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 text-xs text-text-muted flex items-center gap-2.5">
                  <Network className="w-4.5 h-4.5 text-teal-400 flex-shrink-0" />
                  <div className="flex flex-col text-left">
                    <span className="font-semibold text-[10px] uppercase text-text-muted">Enrolled Since</span>
                    <span className="text-text-primary font-bold mt-0.5">
                      {new Date(selectedMember.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                </div>

              </div>
            </div>

            {/* DETAILS ACCORDION BLOCK (Address, DOB, Cell, etc) */}
            <div className="space-y-2 border-t border-white/5 pt-4">
              <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted px-1">
                Personal Metadata & Bio
              </span>
              <GlassCard className="p-3 space-y-2.5 text-xs">
                <div className="flex items-center justify-between pb-1.5 border-b border-white/[0.03]">
                  <span className="text-text-muted font-medium flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-text-muted" /> Date of Birth
                  </span>
                  <span className="text-text-primary font-bold">{selectedMember.dateOfBirth || 'Not specified'}</span>
                </div>
                <div className="flex items-start justify-between pb-1.5 border-b border-white/[0.03]">
                  <span className="text-text-muted font-medium flex items-center gap-1.5 mt-0.5">
                    <MapPin className="w-4 h-4 text-text-muted" /> Address
                  </span>
                  <span className="text-text-primary font-bold max-w-[180px] text-right break-words">{selectedMember.address || 'Not specified'}</span>
                </div>
                <div className="flex items-center justify-between pb-1.5 border-b border-white/[0.03]">
                  <span className="text-text-muted font-medium flex items-center gap-1.5">
                    <Grid className="w-4 h-4 text-text-muted" /> Cell Group
                  </span>
                  <span className="text-text-primary font-bold">
                    {selectedMember.cellGroupName || 'Not assigned'}
                  </span>
                </div>
                {selectedMember.departments && selectedMember.departments.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <span className="text-text-muted font-medium flex items-center gap-1.5">
                      <Briefcase className="w-4 h-4 text-text-muted" /> Departments
                    </span>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {selectedMember.departments.map((d) => (
                        <AccentBadge key={d} label={d} variant="sage" size="sm" />
                      ))}
                    </div>
                  </div>
                )}
              </GlassCard>
            </div>

            {/* RETURN CTA */}
            <button
              onClick={() => setSelectedMember(null)}
              className="w-full py-3 rounded-pill bg-white/5 border border-white/10 text-text-primary font-bold text-xs uppercase tracking-wider transition-colors text-center"
            >
              Close Details
            </button>
          </div>
        )}
      </BottomSheet>

      {/* 1. EDIT PROFILE BOTTOM SHEET */}
      <BottomSheet
        isOpen={showEditSheet}
        onClose={() => setShowEditSheet(false)}
        title="Admin Profile Editor"
      >
        <div className="space-y-4 pb-6 text-left">
          
          {/* Edit Name */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Full Name</span>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full p-3 rounded-card bg-surface-200 text-sm border border-transparent focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500 text-text-primary outline-none font-bold"
            />
          </div>

          {/* Edit Phone */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Phone Number</span>
            <input
              type="text"
              value={editPhone}
              onChange={(e) => setEditPhone(e.target.value)}
              className="w-full p-3 rounded-card bg-surface-200 text-sm border border-transparent focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500 text-text-primary outline-none font-medium"
            />
          </div>

          {/* Edit Email */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Email Address</span>
            <input
              type="email"
              value={editEmail}
              onChange={(e) => setEditEmail(e.target.value)}
              className="w-full p-3 rounded-card bg-surface-200 text-sm border border-transparent focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500 text-text-primary outline-none"
            />
          </div>

          {/* Change Role - Restricted */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Change Role</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'member', label: 'Member' },
                { id: 'cell_leader', label: 'Cell Leader' },
                { id: 'department_head', label: 'Department Head' },
                { id: 'administrator', label: 'Administrator' }
              ].map((roleOption) => {
                const isSelected = editRole === roleOption.id;
                const isDisabled = roleOption.id === 'administrator' && !isPastor;

                return (
                  <button
                    key={roleOption.id}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => setEditRole(roleOption.id)}
                    className={`p-2 rounded-xl border text-center transition-all cursor-pointer relative ${
                      isDisabled ? 'opacity-40 cursor-not-allowed border-white/5 bg-transparent text-text-muted' :
                      isSelected 
                        ? 'bg-gold-500 text-black border-gold-500 font-bold' 
                        : 'bg-white/[0.01] border-white/5 text-text-secondary font-semibold'
                    }`}
                  >
                    <span className="text-xs tracking-wide">{roleOption.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Edit Cell Group */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Assign to Cell</span>
            <select
              value={editCellGroupId}
              onChange={(e) => setEditCellGroupId(e.target.value)}
              className="w-full p-3 rounded-card bg-surface-200 text-sm border border-transparent focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500 text-text-primary outline-none font-bold"
            >
              <option value="">-- Not Assigned --</option>
              {cellGroups.map((cg) => (
                <option key={cg.id} value={cg.id}>
                  {cg.name}
                </option>
              ))}
            </select>
          </div>

          {/* Department Selection */}
          {departments.length > 0 && (
            <div className="space-y-2 pt-1">
              <span className="text-[10px] font-bold uppercase tracking-widest text-gold-400">Assign Departments</span>
              <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto p-2 border border-white/5 bg-white/[0.01] rounded-xl">
                {departments.map((department) => {
                  const isChecked = editDepartments.includes(department.name);
                  return (
                    <button
                      key={department.id}
                      type="button"
                      onClick={() => handleToggleEditDept(department.name)}
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
                      <span className="truncate">{department.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Edit DOB */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Date of Birth</span>
            <input
              type="date"
              value={editDob}
              onChange={(e) => setEditDob(e.target.value)}
              className="w-full p-3 rounded-card bg-surface-200 text-sm border border-transparent focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500 text-text-primary outline-none"
            />
          </div>

          {/* Edit Address */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">Residential Address</span>
            <input
              type="text"
              value={editAddress}
              onChange={(e) => setEditAddress(e.target.value)}
              className="w-full p-3 rounded-card bg-surface-200 text-sm border border-transparent focus:ring-2 focus:ring-gold-500/40 focus:border-gold-500 text-text-primary outline-none"
            />
          </div>

          {/* Action Footer */}
          <div className="pt-2 flex gap-2">
            <button
              onClick={handleSaveChanges}
              className="flex-1 py-2.5 rounded-pill bg-gold-500 text-black font-extrabold text-xs cursor-pointer shadow-glow-gold text-center"
            >
              Save Changes
            </button>
            <button
              onClick={() => setShowEditSheet(false)}
              className="px-4 py-2.5 rounded-pill bg-surface-200 text-text-secondary font-bold text-xs cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      </BottomSheet>

      {/* 2. DEACTIVATE CONFIRM BOTTOM SHEET */}
      <BottomSheet
        isOpen={showDeactivateConfirm}
        onClose={() => setShowDeactivateConfirm(false)}
        title="Confirm Deactivation"
      >
        <div className="space-y-4 pb-6 text-center text-text-primary">
          <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 text-red-500 flex items-center justify-center mx-auto">
            <UserX className="w-6 h-6" />
          </div>
          <p className="text-xs text-text-secondary font-medium leading-relaxed max-w-sm mx-auto">
            Are you sure you want to soft delete / deactivate <span className="font-bold text-text-primary">{selectedMember?.fullName}</span>? This will suspend their digital pass and hide them from general lists. You can reverse this later if needed.
          </p>

          <div className="grid grid-cols-2 gap-2 pt-2">
            <button
              onClick={handleDeactivate}
              className="py-2.5 rounded-pill bg-red-600 text-white font-black text-xs uppercase tracking-wider cursor-pointer hover:bg-red-700 transition-colors"
            >
              Deactivate
            </button>
            <button
              onClick={() => setShowDeactivateConfirm(false)}
              className="py-2.5 rounded-pill bg-surface-200 text-text-secondary font-bold text-xs cursor-pointer hover:bg-surface-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
