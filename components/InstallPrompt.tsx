
import React, { useEffect, useState } from 'react';
import { Download, Share, PlusSquare, X, Smartphone, ShieldCheck } from 'lucide-react';
import { audioEngine } from '../utils/audioEngine';

export const InstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

    useEffect(() => {
    // Détection si l'app est déjà installée
    const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;
    setIsStandalone(isStandaloneMode);

    if (isStandaloneMode) return;

    // Détection iOS
    const checkIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    
    if (checkIOS) {
        setIsIOS(true);
        // On montre le guide iOS une seule fois par session
        if (!localStorage.getItem('nexus_install_dismissed')) {
            setTimeout(() => setIsVisible(true), 3000);
        }
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      if (!localStorage.getItem('nexus_install_dismissed')) {
          setIsVisible(true);
      }
    };

    const forceShowHandler = () => {
        setIsVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('show-install-prompt', forceShowHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('show-install-prompt', forceShowHandler);
    };
  }, []);

  const handleInstallClick = async () => {
    audioEngine.play('click');
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setIsVisible(false);
      audioEngine.play('success');
    }
  };

  const handleDismiss = () => {
      setIsVisible(false);
      localStorage.setItem('nexus_install_dismissed', 'true');
  };

  if (!isVisible || isStandalone) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] p-4 md:p-6 animate-slide-up">
        <div className="max-w-md mx-auto bg-slate-900/95 backdrop-blur-xl border border-indigo-500/30 rounded-[2rem] shadow-2xl p-6 relative overflow-hidden">
            {/* Background Glow */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-600/20 rounded-full blur-[50px] -mr-10 -mt-10"></div>
            
            <button 
                onClick={handleDismiss} 
                className="absolute top-4 right-4 p-2 text-slate-500 hover:text-white transition-colors"
            >
                <X size={18} />
            </button>

            <div className="flex gap-5 items-start">
                <div className="w-14 h-14 bg-gradient-to-br from-indigo-600 to-violet-700 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-600/20 shrink-0">
                    <Smartphone className="text-white" size={28} />
                </div>
                <div>
                    <h3 className="text-lg font-black text-white leading-tight">Installer NexusPro</h3>
                    <p className="text-xs text-slate-400 mt-1 font-medium leading-relaxed">
                        Accédez au moteur prédictif en mode natif : performances maximales, plein écran et accès hors-ligne.
                    </p>
                </div>
            </div>

            <div className="mt-6">
                {isIOS ? (
                    <div className="bg-slate-800/50 rounded-2xl p-4 border border-white/5 space-y-3">
                        <div className="flex items-center gap-3 text-xs text-slate-300">
                            <span className="w-6 h-6 flex items-center justify-center bg-slate-700 rounded-full font-bold shrink-0">1</span>
                            <span>Appuyez sur <span className="font-bold text-white"><Share size={12} className="inline mx-1"/> Partager</span></span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-300">
                            <span className="w-6 h-6 flex items-center justify-center bg-slate-700 rounded-full font-bold shrink-0">2</span>
                            <span>Sélectionnez <span className="font-bold text-white"><PlusSquare size={12} className="inline mx-1"/> Sur l'écran d'accueil</span></span>
                        </div>
                    </div>
                ) : (
                    <button 
                        onClick={handleInstallClick}
                        className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg flex items-center justify-center gap-3 transition-all active:scale-95"
                    >
                        <Download size={16} /> Installer l'Application
                    </button>
                )}
            </div>
            
            <div className="mt-4 flex items-center justify-center gap-2 text-[9px] font-bold text-emerald-500 uppercase tracking-widest">
                <ShieldCheck size={12} /> Sécurisé & Vérifié
            </div>
        </div>
    </div>
  );
};
