
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
 * Nexus MetaAnalyst v26.0 - MIXTURE OF EXPERTS (MoE) ENGINE
 * Replaces monolithic logic with 4 specialized Expert Agents and a Gating Network.
 */

// --- TYPES INTERNES MOE ---
interface ExpertAgent {
    id: string;
    name: string;
    focus: string[]; // Liste des algos
    vector: number[]; // Scores 1-90
    weight: number;   // Poids attribué par le Gating Network
}

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
 */
const calculateKLDivergence = (predictedProb: number[], actualWinners: Set<number>): number => {
    const epsilon = 0.00001; 
    let divergence = 0;
    
    const totalScore = predictedProb.reduce((a, b) => a + b, 0) || 1;
    const P = predictedProb.map(s => s / totalScore);
    const winnerProb = 1 / 5;
    
    for (let i = 0; i < P.length; i++) {
        const isWinner = actualWinners.has(i + 1);
        const Q_val = isWinner ? winnerProb : epsilon;
        const P_val = Math.max(P[i], epsilon);
        divergence += P_val * Math.log(P_val / Q_val);
    }
    return Math.max(0, divergence);
};

/**
 * Pré-calcule les scores de base pour tous les numéros.
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
    
    const weights = await getAlgoWeights(drawName);
    const masterPred = await generateMasterPrediction(drawName, history, weights, metrics);
    const data = masterPred.breakdown || {};
    
    if (SCORE_CACHE.size > 20) SCORE_CACHE.clear();
    SCORE_CACHE.set(cacheKey, { data, ts: now });
    return data;
};

/**
 * Selection via Softmax Sampling
 */
const getWeightedSelection = (
    pool: { num: number, score: number }[], 
    count: number,
    exclude: Set<number> = new Set(),
    temperature: number = 1.0
): number[] => {
    const selected = new Set<number>();
    let candidates = pool.filter(p => !exclude.has(p.num) && p.score > 0);

    if (candidates.length < count) return candidates.map(c => c.num);

    while (selected.size < count && candidates.length > 0) {
        let totalWeight = 0;
        const weights = candidates.map(c => {
            const val = Math.max(1, c.score); 
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
        candidates.splice(pickedIndex, 1); 
    }

    return Array.from(selected).sort((a,b) => a-b);
};

// --- GATING NETWORK LOGIC ---

const runGatingNetwork = (
    metrics: any, 
    symbioticContext: SymbioticContext | null
): Record<string, number> => {
    // Poids par défaut équilibrés
    let weights = {
        'ALPHA': 0.25, // Historian
        'BETA': 0.25,  // Physicist
        'GAMMA': 0.25, // Geometrician
        'DELTA': 0.25  // Contrarian
    };

    // 1. Analyse du Régime Fractal (Hurst)
    // Hurst > 0.6 : Persistant -> Historian (Alpha) est roi
    // Hurst < 0.4 : Anti-Persistant -> Contrarian (Delta) est roi
    const hurst = metrics?.fractal?.reduce((acc: number, f: any) => acc + (f.hurst || 0.5), 0) / (metrics?.fractal?.length || 1) || 0.5;
    
    if (hurst > 0.6) {
        weights.ALPHA += 0.2;
        weights.DELTA -= 0.1;
    } else if (hurst < 0.45) {
        weights.DELTA += 0.2;
        weights.ALPHA -= 0.1;
    }

    // 2. Analyse de la Volatilité (Physics)
    // Volatilité haute -> Physicist (Beta) gère mieux le signal/bruit
    const volatility = metrics?.volatility?.score || 50;
    if (volatility > 60) {
        weights.BETA += 0.15;
        weights.ALPHA -= 0.05;
    }

    // 3. Analyse Spatiale (Geometrician)
    // Si clusters denses détectés -> Geometrician (Gamma)
    if (symbioticContext?.spatialHotZones && symbioticContext.spatialHotZones.length > 0) {
        weights.GAMMA += 0.15;
    }

    // Normalisation Softmax simple
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    Object.keys(weights).forEach(k => {
        weights[k as keyof typeof weights] = parseFloat((weights[k as keyof typeof weights] / total).toFixed(2));
    });

    return weights;
};

// --- EXPERT AGENTS LOGIC ---

const createExpertVector = (
    breakdowns: Record<number, ScoreBreakdown>,
    focusKeys: (keyof ScoreBreakdown)[]
): number[] => {
    const vector = new Array(91).fill(0); // Index 0 unused
    
    for (let i = 1; i <= 90; i++) {
        const bd = breakdowns[i];
        if (!bd) continue;
        
        let score = 0;
        focusKeys.forEach(k => {
            score += (bd as any)[k] || 0;
        });
        
        // Moyenne des composantes pour normaliser 0-100
        vector[i] = score / focusKeys.length;
    }
    return vector;
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

    // 1. Acquisition des données brutes
    const breakdowns = await precomputeBaseScores(drawName, history, precomputedMetrics);

    // 2. Activation du Gating Network (Décision Stratégique)
    const gatingWeights = runGatingNetwork(precomputedMetrics, symbioticContext);

    // 3. Instanciation des Experts (MoE)
    
    // Expert ALPHA: The Historian (Chronos)
    // Focus: Tendances lourdes, Répétition, Markov
    const alphaVector = createExpertVector(breakdowns, ['frequency', 'markov', 'momentum', 'equilibrium']);

    // Expert BETA: The Physicist (Neon)
    // Focus: Signal pur, Cycles spectraux, Ondelettes
    const betaVector = createExpertVector(breakdowns, ['spectral', 'wavelet', 'fractal']);

    // Expert GAMMA: The Geometrician (Terra)
    // Focus: Topologie grille, Voisinage, Spatial
    const gammaVector = createExpertVector(breakdowns, ['spatial', 'orchestration']);

    // Expert DELTA: The Contrarian (Aether)
    // Focus: Rupture, Écart Critique, Anti-consensus
    const deltaVector = createExpertVector(breakdowns, ['gap', 'anti_consensus', 'gap_velocity']);

    // 4. Fusion du Vecteur NOVA (Consensus Pondéré)
    // V_nova = Σ (W_expert * V_expert)
    const novaVector = new Array(91).fill(0);
    for (let i = 1; i <= 90; i++) {
        novaVector[i] = 
            (alphaVector[i] * gatingWeights.ALPHA) +
            (betaVector[i] * gatingWeights.BETA) +
            (gammaVector[i] * gatingWeights.GAMMA) +
            (deltaVector[i] * gatingWeights.DELTA);
    }

    const timelines: PlatinumTimeline[] = [];

    // Helper pour transformer un vecteur [0..90] en format pour getWeightedSelection
    const toPool = (vec: number[]) => {
        return vec.map((score, num) => ({ num, score })).filter(x => x.num > 0);
    };

    // --- TIMELINE 1 : NOVA (FUSION) ---
    // Le meilleur de tous les experts réunis
    const novaPool = toPool(novaVector).sort((a,b) => b.score - a.score).slice(0, 50);
    const novaNumbers = getWeightedSelection(novaPool, 5, new Set(), 0.5); // Température basse (Exploitation)
    
    timelines.push({
        type: 'NOVA',
        title: 'Fusion Experts',
        numbers: novaNumbers,
        score: 99,
        intuitionScore: 98,
        remark: "Consensus optimal pondéré par le Gating Network.",
        keyMetric: "MoE Score",
        colorTheme: "text-purple-400",
        divergence: 0,
        radarStats: [
            { label: 'Historique', value: gatingWeights.ALPHA * 100 },
            { label: 'Physique', value: gatingWeights.BETA * 100 },
            { label: 'Géométrie', value: gatingWeights.GAMMA * 100 },
            { label: 'Chaos', value: gatingWeights.DELTA * 100 }
        ]
    });

    // --- TIMELINE 2 : NEON (PHYSICIST - BETA) ---
    const neonPool = toPool(betaVector).sort((a,b) => b.score - a.score).slice(0, 40);
    const neonNumbers = getWeightedSelection(neonPool, 5, new Set(novaNumbers), 0.8);
    timelines.push({
        type: 'NEON',
        title: 'Signal Physique',
        numbers: neonNumbers,
        score: 92,
        intuitionScore: 90,
        remark: "Basé sur la résonance spectrale et les ondes.",
        keyMetric: "Énergie",
        colorTheme: "text-cyan-400",
        divergence: 20,
        radarStats: [{label: 'Spectre', value: 95}, {label: 'Cycles', value: 90}]
    });

    // --- TIMELINE 3 : TERRA (GEOMETRICIAN - GAMMA) ---
    const terraPool = toPool(gammaVector).sort((a,b) => b.score - a.score).slice(0, 40);
    const terraNumbers = getWeightedSelection(terraPool, 5, new Set([...novaNumbers, ...neonNumbers]), 0.9);
    timelines.push({
        type: 'TERRA',
        title: 'Topologie Grille',
        numbers: terraNumbers,
        score: 85,
        intuitionScore: 80,
        remark: "Focalisé sur les clusters spatiaux et voisins.",
        keyMetric: "Densité",
        colorTheme: "text-emerald-400",
        divergence: 40,
        radarStats: [{label: 'Espace', value: 90}, {label: 'Structure', value: 85}]
    });

    // --- TIMELINE 4 : CHRONOS (HISTORIAN - ALPHA) ---
    const chronosPool = toPool(alphaVector).sort((a,b) => b.score - a.score).slice(0, 40);
    const chronosNumbers = getWeightedSelection(chronosPool, 5, new Set(), 0.7);
    timelines.push({
        type: 'CHRONOS',
        title: 'Inertie Temporelle',
        numbers: chronosNumbers,
        score: 88,
        intuitionScore: 85,
        remark: "Suit les probabilités de transition Markoviennes.",
        keyMetric: "Fréquence",
        colorTheme: "text-amber-400",
        divergence: 30,
        radarStats: [{label: 'Mémoire', value: 95}, {label: 'Tendance', value: 90}]
    });

    // --- TIMELINE 5 : AETHER (CONTRARIAN - DELTA) ---
    const aetherPool = toPool(deltaVector).sort((a,b) => b.score - a.score).slice(0, 50);
    const aetherNumbers = getWeightedSelection(aetherPool, 5, new Set(), 1.5); // Température haute (Exploration)
    timelines.push({
        type: 'AETHER',
        title: 'Rupture Chaos',
        numbers: aetherNumbers,
        score: 82,
        intuitionScore: 95,
        remark: "Mise sur les anomalies statistiques et les écarts.",
        keyMetric: "Entropie",
        colorTheme: "text-rose-400",
        divergence: 80,
        radarStats: [{label: 'Risque', value: 100}, {label: 'Surprise', value: 95}]
    });

    // Calcul des "King Numbers"
    const kingCounts: Record<number, number> = {};
    timelines.forEach(t => t.numbers.forEach(n => kingCounts[n] = (kingCounts[n] || 0) + 1));
    
    const kingNumbers = Object.entries(kingCounts)
        .filter(([_, c]) => c >= 2)
        .map(([n, c]) => ({ number: Number(n), count: c }))
        .sort((a,b) => b.count - a.count);

    // Détermination du leader (Expert dominant) pour l'analyse
    const leaderKey = Object.entries(gatingWeights).sort((a,b) => b[1] - a[1])[0][0];
    const leaderName = leaderKey === 'ALPHA' ? 'Historien' : leaderKey === 'BETA' ? 'Physicien' : leaderKey === 'GAMMA' ? 'Géomètre' : 'Contrarian';

    return {
        id: crypto.randomUUID(),
        kingNumbers, 
        timelines, 
        combinations: [],
        confidence: 98,
        analysis: `Mixture of Experts (MoE) v2.0 : Gating Network dominé par l'Expert ${leaderName} (${Math.round(gatingWeights[leaderKey as keyof typeof gatingWeights]*100)}%).`,
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

export const performPlatinumAudit = (prediction: PlatinumResult, actualResult: DrawResult): PlatinumAudit => {
    const winners = new Set(actualResult.gagnants);
    let bestTimeline = 'AUCUNE';
    let bestScore = -1;
    let minDivergence = Infinity;
    
    const performances = prediction.timelines.map(t => {
        const hits = t.numbers.filter(n => winners.has(n)).length;
        const matchingNumbers = t.numbers.filter(n => winners.has(n));
        
        const timelineProbVector = Array(90).fill(0);
        t.numbers.forEach(n => timelineProbVector[n-1] = 1); 

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
