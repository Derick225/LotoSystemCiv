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
    calculateRegularity,
    calculateACValue
} from './mathService';

/**
 * Nexus MetaAnalyst v15.5 - Synchronized Synthesis Kernel
 * Fusionne les signaux algorithmiques pour générer des super-combinaisons à haute diversité.
 */

const SCORE_CACHE = new Map<string, { data: Record<number, ScoreBreakdown>, ts: number }>();

export const precomputeBaseScores = async (
    drawName: string, 
    history: DrawResult[], 
    metrics?: any
): Promise<Record<number, ScoreBreakdown>> => {
    const now = Date.now();
    const cached = SCORE_CACHE.get(drawName);
    
    if (cached && (now - cached.ts < 1800000)) return cached.data;
    
    const weights = await getAlgoWeights(drawName);
    const deepHistory = history.slice(0, 120);
    
    // FIX: Signature alignée avec predictionEngine.ts
    const masterPred = await generateMasterPrediction(drawName, deepHistory, weights, metrics);
    
    const data = masterPred.breakdown || {};
    
    for (let i = 1; i <= 90; i++) {
        if (!data[i]) {
            data[i] = { 
                frequency: 0, gap: 0, spectral: 0, fractal: 0, markov: 0, 
                wavelet: 0, momentum: 0, orchestration: 0, equilibrium: 50 
            } as any;
        }
    }

    SCORE_CACHE.set(drawName, { data, ts: now });
    return data;
};

export function calculateOptimalUserBias(drawName: string, history: DrawResult[]): StrategyBias {
    const vol = calculateVolatility(history);
    const ent = calculateShannonEntropy(history);
    const reg = detectGameRegime(history);
    const lastDraw = history[0];
    
    let stability = 0.35, chaos = 0.4, harmony = 0.45, wavelet = 0.5, orchestration = 0.55;
    
    if (ent.normalized > 0.9) {
        stability = 0.2; 
        orchestration += 0.2; 
    }

    const machineOverlap = lastDraw.machine ? lastDraw.gagnants.filter(n => lastDraw.machine?.includes(n)).length : 0;
    if (machineOverlap > 0) orchestration *= 1.35;
    
    if (vol.score > 60) { chaos = 0.75; stability = 0.25; }
    if (reg.regime === 'PERSISTANT') { stability = 0.7; harmony = 0.7; orchestration = 0.6; }
    
    return { stability, chaos, harmony, wavelet, orchestration };
}

export async function generatePlatinumPrediction(
    drawName: string, 
    history: DrawResult[],
    precomputedMetrics?: any,
    userBias?: StrategyBias
): Promise<PlatinumResult> {
    if (!history || history.length < 15) throw new Error("Historique insuffisant pour la synthèse.");

    const bias = userBias || calculateOptimalUserBias(drawName, history);
    const scores = await precomputeBaseScores(drawName, history, precomputedMetrics);
    const regularity = calculateRegularity(history);
    const pool = Object.keys(scores).map(Number);

    const rawKingPool = pool.map(n => {
        const b = scores[n];
        const val = ((b.spectral || 0) * bias.harmony) + 
                    ((b.momentum || 50) * bias.stability) + 
                    ((b.markov || 0) * bias.orchestration * 1.5) +
                    ((b.wavelet || 0) * (bias.wavelet || 0.5));
        return { num: n, val };
    });

    const kingNumbers = rawKingPool
        .filter(item => {
            const reg = regularity.find(r => r.number === item.num);
            return (reg?.avgGap || 0) > 10; 
        })
        .sort((a, b) => b.val - a.val)
        .slice(0, 8)
        .map(k => k.num);

    const combinations: PlatinumCombo[] = [];

    for (let i = 0; i < 5; i++) {
        let bestCombo: number[] = [];
        let maxFitness = -Infinity;

        for (let attempt = 0; attempt < 80; attempt++) {
            const candidate: number[] = [];
            const tempPool = [...pool];
            let kingCount = 0;

            while (candidate.length < 5 && tempPool.length > 0) {
                let bestInTournament = -1;
                let topTournamentScore = -Infinity;

                for (let k = 0; k < 6; k++) {
                    const idx = Math.floor(Math.random() * tempPool.length);
                    const n = tempPool[idx];
                    const b = scores[n];
                    const score = ((b.spectral || 0) * bias.harmony) + 
                                  ((b.momentum || 0) * bias.stability) + 
                                  ((b.gap || 0) * bias.chaos);

                    if (score > topTournamentScore) {
                        topTournamentScore = score;
                        bestInTournament = n;
                    }
                }

                if (bestInTournament !== -1) {
                    const isKing = kingNumbers.includes(bestInTournament);
                    if (isKing && kingCount >= 3) {
                        tempPool.splice(tempPool.indexOf(bestInTournament), 1);
                        continue;
                    }
                    if (isKing) kingCount++;
                    candidate.push(bestInTournament);
                    tempPool.splice(tempPool.indexOf(bestInTournament), 1);
                }
            }

            candidate.sort((a, b) => a - b);
            const sum = candidate.reduce((a, b) => a + b, 0);
            const ac = calculateACValue(candidate);
            let fitness = candidate.reduce((acc, n) => acc + (scores[n].spectral || 0), 0);
            
            if (sum >= 170 && sum <= 245) fitness += 30;
            if (ac >= 8) fitness += 20;

            if (fitness > maxFitness) {
                maxFitness = fitness;
                bestCombo = candidate;
            }
        }

        combinations.push({
            numbers: bestCombo,
            score: Math.min(99, Math.round(maxFitness / 5.5)),
            tags: i === 0 ? ["Alpha Fusion"] : ["Vecteur Tournoi"],
            breakdown: { 
                harmony: Math.round(bias.harmony * 100), 
                stability: Math.round(bias.stability * 100), 
                chaos: Math.round(bias.chaos * 100),
                kings: bestCombo.filter(n => kingNumbers.includes(n)).length
            }
        });
    }

    return {
        id: crypto.randomUUID(),
        kingNumbers: kingNumbers.map(n => ({ number: n, count: 1 })), 
        combinations: combinations.sort((a, b) => b.score - a.score),
        confidence: Math.round(combinations[0].score * 0.95),
        analysis: `Synthèse v15.5 active. DNA synchronisé. Biais optimisé : Harmonie ${(bias.harmony*100).toFixed(0)}%.`,
        drawName,
        timestamp: Date.now()
    };
}

export const savePlatinumHistory = (result: PlatinumResult) => {
    const key = `platinum_hist_${result.drawName}`;
    const existingStr = localStorage.getItem(key);
    const existing = existingStr ? JSON.parse(existingStr) : [];
    localStorage.setItem(key, JSON.stringify([result, ...existing].slice(0, 10)));
};