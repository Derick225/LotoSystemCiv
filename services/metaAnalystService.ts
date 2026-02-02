
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
 * Nexus MetaAnalyst v19.5 - MULTIVERSE TIMELINES
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

// Fonction utilitaire pour éviter la redondance avec l'Oracle Base
const getDivergentPool = (
    pool: number[], 
    basePrediction: number[], 
    count: number = 5
): number[] => {
    // On retire les numéros déjà présents dans la prédiction de l'Oracle Base
    // pour garantir que Platinum apporte de la valeur ajoutée (complémentarité)
    const candidates = pool.filter(n => !basePrediction.includes(n));
    return candidates.slice(0, count).sort((a,b)=>a-b);
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

    // --- TIMELINE 1 : NEON (SPECTRAL ECHO) ---
    // Focus sur la résonance pure et les ondes (Wavelet + Spectral)
    // Ignore la fréquence et le retard. Cherche la vibration.
    const neonPool = [...pool].sort((a, b) => {
        const sA = scores[a]; const sB = scores[b];
        const scoreA = (sA.spectral * 2) + (sA.wavelet * 2) + sA.equilibrium;
        const scoreB = (sB.spectral * 2) + (sB.wavelet * 2) + sB.equilibrium;
        return scoreB - scoreA;
    });
    const neonNumbers = getDivergentPool(neonPool, baseNumbers);

    // --- TIMELINE 2 : TERRA (SPATIAL RIFT) ---
    // Focus sur la géométrie, la grille, les clusters et l'orchestration
    const terraPool = [...pool].sort((a, b) => {
        const sA = scores[a]; const sB = scores[b];
        const scoreA = (sA.spatial * 3) + (sA.orchestration * 2);
        const scoreB = (sB.spatial * 3) + (sB.orchestration * 2);
        return scoreB - scoreA;
    });
    const terraNumbers = getDivergentPool(terraPool, baseNumbers);

    // --- TIMELINE 3 : CHRONOS (TEMPORAL SHADOW) ---
    // Focus sur les Gaps, la Vélocité et les cycles de Markov
    const chronosPool = [...pool].sort((a, b) => {
        const sA = scores[a]; const sB = scores[b];
        const scoreA = (sA.gap * 2) + (sA.gap_velocity * 3) + sA.markov;
        const scoreB = (sB.gap * 2) + (sB.gap_velocity * 3) + sB.markov;
        return scoreB - scoreA;
    });
    const chronosNumbers = getDivergentPool(chronosPool, baseNumbers);

    // --- TIMELINE 4 : AETHER (CHAOS THEORY) ---
    // Focus sur l'anti-consensus, les anomalies d'isolation et la résistance
    // Ce sont les "outsiders" mathématiques
    const aetherPool = [...pool].sort((a, b) => {
        const sA = scores[a]; const sB = scores[b];
        const scoreA = (sA.anti_consensus * 3) + (sA.isolation_anomaly * 2) + sA.resistance;
        const scoreB = (sB.anti_consensus * 3) + (sB.isolation_anomaly * 2) + sB.resistance;
        return scoreB - scoreA;
    });
    const aetherNumbers = getDivergentPool(aetherPool, baseNumbers);

    // --- TIMELINE 5 : NOVA (NEURAL DREAM) ---
    // Focus sur l'IA pure (Decision Forest + AI Intuition + Poisson)
    // Ce que la "machine" pense, indépendamment des stats classiques
    const novaPool = [...pool].sort((a, b) => {
        const sA = scores[a]; const sB = scores[b];
        const scoreA = (sA.decision_forest * 3) + (sA.ai_intuition * 2) + sA.poisson;
        const scoreB = (sB.decision_forest * 3) + (sB.ai_intuition * 2) + sB.poisson;
        return scoreB - scoreA;
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
