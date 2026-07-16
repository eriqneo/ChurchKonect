import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { db, putAppSetting } from './churchConnectDB';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  avatarText: string;
}

interface PocketBaseContextType {
  pb: any; // Simulated PocketBase Client
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password?: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  updateUserBadge: (count: number) => void;
}

const PocketBaseContext = createContext<PocketBaseContextType | null>(null);

// Simulated PocketBase client subscriptions
const mockPBClient = {
  collection: (name: string) => ({
    subscribe: (id: string, callback: (event: any) => void) => {
      console.log(`[PocketBase Realtime] Subscribed to collection: ${name}, id: ${id}`);
      return () => {
        console.log(`[PocketBase Realtime] Unsubscribed from collection: ${name}, id: ${id}`);
      };
    },
    unsubscribe: (id: string) => {
      console.log(`[PocketBase Realtime] Unsubscribed from collection: ${name}, id: ${id}`);
    }
  })
};

export function PocketBaseProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const switchRoleDirect = useCallback(async (roleId: string) => {
    const ROLES = [
      { id: 'lead_pastor', label: 'LEAD PASTOR', name: 'Pastor David', isAdmin: true, avatarText: 'PD' },
      { id: 'administrator', label: 'ADMINISTRATOR', name: 'Sarah Jenkins', isAdmin: true, avatarText: 'SJ' },
      { id: 'cell_leader', label: 'CELL LEADER', name: 'Michael Sterns', isAdmin: false, avatarText: 'MS' },
      { id: 'member', label: 'CHURCH SAINT', name: 'Sister Clara Oswald', isAdmin: false, avatarText: 'CO' }
    ];
    const selected = ROLES.find(r => r.id === roleId);
    if (selected) {
      await putAppSetting('currentRole', selected);
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate(10);
        } catch (e) {}
      }

      await db.auditLogs.add({
        localId: Math.random().toString(36).substring(2, 9),
        userId: selected.id,
        userName: selected.name,
        action: 'role_switch',
        details: `Switched roles to: ${selected.label}`,
        createdAt: new Date().toISOString()
      });
    }
  }, []);

  // Load active session from localIndexedDB on mount
  useEffect(() => {
    async function loadSession() {
      try {
        const session = await db.appSettings.where('key').equals('activeSession').first();
        if (session && session.value) {
          setUser(session.value);
        } else {
          // If no active session, look at currentRole and load corresponding initial user
          const roleSetting = await db.appSettings.where('key').equals('currentRole').first();
          if (roleSetting && roleSetting.value) {
            const roleId = roleSetting.value.id;
            const initialUser = getMockUserForRole(roleId);
            setUser(initialUser);
            await putAppSetting('activeSession', initialUser);
          }
        }
      } catch (e) {
        console.error('[PocketBase] Error loading auth session:', e);
      } finally {
        setIsLoading(false);
      }
    }
    loadSession();
  }, []);

  const getMockUserForRole = (roleId: string): AuthUser => {
    switch (roleId) {
      case 'lead_pastor':
        return {
          id: 'user-pastor-david',
          email: 'pastor.david@churchconnect.com',
          name: 'Pastor David',
          role: 'lead_pastor',
          avatarText: 'PD'
        };
      case 'administrator':
        return {
          id: 'user-admin-sarah',
          email: 'sarah.admin@churchconnect.com',
          name: 'Sarah Jenkins',
          role: 'administrator',
          avatarText: 'SJ'
        };
      case 'cell_leader':
        return {
          id: 'user-cell-leader-michael',
          email: 'michael.hope@churchconnect.com',
          name: 'Michael Sterns',
          role: 'cell_leader',
          avatarText: 'MS'
        };
      case 'member':
      default:
        return {
          id: 'user-member-clara',
          email: 'clara.saints@churchconnect.com',
          name: 'Sister Clara Oswald',
          role: 'member',
          avatarText: 'CO'
        };
    }
  };

  const login = useCallback(async (email: string, password?: string) => {
    setIsLoading(true);
    // Find matching role email or fallback
    let matchedRoleId = 'member';
    if (email.includes('pastor.david')) {
      matchedRoleId = 'lead_pastor';
    } else if (email.includes('sarah.admin') || email.includes('admin')) {
      matchedRoleId = 'administrator';
    } else if (email.includes('michael.hope') || email.includes('leader')) {
      matchedRoleId = 'cell_leader';
    } else if (email.includes('clara.saints') || email.includes('clara')) {
      matchedRoleId = 'member';
    }

    const authUser = getMockUserForRole(matchedRoleId);
    
    // Set active session & current role
    await putAppSetting('activeSession', authUser);
    await switchRoleDirect(matchedRoleId);
    
    setUser(authUser);
    setIsLoading(false);

    // Track login audit
    await db.auditLogs.add({
      localId: Math.random().toString(36).substring(2, 9),
      userId: authUser.id,
      userName: authUser.name,
      action: 'user_login',
      details: `${authUser.name} logged in successfully via PocketBase`,
      createdAt: new Date().toISOString()
    });

    return authUser;
  }, [switchRoleDirect]);

  const logout = useCallback(async () => {
    setIsLoading(true);
    if (user) {
      await db.auditLogs.add({
        localId: Math.random().toString(36).substring(2, 9),
        userId: user.id,
        userName: user.name,
        action: 'user_logout',
        details: `${user.name} logged out`,
        createdAt: new Date().toISOString()
      });
    }
    await db.appSettings.where('key').equals('activeSession').delete();
    setUser(null);
    setIsLoading(false);
  }, [user]);

  const updateUserBadge = useCallback((count: number) => {
    if ('setAppBadge' in navigator) {
      (navigator as any).setAppBadge(count).catch(console.error);
    }
  }, []);

  return (
    <PocketBaseContext.Provider value={{ pb: mockPBClient, user, isLoading, login, logout, updateUserBadge }}>
      {children}
    </PocketBaseContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(PocketBaseContext);
  if (!context) {
    throw new Error('useAuth must be used within a PocketBaseProvider');
  }
  return context;
}
