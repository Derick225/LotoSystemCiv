import { useState, useEffect } from 'react';

export interface FeatureFlags {
  adversarialMode: boolean;         // Mode d'entraînement contradictoire cybernétique
  dnaBackpropagation: boolean;      // Rétropropagation de gradient sur l'ADN de pondération
  quantumStateDenoising: boolean;   // Débruitage par état quantique (PCA probabiliste)
  spectralDenoising: boolean;       // Filtrage d'énergie spectrale de Fourier
  kalmanAutoCalibration: boolean;   // Auto-calibration par filtre Kalman récursif
  bayesianShrinkage: boolean;       // Réduction bayésienne sur précision empirique
}

const STORAGE_KEY = 'lotopro_feature_flags_v1';

const DEFAULT_FLAGS: FeatureFlags = {
  adversarialMode: false,
  dnaBackpropagation: true,
  quantumStateDenoising: false,
  spectralDenoising: true,
  kalmanAutoCalibration: true,
  bayesianShrinkage: true,
};

/**
 * GESTIONNAIRE DÉTERMINISTE CENTRAL DES FEATURE FLAGS (ZÉRO HASARD)
 */
export const getFeatureFlags = (): FeatureFlags => {
  if (typeof window === 'undefined') return DEFAULT_FLAGS;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_FLAGS;
    return { ...DEFAULT_FLAGS, ...JSON.parse(stored) };
  } catch (e) {
    return DEFAULT_FLAGS;
  }
};

export const saveFeatureFlags = (flags: FeatureFlags): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(flags));
  } catch (e) {
    console.error('Failed to preserve cybernetic feature flags', e);
  }
};

/**
 * HOOK REACT RE-EXCITABLE POUR LES FEATUE FLAGS CYBERNÉTIQUES
 */
export const useFeatureFlags = () => {
  const [flags, setFlagsState] = useState<FeatureFlags>(DEFAULT_FLAGS);

  useEffect(() => {
    setFlagsState(getFeatureFlags());
  }, []);

  const toggleFlag = (key: keyof FeatureFlags) => {
    const updated = { ...flags, [key]: !flags[key] };
    setFlagsState(updated);
    saveFeatureFlags(updated);
  };

  const setFlag = (key: keyof FeatureFlags, value: boolean) => {
    const updated = { ...flags, [key]: value };
    setFlagsState(updated);
    saveFeatureFlags(updated);
  };

  return {
    flags,
    toggleFlag,
    setFlag,
  };
};
