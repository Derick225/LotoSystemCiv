
import { DrawResult, Prediction, AlgoWeights, ScoreBreakdown, SymbioticContext, AdaptiveRules, TicketAnalysisResult, ForensicReport, RiskProfile } from '../types';
import { calculateACValue, calculateRegularity } from './mathService';
import { supabase, isSupabaseConfigured } from './supabaseClient';

export const getDefaultWeights = (): AlgoWeights => ({
    frequency: 0.10,
    gap: 0.15,
    spectral: 0.10,
    fractal: 0.05,
    markov: 0.20,
    poisson: 0.20,
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
});

const sigmoid = (x: number, center: number = 50, steepness: number = 0.15): number => {
    return 100 / (1 + Math.exp(-steepness * (x - center)));
};

export const normalizeWeights = (weights: AlgoWeights): AlgoWeights => {
    const total = Object.values(weights).reduce<number>((a, b) => (a || 0) + (Number(b) || 0), 0);
    if (total <= 0) return getDefaultWeights();
    const normalized: AlgoWeights = { ...weights };
    (Object.keys(normalized) as Array<keyof AlgoWeights>).forEach(key => {
        const val = normalized[key];
        if (typeof val === 'number') {
            normalized[key] = parseFloat((val / total).toFixed(4));
        }
    });
    return normalized;
};

const applyRiskProfile = (weights: AlgoWeights, profile: RiskProfile): AlgoWeights => {
    const modified = { ...weights };
    
    if (profile === 'PRUDENT') {
        modified.frequency = (modified.frequency || 0.1) * 2.5;
        modified.markov = (modified.markov || 0.2) * 1.8;
        modified.momentum = (modified.momentum || 0.05) * 1.5;
        modified.gap = (modified.gap || 0.15) * 0.2; 
    } else if (profile === 'AUDACIOUS') {
        modified.gap = (modified.gap || 0.15) * 2.5;
        modified.poisson = (modified.poisson || 0.2) * 1.8;
        modified.equilibrium = (modified.equilibrium || 0.05) * 1.5;
        modified.frequency = (modified.frequency || 0.1) * 0.4;
    } else if (profile === 'CHAOS') {
        modified.anti_consensus = (modified.anti_consensus || 0.05) * 4.0;
        modified.isolation_anomaly = (modified.isolation_anomaly || 0.05) * 3.0;
        modified.frequency = 0.01;
    }
    
    return normalizeWeights(modified);
};

export const getDefaultRules = (): AdaptiveRules => ({
    criticalZoneMin: 8,
    criticalZoneMax: 22
});

export const getAdaptiveRules = (drawName: string): AdaptiveRules => {
    try {
        const raw = localStorage.getItem(`nexus_rules_${drawName}`);
        return raw ? JSON.parse(raw) : getDefaultRules();
    } catch { return getDefaultRules(); }
};

export const saveAdaptiveRules = (drawName: string, rules: AdaptiveRules) => {
    try { localStorage.setItem(`nexus_rules_${drawName}`, JSON.stringify(rules)); } catch {}
};

const adaptWeightsToRegime = (baseWeights: AlgoWeights, volatilityScore: number, hurstIndex: number): AlgoWeights => {
    const adjusted = { ...baseWeights };
    const chaosFactor = Math.max(0, (volatilityScore - 50) / 50); 
    const orderFactor = Math.max(0, (50 - volatilityScore) / 50); 
    const isPersistent = hurstIndex > 0.6;
    const isMeanReverting = hurstIndex < 0.4;

    if (volatilityScore > 60 || isMeanReverting) {
        if (adjusted.gap) adjusted.gap *= (1 + chaosFactor);
        if (adjusted.poisson) adjusted.poisson *= (1 + chaosFactor);
        if (adjusted.equilibrium) adjusted.equilibrium *= (1 + chaosFactor);
        if (adjusted.anti_consensus) adjusted.anti_consensus = (adjusted.anti_consensus || 0.05) * 2;
        if (adjusted.markov) adjusted.markov *= 0.6;
        if (adjusted.momentum) adjusted.momentum *= 0.5;
    } else {
        if (adjusted.frequency) adjusted.frequency *= (1 + orderFactor);
        if (adjusted.markov) adjusted.markov *= (1 + orderFactor);
        if (adjusted.orchestration) adjusted.orchestration = (adjusted.orchestration || 0.05) * 1.5;
        if (adjusted.spectral) adjusted.spectral *= 1.2;
        if (adjusted.gap) adjusted.gap *= 0.7;
    }

    return normalizeWeights(adjusted);
};

export const generateMasterPrediction = async (
    drawName: string, 
    history: DrawResult[],
    weightsToUse?: AlgoWeights,
    metrics?: any,
    symbioticContext?: SymbioticContext,
    riskProfile: RiskProfile = 'BALANCED'
): Promise<Prediction> => {
    if (history.length < 10) throw new Error("Dataset insuffisant.");

    let weights = normalizeWeights(weightsToUse || await getAlgoWeights(drawName));
    weights = applyRiskProfile(weights, riskProfile);

    const volScore = metrics?.volatility?.score || 50;
    const avgHurst = metrics?.fractal ? 
        metrics.fractal.slice(0, 5).reduce((acc: number, f: any) => acc + f.hurst, 0) / 5 : 0.5;
    
    weights = adaptWeightsToRegime(weights, volScore, avgHurst);

    const lastWinners = history[0].gagnants;
    const correlationMap = metrics?.correlationMatrix || {};

    const calculateScores = (hist: DrawResult[]) => {
        const localRegularity = calculateRegularity(hist.slice(0, 100));
        const localLastWinners = hist[0].gagnants;
        
        return Array.from({ length: 90 }, (_, i) => {
            const num = i + 1;
            const reg = localRegularity.find((r: any) => r.number === num);
            const freq = hist.filter(h => h.gagnants.includes(num)).length;
            
            const lambda = (freq / hist.length) * (90/5);
            const poissonScore = (1 - Math.exp(-lambda)) * 100;

            let markovScore = 0;
            localLastWinners.forEach((lw: number) => {
                const strength = correlationMap[lw]?.affinities?.[num] || 0;
                markovScore += (strength * 100);
            });

            let orchestrationBonus = 0;
            if (symbioticContext?.orchestrationBoosts && symbioticContext.orchestrationBoosts[num]) {
                orchestrationBonus = symbioticContext.orchestrationBoosts[num] * 10;
            }
            
            let spatialBonus = 0;
            if (symbioticContext?.spatialHotZones?.includes(num)) {
                spatialBonus = 15;
            }

            const nBreakdown: ScoreBreakdown = {
                frequency: (freq / hist.length) * 500,
                gap: reg ? (reg.currentGap / (reg.avgGap || 18)) * 50 : 0,
                poisson: poissonScore,
                markov: Math.min(100, markovScore * 2),
                spectral: metrics?.spectral?.find((s:any) => s.number === num)?.energy || 0,
                decision_forest: symbioticContext?.forestVotes?.[num] || 0,
                momentum: 50,
                equilibrium: 50,
                ai_intuition: 50,
                fractal: (metrics?.fractal?.find((f:any) => f.number === num)?.hurst || 0.5) * 100,
                orchestration: orchestrationBonus, 
                spatial: spatialBonus
            };

            let weightedSum = 0;
            (Object.keys(weights) as Array<keyof AlgoWeights>).forEach(k => {
                const weightVal = Number(weights[k]) || 0;
                const scoreVal = Number(nBreakdown[k]) || 0;
                const activatedScore = scoreVal > 25 ? sigmoid(scoreVal, 50, 0.12) : scoreVal * 0.5;
                weightedSum += activatedScore * weightVal;
            });

            const finalScore = weightedSum + orchestrationBonus + spatialBonus;
            return { num, score: finalScore, breakdown: nBreakdown };
        });
    };

    const masterScores = calculateScores(history);
    const sorted = masterScores.sort((a, b) => b.score - a.score);
    const selection = sorted.slice(0, 5).map(s => s.num).sort((a,b) => a-b);

    let realityAlignment = 0;
    if (history.length > 1) {
        const historyTMinus1 = history.slice(1);
        const actualT0 = history[0].gagnants;
        const scoresTMinus1 = calculateScores(historyTMinus1);
        const predictedT0 = scoresTMinus1.sort((a,b) => b.score - a.score).slice(0, 5).map(s => s.num);
        const hits = predictedT0.filter(n => actualT0.includes(n)).length;
        realityAlignment = hits * 20; 
        const neighbors = predictedT0.filter(n => actualT0.includes(n-1) || actualT0.includes(n+1)).length;
        realityAlignment += neighbors * 5;
    }

    let analysisText = `Stratégie ${riskProfile} active. `;
    if (volScore > 60) analysisText += `Mode Chaos détecté. `;
    else if (avgHurst > 0.6) analysisText += `Mode Tendance. `;
    
    return {
        suggestedNumbers: selection,
        candidates: sorted.slice(5, 15).map(s => s.num),
        confidence: Math.min(99, Math.round(sorted.slice(0, 5).reduce((a,b) => a + b.score, 0) / 5)),
        analysis: analysisText,
        breakdown: masterScores.reduce((acc, curr) => ({ ...acc, [curr.num]: curr.breakdown }), {}),
        timestamp: Date.now(),
        symbiosisFactor: symbioticContext ? 1.5 : 1.0,
        riskProfile,
        realityAlignment
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
    try {
        localStorage.setItem(`nexus_config_${drawName}`, JSON.stringify({ weights, updatedAt: new Date().toISOString() }));
        if (isSupabaseConfigured()) {
            await supabase.from('algo_weights').upsert({ draw_name: drawName, weights }); 
        }
    } catch (e) {}
};

export const getStrategyName = (weights: AlgoWeights): string => {
    const dominant = Object.entries(weights).sort((a,b) => (Number(b[1]) || 0) - (Number(a[1]) || 0))[0];
    return `Mode ${dominant?.[0]?.toUpperCase() || 'Standard'}`;
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
