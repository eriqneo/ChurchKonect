import React, { useEffect, useState } from 'react';
import { MobileLayout } from './components/layout/MobileLayout';
import { seedDatabase } from './lib/db/seedData';
import { useAuth } from './lib/db/PocketBaseProvider';
import { LoginScreen } from './components/shared/LoginScreen';

export default function App() {
  const [isInitializing, setIsInitializing] = useState(true);
  const { user, isLoading: isAuthLoading } = useAuth();

  useEffect(() => {
    async function init() {
      try {
        await seedDatabase();
      } catch (err) {
        console.error('Error during database initialization:', err);
      } finally {
        setIsInitializing(false);
      }
    }
    init();
  }, []);

  if (isInitializing || isAuthLoading) {
    return (
      <div className="h-[100dvh] bg-theme-bg flex flex-col items-center justify-center text-theme-text font-sans p-6 text-center transition-colors">
        <div className="w-12 h-12 rounded-full border-4 border-gold-500/20 border-t-gold-500 animate-spin mb-4" />
        <h2 className="text-sm font-bold tracking-widest text-gold-500 uppercase">Sanctuary Data Layer</h2>
        <p className="text-xs text-text-muted mt-2">Initializing resilient local-first store...</p>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return <MobileLayout />;
}
