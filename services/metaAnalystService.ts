
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
    
    if (cached && (now - cached.ts < 3600000)) return cached.data;
    
    const weights = await getAlgoWeights(drawName);
    const masterPred = await generateMasterPrediction(drawName, history, weights, metrics);
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
    
    let stability = 0.5, chaos = 0.3, harmony = 0.5, wavelet = 0.4, orchestration = 0.4;
    
    if (vol.score > 60) { chaos = 0.7; stability = 0.3; wavelet = 0.7; }
    if (ent.normalized > 0.9) { chaos = 0.8; orchestration = 0.2; }
    if (reg.regime === 'PERSISTANT') { stability = 0.8; harmony = 0.7; orchestration = 0.8; }
    
    return { stability, chaos, harmony, wavelet, orchestration };
}

/**
 * GÉNÉRATION PLATINUM FUSION v8.0
 * Procédure : Synergies T-1 -> Orchestrations (-1/+1) -> Tamis Algorithmique
 */
export async function generatePlatinumPrediction(
    drawName: string, 
    history: DrawResult[],
    precomputedMetrics?: any,
    userBias: StrategyBias = { stability: 0.5, chaos: 0.3, harmony: 0.2, wavelet: 0.4, orchestration: 0.4 }
): Promise<PlatinumResult> {
    if (!history || history.length < 5) throw new Error("Historique insuffisant pour la fusion.");

    const scores = await precomputeBaseScores(drawName, history, precomputedMetrics);
    const lastWinners = history[0].gagnants;
    const correlationMatrix = precomputedMetrics?.correlationMatrix || {};

    // --- PHASE 1 : EXTRACTION DES SYNERGIES T-1 ---
    const synergyPool = new Set<number>();
    lastWinners.forEach(num => {
        const affinities = correlationMatrix[num]?.affinities || {};
        Object.entries(affinities).forEach(([targetStr, strength]) => {
            if (Number(strength) > 0.15) { // Seuil de synergie significative
                synergyPool.add(parseInt(targetStr));
            }
        });
    });

    // --- PHASE 2 : EXPANSION PAR ORCHESTRATION (-1 et +1 des synergies) ---
    const orchestrationPool = new Set<number>();
    synergyPool.forEach(syn => {
        orchestrationPool.add(syn);
        if (syn > 1) orchestrationPool.add(syn - 1);
        if (syn < 90) orchestrationPool.add(syn + 1);
    });

    // Conversion en pool de travail pour le tamis
    let targetPool = Array.from(orchestrationPool);

    // Sécurité : Si le pool de synergies est trop restreint, on complète avec les meilleurs scores globaux
    if (targetPool.length < 15) {
        const topGlobal = Object.keys(scores)
            .map(Number)
            .sort((a, b) => (scores[b].spectral + scores[b].momentum) - (scores[a].spectral + scores[a].momentum))
            .slice(0, 20);
        topGlobal.forEach(n => orchestrationPool.add(n));
        targetPool = Array.from(orchestrationPool);
    }

    // --- PHASE 3 : LE TAMIS PLATINUM (Tournament sur le pool filtré) ---
    const combinations: PlatinumCombo[] = [];

    for (let i = 0; i < 5; i++) {
        const combo: number[] = [];
        const tempPool = [...targetPool];
        
        while (combo.length < 5 && tempPool.length > 0) {
            let bestCandidate = -1;
            let bestVal = -Infinity;
            
            // Tournoi stochastique focalisé sur le pool d'orchestration
            const tourneySize = Math.min(10, tempPool.length);
            for(let k = 0; k < tourneySize; k++) {
                const idx = Math.floor(Math.random() * tempPool.length);
                const n = tempPool[idx];
                const b = scores[n];
                
                // Formule de tamisage pondéré
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
        
        // Calcul du score de cohérence final pour ce ticket tamisé
        let totalScore = 0;
        combo.forEach(n => {
            const b = scores[n];
            totalScore += 
                ((b.spectral || 0) * userBias.harmony) + 
                ((b.momentum || 50) * userBias.stability) + 
                ((b.gap || 0) * userBias.chaos) +
                ((b.wavelet || 0) * userBias.wavelet) +
                ((b.orchestration || 0) * userBias.orchestration);
        });
        
        const avgBias = (userBias.harmony + userBias.stability + userBias.chaos + userBias.wavelet + userBias.orchestration) / 5;
        const finalScore = Math.min(99, Math.round(totalScore / (5 * (avgBias + 0.1))));

        combinations.push({
            numbers: combo,
            score: finalScore,
            tags: i === 0 ? ["Fusion Alpha"] : ["Vecteur Tamisé"],
            breakdown: { 
                synergy_match: true,
                orchestration_level: targetPool.length,
                fusion_score: finalScore
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
        analysis: `Fusion opérée sur un pool de ${targetPool.length} vecteurs (Synergies T-1 + Orchestrations). Le tamisage favorise la zone ${kingNumbers.slice(0,1).map(k=>k.number)}.`,
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
