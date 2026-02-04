
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
 * Nexus MetaAnalyst v22.0 - STOCHASTIC DETERMINISM
 * Correction critique : Suppression du hasard pur (Math.random sort) au profit
 * d'une sélection pondérée par densité de probabilité.
 */

const SCORE_CACHE = new Map<string, { data: Record<number, ScoreBreakdown>, ts: number }>();

export const precomputeBaseScores = async (
    drawName: string, 
    history: DrawResult[], 
    metrics?: any
): Promise<Record<number, ScoreBreakdown>> => {
    const now = Date.now();
    const cached = SCORE_CACHE.get(drawName);
    if (cached && (now - cached.ts < 900000)) return cached.data;
    
    const weights = await getAlgoWeights(drawName);
    const masterPred = await generateMasterPrediction(drawName, history, weights, metrics);
    const data = masterPred.breakdown || {};
    
    SCORE_CACHE.set(drawName, { data, ts: now });
    return data;
};

/**
 * SÉLECTION STOCHASTIQUE PONDÉRÉE (Roulette Wheel avec Biais Exponentiel)
 * Remplace le mélange aléatoire naïf.
 * Plus le score est haut, plus la probabilité de sélection est géométriquement élevée.
 */
const getWeightedSelection = (
    candidates: { num: number, score: number }[], 
    count: number,
    temperature: number = 1.5 // Facteur d'audace (1.0 = proportionnel, >1.0 = favorise les forts)
): number[] => {
    const selected = new Set<number>();
    const pool = [...candidates]; // Copie pour ne pas muter

    // On boucle jusqu'à avoir le compte ou épuiser le pool
    while (selected.size < count && pool.length > 0) {
        // 1. Calcul de la masse totale pondérée (Softmax-like)
        let totalWeight = 0;
        const weights = pool.map(c => {
            // Transformation non-linéaire pour accentuer les écarts
            const w = Math.pow(c.score, temperature);
            totalWeight += w;
            return w;
        });

        // 2. Tirage d'une bille sur la roue
        let randomVal = Math.random() * totalWeight;
        let pickedIndex = -1;

        for (let i = 0; i < pool.length; i++) {
            randomVal -= weights[i];
            if (randomVal <= 0) {
                pickedIndex = i;
                break;
            }
        }
        
        // Sécurité bordure
        if (pickedIndex === -1) pickedIndex = pool.length - 1;

        const picked = pool[pickedIndex];
        selected.add(picked.num);
        
        // Retrait du pool pour ne pas le resélectionner
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

    const weights = await getAlgoWeights(drawName);
    const sortedWeights = Object.entries(weights)
        .sort(([,a], [,b]) => (Number(b)||0) - (Number(a)||0))
        .slice(0, 3)
        .map(([k]) => k);

    const scores = await precomputeBaseScores(drawName, history, precomputedMetrics);
    const baseNumbers = basePrediction?.suggestedNumbers || [];
    const pool = Array.from({length: 90}, (_, i) => i + 1);

    /**
     * Moteur de Scoring Vectoriel
     */
    const getVectorScore = (num: number, targetKeys: string[]): number => {
        const s = scores[num];
        if (!s) return 0;
        
        let rawScore = 0;
        let weightSum = 0;

        targetKeys.forEach(key => {
            const k = key as keyof AlgoWeights;
            const val = Number(s[k]) || 0;
            const w = Number(weights[k]) || 0;
            if (w <= 0.01) return;

            // Boost si l'algo est un "Driver" (dominant)
            const boost = sortedWeights.includes(key) ? 1.5 : 1.0;
            
            rawScore += (val * w * boost);
            weightSum += w;
        });

        // Normalisation
        const normalized = weightSum > 0 ? (rawScore / weightSum) : 0;
        
        // Bonus Synergie (Si le numéro est un Hotspot Spatial)
        const spatialBonus = symbioticContext?.spatialHotZones?.includes(num) ? 15 : 0;
        
        return normalized + spatialBonus;
    };

    // Générateur de Timeline Typée
    const createTimeline = (type: string, keys: string[], diversityTemp: number): PlatinumTimeline => {
        // 1. Calculer tous les scores pour ce profil
        const rankedPool = pool
            .filter(n => !baseNumbers.includes(n)) // On force la divergence par rapport à l'Oracle Base
            .map(n => ({ num: n, score: getVectorScore(n, keys) }))
            .filter(item => item.score > 10); // Filtre bruit de fond

        // 2. Sélection Stochastique
        const numbers = getWeightedSelection(rankedPool, 5, diversityTemp);

        // Méta-données
        const avgScore = Math.round(numbers.reduce((acc, n) => acc + getVectorScore(n, keys), 0) / 5);
        
        let meta = { title: 'Unknown', remark: '...', metric: 'Score', color: 'text-slate-400' };
        if (type === 'NEON') meta = { title: 'Echo Quantique', remark: "Vibration spectrale pure.", metric: "Vibration FFT", color: "text-cyan-400" };
        if (type === 'TERRA') meta = { title: 'Faille Géométrique', remark: "Topologie spatiale dense.", metric: "Densité Spatiale", color: "text-emerald-400" };
        if (type === 'CHRONOS') meta = { title: 'Ombre Temporelle', remark: "Exploitation des écarts critiques.", metric: "Gap Velocity", color: "text-amber-400" };
        if (type === 'AETHER') meta = { title: 'Entropie Pure', remark: "Résistance au consensus.", metric: "Anti-Consensus", color: "text-rose-400" };
        if (type === 'NOVA') meta = { title: 'Rêve Neuronal', remark: "Projection complète de l'ADN.", metric: "Full DNA Match", color: "text-purple-400" };

        return {
            type: type as any,
            title: meta.title,
            numbers,
            score: Math.min(99, avgScore),
            intuitionScore: Math.round(Math.random() * 20 + 70), // Simulation confiance
            remark: meta.remark,
            keyMetric: meta.metric,
            colorTheme: meta.color
        };
    };

    // Configuration des Timelines
    const timelines: PlatinumTimeline[] = [
        createTimeline('NEON', ['spectral', 'wavelet', 'equilibrium'], 2.0), // Haute sélectivité
        createTimeline('TERRA', ['spatial', 'orchestration'], 1.8),
        createTimeline('CHRONOS', ['gap', 'gap_velocity', 'markov'], 1.5),
        createTimeline('AETHER', ['anti_consensus', 'isolation_anomaly', 'resistance'], 1.2), // Plus de chaos
    ];

    // NOVA : Utilise TOUT l'ADN non nul
    const allKeys = Object.keys(weights).filter(k => (Number(weights[k as keyof AlgoWeights]) || 0) > 0.05);
    timelines.push(createTimeline('NOVA', allKeys, 2.5)); // Très élitiste

    // Calcul des "Rois" (Cross-Timeline convergence)
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
        confidence: 95,
        analysis: `Divergence Platinum v22 (Stochastic Kernel). Génération synchronisée avec l'ADN "${drawName}".`,
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
