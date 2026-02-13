
import { 
  PlatinumResult, 
  DrawResult, 
  ScoreBreakdown,
  SymbioticContext,
  PlatinumTimeline,
  Prediction,
  AlgoWeights,
  PlatinumAudit
} from '../types';
import { 
  getAlgoWeights, 
  generateMasterPrediction
} from './predictionEngine';

/**
 * Nexus MetaAnalyst v25.0 - PLATINUM RESERVE ENGINE
 * Génère des réalités alternatives basées sur l'ADN Algorithmique avec variance contrôlée
 * et injection de contexte symbiotique.
 */

// Simulation Cache Distribué (Structure prête pour Redis/KV)
const CACHE_TTL = 300_000; // 5 minutes
const SCORE_CACHE = new Map<string, { data: Record<number, ScoreBreakdown>, ts: number }>();

const getSecureRandom = (): number => {
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    return array[0] / (0xFFFFFFFF + 1);
};

/**
 * Calcul de la Divergence de Kullback-Leibler (KL)
 * Mesure la perte d'information entre la distribution prédite (P) et la réalité (Q).
 * D_KL(P || Q) = sum(P(i) * log(P(i) / Q(i)))
 * Ici adapté : Q est la distribution idéale (les gagnants ont 100%, les autres 0%)
 * On inverse pour mesurer à quel point la prédiction s'éloigne de la "Vérité".
 */
const calculateKLDivergence = (predictedProb: number[], actualWinners: Set<number>): number => {
    const epsilon = 0.00001; // Lissage pour éviter log(0)
    let divergence = 0;
    
    // Normalisation de la prédiction pour en faire une distribution de probabilité
    const totalScore = predictedProb.reduce((a, b) => a + b, 0) || 1;
    const P = predictedProb.map(s => s / totalScore);

    // Distribution cible Q : Uniforme sur les gagnants (1/5 chacun), 0 ailleurs (lissée)
    const winnerProb = 1 / 5;
    
    for (let i = 0; i < P.length; i++) {
        // Si le numéro est un gagnant, sa proba cible est haute, sinon proche de 0
        // Note: Dans ce contexte simplifié, on compare l'alignement global
        // Une divergence basse = excellente prédiction
        const isWinner = actualWinners.has(i + 1); // index 0 = num 1
        const Q_val = isWinner ? winnerProb : epsilon;
        const P_val = Math.max(P[i], epsilon);

        divergence += P_val * Math.log(P_val / Q_val);
    }
    
    return Math.max(0, divergence);
};

/**
 * Pré-calcule les scores de base (Breakdown) pour TOUS les numéros (1-90).
 * Utilise un cache mémoire local simulant un store distribué.
 */
export const precomputeBaseScores = async (
    drawName: string, 
    history: DrawResult[], 
    metrics?: any
): Promise<Record<number, ScoreBreakdown>> => {
    const cacheKey = `${drawName}_${history[0]?.id || 'init'}`;
    const now = Date.now();
    
    const cached = SCORE_CACHE.get(cacheKey);
    if (cached && (now - cached.ts < CACHE_TTL)) {
        return cached.data;
    }
    
    // On récupère les poids ACTIFS (ADN)
    const weights = await getAlgoWeights(drawName);
    
    // Génération Master sur tout le spectre
    const masterPred = await generateMasterPrediction(drawName, history, weights, metrics);
    const data = masterPred.breakdown || {};
    
    // Garbage collection simpliste du cache
    if (SCORE_CACHE.size > 20) SCORE_CACHE.clear();
    
    SCORE_CACHE.set(cacheKey, { data, ts: now });
    return data;
};

/**
 * Calcule le score scalaire d'un numéro en appliquant l'ADN et le Contexte Symbiotique.
 */
const calculateAugmentedScore = (
    num: number,
    breakdown: ScoreBreakdown, 
    weights: AlgoWeights,
    context?: SymbioticContext | null
): number => {
    let score = 0;
    let totalW = 0;
    
    // 1. Application des Poids ADN (Base)
    Object.keys(weights).forEach(key => {
        const k = key as keyof AlgoWeights;
        const w = weights[k] || 0;
        const val = (breakdown as any)[k] || 0;
        
        if (w > 0) {
            score += val * w;
            totalW += w;
        }
    });

    let finalScore = totalW > 0 ? score : 0;

    // 2. Injection Symbiotique (Boost Contextuel)
    if (context) {
        // Boost Spatial (Zones Chaudes)
        if (context.spatialHotZones.includes(num)) {
            finalScore *= 1.15; // +15%
        }
        // Penalité Zones Mortes
        if (context.spatialDeadZones?.includes(num)) {
            finalScore *= 0.7; // -30%
        }
        // Boost Orchestration (Patterns détectés)
        const orchBoost = context.orchestrationBoosts[num] || 0;
        if (orchBoost > 0) {
            finalScore *= (1 + (orchBoost * 0.1));
        }
        // Veto Spectral (Filtre Passe-Haut)
        if (context.spectralVeto?.includes(num)) {
            finalScore *= 0.5; // Pénalité sévère
        }
    }

    return finalScore;
};

/**
 * Sélection Pondérée à Température Contrôlée (Softmax Sampling).
 * @param pool Candidats avec scores.
 * @param count Nombre à sélectionner.
 * @param temperature Contrôle la variance. 
 *    T < 1.0 : "Froid" (Exploitation, favorise les très hauts scores).
 *    T > 1.0 : "Chaud" (Exploration, aplatit les probas, chance aux outsiders).
 *    T = 1.0 : Proportionnel standard.
 */
const getWeightedSelection = (
    pool: { num: number, score: number }[], 
    count: number,
    exclude: Set<number> = new Set(),
    temperature: number = 1.0
): number[] => {
    const selected = new Set<number>();
    // Filtrage initial
    let candidates = pool.filter(p => !exclude.has(p.num) && p.score > 0);

    if (candidates.length < count) return candidates.map(c => c.num);

    while (selected.size < count && candidates.length > 0) {
        // Calcul des poids avec température (Softmax-like scaling)
        // Weight = score ^ (1/T)
        // Attention aux scores négatifs ou nuls gérés en amont
        let totalWeight = 0;
        const weights = candidates.map(c => {
            // On normalise le score sur 1-100 pour éviter les problèmes de puissance
            const val = Math.max(1, c.score); 
            // Application de la température : Puissance inverse
            // Si T est bas (0.5), puissance est haute (2), les écarts explosent -> Top pick
            // Si T est haut (2.0), puissance est basse (0.5), les écarts se réduisent -> Random
            const w = Math.pow(val, 1 / temperature);
            totalWeight += w;
            return w;
        });

        if (totalWeight <= 0) break;

        let randomVal = getSecureRandom() * totalWeight;
        let pickedIndex = -1;

        for (let i = 0; i < candidates.length; i++) {
            randomVal -= weights[i];
            if (randomVal <= 0) {
                pickedIndex = i;
                break;
            }
        }
        
        if (pickedIndex === -1) pickedIndex = candidates.length - 1;

        const picked = candidates[pickedIndex];
        selected.add(picked.num);
        candidates.splice(pickedIndex, 1); // Retrait sans remise
    }

    return Array.from(selected).sort((a,b) => a-b);
};

export async function generatePlatinumPrediction(
    drawName: string, 
    history: DrawResult[],
    precomputedMetrics?: any,
    _userBias?: any, 
    symbioticContext?: SymbioticContext | null,
    basePrediction?: Prediction | null 
): Promise<PlatinumResult> {
    if (history.length < 10) throw new Error("Dataset insuffisant.");

    // 1. Récupération ADN & Scores Bruts
    const weights = await getAlgoWeights(drawName);
    const breakdowns = await precomputeBaseScores(drawName, history, precomputedMetrics);
    
    // 2. Calcul des Scores Augmentés (ADN + Symbiose)
    const rankedNumbers = Object.entries(breakdowns)
        .map(([nStr, bd]) => ({ 
            num: parseInt(nStr), 
            score: calculateAugmentedScore(parseInt(nStr), bd, weights, symbioticContext),
            breakdown: bd
        }))
        .sort((a, b) => b.score - a.score);

    // Exclusion optionnelle des numéros de l'Oracle Base pour forcer la diversité
    const baseExclusions = new Set(basePrediction?.suggestedNumbers || []);
    
    // Pool Platinum : Les 60 meilleurs (élargi pour permettre la variance Aether)
    const platinumPool = rankedNumbers.filter(x => !baseExclusions.has(x.num)).slice(0, 60);
    const timelines: PlatinumTimeline[] = [];

    // --- TIMELINE 1 : NOVA (Convergence Élite / Exploitation Pure) ---
    // Temperature: 0.4 (Très froid, déterministe)
    const novaNumbers = getWeightedSelection(platinumPool.slice(0, 10), 5, new Set(), 0.4);
    timelines.push({
        type: 'NOVA',
        title: 'Convergence Élite',
        numbers: novaNumbers,
        score: 99,
        intuitionScore: 98,
        remark: "La quintessence mathématique de votre configuration ADN.",
        keyMetric: "Score Max",
        colorTheme: "text-purple-400",
        divergence: 0,
        radarStats: [{label: 'Force', value: 100}, {label: 'Précision', value: 100}]
    });

    // --- TIMELINE 2 : NEON (Haute Probabilité / Légère Variance) ---
    // Temperature: 0.8 (Standard)
    const neonNumbers = getWeightedSelection(platinumPool.slice(0, 20), 5, new Set(novaNumbers), 0.8);
    timelines.push({
        type: 'NEON',
        title: 'Résonance Active',
        numbers: neonNumbers,
        score: 92,
        intuitionScore: 90,
        remark: "Variante haute fréquence issue du Top 20 ADN.",
        keyMetric: "Probabilité",
        colorTheme: "text-cyan-400",
        divergence: 20,
        radarStats: [{label: 'Force', value: 90}, {label: 'Flexibilité', value: 60}]
    });

    // --- TIMELINE 3 : TERRA (Structurelle / Dense) ---
    // Filtre spécifique : On favorise les numéros avec fort Spatial/Gap
    const terraPool = platinumPool.filter(p => (p.breakdown.spatial || 0) > 40 || (p.breakdown.gap || 0) > 40);
    const terraNumbers = getWeightedSelection(terraPool.length > 5 ? terraPool : platinumPool, 5, new Set([...novaNumbers, ...neonNumbers]), 0.9);
    timelines.push({
        type: 'TERRA',
        title: 'Structure Profonde',
        numbers: terraNumbers,
        score: 85,
        intuitionScore: 80,
        remark: "Exploration des zones de densité spatiale et temporelle.",
        keyMetric: "Densité",
        colorTheme: "text-emerald-400",
        divergence: 50,
        radarStats: [{label: 'Force', value: 75}, {label: 'Couverture', value: 90}]
    });

    // --- TIMELINE 4 : CHRONOS (Cycles / Stabilité) ---
    // Filtre spécifique : On favorise Frequency/Equilibrium
    const chronosPool = platinumPool.filter(p => (p.breakdown.frequency || 0) > 50 || (p.breakdown.equilibrium || 0) > 50);
    const chronosNumbers = getWeightedSelection(chronosPool.length > 5 ? chronosPool : platinumPool, 5, new Set(), 0.7);
    timelines.push({
        type: 'CHRONOS',
        title: 'Maturité Cyclique',
        numbers: chronosNumbers,
        score: 88,
        intuitionScore: 85,
        remark: "Focus sur la régularité et l'équilibre temporel.",
        keyMetric: "Stabilité",
        colorTheme: "text-amber-400",
        divergence: 30,
        radarStats: [{label: 'Stabilité', value: 95}, {label: 'Force', value: 80}]
    });

    // --- TIMELINE 5 : AETHER (Chaos / Entropie / Exploration) ---
    // Temperature: 1.8 (Chaud, donne une chance aux scores moyens/faibles du pool)
    // Filtre : Anti-consensus ou Spectral
    const aetherPool = platinumPool.filter(p => (p.breakdown.anti_consensus || 0) > 40 || (p.breakdown.spectral || 0) > 60);
    const aetherNumbers = getWeightedSelection(aetherPool.length > 5 ? aetherPool : platinumPool.slice(10, 60), 5, new Set(), 1.8);
    timelines.push({
        type: 'AETHER',
        title: 'Singularité Chaos',
        numbers: aetherNumbers,
        score: 82,
        intuitionScore: 95,
        remark: "Vecteurs à haut potentiel de rupture (Outsiders).",
        keyMetric: "Impact",
        colorTheme: "text-rose-400",
        divergence: 80,
        radarStats: [{label: 'Surprise', value: 100}, {label: 'Force', value: 70}]
    });

    // Calcul des "King Numbers" (Ceux qui reviennent le plus souvent dans les timelines)
    const kingCounts: Record<number, number> = {};
    timelines.forEach(t => t.numbers.forEach(n => kingCounts[n] = (kingCounts[n] || 0) + 1));
    
    const kingNumbers = Object.entries(kingCounts)
        .filter(([_, c]) => c >= 2)
        .map(([n, c]) => ({ number: Number(n), count: c }))
        .sort((a,b) => b.count - a.count);

    return {
        id: crypto.randomUUID(),
        kingNumbers, 
        timelines, 
        combinations: [],
        confidence: 97,
        analysis: `Génération Platinum v4 : Variance Adaptative. ADN ${Object.keys(weights).filter(k => (weights as any)[k] > 0.15).join('+')}.`,
        drawName, 
        timestamp: Date.now()
    };
}

export const savePlatinumHistory = (result: PlatinumResult) => {
    const key = `platinum_hist_${result.drawName}`;
    const existing = JSON.parse(localStorage.getItem(key) || '[]');
    localStorage.setItem(key, JSON.stringify([result, ...existing].slice(0, 20)));
};

export const getPlatinumHistory = (drawName: string): PlatinumResult[] => {
    const key = `platinum_hist_${drawName}`;
    try {
        return JSON.parse(localStorage.getItem(key) || '[]');
    } catch { return []; }
};

/**
 * Audit Forensique : Compare une Timeline avec le résultat réel.
 * Utilise la Divergence KL pour une précision scientifique.
 */
export const performPlatinumAudit = (prediction: PlatinumResult, actualResult: DrawResult): PlatinumAudit => {
    const winners = new Set(actualResult.gagnants);
    let bestTimeline = 'AUCUNE';
    let bestScore = -1;
    let minDivergence = Infinity;
    
    const performances = prediction.timelines.map(t => {
        const hits = t.numbers.filter(n => winners.has(n)).length;
        const matchingNumbers = t.numbers.filter(n => winners.has(n));
        
        // Construction du vecteur de probabilité de cette timeline (binaire pour simplifier l'audit post-hoc)
        const timelineProbVector = Array(90).fill(0);
        t.numbers.forEach(n => timelineProbVector[n-1] = 1); 

        // Calcul KL Divergence
        const divergence = calculateKLDivergence(timelineProbVector, winners);

        if (hits > bestScore || (hits === bestScore && divergence < minDivergence)) {
            bestScore = hits;
            bestTimeline = t.type;
            minDivergence = divergence;
        }
        
        return { 
            type: t.type, 
            hits, 
            numbers: matchingNumbers,
            klDivergence: parseFloat(divergence.toFixed(3)) 
        };
    });

    let verdict = "Déphasage Complet.";
    if (bestScore >= 3) verdict = `Convergence Réussie sur ${bestTimeline} (KL: ${minDivergence.toFixed(2)}).`;
    else if (bestScore >= 1) verdict = `Signal partiel sur ${bestTimeline}.`;

    // Score de synchro global pondéré par la divergence KL
    // Plus KL est bas, meilleur est le score.
    const avgHits = performances.reduce((acc, p) => acc + p.hits, 0) / 5;
    const syncScore = Math.min(100, Math.round((avgHits * 25) + Math.max(0, 20 - minDivergence)));

    return {
        predictionId: prediction.id,
        date: actualResult.date,
        actualDraw: actualResult.gagnants,
        bestTimeline,
        bestScore,
        syncScore,
        timelinePerformance: performances,
        verdict
    };
};
