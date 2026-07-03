
import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { NexusProvider } from './components/NexusProvider';
import { useNexusStore } from './store/useNexusStore';
import { useAuth } from './hooks/useAuth';
import { useRealtimeSync } from './hooks/useRealtimeSync';
import { AppShell, ViewMode } from './components/layout/AppShell';
import { GlobalErrorBoundary } from './components/ui/GlobalErrorBoundary';
import { GlobalErrorListener } from './components/GlobalErrorListener';
import { ToastProvider, useToast } from './components/ui/Toast';
import { BootSequence } from './components/intro/BootSequence';
import { TutorialOverlay } from './components/ui/TutorialOverlay';
import { InstallPrompt } from './components/InstallPrompt';
import { AuthScreen } from './components/auth/AuthScreen';
import { ResetPasswordScreen } from './components/auth/ResetPasswordScreen';
import { SubscriptionWall } from './components/auth/SubscriptionWall';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { queryClient, idbPersister } from './services/queryClient';
import { audioEngine } from './utils/audioEngine';
import { authService } from './services/authService';
import { getSettings, saveSettings } from './services/userPreferencesService';
import { GlobalNumberHUD } from './components/ui/GlobalNumberHUD';
import { ShieldAlert, Lock, ArrowLeft, Loader2 } from 'lucide-react';
import type { Draw } from './types';
import { ALL_DRAWS } from './constants';

import { motion, AnimatePresence } from 'framer-motion';

// Lazy loading des composants lourds pour optimiser le TTI (Time To Interactive)
const GlobalDashboard = lazy(() => import('./components/GlobalDashboard').then(m => ({ default: m.GlobalDashboard })));
const DrawDetails = lazy(() => import('./components/DrawDetails').then(m => ({ default: m.DrawDetails })));
const AdminPanel = lazy(() => import('./components/admin/AdminPanel').then(m => ({ default: m.AdminPanel })));
const UserWallet = lazy(() => import('./components/UserWallet').then(m => ({ default: m.UserWallet })));

// Composant de sécurité pour les accès non autorisés
const AccessDenied: React.FC<{ onBack: () => void }> = ({ onBack }) => (
  <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center animate-scale-in">
    <div className="w-24 h-24 bg-rose-500/10 rounded-full flex items-center justify-center mb-6 border border-rose-500/20 shadow-[0_0_30px_rgba(244,63,94,0.2)]">
      <ShieldAlert size={48} className="text-rose-500 animate-pulse" />
    </div>
    <h2 className="text-3xl font-black text-white uppercase tracking-tighter mb-2">Accès Restreint</h2>
    <p className="text-slate-400 max-w-md mb-8 font-medium">
      Votre signature neurale ne dispose pas des privilèges d'administration requis (Niveau 5). 
      Cette tentative a été journalisée.
    </p>
    
    <div className="flex flex-col gap-4 w-full max-w-xs">
      <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 flex items-center gap-4 opacity-70">
        <Lock size={20} className="text-slate-500" />
        <div className="text-left">
          <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Protocole Sécurité</div>
          <div className="text-xs text-slate-300 font-mono">LOCKDOWN_MODE_ACTIVE</div>
        </div>
      </div>
      
      <button 
        onClick={() => { audioEngine.play('click'); onBack(); }}
        className="w-full py-4 bg-white text-slate-900 hover:bg-indigo-50 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg hover:animate-pulse"
      >
        <ArrowLeft size={16} /> Retour Station
      </button>
    </div>
  </div>
);

// Composant Interne qui a accès au contexte Nexus et Auth
const AppContent: React.FC = () => {
  const setDrawName = useNexusStore(state => state.setDrawName);
  const refreshData = useNexusStore(state => state.refreshData);
  const initializeStore = useNexusStore(state => state.initialize);
  const { showToast } = useToast();
  
  const { session, isAdmin, loading: authLoading, subscription, refreshSubscription } = useAuth();
  
  const [isBooted, setIsBooted] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  useEffect(() => {
    initializeStore();
  }, [initializeStore]);

  const [viewMode, setViewMode] = useState<ViewMode>('home');
  const [selectedDraw, setSelectedDraw] = useState<Draw | null>(null);
  const [showWallet, setShowWallet] = useState(false);

  // Global Cross-Navigation Hub
  useEffect(() => {
    const handleGlobalNavigation = (e: Event) => {
      const customEvent = e as CustomEvent;
      const { view, mainTab, subTab, drawName } = customEvent.detail || {};
      
      if (view === 'admin') {
        setViewMode('admin');
        setSelectedDraw(null);
        setShowWallet(false);
      } else if (view === 'home') {
        if (drawName) {
          const foundDraw = ALL_DRAWS.find(d => d.name.toLowerCase() === drawName.toLowerCase());
          if (foundDraw) {
            setSelectedDraw(foundDraw);
            setDrawName(foundDraw.name);
            refreshData(foundDraw.name, true);
          }
        } else {
          setSelectedDraw(null);
        }
        setViewMode('home');
        setShowWallet(false);
      }

      if (mainTab) {
        // Enregistrer la navigation de sous-module dans le store
        useNexusStore.getState().navigateToModule(mainTab, subTab);
      }
    };

    window.addEventListener("CROSS_MODULE_NAVIGATE", handleGlobalNavigation);
    return () => window.removeEventListener("CROSS_MODULE_NAVIGATE", handleGlobalNavigation);
  }, [setDrawName, refreshData]);
  
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
      const s = getSettings();
      return s.theme !== 'system' ? s.theme : 'dark';
  });

  useEffect(() => {
    const savedSettings = getSettings();
    audioEngine.setEnabled(savedSettings.sound);
    if (savedSettings.theme !== 'system') setTheme(savedSettings.theme);

    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success') {
        showToast("Paiement confirmé ! Abonnement activé.", "success");
        audioEngine.play('success');
        window.history.replaceState({}, document.title, window.location.pathname);
    } else if (params.get('payment') === 'cancel') {
        showToast("Paiement annulé.", "info");
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Check for password reset hash
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    if (hashParams.get('type') === 'recovery' || params.get('reset') === 'true') {
        setIsResettingPassword(true);
        window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [showToast]);

  useRealtimeSync();

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    const current = getSettings();
    if (current.theme !== theme) {
        saveSettings({ ...current, theme });
    }
  }, [theme]);

  const handleSelectDraw = useCallback((draw: Draw) => {
    audioEngine.play('click');
    setDrawName(draw.name);
    refreshData(draw.name, true);
    setSelectedDraw(draw);
    setViewMode('home');
    setShowWallet(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [setDrawName, refreshData]);

  const handleReset = useCallback(() => {
    audioEngine.play('click');
    setSelectedDraw(null);
    setViewMode('home');
    setShowWallet(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleLogout = async () => {
    await authService.logout();
    showToast("Déconnexion réussie", "info");
  };

  const handlePaymentSuccess = async () => {
      // Callback local immédiat (optimiste)
      await refreshSubscription();
  };

  if (authLoading) return <div className="min-h-screen bg-nexus-950 flex items-center justify-center text-indigo-500 animate-pulse font-black tracking-widest">INITIALISATION SECURE...</div>;
  
  if (isResettingPassword) {
    return <ResetPasswordScreen onSuccess={() => setIsResettingPassword(false)} />;
  }

  if (!session) {
    return <AuthScreen onSuccess={() => {}} />;
  }

  if (!isAdmin && subscription?.status === 'expired') {
      return <SubscriptionWall userId={session.user.id} onPaymentSuccess={handlePaymentSuccess} onLogout={handleLogout} />;
  }

  if (!isBooted) {
    return <BootSequence onComplete={() => setIsBooted(true)} />;
  }

    const renderContent = () => {
    let content;
    let key;
    if (showWallet) { content = <UserWallet />; key = 'wallet'; }
    else if (selectedDraw) { content = <DrawDetails />; key = 'draw'; }
    else {
        switch (viewMode) {
          case 'home': content = <GlobalDashboard onSelectDraw={handleSelectDraw} />; key = 'home'; break;
          case 'admin': content = isAdmin ? <AdminPanel /> : <AccessDenied onBack={() => setViewMode('home')} />; key = 'admin'; break;
          default: content = <GlobalDashboard onSelectDraw={handleSelectDraw} />; key = 'home'; break;
        }
    }
    
    return (
        <AnimatePresence mode="wait">
            <motion.div
                key={key}
                initial={{ opacity: 0, x: -20, filter: 'blur(10px)' }}
                animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, x: 20, filter: 'blur(10px)' }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
            >
                <Suspense fallback={<div className="flex items-center justify-center min-h-[50vh]"><Loader2 className="w-8 h-8 text-indigo-500 animate-spin" /></div>}>
                    {content}
                </Suspense>
            </motion.div>
        </AnimatePresence>
    );
  };

  return (
    <>
      <GlobalErrorListener />
      <AppShell 
        viewMode={viewMode} 
        setViewMode={(mode) => { 
            audioEngine.play('click');
            if (mode === 'admin' && !isAdmin) {
                showToast("Accès refusé : Privilèges Admin requis.", "error");
                audioEngine.play('error');
                return;
            }
            setViewMode(mode); 
            setSelectedDraw(null); 
            setShowWallet(false); 
        }}
        theme={theme}
        setTheme={setTheme} 
        onReset={handleReset}
        showWallet={showWallet}
        setShowWallet={(show) => { audioEngine.play('click'); setShowWallet(show); }}
        isDrawSelected={!!selectedDraw}
        isAdmin={isAdmin}
        onLogout={handleLogout}
      >
        {renderContent()}
      </AppShell>
      <GlobalNumberHUD />
      <TutorialOverlay />
      <InstallPrompt />
    </>
  );
};

export default function App() {
  return (
    <PersistQueryClientProvider 
      client={queryClient} 
      persistOptions={{ persister: idbPersister, maxAge: 1000 * 60 * 60 * 24 * 7 }}
    >
      <GlobalErrorBoundary>
        <ToastProvider>
          <NexusProvider>
            <AppContent />
          </NexusProvider>
        </ToastProvider>
      </GlobalErrorBoundary>
    </PersistQueryClientProvider>
  );
}
