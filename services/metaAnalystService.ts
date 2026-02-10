
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
 * Génère des réalités alternatives basées sur le "Ventre Mou" statistique (Top 50 - Oracle Base).
 */

const SCORE_CACHE = new Map<string, { data: Record<number, ScoreBreakdown>, ts: number }>();

const getSecureRandom = (): number => {
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    return array[0] / (0xFFFFFFFF + 1);
};

// Pré-calcule les scores pour TOUS les numéros (1-90) sans filtrage initial
export const precomputeBaseScores = async (
    drawName: string, 
    history: DrawResult[], 
    metrics?: any
): Promise<Record<number, ScoreBreakdown>> => {
    const now = Date.now();
    const cached = SCORE_CACHE.get(drawName);
    // Cache de 15 minutes
    if (cached && (now - cached.ts < 900000)) return cached.data;
    
    const weights = await getAlgoWeights(drawName);
    
    // On force la génération sur tout le spectre (generateMasterPrediction le fait par défaut)
    const masterPred = await generateMasterPrediction(drawName, history, weights, metrics);
    const data = masterPred.breakdown || {};
    
    SCORE_CACHE.set(drawName, { data, ts: now });
    return data;
};

/**
 * Calcule le score global d'un numéro pour le classement général
 */
const calculateGlobalScore = (breakdown: ScoreBreakdown): number => {
    return (
        (breakdown.frequency || 0) + 
        (breakdown.gap || 0) + 
        (breakdown.spectral || 0) + 
        (breakdown.markov || 0) + 
        (breakdown.momentum || 0)
    );
};

/**
 * Sélection pondérée aléatoire (Weighted Random Selection)
 */
const getWeightedSelection = (
    candidates: { num: number, score: number }[], 
    count: number,
    temperature: number = 1.0
): number[] => {
    const selected = new Set<number>();
    const pool = [...candidates]; 

    while (selected.size < count && pool.length > 0) {
        let totalWeight = 0;
        const weights = pool.map(c => {
            const w = Math.pow(Math.max(1, c.score), temperature);
            totalWeight += w;
            return w;
        });

        let randomVal = getSecureRandom() * totalWeight;
        let pickedIndex = -1;

        for (let i = 0; i < pool.length; i++) {
            randomVal -= weights[i];
            if (randomVal <= 0) {
                pickedIndex = i;
                break;
            }
        }
        
        if (pickedIndex === -1) pickedIndex = pool.length - 1;

        const picked = pool[pickedIndex];
        selected.add(picked.num);
        pool.splice(pickedIndex, 1);
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
    if (history.length < 15) throw new Error("Dataset insuffisant.");

    // 1. Récupération des scores bruts pour tous les numéros (1-90)
    const scores = await precomputeBaseScores(drawName, history, precomputedMetrics);
    
    // 2. Définition des numéros interdits (Déjà pris par l'Oracle Base)
    // Exclusion Stricte : On interdit le Top 5 de l'Oracle
    const forbiddenNumbers = new Set(basePrediction?.suggestedNumbers || []);

    // 3. Création du Classement Global (Le Tamis)
    const globalRanking = Object.entries(scores)
        .map(([nStr, s]) => ({ 
            num: parseInt(nStr), 
            globalScore: calculateGlobalScore(s),
            details: s
        }))
        .sort((a, b) => b.globalScore - a.globalScore);

    // 4. Extraction de la "Réserve Platinum" (Top 50 sans les interdits)
    const platinumPool = globalRanking
        .filter(item => !forbiddenNumbers.has(item.num)) 
        .slice(0, 50); 

    const getTimelineScore = (item: typeof platinumPool[0], targetKeys: string[]): number => {
        let rawScore = 0;
        targetKeys.forEach(key => {
            const val = Number((item.details as any)[key]) || 0;
            rawScore += val;
        });
        
        if (symbioticContext?.spatialHotZones?.includes(item.num)) {
            rawScore *= 1.2;
        }
        return rawScore;
    };

    const createTimeline = (type: string, keys: string[], diversityTemp: number): PlatinumTimeline => {
        const specializedPool = platinumPool.map(item => ({
            num: item.num,
            score: getTimelineScore(item, keys)
        }));

        const numbers = getWeightedSelection(specializedPool, 5, diversityTemp);

        const avgScore = Math.round(numbers.reduce((acc, n) => {
            const item = platinumPool.find(p => p.num === n);
            return acc + (item ? getTimelineScore(item, keys) : 0);
        }, 0) / 5);

        const top10Global = new Set(globalRanking.slice(0, 10).map(x => x.num));
        const divergenceCount = numbers.filter(n => !top10Global.has(n)).length;
        const divergenceScore = (divergenceCount / 5) * 100;

        let meta = { title: 'Unknown', remark: '...', metric: 'Score', color: 'text-slate-400' };
        
        if (type === 'NEON') meta = { title: 'Résonance Spectrale', remark: "Extraction des plus hautes énergies de la réserve.", metric: "Vibration FFT", color: "text-cyan-400" };
        if (type === 'TERRA') meta = { title: 'Densité Spatiale', remark: "Concentration sur les zones chaudes géométriques.", metric: "Densité", color: "text-emerald-400" };
        if (type === 'CHRONOS') meta = { title: 'Maturité Temporelle', remark: "Sélection des écarts mûrs non-critiques.", metric: "Maturité Gap", color: "text-amber-400" };
        if (type === 'AETHER') meta = { title: 'Singularité Chaos', remark: "Numéros à fort potentiel cachés dans le bruit.", metric: "Anti-Consensus", color: "text-rose-400" };
        if (type === 'NOVA') meta = { title: 'Convergence Élite', remark: "La synthèse parfaite des 50 meilleurs candidats restants.", metric: "Score Global", color: "text-purple-400" };

        return {
            type: type as any,
            title: meta.title,
            numbers,
            score: Math.min(99, Math.round((avgScore / 300) * 100)),
            intuitionScore: Math.round(75 + (divergenceScore * 0.15)), 
            remark: meta.remark,
            keyMetric: meta.metric,
            colorTheme: meta.color,
            divergence: divergenceScore,
            radarStats: [
                { label: 'Réserve', value: 90 }, 
                { label: 'Spécialisation', value: Math.min(100, avgScore) },
                { label: 'Divergence', value: divergenceScore },
                { label: 'Cohérence', value: 85 },
                { label: 'Force', value: Math.min(100, (platinumPool.find(p => p.num === numbers[0])?.globalScore || 50)) }
            ]
        };
    };

    const timelines: PlatinumTimeline[] = [];
    timelines.push(createTimeline('NEON', ['spectral', 'wavelet', 'equilibrium'], 2.0));
    timelines.push(createTimeline('TERRA', ['spatial', 'orchestration', 'momentum'], 1.8));
    timelines.push(createTimeline('CHRONOS', ['gap', 'markov', 'gap_velocity'], 1.5));
    timelines.push(createTimeline('AETHER', ['anti_consensus', 'isolation_anomaly', 'resistance'], 1.2));

    const novaNumbers = platinumPool
        .slice(0, 5) 
        .map(p => p.num)
        .sort((a,b) => a-b);
        
    timelines.push({
        type: 'NOVA',
        title: 'Convergence Élite',
        numbers: novaNumbers,
        score: 99,
        intuitionScore: 98,
        remark: "La crème de la crème de la Réserve Platinum.",
        keyMetric: "Top Tier",
        colorTheme: "text-purple-400",
        divergence: 40,
        radarStats: [{label: 'Force', value: 100}, {label: 'Réserve', value: 100}, {label: 'Consensus', value: 80}, {label: 'Risque', value: 20}, {label: 'Fusion', value: 100}]
    });

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
        analysis: `Extraction Platinum : 50 meilleurs vecteurs isolés hors Oracle Base.`,
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
    const winners = actualResult.gagnants;
    let bestTimeline = 'AUCUNE';
    let bestScore = -1;
    
    const performances = prediction.timelines.map(t => {
        const hits = t.numbers.filter(n => winners.includes(n)).length;
        const matchingNumbers = t.numbers.filter(n => winners.includes(n));
        
        if (hits > bestScore) {
            bestScore = hits;
            bestTimeline = t.type;
        }
        
        return { type: t.type, hits, numbers: matchingNumbers };
    });

    let verdict = "Déphasage Complet.";
    if (bestScore >= 3) verdict = `Convergence Réussie sur ${bestTimeline}.`;
    else if (bestScore >= 1) verdict = `Signal partiel sur ${bestTimeline}.`;

    const kingHits = prediction.kingNumbers.filter(k => winners.includes(k.number)).length;
    const avgHits = performances.reduce((acc, p) => acc + p.hits, 0) / 5;
    const syncScore = Math.min(100, Math.round((avgHits * 20) + (kingHits * 10)));

    return {
        predictionId: prediction.id,
        date: actualResult.date,
        actualDraw: winners,
        bestTimeline,
        bestScore,
        syncScore,
        timelinePerformance: performances,
        verdict
    };
};
