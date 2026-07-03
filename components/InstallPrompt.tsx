
import React, { useEffect, useState } from 'react';
import { Download, Share, PlusSquare, X, Smartphone, ShieldCheck, MoreVertical } from 'lucide-react';
import { audioEngine } from '../utils/audioEngine';
import { logError, AppError } from '../utils/AppError';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

declare global {
    interface Window {
        deferredPWAInstallPrompt?: BeforeInstallPromptEvent | null;
    }
    interface Navigator {
        standalone?: boolean;
    }
}

export const InstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(window.deferredPWAInstallPrompt || null);
  const [isVisible, setIsVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if app is installed
    const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || !!navigator.standalone;
    setIsStandalone(isStandaloneMode);

    if (isStandaloneMode) return;

    // Detect iOS + Safari
    const isAppleDevice = /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document;
    setIsIOS(isAppleDevice);

    // Provide default iOS popup logic if prompt doesn't fire natively
    if (isAppleDevice && !localStorage.getItem('nexus_install_dismissed')) {
        setTimeout(() => setIsVisible(true), 3000);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      setDeferredPrompt(promptEvent);
      window.deferredPWAInstallPrompt = promptEvent;
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
    const promptToUse = deferredPrompt || window.deferredPWAInstallPrompt;
    
    if (!promptToUse) return;

    try {
        promptToUse.prompt();
        const { outcome } = await promptToUse.userChoice;
        
        if (outcome === 'accepted') {
          setDeferredPrompt(null);
          window.deferredPWAInstallPrompt = undefined;
          setIsVisible(false);
          audioEngine.play('success');
        }
    } catch (err: unknown) {
        logError(new AppError("Erreur d'installation PWA", "PWA_INSTALL_ERROR", "low", { error: err }));
    }
  };

  const handleDismiss = () => {
      setIsVisible(false);
      localStorage.setItem('nexus_install_dismissed', 'true');
  };

  if (!isVisible || isStandalone) return null;

  const promptToUse = deferredPrompt || window.deferredPWAInstallPrompt;

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
                    <Download className="text-white" size={28} />
                </div>
                <div>
                    <h3 className="text-lg font-black text-white leading-tight">Installer LotoPro</h3>
                    <p className="text-xs text-slate-400 mt-1 font-medium leading-relaxed">
                        Accédez au moteur prédictif en mode natif : performances maximales, interface immersive et absence de barre d'adresse.
                    </p>
                </div>
            </div>

            <div className="mt-6">
                {isIOS ? (
                    <div className="bg-slate-800/50 rounded-2xl p-4 border border-white/5 space-y-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400 mb-1">Configuration Safari/iOS</p>
                        <div className="flex items-center gap-3 text-xs text-slate-300">
                            <span className="w-6 h-6 flex items-center justify-center bg-slate-700 rounded-full font-bold shrink-0">1</span>
                            <span>Appuyez sur l'icône <span className="font-bold text-white inline-flex items-center gap-1 bg-white/10 px-2 py-0.5 rounded ml-1"><Share size={12}/> Partager</span></span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-300">
                            <span className="w-6 h-6 flex items-center justify-center bg-slate-700 rounded-full font-bold shrink-0">2</span>
                            <span>Sélectionnez <span className="font-bold text-white inline-flex items-center gap-1 bg-white/10 px-2 py-0.5 rounded ml-1"><PlusSquare size={12}/> "Sur l'écran d'accueil"</span></span>
                        </div>
                    </div>
                ) : !promptToUse ? (
                    <div className="bg-slate-800/50 rounded-2xl p-4 border border-white/5 space-y-3">
                         <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400 mb-1">Configuration Navigateur</p>
                        <div className="flex items-center gap-3 text-xs text-slate-300">
                            <span className="w-6 h-6 flex items-center justify-center bg-slate-700 rounded-full font-bold shrink-0">1</span>
                            <span>Ouvrez le menu <span className="font-bold text-white inline-flex items-center gap-1 bg-white/10 px-2 py-0.5 rounded ml-1"><MoreVertical size={12}/> d'options</span></span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-300">
                            <span className="w-6 h-6 flex items-center justify-center bg-slate-700 rounded-full font-bold shrink-0">2</span>
                            <span>Choisissez <span className="font-black text-white">"Installer"</span> ou <span className="font-black text-white">"Ajouter à l'écran d'accueil"</span></span>
                        </div>
                    </div>
                ) : (
                    <button 
                        onClick={handleInstallClick}
                        className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-[0_4px_20px_rgba(79,70,229,0.4)] flex items-center justify-center gap-3 transition-all active:scale-95 group"
                    >
                        <Smartphone size={18} className="group-hover:animate-bounce" /> Installer la Station LotoPro
                    </button>
                )}
            </div>
            
            <div className="mt-4 flex items-center justify-center gap-2 text-xs font-bold text-emerald-500 uppercase tracking-widest">
                <ShieldCheck size={12} /> Sécurisé & Vérifié
            </div>
        </div>
    </div>
  );
};
