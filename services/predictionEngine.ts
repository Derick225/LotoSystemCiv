
import { DrawResult, Prediction, AlgoWeights, ScoreBreakdown, AdaptiveRules, ForensicReport, TicketAnalysisResult } from '../types';
import { 
    calculateRegularity, calculateACValue, calculateGravityField, validateDataIntegrity, 
    calculateWaveletEnergy, calculateTechnicalResistance, calculatePoissonProbability, 
    calculateVolatility, calculateGapTrend, mathService, calculateShannonEntropy,
    runMonteCarloSimulation, runLSTMPatternHeuristic, detectAnomalies
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
        const capped = Math.min(val, total * 0.6); // Sécurité anti-overfitting
        normalized[key] = parseFloat((capped / total).toFixed(4));
    });
    return normalized;
};

export const getDefaultWeights = (): AlgoWeights => normalizeWeights({
    frequency: 0.12,
    gap: 0.08,
    spectral: 0.08,
    fractal: 0.04,
    wavelet: 0.08, 
    resistance: 0.04, 
    markov: 0.12,
    spatial: 0.04,
    momentum: 0.04,
    equilibrium: 0.04,
    bayes: 0.02,
    orchestration: 0.02,
    transformer: 0.02,
    temporal: 0.03,
    ai_intuition: 0.01,
    digital_root: 0.01,
    gap_velocity: 0.04,
    poisson: 0.04, 
    leader_succession: 0.01,
    anti_consensus: 0.04,
    monte_carlo: 0.05, // Nouveau
    lstm_pattern: 0.05, // Nouveau
    isolation_anomaly: 0.03 // Nouveau
});

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
        } catch (e) {
            console.warn("Cloud weights sync error", e);
        }
    }
};

export const getAlgoWeights = async (drawName: string): Promise<AlgoWeights> => {
    const rawLocal = localStorage.getItem(`weights_${drawName}`);
    let currentWeights = rawLocal ? JSON.parse(rawLocal) : getDefaultWeights();

    if (isSupabaseConfigured() && navigator.onLine) {
        try {
            const { data } = await supabase
                .from('algo_weights')
                .select('weights')
                .eq('draw_name', drawName)
                .single();

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

// --- CORE ENGINE LOGIC ---

const sigmoid = (t: number) => 1 / (1 + Math.exp(-0.1 * (t - 50)));

/**
 * AUTO-CALIBRATION: Analyse la "personnalité" mathématique du tirage
 */
const autoCalibrateWeights = (drawName: string, baseWeights: AlgoWeights, history: DrawResult[]): { weights: AlgoWeights, analysis: string } => {
    if (history.length < 20) return { weights: normalizeWeights(baseWeights), analysis: "Données insuffisantes pour calibration." };

    const tuned = { ...baseWeights };
    const reportParts: string[] = [];

    const sums = history.slice(0, 30).map(d => d.gagnants.reduce((a, b) => a + b, 0));
    const meanSum = sums.reduce((a, b) => a + b, 0) / sums.length;
    const variance = sums.reduce((a, b) => a + Math.pow(b - meanSum, 2), 0) / sums.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev > 50) {
        tuned.anti_consensus = (tuned.anti_consensus || 0.05) * 2.0;
        tuned.isolation_anomaly = (tuned.isolation_anomaly || 0.03) * 1.8; // Boost Anomaly en chaos
        tuned.resistance = (tuned.resistance || 0.05) * 1.5;
        tuned.frequency = (tuned.frequency || 0.15) * 0.6;
        reportParts.push("Volatilité Haute -> Mode Chaos & Anomalie");
    } else {
        tuned.frequency = (tuned.frequency || 0.15) * 1.4;
        tuned.lstm_pattern = (tuned.lstm_pattern || 0.05) * 1.5; // Boost LSTM en stable
        tuned.equilibrium = (tuned.equilibrium || 0.05) * 1.5;
        reportParts.push("Jeu Stable -> Suivi de tendance LSTM");
    }

    let repetitionCount = 0;
    for(let i=0; i < 20; i++) {
        const current = history[i].gagnants;
        const prev = history[i+1].gagnants;
        if (current.some(n => prev.includes(n))) repetitionCount++;
    }
    const inertiaRate = repetitionCount / 20;

    if (inertiaRate > 0.4) {
        tuned.leader_succession = (tuned.leader_succession || 0.01) * 2.5;
        tuned.momentum = (tuned.momentum || 0.05) * 1.5;
        reportParts.push("Forte Inertie -> Boost Succession");
    }

    const spectralMap = mathService.calculateSpectral(history.slice(0, 50));
    const avgEnergy = spectralMap.reduce((acc, s) => acc + s.energy, 0) / (spectralMap.length || 1);
    
    if (avgEnergy > 45) {
        tuned.spectral = (tuned.spectral || 0.10) * 1.6;
        tuned.wavelet = (tuned.wavelet || 0.10) * 1.4;
        reportParts.push("Résonance Harmonique -> Boost Spectral");
    }

    // Boost Monte Carlo si l'échantillon est large
    if (history.length > 200) {
        tuned.monte_carlo = (tuned.monte_carlo || 0.05) * 1.5;
        reportParts.push("Historique Riche -> Boost Monte Carlo");
    }
    
    return { 
        weights: normalizeWeights(tuned), 
        analysis: reportParts.join(' | ') 
    };
};

export const calculateOptimalWeights = (history: DrawResult[]): AlgoWeights => {
    const base = getDefaultWeights();
    if (!history || history.length < 20) return base;
    const { weights } = autoCalibrateWeights("OPTIMIZER", base, history);
    return weights;
};

/**
 * MOTEUR D'INFÉRENCE PLATINUM (ISOLÉ)
 */
export const generateMasterPrediction = async (
    drawName: string, 
    history: DrawResult[],
    weightsToUse?: AlgoWeights,
    extraMetrics?: any
): Promise<Prediction> => {
    
    if (!history || history.length < 5) throw new Error("Historique vide ou insuffisant pour ce tirage.");

    const integrity = validateDataIntegrity(history);
    
    let baseWeights = weightsToUse || await getAlgoWeights(drawName);
    
    const { weights: optimizedWeights, analysis: tuningAnalysis } = weightsToUse 
        ? { weights: normalizeWeights(weightsToUse), analysis: "Mode Manuel" }
        : autoCalibrateWeights(drawName, baseWeights, history);
    
    const volatility = calculateVolatility(history);
    const regularity = calculateRegularity(history);
    const spectralMap = extraMetrics?.spectral || mathService.calculateSpectral(history.slice(0, 100));
    const fractalMap = extraMetrics?.fractal || mathService.calculateFractal(history.slice(0, 100));
    const gravityField = calculateGravityField(history);
    const gapTrend = calculateGapTrend(history); 
    
    // NOUVEAUX CALCULS
    const monteCarloScores = runMonteCarloSimulation(history);
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

    // Scoring Vectoriel 1-90
    const scores = Array.from({ length: 90 }, (_, i) => {
        const num = i + 1;
        const reg = regularity.find(r => r.number === num);
        const spec = spectralMap.find((s: any) => s.number === num);
        const frac = fractalMap.find((f: any) => f.number === num);
        const gravity = gravityField[num] || 0;
        
        const signal = history.slice(0, 32).map(d => d.gagnants.includes(num) ? 1 : 0);
        const localFreqCount = history.slice(0, 50).filter(h => h.gagnants.includes(num)).length;
        const freqScore = (localFreqCount / 50) * 500; 

        const currentGap = reg?.currentGap || 0;
        let gapScore = (currentGap >= 8 && currentGap <= 18) ? 100 : (currentGap > 30 ? 60 : 20);
        if (gapTrend.trend === 'ACCELERATING' && currentGap < 10) gapScore += 40;
        if (gapTrend.trend === 'DECELERATING' && currentGap > 20) gapScore += 40;

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
            ...getDefaultWeights(),
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
            // Nouveaux scores
            monte_carlo: monteCarloScores[num] || 0,
            lstm_pattern: lstmScores[num] || 0,
            isolation_anomaly: anomalyScores[num] || 0,
            
            momentum: 50,
            orchestration: 0,
            equilibrium: 0,
            bayes: 0,
            ai_intuition: 0,
            digital_root: 0,
            leader_succession: 0,
            transformer: 0
        };

        breakdown[num] = nBreakdown;

        let rawScore = 0;
        Object.entries(optimizedWeights).forEach(([key, weight]) => {
            const val = (nBreakdown as any)[key] || 0;
            rawScore += val * (weight as number);
        });

        // Boost final pour les anomalies critiques si le poids Isolation est actif
        if ((optimizedWeights.isolation_anomaly || 0) > 0.05 && anomalyScores[num] > 80) {
            rawScore *= 1.2;
        }

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
        analysis: `Analyse ${drawName}: ${tuningAnalysis}. Volatilité: ${volatility.score}%.`,
        breakdown,
        usedWeights: optimizedWeights
    };
};

export const calculateCorrectionsFromForensics = (
    currentWeights: AlgoWeights,
    currentRules: AdaptiveRules,
    report: ForensicReport
): { newWeights: AlgoWeights, newRules: AdaptiveRules, reasoning: string[] } => {
    let newWeights = { ...currentWeights };
    const reasoning: string[] = [];
    const LEARNING_RATE = 0.05;

    if (report.scoreDivergence.length > 0) {
        report.scoreDivergence.forEach(div => {
            const key = div.algo.toLowerCase() as keyof AlgoWeights;
            const boost = (div.impact / 100) * LEARNING_RATE;
            
            if (newWeights[key] !== undefined) {
                newWeights[key] = (Number(newWeights[key]) || 0) + boost;
                if (boost > 0.01) {
                    reasoning.push(`Boost ${div.algo} (+${(boost*100).toFixed(1)}%) car il avait détecté des gagnants manqués.`);
                }
            }
        });
    }

    const hits = report.matches.filter(m => m.errorType === 'Hit').length;
    if (hits === 0) {
        const chaosBoost = LEARNING_RATE * 1.5;
        newWeights.anti_consensus = (newWeights.anti_consensus || 0) + chaosBoost;
        newWeights.isolation_anomaly = (newWeights.isolation_anomaly || 0) + chaosBoost; // Tenter les anomalies
        
        Object.keys(newWeights).forEach(k => {
            const key = k as keyof AlgoWeights;
            if ((newWeights[key] || 0) > 0.15) {
                newWeights[key] = (newWeights[key] || 0) * 0.95;
            }
        });
        
        reasoning.push("Échec critique détecté : Activation des protocoles de Chaos et Anomalie.");
    } else if (hits >= 3) {
        reasoning.push("Performance Élite : Stabilisation des poids actuels.");
    }

    const newRules = { ...currentRules };
    
    return { 
        newWeights: normalizeWeights(newWeights), 
        newRules, 
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
    const w = weights;
    if ((w.frequency || 0) > 0.25) return "Domination Fréquence";
    if ((w.spectral || 0) > 0.25) return "Résonance Harmonique";
    if ((w.monte_carlo || 0) > 0.15) return "Simulation Stochastique";
    if ((w.lstm_pattern || 0) > 0.15) return "Séquenceur Neural";
    if ((w.isolation_anomaly || 0) > 0.15) return "Détecteur Anomalie";
    if ((w.gap || 0) > 0.25) return "Sniper d'Écarts";
    
    return "Consensus Nexus";
};
