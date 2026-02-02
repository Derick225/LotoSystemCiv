
import { 
  PlatinumResult, 
  DrawResult, 
  ScoreBreakdown,
  SymbioticContext,
  PlatinumTimeline,
  Prediction
} from '../types';
import { 
  getAlgoWeights, 
  generateMasterPrediction
} from './predictionEngine';

/**
 * Nexus MetaAnalyst v19.6 - MULTIVERSE TIMELINES (Anti-Linear Patch)
 * Génère 5 réalités statistiques distinctes pour couvrir les angles morts de l'Oracle Base.
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

// Fonction utilitaire améliorée pour éviter les suites logiques (1, 2, 3...)
const getDivergentPool = (
    sortedPool: number[], 
    basePrediction: number[], 
    count: number = 5
): number[] => {
    // 1. On retire les numéros déjà présents dans la prédiction de l'Oracle Base
    const candidates = sortedPool.filter(n => !basePrediction.includes(n));
    
    // 2. SÉLECTION ENTROPIQUE (Correction du bug "1, 2, 3, 4")
    // Au lieu de prendre les 5 premiers stricts (qui peuvent être voisins si les scores sont proches),
    // on prend le TOP 15 (la crème de la crème) et on injecte du hasard dedans.
    const topTier = candidates.slice(0, 15);
    
    // Mélange du Top 15 pour casser la linéarité
    const shuffled = topTier.sort(() => 0.5 - Math.random());
    
    // Sélection des N élus
    let selection = shuffled.slice(0, count).sort((a,b) => a-b);

    // 3. FILET DE SÉCURITÉ : Détection de suites aberrantes (ex: 1,2,3,4)
    let sequenceCount = 0;
    let isSuspicious = false;
    for(let i=0; i < selection.length - 1; i++) {
        if(selection[i+1] === selection[i] + 1) sequenceCount++;
        else sequenceCount = 0;
        
        // Si on a 3 numéros qui se suivent (ex: 1,2,3), c'est suspect pour une IA
        if(sequenceCount >= 2) isSuspicious = true; 
    }

    if (isSuspicious) {
        // Fallback : on pioche plus large (Top 30) pour garantir la dispersion
        selection = candidates.slice(0, 30).sort(() => 0.5 - Math.random()).slice(0, count).sort((a,b)=>a-b);
    }

    return selection;
};

export async function generatePlatinumPrediction(
    drawName: string, 
    history: DrawResult[],
    precomputedMetrics?: any,
    _userBias?: any, // Deprecated in v19.5
    symbioticContext?: SymbioticContext | null,
    basePrediction?: Prediction | null // On passe la prédiction de base pour la divergence
): Promise<PlatinumResult> {
    if (history.length < 15) throw new Error("Dataset insuffisant.");

    // 1. Récupération des scores bruts atomiques
    const scores = await precomputeBaseScores(drawName, history, precomputedMetrics);
    
    // Numéros suggérés par l'Oracle Base (à éviter partiellement pour proposer des alternatives)
    const baseNumbers = basePrediction?.suggestedNumbers || [];
    const pool = Array.from({length: 90}, (_, i) => i + 1);

    // Helper pour récupérer une valeur numérique sûre
    const getVal = (scoreObj: any, key: string) => Number(scoreObj?.[key]) || 0;

    // --- TIMELINE 1 : NEON (SPECTRAL ECHO) ---
    // Focus sur la résonance pure et les ondes (Wavelet + Spectral)
    const neonPool = [...pool].sort((a, b) => {
        const sA = scores[a]; const sB = scores[b];
        const scoreA = (getVal(sA, 'spectral') * 2) + (getVal(sA, 'wavelet') * 2) + getVal(sA, 'equilibrium');
        const scoreB = (getVal(sB, 'spectral') * 2) + (getVal(sB, 'wavelet') * 2) + getVal(sB, 'equilibrium');
        // Tie-breaker aléatoire pour éviter l'ordre naturel 1,2,3... en cas d'égalité
        return (scoreB - scoreA) || (Math.random() - 0.5);
    });
    const neonNumbers = getDivergentPool(neonPool, baseNumbers);

    // --- TIMELINE 2 : TERRA (SPATIAL RIFT) ---
    // Focus sur la géométrie, la grille, les clusters
    const terraPool = [...pool].sort((a, b) => {
        const sA = scores[a]; const sB = scores[b];
        const scoreA = (getVal(sA, 'spatial') * 3) + (getVal(sA, 'orchestration') * 2);
        const scoreB = (getVal(sB, 'spatial') * 3) + (getVal(sB, 'orchestration') * 2);
        return (scoreB - scoreA) || (Math.random() - 0.5);
    });
    const terraNumbers = getDivergentPool(terraPool, baseNumbers);

    // --- TIMELINE 3 : CHRONOS (TEMPORAL SHADOW) ---
    // Focus sur les Gaps et la Vélocité
    const chronosPool = [...pool].sort((a, b) => {
        const sA = scores[a]; const sB = scores[b];
        const scoreA = (getVal(sA, 'gap') * 2) + (getVal(sA, 'gap_velocity') * 3) + getVal(sA, 'markov');
        const scoreB = (getVal(sB, 'gap') * 2) + (getVal(sB, 'gap_velocity') * 3) + getVal(sB, 'markov');
        return (scoreB - scoreA) || (Math.random() - 0.5);
    });
    const chronosNumbers = getDivergentPool(chronosPool, baseNumbers);

    // --- TIMELINE 4 : AETHER (CHAOS THEORY) ---
    // Focus sur l'anti-consensus
    const aetherPool = [...pool].sort((a, b) => {
        const sA = scores[a]; const sB = scores[b];
        const scoreA = (getVal(sA, 'anti_consensus') * 3) + (getVal(sA, 'isolation_anomaly') * 2) + getVal(sA, 'resistance');
        const scoreB = (getVal(sB, 'anti_consensus') * 3) + (getVal(sB, 'isolation_anomaly') * 2) + getVal(sB, 'resistance');
        return (scoreB - scoreA) || (Math.random() - 0.5);
    });
    const aetherNumbers = getDivergentPool(aetherPool, baseNumbers);

    // --- TIMELINE 5 : NOVA (NEURAL DREAM) ---
    // Focus sur l'IA pure
    const novaPool = [...pool].sort((a, b) => {
        const sA = scores[a]; const sB = scores[b];
        const scoreA = (getVal(sA, 'decision_forest') * 3) + (getVal(sA, 'ai_intuition') * 2) + getVal(sA, 'poisson');
        const scoreB = (getVal(sB, 'decision_forest') * 3) + (getVal(sB, 'ai_intuition') * 2) + getVal(sB, 'poisson');
        return (scoreB - scoreA) || (Math.random() - 0.5);
    });
    const novaNumbers = getDivergentPool(novaPool, baseNumbers);

    const timelines: PlatinumTimeline[] = [
        {
            type: 'NEON', title: 'Echo Quantique', numbers: neonNumbers, score: 94, intuitionScore: 85,
            remark: "Basé sur la résonance spectrale pure. Ignore les fréquences historiques.",
            keyMetric: "Vibration FFT", colorTheme: "text-cyan-400"
        },
        {
            type: 'TERRA', title: 'Faille Géométrique', numbers: terraNumbers, score: 88, intuitionScore: 60,
            remark: "Exploite les clusters spatiaux et la topologie de la grille.",
            keyMetric: "Densité Spatiale", colorTheme: "text-emerald-400"
        },
        {
            type: 'CHRONOS', title: 'Ombre Temporelle', numbers: chronosNumbers, score: 91, intuitionScore: 45,
            remark: "Cible les ruptures de rythme et les écarts critiques.",
            keyMetric: "Gap Velocity", colorTheme: "text-amber-400"
        },
        {
            type: 'AETHER', title: 'Entropie Pure', numbers: aetherNumbers, score: 75, intuitionScore: 95,
            remark: "Contre-intuitif. Cible les anomalies statistiques rejetées par le consensus.",
            keyMetric: "Anti-Consensus", colorTheme: "text-rose-400"
        },
        {
            type: 'NOVA', title: 'Rêve Neuronal', numbers: novaNumbers, score: 98, intuitionScore: 99,
            remark: "La vision pure des forêts de décision et de l'IA générative.",
            keyMetric: "Forest Vote", colorTheme: "text-purple-400"
        }
    ];

    // Calcul des "Rois" (Numéros qui reviennent dans plusieurs timelines alternatives)
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
        analysis: `Divergence Platinum Complète. 5 Réalités générées en complément de l'Oracle Base.`,
        drawName, 
        timestamp: Date.now()
    };
}

export const savePlatinumHistory = (result: PlatinumResult) => {
    const key = `platinum_hist_${result.drawName}`;
    const existing = JSON.parse(localStorage.getItem(key) || '[]');
    localStorage.setItem(key, JSON.stringify([result, ...existing].slice(0, 15)));
};
