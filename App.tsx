
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
import { supabase } from './services/supabaseClient';
import { ShieldAlert, Lock, Fingerprint, ArrowLeft } from 'lucide-react';
import type { Draw, SubscriptionState } from './types';

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
        onClick={onBack}
        className="w-full py-4 bg-white text-slate-900 hover:bg-indigo-50 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg"
      >
        <ArrowLeft size={16} /> Retour Station
      </button>
    </div>
  </div>
);

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
      
      // Note: On ne force plus le mode démo ici si la config manque.
      // On laisse AuthScreen afficher l'erreur de config pour aider le debug.
      
      const currentSession = await authService.getSession();
      setSession(currentSession);
      
      if (currentSession?.user) {
        const adminStatus = authService.isAdminUser(currentSession.user);
        setIsAdmin(adminStatus);
        
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

  // Vérification Abonnement (Mur de Paiement) - Bypass pour Admin
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
        // Protection de route stricte : Seul l'admin peut voir ce composant
        return isAdmin ? <AdminPanel /> : <AccessDenied onBack={() => setViewMode('home')} />;
      default: return <GlobalDashboard onSelectDraw={handleSelectDraw} />;
    }
  };

  return (
    <>
      <GlobalErrorListener />
      <AppShell 
        viewMode={viewMode} 
        setViewMode={(mode) => { 
            // Interception si tentative d'accès Admin sans droits
            if (mode === 'admin' && !isAdmin) {
                showToast("Accès refusé : Privilèges Admin requis.", "error");
                return;
            }
            setViewMode(mode); 
            setSelectedDraw(null); 
            setShowWallet(false); 
        }}
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
