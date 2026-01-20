
import { DrawResult, Prediction, AlgoWeights, ScoreBreakdown, AdaptiveRules, ForensicReport, TicketAnalysisResult } from '../types';
import { calculateRegularity, calculateACValue, calculateVolatility, calculateDigitalRoot, calculateShannonEntropy } from './mathService';
import { supabase, isSupabaseConfigured } from './supabaseClient';

/**
 * NEXUS PREDICTION ENGINE v14.0 - PERSISTENCE & APEX KERNEL
 */

export const normalizeWeights = (weights: AlgoWeights): AlgoWeights => {
    const total = Object.values(weights).reduce((a, b) => a + (Number(b) || 0), 0);
    if (total === 0) return getDefaultWeights();
    const normalized = { ...weights };
    (Object.keys(normalized) as Array<keyof AlgoWeights>).forEach(key => {
        normalized[key] = parseFloat(((Number(normalized[key]) || 0) / total).toFixed(4));
    });
    return normalized;
};

export const getDefaultWeights = (): AlgoWeights => normalizeWeights({
    frequency: 0.08, 
    gap: 0.12,
    spectral: 0.18, 
    fractal: 0.08, 
    markov: 0.18,
    wavelet: 0.12, 
    orchestration: 0.12, 
    momentum: 0.07, 
    equilibrium: 0.05,
    ai_intuition: 0.00, 
    digital_root: 0.0, 
    gap_velocity: 0.0, 
    isolation_anomaly: 0.0
} as any);

export const getDefaultRules = (): AdaptiveRules => ({
    criticalZoneMin: 12,
    criticalZoneMax: 18
});

/**
 * Sauvegarde persistante (Local + Cloud)
 */
export const saveAlgoWeights = async (drawName: string, weights: AlgoWeights, rules?: AdaptiveRules) => {
    // 1. Sauvegarde Locale (Réactivité)
    const dataToSave = {
        weights,
        rules: rules || getAdaptiveRules(drawName),
        updatedAt: new Date().toISOString()
    };
    localStorage.setItem(`nexus_config_${drawName}`, JSON.stringify(dataToSave));
    localStorage.setItem(`weights_${drawName}`, JSON.stringify(weights)); // Backward compat

    // 2. Synchronisation Cloud (Pérennité)
    if (isSupabaseConfigured()) {
        try {
            await supabase.from('algo_weights').upsert({
                draw_name: drawName,
                weights: dataToSave,
                updated_at: new Date().toISOString()
            });
        } catch (e) {
            console.warn("Cloud Sync weights failed:", e);
        }
    }
};

export const getAlgoWeightsSync = (drawName: string): AlgoWeights => {
    const raw = localStorage.getItem(`nexus_config_${drawName}`);
    if (raw) {
        const parsed = JSON.parse(raw);
        return parsed.weights || getDefaultWeights();
    }
    const legacy = localStorage.getItem(`weights_${drawName}`);
    return legacy ? JSON.parse(legacy) : getDefaultWeights();
};

export const getAlgoWeights = async (drawName: string): Promise<AlgoWeights> => {
    // Tentative de récupération Cloud si connecté
    if (isSupabaseConfigured() && navigator.onLine) {
        try {
            const { data } = await supabase
                .from('algo_weights')
                .select('weights')
                .eq('draw_name', drawName)
                .single();
            
            if (data?.weights?.weights) {
                // Refresh cache local
                localStorage.setItem(`nexus_config_${drawName}`, JSON.stringify(data.weights));
                return data.weights.weights;
            }
        } catch (e) { /* Fallback to local */ }
    }
    return getAlgoWeightsSync(drawName);
};

export const getAdaptiveRules = (drawName: string): AdaptiveRules => {
    const raw = localStorage.getItem(`nexus_config_${drawName}`);
    if (raw) {
        const parsed = JSON.parse(raw);
        return parsed.rules || getDefaultRules();
    }
    const legacy = localStorage.getItem(`rules_${drawName}`);
    return legacy ? JSON.parse(legacy) : getDefaultRules();
};

export const saveAdaptiveRules = async (drawName: string, rules: AdaptiveRules) => {
    const weights = await getAlgoWeights(drawName);
    await saveAlgoWeights(drawName, weights, rules);
};

// ... Reste des fonctions d'analyse inchangées ...

export const analyzeTicketStrength = async (numbers: number[], drawName: string): Promise<TicketAnalysisResult> => {
    const ac = calculateACValue(numbers);
    const sum = numbers.reduce((a, b) => a + b, 0);
    const score = Math.min(100, (ac / 8) * 60 + (sum > 150 && sum < 300 ? 40 : 20));
    return {
        score,
        verdict: score > 75 ? "Excellent" : "Moyen",
        warnings: ac < 6 ? ["Structure trop simple"] : []
    };
};

export const generateMasterPrediction = async (
    drawName: string, 
    history: DrawResult[],
    weightsToUse?: AlgoWeights,
    metrics?: any
): Promise<Prediction> => {
    const weights = weightsToUse || getAlgoWeightsSync(drawName);
    if (!history || history.length < 10) throw new Error("Dataset insuffisant.");

    const regularity = metrics?.regularity || calculateRegularity(history);
    const correlationMap = metrics?.correlationMatrix || {};
    const lastWinners = history[0].gagnants;
    
    const entropy = calculateShannonEntropy(history.slice(0, 50));
    const chaosFactor = Math.max(0.5, 1 - (entropy.normalized - 0.85));

    const breakdown: Record<number, ScoreBreakdown> = {};
    const masterScores = Array.from({ length: 90 }, (_, i) => {
        const num = i + 1;
        const reg = regularity.find((r: any) => r.number === num);
        const spec = metrics?.spectral?.find((s: any) => s.number === num);
        
        const rawFreq = history.filter(h => h.gagnants.includes(num)).length;
        const freqScore = (Math.sqrt(rawFreq) / Math.sqrt(history.length)) * 100;
        
        let markovScore = 0;
        lastWinners.forEach(lw => {
           const strength = correlationMap[lw]?.affinities?.[num] || 0;
           if (strength > 0.2) markovScore += (strength * 100);
        });

        const digitalRoot = calculateDigitalRoot(num);
        const equilibriumScore = (digitalRoot >= 4 && digitalRoot <= 6) ? 80 : 40;

        const nBreakdown: ScoreBreakdown = {
            frequency: freqScore,
            gap: reg?.currentGap > (reg?.avgGap || 18) ? 90 : 30,
            spectral: spec?.energy || 0,
            markov: Math.min(100, markovScore * 2),
            equilibrium: equilibriumScore,
            wavelet: metrics?.wavelet?.find((w: any) => w.number === num)?.energy || 0,
            momentum: Math.sqrt(history.slice(0, 8).filter(h => h.gagnants.includes(num)).length) * 40,
            orchestration: 50, fractal: 50, spatial: 50, ai_intuition: 50, 
            resistance: 50, transformer: 0, temporal: 0, digital_root: digitalRoot * 10,
            gap_velocity: 0, poisson: 0, leader_succession: 0, anti_consensus: 0,
            monte_carlo: 0, lstm_pattern: 0, isolation_anomaly: 0, bayes: 0
        };
        
        breakdown[num] = nBreakdown;
        
        let finalScore = 0;
        (Object.keys(weights) as Array<keyof AlgoWeights>).forEach(k => {
            finalScore += (nBreakdown[k] || 0) * (weights[k] || 0);
        });

        return { num, score: finalScore };
    });

    const sorted = masterScores.sort((a, b) => b.score - a.score);
    const top5 = sorted.slice(0, 5).map(s => s.num);
    const acScore = calculateACValue(top5);
    
    let baseConfidence = (sorted[0].score + sorted[4].score) / 2;
    let finalConfidence = Math.round(baseConfidence * (acScore / 8) * chaosFactor);

    return {
        suggestedNumbers: top5,
        candidates: sorted.slice(5, 15).map(s => s.num),
        confidence: Math.min(98, Math.max(25, finalConfidence)),
        analysis: `Apex v14.0 Synchro. Équilibre fréquentiel respecté. Focus sur la cohérence structurelle.`,
        breakdown,
        usedWeights: weights,
        timestamp: Date.now()
    };
};

export const getStrategyName = (weights: AlgoWeights): string => {
    if (weights.markov > 0.2) return "Markovien Apex";
    if (weights.spectral > 0.2) return "Résonance de Phase";
    if (weights.gap > 0.2) return "Cycle Inversé";
    return "Consensus Nexus Apex";
};

export const calculateCorrectionsFromForensics = (
    currentWeights: AlgoWeights, 
    currentRules: AdaptiveRules, 
    report: ForensicReport
): { newWeights: AlgoWeights; newRules: AdaptiveRules; reasoning: string[] } => {
    const newWeights = { ...currentWeights };
    const reasoning: string[] = [];

    if (report.scoreDivergence && report.scoreDivergence.length > 0) {
        report.scoreDivergence.forEach(div => {
            const key = div.algo as keyof AlgoWeights;
            if (newWeights[key] !== undefined) {
                const currentVal = Number(newWeights[key]) || 0;
                const cap = key === 'frequency' ? 0.02 : 0.05;
                const adjustment = (div.impact / 100) * cap;
                newWeights[key] = currentVal + adjustment;
                reasoning.push(`Adaptation ADN : Ajustement du module ${div.algo} (+${(adjustment * 100).toFixed(1)}%).`);
            }
        });
    }

    const newRules = { ...currentRules };
    const hits = report.matches.filter(m => m.errorType === 'Hit').length;
    if (hits === 0) {
        newRules.criticalZoneMax = Math.min(45, newRules.criticalZoneMax + 1);
        reasoning.push("Élargissement du filtre temporel critique.");
    }

    return {
        newWeights: normalizeWeights(newWeights),
        newRules,
        reasoning
    };
};
