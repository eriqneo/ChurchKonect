export const APP_ROLE_IDS = [
  'lead_pastor',
  'administrator',
  'cell_leader',
  'district_pastor',
  'department_head',
  'member',
  'guest'
] as const;

export type AppRoleId = (typeof APP_ROLE_IDS)[number];

export interface AppRole {
  id: AppRoleId;
  label: string;
  name: string;
  avatarText: string;
  department: string;
  isAdmin: boolean;
}

export interface RoleIdentity {
  name: string;
  role: string;
  avatarText?: string;
  department?: string;
}

export const APP_ROLES: AppRole[] = [
  { id: 'lead_pastor', label: 'Lead Pastor', name: 'Lead Pastor', avatarText: 'LP', department: 'Executive Clergy', isAdmin: true },
  { id: 'administrator', label: 'Administrator', name: 'Administrator', avatarText: 'AD', department: 'Operations', isAdmin: true },
  { id: 'cell_leader', label: 'Cell Leader', name: 'Cell Leader', avatarText: 'CL', department: 'Cell Ministry', isAdmin: false },
  { id: 'district_pastor', label: 'District Pastor', name: 'District Pastor', avatarText: 'DP', department: 'District Ministry', isAdmin: true },
  { id: 'department_head', label: 'Department Head', name: 'Department Head', avatarText: 'DH', department: 'Ministry Department', isAdmin: false },
  { id: 'member', label: 'Regular Member', name: 'Church Member', avatarText: 'CM', department: 'General Congregation', isAdmin: false },
  { id: 'guest', label: 'Guest / Seeker', name: 'Guest', avatarText: 'GS', department: 'First-time Welcome', isAdmin: false }
];

export const isRoleSimulatorEnabled =
  import.meta.env.DEV && import.meta.env.VITE_ENABLE_ROLE_SIMULATOR === 'true';

export function normalizeRoleId(role: string | undefined): AppRoleId {
  const normalized = role === 'admin' ? 'administrator' : role;
  return APP_ROLE_IDS.includes(normalized as AppRoleId)
    ? (normalized as AppRoleId)
    : 'member';
}

export function initialsForName(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return initials || 'CC';
}

export function getRoleView(identity: RoleIdentity): AppRole {
  const roleId = normalizeRoleId(identity.role);
  const definition = APP_ROLES.find((role) => role.id === roleId) ?? APP_ROLES[5];

  return {
    ...definition,
    name: identity.name || definition.name,
    avatarText: identity.avatarText || initialsForName(identity.name || definition.name),
    department: identity.department || definition.department
  };
}
