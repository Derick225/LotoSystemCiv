
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Enregistrement du Service Worker pour la PWA
// Utilisation de l'accès sécurisé pour éviter le crash si import.meta.env est indéfini
const isDev = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV;

if ('serviceWorker' in navigator && !isDev) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then((registration) => {
        console.log('Nexus Engine SW: Registered', registration.scope);
      })
      .catch((error) => {
        console.error('Nexus Engine SW: Failed', error);
      });
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
