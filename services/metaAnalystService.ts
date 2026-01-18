
import { 
  PlatinumResult, 
  DrawResult, 
  StrategyBias,
  PlatinumCombo,
  ScoreBreakdown
} from '../types';
import { 
  getAlgoWeights, 
  generateMasterPrediction
} from './predictionEngine';
import { 
    calculateVolatility, 
    calculateShannonEntropy, 
    detectGameRegime,
    calculateMean,
    calculateStandardDeviation
} from './mathService';

const SCORE_CACHE = new Map<string, { data: Record<number, ScoreBreakdown>, ts: number }>();

export const precomputeBaseScores = async (
    drawName: string, 
    history: DrawResult[], 
    metrics?: any
): Promise<Record<number, ScoreBreakdown>> => {
    const now = Date.now();
    const cached = SCORE_CACHE.get(drawName);
    if (cached && (now - cached.ts < 3600000)) return cached.data;
    const weights = await getAlgoWeights(drawName);
    const masterPred = await generateMasterPrediction(drawName, history, weights, metrics);
    const data = masterPred.breakdown || {};
    SCORE_CACHE.set(drawName, { data, ts: now });
    return data;
};

export function calculateOptimalUserBias(drawName: string, history: DrawResult[]): StrategyBias {
    const vol = calculateVolatility(history);
    const ent = calculateShannonEntropy(history);
    const reg = detectGameRegime(history);
    let stability = 0.5, chaos = 0.3, harmony = 0.5;
    if (vol.score > 60) { chaos = 0.7; stability = 0.3; }
    if (ent.normalized > 0.9) { chaos = 0.8; }
    if (reg.hurst > 0.6) { stability = 0.8; harmony = 0.7; }
    return { stability, chaos, harmony };
}

export async function generatePlatinumPrediction(
    drawName: string, 
    history: DrawResult[],
    precomputedMetrics?: any,
    userBias: StrategyBias = { stability: 0.5, chaos: 0.3, harmony: 0.2 }
): Promise<PlatinumResult> {
    const scores = await precomputeBaseScores(drawName, history, precomputedMetrics);
    const combinations: PlatinumCombo[] = [];
    const pool = Object.keys(scores).map(Number);

    for (let i = 0; i < 5; i++) {
        const combo: number[] = [];
        const tempPool = [...pool];
        while (combo.length < 5 && tempPool.length > 0) {
            let bestCandidate = -1, bestVal = -1;
            const tourneySize = Math.min(10, tempPool.length);
            for(let k=0; k<tourneySize; k++) {
                const idx = Math.floor(Math.random() * tempPool.length);
                const n = tempPool[idx];
                const b = scores[n];
                const val = ((b.spectral || 0) * userBias.harmony) + ((b.momentum || 50) * userBias.stability) + ((b.gap || 0) * userBias.chaos);
                if (val > bestVal) { bestVal = val; bestCandidate = n; }
            }
            if (bestCandidate !== -1) { combo.push(bestCandidate); tempPool.splice(tempPool.indexOf(bestCandidate), 1); }
        }
        combo.sort((a,b) => a-b);
        let totalScore = 0;
        combo.forEach(n => {
            const b = scores[n];
            totalScore += ((b.spectral || 0) * userBias.harmony) + ((b.momentum || 50) * userBias.stability) + ((b.gap || 0) * userBias.chaos);
        });
        const normalizedScore = Math.min(99, Math.round(totalScore / (5 * (userBias.harmony + userBias.stability + userBias.chaos + 0.1))));
        combinations.push({
            numbers: combo,
            score: normalizedScore,
            tags: ["Synthèse Platinum"],
            breakdown: { harmony: Math.round(userBias.harmony * 100), stability: Math.round(userBias.stability * 100), chaos: Math.round(userBias.chaos * 100), pattern: normalizedScore }
        });
    }

    const recurrence: Record<number, number> = {};
    combinations.forEach(c => c.numbers.forEach(n => recurrence[n] = (recurrence[n] || 0) + 1));
    const kingNumbers = Object.entries(recurrence).map(([n, count]) => ({ number: parseInt(n), count })).sort((a, b) => b.count - a.count).slice(0, 7);

    return {
        id: crypto.randomUUID(),
        kingNumbers, 
        targetSumRange: { min: 150, max: 300, reason: "Équilibre Gaussien" },
        hotZonesSpectro: combinations[0].numbers,
        combinations: combinations.sort((a, b) => b.score - a.score),
        confidence: combinations[0].score,
        analysis: `Synthèse Platinum générée avec un biais : Harmonie ${(userBias.harmony*100).toFixed(0)}%, Stabilité ${(userBias.stability*100).toFixed(0)}%, Chaos ${(userBias.chaos*100).toFixed(0)}%.`,
        drawName,
        timestamp: Date.now()
    };
}

// Fix: Adding savePlatinumHistory requested in MetaAnalystTab.tsx
export const savePlatinumHistory = (result: PlatinumResult) => {
    const key = `platinum_hist_${result.drawName}`;
    const existingStr = localStorage.getItem(key);
    const existing = existingStr ? JSON.parse(existingStr) : [];
    localStorage.setItem(key, JSON.stringify([result, ...existing].slice(0, 10)));
};
