import { lazy, ComponentType } from 'react';

/**
 * Charge un composant React de manière asynchrone avec gestion automatique des retentatives
 * en cas d'échec temporaire de téléchargement du module/chunk (ex: réseau instable ou rechargement HMR).
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  componentFactory: () => Promise<any>,
  exportName?: string,
  retriesLeft = 3,
  interval = 400
): ReturnType<typeof lazy<T>> {
  return lazy(() =>
    new Promise<{ default: T }>((resolve, reject) => {
      const attemptImport = (attemptsRemaining: number) => {
        componentFactory()
          .then((module) => {
            if (exportName && module && module[exportName]) {
              resolve({ default: module[exportName] as T });
            } else if (module && module.default) {
              resolve({ default: module.default as T });
            } else if (module) {
              resolve({ default: module as T });
            } else {
              reject(new Error(`Module non valide importé pour ${exportName || 'default'}`));
            }
          })
          .catch((error) => {
            console.warn(`[LazyWithRetry] Échec du téléchargement du module (${exportName || 'chunk'}). Tentatives restantes: ${attemptsRemaining}`, error);
            if (attemptsRemaining <= 0) {
              const storageKey = 'lazy_reload_' + (exportName || 'chunk');
              const hasRefreshed = window.sessionStorage.getItem(storageKey);
              if (!hasRefreshed) {
                window.sessionStorage.setItem(storageKey, 'true');
                window.location.reload();
                return;
              }
              reject(error);
              return;
            }
            setTimeout(() => {
              attemptImport(attemptsRemaining - 1);
            }, interval);
          });
      };

      attemptImport(retriesLeft);
    })
  );
}
