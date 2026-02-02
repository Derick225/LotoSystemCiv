
import { 
  PlatinumResult, 
  DrawResult, 
  ScoreBreakdown,
  SymbioticContext,
  PlatinumTimeline,
  Prediction,
  AlgoWeights
} from '../types';
import { 
  getAlgoWeights, 
  generateMasterPrediction
} from './predictionEngine';

/**
 * Nexus MetaAnalyst v20.0 - DNA INFUSED KERNEL
 * Génère des réalités statistiques basées strictement sur l'ADN Algorithmique du tirage.
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
    
    // On récupère les poids ici pour le calcul maître, mais ils seront réutilisés dans la génération Platinum
    const weights = await getAlgoWeights(drawName);
    const masterPred = await generateMasterPrediction(drawName, history, weights, metrics);
    const data = masterPred.breakdown || {};
    
    SCORE_CACHE.set(drawName, { data, ts: now });
    return data;
};

// Fonction utilitaire pour éviter les suites logiques et sélectionner avec entropie
const getDivergentPool = (
    sortedPool: number[], 
    basePrediction: number[], 
    count: number = 5
): number[] => {
    // 1. Exclusion des numéros de l'Oracle Base pour offrir une vraie alternative
    const candidates = sortedPool.filter(n => !basePrediction.includes(n));
    
    // 2. Sélection Entropique (Top 15 mélangé)
    const topTier = candidates.slice(0, 15);
    const shuffled = topTier.sort(() => 0.5 - Math.random());
    
    // 3. Sélection finale
    let selection = shuffled.slice(0, count).sort((a,b) => a-b);

    // 4. Filet de sécurité anti-linéarité (ex: 1,2,3,4)
    let sequenceCount = 0;
    let isSuspicious = false;
    for(let i=0; i < selection.length - 1; i++) {
        if(selection[i+1] === selection[i] + 1) sequenceCount++;
        else sequenceCount = 0;
        if(sequenceCount >= 2) isSuspicious = true; 
    }

    if (isSuspicious) {
        // Fallback : on élargit la fenêtre de tirage
        selection = candidates.slice(0, 25).sort(() => 0.5 - Math.random()).slice(0, count).sort((a,b)=>a-b);
    }

    return selection;
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

    // 1. Chargement de l'ADN du tirage (Poids configurés par l'utilisateur ou l'IA)
    const weights = await getAlgoWeights(drawName);

    // 2. Récupération des scores bruts atomiques
    const scores = await precomputeBaseScores(drawName, history, precomputedMetrics);
    
    const baseNumbers = basePrediction?.suggestedNumbers || [];
    const pool = Array.from({length: 90}, (_, i) => i + 1);

    // Helper: Calcul un score pondéré par l'ADN du tirage pour un set de critères
    // Si le poids dans l'ADN est 0, le critère est ignoré. S'il est élevé, il domine.
    const getDnaScore = (num: number, targetKeys: (keyof AlgoWeights)[], boostFactor: number = 1) => {
        const s = scores[num];
        if (!s) return 0;
        
        return targetKeys.reduce((acc, key) => {
            const val = Number(s[key]) || 0;
            // On utilise le poids défini dans l'ADN du tirage. 
            // On ajoute un epsilon (0.05) pour que la timeline garde sa "couleur" même si le poids est nul.
            const dnaWeight = (Number(weights[key]) || 0) + 0.05; 
            return acc + (val * dnaWeight * boostFactor);
        }, 0);
    };

    // --- TIMELINE 1 : NEON (SPECTRAL ECHO) ---
    // Amplifie : Spectral, Wavelet, Equilibrium selon l'ADN
    const neonPool = [...pool].sort((a, b) => {
        const scoreA = getDnaScore(a, ['spectral', 'wavelet', 'equilibrium'], 2.0);
        const scoreB = getDnaScore(b, ['spectral', 'wavelet', 'equilibrium'], 2.0);
        return (scoreB - scoreA) || (Math.random() - 0.5);
    });
    const neonNumbers = getDivergentPool(neonPool, baseNumbers);

    // --- TIMELINE 2 : TERRA (SPATIAL RIFT) ---
    // Amplifie : Spatial, Orchestration
    const terraPool = [...pool].sort((a, b) => {
        const scoreA = getDnaScore(a, ['spatial', 'orchestration'], 2.5);
        const scoreB = getDnaScore(b, ['spatial', 'orchestration'], 2.5);
        return (scoreB - scoreA) || (Math.random() - 0.5);
    });
    const terraNumbers = getDivergentPool(terraPool, baseNumbers);

    // --- TIMELINE 3 : CHRONOS (TEMPORAL SHADOW) ---
    // Amplifie : Gap, Gap Velocity, Markov
    const chronosPool = [...pool].sort((a, b) => {
        const scoreA = getDnaScore(a, ['gap', 'gap_velocity', 'markov'], 2.0);
        const scoreB = getDnaScore(b, ['gap', 'gap_velocity', 'markov'], 2.0);
        return (scoreB - scoreA) || (Math.random() - 0.5);
    });
    const chronosNumbers = getDivergentPool(chronosPool, baseNumbers);

    // --- TIMELINE 4 : AETHER (CHAOS THEORY) ---
    // Amplifie : Anti-Consensus, Isolation, Resistance
    const aetherPool = [...pool].sort((a, b) => {
        const scoreA = getDnaScore(a, ['anti_consensus', 'isolation_anomaly', 'resistance'], 3.0);
        const scoreB = getDnaScore(b, ['anti_consensus', 'isolation_anomaly', 'resistance'], 3.0);
        return (scoreB - scoreA) || (Math.random() - 0.5);
    });
    const aetherNumbers = getDivergentPool(aetherPool, baseNumbers);

    // --- TIMELINE 5 : NOVA (PURE DNA) ---
    // C'est la vision pure de l'ADN configuré, appliquée sur le pool de divergence.
    // Elle respecte EXACTEMENT la pondération globale définie dans "Tuning".
    const novaPool = [...pool].sort((a, b) => {
        let scoreA = 0; let scoreB = 0;
        // Somme pondérée complète selon l'ADN
        (Object.keys(weights) as Array<keyof AlgoWeights>).forEach(k => {
            const w = Number(weights[k]) || 0;
            if (w > 0) {
                scoreA += (Number(scores[a]?.[k]) || 0) * w;
                scoreB += (Number(scores[b]?.[k]) || 0) * w;
            }
        });
        return (scoreB - scoreA) || (Math.random() - 0.5);
    });
    const novaNumbers = getDivergentPool(novaPool, baseNumbers);

    const timelines: PlatinumTimeline[] = [
        {
            type: 'NEON', title: 'Echo Quantique', numbers: neonNumbers, score: 94, intuitionScore: 85,
            remark: "Amplification des fréquences spectrales définies dans l'ADN du tirage.",
            keyMetric: "Vibration FFT", colorTheme: "text-cyan-400"
        },
        {
            type: 'TERRA', title: 'Faille Géométrique', numbers: terraNumbers, score: 88, intuitionScore: 60,
            remark: "Focus sur la topologie spatiale et l'orchestration pondérée.",
            keyMetric: "Densité Spatiale", colorTheme: "text-emerald-400"
        },
        {
            type: 'CHRONOS', title: 'Ombre Temporelle', numbers: chronosNumbers, score: 91, intuitionScore: 45,
            remark: "Exploitation des écarts critiques selon la vélocité paramétrée.",
            keyMetric: "Gap Velocity", colorTheme: "text-amber-400"
        },
        {
            type: 'AETHER', title: 'Entropie Pure', numbers: aetherNumbers, score: 75, intuitionScore: 95,
            remark: "Vecteurs de résistance et anti-consensus configurés.",
            keyMetric: "Anti-Consensus", colorTheme: "text-rose-400"
        },
        {
            type: 'NOVA', title: 'Rêve Neuronal', numbers: novaNumbers, score: 98, intuitionScore: 99,
            remark: "Projection fidèle de l'ADN Algorithmique complet (Tous poids inclus).",
            keyMetric: "Full DNA Match", colorTheme: "text-purple-400"
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
        analysis: `Divergence Platinum v20. Génération synchronisée avec l'ADN "${drawName}".`,
        drawName, 
        timestamp: Date.now()
    };
}

export const savePlatinumHistory = (result: PlatinumResult) => {
    const key = `platinum_hist_${result.drawName}`;
    const existing = JSON.parse(localStorage.getItem(key) || '[]');
    localStorage.setItem(key, JSON.stringify([result, ...existing].slice(0, 15)));
};
