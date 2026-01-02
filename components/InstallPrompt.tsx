import React, { useEffect, useState } from 'react';

export const InstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Détection iOS (car iOS ne supporte pas beforeinstallprompt)
    const checkIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;
    
    if (checkIOS && !isStandalone) {
        setIsIOS(true);
        // On montre le guide iOS une seule fois par session
        if (!sessionStorage.getItem('iosPromptShown')) {
            setIsVisible(true);
            sessionStorage.setItem('iosPromptShown', 'true');
        }
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-white dark:bg-gray-800 p-4 rounded-xl shadow-2xl border border-indigo-100 dark:border-indigo-900 z-50 animate-slide-up flex flex-col gap-3">
      <div className="flex justify-between items-start">
        <div className="flex gap-3">
            <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center text-2xl shadow-lg text-white">
                📱
            </div>
            <div>
                <h3 className="font-bold text-gray-900 dark:text-white">Installer l'Application</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {isIOS 
                        ? "Pour une meilleure expérience sur iPhone."
                        : "Accédez à vos tirages plus vite et hors ligne."
                    }
                </p>
            </div>
        </div>
        <button onClick={() => setIsVisible(false)} className="text-gray-400 hover:text-gray-600">✕</button>
      </div>

      {isIOS ? (
          <div className="text-sm bg-gray-100 dark:bg-gray-700 p-3 rounded-lg">
              Appuyez sur <span className="font-bold">Partager</span> ⎋ puis sur <span className="font-bold">"Sur l'écran d'accueil"</span> ➕.
          </div>
      ) : (
          <button 
            onClick={handleInstallClick}
            className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold text-sm transition shadow-md"
          >
            Installer maintenant
          </button>
      )}
    </div>
  );
};