import React, { createContext, useContext, useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  isDark: boolean;
}

// Native IndexedDB helper to avoid external library dependencies or polyfills
function getThemeFromIndexedDB(): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open('ThemeDatabase', 1);
      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
      request.onsuccess = (event: any) => {
        const db = event.target.result;
        try {
          const transaction = db.transaction('settings', 'readonly');
          const store = transaction.objectStore('settings');
          const getReq = store.get('theme_preference');
          getReq.onsuccess = () => {
            resolve(getReq.result ? getReq.result.value : null);
          };
          getReq.onerror = () => resolve(null);
        } catch (e) {
          resolve(null);
        }
      };
      request.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

function setThemeToIndexedDB(value: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open('ThemeDatabase', 1);
      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
      request.onsuccess = (event: any) => {
        const db = event.target.result;
        try {
          const transaction = db.transaction('settings', 'readwrite');
          const store = transaction.objectStore('settings');
          store.put({ key: 'theme_preference', value });
          transaction.oncomplete = () => resolve();
        } catch (e) {
          resolve();
        }
      };
      request.onerror = () => resolve();
    } catch (e) {
      resolve();
    }
  });
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark'); // Default to dark as primary mode

  // Load theme on mount
  useEffect(() => {
    async function loadTheme() {
      try {
        const persistedValue = await getThemeFromIndexedDB();
        if (persistedValue === 'dark' || persistedValue === 'light') {
          applyTheme(persistedValue as Theme);
        } else {
          // Fallback to system preference
          const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          const initialTheme = systemPrefersDark ? 'dark' : 'light';
          applyTheme(initialTheme);
        }
      } catch (error) {
        console.error('Failed to load theme from IndexedDB:', error);
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        applyTheme(systemPrefersDark ? 'dark' : 'light');
      }
    }

    loadTheme();
  }, []);

  const applyTheme = (newTheme: Theme) => {
    setTheme(newTheme);
    const root = document.documentElement;
    root.classList.remove('dark', 'light');
    root.classList.add(newTheme);
  };

  const toggleTheme = async () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
    try {
      await setThemeToIndexedDB(nextTheme);
    } catch (error) {
      console.error('Failed to persist theme preference:', error);
    }
  };

  const isDark = theme === 'dark';

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
