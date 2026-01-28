import { DrawResult, Prediction, AlgoWeights, ScoreBreakdown, AdaptiveRules, ForensicReport, TicketAnalysisResult } from '../types';
import { calculateRegularity, calculateACValue, calculateVolatility, calculateDigitalRoot, calculateShannonEntropy } from './mathService';
import { supabase, isSupabaseConfigured } from './supabaseClient';

/**
 * NEXUS PREDICTION ENGINE v15.5 - SYNCHRONIZED RECURSIVE KERNEL
 */

export const normalizeWeights = (weights: AlgoWeights, history?: DrawResult[]): AlgoWeights => {
    let normalized = { ...weights };
    
    // Auto-ajustement basé sur l'entropie si l'historique est fourni
    if (history && history.length > 20) {
        const ent = calculateShannonEntropy(history.slice(0, 100));
        if (ent.normalized > 0.94) {
            // En cas de chaos total, on booste l'analyse spectrale et markov
            normalized.spectral = (Number(normalized.spectral) || 0.1) * 1.5;
            normalized.markov = (Number(normalized.markov) || 0.1) * 1.3;
        }
    }

    const total = Object.values(normalized).reduce((a, b) => a + (Number(b) || 0), 0);
    if (total <= 0) return getDefaultWeights();
    
    (Object.keys(normalized) as Array<keyof AlgoWeights>).forEach(key => {
        normalized[key] = parseFloat(((Number(normalized[key]) || 0) / total).toFixed(4));
    });
    return normalized;
};

export const getDefaultWeights = (): AlgoWeights => ({
    frequency: 0.08, gap: 0.25, spectral: 0.20, fractal: 0.08, 
    markov: 0.15, wavelet: 0.08, orchestration: 0.08, momentum: 0.05, 
    equilibrium: 0.03, ai_intuition: 0.0, digital_root: 0.0, gap_velocity: 0.0, 
    isolation_anomaly: 0.0, resistance: 0.0, spatial: 0.0, bayes: 0.0,
    transformer: 0.0, temporal: 0.0, poisson: 0.0, leader_succession: 0.0,
    anti_consensus: 0.0, monte_carlo: 0.0, lstm_pattern: 0.0
} as any);

export const getDefaultRules = (): AdaptiveRules => ({
    criticalZoneMin: 12,
    criticalZoneMax: 18
});

export const generateMasterPrediction = async (
    drawName: string, 
    history: DrawResult[],
    weightsToUse?: AlgoWeights,
    metrics?: any
): Promise<Prediction> => {
    // Filtrage Temporel de sécurité
    const validHistory = history.filter(d => {
        const year = d.date.includes('/') ? parseInt(d.date.split('/')[2]) : new Date(d.date).getFullYear();
        return year <= new Date().getFullYear();
    });

    // SYNC LOGIC: Toujours chercher le génome entraîné en priorité
    let baseWeights = weightsToUse;
    if (!baseWeights) {
        baseWeights = await getAlgoWeights(drawName);
    }

    let weights = normalizeWeights(baseWeights, validHistory);
    let rules = getAdaptiveRules(drawName);

    const deepHistory = validHistory.slice(0, 120);
    const regularity = metrics?.regularity || calculateRegularity(deepHistory);
    const correlationMap = metrics?.correlationMatrix || {};
    const lastWinners = deepHistory[0]?.gagnants || [];
    
    const masterScores = Array.from({ length: 90 }, (_, i) => {
        const num = i + 1;
        const reg = regularity.find((r: any) => r.number === num);
        const spec = metrics?.spectral?.find((s: any) => s.number === num);
        const freq = deepHistory.filter(h => h.gagnants.includes(num)).length;
        
        let markovScore = 0;
        lastWinners.forEach(lw => {
           const strength = correlationMap[lw]?.affinities?.[num] || 0;
           if (strength > 0.15) markovScore += (strength * 100);
        });

        const nBreakdown: ScoreBreakdown = {
            frequency: (Math.sqrt(freq) / Math.sqrt(deepHistory.length)) * 100,
            gap: (reg?.currentGap || 50) >= rules.criticalZoneMin && (reg?.currentGap || 50) <= rules.criticalZoneMax ? 95 : 25,
            spectral: spec?.energy || 0,
            markov: Math.min(100, markovScore * 2.5),
            momentum: Math.sqrt(deepHistory.slice(0, 12).filter(h => h.gagnants.includes(num)).length) * 45,
            equilibrium: calculateDigitalRoot(num) * 5,
            wavelet: metrics?.wavelet?.find((w: any) => w.number === num)?.energy || 0,
            orchestration: 50, fractal: 50, spatial: 50, ai_intuition: 50, resistance: 50, transformer: 0, temporal: 0, digital_root: 0, gap_velocity: 0, poisson: 0, leader_succession: 0, anti_consensus: 0, monte_carlo: 0, lstm_pattern: 0, isolation_anomaly: 0, bayes: 0
        };
        
        let finalScore = 0;
        (Object.keys(weights) as Array<keyof AlgoWeights>).forEach(k => {
            finalScore += (nBreakdown[k] || 0) * (Number(weights[k]) || 0);
        });

        return { num, score: finalScore, breakdown: nBreakdown };
    });

    const sorted = masterScores.sort((a, b) => b.score - a.score);
    const selection = sorted.slice(0, 5).map(s => s.num).sort((a,b) => a-b);
    const acScore = calculateACValue(selection);

    return {
        suggestedNumbers: selection,
        candidates: sorted.slice(5, 15).map(s => s.num),
        confidence: Math.min(99, Math.round(sorted[0].score * (acScore / 8.5))),
        analysis: `Apex v15.5 (Genome Sync). Précision structurelle : ${acScore}/10.`,
        breakdown: masterScores.reduce((acc, curr) => ({ ...acc, [curr.num]: curr.breakdown }), {}),
        usedWeights: weights,
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
    const dataToSave = { weights, rules: getAdaptiveRules(drawName), updatedAt: new Date().toISOString() };
    localStorage.setItem(`nexus_config_${drawName}`, JSON.stringify(dataToSave));
    if (isSupabaseConfigured()) {
        try {
            await supabase.from('algo_weights').upsert({ draw_name: drawName, weights: weights, updated_at: new Date().toISOString() });
        } catch(e) {}
    }
};

export const getAdaptiveRules = (drawName: string): AdaptiveRules => {
    const raw = localStorage.getItem(`nexus_config_${drawName}`);
    return raw ? JSON.parse(raw).rules : getDefaultRules();
};

export const saveAdaptiveRules = async (drawName: string, rules: AdaptiveRules) => {
    const weights = await getAlgoWeights(drawName);
    const dataToSave = { weights, rules, updatedAt: new Date().toISOString() };
    localStorage.setItem(`nexus_config_${drawName}`, JSON.stringify(dataToSave));
};

export const getStrategyName = (weights: AlgoWeights): string => {
    const entries = Object.entries(weights) as [string, any][];
    const dominant = entries.reduce((a, b) => (Number(a[1]) || 0) > (Number(b[1]) || 0) ? a : b);
    const names: Record<string, string> = { frequency: 'Inertie', gap: 'Écart Récursif', spectral: 'Résonance FFT', markov: 'Lien Séquentiel', orchestration: 'Translocation' };
    return names[dominant[0]] || 'Nexus APEX';
};

export const analyzeTicketStrength = async (numbers: number[], _drawName: string): Promise<TicketAnalysisResult> => {
    const ac = calculateACValue(numbers);
    return {
        score: Math.min(100, Math.round((ac / 10) * 100)),
        verdict: ac >= 8 ? "Optimale" : "Équilibrée",
        warnings: ac < 7 ? ["Structure trop prévisible"] : []
    };
};

export const calculateCorrectionsFromForensics = (currentWeights: AlgoWeights, _rules: AdaptiveRules, report: ForensicReport) => {
    const newWeights = { ...currentWeights };
    if (report.scoreDivergence.length > 0) {
        const top = report.scoreDivergence[0];
        const key = top.algo as keyof AlgoWeights;
        if (newWeights[key] !== undefined) newWeights[key] = (Number(newWeights[key]) || 0) + 0.05;
    }
    return { newWeights: normalizeWeights(newWeights), newRules: _rules, reasoning: ["Optimisation par divergence stochastique"] };
};