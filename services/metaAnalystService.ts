
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
 * Génère des réalités alternatives basées strictement sur la configuration de l'ADN Algorithmique.
 */

const SCORE_CACHE = new Map<string, { data: Record<number, ScoreBreakdown>, ts: number }>();

const getSecureRandom = (): number => {
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    return array[0] / (0xFFFFFFFF + 1);
};

// Pré-calcule les scores pour TOUS les numéros (1-90) en utilisant le moteur Master
export const precomputeBaseScores = async (
    drawName: string, 
    history: DrawResult[], 
    metrics?: any
): Promise<Record<number, ScoreBreakdown>> => {
    const now = Date.now();
    const cached = SCORE_CACHE.get(drawName);
    if (cached && (now - cached.ts < 300000)) return cached.data; // Cache 5 min
    
    // On récupère les poids ACTIFS (ADN)
    const weights = await getAlgoWeights(drawName);
    
    // On force la génération sur tout le spectre pour obtenir les scores bruts
    const masterPred = await generateMasterPrediction(drawName, history, weights, metrics);
    const data = masterPred.breakdown || {};
    
    SCORE_CACHE.set(drawName, { data, ts: now });
    return data;
};

/**
 * Calcule le score global d'un numéro en appliquant strictement l'ADN (Poids).
 */
const calculateWeightedScore = (breakdown: ScoreBreakdown, weights: AlgoWeights): number => {
    let score = 0;
    let totalW = 0;
    
    Object.keys(weights).forEach(key => {
        const k = key as keyof AlgoWeights;
        const w = weights[k] || 0;
        // On récupère la valeur brute de l'algo (ex: Frequency = 80)
        const val = (breakdown as any)[k] || 0;
        
        if (w > 0) {
            score += val * w;
            totalW += w;
        }
    });

    // Le score final est une résultante directe des curseurs de l'égaliseur
    return totalW > 0 ? score : 0;
};

/**
 * Sélection pondérée aléatoire (Weighted Random Selection)
 * Permet de générer des variantes probabilistes autour du même ADN.
 */
const getWeightedSelection = (
    pool: { num: number, score: number }[], 
    count: number,
    exclude: Set<number> = new Set()
): number[] => {
    const selected = new Set<number>();
    const candidates = pool.filter(p => !exclude.has(p.num));

    // Sécurité anti-boucle infinie
    if (candidates.length < count) return candidates.map(c => c.num);

    while (selected.size < count && candidates.length > 0) {
        let totalWeight = 0;
        const weights = candidates.map(c => {
            // On accentue les scores (puissance 2) pour favoriser les meilleurs tout en gardant une chance aux outsiders
            const w = Math.pow(Math.max(0, c.score), 2);
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
        candidates.splice(pickedIndex, 1); // Retirer pour ne pas re-sélectionner
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

    // 1. Récupération de l'ADN actif (CRITIQUE : C'est la source de vérité)
    const weights = await getAlgoWeights(drawName);

    // 2. Récupération des scores bruts (Breakdown)
    const breakdowns = await precomputeBaseScores(drawName, history, precomputedMetrics);
    
    // 3. Calcul du "Score ADN" pour chaque numéro
    const rankedNumbers = Object.entries(breakdowns)
        .map(([nStr, bd]) => ({ 
            num: parseInt(nStr), 
            score: calculateWeightedScore(bd, weights),
            breakdown: bd
        }))
        .sort((a, b) => b.score - a.score); // Tri décroissant (Le meilleur en premier)

    // On exclut les numéros déjà donnés par l'Oracle Base pour offrir de la diversité (Optionnel)
    const baseExclusions = new Set(basePrediction?.suggestedNumbers || []);
    
    // Pool Platinum : Les 50 meilleurs numéros selon l'ADN
    const platinumPool = rankedNumbers.filter(x => !baseExclusions.has(x.num)).slice(0, 50);

    const timelines: PlatinumTimeline[] = [];

    // --- STRATÉGIE 1 : NOVA (L'Élite Absolue) ---
    // Les 5 numéros ayant le score ADN le plus élevé. Pas de hasard.
    const novaNumbers = platinumPool.slice(0, 5).map(p => p.num).sort((a,b) => a-b);
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

    // --- STRATÉGIE 2 : NEON (Haute Probabilité) ---
    // Échantillonnage dans le Top 15. Très proche de l'ADN optimal mais avec une variance.
    const neonNumbers = getWeightedSelection(platinumPool.slice(0, 15), 5, new Set(novaNumbers));
    timelines.push({
        type: 'NEON',
        title: 'Résonance Active',
        numbers: neonNumbers,
        score: 92,
        intuitionScore: 90,
        remark: "Variante haute fréquence issue du Top 15 ADN.",
        keyMetric: "Probabilité",
        colorTheme: "text-cyan-400",
        divergence: 20,
        radarStats: [{label: 'Force', value: 90}, {label: 'Flexibilité', value: 60}]
    });

    // --- STRATÉGIE 3 : TERRA (Structurelle) ---
    // Échantillonnage dans le Top 30. Cherche des combinaisons plus larges.
    const usedSoFar = new Set([...novaNumbers, ...neonNumbers]);
    const terraNumbers = getWeightedSelection(platinumPool.slice(5, 35), 5, usedSoFar);
    timelines.push({
        type: 'TERRA',
        title: 'Structure Profonde',
        numbers: terraNumbers,
        score: 85,
        intuitionScore: 80,
        remark: "Exploration du 'Ventre Mou' statistique (Rangs 5-35).",
        keyMetric: "Densité",
        colorTheme: "text-emerald-400",
        divergence: 50,
        radarStats: [{label: 'Force', value: 75}, {label: 'Couverture', value: 90}]
    });

    // --- STRATÉGIE 4 : CHRONOS (Stabilité/Cycles) ---
    // Filtre le pool pour garder ceux avec un bon score 'Gap' ou 'Equilibrium' si ces poids sont actifs dans l'ADN
    const chronosPool = platinumPool.filter(p => (p.breakdown.equilibrium || 0) > 50 || (p.breakdown.gap || 0) > 50);
    const chronosNumbers = getWeightedSelection(chronosPool.length > 5 ? chronosPool : platinumPool, 5, usedSoFar);
    timelines.push({
        type: 'CHRONOS',
        title: 'Maturité Cyclique',
        numbers: chronosNumbers,
        score: 88,
        intuitionScore: 85,
        remark: "Focus sur la régularité et l'équilibre temporel (Gap/Equilibrium).",
        keyMetric: "Stabilité",
        colorTheme: "text-amber-400",
        divergence: 30,
        radarStats: [{label: 'Stabilité', value: 95}, {label: 'Force', value: 80}]
    });

    // --- STRATÉGIE 5 : AETHER (Potentiel/Chaos) ---
    // Cherche les numéros avec un bon score ADN global MAIS qui sont des outsiders (Anti-consensus ou Spectral fort)
    const aetherPool = platinumPool.filter(p => (p.breakdown.anti_consensus || 0) > 40 || (p.breakdown.spectral || 0) > 60);
    const aetherNumbers = getWeightedSelection(aetherPool.length > 5 ? aetherPool : platinumPool.slice(20, 50), 5, usedSoFar);
    timelines.push({
        type: 'AETHER',
        title: 'Singularité Chaos',
        numbers: aetherNumbers,
        score: 82,
        intuitionScore: 95,
        remark: "Vecteurs à haut potentiel de rupture (Anti-Consensus).",
        keyMetric: "Impact",
        colorTheme: "text-rose-400",
        divergence: 80,
        radarStats: [{label: 'Surprise', value: 100}, {label: 'Force', value: 70}]
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
        analysis: `Génération Platinum v3 : 5 vecteurs dérivés de l'ADN ${Object.keys(weights).filter(k => (weights as any)[k] > 0.1).join('+')}.`,
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
