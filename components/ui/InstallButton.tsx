import React, { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { audioEngine } from '../../utils/audioEngine';

export const InstallButton: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>((window as any).deferredPWAInstallPrompt || null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;
    setIsStandalone(isStandaloneMode);

    const checkIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(checkIOS);

    const handlePromptReady = () => {
        setDeferredPrompt((window as any).deferredPWAInstallPrompt);
    };

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      (window as any).deferredPWAInstallPrompt = e;
    };

    window.addEventListener('pwa-prompt-ready', handlePromptReady);
    window.addEventListener('beforeinstallprompt', handler);
    
    return () => {
        window.removeEventListener('pwa-prompt-ready', handlePromptReady);
        window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstallClick = async () => {
    audioEngine.play('click');
    
    const promptToUse = deferredPrompt || (window as any).deferredPWAInstallPrompt;
    
    if (isIOS || !promptToUse) {
        // Dispatch custom event to show the InstallPrompt modal with instructions
        window.dispatchEvent(new CustomEvent('show-install-prompt'));
        return;
    }

    try {
        promptToUse.prompt();
        const { outcome } = await promptToUse.userChoice;
        
        if (outcome === 'accepted') {
          setDeferredPrompt(null);
          (window as any).deferredPWAInstallPrompt = null;
          audioEngine.play('success');
        }
    } catch (err) {
        console.error("Erreur lors de l'installation:", err);
        window.dispatchEvent(new CustomEvent('show-install-prompt'));
    }
  };

  if (isStandalone) return null;

  return (
    <button 
        onClick={handleInstallClick} 
        className="flex items-center gap-2 px-3 md:px-4 py-2 md:py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg md:rounded-xl font-black text-[9px] md:text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-500/20 transition-all active:scale-95"
        title="Installer l'application"
    >
        <Download size={14} /> <span className="hidden md:inline">Installer</span>
    </button>
  );
};
