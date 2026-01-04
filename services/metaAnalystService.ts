
import { PlatinumResult, PlatinumCombo, ScoreBreakdown, DrawResult, SpectralMetric, FractalMetric } from '../types';
import { fetchResults } from './lotteryService';
import { calculateSpectralMetricsAsync, detectGameRegime, calculateACValue } from './mathService';
import { getAlgoWeights, generateMasterPrediction } from './predictionEngine';

const PLATINUM_STORAGE_KEY = 'lotopro_platinum_history';

export interface StrategyBias {
    stability: number; // 0.0 - 1.0
    chaos: number;     // 0.0 - 1.0
    harmony: number;   // 0.0 - 1.0
}

const STRATEGY_PROFILES = [
    { name: 'Alpha-Sync', focus: 'spectral' as keyof ScoreBreakdown, baseWeight: 1.8, type: 'harmony', desc: 'Résonance FFT maximale (Harmoniques purs)' },
    { name: 'Chaos-Theory', focus: 'gap_velocity' as keyof ScoreBreakdown, baseWeight: 2.0, type: 'chaos', desc: 'Capture des ruptures de tendance (Vélocité)' },
    { name: 'Sigma-Mean', focus: 'equilibrium' as keyof ScoreBreakdown, baseWeight: 1.4, type: 'stability', desc: 'Retour à la moyenne (Mean Reversion)' },
    { name: 'Gamma-Moment', focus: 'momentum' as keyof ScoreBreakdown, baseWeight: 1.5, type: 'stability', desc: 'Accélération des flux courts (Inertie)' },
    { name: 'Omega-Shadow', focus: 'ai_intuition' as keyof ScoreBreakdown, baseWeight: 1.7, type: 'chaos', desc: 'Shadow Oracle (Signaux Faibles & Anti-Consensus)' }
];

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
    
    // On génère une prédiction maître pour obtenir les scores bruts de chaque numéro
    const masterPred = await generateMasterPrediction(drawName, data, weights, precomputedMetrics);
    const scores = masterPred.breakdown || {};
    
    // On élargit le pool de sélection pour permettre plus de variété selon les biais
    const poolDepth = Math.floor(35 + (userBias.chaos * 25)); 

    const extendedPool = Object.entries(scores)
        .sort((a, b) => {
            const valA = Object.values(a[1] || {}).filter((v): v is number => typeof v === 'number');
            const valB = Object.values(b[1] || {}).filter((v): v is number => typeof v === 'number');
            const scoreA = valA.reduce((acc, v) => acc + v, 0);
            const scoreB = valB.reduce((acc, v) => acc + v, 0);
            return scoreB - scoreA;
        })
        .slice(0, poolDepth) 
        .map(e => parseInt(e[0]));

    const combinations: PlatinumCombo[] = [];

    // Boucle de génération ajustée par le userBias
    for (const profile of STRATEGY_PROFILES) {
        let bestCombo: number[] = [];
        let maxScore = -Infinity;
        let bestBreakdown: any = null;
        let noImprovementCount = 0;
        const CONVERGENCE_LIMIT = 250; 

        // Ajustement du poids du profil selon le slider utilisateur correspondant
        let adjustedWeight = profile.baseWeight;
        if (profile.type === 'stability') adjustedWeight *= (0.5 + userBias.stability);
        if (profile.type === 'chaos') adjustedWeight *= (0.5 + userBias.chaos);
        if (profile.type === 'harmony') adjustedWeight *= (0.5 + userBias.harmony);

        // Boost dynamique selon le régime détecté
        if (regime.includes('PERSISTANT') && profile.type === 'stability') adjustedWeight *= 1.2;
        if (regime.includes('CHAOS') && profile.type === 'chaos') adjustedWeight *= 1.2;

        for (let i = 0; i < 2000; i++) {
            if (i % 300 === 0) await new Promise(r => setTimeout(r, 0));

            // Sélection plus ou moins aléatoire selon le niveau de Chaos
            const randomness = userBias.chaos * 0.4;
            const candidate = selectRandomFromPool(extendedPool, 5, randomness);
            
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
        kingNumbers: extractKingNumbers(combinations),
        targetSumRange: { min: 180, max: 270, reason: "Isocline de Gauss v6.2" },
        hotZonesSpectro: spectralMetrics.slice(0, 10).map((m: SpectralMetric) => m.number),
        combinations: combinations.sort((a, b) => b.score - a.score),
        confidence: masterPred.confidence,
        analysis: `Synthèse Platinum v5.0. Profil: S${(userBias.stability*10).toFixed(0)}/C${(userBias.chaos*10).toFixed(0)}/H${(userBias.harmony*10).toFixed(0)}. Régime: ${regime}.`,
        drawName,
        timestamp: Date.now()
    };
}

function selectRandomFromPool(pool: number[], size: number, randomness: number = 0): number[] {
    const result: number[] = [];
    const temp = [...pool];
    
    // Mélange léger si chaos activé
    if (randomness > 0) {
        temp.sort(() => Math.random() - (0.5 - randomness * 0.2));
    }

    while (result.length < size && temp.length > 0) {
        // Biais vers le début du tableau (les meilleurs scores) mais avec possibilité d'aller chercher plus loin
        const idx = Math.floor(Math.pow(Math.random(), 1 + (1 - randomness)) * temp.length);
        result.push(temp.splice(idx, 1)[0]);
    }
    return result;
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
            
            // Influence des sliders globaux sur les composantes internes
            const sVal = (bd.orchestration * 0.5 * bias.stability); 
            const hVal = (bd.spectral * 0.5 * bias.harmony);
            const cVal = (bd.gap_velocity * 0.5 * bias.chaos);
            
            baseScore += sVal + hVal + cVal;
            
            breakdown.stability += sVal;
            breakdown.harmony += hVal;
            breakdown.chaos += cVal;
        }
    });

    // Pénalité de similarité (Diversité)
    existing.forEach(combo => {
        const overlap = nums.filter(n => combo.numbers.includes(n)).length;
        if (overlap >= 4) baseScore -= 5000; 
        else if (overlap >= 3) baseScore -= 1000; 
        else if (overlap === 2) baseScore -= 50; 
    });

    const ac = calculateACValue(nums);
    // Si stabilité requise, on punit les AC faibles (trop simples)
    if (ac < 6 && bias.stability > 0.6) {
        baseScore -= 500;
        breakdown.stability -= 100;
    }
    
    const sum = nums.reduce((a,b) => a+b, 0);
    // Si chaos faible, on punit les sommes extrêmes
    if ((sum < 100 || sum > 350) && bias.chaos < 0.7) {
        baseScore -= 200;
        breakdown.chaos -= 50;
    }

    // Normalisation approximative du breakdown pour affichage (0-100)
    const factor = 10 / 5; // 5 numéros
    breakdown.stability = Math.max(0, Math.min(100, breakdown.stability * factor));
    breakdown.chaos = Math.max(0, Math.min(100, breakdown.chaos * factor));
    breakdown.harmony = Math.max(0, Math.min(100, breakdown.harmony * factor));
    breakdown.pattern = Math.max(0, Math.min(100, breakdown.pattern * factor));

    return { score: baseScore, breakdown };
}

function extractKingNumbers(combos: PlatinumCombo[]) {
    const freq: Record<number, number> = {};
    combos.forEach(c => c.numbers.forEach(n => freq[n] = (freq[n] || 0) + 1));
    return Object.entries(freq)
        .map(([n, c]) => ({ number: Number(n), count: c }))
        .filter(k => k.count >= 2)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
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
