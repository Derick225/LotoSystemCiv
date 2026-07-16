import { useState, useEffect } from 'react';
import { get, set } from 'idb-keyval';
import { z } from 'zod';

/**
 * Schéma Zod rigoureux pour valider et assainir les Feature Flags cybernétiques.
 */
export const FeatureFlagsSchema = z.object({
  adversarialMode: z.boolean(),
  dnaBackpropagation: z.boolean(),
  quantumStateDenoising: z.boolean(),
  spectralDenoising: z.boolean(),
  kalmanAutoCalibration: z.boolean(),
  bayesianShrinkage: z.boolean(),
});

export type FeatureFlags = z.infer<typeof FeatureFlagsSchema>;

const STORAGE_KEY = 'lotopro_feature_flags_v1';
const SYNC_LOCAL_STORAGE_KEY = 'lotopro_flags_event_sync';

/**
 * JSDoc exhaustive expliquant l'impact cybernétique et mathématique de chaque drapeau sur le moteur.
 */
const DEFAULT_FLAGS: FeatureFlags = {
  /**
   * @description Mode d'entraînement contradictoire cybernétique (Adversarial Mode) :
   * Introduit des perturbations gaussiennes déterministes et continues sur l'ADN de pondération.
   * Empêche l'ensemble d'algorithmes de sur-apprendre sur les régimes de tirages statiques.
   */
  adversarialMode: false,

  /**
   * @description Rétropropagation de gradient sur l'ADN de pondération (DNA Backpropagation) :
   * Optimise continuellement les poids des algorithmes d'une itération à l'autre en calculant
   * les gradients de l'erreur quadratique moyenne par rapport aux résultats réels.
   */
  dnaBackpropagation: true,

  /**
   * @description Débruitage par état quantique (Quantum State Denoising) :
   * Applique une réduction dimensionnelle via PCA Probabiliste (PPCA) sur la matrice
   * d'affinité pour isoler les composantes de bruit de haute variance non-physiques.
   */
  quantumStateDenoising: false,

  /**
   * @description Filtrage d'énergie spectrale de Fourier (Spectral Denoising) :
   * Effectue une transformée de Fourier discrète sur les écarts et tronque les fréquences
   * ayant une densité d'énergie inférieure au seuil dérivé de l'entropie de Shannon globale.
   */
  spectralDenoising: true,

  /**
   * @description Auto-calibration par filtre Kalman récursif (Kalman Auto-Calibration) :
   * Estime récursivement l'état latent de dérive des boules physiques en minimisant
   * la variance de l'erreur d'innovation à chaque nouveau tirage inséré.
   */
  kalmanAutoCalibration: true,

  /**
   * @description Réduction bayésienne sur précision empirique (Bayesian Shrinkage) :
   * Réduit les estimations de fréquences marginales locales vers l'a priori global uniforme
   * en fonction du nombre de tirages disponibles pour stabiliser les prédictions court-terme.
   */
  bayesianShrinkage: true,
};

// Cache mémoire synchrone pour les opérations non asynchrones à l'initialisation
let memoryCache: FeatureFlags = { ...DEFAULT_FLAGS };

/**
 * Charge de manière asynchrone les drapeaux depuis IndexedDB (idb-keyval).
 */
export const getFeatureFlagsAsync = async (): Promise<FeatureFlags> => {
  try {
    const stored = await get(STORAGE_KEY);
    if (!stored) {
      memoryCache = { ...DEFAULT_FLAGS };
      return memoryCache;
    }
    
    const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
    const validated = FeatureFlagsSchema.parse({ ...DEFAULT_FLAGS, ...parsed });
    memoryCache = validated;
    return validated;
  } catch (e) {
    console.warn('[FEATURE_FLAGS] Échec de la récupération depuis IDB, utilisation des défauts :', e);
    memoryCache = { ...DEFAULT_FLAGS };
    return memoryCache;
  }
};

/**
 * Récupère de manière synchrone les drapeaux depuis le cache mémoire.
 * Utile pour les calculs d'arrière-plan sans blocage de l'Event Loop.
 */
export const getFeatureFlags = (): FeatureFlags => {
  return memoryCache;
};

/**
 * Sauvegarde les drapeaux dans IndexedDB et déclenche les événements de synchronisation.
 */
export const saveFeatureFlags = async (flags: FeatureFlags): Promise<void> => {
  try {
    const validated = FeatureFlagsSchema.parse(flags);
    memoryCache = validated;
    await set(STORAGE_KEY, validated);
    
    if (typeof window !== 'undefined') {
      // Notification même onglet
      window.dispatchEvent(new CustomEvent('lotopro_feature_flags_updated', { detail: validated }));
      // Notification inter-onglets via localStorage standard
      localStorage.setItem(SYNC_LOCAL_STORAGE_KEY, JSON.stringify({ timestamp: Date.now(), flags: validated }));
    }
  } catch (e) {
    console.error('[FEATURE_FLAGS] Échec de la persistance dans IndexedDB :', e);
  }
};

// Auto-chargement initial asynchrone au chargement du module
if (typeof window !== 'undefined') {
  getFeatureFlagsAsync().catch(() => {});
}

/**
 * Hook React asynchrone et réactif pour la gestion des feature flags cybernétiques.
 * Intègre le chargement depuis IndexedDB et la synchronisation multi-onglets en temps réel.
 */
export const useFeatureFlags = () => {
  const [flags, setFlagsState] = useState<FeatureFlags>(memoryCache);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;
    
    const loadAndSync = async () => {
      const current = await getFeatureFlagsAsync();
      if (isMounted) {
        setFlagsState(current);
        setLoading(false);
      }
    };

    loadAndSync();

    const handleLocalUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<FeatureFlags>;
      if (customEvent.detail && isMounted) {
        setFlagsState(customEvent.detail);
      }
    };

    const handleStorageSync = (e: StorageEvent) => {
      if (e.key === SYNC_LOCAL_STORAGE_KEY && e.newValue) {
        try {
          const data = JSON.parse(e.newValue);
          if (data && data.flags) {
            const validated = FeatureFlagsSchema.parse(data.flags);
            if (isMounted) {
              setFlagsState(validated);
              memoryCache = validated;
            }
          }
        } catch (err) {
          console.error('[FEATURE_FLAGS] Échec de la désérialisation du message de synchronisation :', err);
        }
      }
    };

    window.addEventListener('lotopro_feature_flags_updated', handleLocalUpdate);
    window.addEventListener('storage', handleStorageSync);

    return () => {
      isMounted = false;
      window.removeEventListener('lotopro_feature_flags_updated', handleLocalUpdate);
      window.removeEventListener('storage', handleStorageSync);
    };
  }, []);

  const toggleFlag = async (key: keyof FeatureFlags) => {
    const updated = { ...flags, [key]: !flags[key] };
    setFlagsState(updated);
    await saveFeatureFlags(updated);
  };

  const setFlag = async (key: keyof FeatureFlags, value: boolean) => {
    const updated = { ...flags, [key]: value };
    setFlagsState(updated);
    await saveFeatureFlags(updated);
  };

  return {
    flags,
    loading,
    toggleFlag,
    setFlag,
  };
};
