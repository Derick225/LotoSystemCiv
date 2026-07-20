
import React from 'react';
import ReactDOM from 'react-dom/client';

// Self-hosted fonts via Fontsource (removes external CDN dependency and improves FCP)
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/800.css";
import "@fontsource/inter/900.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";

import App from './App';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

// Capture globale de l'événement d'installation PWA le plus tôt possible
window.deferredPWAInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.deferredPWAInstallPrompt = e as BeforeInstallPromptEvent;
  window.dispatchEvent(new Event('pwa-prompt-ready'));
});

// Register PWA service worker
const updateSW = registerSW({
  onNeedRefresh() {
    try {
      if (typeof window !== 'undefined' && window.confirm && window.confirm('Une nouvelle version est disponible. Recharger ?')) {
        updateSW(true);
      }
    } catch (e) {
      console.warn("PWA update confirmation skipped due to frame sandbox restrictions", e);
    }
  },
  onOfflineReady() {
    console.log('Nexus Engine SW: Ready for offline use');
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
