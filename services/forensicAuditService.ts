
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
 * Sanitise un nombre pour éviter NaN/Infinity
 */
const sanitizeNumber = (n: any): number | null => {
  const num = parseInt(n);
  return (Number.isFinite(num) && num >= 1 && num <= 90) ? num : null;
};

/**
 * Détecte des cycles temporels stricts (ex: sort tous les 3 tirages)
 * @returns Score de suspicion temporelle
 */
const analyzeTemporalPatterns = (numbers: number[], history: DrawResult[], logs: string[], indicators: ForensicIndicator[]): number => {
  let temporalPoints = 0;
  const maxHistory = Math.min(30, history.length);
  
  numbers.forEach(num => {
    const gaps: number[] = [];
    let lastIdx = -1;
    
    for (let i = 0; i < maxHistory; i++) {
      if (history[i]?.gagnants?.includes(num)) {
        if (lastIdx !== -1) {
          gaps.push(i - lastIdx);
        }
        lastIdx = i;
      }
    }
    
    // Détection de périodicité stricte
    if (gaps.length >= 2 && gaps.every(g => g === gaps[0]) && gaps[0] > 1) {
      const impact = 20;
      indicators.push({
        label: `Cycle Mécanique N°${num}`,
        value: `Période ${gaps[0]}t`,
        severity: 'high',
        description: `Le numéro ${num} sort exactement tous les ${gaps[0]} tirages. Signature artificielle.`,
        impact
      });
      logs.push(`PATTERN: Périodicité stricte sur ${num} (T=${gaps[0]}). Probabilité: <0.001%`);
      temporalPoints += impact;
    }
  });
  
  return temporalPoints;
};

/**
 * Audite un tirage pour détecter des manipulations statistiques
 * @param numbers - Les 5 numéros gagnants du tirage à auditer
 * @param history - Les 30+ tirages précédents pour contexte
 * @returns Audit complet avec score de suspicion (0-100)
 */
export const analyzeForManipulation = (numbers: number[], history: DrawResult[]): ForensicAuditResult => {
  // Tolérance pour les petits historiques
  if (history.length < 5) {
      // Retour neutre si pas assez de données
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

  // Pré-calculs
  const sum = numbers.reduce((a, b) => a + b, 0);
  const sorted = numbers.slice().sort((a, b) => a - b);
  
  // Echantillon pour Benford (idéalement grand, sinon on fait avec ce qu'on a)
  const benfordSample = history.slice(0, Math.min(history.length, BENFORD_MIN_SAMPLE)).flatMap(d => d.gagnants);
  // On ajoute le tirage actuel pour le test
  const benford = calculateBenfordCompliance([...benfordSample, ...numbers]);
  
  const entropy = calculateShannonEntropy(history.slice(0, 100)) || { normalized: 1.0 };
  
  // 1. Analyse de la Variance des Gaps (Harmonie Linéaire)
  const gaps = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    gaps.push(sorted[i + 1] - sorted[i]);
  }
  
  // Calcul de la variance des écarts internes
  if (gaps.length > 0) {
      const avgGap = gaps.reduce((a,b) => a+b, 0) / gaps.length;
      const gapVariance = gaps.reduce((acc, g) => acc + Math.pow(g - avgGap, 2), 0) / gaps.length;
      
      // Si la variance est trop faible, cela signifie que les numéros sont espacés trop régulièrement (suspect)
      if (gapVariance < CRITICAL_VARIANCE) {
        const impact = 45;
        indicators.push({
          label: "Harmonie Linéaire",
          value: `σ²=${gapVariance.toFixed(2)}`,
          severity: 'high',
          description: "Régularité des écarts statistiquement impossible. Signature probable de sélection humaine.",
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
      description: "Divergence significative de la loi logarithmique naturelle des premiers chiffres.",
      impact
    });
    logs.push(`ANOMALIE: Benford ${Math.round(benford.score)}% (attendu >60%)`);
    suspicionPoints += impact;
  }

  // 3. Echo de Registre T-1
  if (history.length > 0) {
    const lastWinners = history[0].gagnants;
    const repeats = numbers.filter(n => lastWinners.includes(n)).length;
    if (repeats >= 3) {
      const impact = repeats === 3 ? 25 : 65;
      indicators.push({
        label: "Echo de Registre",
        value: `${repeats} répétitions`,
        severity: repeats >= 4 ? 'high' : 'medium',
        description: "Réplication anormale du tirage précédent (Inertie temporelle suspecte).",
        impact
      });
      logs.push(`DÉTECTION: ${repeats} répétitions J-1 (P<0.004%)`);
      suspicionPoints += impact;
    }
  }

  // 4. Test Dérive Sigma
  const deviance = Math.abs(sum - AVG_THEORETICAL_SUM);
  if (deviance > 130) {
    const impact = 30;
    indicators.push({
      label: "Dérive Sigma",
      value: `Δ${Math.round(deviance)}`,
      severity: 'medium',
      description: "Somme totale située aux extrémités improbables de la courbe de Gauss.",
      impact
    });
    logs.push(`SIGNAL: Somme ${sum} dévie de ${Math.round(deviance)}pts`);
    suspicionPoints += impact;
  }

  // 5. Collapsus Entropique
  if (entropy.normalized < 0.85) {
    const impact = 20;
    indicators.push({
      label: "Collapsus Entropique",
      value: `${Math.round(entropy.normalized * 100)}%`,
      severity: 'low',
      description: "Perte de désordre dans le système. Le flux semble 'dirigé'.",
      impact
    });
    logs.push(`NOTE: Entropie ${entropy.normalized.toFixed(2)} < 0.85`);
    suspicionPoints += impact;
  }

  // 6. Analyse Temporelle
  suspicionPoints += analyzeTemporalPatterns(numbers, history, logs, indicators);

  return {
    suspicionScore: Math.min(100, suspicionPoints),
    indicators: indicators.sort((a, b) => b.impact - a.impact),
    riggedProbability: suspicionPoints > 75 ? 0.98 : suspicionPoints > 45 ? 0.62 : 0.05,
    entropyCollapse: entropy.normalized < 0.85,
    benfordCompliance: benford.score,
    evidenceLogs: logs
  };
};

/**
 * Génère un vecteur anti-consensus basé sur les "favoris" du moment
 * Objectif: Trouver des numéros viables mais ignorés par le grand public
 */
export const generateShadowOracleVector = (history: DrawResult[], oracleScores: Record<number, number>): number[] => {
  const result = new Set<number>();
  
  // Sanitisation des scores
  const scores = Object.entries(oracleScores)
    .map(([n, s]) => ({ num: sanitizeNumber(n), score: Number(s) }))
    .filter((e): e is { num: number; score: number } => e.num !== null && Number.isFinite(e.score));
  
  if (scores.length === 0) {
    // Fallback complet random
    while (result.size < 5) result.add(Math.floor(Math.random() * 90) + 1);
    return Array.from(result).sort((a, b) => a - b);
  }

  // Calcul super-favoris (2σ au-dessus de la moyenne)
  const meanScore = scores.reduce((a, b) => a + b.score, 0) / scores.length;
  const stdDev = Math.sqrt(scores.reduce((a, b) => a + Math.pow(b.score - meanScore, 2), 0) / scores.length);
  const superFavorites = new Set(
    scores.filter(s => s.score > meanScore + 2 * stdDev).map(e => e.num)
  );

  // Strategie Alpha: Translocation Machine T-1
  const machineLast = history[0]?.machine || [];
  const validMachine = machineLast.map(sanitizeNumber).filter((n): n is number => n !== null)
    .filter(n => !superFavorites.has(n));
  
  if (validMachine.length > 0) {
    result.add(validMachine[Math.floor(Math.random() * validMachine.length)]);
  }

  // Strategie Beta: Voisinage inverse du favori #1
  if (scores.length > 0) {
    const topFavori = scores.reduce((a, b) => a.score > b.score ? a : b).num;
    const neighbors = [topFavori - 1, topFavori + 1]
      .map(sanitizeNumber)
      .filter((n): n is number => n !== null && !superFavorites.has(n));
    
    if (neighbors.length > 0) {
      result.add(neighbors[Math.floor(Math.random() * neighbors.length)]);
    }
  }

  // Strategie Gamma: Anti-consensus pur (Scores moyens-hauts mais pas top)
  const shadowCandidates = scores.filter(s => s.score > 38 && !superFavorites.has(s.num))
    .sort((a, b) => b.score - a.score);
  
  let i = 0;
  while (result.size < 5 && i < shadowCandidates.length) {
    result.add(shadowCandidates[i].num);
    i++;
  }

  // Remplissage sécurisé
  let iterations = 0;
  while (result.size < 5 && iterations < MAX_ITERATIONS) {
    const rnd = Math.floor(Math.random() * 90) + 1;
    if (!superFavorites.has(rnd)) result.add(rnd);
    iterations++;
  }

  // Fallback ultime
  if (result.size < 5) {
    scores.sort((a, b) => a.score - b.score).slice(0, 5).forEach(e => result.add(e.num));
  }

  return Array.from(result).sort((a, b) => a - b);
};
