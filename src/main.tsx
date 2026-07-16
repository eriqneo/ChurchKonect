import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './globals.css';
import { ThemeProvider } from './lib/theme/ThemeProvider.tsx';
import { ToastProvider } from './components/shared/toast/ToastProvider.tsx';
import { ErrorBoundary } from './components/shared/ErrorBoundary.tsx';
import { PocketBaseProvider } from './lib/db/PocketBaseProvider.tsx';
import { registerServiceWorker } from './lib/notifications/pwaService.ts';

// Register service worker for Progressive Web App (PWA) offline and badge support
registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PocketBaseProvider>
      <ThemeProvider>
        <ErrorBoundary>
          <ToastProvider>
            <App />
          </ToastProvider>
        </ErrorBoundary>
      </ThemeProvider>
    </PocketBaseProvider>
  </StrictMode>,
);


