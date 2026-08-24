import { DrawResult } from '../../types';
import { AlgoKey } from '../../shared/prediction.types';
import { calculateShannonEntropy, calculateVolatility, calculateFractalIndex } from '../mathService';
import { calculateTopologicalLyapunov } from '../advancedMathService';

export type CyclicPhaseType = 'PERIODIC_ATTRACTOR' | 'STOCHASTIC_DISPERSION' | 'TRANSITIONAL_ORBIT';

export interface CyclicPhaseProfileResult {
  phase: CyclicPhaseType;
  phaseLabel: string;
  lyapunovExponent: number;
  isChaotic: boolean;
  stochasticDispersionIndex: number; // [0, 1]
  attractorTension: number; // [0, 1]
  confidenceModulator: number; // Multiplicateur multiplicatif continu [0.75, 1.25]
  dominantMacroFamily: string;
  macroFamilyWeights: {
    attractorResonance: number;
    stochasticDiffusion: number;
    topologicalAffinity: number;
  };
  algoWeightModifiers: Partial<Record<AlgoKey, number>>;
  narrativeInterpretation: string;
}

// Définition des macro-familles algorithmiques
export const MACRO_ALGO_FAMILIES = {
  ATTRACTOR_RESONANCE: [
    AlgoKey.SPECTRAL,
    AlgoKey.FRACTAL,
    AlgoKey.SPATIAL,
    AlgoKey.MOMENTUM,
    AlgoKey.TEMPORAL,
    AlgoKey.INTER_MONTHLY_RESONANCE,
    AlgoKey.ECHO_STATE
  ],
  STOCHASTIC_DIFFUSION: [
    AlgoKey.FREQUENCY,
    AlgoKey.GAPS,
    AlgoKey.GAP_CADENCE,
    AlgoKey.GAP_TREND,
    AlgoKey.GAP_BAND_SEQUENCE,
    AlgoKey.MARKOV,
    AlgoKey.BAYES,
    AlgoKey.ISOLATION_ANOMALY
  ],
  TOPOLOGICAL_AFFINITY: [
    AlgoKey.AFFINITY,
    AlgoKey.NETWORK_CORRELATION,
    AlgoKey.DERIVED_NEIGHBOR,
    AlgoKey.GAP_SEQUENCE,
    AlgoKey.SEQUENCE_PATTERN,
    AlgoKey.MACHINE_TRANSFER,
    AlgoKey.SHADOW_PROBABILITY
  ]
};

/**
 * Calculateur de la Matrice de Confiance Dynamique par Profil Cyclique
 * Détermine la phase (Attracteur Périodique vs Dispersion Stochastique) via l'exposant de Lyapunov (λ)
 * et pondère dynamiquement les algorithmes et la confiance de prédiction.
 * 100% CONTINU & DÉTERMINISTE, ZÉRO NOMBRE MAGIQUE (AGENTS.md).
 */
export const calculateCyclicPhaseProfileMatrix = (
  history: DrawResult[],
  lyapunovScores?: Record<number, number>
): CyclicPhaseProfileResult => {
  const N = history.length;
  if (N < 3) {
    return {
      phase: 'TRANSITIONAL_ORBIT',
      phaseLabel: 'Équilibre de Transition Neutre',
      lyapunovExponent: 0.0,
      isChaotic: false,
      stochasticDispersionIndex: 0.5,
      attractorTension: 0.5,
      confidenceModulator: 1.0,
      dominantMacroFamily: 'Topologie Mixte',
      macroFamilyWeights: {
        attractorResonance: 0.33,
        stochasticDiffusion: 0.33,
        topologicalAffinity: 0.34
      },
      algoWeightModifiers: {},
      narrativeInterpretation: 'Historique insuffisant pour détecter une divergence de phase ; équilibre statistique neutre appliqué.'
    };
  }

  // 1. Calcul de l'exposant de Lyapunov empirique maximal (λ) sur l'horizon temporel
  const topoScores = lyapunovScores || calculateTopologicalLyapunov(history);
  const lyapValues = Object.values(topoScores);
  const avgLyapunov = lyapValues.length > 0 
    ? lyapValues.reduce((a, b) => a + b, 0) / lyapValues.length 
    : 0.0;
  
  // Normalisation de l'exposant de Lyapunov
  const normalizedLyapunov = Math.tanh(avgLyapunov / 50.0);

  // 2. Entropie de Shannon, Exposant de Hurst et Volatilité locale
  const entropyInfo = calculateShannonEntropy(history);
  const normalizedEntropy = entropyInfo.normalized;
  const hurst = calculateFractalIndex(history);
  const volatility = calculateVolatility(history);
  const volNorm = Math.tanh(volatility.score / 50.0);

  // 3. Indice de Dispersion Stochastique continu [0, 1]
  // Plus l'exposant de Lyapunov est positif et l'entropie élevée, plus la dispersion est forte
  const dispersionSignal = (normalizedLyapunov + normalizedEntropy + volNorm - (hurst - 0.5)) / 3.0;
  const stochasticDispersionIndex = 1.0 / (1.0 + Math.exp(-4.0 * (dispersionSignal - 0.5)));

  // Indice de Tension d'Attracteur continu [0, 1]
  // Plus l'exposant de Lyapunov est négatif (convergence) et le Hurst élevé (mémoire longue), plus l'attracteur est fort
  const attractorSignal = (-normalizedLyapunov + (1.0 - normalizedEntropy) + (hurst - 0.5)) / 3.0;
  const attractorTension = 1.0 / (1.0 + Math.exp(-4.0 * (attractorSignal - 0.5)));

  // 4. Détermination de la Phase Cyclique
  let phase: CyclicPhaseType = 'TRANSITIONAL_ORBIT';
  let phaseLabel = 'Orbite de Transition Métastable';

  if (attractorTension > 0.58 && normalizedLyapunov <= 0.05) {
    phase = 'PERIODIC_ATTRACTOR';
    phaseLabel = 'Phase d’Attracteur Périodique (Convergence Orbitale)';
  } else if (stochasticDispersionIndex > 0.58 || normalizedLyapunov > 0.15) {
    phase = 'STOCHASTIC_DISPERSION';
    phaseLabel = 'Phase de Haute Dispersion Stochastique (Diffusion Thermique)';
  }

  // 5. Modulation Continue des Macro-Familles
  // Somme pondérée normalisée L1
  const rawAttractorWeight = Math.exp(2.0 * (attractorTension - 0.5));
  const rawDiffusionWeight = Math.exp(2.0 * (stochasticDispersionIndex - 0.5));
  const rawAffinityWeight = 1.0;

  const totalMacroSum = rawAttractorWeight + rawDiffusionWeight + rawAffinityWeight;
  const macroFamilyWeights = {
    attractorResonance: parseFloat((rawAttractorWeight / totalMacroSum).toFixed(3)),
    stochasticDiffusion: parseFloat((rawDiffusionWeight / totalMacroSum).toFixed(3)),
    topologicalAffinity: parseFloat((rawAffinityWeight / totalMacroSum).toFixed(3))
  };

  let dominantMacroFamily = 'Affinité Topologique';
  if (macroFamilyWeights.attractorResonance >= macroFamilyWeights.stochasticDiffusion && 
      macroFamilyWeights.attractorResonance >= macroFamilyWeights.topologicalAffinity) {
    dominantMacroFamily = 'Résonance d’Attracteurs & Harmoniques';
  } else if (macroFamilyWeights.stochasticDiffusion >= macroFamilyWeights.attractorResonance && 
             macroFamilyWeights.stochasticDiffusion >= macroFamilyWeights.topologicalAffinity) {
    dominantMacroFamily = 'Diffusion Stochastique & Écarts';
  }

  // 6. Modificateurs Algorithmiques Individuels Log-Scalaires
  const algoWeightModifiers: Partial<Record<AlgoKey, number>> = {};
  
  // Attractor family boost or dampening
  const attractorDelta = (macroFamilyWeights.attractorResonance - 0.33) * 0.5;
  MACRO_ALGO_FAMILIES.ATTRACTOR_RESONANCE.forEach(key => {
    algoWeightModifiers[key] = attractorDelta;
  });

  // Stochastic diffusion family boost or dampening
  const diffusionDelta = (macroFamilyWeights.stochasticDiffusion - 0.33) * 0.5;
  MACRO_ALGO_FAMILIES.STOCHASTIC_DIFFUSION.forEach(key => {
    algoWeightModifiers[key] = diffusionDelta;
  });

  // Topological affinity family boost or dampening
  const affinityDelta = (macroFamilyWeights.topologicalAffinity - 0.34) * 0.5;
  MACRO_ALGO_FAMILIES.TOPOLOGICAL_AFFINITY.forEach(key => {
    algoWeightModifiers[key] = affinityDelta;
  });

  // 7. Modulateur de Confiance Continu :
  // En phase d'attracteur périodique, la prédictibilité de l'orbite est supérieure (boost continu)
  // En phase de haute dispersion, un facteur de régulation abaisse l'hyper-confiance pour éviter les faux espoirs
  const confidenceModulator = parseFloat(
    Math.max(0.75, Math.min(1.25, 1.0 + 0.20 * (attractorTension - stochasticDispersionIndex))).toFixed(3)
  );

  // 8. Synthèse Narrative
  let narrativeInterpretation = '';
  if (phase === 'PERIODIC_ATTRACTOR') {
    narrativeInterpretation = `Le jeu traverse une phase d'attracteur périodique (λ=${avgLyapunov.toFixed(2)}, Hurst=${hurst.toFixed(2)}). L'orbite temporelle converge vers des attracteurs géométriques compacts : les algorithmes Spectraux, Fractaux et Harmoniques reçoivent une priorité de résonance accrue.`;
  } else if (phase === 'STOCHASTIC_DISPERSION') {
    narrativeInterpretation = `Le jeu traverse une phase de haute dispersion stochastique (λ=${avgLyapunov.toFixed(2)}, Entropie=${(normalizedEntropy * 100).toFixed(1)}%). Le flux statistique subit une forte diffusion thermique : la matrice équilibre les poids vers les cadences d'écarts, les transitions markoviennes et les filtres de Bayes.`;
  } else {
    narrativeInterpretation = `Le jeu est en orbite de transition métastable (λ=${avgLyapunov.toFixed(2)}). Les forces d'attraction et de dispersion s'équilibrent de manière homogène sur l'ensemble de l'ADN algorithmique.`;
  }

  return {
    phase,
    phaseLabel,
    lyapunovExponent: avgLyapunov,
    isChaotic: normalizedLyapunov > 0,
    stochasticDispersionIndex: parseFloat(stochasticDispersionIndex.toFixed(3)),
    attractorTension: parseFloat(attractorTension.toFixed(3)),
    confidenceModulator,
    dominantMacroFamily,
    macroFamilyWeights,
    algoWeightModifiers,
    narrativeInterpretation
  };
};
