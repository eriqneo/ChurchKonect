import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type PocketBase from 'pocketbase';
import type { RecordModel } from 'pocketbase';
import { db, generateUUID } from './churchConnectDB';
import { initialsForName, normalizeRoleId } from '../auth/roles';
import { isPocketBaseConfigured, pb } from '../pocketbase/client';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  avatarText: string;
  department: string;
  status: string;
  verified: boolean;
}

interface PocketBaseContextType {
  pb: PocketBase;
  user: AuthUser | null;
  isLoading: boolean;
  isConfigured: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  updateUserBadge: (count: number) => void;
}

const PocketBaseContext = createContext<PocketBaseContextType | null>(null);

function toAuthUser(record: RecordModel | null): AuthUser | null {
  if (!record) return null;

  const name = typeof record.name === 'string' && record.name.trim()
    ? record.name.trim()
    : record.email;

  return {
    id: record.id,
    email: record.email,
    name,
    role: normalizeRoleId(record.role),
    avatarText: typeof record.avatarText === 'string' && record.avatarText.trim()
      ? record.avatarText.trim().slice(0, 4).toUpperCase()
      : initialsForName(name),
    department: typeof record.department === 'string' ? record.department : '',
    status: typeof record.status === 'string' ? record.status : 'active',
    verified: Boolean(record.verified)
  };
}

async function writeLocalAudit(user: AuthUser, action: string, details: string): Promise<void> {
  try {
    await db.auditLogs.add({
      localId: generateUUID(),
      userId: user.id,
      userName: user.name,
      action,
      details,
      createdAt: new Date().toISOString()
    });
  } catch (error) {
    console.warn('[Auth] Local audit write failed:', error);
  }
}

async function clearLegacyIdentity(): Promise<void> {
  await db.appSettings.where('key').anyOf('activeSession', 'currentRole').delete();
}

export function PocketBaseProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => toAuthUser(pb.authStore.record));
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = pb.authStore.onChange((_token, record) => {
      setUser(toAuthUser(record));
    }, true);

    async function restoreSession() {
      if (!isPocketBaseConfigured) {
        pb.authStore.clear();
        setIsLoading(false);
        return;
      }

      await clearLegacyIdentity();

      if (!pb.authStore.isValid) {
        setIsLoading(false);
        return;
      }

      try {
        await pb.collection('users').authRefresh();
      } catch (error) {
        console.warn('[Auth] Stored PocketBase session is no longer valid:', error);
        pb.authStore.clear();
      } finally {
        setIsLoading(false);
      }
    }

    void restoreSession();
    return unsubscribe;
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    if (!isPocketBaseConfigured) {
      throw new Error('PocketBase is not configured. Set VITE_PB_URL.');
    }
    if (!email.trim() || !password) {
      throw new Error('Email and password are required.');
    }

    setIsLoading(true);
    try {
      const authData = await pb.collection('users').authWithPassword(email.trim(), password);
      const authUser = toAuthUser(authData.record);
      if (!authUser) throw new Error('PocketBase returned an invalid user record.');

      await clearLegacyIdentity();
      await writeLocalAudit(authUser, 'user_login', `${authUser.name} authenticated with PocketBase`);
      setUser(authUser);
      return authUser;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      if (user) {
        await writeLocalAudit(user, 'user_logout', `${user.name} logged out`);
      }
      pb.authStore.clear();
      await clearLegacyIdentity();
      await db.transaction('rw', [
        db.members, db.departments, db.sections, db.cellGroups,
        db.cellMeetings, db.cellAttendance, db.cellVisitors, db.cellReports,
        db.trainings, db.trainingSessions, db.trainingEnrollments,
        db.trainingAttendance, db.trainingCertificates
      ], async () => {
        await Promise.all([
          db.members.filter((record) => Boolean(record.remoteId)).delete(),
          db.departments.filter((record) => Boolean(record.remoteId)).delete(),
          db.sections.filter((record) => Boolean(record.remoteId)).delete(),
          db.cellGroups.filter((record) => Boolean(record.remoteId)).delete(),
          db.cellMeetings.filter((record) => record.syncStatus === 'synced').delete(),
          db.cellAttendance.filter((record) => record.syncStatus === 'synced').delete(),
          db.cellVisitors.filter((record) => record.syncStatus === 'synced').delete(),
          db.cellReports.filter((record) => record.syncStatus === 'synced').delete(),
          db.trainings.filter((record) => record.syncStatus === 'synced').delete(),
          db.trainingSessions.filter((record) => record.syncStatus === 'synced').delete(),
          db.trainingEnrollments.filter((record) => record.syncStatus === 'synced').delete(),
          db.trainingAttendance.filter((record) => record.syncStatus === 'synced').delete(),
          db.trainingCertificates.filter((record) => record.syncStatus === 'synced').delete()
        ]);
      });
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  const updateUserBadge = useCallback((count: number) => {
    if ('setAppBadge' in navigator) {
      (navigator as Navigator & { setAppBadge: (value: number) => Promise<void> })
        .setAppBadge(count)
        .catch(console.error);
    }
  }, []);

  return (
    <PocketBaseContext.Provider
      value={{ pb, user, isLoading, isConfigured: isPocketBaseConfigured, login, logout, updateUserBadge }}
    >
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
