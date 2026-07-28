import React, { useState, useEffect } from "react";
import { Download } from "lucide-react";
import { audioEngine } from "../../utils/audioEngine";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: Array<string>;
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export const InstallButton: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed
    const isStandaloneMode =
      window.matchMedia("(display-mode: standalone)").matches ||
      !!(navigator as typeof navigator & { standalone?: boolean }).standalone;
    setIsInstalled(isStandaloneMode);

    if (isStandaloneMode) return;

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const pwaEvent = e as BeforeInstallPromptEvent;
      setDeferredPrompt(pwaEvent);
      window.deferredPWAInstallPrompt = pwaEvent;
    };

    // Check if already captured by index.tsx
    if (window.deferredPWAInstallPrompt) {
      setDeferredPrompt(window.deferredPWAInstallPrompt);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    const handlePwaReady = () => {
      if (window.deferredPWAInstallPrompt) {
        setDeferredPrompt(window.deferredPWAInstallPrompt);
      }
    };
    window.addEventListener("pwa-prompt-ready", handlePwaReady);

    window.addEventListener("appinstalled", () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      window.deferredPWAInstallPrompt = null;
    });

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
      window.removeEventListener("pwa-prompt-ready", handlePwaReady);
    };
  }, []);

  const handleInstallClick = async () => {
    audioEngine.play("click");
    const promptToUse = deferredPrompt || window.deferredPWAInstallPrompt;

    if (!promptToUse) {
      alert(
        "L'installation n'est pas encore prête ou votre navigateur ne la supporte pas directement.",
      );
      return;
    }

    promptToUse.prompt();
    const { outcome } = await promptToUse.userChoice;

    if (outcome === "accepted") {
      setIsInstalled(true);
      setDeferredPrompt(null);
      window.deferredPWAInstallPrompt = null;
    }
  };

  if (isInstalled || !deferredPrompt) return null;

  return (
    <button
      onClick={handleInstallClick}
      className="flex items-center gap-1 sm:gap-2 px-2.5 sm:px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold rounded-lg md:rounded-xl shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all text-xs"
    >
      <Download className="w-4 h-4" />
      <span className="hidden sm:inline">Installer l'App</span>
    </button>
  );
};
