
import { DrawResult } from '../types';
import { calculateShannonEntropy, calculateBenfordCompliance } from './mathService';

export interface ForensicIndicator {
    label: string;
    value: string;
    severity: 'low' | 'medium' | 'high';
    description: string;
    impact: number;
}

export interface ForensicAuditResult {
    suspicionScore: number;
    indicators: ForensicIndicator[];
    riggedProbability: number;
    entropyCollapse: boolean;
    benfordCompliance: number;
    evidenceLogs: string[];
}

// Constantes scientifiques
const MIN_HISTORY_SIZE = 10;
const BENFORD_MIN_SAMPLE = 500;
const CRITICAL_VARIANCE = 8.0 * 0.7; // Seuil statistique pour 5 numéros sur 1-90
const AVG_THEORETICAL_SUM = (1 + 90) / 2 * 5; // 227.5
const MAX_ITERATIONS = 1000;

/**
 * Sanitise un nombre pour éviter NaN/Infinity.
 * Exporté pour usage dans d'autres services.
 */
export const sanitizeNumber = (n: any): number | null => {
  const num = parseInt(n);
  return (Number.isFinite(num) && num >= 1 && num <= 90) ? num : null;
};

/**
 * Test de Kolmogorov-Smirnov (KS) pour distribution uniforme.
 * Détecte si les numéros sont répartis de manière suspecte sur le spectre 1-90.
 */
const calculateKSTest = (numbers: number[]): { dStat: number, pValue: number } => {
    const n = numbers.length;
    if (n === 0) return { dStat: 0, pValue: 1 };
    
    const sorted = [...numbers].sort((a, b) => a - b);
    let maxD = 0;

    for (let i = 0; i < n; i++) {
        // CDF théorique (Uniforme sur 1-90)
        const cdfTheoretical = sorted[i] / 90;
        // CDF empirique
        const cdfEmpirical = (i + 1) / n;
        const prevCdfEmpirical = i / n;

        const dPlus = Math.abs(cdfEmpirical - cdfTheoretical);
        const dMinus = Math.abs(prevCdfEmpirical - cdfTheoretical);
        
        maxD = Math.max(maxD, dPlus, dMinus);
    }

    // Approximation simple de la valeur critique pour n=5, alpha=0.05 est env 0.56
    // Un D > 0.6 est très suspect pour 5 numéros
    return { dStat: maxD, pValue: Math.exp(-2 * maxD * maxD * n) }; // Formule asymptotique de Kolmogorov
};

/**
 * Clustering K-Means Simple (1D) pour détecter les regroupements artificiels.
 * Vérifie si les numéros sont trop proches les uns des autres (ex: 4 numéros dans la vingtaine).
 */
const detectClusteredFraud = (numbers: number[]): boolean => {
    const k = 2; // On cherche si 5 points peuvent se réduire à 2 clusters trop serrés
    let centroids = [numbers[0], numbers[numbers.length - 1]]; // Init basique
    let clusters: number[][] = [[], []];
    
    // 3 itérations suffisent pour converger sur 5 points
    for (let iter = 0; iter < 3; iter++) {
        clusters = [[], []];
        // Assignment
        numbers.forEach(n => {
            const d0 = Math.abs(n - centroids[0]);
            const d1 = Math.abs(n - centroids[1]);
            clusters[d0 < d1 ? 0 : 1].push(n);
        });
        // Update
        centroids = clusters.map(c => c.length ? c.reduce((a,b)=>a+b,0)/c.length : 0);
    }

    // Analyse de la densité intra-cluster
    for (const c of clusters) {
        if (c.length >= 4) { // 4 numéros sur 5 dans le même cluster
            const spread = Math.max(...c) - Math.min(...c);
            if (spread < 15) return true; // 4 numéros dans un intervalle de 15 = Suspect
        }
    }
    return false;
};

/**
 * Détecte des cycles temporels stricts.
 * Optimisé O(n) : Passe unique sur l'historique pour les numéros cibles.
 */
const analyzeTemporalPatterns = (numbers: number[], history: DrawResult[], logs: string[], indicators: ForensicIndicator[]): number => {
  let temporalPoints = 0;
  const maxHistory = Math.min(50, history.length);
  const targetSet = new Set(numbers);
  
  // Map pour suivre la dernière position vue de chaque numéro cible
  // Key: Numéro, Value: Index du dernier tirage vu
  const lastSeenMap = new Map<number, number>();
  
  // Map pour stocker les intervalles (gaps) successifs
  const gapsMap = new Map<number, number[]>();

  // Passe unique O(n)
  for (let i = 0; i < maxHistory; i++) {
      const draw = history[i];
      for (const n of draw.gagnants) {
          if (targetSet.has(n)) {
              if (lastSeenMap.has(n)) {
                  const prevIdx = lastSeenMap.get(n)!;
                  const gap = i - prevIdx;
                  
                  if (!gapsMap.has(n)) gapsMap.set(n, []);
                  gapsMap.get(n)!.push(gap);
              }
              lastSeenMap.set(n, i);
          }
      }
  }

  // Analyse des gaps collectés
  gapsMap.forEach((gaps, num) => {
      // Si on a au moins 2 intervalles et qu'ils sont identiques (périodicité stricte)
      // Ex: Sorti il y a 3 tours, et encore 3 tours avant
      if (gaps.length >= 2 && gaps.every(g => Math.abs(g - gaps[0]) < 1) && gaps[0] > 1) {
          const impact = 25; // Augmenté car c'est une signature mécanique forte
          indicators.push({
              label: `Cycle Mécanique N°${num}`,
              value: `Période T=${gaps[0]}`,
              severity: 'high',
              description: `Le numéro ${num} sort avec une régularité de métronome (tous les ${gaps[0]} tirages).`,
              impact
          });
          logs.push(`PATTERN: Périodicité stricte détectée sur ${num} (Gap=${gaps[0]}).`);
          temporalPoints += impact;
      }
  });
  
  return temporalPoints;
};

/**
 * Calculateur de probabilité Bayésienne pour le score "Rigged".
 * Met à jour la probabilité a priori (faible) avec les preuves observées (Likelihood Ratios).
 */
const calculateBayesianRigging = (baseProb: number, indicators: ForensicIndicator[]): number => {
    let odds = baseProb / (1 - baseProb);

    indicators.forEach(ind => {
        let likelihoodRatio = 1.0;
        
        // Assignation des LR selon le type d'anomalie
        if (ind.label.includes("Benford")) likelihoodRatio = 2.5;
        else if (ind.label.includes("Sigma")) likelihoodRatio = 2.0;
        else if (ind.label.includes("Collapsus")) likelihoodRatio = 4.0;
        else if (ind.label.includes("Harmonie")) likelihoodRatio = 6.0;
        else if (ind.label.includes("Cycle Mécanique")) likelihoodRatio = 12.0; // Preuve très forte
        else if (ind.label.includes("Cluster")) likelihoodRatio = 3.0;
        else if (ind.label.includes("KS-Test")) likelihoodRatio = 3.5;

        // Ajustement par sévérité
        if (ind.severity === 'low') likelihoodRatio = 1 + (likelihoodRatio - 1) * 0.2;
        if (ind.severity === 'medium') likelihoodRatio = 1 + (likelihoodRatio - 1) * 0.5;
        
        odds *= likelihoodRatio;
    });

    return odds / (1 + odds);
};

/**
 * Audite un tirage pour détecter des manipulations statistiques.
 */
export const analyzeForManipulation = (numbers: number[], history: DrawResult[]): ForensicAuditResult => {
  if (history.length < 5) {
      return {
          suspicionScore: 0,
          indicators: [],
          riggedProbability: 0,
          entropyCollapse: false,
          benfordCompliance: 100,
          evidenceLogs: ["Historique insuffisant pour l'audit."]
      };
  }

  const indicators: ForensicIndicator[] = [];
  const logs: string[] = [];
  let suspicionPoints = 0;

  const sum = numbers.reduce((a, b) => a + b, 0);
  const sorted = numbers.slice().sort((a, b) => a - b);
  
  const benfordSample = history.slice(0, Math.min(history.length, BENFORD_MIN_SAMPLE)).flatMap(d => d.gagnants);
  const benford = calculateBenfordCompliance([...benfordSample, ...numbers]);
  const entropy = calculateShannonEntropy(history.slice(0, 100)) || { normalized: 1.0 };
  
  // 1. Analyse de la Variance des Gaps (Harmonie Linéaire)
  const gaps = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    gaps.push(sorted[i + 1] - sorted[i]);
  }
  
  if (gaps.length > 0) {
      const avgGap = gaps.reduce((a,b) => a+b, 0) / gaps.length;
      const gapVariance = gaps.reduce((acc, g) => acc + Math.pow(g - avgGap, 2), 0) / gaps.length;
      
      if (gapVariance < CRITICAL_VARIANCE) {
        const impact = 45;
        indicators.push({
          label: "Harmonie Linéaire",
          value: `σ²=${gapVariance.toFixed(2)}`,
          severity: 'high',
          description: "Régularité des écarts statistiquement impossible (Linéarité artificielle).",
          impact
        });
        logs.push(`ALERTE: Variance gaps ${gapVariance.toFixed(2)} < seuil ${CRITICAL_VARIANCE}`);
        suspicionPoints += impact;
      }
  }

  // 2. Test Benford
  if (benford.score < 40) {
    const impact = 35;
    indicators.push({
      label: "Divergence Benford",
      value: `${Math.round(benford.score)}%`,
      severity: 'medium',
      description: "Non-conformité à la loi des nombres anormaux.",
      impact
    });
    logs.push(`ANOMALIE: Benford ${Math.round(benford.score)}%`);
    suspicionPoints += impact;
  }

  // 3. Test Kolmogorov-Smirnov (KS)
  const ksResult = calculateKSTest(numbers);
  if (ksResult.dStat > 0.5) { // Valeur critique approx
      const impact = 40;
      indicators.push({
          label: "KS-Test Failed",
          value: `D=${ksResult.dStat.toFixed(2)}`,
          severity: 'high',
          description: "La distribution des numéros dévie trop fortement d'une distribution uniforme.",
          impact
      });
      logs.push(`STAT: KS-Test D=${ksResult.dStat.toFixed(2)} (Critique > 0.5)`);
      suspicionPoints += impact;
  }

  // 4. Clustering Artificiel (K-Means)
  if (detectClusteredFraud(numbers)) {
      const impact = 30;
      indicators.push({
          label: "Clustering Suspect",
          value: "Dense",
          severity: 'medium',
          description: "Regroupement anormal de numéros (Cluster dense détecté).",
          impact
      });
      logs.push(`GEOMETRIE: Cluster dense détecté.`);
      suspicionPoints += impact;
  }

  // 5. Echo de Registre T-1
  if (history.length > 0) {
    const lastWinners = history[0].gagnants;
    const repeats = numbers.filter(n => lastWinners.includes(n)).length;
    if (repeats >= 3) {
      const impact = repeats === 3 ? 25 : 65;
      indicators.push({
        label: "Echo de Registre",
        value: `${repeats} répétitions`,
        severity: repeats >= 4 ? 'high' : 'medium',
        description: "Réplication anormale du tirage précédent.",
        impact
      });
      logs.push(`DÉTECTION: ${repeats} répétitions J-1`);
      suspicionPoints += impact;
  }
  }

  // 6. Test Dérive Sigma
  const deviance = Math.abs(sum - AVG_THEORETICAL_SUM);
  if (deviance > 130) {
    const impact = 30;
    indicators.push({
      label: "Dérive Sigma",
      value: `Δ${Math.round(deviance)}`,
      severity: 'medium',
      description: "Somme totale hors normes gaussiennes.",
      impact
    });
    logs.push(`SIGNAL: Somme ${sum} dévie de ${Math.round(deviance)}pts`);
    suspicionPoints += impact;
  }

  // 7. Collapsus Entropique
  if (entropy.normalized < 0.85) {
    const impact = 20;
    indicators.push({
      label: "Collapsus Entropique",
      value: `${Math.round(entropy.normalized * 100)}%`,
      severity: 'low',
      description: "Perte de désordre dans le système.",
      impact
    });
    suspicionPoints += impact;
  }

  // 8. Analyse Temporelle Optimisée
  suspicionPoints += analyzeTemporalPatterns(numbers, history, logs, indicators);

  // Calcul final probabiliste
  const riggedProb = calculateBayesianRigging(0.01, indicators);

  return {
    suspicionScore: Math.min(100, suspicionPoints),
    indicators: indicators.sort((a, b) => b.impact - a.impact),
    riggedProbability: riggedProb,
    entropyCollapse: entropy.normalized < 0.85,
    benfordCompliance: benford.score,
    evidenceLogs: logs
  };
};

/**
 * Génère un vecteur anti-consensus basé sur les "favoris" du moment
 */
export const generateShadowOracleVector = (history: DrawResult[], oracleScores: Record<number, number>): number[] => {
  const result = new Set<number>();
  
  const scores = Object.entries(oracleScores)
    .map(([n, s]) => ({ num: sanitizeNumber(n), score: Number(s) }))
    .filter((e): e is { num: number; score: number } => e.num !== null && Number.isFinite(e.score));
  
  if (scores.length === 0) {
    while (result.size < 5) result.add(Math.floor(Math.random() * 90) + 1);
    return Array.from(result).sort((a, b) => a - b);
  }

  const meanScore = scores.reduce((a, b) => a + b.score, 0) / scores.length;
  const stdDev = Math.sqrt(scores.reduce((a, b) => a + Math.pow(b.score - meanScore, 2), 0) / scores.length);
  const superFavorites = new Set(
    scores.filter(s => s.score > meanScore + 2 * stdDev).map(e => e.num)
  );

  const machineLast = history[0]?.machine || [];
  const validMachine = machineLast.map(sanitizeNumber).filter((n): n is number => n !== null)
    .filter(n => !superFavorites.has(n));
  
  if (validMachine.length > 0) {
    result.add(validMachine[Math.floor(Math.random() * validMachine.length)]);
  }

  if (scores.length > 0) {
    const topFavori = scores.reduce((a, b) => a.score > b.score ? a : b).num;
    const neighbors = [topFavori - 1, topFavori + 1]
      .map(sanitizeNumber)
      .filter((n): n is number => n !== null && !superFavorites.has(n));
    
    if (neighbors.length > 0) {
      result.add(neighbors[Math.floor(Math.random() * neighbors.length)]);
    }
  }

  const shadowCandidates = scores.filter(s => s.score > 38 && !superFavorites.has(s.num))
    .sort((a, b) => b.score - a.score);
  
  let i = 0;
  while (result.size < 5 && i < shadowCandidates.length) {
    result.add(shadowCandidates[i].num);
    i++;
  }

  let iterations = 0;
  while (result.size < 5 && iterations < MAX_ITERATIONS) {
    const rnd = Math.floor(Math.random() * 90) + 1;
    if (!superFavorites.has(rnd)) result.add(rnd);
    iterations++;
  }

  if (result.size < 5) {
    scores.sort((a, b) => a.score - b.score).slice(0, 5).forEach(e => result.add(e.num));
  }

  return Array.from(result).sort((a, b) => a - b);
};
