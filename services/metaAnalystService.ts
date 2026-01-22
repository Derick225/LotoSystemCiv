
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

/**
 * Précalcul des scores avec profondeur étendue (100+ tirages)
 */
export const precomputeBaseScores = async (
    drawName: string, 
    history: DrawResult[], 
    metrics?: any
): Promise<Record<number, ScoreBreakdown>> => {
    const now = Date.now();
    const cached = SCORE_CACHE.get(drawName);
    
    // Cache valide 30 min
    if (cached && (now - cached.ts < 1800000)) return cached.data;
    
    const weights = await getAlgoWeights(drawName);
    // Augmentation de la profondeur d'analyse à 100 pour capturer les cycles longs
    const deepHistory = history.slice(0, 100);
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

/**
 * Calcul du biais optimal avec détection d'overlap machine-winners
 */
export function calculateOptimalUserBias(drawName: string, history: DrawResult[]): StrategyBias {
    const vol = calculateVolatility(history);
    const ent = calculateShannonEntropy(history);
    const reg = detectGameRegime(history);
    const lastDraw = history[0];
    
    let stability = 0.35, chaos = 0.4, harmony = 0.45, wavelet = 0.5, orchestration = 0.55;
    
    // Règle 1: Réduire fréquence si instabilité détectée
    if (ent.normalized > 0.9) {
        stability = 0.2; // On lâche l'inertie
        orchestration += 0.2; // On cherche les patterns complexes
    }

    // Règle 2: Boost Translocation si Overlap Machine récent
    const machineOverlap = lastDraw.machine ? lastDraw.gagnants.filter(n => lastDraw.machine?.includes(n)).length : 0;
    if (machineOverlap > 0) {
        orchestration *= 1.35; // Amplification de la règle de transfert
    }
    
    if (vol.score > 60) { chaos = 0.75; stability = 0.25; }
    if (reg.regime === 'PERSISTANT') { stability = 0.7; harmony = 0.7; orchestration = 0.6; }
    
    return { stability, chaos, harmony, wavelet, orchestration };
}

/**
 * GÉNÉRATION PLATINUM FUSION v12.0 (DIVERSIFIED APEX)
 */
export async function generatePlatinumPrediction(
    drawName: string, 
    history: DrawResult[],
    precomputedMetrics?: any,
    userBias?: StrategyBias
): Promise<PlatinumResult> {
    if (!history || history.length < 10) throw new Error("Dataset insuffisant.");

    const bias = userBias || calculateOptimalUserBias(drawName, history);
    const scores = await precomputeBaseScores(drawName, history, precomputedMetrics);
    const lastDraw = history[0];
    const correlationMatrix = precomputedMetrics?.correlationMatrix || {};
    const regularity = calculateRegularity(history);

    console.debug(`[PLATINUM v12] Initialisation pour ${drawName}. Biais:`, bias);

    // --- PHASE 1 : CONSTRUCTION DU POOL DE CHALEUR ---
    const rawPoolScores: { num: number, totalScore: number, reasons: string[] }[] = [];
    const poolNumbers = new Set<number>();

    // Collecte des vecteurs sources
    lastDraw.gagnants.forEach(n => poolNumbers.add(n));
    if (lastDraw.machine) lastDraw.machine.forEach(n => poolNumbers.add(n));
    
    // Expansion par affinités (Synergies)
    poolNumbers.forEach(n => {
        const affs = correlationMatrix[n]?.affinities || {};
        Object.entries(affs).forEach(([target, strength]) => {
            if (Number(strength) > 0.18) poolNumbers.add(parseInt(target));
        });
    });

    // Scoring du Pool
    poolNumbers.forEach(n => {
        const b = scores[n];
        if (!b) return;
        
        const reasons: string[] = [];
        const val = 
            ((b.spectral || 0) * bias.harmony) + 
            ((b.momentum || 50) * bias.stability) + 
            ((b.markov || 0) * bias.orchestration * 1.8) +
            ((b.wavelet || 0) * bias.wavelet);

        if (b.spectral > 75) reasons.push("Résonance FFT");
        if (b.markov > 60) reasons.push("Markov T-1");
        if (lastDraw.machine?.includes(n)) reasons.push("Source Machine");

        rawPoolScores.push({ num: n, totalScore: val, reasons });
    });

    // Tri pour identifier les "King Numbers" (Top 8 Absolu)
    // CONTRAINTE v15.0 : Limiter kingNumbers à ceux avec avg_gaps > 10 pour plus de diversité
    const sortedPool = rawPoolScores.sort((a, b) => b.totalScore - a.totalScore);
    const kingNumbers = sortedPool
        .filter(item => {
            const reg = regularity.find(r => r.number === item.num);
            return (reg?.avgGap || 0) > 10;
        })
        .slice(0, 8)
        .map(k => k.num);
    
    console.debug("[PLATINUM v15] King Numbers identifiés (Top 8 diversifiés):", kingNumbers);

    // --- PHASE 2 : GÉNÉRATION DIVERSIFIÉE (NAS EQUILIBRIUM) ---
    const combinations: PlatinumCombo[] = [];

    for (let i = 0; i < 5; i++) {
        let bestCombo: number[] = [];
        let bestComboScore = -Infinity;

        // 150 simulations par ticket pour trouver l'équilibre
        for (let attempt = 0; attempt < 150; attempt++) {
            const candidate: number[] = [];
            const tempPool = [...sortedPool].sort(() => Math.random() - 0.5);
            
            let kingInCombo = 0;
            const currentSelected = new Set<number>();

            while (currentSelected.size < 5 && tempPool.length > 0) {
                const item = tempPool.pop()!;
                const isKing = kingNumbers.includes(item.num);

                // CONTRAINTE CRITIQUE : Max 3 King Numbers par ticket pour garantir la diversité
                if (isKing && kingInCombo >= 3) continue;

                if (isKing) kingInCombo++;
                currentSelected.add(item.num);
            }

            const candidateArr = Array.from(currentSelected).sort((a,b) => a - b);
            if (candidateArr.length === 5) {
                const sum = candidateArr.reduce((a,b) => a+b, 0);
                const ac = calculateACValue(candidateArr);
                
                // Fitness structurelle
                let fitness = 0;
                candidateArr.forEach(n => {
                    const found = sortedPool.find(p => p.num === n);
                    fitness += (found?.totalScore || 0);
                });
                
                if (sum >= 170 && sum <= 245) fitness += 25; 
                if (ac >= 8) fitness += 15;

                if (fitness > bestComboScore) {
                    bestComboScore = fitness;
                    bestCombo = candidateArr;
                }
            }
        }

        combinations.push({
            numbers: bestCombo,
            score: Math.min(99, Math.round(bestComboScore / 7)),
            tags: i === 0 ? ["Alpha Fusion"] : ["Vecteur Diversifié"],
            breakdown: { ac: calculateACValue(bestCombo), kings: bestCombo.filter(n => kingNumbers.includes(n)).length }
        });
    }

    // Ré-identification des King Numbers finaux basés sur la récurrence réelle
    const recurrence: Record<number, number> = {};
    combinations.forEach(c => c.numbers.forEach(n => recurrence[n] = (recurrence[n] || 0) + 1));
    const finalKings = Object.entries(recurrence)
        .map(([n, count]) => ({ number: parseInt(n), count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);

    return {
        id: crypto.randomUUID(),
        kingNumbers: finalKings, 
        targetSumRange: { min: 170, max: 245, reason: "Optimisation Diversifiée v15" },
        hotZonesSpectro: combinations[0].numbers,
        combinations: combinations.sort((a, b) => b.score - a.score),
        confidence: combinations[0].score,
        analysis: `v15.0 active. Profondeur 100t. Filtre Shannon Entropy engagé. Diversification forcée (avg_gaps > 10). Détection d'écho machine sur le bloc ${finalKings.slice(0, 2).map(k=>k.number).join('-')}.`,
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
