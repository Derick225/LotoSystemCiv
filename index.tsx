
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Capture globale de l'événement d'installation PWA le plus tôt possible
(window as any).deferredPWAInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  (window as any).deferredPWAInstallPrompt = e;
  window.dispatchEvent(new Event('pwa-prompt-ready'));
});

// Fonction de détection d'environnement ultra-sécurisée
const getIsDev = () => {
  try {
    // Vérification explicite de chaque niveau pour éviter "reading 'DEV' of undefined"
    if (typeof import.meta !== 'undefined' && import.meta && import.meta.env) {
      return import.meta.env.DEV;
    }
    return false;
  } catch (e) {
    return false;
  }
};

const isDev = getIsDev();

if ('serviceWorker' in navigator && !isDev) {
  window.addEventListener('load', async () => {
    try {
        // Utilisation d'un chemin relatif et gestion d'erreur silencieuse
        const registration = await navigator.serviceWorker.register('./service-worker.js', { scope: './' });
        console.log('Nexus Engine SW: Registered', registration.scope);
    } catch (error: any) {
        const msg = error?.message || String(error);
        // Filtrage strict des erreurs d'origine (fréquentes dans les previews cloud)
        if (!msg.includes('origin') && !msg.includes('scriptURL') && !msg.includes('import scripts')) {
            console.warn('Nexus Engine SW: Failed', error);
        }
    }
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
