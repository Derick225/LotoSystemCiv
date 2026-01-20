
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
    
    // Initialisation sécurité pour le spectre complet
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
    
    if (vol.score > 60) { chaos = 0.7; stability = 0.3; }
    if (ent.normalized > 0.9) { chaos = 0.8; harmony = 0.2; }
    if (reg.regime === 'PERSISTANT') { stability = 0.8; harmony = 0.7; orchestration = 0.8; }
    
    return { stability, chaos, harmony, wavelet, orchestration };
}

/**
 * GÉNÉRATION PLATINUM FUSION v8.5
 * PROTOCOLE : SYNERGIES T-1 -> ORCHESTRATIONS (-1/+1) -> TAMISAGE ALGORITHMIQUE
 */
export async function generatePlatinumPrediction(
    drawName: string, 
    history: DrawResult[],
    precomputedMetrics?: any,
    userBias: StrategyBias = { stability: 0.5, chaos: 0.3, harmony: 0.5, wavelet: 0.4, orchestration: 0.4 }
): Promise<PlatinumResult> {
    if (!history || history.length < 5) throw new Error("Historique insuffisant.");

    const scores = await precomputeBaseScores(drawName, history, precomputedMetrics);
    const lastWinners = history[0].gagnants;
    const correlationMatrix = precomputedMetrics?.correlationMatrix || {};

    // --- ÉTAPE 1 : EXTRACTION DES SYNERGIES DES NUMÉROS T-1 ---
    const synergyPool = new Set<number>();
    lastWinners.forEach(num => {
        const affinities = correlationMatrix[num]?.affinities || {};
        Object.entries(affinities).forEach(([targetStr, strength]) => {
            // Seuil de synergie significative (ajusté pour la qualité)
            if (Number(strength) > 0.18) { 
                synergyPool.add(parseInt(targetStr));
            }
        });
    });

    // --- ÉTAPE 2 : EXPANSION PAR ORCHESTRATIONS (-1 et +1 des synergies) ---
    const orchestrationPool = new Set<number>();
    synergyPool.forEach(syn => {
        orchestrationPool.add(syn);
        if (syn > 1) orchestrationPool.add(syn - 1);
        if (syn < 90) orchestrationPool.add(syn + 1);
    });

    // Conversion en pool de travail
    let targetPool = Array.from(orchestrationPool);

    // Sécurité stochastique : Si le pool est trop restreint, on injecte les meilleurs potentiels globaux
    if (targetPool.length < 15) {
        const topGlobal = Object.keys(scores)
            .map(Number)
            .sort((a, b) => (scores[b].spectral + scores[b].momentum) - (scores[a].spectral + scores[a].momentum))
            .slice(0, 20);
        topGlobal.forEach(n => targetPool.includes(n) ? null : targetPool.push(n));
    }

    // --- ÉTAPE 3 : LE TAMIS DE FUSION (Passage des orchestrations dans les filtres IA) ---
    const combinations: PlatinumCombo[] = [];

    // On génère 5 combinaisons par tournoi sur le pool restreint
    for (let i = 0; i < 5; i++) {
        const combo: number[] = [];
        const tempPool = [...targetPool];
        
        while (combo.length < 5 && tempPool.length > 0) {
            let bestCandidate = -1;
            let bestVal = -Infinity;
            
            // Tournoi stochastique sur le pool d'orchestration
            const tourneySize = Math.min(8, tempPool.length);
            for(let k = 0; k < tourneySize; k++) {
                const idx = Math.floor(Math.random() * tempPool.length);
                const n = tempPool[idx];
                const b = scores[n];
                
                // Formule du Tamis Platinum pondéré par les réglages utilisateur
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
        
        combo.sort((a, b) => a - b);
        
        // Calcul du score de cohérence final (0-100)
        let totalScore = 0;
        combo.forEach(n => {
            const b = scores[n];
            totalScore += (b.spectral * 0.4 + b.momentum * 0.3 + b.markov * 0.3);
        });
        
        combinations.push({
            numbers: combo,
            score: Math.min(99, Math.round(totalScore / 5)),
            tags: i === 0 ? ["Vecteur Alpha"] : ["Optimisé"],
            breakdown: { synergy_depth: targetPool.length }
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
        targetSumRange: { min: 150, max: 280, reason: "Biais Synergie-Orch" },
        hotZonesSpectro: combinations[0].numbers,
        combinations: combinations.sort((a, b) => b.score - a.score),
        confidence: combinations[0].score,
        analysis: `Fusion opérée sur un pool filtré de ${targetPool.length} vecteurs (Synergies T-1 + Orchestrations). Le tamisage favorise la résonance spectrale sur la zone ${kingNumbers.slice(0, 2).map(k=>k.number).join(', ')}.`,
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
