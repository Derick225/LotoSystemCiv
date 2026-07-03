import type { DrawResult, SmartInsight, SpectralMetric, NumberGap, NumberRegularity } from '../types';
import { calculateVolatility } from './mathService';

export enum InsightType {
  RISK = 'risk',
  OPPORTUNITY = 'opportunity',
  INFO = 'info'
}

const getMedian = (arr: number[]): number => {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const getMAD = (arr: number[], median: number): number => {
  if (arr.length === 0) return 0;
  const absDeviations = arr.map(v => Math.abs(v - median));
  return getMedian(absDeviations) * 1.4826;
};

export const generateSmartInsights = async (
  _drawName: string,
  history: DrawResult[],
  spectral: SpectralMetric[],
  gaps: NumberGap[],
  regularity: NumberRegularity[]
): Promise<SmartInsight[]> => {
  const insightMap = new Map<string, SmartInsight>();
  
  const minHistoryRequired = Math.max(10, Math.floor(history.length * 0.1));
  if (history.length < minHistoryRequired) return [];
  
  const volatility = calculateVolatility(history);
  if (volatility.score > 70) {
    insightMap.set('volatility', { id: 'vol-chaos', type: InsightType.RISK, title: 'Zone de Turbulence', description: `Instabilité détectée (${volatility.score}%). Le système diverge vers un régime chaotique.`, score: 90, icon: '⚡' });
  } else if (volatility.score < 30) {
    insightMap.set('volatility', { id: 'vol-stable', type: InsightType.INFO, title: 'Flux Laminaire', description: `Stabilité vectorielle excellente. Les modèles spectraux sont hautement fiables.`, score: 85, icon: '🌊' });
  }
  
  const allGaps = gaps.map(g => g.gap);
  const medianGap = getMedian(allGaps);
  const madGap = getMAD(allGaps, medianGap);
  
  // Seuil critique robuste : Médiane + 3 * MAD (équivalent de 3-sigma, insensible aux outliers)
  const dynamicGapThreshold = medianGap + (3 * madGap);
  
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
        id: `hybrid-${g.number}`, type: InsightType.OPPORTUNITY, title: `Convergence Critique: ${g.number}`,
        description: `Signal Hybride : Écart extrême (${g.gap}) + Énergie spectrale haute (${Math.round(energy)}%). Sortie imminente probable.`, score: 98, icon: '🔥'
      });
    } else if (g.gap > dynamicGapThreshold * 1.2) {
      if (!insightMap.has(`num-${g.number}`)) {
        insightMap.set(`num-${g.number}`, {
          id: `gap-crit-${g.number}`, type: InsightType.RISK, title: `Tension Maximale: ${g.number}`,
          description: `Absent depuis ${g.gap} tirages. Écart hors normes (> Médiane + 3.6*MAD). Risque de blocage prolongé.`, score: 88, icon: '💣'
        });
      }
    }
  }
  
  const topSpectral = [...spectral].sort((a, b) => b.energy - a.energy)[0];
  const maxEnergy = Math.max(...allEnergies);
  const highEnergyThreshold = q3Energy + 0.5 * (maxEnergy - q3Energy);
  
  if (topSpectral && topSpectral.energy > highEnergyThreshold) {
    if (!insightMap.has(`num-${topSpectral.number}`)) {
      insightMap.set(`num-${topSpectral.number}`, {
        id: `spec-res-${topSpectral.number}`, type: InsightType.OPPORTUNITY, title: `Résonance Harmonique: ${topSpectral.number}`,
        description: `Vecteur dominant (${Math.round(topSpectral.energy)}% énergie). Cycle périodique parfaitement aligné.`, score: 92, icon: '🎯'
      });
    }
  }
  
  const clock = regularity.find(r => r.stdDev < madGap && r.lastGaps.length >= 3);
  if (clock) {
    const imminence = Math.abs(clock.avgGap - clock.currentGap);
    const dynamicWindow = Math.max(1.0, madGap * 0.5);
    
    if (imminence <= dynamicWindow && !insightMap.has(`num-${clock.number}`)) {
      insightMap.set(`num-${clock.number}`, {
        id: `clock-${clock.number}`, type: InsightType.OPPORTUNITY, title: `Séquence Horloge: ${clock.number}`,
        description: `Régularité métronomique détectée. Sortie attendue dans la fenêtre immédiate (±${Math.round(dynamicWindow)}t).`, score: 94, icon: '⏱️'
      });
    }
  }
    return Array.from(insightMap.values())
    .sort((a, b) => b.score !== a.score ? b.score - a.score : a.id.localeCompare(b.id)) // Tri déterministe
    .slice(0, 4);
};
