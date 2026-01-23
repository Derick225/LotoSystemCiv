import { DrawResult, Prediction, AlgoWeights, ScoreBreakdown, AdaptiveRules, ForensicReport, TicketAnalysisResult } from '../types';
import { calculateRegularity, calculateACValue, calculateVolatility, calculateDigitalRoot, calculateShannonEntropy } from './mathService';
import { supabase, isSupabaseConfigured } from './supabaseClient';

/**
 * NEXUS PREDICTION ENGINE v15.1 - DIVERSIFIED APEX KERNEL
 */

const calculateVariance = (nums: number[]): number => {
    if (nums.length === 0) return 0;
    const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
    return nums.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / nums.length;
};

export const normalizeWeights = (weights: AlgoWeights, history?: DrawResult[]): AlgoWeights => {
    let normalized = { ...weights };
    
    if (history && history.length > 10) {
        const ent = calculateShannonEntropy(history.slice(0, 100));
        const vol = calculateVolatility(history);
        
        let overlaps = 0;
        let count = 0;
        for (let i = 0; i < Math.min(history.length - 1, 20); i++) {
            if (history[i+1].machine) {
                overlaps += history[i].gagnants.filter(n => history[i+1].machine?.includes(n)).length;
                count += 5;
            }
        }
        const overlapRate = count > 0 ? overlaps / count : 0;

        if (overlapRate < 0.05) {
            normalized.equilibrium = 0.03;
            normalized.spectral = (Number(normalized.spectral) || 0.1) * 1.5;
        }

        if (ent.normalized > 0.88 || vol.score > 65) {
            const boost = 0.05;
            normalized.markov = (Number(normalized.markov) || 0) + boost;
            
            if (ent.normalized > 0.92) {
                // Priorité Gap vs Freq si distribution skewed
                normalized.frequency = (Number(normalized.frequency) || 0.1) * 0.3; 
                normalized.gap = (Number(normalized.gap) || 0.1) * 1.8;
                normalized.orchestration = (Number(normalized.orchestration) || 0.1) * 1.4;
            }
        }
    }

    const total = Object.values(normalized).reduce((a, b) => a + (Number(b) || 0), 0);
    if (total === 0) return getDefaultWeights();
    
    (Object.keys(normalized) as Array<keyof AlgoWeights>).forEach(key => {
        normalized[key] = parseFloat(((Number(normalized[key]) || 0) / total).toFixed(4));
    });
    return normalized;
};

export const getDefaultWeights = (): AlgoWeights => ({
    frequency: 0.05,
    gap: 0.22,
    spectral: 0.22,
    fractal: 0.08, 
    markov: 0.18,
    wavelet: 0.10, 
    orchestration: 0.10, 
    momentum: 0.05, 
    equilibrium: 0.03,
    ai_intuition: 0.0, 
    digital_root: 0.0, 
    gap_velocity: 0.0, 
    isolation_anomaly: 0.0,
    resistance: 0.0,
    spatial: 0.0,
    bayes: 0.0,
    transformer: 0.0,
    temporal: 0.0,
    poisson: 0.0,
    leader_succession: 0.0,
    anti_consensus: 0.0,
    monte_carlo: 0.0,
    lstm_pattern: 0.0
} as any);

export const getDefaultRules = (): AdaptiveRules => ({
    criticalZoneMin: 12,
    criticalZoneMax: 18
});

export const runBacktestSimulation = async (
    drawName: string,
    history: DrawResult[],
    weights: AlgoWeights,
    currentRules: AdaptiveRules
): Promise<{ hitRate: number; newRules: AdaptiveRules; avgHits: number; log: string }> => {
    const testHistory = history.slice(0, 30);
    let totalHits = 0;
    let testsCount = 0;
    let overlaps = 0;

    for (let i = 0; i < Math.min(testHistory.length - 10, 15); i++) {
        const target = testHistory[i].gagnants;
        const context = testHistory.slice(i + 1);
        if (testHistory[i+1]?.machine) overlaps += target.filter(n => testHistory[i+1].machine?.includes(n)).length;

        const scores = Array.from({ length: 90 }, (_, k) => {
            const num = k + 1;
            const freq = context.filter(h => h.gagnants.includes(num)).length;
            const lastSeen = context.findIndex(h => h.gagnants.includes(num));
            const gap = lastSeen === -1 ? 50 : lastSeen;
            let s = Math.sqrt(freq) * (weights.frequency || 0.1) * 10;
            if (gap >= currentRules.criticalZoneMin && gap <= currentRules.criticalZoneMax) s += (weights.gap || 0.2) * 50;
            return { num, score: s };
        }).sort((a, b) => b.score - a.score);

        const selection = scores.slice(0, 5).map(s => s.num);
        totalHits += selection.filter(n => target.includes(n)).length;
        testsCount++;
    }

    const avgHits = testsCount > 0 ? totalHits / testsCount : 0;
    const hitRate = (avgHits / 5) * 100;
    let newRules = { ...currentRules };
    let log = `Backtest: ${avgHits.toFixed(2)}h/t. `;

    if (hitRate < 35) {
        newRules.criticalZoneMax = Math.min(45, newRules.criticalZoneMax + 2);
        log += "Expanding MaxZone. ";
    }
    if (overlaps === 0) {
        newRules.criticalZoneMin = Math.max(5, newRules.criticalZoneMin - 2);
        log += "Overlap 0: Gap Priority.";
    }

    return { hitRate, newRules, avgHits, log };
};

export const generateMasterPrediction = async (
    drawName: string, 
    history: DrawResult[],
    weightsToUse?: AlgoWeights,
    metrics?: any,
    options: { runBacktest?: boolean } = {}
): Promise<Prediction> => {
    // Filtrage Temporel : Ignorer les projections futures (ex: 2026)
    const validHistory = history.filter(d => {
        const dDate = d.date.includes('/') ? new Date(parseInt(d.date.split('/')[2]), parseInt(d.date.split('/')[1])-1, parseInt(d.date.split('/')[0])) : new Date(d.date);
        return dDate.getFullYear() <= new Date().getFullYear();
    });

    let weights = normalizeWeights(weightsToUse || getAlgoWeightsSync(drawName), validHistory);
    let rules = getAdaptiveRules(drawName);

    let backtestLog = "";
    if (options.runBacktest && validHistory.length > 25) {
        const bt = await runBacktestSimulation(drawName, validHistory, weights, rules);
        rules = bt.newRules;
        backtestLog = bt.log;
        await saveAdaptiveRules(drawName, rules);
    }

    const deepHistory = validHistory.slice(0, 120);
    const entropy = calculateShannonEntropy(deepHistory);
    const isSkewed = entropy.normalized > 0.92;
    
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
           if (strength > 0.2) markovScore += (strength * 100);
        });

        const nBreakdown: ScoreBreakdown = {
            frequency: (Math.sqrt(freq) / Math.sqrt(deepHistory.length)) * 100,
            gap: (reg?.currentGap || 50) >= rules.criticalZoneMin && (reg?.currentGap || 50) <= rules.criticalZoneMax ? 95 : 25,
            spectral: spec?.energy || 0,
            markov: Math.min(100, markovScore * 2.2),
            momentum: Math.sqrt(deepHistory.slice(0, 12).filter(h => h.gagnants.includes(num)).length) * 45,
            equilibrium: calculateDigitalRoot(num) * 5,
            wavelet: metrics?.wavelet?.find((w: any) => w.number === num)?.energy || 0,
            orchestration: 50, fractal: 50, spatial: 50, ai_intuition: 50, 
            resistance: 50, transformer: 0, temporal: 0, digital_root: 0,
            gap_velocity: 0, poisson: 0, leader_succession: 0, anti_consensus: 0,
            monte_carlo: 0, lstm_pattern: 0, isolation_anomaly: 0, bayes: 0
        };
        
        let finalScore = 0;
        (Object.keys(weights) as Array<keyof AlgoWeights>).forEach(k => {
            finalScore += (nBreakdown[k] || 0) * (Number(weights[k]) || 0);
        });

        if (isSkewed && freq < (deepHistory.length * 5 / 90)) finalScore += 20;

        return { num, score: finalScore, breakdown: nBreakdown };
    });

    const sorted = masterScores.sort((a, b) => b.score - a.score);
    
    // --- BOUCLE DE SÉLECTION DIVERSIFIÉE (VAR MIN 10) ---
    let selection: number[] = [];
    let idx = 0;
    const MIN_VARIANCE_TARGET = 10;
    
    while (selection.length < 5 && idx < sorted.length) {
        const candidate = sorted[idx];
        const testSelection = [...selection, candidate.num];
        
        if (testSelection.length > 1) {
            const currentVar = calculateVariance(testSelection);
            // Rejet si trop concentré et distribution skewed détectée
            if (isSkewed && currentVar < MIN_VARIANCE_TARGET && idx < 20) {
                idx++;
                continue;
            }
        }
        selection.push(candidate.num);
        idx++;
    }

    // Ré-échantillonnage si variance finale toujours trop basse en mode skewed
    if (isSkewed && calculateVariance(selection) < 8) {
        console.debug("[DNA] Resampling required: variance too low for skewed dist.");
        const adjustedWeights = { ...weights, gap: (weights.gap || 0.1) * 1.5, frequency: (weights.frequency || 0.1) * 0.5 };
        return generateMasterPrediction(drawName, validHistory, adjustedWeights, metrics, { runBacktest: false });
    }

    const acScore = calculateACValue(selection);
    const finalVariance = calculateVariance(selection);

    return {
        suggestedNumbers: selection.sort((a,b) => a - b),
        candidates: sorted.slice(5, 15).map(s => s.num),
        confidence: Math.min(99, Math.max(25, Math.round(sorted[0].score * (acScore / 8)))),
        analysis: `Apex v15.1 [${isSkewed ? 'SKEWED' : 'NOMINAL'}]. Variance: ${finalVariance.toFixed(1)}. ${backtestLog}`,
        breakdown: masterScores.reduce((acc, curr) => ({ ...acc, [curr.num]: curr.breakdown }), {}),
        usedWeights: weights,
        timestamp: Date.now()
    };
};

export const getAlgoWeightsSync = (drawName: string): AlgoWeights => {
    const raw = localStorage.getItem(`nexus_config_${drawName}`);
    if (raw) return JSON.parse(raw).weights || getDefaultWeights();
    return getDefaultWeights();
};

export const getAlgoWeights = async (drawName: string): Promise<AlgoWeights> => {
    if (isSupabaseConfigured() && navigator.onLine) {
        try {
            const { data } = await supabase.from('algo_weights').select('weights').eq('draw_name', drawName).single();
            if (data?.weights?.weights) return data.weights.weights;
        } catch (e) { }
    }
    return getAlgoWeightsSync(drawName);
};

export const saveAlgoWeights = async (drawName: string, weights: AlgoWeights, rules?: AdaptiveRules) => {
    const dataToSave = { weights, rules: rules || getAdaptiveRules(drawName), updatedAt: new Date().toISOString() };
    localStorage.setItem(`nexus_config_${drawName}`, JSON.stringify(dataToSave));
    if (isSupabaseConfigured()) {
        try {
            await supabase.from('algo_weights').upsert({ draw_name: drawName, weights: dataToSave, updated_at: new Date().toISOString() });
        } catch (e) { }
    }
};

export const getAdaptiveRules = (drawName: string): AdaptiveRules => {
    const raw = localStorage.getItem(`nexus_config_${drawName}`);
    if (raw) return JSON.parse(raw).rules || getDefaultRules();
    return getDefaultRules();
};

export const saveAdaptiveRules = async (drawName: string, rules: AdaptiveRules) => {
    const weights = await getAlgoWeights(drawName);
    await saveAlgoWeights(drawName, weights, rules);
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
    if (report.scoreDivergence) {
        report.scoreDivergence.forEach(div => {
            const key = div.algo as keyof AlgoWeights;
            if (newWeights[key] !== undefined) {
                const adjustment = (div.impact / 100) * 0.05;
                newWeights[key] = (Number(newWeights[key]) || 0) + adjustment;
                reasoning.push(`Mutation ADN : Ajustement ${div.algo} (+${(adjustment * 100).toFixed(1)}%).`);
            }
        });
    }
    return { newWeights: normalizeWeights(newWeights), newRules: { ...currentRules }, reasoning };
};

export const analyzeTicketStrength = async (numbers: number[], drawName: string): Promise<TicketAnalysisResult> => {
    const ac = calculateACValue(numbers);
    const varN = calculateVariance(numbers);
    const score = Math.min(100, (ac / 8) * 50 + (varN > 200 ? 50 : 25));
    return {
        score,
        verdict: score > 75 ? "Excellent" : "Moyen",
        warnings: varN < 50 ? ["Numéros trop proches"] : []
    };
};