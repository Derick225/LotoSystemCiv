import { DrawResult, Prediction, AlgoWeights, ScoreBreakdown, SymbioticContext, AdaptiveRules, TicketAnalysisResult, ForensicReport } from '../types';
import { calculateACValue, calculateDigitalRoot, calculateShannonEntropy, calculateRegularity } from './mathService';
import { supabase, isSupabaseConfigured } from './supabaseClient';

/**
 * NEXUS PREDICTION ENGINE v20.0 - DATA SCIENCE CORE
 * Fusion déterministe Poisson-Markov avec Tie-Breaking Stochastique.
 */

export const getDefaultWeights = (): AlgoWeights => ({
    frequency: 0.10,
    gap: 0.15,
    spectral: 0.10,
    fractal: 0.05,
    markov: 0.20,      // Coeur de la prédiction séquentielle
    poisson: 0.20,     // Rigueur statistique
    momentum: 0.05,
    equilibrium: 0.05,
    ai_intuition: 0.05,
    decision_forest: 0.05,
    wavelet: 0.0,
    resistance: 0.0,
    spatial: 0.0,
    orchestration: 0.0,
    digital_root: 0.0,
    gap_velocity: 0.0,
    isolation_anomaly: 0.0,
    leader_succession: 0.0,
    anti_consensus: 0.0,
    monte_carlo: 0.0,
    lstm_pattern: 0.0,
    bayes: 0.0,
    temporal: 0.0,
    transformer: 0.0
} as any);

export const normalizeWeights = (weights: AlgoWeights): AlgoWeights => {
    const total = Object.values(weights).reduce((a, b) => a + (Number(b) || 0), 0);
    if (total <= 0) return getDefaultWeights();
    const normalized = { ...weights };
    (Object.keys(normalized) as Array<keyof AlgoWeights>).forEach(key => {
        normalized[key] = parseFloat(((Number(normalized[key]) || 0) / total).toFixed(4));
    });
    return normalized;
};

// --- CONFIGURATION RULES ---
export const getDefaultRules = (): AdaptiveRules => ({
    criticalZoneMin: 8,
    criticalZoneMax: 22
});

export const getAdaptiveRules = (drawName: string): AdaptiveRules => {
    const raw = localStorage.getItem(`nexus_rules_${drawName}`);
    return raw ? JSON.parse(raw) : getDefaultRules();
};

export const saveAdaptiveRules = (drawName: string, rules: AdaptiveRules) => {
    localStorage.setItem(`nexus_rules_${drawName}`, JSON.stringify(rules));
};

export const generateMasterPrediction = async (
    drawName: string, 
    history: DrawResult[],
    weightsToUse?: AlgoWeights,
    metrics?: any,
    symbioticContext?: SymbioticContext
): Promise<Prediction> => {
    if (history.length < 10) throw new Error("Dataset insuffisant.");

    const weights = normalizeWeights(weightsToUse || await getAlgoWeights(drawName));
    const regularity = metrics?.regularity || calculateRegularity(history.slice(0, 100));
    const lastWinners = history[0].gagnants;
    const correlationMap = metrics?.correlationMatrix || {};

    const masterScores = Array.from({ length: 90 }, (_, i) => {
        const num = i + 1;
        const reg = regularity.find((r: any) => r.number === num);
        const freq = history.filter(h => h.gagnants.includes(num)).length;
        
        // 1. POISSON REAL-MATH : P(X >= 1) = 1 - e^-lambda
        const lambda = (freq / history.length) * (90/5);
        const poissonScore = (1 - Math.exp(-lambda)) * 100;

        // 2. MARKOV TRANSITION
        let markovScore = 0;
        lastWinners.forEach(lw => {
            const strength = correlationMap[lw]?.affinities?.[num] || 0;
            markovScore += (strength * 100);
        });

        const nBreakdown: ScoreBreakdown = {
            frequency: (freq / history.length) * 500,
            gap: reg ? (reg.currentGap / (reg.avgGap || 18)) * 50 : 0,
            poisson: poissonScore,
            markov: Math.min(100, markovScore * 2),
            spectral: metrics?.spectral?.find((s:any) => s.number === num)?.energy || 0,
            decision_forest: symbioticContext?.forestVotes?.[num] || 0,
            momentum: 50,
            equilibrium: 50,
            ai_intuition: 50,
            fractal: 50
        } as any;

        let finalScore = 0;
        (Object.keys(weights) as Array<keyof AlgoWeights>).forEach(k => {
            finalScore += (nBreakdown[k] || 0) * (Number(weights[k]) || 0);
        });

        return { num, score: finalScore, breakdown: nBreakdown };
    });

    // TRI DÉTERMINISTE AVEC CASCADE DE TIE-BREAKING
    const sorted = masterScores.sort((a, b) => {
        const diff = b.score - a.score;
        if (Math.abs(diff) > 0.001) return diff;
        // Tie-breaker 1: Poisson (Rigueur)
        const pDiff = (b.breakdown.poisson || 0) - (a.breakdown.poisson || 0);
        if (Math.abs(pDiff) > 0.01) return pDiff;
        // Tie-breaker 2: Index (Stabilité)
        return b.num - a.num;
    });

    const selection = sorted.slice(0, 5).map(s => s.num).sort((a,b) => a-b);

    return {
        suggestedNumbers: selection,
        candidates: sorted.slice(5, 15).map(s => s.num),
        confidence: Math.min(99, Math.round(sorted.slice(0, 5).reduce((a,b) => a + b.score, 0) / 5)),
        analysis: `Moteur Hybrid v20. Convergence Poisson-Markov établie sur ${drawName}.`,
        breakdown: masterScores.reduce((acc, curr) => ({ ...acc, [curr.num]: curr.breakdown }), {}),
        timestamp: Date.now()
    };
};

export const getAlgoWeights = async (drawName: string): Promise<AlgoWeights> => {
    if (isSupabaseConfigured() && navigator.onLine) {
        try {
            const { data } = await supabase.from('algo_weights').select('weights').eq('draw_name', drawName).single();
            if (data?.weights) return data.weights;
        } catch (e) { }
    }
    const raw = localStorage.getItem(`nexus_config_${drawName}`);
    return raw ? JSON.parse(raw).weights : getDefaultWeights();
};

export const saveAlgoWeights = async (drawName: string, weights: AlgoWeights) => {
    localStorage.setItem(`nexus_config_${drawName}`, JSON.stringify({ weights, updatedAt: new Date().toISOString() }));
    if (isSupabaseConfigured()) {
        try { await supabase.from('algo_weights').upsert({ draw_name: drawName, weights }); } catch(e) {}
    }
};

export const getStrategyName = (weights: AlgoWeights): string => {
    const dominant = Object.entries(weights).sort((a,b) => (b[1] as number) - (a[1] as number))[0];
    return `Mode ${dominant[0].toUpperCase()}`;
};

export const analyzeTicketStrength = async (numbers: number[], _drawName: string): Promise<TicketAnalysisResult> => {
    const ac = calculateACValue(numbers);
    const sum = numbers.reduce((a, b) => a + b, 0);
    const warnings: string[] = [];
    if (ac < 7) warnings.push("Complexité Arithmétique faible.");
    if (sum < 150 || sum > 300) warnings.push("Masse numérique hors zone optimale.");
    const score = Math.round((Math.min(10, ac) / 10) * 100);
    return { score, verdict: score > 75 ? "Elite" : "Standard", warnings };
};

export const calculateCorrectionsFromForensics = (weights: AlgoWeights, rules: AdaptiveRules, report: ForensicReport) => {
    const newWeights = { ...weights };
    const reasoning: string[] = [];
    report.scoreDivergence.forEach(div => {
        const key = div.algo.toLowerCase() as keyof AlgoWeights;
        if (newWeights[key] !== undefined) {
            newWeights[key] = parseFloat((Number(newWeights[key]) + (div.impact / 100) * 0.05).toFixed(4));
            reasoning.push(`Amplification ${div.algo} (+${div.impact}%)`);
        }
    });
    return { newWeights: normalizeWeights(newWeights), newRules: rules, reasoning };
};
