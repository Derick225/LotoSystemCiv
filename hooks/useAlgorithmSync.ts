import { useNexusStore } from '../store/useNexusStore';
import { AlgoWeights } from '../types';
import { AlgoKey } from '../shared/prediction.types';
import { useMemo, useCallback } from 'react';

export const LABELS_MAP: Record<AlgoKey, string> = {
  [AlgoKey.FREQUENCY]: 'Fréquence',
  [AlgoKey.GAPS]: 'Écart',
  [AlgoKey.SPECTRAL]: 'Spectral',
  [AlgoKey.MARKOV]: 'Markov',
  [AlgoKey.BAYES]: 'Bayes',
  [AlgoKey.MOMENTUM]: 'Momentum',
  [AlgoKey.AFFINITY]: 'Affinité',
  [AlgoKey.SPATIAL]: 'Spatial',
  [AlgoKey.TEMPORAL]: 'Temporel',
  [AlgoKey.FRACTAL]: 'Fractal',
  [AlgoKey.SHADOW_PROBABILITY]: 'Probabilité Ombre',
  [AlgoKey.NETWORK_CORRELATION]: 'Corrélation Réseau',
  [AlgoKey.ECHO_STATE]: 'Echo State (ESN)',
  [AlgoKey.GAP_SEQUENCE]: 'Séquence Écart',
  [AlgoKey.DERIVED_NEIGHBOR]: 'Voisin/Miroir/Ombre',
  [AlgoKey.GAP_PATTERN]: 'Motif Écart (AR1)',
  [AlgoKey.SEQUENCE_PATTERN]: 'Pattern Séquentiel',
};

export const ALGO_CATEGORIES = [
  {
    name: "Fréquentiel & Transition",
    keys: [AlgoKey.FREQUENCY, AlgoKey.MARKOV, AlgoKey.BAYES, AlgoKey.GAPS, AlgoKey.MOMENTUM, AlgoKey.GAP_SEQUENCE, AlgoKey.GAP_PATTERN, AlgoKey.SEQUENCE_PATTERN]
  },
  {
    name: "Mathématique & Structural",
    keys: [AlgoKey.SPECTRAL, AlgoKey.FRACTAL, AlgoKey.TEMPORAL, AlgoKey.SHADOW_PROBABILITY]
  },
  {
    name: "Dynamiques Avancées",
    keys: [AlgoKey.SPATIAL, AlgoKey.AFFINITY, AlgoKey.NETWORK_CORRELATION, AlgoKey.ECHO_STATE, AlgoKey.DERIVED_NEIGHBOR]
  }
];

export function useAlgorithmSync() {
  const globalWeights = useNexusStore((state) => state.globalWeights);
  const updateGlobalWeights = useNexusStore((state) => state.updateGlobalWeights);
  const drawName = useNexusStore((state) => state.drawName);

  // Guarantee all keys exist in weights with a stable memoized reference
  const weights = useMemo(() => {
    const w: AlgoWeights = { ...globalWeights };
    const keys = Object.values(AlgoKey);
    keys.forEach((key) => {
      if (w[key] === undefined) {
        w[key] = 0.05; // Fallback baseline
      }
    });
    return w;
  }, [globalWeights]);

  const setWeight = useCallback(async (key: AlgoKey, value: number) => {
    const updated = { ...weights, [key]: value };
    await updateGlobalWeights(updated, drawName);
  }, [weights, updateGlobalWeights, drawName]);

  const setAllWeights = useCallback(async (newWeights: AlgoWeights) => {
    await updateGlobalWeights(newWeights, drawName);
  }, [updateGlobalWeights, drawName]);

  // Recharts Radar-friendly formatted data
  const radarData = useMemo(() => {
    const keys = Object.values(AlgoKey);
    return keys.map((key) => ({
      subject: LABELS_MAP[key] || key,
      value: (weights[key] || 0) * 100,
      key,
    }));
  }, [weights]);

  return {
    weights,
    radarData,
    setWeight,
    setAllWeights,
    drawName,
    labels: LABELS_MAP,
    categories: ALGO_CATEGORIES,
  };
}
