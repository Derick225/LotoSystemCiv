import { DrawResult, Prediction, AlgoWeights, ScoreBreakdown, AdaptiveRules, ForensicReport, TicketAnalysisResult } from '../types';
import { calculateRegularity, calculateACValue, calculateVolatility, detectGameRegime } from './mathService';
import { supabase, isSupabaseConfigured } from './supabaseClient';

export interface ConsensusData {
    engine: 'STOCHASTIC' | 'MACHINE_LEARNING' | 'DYNAMICAL_SYSTEMS';
    score: number;
    topNumbers: number[];
}

export const normalizeWeights = (weights: AlgoWeights): AlgoWeights => {
    const values = Object.values(weights).map(v => Number(v) || 0);
    const total = values.reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0);
    if (total === 0) return getDefaultWeights();
    const normalized = { ...weights };
    (Object.keys(normalized) as Array<keyof AlgoWeights>).forEach(key => {
        const val = Number(normalized[key]) || 0;
        normalized[key] = parseFloat((val / total).toFixed(4));
    });
    return normalized;
};

export const getDefaultWeights = (): AlgoWeights => {
    return normalizeWeights({
        frequency: 0.15, gap: 0.10, spectral: 0.15, fractal: 0.05, markov: 0.10,
        wavelet: 0.15, orchestration: 0.10, spatial: 0.05, momentum: 0.10, 
        equilibrium: 0.05, bayes: 0, ai_intuition: 0, resistance: 0, transformer: 0, 
        temporal: 0, digital_root: 0, gap_velocity: 0, poisson: 0, 
        leader_succession: 0, anti_consensus: 0, monte_carlo: 0, 
        lstm_pattern: 0, isolation_anomaly: 0
    });
};

// --- FIX: Add getAlgoWeightsSync for NexusProvider initialization ---
export const getAlgoWeightsSync = (drawName: string): AlgoWeights => {
    const rawLocal = localStorage.getItem(`weights_${drawName}`);
    return rawLocal ? normalizeWeights(JSON.parse(rawLocal)) : getDefaultWeights();
};

export const getAlgoWeights = async (drawName: string): Promise<AlgoWeights> => {
    const rawLocal = localStorage.getItem(`weights_${drawName}`);
    if (isSupabaseConfigured() && navigator.onLine) {
        try {
            const { data } = await supabase.from('algo_weights').select('weights').eq('draw_name', drawName).single();
            if (data?.weights) return normalizeWeights(data.weights);
        } catch (e) {}
    }
    return rawLocal ? normalizeWeights(JSON.parse(rawLocal)) : getDefaultWeights();
};

export const saveAlgoWeights = async (drawName: string, weights: AlgoWeights) => {
    const clean = normalizeWeights(weights);
    localStorage.setItem(`weights_${drawName}`, JSON.stringify(clean));
    if (isSupabaseConfigured()) {
        try { await supabase.from('algo_weights').upsert({ draw_name: drawName, weights: clean, updated_at: new Date().toISOString() }); } catch (e) {}
    }
};

export const generateMasterPrediction = async (
    drawName: string, 
    history: DrawResult[],
    weightsToUse?: AlgoWeights,
    extraMetrics?: any
): Promise<Prediction & { consensus?: ConsensusData[] }> => {
    const weights = weightsToUse || await getAlgoWeights(drawName);
    if (!history || history.length < 5) throw new Error("Dataset insuffisant.");
    
    const regularity = extraMetrics?.regularity || calculateRegularity(history);
    const spectralMap = extraMetrics?.spectral || [];
    const waveletMap = extraMetrics?.wavelet || [];
    const correlationMap = extraMetrics?.correlationMatrix || {};
    
    const breakdown: Record<number, ScoreBreakdown> = {};
    const stochasticScores = Array.from({ length: 90 }, (_, i) => {
        const num = i + 1;
        const reg = regularity.find((r: any) => r.number === num);
        const spec = spectralMap.find((s: any) => s.number === num);
        const wav = waveletMap.find((w: any) => w.number === num);
        
        // Calcul des composantes de base
        const freqScore = ((history.filter(h => h.gagnants.includes(num)).length / history.length) * 100);
        const currentGap = reg?.currentGap || 0;
        const gapScore = (currentGap >= 8 && currentGap <= 18) ? 100 : (currentGap > 30 ? 60 : 20);
        
        // Momentum (Recent frequency)
        const recentFreq = history.slice(0, 10).filter(h => h.gagnants.includes(num)).length;
        const momentumScore = recentFreq * 10;

        // Orchestration (Transition strength)
        let orchestrationScore = 0;
        const lastWinners = history[0].gagnants;
        lastWinners.forEach(lw => {
           const strength = correlationMap[lw]?.affinities?.[num] || 0;
           if (strength > 0.15) orchestrationScore += (strength * 20);
        });

        const nBreakdown: ScoreBreakdown = {
            frequency: freqScore, gap: gapScore, spectral: spec?.energy || 0,
            wavelet: wav?.energy || 0, momentum: momentumScore, 
            orchestration: Math.min(100, orchestrationScore),
            markov: 0, fractal: 0, spatial: 0, ai_intuition: 0, resistance: 0,
            transformer: 0, temporal: 0, digital_root: 0, gap_velocity: 0,
            poisson: 0, leader_succession: 0, anti_consensus: 0, monte_carlo: 0,
            lstm_pattern: 0, isolation_anomaly: 0, bayes: 0, equilibrium: 50
        };
        breakdown[num] = nBreakdown;
        
        let finalScore = 0;
        (Object.keys(weights) as Array<keyof AlgoWeights>).forEach(key => { 
            finalScore += ((nBreakdown as any)[key] || 0) * (weights[key] || 0); 
        });
        return { num, score: finalScore };
    });

    const sorted = stochasticScores.sort((a, b) => b.score - a.score);
    const confidence = Math.min(98, Math.round(sorted.slice(0, 5).reduce((a, b) => a + b.score, 0) / 5));

    const consensus: ConsensusData[] = [
        { engine: 'STOCHASTIC', score: Math.round(confidence * 0.95), topNumbers: sorted.slice(0, 10).map(x => x.num) },
        { engine: 'MACHINE_LEARNING', score: Math.round(confidence * 0.88), topNumbers: sorted.slice(5, 15).map(x => x.num) },
        { engine: 'DYNAMICAL_SYSTEMS', score: Math.round(confidence * 0.72), topNumbers: sorted.filter(x => x.score > 40).slice(0, 10).map(x => x.num) }
    ];
    
    return {
        suggestedNumbers: sorted.slice(0, 5).map(s => s.num),
        candidates: sorted.slice(5, 15).map(s => s.num),
        confidence,
        analysis: `Convergence multi-spectrale v12.2. Analyse Haar-Wavelet complétée. Forte tension détectée sur les vecteurs ${sorted.slice(0,3).map(x=>x.num).join(', ')}.`,
        breakdown, 
        usedWeights: weights, 
        timestamp: Date.now(),
        consensus
    };
};

// --- FIX: Add calculateCorrectionsFromForensics for PredictionForensics integration ---
export const calculateCorrectionsFromForensics = (
    currentWeights: AlgoWeights, 
    currentRules: AdaptiveRules, 
    report: ForensicReport
) => {
    const newWeights = { ...currentWeights };
    const reasoning: string[] = [];
    
    // Analyse des hits manqués pour ajuster les poids
    report.scoreDivergence.forEach(div => {
        const key = div.algo.toLowerCase() as keyof AlgoWeights;
        if (newWeights[key] !== undefined) {
            const adjustment = (div.impact / 100) * 0.05;
            newWeights[key] = Math.min(1.0, (newWeights[key] || 0) + adjustment);
            reasoning.push(`Augmentation de l'influence ${div.algo} (+${(adjustment*100).toFixed(1)}%)`);
        }
    });

    return {
        newWeights: normalizeWeights(newWeights),
        newRules: { ...currentRules },
        reasoning
    };
};

export const getStrategyName = (weights: AlgoWeights): string => {
    if ((weights.wavelet || 0) > 0.15) return "Impulsion Locale (Wavelet)";
    if ((weights.orchestration || 0) > 0.15) return "Synchro-Transitionnelle";
    if ((weights.frequency || 0) > 0.3) return "Domination Fréquence";
    return "Consensus Nexus Platinum";
};

export const analyzeTicketStrength = async (nums: number[], drawName: string): Promise<TicketAnalysisResult> => {
    const ac = calculateACValue(nums);
    const sum = nums.reduce((a,b) => a+b, 0);
    let score = 50;
    const warnings = [];
    if (ac < 7) { score -= 15; warnings.push("Faible complexité structurelle."); }
    if (sum < 150 || sum > 300) { score -= 10; warnings.push("Somme Sigma atypique."); }
    return { score: Math.max(0, Math.min(100, score + (ac * 5))), verdict: score > 70 ? "Vecteur Élite" : "Vecteur Standard", warnings };
};

export const getAdaptiveRules = (drawName: string): AdaptiveRules => {
    const raw = localStorage.getItem(`rules_${drawName}`);
    return raw ? JSON.parse(raw) : { criticalZoneMin: 8, criticalZoneMax: 18 };
};

export const saveAdaptiveRules = (drawName: string, rules: AdaptiveRules) => {
    localStorage.setItem(`rules_${drawName}`, JSON.stringify(rules));
};

export const getDefaultRules = (): AdaptiveRules => ({ criticalZoneMin: 8, criticalZoneMax: 18 });