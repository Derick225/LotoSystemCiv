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
    detectGameRegime
} from './mathService';

const SCORE_CACHE = new Map<string, { data: Record<number, ScoreBreakdown>, ts: number }>();

export const precomputeBaseScores = async (
    drawName: string, 
    history: DrawResult[], 
    metrics?: any
): Promise<Record<number, ScoreBreakdown>> => {
    const now = Date.now();
    const cached = SCORE_CACHE.get(drawName);
    
    // Cache valide 1 heure pour la performance
    if (cached && (now - cached.ts < 3600000)) return cached.data;
    
    const weights = await getAlgoWeights(drawName);
    
    // On appelle le moteur maître pour obtenir le breakdown par numéro
    const masterPred = await generateMasterPrediction(drawName, history, weights, metrics);
    const data = masterPred.breakdown || {};
    
    // Sécurité : si le breakdown est incomplet, on initialise les numéros manquants
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
    
    let stability = 0.5, chaos = 0.3, harmony = 0.5, wavelet = 0.4, orchestration = 0.4;
    
    if (vol.score > 60) { chaos = 0.7; stability = 0.3; wavelet = 0.7; }
    if (ent.normalized > 0.9) { chaos = 0.8; orchestration = 0.2; }
    if (reg.regime === 'PERSISTANT') { stability = 0.8; harmony = 0.7; orchestration = 0.8; }
    
    return { stability, chaos, harmony, wavelet, orchestration };
}

export async function generatePlatinumPrediction(
    drawName: string, 
    history: DrawResult[],
    precomputedMetrics?: any,
    userBias: StrategyBias = { stability: 0.5, chaos: 0.3, harmony: 0.2, wavelet: 0.4, orchestration: 0.4 }
): Promise<PlatinumResult> {
    if (!history || history.length < 5) throw new Error("Historique insuffisant pour la fusion.");

    const scores = await precomputeBaseScores(drawName, history, precomputedMetrics);
    const combinations: PlatinumCombo[] = [];
    const pool = Object.keys(scores).map(Number);

    if (pool.length === 0) throw new Error("Échec de la génération du dictionnaire de scores.");

    // Génération de 5 combinaisons Élite
    for (let i = 0; i < 5; i++) {
        const combo: number[] = [];
        const tempPool = [...pool];
        
        while (combo.length < 5 && tempPool.length > 0) {
            let bestCandidate = -1;
            let bestVal = -Infinity;
            
            // Tournoi stochastique (on prend 12 candidats au hasard et on garde le meilleur selon les biais)
            const tourneySize = Math.min(12, tempPool.length);
            for(let k = 0; k < tourneySize; k++) {
                const idx = Math.floor(Math.random() * tempPool.length);
                const n = tempPool[idx];
                const b = scores[n];
                
                // Formule de Fusion Platinum
                const val = 
                    ((b.spectral || 0) * userBias.harmony) + 
                    ((b.momentum || 50) * userBias.stability) + 
                    ((b.gap || 0) * userBias.chaos) +
                    ((b.wavelet || 0) * userBias.wavelet) +
                    ((b.orchestration || 0) * userBias.orchestration);

                if (val > bestVal) {
                    bestVal = val;
                    bestCandidate = n;
                }
            }
            
            if (bestCandidate !== -1) {
                combo.push(bestCandidate);
                tempPool.splice(tempPool.indexOf(bestCandidate), 1);
            }
        }
        
        combo.sort((a,b) => a - b);
        
        // Calcul du score de cohérence de la combinaison
        let totalComboScore = 0;
        combo.forEach(n => {
            const b = scores[n];
            totalComboScore += 
                ((b.spectral || 0) * userBias.harmony) + 
                ((b.momentum || 50) * userBias.stability) + 
                ((b.gap || 0) * userBias.chaos) +
                ((b.wavelet || 0) * userBias.wavelet) +
                ((b.orchestration || 0) * userBias.orchestration);
        });
        
        const avgBias = (userBias.harmony + userBias.stability + userBias.chaos + userBias.wavelet + userBias.orchestration) / 5;
        const normalizedScore = Math.min(99, Math.round(totalComboScore / (5 * (avgBias + 0.1))));
        
        combinations.push({
            numbers: combo,
            score: normalizedScore,
            tags: i === 0 ? ["Top Convergence"] : ["Vecteur Platinum"],
            breakdown: { 
                harmony: Math.round(userBias.harmony * 100), 
                stability: Math.round(userBias.stability * 100), 
                chaos: Math.round(userBias.chaos * 100),
                wavelet: Math.round(userBias.wavelet * 100),
                orchestration: Math.round(userBias.orchestration * 100),
                pattern: normalizedScore 
            }
        });
    }

    const recurrence: Record<number, number> = {};
    combinations.forEach(c => c.numbers.forEach(n => recurrence[n] = (recurrence[n] || 0) + 1));
    const kingNumbers = Object.entries(recurrence)
        .map(([n, count]) => ({ number: parseInt(n), count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 7);

    return {
        id: crypto.randomUUID(),
        kingNumbers, 
        targetSumRange: { min: 140, max: 310, reason: "Biais Sigma Platinum" },
        hotZonesSpectro: combinations[0].numbers,
        combinations: combinations.sort((a, b) => b.score - a.score),
        confidence: combinations[0].score,
        analysis: `Synthèse effectuée. Prédominance ${userBias.harmony > 0.6 ? 'Spectrale' : 'Temporelle'}. Convergence identifiée sur les secteurs ${kingNumbers.slice(0,2).map(k=>k.number).join(' & ')}.`,
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
