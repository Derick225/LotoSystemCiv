
import { PlatinumResult, PlatinumCombo, ScoreBreakdown, DrawResult, SpectralMetric, FractalMetric } from '../types';
import { fetchResults } from './lotteryService';
import { calculateSpectralMetricsAsync, detectGameRegime, calculateACValue, calculateVolatility } from './mathService';
import { getAlgoWeights, generateMasterPrediction } from './predictionEngine';

const PLATINUM_STORAGE_KEY = 'lotopro_platinum_history';

export interface StrategyBias {
    stability: number; // 0.0 - 1.0
    chaos: number;     // 0.0 - 1.0
    harmony: number;   // 0.0 - 1.0
}

const STRATEGY_PROFILES = [
    { name: 'Alpha-Sync', focus: 'spectral' as keyof ScoreBreakdown, baseWeight: 2.0, type: 'harmony', desc: 'Résonance FFT maximale (Harmoniques purs)' },
    { name: 'Chaos-Theory', focus: 'gap_velocity' as keyof ScoreBreakdown, baseWeight: 2.2, type: 'chaos', desc: 'Capture des ruptures de tendance (Vélocité)' },
    { name: 'Sigma-Mean', focus: 'equilibrium' as keyof ScoreBreakdown, baseWeight: 1.5, type: 'stability', desc: 'Retour à la moyenne (Mean Reversion)' },
    { name: 'Gamma-Moment', focus: 'momentum' as keyof ScoreBreakdown, baseWeight: 1.6, type: 'stability', desc: 'Accélération des flux courts (Inertie)' },
    { name: 'Omega-Shadow', focus: 'ai_intuition' as keyof ScoreBreakdown, baseWeight: 1.9, type: 'chaos', desc: 'Shadow Oracle (Signaux Faibles & Anti-Consensus)' }
];

/**
 * Calcule automatiquement le biais utilisateur optimal selon le profil du tirage.
 * Remplace la sélection manuelle par défaut.
 */
export const calculateOptimalUserBias = (
  drawName: string, 
  history: DrawResult[]
): StrategyBias => {
  const { regime, hurst } = detectGameRegime(history);
  const { score: volScore } = calculateVolatility(history);
  const name = drawName.toUpperCase();

  // 1. Profilage par Nom (Spécificité du Jeu)
  if (name.includes('MONDAY') || name.includes('BONANZA')) {
      // Jeux très volatils, besoin de Chaos et d'Harmonie pour contrer
      return { stability: 0.3, chaos: 0.7, harmony: 0.45 };
  }
  
  if (name.includes('NATIONAL') || name.includes('DIAMANT')) {
      // Jeux très stables, on maximise la stabilité
      return { stability: 0.8, chaos: 0.2, harmony: 0.6 };
  }

  // 2. Profilage par Analyse Mathématique (Fallback)
  let stability = 0.5;
  let chaos = 0.3;
  let harmony = 0.5;

  if (regime === 'PERSISTANT' && hurst > 0.65) {
      stability = 0.8;
      chaos = 0.2;
  } else if (regime === 'ANTI-PERSISTANT') {
      stability = 0.4;
      harmony = 0.8; // Les rebonds sont harmoniques
  } else if (volScore > 70) {
      // Haute volatilité = Chaos nécessaire
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
    precomputedMetrics?: {
        spectral: SpectralMetric[];
        fractal: FractalMetric[];
        velocity: Record<number, number>;
        cliques: Array<{ clique: number[], count: number }>;
    },
    userBias: StrategyBias = { stability: 0.5, chaos: 0.5, harmony: 0.5 }
): Promise<PlatinumResult> {
    const data = history || (await fetchResults(drawName)).data;
    if (data.length < 30) throw new Error("Historique insuffisant pour la Fusion Platinum.");

    const weights = await getAlgoWeights(drawName);
    const { regime } = detectGameRegime(data);
    
    // 1. GÉNÉRATION DE LA MATRICE DE SCORE BRUTE
    const masterPred = await generateMasterPrediction(drawName, data, weights, precomputedMetrics);
    const scores = masterPred.breakdown || {};
    
    // 2. PRÉPARATION DU POOL AVEC SYNERGIES VECTORIELLES
    const poolCandidates = Object.entries(scores)
        .map(([nStr, bd]) => {
            const n = parseInt(nStr);
            const breakdown = bd as ScoreBreakdown;
            
            const synergy = (breakdown.spectral * breakdown.frequency) / 2000; 
            
            const rawScore = Object.values(breakdown)
                .filter((v): v is number => typeof v === 'number')
                .reduce((a, b) => a + b, 0);
            
            const weightedScore = rawScore * (1 + (synergy / 100));
            
            return { n, breakdown, weightedScore };
        })
        .sort((a, b) => b.weightedScore - a.weightedScore); 

    const combinations: PlatinumCombo[] = [];

    // 3. BOUCLE DE FUSION
    for (const profile of STRATEGY_PROFILES) {
        let bestCombo: number[] = [];
        let maxScore = -Infinity;
        let bestBreakdown: any = null;
        let noImprovementCount = 0;
        
        const CONVERGENCE_LIMIT = 400; 
        const ITERATIONS = 2500;

        let adjustedWeight = profile.baseWeight;
        if (profile.type === 'stability') adjustedWeight *= (0.6 + userBias.stability * 0.8);
        if (profile.type === 'chaos') adjustedWeight *= (0.6 + userBias.chaos * 0.8);
        if (profile.type === 'harmony') adjustedWeight *= (0.6 + userBias.harmony * 0.8);

        if (regime.includes('PERSISTANT') && profile.type === 'stability') adjustedWeight *= 1.3;
        if (regime.includes('CHAOS') && profile.type === 'chaos') adjustedWeight *= 1.3;

        const activePoolDepth = Math.floor(35 + (userBias.chaos * 40));
        const activePool = poolCandidates.slice(0, activePoolDepth);

        for (let i = 0; i < ITERATIONS; i++) {
            if (i % 500 === 0) await new Promise(r => setTimeout(r, 0));

            const candidate = selectWeightedFromPool(activePool, 5, userBias.chaos);
            
            const evaluation = evaluateCandidate(candidate, scores, profile, combinations, adjustedWeight, userBias);
            
            if (evaluation.score > maxScore) {
                maxScore = evaluation.score;
                bestCombo = candidate;
                bestBreakdown = evaluation.breakdown;
                noImprovementCount = 0;
            } else {
                noImprovementCount++;
            }

            if (noImprovementCount > CONVERGENCE_LIMIT) break;
        }

        if (bestCombo.length === 5) {
            combinations.push({
                numbers: bestCombo.sort((a, b) => a - b),
                score: Math.round(maxScore / 10), 
                tags: [profile.name, profile.desc],
                breakdown: bestBreakdown
            });
        }
    }

    const spectralMetrics = precomputedMetrics?.spectral || await calculateSpectralMetricsAsync(data);

    return {
        kingNumbers: extractWeightedKingNumbers(combinations),
        targetSumRange: { min: 180, max: 270, reason: "Isocline de Gauss v6.2" },
        hotZonesSpectro: spectralMetrics.slice(0, 10).map((m: SpectralMetric) => m.number),
        combinations: combinations.sort((a, b) => b.score - a.score),
        confidence: masterPred.confidence,
        analysis: `Synthèse Platinum v11.1. Profil: S${(userBias.stability*10).toFixed(0)}/C${(userBias.chaos*10).toFixed(0)}/H${(userBias.harmony*10).toFixed(0)}. Régime: ${regime}.`,
        drawName,
        timestamp: Date.now()
    };
}

function selectWeightedFromPool(pool: { n: number, weightedScore: number }[], size: number, chaos: number): number[] {
    const result: Set<number> = new Set();
    const power = 4 - (chaos * 3); 
    const available = [...pool];

    while (result.size < size && available.length > 0) {
        let totalWeight = 0;
        
        const weights = available.map(c => {
            const w = Math.pow(c.weightedScore / 100, power);
            totalWeight += w;
            return w;
        });

        let random = Math.random() * totalWeight;
        let selectedIndex = -1;

        for (let i = 0; i < weights.length; i++) {
            random -= weights[i];
            if (random <= 0) {
                selectedIndex = i;
                break;
            }
        }
        
        if (selectedIndex === -1) selectedIndex = available.length - 1;

        result.add(available[selectedIndex].n);
        available.splice(selectedIndex, 1);
    }

    return Array.from(result);
}

function evaluateCandidate(
    nums: number[], 
    scores: Record<number, ScoreBreakdown>, 
    profile: any, 
    existing: PlatinumCombo[],
    weight: number,
    bias: StrategyBias
): { score: number, breakdown: { stability: number, chaos: number, harmony: number, pattern: number } } {
    let baseScore = 0;
    const breakdown = { stability: 0, chaos: 0, harmony: 0, pattern: 0 };
    
    nums.forEach(n => {
        const bd = scores[n];
        if (bd) {
            const focusVal = (bd[profile.focus as keyof ScoreBreakdown] || 50);
            
            const mainContribution = (focusVal as number) * weight;
            baseScore += mainContribution;
            breakdown.pattern += mainContribution;
            
            const sVal = (bd.orchestration * 0.5 * Math.pow(1 + bias.stability, 2)); 
            const hVal = (bd.spectral * 0.5 * Math.pow(1 + bias.harmony, 2));
            const cVal = (bd.gap_velocity * 0.5 * Math.pow(1 + bias.chaos, 2));
            
            baseScore += sVal + hVal + cVal;
            
            breakdown.stability += sVal;
            breakdown.harmony += hVal;
            breakdown.chaos += cVal;
        }
    });

    existing.forEach(combo => {
        const overlap = nums.filter(n => combo.numbers.includes(n)).length;
        if (overlap >= 4) baseScore -= 10000; 
        else if (overlap >= 3) baseScore -= 2500; 
        else if (overlap === 2) baseScore -= 150; 
    });

    const ac = calculateACValue(nums);
    if (ac < 6 && bias.stability > 0.6) {
        baseScore -= 800;
        breakdown.stability -= 150;
    }
    
    const sum = nums.reduce((a,b) => a+b, 0);
    if ((sum < 100 || sum > 350) && bias.chaos < 0.7) {
        baseScore -= 400;
        breakdown.chaos -= 100;
    }

    const factor = 10 / 5; 
    breakdown.stability = Math.max(0, Math.min(100, breakdown.stability * factor / 50));
    breakdown.chaos = Math.max(0, Math.min(100, breakdown.chaos * factor / 50));
    breakdown.harmony = Math.max(0, Math.min(100, breakdown.harmony * factor / 50));
    breakdown.pattern = Math.max(0, Math.min(100, breakdown.pattern * factor / 100));

    return { score: baseScore, breakdown };
}

function extractWeightedKingNumbers(combos: PlatinumCombo[]) {
    const weightedFreq: Record<number, number> = {};
    
    combos.forEach(c => {
        const rankWeight = 1 + (c.score / 1000); 
        c.numbers.forEach(n => {
            weightedFreq[n] = (weightedFreq[n] || 0) + rankWeight;
        });
    });

    return Object.entries(weightedFreq)
        .map(([n, w]) => ({ number: Number(n), count: Math.round(w), rawScore: w }))
        .sort((a, b) => b.rawScore - a.rawScore)
        .slice(0, 5)
        .map(k => ({ number: k.number, count: Math.round(k.rawScore) }));
}

export function getPlatinumHistory(drawName: string): PlatinumResult[] {
    try {
        const raw = localStorage.getItem(PLATINUM_STORAGE_KEY);
        return raw ? JSON.parse(raw).filter((r: any) => r.drawName === drawName) : [];
    } catch (e) { return []; }
}

export function savePlatinumHistory(result: PlatinumResult) {
    const all = getPlatinumHistory(result.drawName);
    localStorage.setItem(PLATINUM_STORAGE_KEY, JSON.stringify([result, ...all].slice(0, 50)));
}
