import { useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './churchConnectDB';
import { useAuth } from './PocketBaseProvider';
import { getRoleView } from '../auth/roles';
import { recordAuditEvent } from './auditEvents';

function triggerHaptic(): void {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return;
  try { navigator.vibrate(10); } catch { /* unsupported device */ }
}

export function useAuditLog() {
  const { pb, user } = useAuth();
  const logs = useLiveQuery(async () => {
    if (!user) return [];
    return db.auditLogs.where('cacheOwnerId').equals(user.id).reverse().sortBy('createdAt');
  }, [user?.id]);

  const addLog = useCallback(async (action: string, details: string) => {
    if (!user) return;
    await recordAuditEvent(pb, user, { action, summary: details });
  }, [pb, user]);

  return { logs: logs || [], addLog };
}

/** Production identity is always derived from the authenticated PocketBase user. */
export function useCurrentUser() {
  const { user } = useAuth();
  const currentRole = user ? getRoleView(user) : null;

  const switchRole = useCallback(async (roleId: string) => {
    if (user && roleId !== user.role) {
      console.warn('[Auth] Role switching is disabled; sign in with the intended test account instead.');
    }
    triggerHaptic();
  }, [user]);

  return {
    user: user ? { localId: user.id, name: user.name, email: user.email } : null,
    role: currentRole,
    switchRole
  };
}
