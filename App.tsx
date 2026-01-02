import React, { useState, useEffect, useCallback } from 'react';
import { NexusProvider } from './components/NexusProvider';
import { GlobalDashboard } from './components/GlobalDashboard';
import { DrawDetails } from './components/DrawDetails';
import { AdminPanel } from './components/admin/AdminPanel';
import { QuantumLab } from './components/QuantumLab';
import { AppShell, ViewMode } from './components/layout/AppShell';
import { UserWallet } from './components/UserWallet';
import { GlobalErrorBoundary } from './components/ui/GlobalErrorBoundary';
import { GlobalErrorListener } from './components/GlobalErrorListener';
import { ToastProvider } from './components/ui/Toast';
import { BootSequence } from './components/intro/BootSequence';
import { TutorialOverlay } from './components/ui/TutorialOverlay';
import { InstallPrompt } from './components/InstallPrompt';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './services/queryClient';
import { audioEngine } from './utils/audioEngine';
import type { Draw } from './types';

export default function App() {
  const [isBooted, setIsBooted] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('home');
  const [selectedDraw, setSelectedDraw] = useState<Draw | null>(null);
  const [showWallet, setShowWallet] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  // Sync theme with DOM
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
  }, [theme]);

  const handleSelectDraw = useCallback((draw: Draw) => {
    audioEngine.play('click');
    setSelectedDraw(draw);
    setViewMode('home');
    setShowWallet(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleReset = useCallback(() => {
    audioEngine.play('click');
    setSelectedDraw(null);
    setViewMode('home');
    setShowWallet(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  if (!isBooted) {
    return <BootSequence onComplete={() => setIsBooted(true)} />;
  }

  const renderContent = () => {
    if (showWallet) return <UserWallet />;
    
    if (selectedDraw) {
      return <DrawDetails />;
    }

    switch (viewMode) {
      case 'home': return <GlobalDashboard onSelectDraw={handleSelectDraw} />;
      case 'lab': return <QuantumLab />;
      case 'admin': return <AdminPanel />;
      default: return <GlobalDashboard onSelectDraw={handleSelectDraw} />;
    }
  };

  return (
    <QueryClientProvider client={queryClient}>
      <GlobalErrorBoundary>
        <ToastProvider>
          <NexusProvider>
            <GlobalErrorListener />
            <AppShell 
              viewMode={viewMode} 
              setViewMode={(mode) => { setViewMode(mode); setSelectedDraw(null); setShowWallet(false); }}
              theme={theme}
              setTheme={setTheme as any}
              onReset={handleReset}
              showWallet={showWallet}
              setShowWallet={setShowWallet}
              isDrawSelected={!!selectedDraw}
            >
              {renderContent()}
            </AppShell>
            
            <TutorialOverlay />
            <InstallPrompt />
          </NexusProvider>
        </ToastProvider>
      </GlobalErrorBoundary>
    </QueryClientProvider>
  );
}