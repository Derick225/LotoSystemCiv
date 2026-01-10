
import { PlatinumResult, PlatinumCombo, ScoreBreakdown, DrawResult, SpectralMetric } from '../types';
import { getAlgoWeights, generateMasterPrediction } from './predictionEngine';
import { detectGameRegime, calculateVolatility, calculateSpectralMetricsAsync } from './mathService';
import { fetchResults } from './lotteryService';

/**
 * Nexus MetaAnalyst v5.3
 * Couche d'abstraction qui fusionne les signaux faibles pour générer des "Super Combinaisons".
 */

const PLATINUM_STORAGE_KEY = 'lotopro_platinum_history';

export interface StrategyBias {
    stability: number; // Poids donné aux stats long terme (Momentum)
    chaos: number;     // Poids donné à l'entropie et à la vélocité (Rupture)
    harmony: number;   // Poids donné à la résonance spectrale (Cycle)
}

// Cache avec timestamp pour éviter de recalculer si les données n'ont pas changé
const SCORE_CACHE = new Map<string, { data: Record<number, ScoreBreakdown>, ts: number }>();

export const precomputeBaseScores = async (
    drawName: string, 
    history: DrawResult[], 
    metrics?: any
): Promise<Record<number, ScoreBreakdown>> => {
    const now = Date.now();
    const cached = SCORE_CACHE.get(drawName);
    
    // Cache valide 1 heure
    if (cached && (now - cached.ts < 3600000)) {
        return cached.data;
    }
    
    const weights = await getAlgoWeights(drawName);
    // On appelle le moteur de prédiction standard pour avoir les scores bruts par numéro
    const masterPred = await generateMasterPrediction(drawName, history, weights, metrics);
    
    const data = masterPred.breakdown || {};
    SCORE_CACHE.set(drawName, { data, ts: now });
    return data;
};

export const savePlatinumHistory = (result: PlatinumResult) => {
    try {
        const raw = localStorage.getItem(PLATINUM_STORAGE_KEY);
        const history = raw ? JSON.parse(raw) : [];
        const updated = [result, ...history.filter((r: any) => r.drawName === result.drawName)].slice(0, 50);
        localStorage.setItem(PLATINUM_STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
        console.warn("Storage quota exceeded for Platinum history", e);
    }
};

/**
 * Calcule automatiquement le biais utilisateur optimal selon le profil du tirage.
 */
export const calculateOptimalUserBias = (
  drawName: string, 
  history: DrawResult[]
): StrategyBias => {
  const { regime, hurst } = detectGameRegime(history);
  const { score: volScore } = calculateVolatility(history);
  const name = drawName.toUpperCase();

  // Profils par défaut
  let stability = 0.5;
  let chaos = 0.3;
  let harmony = 0.5;

  // 1. Profilage par Nom (Spécificité du Jeu)
  if (name.includes('MONDAY') || name.includes('BONANZA')) {
      return { stability: 0.3, chaos: 0.7, harmony: 0.45 };
  }
  
  if (name.includes('NATIONAL') || name.includes('DIAMANT')) {
      return { stability: 0.8, chaos: 0.2, harmony: 0.6 };
  }

  // 2. Profilage Mathématique
  if (regime === 'PERSISTANT' && hurst > 0.65) {
      stability = 0.8;
      chaos = 0.2;
  } else if (regime === 'ANTI-PERSISTANT') {
      stability = 0.4;
      harmony = 0.8;
  } else if (volScore > 70) {
      chaos = 0.7;
      stability = 0.2;
  }

  return { 
      stability: parseFloat(stability.toFixed(2)), 
      chaos: parseFloat(chaos.toFixed(2)), 
      harmony: parseFloat(harmony.toFixed(2)) 
  };
};

export async function generatePlatinumPrediction(
    drawName: string, 
    history?: DrawResult[],
    precomputedMetrics?: any,
    userBias: StrategyBias = { stability: 0.5, chaos: 0.3, harmony: 0.2 }
): Promise<PlatinumResult> {
    const data = history || (await fetchResults(drawName)).data;
    if (data.length < 20) throw new Error("Historique insuffisant pour la fusion.");

    const scores = await precomputeBaseScores(drawName, data, precomputedMetrics);
    const combinations: PlatinumCombo[] = [];
    const pool = Object.keys(scores).map(Number);

    // Algorithme de synthèse pondérée par le Biais Utilisateur
    for (let i = 0; i < 5; i++) {
        const combo: number[] = [];
        const tempPool = [...pool];
        
        while (combo.length < 5 && tempPool.length > 0) {
            // Sélection d'un candidat par tournoi (Tournament Selection)
            let bestCandidate = -1;
            let bestVal = -Infinity;
            
            // On en prend quelques uns au hasard pour comparer
            for(let k=0; k<10; k++) {
                if (tempPool.length === 0) break;
                const idx = Math.floor(Math.random() * tempPool.length);
                const n = tempPool[idx];
                const b = scores[n];
                
                // Formule Platinum : Score = (Spectral * Harmony) + (Momentum * Stability) + (Velocity * Chaos)
                const val = ((b.spectral || 0) * userBias.harmony) + 
                            ((b.momentum || 0) * userBias.stability) + 
                            ((b.gap || 0) * userBias.chaos);
                
                if (val > bestVal) {
                    bestVal = val;
                    bestCandidate = n;
                }
            }
            
            if (bestCandidate !== -1) {
                combo.push(bestCandidate);
                const removeIdx = tempPool.indexOf(bestCandidate);
                if (removeIdx !== -1) tempPool.splice(removeIdx, 1);
            }
        }
        
        combo.sort((a,b) => a-b);

        // Calcul du score final de la combinaison
        let totalScore = 0;
        combo.forEach(n => {
            const b = scores[n];
            const harmonicVal = (b.spectral || 0) * userBias.harmony;
            const stabilityVal = (b.momentum || 0) * userBias.stability;
            const chaosVal = (b.gap || 0) * userBias.chaos;
            totalScore += (harmonicVal + stabilityVal + chaosVal);
        });

        // Normalisation
        const biasSum = userBias.harmony + userBias.stability + userBias.chaos || 1;
        const normalizedScore = Math.min(100, Math.round(totalScore / (5 * biasSum) * 1.2));

        combinations.push({
            numbers: combo,
            score: normalizedScore,
            tags: ["Synthèse Platinum"],
            breakdown: { 
                harmony: Math.round(userBias.harmony * 100), 
                stability: Math.round(userBias.stability * 100), 
                chaos: Math.round(userBias.chaos * 100), 
                pattern: 50 
            }
        });
    }

    // Calcul des King Numbers (les numéros les plus récurrents dans les 5 combos)
    const freqMap: Record<number, number> = {};
    combinations.forEach(c => c.numbers.forEach(n => freqMap[n] = (freqMap[n] || 0) + 1));
    const kingNumbers = Object.entries(freqMap)
        .map(([n, c]) => ({ number: Number(n), count: c }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    // Calcul des Hot Zones Spectrales (si metrics dispo)
    const spectralMetrics = precomputedMetrics?.spectral || await calculateSpectralMetricsAsync(data);
    const hotZonesSpectro = spectralMetrics.slice(0, 10).map((m: SpectralMetric) => m.number);

    return {
        kingNumbers, 
        targetSumRange: { min: 150, max: 300, reason: "Équilibre Gaussien" },
        hotZonesSpectro,
        combinations: combinations.sort((a, b) => b.score - a.score),
        confidence: 85,
        analysis: `Synthèse Platinum générée avec un biais : Harmonie ${(userBias.harmony*100).toFixed(0)}%, Stabilité ${(userBias.stability*100).toFixed(0)}%, Chaos ${(userBias.chaos*100).toFixed(0)}%.`,
        drawName,
        timestamp: Date.now()
    };
}
