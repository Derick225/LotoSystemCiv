
import React, { useState, useEffect, useCallback } from 'react';
import { NexusProvider, useNexus } from './components/NexusProvider';
import { GlobalDashboard } from './components/GlobalDashboard';
import { DrawDetails } from './components/DrawDetails';
import { AdminPanel } from './components/admin/AdminPanel';
import { QuantumLab } from './components/QuantumLab';
import { AppShell, ViewMode } from './components/layout/AppShell';
import { UserWallet } from './components/UserWallet';
import { GlobalErrorBoundary } from './components/ui/GlobalErrorBoundary';
import { GlobalErrorListener } from './components/GlobalErrorListener';
import { ToastProvider, useToast } from './components/ui/Toast';
import { BootSequence } from './components/intro/BootSequence';
import { TutorialOverlay } from './components/ui/TutorialOverlay';
import { InstallPrompt } from './components/InstallPrompt';
import { AuthScreen } from './components/auth/AuthScreen';
import { SubscriptionWall } from './components/auth/SubscriptionWall';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './services/queryClient';
import { audioEngine } from './utils/audioEngine';
import { authService } from './services/authService';
import { checkSubscriptionStatus } from './services/subscriptionService';
import { supabase, isSupabaseConfigured } from './services/supabaseClient';
import type { Draw, SubscriptionState } from './types';

// Composant Interne qui a accès au contexte Nexus et Auth
const AppContent: React.FC = () => {
  const { setDrawName, refreshData } = useNexus();
  const { showToast } = useToast();
  
  const [session, setSession] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionState | null>(null);
  const [subLoading, setSubLoading] = useState(false);

  const [isBooted, setIsBooted] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('home');
  const [selectedDraw, setSelectedDraw] = useState<Draw | null>(null);
  const [showWallet, setShowWallet] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  // Gestion de l'authentification initiale et abonnement
  useEffect(() => {
    const checkAuthAndSub = async () => {
      setAuthLoading(true);
      if (!isSupabaseConfigured()) {
        // Mode hors ligne / démo : on laisse passer mais sans admin
        setSession({ user: { id: 'demo', email: 'demo@offline.local' } });
        setSubscription({ status: 'active', daysLeft: 30, expiresAt: '', plan: 'premium' });
        setAuthLoading(false);
        return;
      }

      const currentSession = await authService.getSession();
      setSession(currentSession);
      
      if (currentSession?.user) {
        const adminStatus = authService.isAdminUser(currentSession.user);
        setIsAdmin(adminStatus);
        
        // Si admin, pas besoin de check abonnement (illimité)
        if (adminStatus) {
            setSubscription({ status: 'active', daysLeft: 999, expiresAt: '', plan: 'premium' });
        } else {
            setSubLoading(true);
            const subState = await checkSubscriptionStatus(currentSession.user.id);
            setSubscription(subState);
            setSubLoading(false);
        }
      }
      setAuthLoading(false);

      const { data: { subscription: authListener } } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
        setSession(newSession);
        if (newSession?.user) {
          const adminStatus = authService.isAdminUser(newSession.user);
          setIsAdmin(adminStatus);
          
          if (adminStatus) {
             setSubscription({ status: 'active', daysLeft: 999, expiresAt: '', plan: 'premium' });
          } else {
             const subState = await checkSubscriptionStatus(newSession.user.id);
             setSubscription(subState);
          }
        } else {
          setIsAdmin(false);
          setSubscription(null);
        }
      });

      return () => authListener.unsubscribe();
    };

    checkAuthAndSub();
  }, []);

  // Sync theme with DOM
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
  }, [theme]);

  const handleSelectDraw = useCallback((draw: Draw) => {
    audioEngine.play('click');
    setDrawName(draw.name);
    refreshData(draw.name);
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
    setSession(null);
    setIsAdmin(false);
    setSubscription(null);
    showToast("Déconnexion réussie", "info");
  };

  const handlePaymentSuccess = async () => {
      if (session?.user) {
          const subState = await checkSubscriptionStatus(session.user.id);
          setSubscription(subState);
      }
  };

  // Si on charge l'auth
  if (authLoading) return <div className="min-h-screen bg-nexus-950 flex items-center justify-center text-indigo-500 animate-pulse font-black tracking-widest">INITIALISATION SECURE...</div>;
  
  if (!session) {
    return <AuthScreen onSuccess={() => { /* Le listener onAuthStateChange gérera le state */ }} />;
  }

  // Vérification Abonnement (Mur de Paiement)
  if (!isAdmin && subscription?.status === 'expired') {
      return <SubscriptionWall userId={session.user.id} onPaymentSuccess={handlePaymentSuccess} onLogout={handleLogout} />;
  }

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
      case 'admin': 
        // Protection de route simple
        return isAdmin ? <AdminPanel /> : <div className="p-10 text-center text-rose-500 font-black">ACCÈS REFUSÉ</div>;
      default: return <GlobalDashboard onSelectDraw={handleSelectDraw} />;
    }
  };

  return (
    <>
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
        isAdmin={isAdmin}
        onLogout={handleLogout}
      >
        {renderContent()}
      </AppShell>
      <TutorialOverlay />
      <InstallPrompt />
    </>
  );
};

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <GlobalErrorBoundary>
        <ToastProvider>
          <NexusProvider>
            <AppContent />
          </NexusProvider>
        </ToastProvider>
      </GlobalErrorBoundary>
    </QueryClientProvider>
  );
}
