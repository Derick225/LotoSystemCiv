
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
    
    let stability = 0.4, chaos = 0.3, harmony = 0.5, wavelet = 0.5, orchestration = 0.6;
    
    if (vol.score > 60) { chaos = 0.8; stability = 0.2; }
    if (ent.normalized > 0.92) { chaos = 0.9; harmony = 0.1; }
    if (reg.regime === 'PERSISTANT') { stability = 0.8; harmony = 0.8; orchestration = 0.8; }
    
    return { stability, chaos, harmony, wavelet, orchestration };
}

/**
 * GÉNÉRATION PLATINUM FUSION v11.0 (APEX PRECISION)
 * PROTOCOLE : VORTEX DE TRANSLOCATION -> expansion SYNERGIQUE -> ÉQUILIBRE DE NASH
 */
export async function generatePlatinumPrediction(
    drawName: string, 
    history: DrawResult[],
    precomputedMetrics?: any,
    userBias: StrategyBias = { stability: 0.5, chaos: 0.3, harmony: 0.5, wavelet: 0.5, orchestration: 0.6 }
): Promise<PlatinumResult> {
    if (!history || history.length < 10) throw new Error("Dataset insuffisant.");

    const scores = await precomputeBaseScores(drawName, history, precomputedMetrics);
    const lastDraw = history[0];
    const correlationMatrix = precomputedMetrics?.correlationMatrix || {};

    // --- PHASE 1 : LE VORTEX DE TRANSLOCATION (Sources de chaleur) ---
    const heatPool = new Set<number>();
    
    // 1.1 Synergies des Gagnants T-1
    lastDraw.gagnants.forEach(num => {
        const affinities = correlationMatrix[num]?.affinities || {};
        Object.entries(affinities).forEach(([targetStr, strength]) => {
            if (Number(strength) > 0.15) heatPool.add(parseInt(targetStr));
        });
        heatPool.add(num); // Inertie temporelle
    });

    // 1.2 Translocation Machine (Migration de flux)
    if (lastDraw.machine) {
        lastDraw.machine.forEach(m => {
            heatPool.add(m);
            // Échos de voisinage machine
            if (m > 1) heatPool.add(m - 1);
            if (m < 90) heatPool.add(m + 1);
        });
    }

    // --- PHASE 2 : EXPANSION SYNERGIQUE (Miroirs & Paires) ---
    const expandedPool = new Set<number>();
    heatPool.forEach(num => {
        expandedPool.add(num);
        // Miroir géométrique (91 - n)
        const mirror = 91 - num;
        if (mirror >= 1 && mirror <= 90) expandedPool.add(mirror);
        
        // Paires binomiales (qui sort souvent avec ce numéro ?)
        const affinities = correlationMatrix[num]?.affinities || {};
        const bestPair = Object.entries(affinities)
            .sort((a: any, b: any) => b[1] - a[1])[0];
        if (bestPair && Number(bestPair[1]) > 0.22) expandedPool.add(parseInt(bestPair[0]));
    });

    let targetPool = Array.from(expandedPool);

    // --- PHASE 3 : SYNTHÈSE PAR ÉQUILIBRE DE NASH ---
    const combinations: PlatinumCombo[] = [];

    // On génère 5 combinaisons d'élite par tournoi de cohérence
    for (let i = 0; i < 5; i++) {
        let bestCombo: number[] = [];
        let bestComboScore = -Infinity;

        // On tente 100 simulations par ticket pour trouver l'équilibre structurel
        for (let attempt = 0; attempt < 100; attempt++) {
            const candidate: number[] = [];
            const tempPool = [...targetPool].sort(() => Math.random() - 0.5);
            
            while (candidate.length < 5 && tempPool.length > 0) {
                const n = tempPool.pop()!;
                const b = scores[n];
                
                // Score de fitness individuel
                const val = 
                    ((b.spectral || 0) * userBias.harmony) + 
                    ((b.momentum || 50) * userBias.stability) + 
                    ((b.markov || 0) * userBias.orchestration * 1.8) +
                    ((b.wavelet || 0) * userBias.wavelet);
                
                if (val > 40 || Math.random() > 0.7) candidate.push(n);
            }

            if (candidate.length === 5) {
                candidate.sort((a,b) => a - b);
                const sum = candidate.reduce((a,b) => a+b, 0);
                const ac = calculateACValue(candidate);
                
                // Critères de Nash (Équilibre du système)
                let fitness = 0;
                candidate.forEach(n => fitness += (scores[n]?.spectral || 50));
                
                // Bonus structurels
                if (sum >= 175 && sum <= 235) fitness += 20; // Zone d'or de la somme
                if (ac >= 8) fitness += 15; // Complexité idéale
                
                if (fitness > bestComboScore) {
                    bestComboScore = fitness;
                    bestCombo = candidate;
                }
            }
        }

        combinations.push({
            numbers: bestCombo,
            score: Math.min(99, Math.round(bestComboScore / 7)),
            tags: i === 0 ? ["Alpha Fusion"] : i === 1 ? ["Beta Sync"] : ["Rupture"],
            breakdown: { pool_size: targetPool.length, ac: calculateACValue(bestCombo) }
        });
    }

    const recurrence: Record<number, number> = {};
    combinations.forEach(c => c.numbers.forEach(n => recurrence[n] = (recurrence[n] || 0) + 1));
    const kingNumbers = Object.entries(recurrence)
        .map(([n, count]) => ({ number: parseInt(n), count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);

    return {
        id: crypto.randomUUID(),
        kingNumbers, 
        targetSumRange: { min: 175, max: 235, reason: "Équilibre Structurel de Nash" },
        hotZonesSpectro: combinations[0].numbers,
        combinations: combinations.sort((a, b) => b.score - a.score),
        confidence: combinations[0].score,
        analysis: `v11.0 Alpha-Sync active. Le pool de ${targetPool.length} vecteurs a été tamisé par équilibre de Nash. La zone de résonance dominante est localisée sur le noyau ${kingNumbers.slice(0, 2).map(k=>k.number).join('-')}. Forte probabilité de translocation machine.`,
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
