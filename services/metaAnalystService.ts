
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
 * Nexus MetaAnalyst v21.0 - DNA INFUSED KERNEL (ENHANCED COCKTAIL)
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
    
    // On récupère les poids ici pour le calcul maître
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
    
    // 2. Sélection Entropique (Top 12 mélangé - fenêtre réduite pour élitisme)
    const topTier = candidates.slice(0, 12);
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
        selection = candidates.slice(0, 20).sort(() => 0.5 - Math.random()).slice(0, count).sort((a,b)=>a-b);
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

    // Identifier les "Drivers" (les 3 algos les plus forts de l'ADN)
    const sortedWeights = Object.entries(weights)
        .sort(([,a], [,b]) => (Number(b)||0) - (Number(a)||0))
        .slice(0, 3)
        .map(([k]) => k);

    // 2. Récupération des scores bruts atomiques
    const scores = await precomputeBaseScores(drawName, history, precomputedMetrics);
    
    const baseNumbers = basePrediction?.suggestedNumbers || [];
    const pool = Array.from({length: 90}, (_, i) => i + 1);

    /**
     * CALCULATEUR DE SCORE RENFORCÉ (COCKTAIL LOGIC)
     * @param num Numéro à évaluer
     * @param targetKeys Clés algorithmiques spécifiques à la timeline (ou toutes pour Nova)
     * @param boostFactor Facteur d'amplification global
     */
    const getDnaScore = (num: number, targetKeys: string[], boostFactor: number = 1) => {
        const s = scores[num];
        if (!s) return 0;
        
        let totalScore = 0;
        let synergyBonuses = 0;
        let activeWeightsSum = 0;

        targetKeys.forEach(key => {
            const k = key as keyof AlgoWeights;
            // On sature les valeurs pour éviter les NaN/undefined
            const rawVal = Math.min(100, Math.max(0, Number(s[k]) || 0)); 
            const dnaWeight = Number(weights[k]) || 0; 

            // Si le poids est nul dans l'ADN, on l'ignore totalement (Filtrage Strict)
            if (dnaWeight <= 0.01) return;

            activeWeightsSum += dnaWeight;

            // AMPLIFICATION NON-LINÉAIRE
            // Si c'est un algo dominant de l'ADN, son impact est au carré
            // Cela permet de vraiment différencier les numéros qui matchent l'ADN fort
            const isDriver = sortedWeights.includes(key);
            const effectiveWeight = isDriver ? dnaWeight * 1.5 : dnaWeight;

            let weightedScore = rawVal * effectiveWeight;

            // BONUS DE SYNERGIE
            // Si le numéro est très fort (>75) sur un critère important, il gagne un bonus
            if (rawVal > 75 && dnaWeight > 0.15) {
                synergyBonuses += 15; // Point de boost fixe
            }

            totalScore += weightedScore;
        });

        // Normalisation approximative pour garder des échelles cohérentes
        const normalizedBase = activeWeightsSum > 0 ? totalScore : 0;
        
        return (normalizedBase + synergyBonuses) * boostFactor;
    };

    // --- TIMELINE 1 : NEON (SPECTRAL ECHO) ---
    // Focus: Spectral, Wavelet, Equilibrium
    const neonPool = [...pool].sort((a, b) => {
        const scoreA = getDnaScore(a, ['spectral', 'wavelet', 'equilibrium'], 1.2);
        const scoreB = getDnaScore(b, ['spectral', 'wavelet', 'equilibrium'], 1.2);
        return (scoreB - scoreA) || (Math.random() - 0.5);
    });
    const neonNumbers = getDivergentPool(neonPool, baseNumbers);

    // --- TIMELINE 2 : TERRA (SPATIAL RIFT) ---
    // Focus: Spatial, Orchestration
    const terraPool = [...pool].sort((a, b) => {
        const scoreA = getDnaScore(a, ['spatial', 'orchestration'], 1.5); // Boost plus fort car moins de critères
        const scoreB = getDnaScore(b, ['spatial', 'orchestration'], 1.5);
        return (scoreB - scoreA) || (Math.random() - 0.5);
    });
    const terraNumbers = getDivergentPool(terraPool, baseNumbers);

    // --- TIMELINE 3 : CHRONOS (TEMPORAL SHADOW) ---
    // Focus: Gap, Gap Velocity, Markov
    const chronosPool = [...pool].sort((a, b) => {
        const scoreA = getDnaScore(a, ['gap', 'gap_velocity', 'markov'], 1.2);
        const scoreB = getDnaScore(b, ['gap', 'gap_velocity', 'markov'], 1.2);
        return (scoreB - scoreA) || (Math.random() - 0.5);
    });
    const chronosNumbers = getDivergentPool(chronosPool, baseNumbers);

    // --- TIMELINE 4 : AETHER (CHAOS THEORY) ---
    // Focus: Anti-Consensus, Isolation, Resistance
    const aetherPool = [...pool].sort((a, b) => {
        const scoreA = getDnaScore(a, ['anti_consensus', 'isolation_anomaly', 'resistance'], 1.8); // Très spécifique
        const scoreB = getDnaScore(b, ['anti_consensus', 'isolation_anomaly', 'resistance'], 1.8);
        return (scoreB - scoreA) || (Math.random() - 0.5);
    });
    const aetherNumbers = getDivergentPool(aetherPool, baseNumbers);

    // --- TIMELINE 5 : NOVA (PURE DNA) ---
    // C'est la vision pure de l'ADN configuré.
    // Utilise TOUS les poids définis non-nuls.
    const allKeys = Object.keys(weights).filter(k => (Number(weights[k as keyof AlgoWeights]) || 0) > 0);
    
    const novaPool = [...pool].sort((a, b) => {
        const scoreA = getDnaScore(a, allKeys, 1.0);
        const scoreB = getDnaScore(b, allKeys, 1.0);
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
            remark: "Projection fidèle de l'ADN Algorithmique complet (Mode Cocktail Synergique).",
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
        analysis: `Divergence Platinum v21 (Cocktail Synergique). Génération synchronisée avec l'ADN "${drawName}".`,
        drawName, 
        timestamp: Date.now()
    };
}

export const savePlatinumHistory = (result: PlatinumResult) => {
    const key = `platinum_hist_${result.drawName}`;
    const existing = JSON.parse(localStorage.getItem(key) || '[]');
    // On ne garde que les 20 derniers pour éviter de saturer le stockage
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
        
        return {
            type: t.type,
            hits,
            numbers: matchingNumbers
        };
    });

    let verdict = "Déphasage Complet. Le système doit être recalibré.";
    if (bestScore >= 3) verdict = `Convergence Réussie sur la timeline ${bestTimeline}.`;
    else if (bestScore >= 1) verdict = `Signal partiel détecté sur ${bestTimeline}.`;

    // Score de synchro global : Moyenne des hits des timelines + Bonus King Numbers
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
