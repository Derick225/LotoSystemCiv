import type { DrawResult, SmartInsight, SpectralMetric, NumberGap, NumberRegularity } from '../types';
import { calculateVolatility, calculateShannonEntropy, calculateFractalIndex } from './mathService';

export enum InsightType {
  RISK = 'risk',
  OPPORTUNITY = 'opportunity',
  INFO = 'info'
}

/**
 * Calcul robuste de la médiane (O(N log N))
 */
const getMedian = (arr: number[]): number => {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/**
 * Médiane des écarts absolus (MAD) normalisée pour distribution gaussienne (facteur 1.4826)
 */
const getMAD = (arr: number[], median: number): number => {
  if (arr.length === 0) return 0;
  const absDeviations = arr.map(v => Math.abs(v - median));
  return getMedian(absDeviations) * 1.4826;
};

/**
 * Moteur de Génération Déterministe de Remarques et d'Insights Prédictifs
 * Analyse la structure continue du signal : Entropie, Volatilité, Exposant de Hurst, Gaps & Harmonie Spectrale.
 */
export const generateSmartInsights = async (
  drawName: string,
  history: DrawResult[],
  spectral: SpectralMetric[],
  gaps: NumberGap[],
  regularity: NumberRegularity[]
): Promise<SmartInsight[]> => {
  const insightMap = new Map<string, SmartInsight>();
  
  const minHistoryRequired = Math.max(5, Math.min(15, Math.floor(history.length * 0.1)));
  if (history.length < minHistoryRequired) return [];

  // =========================================================================
  // 1. RÉGIME THERMODYNAMIQUE & CHAOS (Entropie de Shannon + Volatilité)
  // =========================================================================
  const volatility = calculateVolatility(history);
  const entropyObj = calculateShannonEntropy(history.slice(0, 40));
  const normalizedEntropy = typeof entropyObj === 'object' && entropyObj ? (entropyObj.normalized ?? 0.95) : 0.95;

  if (volatility.score > 70 || normalizedEntropy > 0.98) {
    insightMap.set('volatility', {
      id: 'vol-chaos',
      type: InsightType.RISK,
      title: 'Zone de Haute Turbulence',
      description: `Régime stochastique dispersé (Volatilité : ${volatility.score}%, Entropie : ${(normalizedEntropy * 100).toFixed(1)}%). Prudence sur les combinaisons rigides, privilégier l'échantillonnage de couverture.`,
      score: Math.min(100, Math.round(volatility.score + 10)),
      icon: '⚡'
    });
  } else if (volatility.score < 35 && normalizedEntropy < 0.90) {
    insightMap.set('volatility', {
      id: 'vol-stable',
      type: InsightType.INFO,
      title: 'Flux Laminaire & Condensation',
      description: `Structure hautement cohérente (Entropie comprimée à ${(normalizedEntropy * 100).toFixed(1)}%). Les résonances périodiques et les attracteurs de Markov présentent une fidélité prédictive maximale.`,
      score: Math.min(100, Math.round(90 - volatility.score)),
      icon: '🌊'
    });
  }

  // =========================================================================
  // 2. TENDANCE MULTI-ÉCHELLE (Exposant de Hurst / Persistance Fractale)
  // =========================================================================
  const hurst = calculateFractalIndex(history);
  if (hurst > 0.58) {
    insightMap.set('fractal-hurst', {
      id: 'hurst-trend',
      type: InsightType.OPPORTUNITY,
      title: 'Persistance de Tendance (Hurst > 0.55)',
      description: `Exposant de Hurst calculé à ${hurst.toFixed(2)}. Le flux de ${drawName} maintient une mémoire longue positive : les numéros récents à fort momentum ont une probabilité de rétention accrue.`,
      score: Math.min(100, Math.round(hurst * 120)),
      icon: '📈'
    });
  } else if (hurst < 0.42) {
    insightMap.set('fractal-hurst', {
      id: 'hurst-reversion',
      type: InsightType.INFO,
      title: 'Régime de Retour à la Moyenne',
      description: `Exposant de Hurst sous la ligne brownienne (${hurst.toFixed(2)}). Dynamique oscillatoire anti-persistante : haute attractivité pour les ruptures d'écarts et la compensation des retards.`,
      score: Math.min(100, Math.round((1.0 - hurst) * 120)),
      icon: '🔄'
    });
  }

  // =========================================================================
  // 3. STATISTIQUES ROBUSTES DES ÉCARTS (MAD GAPS)
  // =========================================================================
  const allGaps = gaps.map(g => g.gap);
  const medianGap = getMedian(allGaps);
  const madGap = Math.max(1.0, getMAD(allGaps, medianGap));
  const dynamicGapThreshold = medianGap + (2.5 * madGap);

  const spectralMap = new Map<number, number>();
  spectral.forEach(s => spectralMap.set(s.number, s.energy));  
  const allEnergies = spectral.map(s => s.energy);
  const medianEnergy = getMedian(allEnergies);
  const q3Energy = getMedian(allEnergies.filter(e => e >= medianEnergy));

  const sortedGaps = [...gaps].sort((a, b) => b.gap - a.gap);
  for (const g of sortedGaps) {
    const energy = spectralMap.get(g.number) || 0;
    
    if (g.gap > dynamicGapThreshold && energy > q3Energy) {
      insightMap.set(`num-${g.number}`, {
        id: `hybrid-${g.number}`,
        type: InsightType.OPPORTUNITY,
        title: `Convergence Critique : Numéro ${g.number}`,
        description: `Signal Hybride Majeur : Écart statistique exceptionnel (${g.gap} tirages) combiné à une haute résonance spectrale (${Math.round(energy)}%). Probabilité de déclenchement imminente.`,
        score: 98,
        icon: '🔥'
      });
    } else if (g.gap > dynamicGapThreshold * 1.3) {
      if (!insightMap.has(`num-${g.number}`)) {
        insightMap.set(`num-${g.number}`, {
          id: `gap-crit-${g.number}`,
          type: InsightType.RISK,
          title: `Tension Maximale : Numéro ${g.number}`,
          description: `Absent depuis ${g.gap} tirages (Écart supérieur à Médiane + 3.2×MAD). Risque d'anomalie de blocage persistant ou de rupture explosive.`,
          score: 88,
          icon: '💣'
        });
      }
    }
  }

  // =========================================================================
  // 4. RÉSONANCE SPECTRALE DOMINANTE
  // =========================================================================
  const topSpectral = [...spectral].sort((a, b) => b.energy - a.energy)[0];
  const maxEnergy = Math.max(...allEnergies, 0);
  const highEnergyThreshold = q3Energy + 0.4 * (maxEnergy - q3Energy);

  if (topSpectral && topSpectral.energy > highEnergyThreshold) {
    if (!insightMap.has(`num-${topSpectral.number}`)) {
      insightMap.set(`num-${topSpectral.number}`, {
        id: `spec-res-${topSpectral.number}`,
        type: InsightType.OPPORTUNITY,
        title: `Vecteur Harmonique : Numéro ${topSpectral.number}`,
        description: `Composante de Fourier dominante (${Math.round(topSpectral.energy)}% énergie relative). Fréquence périodique en synchronisation de phase avec le cycle actif.`,
        score: 93,
        icon: '🎯'
      });
    }
  }

  // =========================================================================
  // 5. HORLOGE CADENTIELLE (Régularité Métronomique)
  // =========================================================================
  const clock = regularity.find(r => r.stdDev < madGap && r.lastGaps.length >= 3);
  if (clock) {
    const imminence = Math.abs(clock.avgGap - clock.currentGap);
    const dynamicWindow = Math.max(1.0, madGap * 0.5);
    
    if (imminence <= dynamicWindow && !insightMap.has(`num-${clock.number}`)) {
      insightMap.set(`num-${clock.number}`, {
        id: `clock-${clock.number}`,
        type: InsightType.OPPORTUNITY,
        title: `Séquence Horloge : Numéro ${clock.number}`,
        description: `Cadence métronomique détectée (Écart-type résiduel : ${clock.stdDev.toFixed(1)}). Fenêtre d'occurrence estimée à ±${Math.round(dynamicWindow)} tirages.`,
        score: 95,
        icon: '⏱️'
      });
    }
  }

  // Tri déterministe par score décroissant puis par ID
  return Array.from(insightMap.values())
    .sort((a, b) => b.score !== a.score ? b.score - a.score : a.id.localeCompare(b.id))
    .slice(0, 5);
};
