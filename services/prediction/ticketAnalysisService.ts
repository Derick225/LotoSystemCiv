import { TicketAnalysisResult, AlgoWeights, AdaptiveRules, ForensicReport, DrawResult } from '../../types';
import { AlgoKey, ScoreBreakdown, EmpiricalCalibration, FALLBACK_CALIBRATION } from '../../shared/prediction.types';
import { calculateACValue } from '../mathCore';
import { calculateGeneticDiversityIndex } from './diversityService';
import { normalizeWeights } from './weightsManager';

// ============================================================================
// 1. CALIBRATION EMPIRIQUE DYNAMIQUE (ZÉRO NOMBRE MAGIQUE)
// ============================================================================

export const generateEmpiricalCalibration = (history: DrawResult[]): EmpiricalCalibration => {
  if (!history || history.length < 10) {
    return FALLBACK_CALIBRATION;
  }

  const sums: number[] = [];
  const amplitudes: number[] = [];
  const acs: number[] = [];
  let totalConsecutives = 0;

  for (const draw of history) {
    const nums = (draw as any).numbers || (draw as any).gagnants || [
      (draw as any).G1, (draw as any).G2, (draw as any).G3, 
      (draw as any).G4, (draw as any).G5
    ].filter((n: any) => typeof n === 'number');

    if (nums.length < 5) continue;

    const sorted = [...nums].sort((a, b) => a - b);
    sums.push(sorted.reduce((a, b) => a + b, 0));
    amplitudes.push(sorted[sorted.length - 1] - sorted[0]);
    acs.push(calculateACValue(sorted));

    let consec = 0;
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i + 1] - sorted[i] === 1) consec++;
    }
    totalConsecutives += consec;
  }

  const n = sums.length;
  if (n === 0) return FALLBACK_CALIBRATION;

  const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const std = (arr: number[], m: number) => Math.sqrt(arr.reduce((sq, val) => sq + Math.pow(val - m, 2), 0) / arr.length);

  const mSum = mean(sums);
  const mAmp = mean(amplitudes);
  const mAC = mean(acs);

  const sSum = std(sums, mSum);
  const sAmp = std(amplitudes, mAmp);
  const sAC = std(acs, mAC);

  return {
    meanSum: mSum,
    stdSum: sSum > 0.1 ? sSum : 56.8,
    meanAmplitude: mAmp,
    stdAmplitude: sAmp > 0.1 ? sAmp : 13.5,
    meanAC: mAC,
    stdAC: sAC > 0.1 ? sAC : 0.71,
    lambdaConsecutives: totalConsecutives / n,
    isValid: true
  };
};

// ============================================================================
// 2. UTILITAIRES MATHÉMATIQUES EXACTS
// ============================================================================

const factorial = (n: number): number => {
  if (n === 0 || n === 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
};

const combination = (n: number, k: number): number => {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  if (k > n / 2) k = n - k;
  let res = 1;
  for (let i = 1; i <= k; i++) {
    res = res * (n - i + 1) / i;
  }
  return Math.round(res);
};

// ============================================================================
// 3. MOTEUR D'ANALYSE DÉTERMINISTE
// ============================================================================

export const analyzeTicketStrengthSync = (
  numbers: number[], 
  calibration: EmpiricalCalibration = FALLBACK_CALIBRATION
): TicketAnalysisResult => {
  const sorted = [...numbers].sort((a, b) => a - b);
  const ac = calculateACValue(sorted);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const amplitude = sorted.length > 1 ? sorted[sorted.length - 1] - sorted[0] : 0;
  
  let consecutives = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i + 1] - sorted[i] === 1) consecutives++;
  }

  const odds = sorted.filter(n => n % 2 !== 0).length;
  const evens = sorted.length - odds;
  const parity = `${odds} Impairs / ${evens} Pairs`;

  const warnings: string[] = [];
  let score = 100.0;

  const MAX_PENALTY_AC = 40.0;
  const MAX_PENALTY_CONSEC = 25.0;
  const MAX_PENALTY_PARITY = 35.0;

  const acZScore = (ac - calibration.meanAC) / calibration.stdAC;
  const acPenalty = MAX_PENALTY_AC * (1.0 - Math.exp(-0.5 * Math.pow(acZScore, 2)));
  score -= acPenalty;
  if (Math.abs(acZScore) > 2.0) {
    warnings.push(`AC anormale (Z=${acZScore.toFixed(2)}). Cible empirique: ${calibration.meanAC.toFixed(1)} ± ${calibration.stdAC.toFixed(2)}`);
  }

  const lambda = calibration.lambdaConsecutives;
  let poissonCDF = 0;
  for (let i = 0; i < consecutives; i++) {
    poissonCDF += (Math.pow(lambda, i) * Math.exp(-lambda)) / factorial(i);
  }
  const probConsecOrMore = 1.0 - poissonCDF;
  const consecPenalty = MAX_PENALTY_CONSEC * (1.0 - probConsecOrMore);
  score -= consecPenalty;
  if (consecutives >= 2 && probConsecOrMore < 0.15) {
    warnings.push(`Séquence consécutive statistiquement rare (p=${(probConsecOrMore * 100).toFixed(1)}%)`);
  }

  const n = sorted.length;
  const p = 0.5;
  const probExactParity = combination(n, odds) * Math.pow(p, odds) * Math.pow(1 - p, n - odds);
  const maxProbParity = 0.3125; 
  const parityPenalty = MAX_PENALTY_PARITY * (1.0 - (probExactParity / maxProbParity));
  score -= parityPenalty;
  if (odds === 0 || odds === 5) {
    warnings.push(`Polarisation de parité extrême (Probabilité théorique: ${(probExactParity * 100).toFixed(1)}%)`);
  }

  const acProb = 1.0 / (1.0 + Math.exp(Math.abs(acZScore)));
  const amplitudeZ = (amplitude - calibration.meanAmplitude) / (calibration.stdAmplitude || 1);
  const amplitudeProb = 1.0 / (1.0 + Math.exp(Math.abs(amplitudeZ)));

  if (acProb < 0.3) warnings.push(`AC sous-optimale (Score de fit: ${(acProb * 100).toFixed(0)}%)`);
  if (amplitudeProb < 0.3) warnings.push(`Amplitude structurelle restreinte (Score: ${(amplitudeProb * 100).toFixed(0)}%)`);

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    verdict: score >= 80 ? "Premium" : score > 50 ? "Standard" : "Fragile",
    warnings,
    ac,
    sum,
    parity,
    amplitude,
    consecutives
  };
};

export function analyzeTicketStrength(numbers: number[], calibration?: EmpiricalCalibration): TicketAnalysisResult {
  return analyzeTicketStrengthSync(numbers, calibration || FALLBACK_CALIBRATION);
}

export const analyzeTicketStrengthWithDiversity = (
  numbers: number[], 
  breakdowns: Record<number, ScoreBreakdown>,
  calibration: EmpiricalCalibration = FALLBACK_CALIBRATION
): TicketAnalysisResult & { diversityMetrics: ReturnType<typeof calculateGeneticDiversityIndex> } => {
  const baseAnalysis = analyzeTicketStrength(numbers, calibration);
  const diversityMetrics = calculateGeneticDiversityIndex(numbers, breakdowns);
  let finalScore = baseAnalysis.score - diversityMetrics.penalty;
  finalScore = Math.max(0, Math.min(100, Math.round(finalScore)));

  const finalWarnings = [...baseAnalysis.warnings];
  if (diversityMetrics.isMonoculture) {
    finalWarnings.push(`MONOCULTURE ALGORITHMIQUE : Similarité trop élevée (${diversityMetrics.meanSimilarity}). Les 5 numéros sont dominés par '${diversityMetrics.dominantAlgo}'. Risque structurel élevé.`);
  } else if (diversityMetrics.diversityScore < 0.40) {
    finalWarnings.push(`Diversité algorithmique faible (${diversityMetrics.diversityScore}). La combinaison manque d'orthogonalité des signaux.`);
  }

  return {
    ...baseAnalysis,
    score: finalScore,
    warnings: finalWarnings,
    diversityMetrics
  };
};

// ============================================================================
// 4. STRATEGIES & RÈGLES ADAPTATIVES
// ============================================================================

export const getStrategyName = (weights: AlgoWeights): string => {
  const sorted = Object.entries(weights).sort((a, b) => {
    const diff = (Number(b[1]) || 0) - (Number(a[1]) || 0);
    return diff !== 0 ? diff : a[0].localeCompare(b[0]);
  });
  const topAlgo = sorted[0]?.[0] || 'Standard';
  const strategies: Record<string, string> = {
    [AlgoKey.FREQUENCY]: 'Tendance Pure',
    [AlgoKey.GAPS]: 'Chasseur d\'Écarts',
    [AlgoKey.MARKOV]: 'Chaîne Logique',
    [AlgoKey.SPECTRAL]: 'Analyse FFT',
    [AlgoKey.BAYES]: 'Inférence Probabiliste',
    [AlgoKey.MOMENTUM]: 'Élan Cinématique',
    [AlgoKey.AFFINITY]: 'Affinité Symbiotique',
    [AlgoKey.SPATIAL]: 'Géométrie Spatiale',
    [AlgoKey.TEMPORAL]: 'Modélisation Temporelle',
    [AlgoKey.FRACTAL]: 'Mémoire Multi-échelle',
    [AlgoKey.JACCARD]: 'Inertie Jaccard'
  };
  return strategies[topAlgo] || `Hybride (${topAlgo})`;
};

export const getDefaultRules = (): AdaptiveRules => ({
  criticalZoneMin: 12,
  criticalZoneMax: 28
});

export const getAdaptiveRules = (drawName: string): AdaptiveRules => {
  try {
    if (typeof window === 'undefined') return getDefaultRules();
    const raw = window.localStorage.getItem(`nexus_rules_${drawName}`);
    return raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : getDefaultRules();
  } catch { 
    return getDefaultRules(); 
  }
};

export const saveAdaptiveRules = (drawName: string, rules: AdaptiveRules) => {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(`nexus_rules_${drawName}`, JSON.stringify(rules));
      window.dispatchEvent(new CustomEvent('PREFERENCES_TRIGGER_SYNC'));
    }
  } catch {}
};

// ============================================================================
// 5. AJUSTEMENTS FORENSIQUES DÉTERMINISTES
// ============================================================================

export const calculateCorrectionsFromForensics = (
  weights: AlgoWeights, 
  rules: AdaptiveRules, 
  report: ForensicReport
) => {
  const newWeights = { ...weights };
  const reasoning: string[] = [];

  const numAlgos = Object.keys(newWeights).length;
  const deterministicFallbackLR = 1.0 / Math.sqrt(numAlgos);
  const LEARNING_RATE = report.idealAlgorithmicDriftTolerance !== undefined 
    ? report.idealAlgorithmicDriftTolerance 
    : deterministicFallbackLR;

  if (report.proposedAdjustments && report.proposedAdjustments.length > 0) {
    report.proposedAdjustments.forEach(adj => {
      const key = adj.algo as AlgoKey;
      if (newWeights[key] !== undefined) {
        const oldVal = Number(newWeights[key]) || 0;
        const newVal = oldVal + (adj.proposedWeightChange * LEARNING_RATE);
        
        const minWeight = Math.max(0.001, 0.10 / numAlgos);
        const maxWeight = Math.min(0.50, 3.0 / numAlgos);
        
        newWeights[key] = Math.max(minWeight, Math.min(maxWeight, parseFloat(newVal.toFixed(4))));
        
        if (Math.abs(adj.proposedWeightChange) > 0.01) {
          reasoning.push(`Ajustement ${key} (${adj.proposedWeightChange > 0 ? '+' : ''}${(adj.proposedWeightChange * 100).toFixed(1)}%). Raison: ${adj.reason}`);
        }
      }
    });
  } else {
    report.scoreDivergence.forEach(div => {
      const key = div.algo as AlgoKey;
      if (newWeights[key] !== undefined) {
        const impactFactor = div.impact / 100;
        const boost = LEARNING_RATE * impactFactor;
        const oldVal = Number(newWeights[key]) || 0;
        const newVal = oldVal + boost;
        
        const maxWeight = Math.min(0.50, 3.0 / numAlgos);
        newWeights[key] = parseFloat(Math.min(maxWeight, newVal).toFixed(4));
        
        if (boost > 0.01) {
          reasoning.push(`Ajustement passif ${div.algo} (+${(boost * 100).toFixed(2)}%).`);
        }
      }
    });
  }

  return { 
    newWeights: normalizeWeights(newWeights), 
    newRules: rules, 
    reasoning 
  };
};
