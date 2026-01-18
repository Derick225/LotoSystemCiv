
import { DrawResult, Prediction, AlgoWeights, ScoreBreakdown, AdaptiveRules, ForensicReport, TicketAnalysisResult, PositionalRegime } from '../types';
import { 
    calculateRegularity, calculateACValue, calculateGravityField, validateDataIntegrity, 
    calculateWaveletEnergy, calculateTechnicalResistance, calculatePoissonProbability, 
    calculateVolatility, calculateGapTrend, mathService, calculateShannonEntropy,
    runMonteCarloSimulationAsync, runLSTMPatternHeuristic, detectAnomalies
} from './mathService';
import { supabase, isSupabaseConfigured } from './supabaseClient';

/**
 * Normalise un objet AlgoWeights pour que la somme soit exactement 1.0
 */
export const normalizeWeights = (weights: AlgoWeights): AlgoWeights => {
    const values = Object.values(weights).map(v => Number(v) || 0);
    const total = values.reduce((a, b) => a + b, 0);
    if (total === 0) return getDefaultWeights();
    
    const normalized = { ...weights };
    (Object.keys(normalized) as Array<keyof AlgoWeights>).forEach(key => {
        const val = Number(normalized[key]) || 0;
        // Plafond de sécurité à 0.5 par algo pour éviter l'overfitting (Standard Industriel)
        const capped = Math.min(val, total * 0.5);
        normalized[key] = parseFloat((capped / total).toFixed(4));
    });
    return normalized;
};

export const getDefaultWeights = (): AlgoWeights => {
    const weights: AlgoWeights = {
        frequency: 0.12, gap: 0.12, spectral: 0.12, fractal: 0.08, wavelet: 0.08, 
        resistance: 0.04, markov: 0.12, spatial: 0.04, momentum: 0.04, equilibrium: 0.04,
        bayes: 0.02, orchestration: 0.02, transformer: 0.02, temporal: 0.03, ai_intuition: 0.01,
        digital_root: 0.01, gap_velocity: 0.04, poisson: 0.04, leader_succession: 0.01,
        anti_consensus: 0.04, monte_carlo: 0.05, lstm_pattern: 0.05, isolation_anomaly: 0.03
    };
    return normalizeWeights(weights);
};

export const getDefaultRules = (): AdaptiveRules => ({
    criticalZoneMin: 8,
    criticalZoneMax: 18
});

// --- STORAGE UTILS ---
export const saveAlgoWeights = async (drawName: string, weights: AlgoWeights) => {
    const clean = normalizeWeights(weights);
    localStorage.setItem(`weights_${drawName}`, JSON.stringify(clean));
    if (isSupabaseConfigured()) {
        try {
            await supabase.from('algo_weights').upsert({
                draw_name: drawName,
                weights: clean,
                updated_at: new Date().toISOString()
            });
        } catch (e) { console.warn("Cloud weights sync error", e); }
    }
};

export const getAlgoWeights = async (drawName: string): Promise<AlgoWeights> => {
    const rawLocal = localStorage.getItem(`weights_${drawName}`);
    let currentWeights = rawLocal ? JSON.parse(rawLocal) : getDefaultWeights();

    if (isSupabaseConfigured() && navigator.onLine) {
        try {
            const { data } = await supabase.from('algo_weights').select('weights').eq('draw_name', drawName).single();
            if (data && data.weights) {
                const normalized = normalizeWeights(data.weights);
                localStorage.setItem(`weights_${drawName}`, JSON.stringify(normalized));
                return normalized;
            }
        } catch (e) { /* Ignore */ }
    }
    return normalizeWeights(currentWeights);
};

export const getAlgoWeightsSync = (drawName: string): AlgoWeights => {
    const raw = localStorage.getItem(`weights_${drawName}`);
    return raw ? normalizeWeights(JSON.parse(raw)) : getDefaultWeights();
};

export const getAdaptiveRules = (drawName: string): AdaptiveRules => {
    const raw = localStorage.getItem(`rules_${drawName}`);
    return raw ? JSON.parse(raw) : getDefaultRules();
};

export const saveAdaptiveRules = (drawName: string, rules: AdaptiveRules) => {
    localStorage.setItem(`rules_${drawName}`, JSON.stringify(rules));
};

/**
 * Calcule les facteurs d'ajustement basés sur les régimes positionnels
 */
const calculateRegimeAdjustment = (regimes: PositionalRegime[], baseWeights: AlgoWeights): AlgoWeights => {
    if (!regimes || regimes.length === 0) return baseWeights;

    const adjusted = { ...baseWeights };
    let chaoticCount = 0;
    let persistentCount = 0;
    let bimodalCount = 0;

    regimes.forEach(r => {
        if (r.regime === 'CHAOTIC') chaoticCount++;
        else if (r.regime === 'PERSISTENT') persistentCount++;
        else if (r.regime === 'BIMODAL') bimodalCount++;
    });

    if (chaoticCount >= 3) {
        adjusted.gap = (adjusted.gap || 0) * 1.3;
        adjusted.equilibrium = (adjusted.equilibrium || 0) * 1.2;
        adjusted.anti_consensus = (adjusted.anti_consensus || 0) * 1.5;
        adjusted.momentum = (adjusted.momentum || 0) * 0.7;
    } else if (persistentCount >= 3) {
        adjusted.momentum = (adjusted.momentum || 0) * 1.4;
        adjusted.markov = (adjusted.markov || 0) * 1.2;
        adjusted.frequency = (adjusted.frequency || 0) * 1.2;
        adjusted.lstm_pattern = (adjusted.lstm_pattern || 0) * 1.3;
    } else if (bimodalCount >= 2) {
        adjusted.spectral = (adjusted.spectral || 0) * 1.3;
        adjusted.fractal = (adjusted.fractal || 0) * 1.3;
        adjusted.wavelet = (adjusted.wavelet || 0) * 1.2;
    }

    return normalizeWeights(adjusted);
};

// --- CORE ENGINE LOGIC ---
const sigmoid = (t: number) => 1 / (1 + Math.exp(-0.1 * (t - 50)));

export const generateMasterPrediction = async (
    drawName: string, 
    history: DrawResult[],
    weightsToUse?: AlgoWeights,
    extraMetrics?: any
): Promise<Prediction> => {
    
    if (!history || history.length < 5) throw new Error("Historique vide ou insuffisant.");

    const integrity = validateDataIntegrity(history);
    let baseWeights = weightsToUse || await getAlgoWeights(drawName);
    
    // Ajustement dynamique des poids selon les régimes positionnels si disponibles
    const positionalRegimes = extraMetrics?.positionalRegimes || [];
    const optimizedWeights = calculateRegimeAdjustment(positionalRegimes, baseWeights);
    
    const volatility = calculateVolatility(history);
    const regularity = calculateRegularity(history);
    const spectralMap = extraMetrics?.spectral || mathService.calculateSpectral(history.slice(0, 100));
    const fractalMap = extraMetrics?.fractal || mathService.calculateFractal(history.slice(0, 100));
    const gravityField = calculateGravityField(history);
    const gapTrend = calculateGapTrend(history); 
    
    const monteCarloScores = await runMonteCarloSimulationAsync(history);
    const lstmScores = runLSTMPatternHeuristic(history);
    const anomalyScores = detectAnomalies(history);

    const breakdown: Record<number, ScoreBreakdown> = {};
    const transitions: Record<number, number> = {};
    
    const lastWinners = history[0].gagnants;
    for(let i=0; i < Math.min(history.length - 1, 100); i++) {
        if (history[i+1].gagnants.some(n => lastWinners.includes(n))) {
            history[i].gagnants.forEach(n => transitions[n] = (transitions[n] || 0) + 1);
        }
    }

    const scores = Array.from({ length: 90 }, (_, i) => {
        const num = i + 1;
        const reg = regularity.find(r => r.number === num);
        const spec = spectralMap.find((s: any) => s.number === num);
        const frac = fractalMap.find((f: any) => f.number === num);
        const gravity = gravityField[num] || 0;
        
        const signal = history.slice(0, 32).map(d => d.gagnants.includes(num) ? 1 : 0);
        const localFreqCount = history.slice(0, 50).filter(h => h.gagnants.includes(num)).length;
        const freqScore = (localFreqCount / 50) * 100; 

        const currentGap = reg?.currentGap || 0;
        let gapScore = (currentGap >= 8 && currentGap <= 18) ? 100 : (currentGap > 30 ? 60 : 20);

        const specScore = spec?.energy || 0;
        const markovScore = Math.min(100, (transitions[num] || 0) * 15);
        const spatialScore = Math.min(100, gravity * 50);
        const waveletScore = calculateWaveletEnergy(signal);
        const resistScore = calculateTechnicalResistance(num, history);
        
        const lambda = (localFreqCount / 50) * (90/5); 
        const poissonVal = calculatePoissonProbability(lambda, currentGap);

        let antiConsensusScore = 0;
        const veryRecentFreq = history.slice(0, 10).filter(h => h.gagnants.includes(num)).length;
        if (veryRecentFreq === 0) antiConsensusScore = 100;
        else if (veryRecentFreq >= 2) antiConsensusScore = 0;

        const nBreakdown: ScoreBreakdown = {
            frequency: Math.min(100, freqScore),
            gap: gapScore,
            spectral: specScore,
            markov: markovScore,
            spatial: spatialScore,
            temporal: reg && Math.abs(reg.avgGap - reg.currentGap) < 2 ? 100 : 30,
            fractal: frac?.hurst ? frac.hurst * 100 : 50,
            wavelet: waveletScore,
            resistance: resistScore,
            poisson: poissonVal,
            gap_velocity: gapTrend.trend !== 'STABLE' ? 80 : 40,
            anti_consensus: antiConsensusScore,
            monte_carlo: monteCarloScores[num] || 0,
            lstm_pattern: lstmScores[num] || 0,
            isolation_anomaly: anomalyScores[num] || 0,
            momentum: 50,
            equilibrium: 50,
            bayes: 50,
            orchestration: 0,
            transformer: 0,
            ai_intuition: 0,
            digital_root: 0,
            leader_succession: 0
        };

        breakdown[num] = nBreakdown;

        let rawScore = 0;
        Object.entries(optimizedWeights).forEach(([key, weight]) => {
            const val = (nBreakdown as any)[key] || 0;
            rawScore += val * (weight as number);
        });

        // Boosts synergiques non-linéaires (Oracle Kernel)
        if (specScore > 80 && currentGap > 10 && currentGap < 20) rawScore += 15; 
        if (frac?.regime === 'PERSISTANT' && localFreqCount > 5) rawScore += 10;
        if (frac?.regime === 'ANTI-PERSISTANT' && currentGap > 25) rawScore += 20;

        return { num, score: sigmoid(rawScore) * 100 };
    });

    const sorted = scores.sort((a, b) => b.score - a.score);
    const suggested = sorted.slice(0, 5).map(s => s.num);
    const signalClarity = sorted[0].score - sorted[10].score;
    let baseConfidence = Math.min(99, Math.round(70 + signalClarity));
    if (integrity.score < 80) baseConfidence *= 0.8;

    return {
        suggestedNumbers: suggested,
        candidates: sorted.slice(5, 15).map(s => s.num),
        confidence: baseConfidence,
        analysis: `Inférence complétée. Calibration ${volatility.status} active.`,
        breakdown,
        usedWeights: optimizedWeights,
        timestamp: Date.now()
    };
};

export const calculateCorrectionsFromForensics = (
    currentWeights: AlgoWeights,
    currentRules: AdaptiveRules,
    report: ForensicReport
): { newWeights: AlgoWeights, newRules: AdaptiveRules, reasoning: string[] } => {
    let newWeights = { ...currentWeights };
    const reasoning: string[] = ["Adaptation balistique post-tirage."];

    report.scoreDivergence.forEach(div => {
        const key = div.algo.toLowerCase() as keyof AlgoWeights;
        if (div.impact > 70 && newWeights[key] !== undefined) {
            // Incrément prudent (+2%) avant renormalisation
            newWeights[key] = (Number(newWeights[key]) || 0) + 0.02;
            reasoning.push(`Renforcement de ${div.algo} (+2%).`);
        }
    });

    return { 
        newWeights: normalizeWeights(newWeights), 
        newRules: currentRules, 
        reasoning 
    };
};

export const analyzeTicketStrength = async (nums: number[], _drawName: string): Promise<TicketAnalysisResult> => {
    const ac = calculateACValue(nums);
    const sum = nums.reduce((a,b) => a+b, 0);
    let score = 50;
    const warnings = [];
    if (ac < 7) { score -= 15; warnings.push("Faible complexité structurelle."); }
    if (sum < 150 || sum > 300) { score -= 10; warnings.push("Somme Sigma atypique."); }
    const odd = nums.filter(n => n % 2 !== 0).length;
    if (odd < 2 || odd > 3) { score -= 5; warnings.push("Déséquilibre Pair/Impair."); }
    return {
        score: Math.max(0, Math.min(100, score + (ac * 5))),
        verdict: score > 70 ? "Vecteur Élite" : score > 50 ? "Vecteur Standard" : "Fragile",
        warnings
    };
};

export const getStrategyName = (weights: AlgoWeights): string => {
    if (!weights) return "Consensus Nexus";
    const w = weights;
    if ((w.frequency || 0) > 0.3) return "Domination Fréquence";
    if ((w.spectral || 0) > 0.3) return "Résonance Harmonique";
    if ((w.markov || 0) > 0.3) return "Transition de Phase";
    if ((w.gap || 0) > 0.3) return "Sniper d'Écarts";
    return "Hybride Équilibré";
};
