
import { DrawResult, Prediction, AlgoWeights, ScoreBreakdown, AdaptiveRules, ForensicReport, TicketAnalysisResult } from '../types';
import { calculateRegularity, calculateACValue, calculateVolatility, calculateDigitalRoot, calculateShannonEntropy } from './mathService';
import { supabase, isSupabaseConfigured } from './supabaseClient';

/**
 * NEXUS PREDICTION ENGINE v14.5 - DIVERSIFIED APEX KERNEL
 */

export const normalizeWeights = (weights: AlgoWeights, history?: DrawResult[]): AlgoWeights => {
    let normalized = { ...weights };
    
    // Règle de Translocation : Boost Orchestration si patterns machine-gagnants détectés
    if (history && history.length > 5) {
        const recent = history.slice(0, 5);
        let overlapFound = 0;
        recent.forEach(d => {
            if (d.machine) {
                overlapFound += d.gagnants.filter(n => d.machine?.includes(n)).length;
            }
        });
        
        if (overlapFound > 0) {
            console.debug(`[DNA] Overlap détecté (${overlapFound}). Boosting Orchestration.`);
            normalized.orchestration = (normalized.orchestration || 0.1) * 1.5;
        }
    }

    const total = Object.values(normalized).reduce((a, b) => a + (Number(b) || 0), 0);
    if (total === 0) return getDefaultWeights();
    
    (Object.keys(normalized) as Array<keyof AlgoWeights>).forEach(key => {
        normalized[key] = parseFloat(((Number(normalized[key]) || 0) / total).toFixed(4));
    });
    return normalized;
};

export const getDefaultWeights = (): AlgoWeights => {
    // Rééquilibrage v14.5 : Moins de fréquence, plus de gap et spectral
    return normalizeWeights({
        frequency: 0.05, // Réduit de 0.08
        gap: 0.20,       // Augmenté de 0.12
        spectral: 0.22,  // Augmenté de 0.18
        fractal: 0.08, 
        markov: 0.18,
        wavelet: 0.12, 
        orchestration: 0.10, 
        momentum: 0.05, 
        equilibrium: 0.0,
        ai_intuition: 0.0, 
        digital_root: 0.0, 
        gap_velocity: 0.0, 
        isolation_anomaly: 0.0
    } as any);
};

export const getDefaultRules = (): AdaptiveRules => ({
    criticalZoneMin: 12,
    criticalZoneMax: 18
});

export const saveAlgoWeights = async (drawName: string, weights: AlgoWeights, rules?: AdaptiveRules) => {
    const dataToSave = {
        weights,
        rules: rules || getAdaptiveRules(drawName),
        updatedAt: new Date().toISOString()
    };
    localStorage.setItem(`nexus_config_${drawName}`, JSON.stringify(dataToSave));
    localStorage.setItem(`weights_${drawName}`, JSON.stringify(weights));

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
    if (isSupabaseConfigured() && navigator.onLine) {
        try {
            const { data } = await supabase
                .from('algo_weights')
                .select('weights')
                .eq('draw_name', drawName)
                .single();
            
            if (data?.weights?.weights) {
                localStorage.setItem(`nexus_config_${drawName}`, JSON.stringify(data.weights));
                return data.weights.weights;
            }
        } catch (e) { }
    }
    return getAlgoWeightsSync(drawName);
};

export const getAdaptiveRules = (drawName: string): AdaptiveRules => {
    const raw = localStorage.getItem(`nexus_config_${drawName}`);
    if (raw) {
        const parsed = JSON.parse(raw);
        return parsed.rules || getDefaultRules();
    }
    return getDefaultRules();
};

export const saveAdaptiveRules = async (drawName: string, rules: AdaptiveRules) => {
    const weights = await getAlgoWeights(drawName);
    await saveAlgoWeights(drawName, weights, rules);
};

export const generateMasterPrediction = async (
    drawName: string, 
    history: DrawResult[],
    weightsToUse?: AlgoWeights,
    metrics?: any
): Promise<Prediction> => {
    const weights = normalizeWeights(weightsToUse || getAlgoWeightsSync(drawName), history);
    // Profondeur étendue à 50
    const sampleSize = Math.min(history.length, 50);
    const deepHistory = history.slice(0, sampleSize);
    
    if (!deepHistory || deepHistory.length < 10) throw new Error("Dataset insuffisant.");

    console.debug(`[APEX v14.5] Initialisation Inférence. Profondeur: ${sampleSize}t. Weights:`, weights);

    const regularity = metrics?.regularity || calculateRegularity(deepHistory);
    const correlationMap = metrics?.correlationMatrix || {};
    const lastWinners = deepHistory[0].gagnants;
    
    const entropy = calculateShannonEntropy(deepHistory);
    const chaosFactor = Math.max(0.4, 1 - (entropy.normalized - 0.85));

    const breakdown: Record<number, ScoreBreakdown> = {};
    const masterScores = Array.from({ length: 90 }, (_, i) => {
        const num = i + 1;
        const reg = regularity.find((r: any) => r.number === num);
        const spec = metrics?.spectral?.find((s: any) => s.number === num);
        
        // Fréquence calculée sur la fenêtre étendue
        const rawFreq = deepHistory.filter(h => h.gagnants.includes(num)).length;
        const freqScore = (Math.sqrt(rawFreq) / Math.sqrt(deepHistory.length)) * 100;
        
        let markovScore = 0;
        lastWinners.forEach(lw => {
           const strength = correlationMap[lw]?.affinities?.[num] || 0;
           if (strength > 0.2) markovScore += (strength * 100);
        });

        const digitalRoot = calculateDigitalRoot(num);
        const equilibriumScore = (digitalRoot >= 4 && digitalRoot <= 6) ? 80 : 40;

        const nBreakdown: ScoreBreakdown = {
            frequency: freqScore,
            gap: (reg?.currentGap || 50) > (reg?.avgGap || 18) ? 95 : 25,
            spectral: spec?.energy || 0,
            markov: Math.min(100, markovScore * 2.2),
            equilibrium: equilibriumScore,
            wavelet: metrics?.wavelet?.find((w: any) => w.number === num)?.energy || 0,
            momentum: Math.sqrt(deepHistory.slice(0, 12).filter(h => h.gagnants.includes(num)).length) * 45,
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

    // Tri des candidats
    const sorted = masterScores.sort((a, b) => b.score - a.score);
    
    // --- FILTRE DE DIVERSITÉ APEX SHIFT ---
    // Identifie les "King Numbers" (Top fréquences)
    const topFreqNumbers = regularity
        .sort((a, b) => b.avgGap - a.avgGap) // En fait on veut les plus fréquents (gap moyen faible)
        .slice(0, 10)
        .map(r => r.number);

    const selection: number[] = [];
    let freqCount = 0;
    let idx = 0;

    while (selection.length < 5 && idx < sorted.length) {
        const candidate = sorted[idx];
        const isHighFreq = topFreqNumbers.includes(candidate.num);

        // Limite : max 3 numéros de haute fréquence par prédiction
        if (isHighFreq && freqCount >= 3) {
            idx++;
            continue;
        }

        if (isHighFreq) freqCount++;
        selection.push(candidate.num);
        
        console.debug(`[KERNEL] N°${candidate.num} retenu. Score: ${candidate.score.toFixed(1)}. Raisons: ${candidate.score > 70 ? 'Résonance' : 'Structure'}`);
        idx++;
    }

    const acScore = calculateACValue(selection);
    let finalConfidence = Math.round(((sorted[0].score + sorted[4].score) / 2) * (acScore / 8) * chaosFactor);

    return {
        suggestedNumbers: selection.sort((a,b) => a - b),
        candidates: sorted.slice(5, 15).map(s => s.num),
        confidence: Math.min(99, Math.max(25, finalConfidence)),
        analysis: `Apex v14.5 Synchro. Profondeur 50t. Équilibre spectral : ${selection.slice(0,2).join('-')}. Diversité forcée (Shift ${5-freqCount}/5).`,
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
                const adjustment = (div.impact / 100) * 0.05;
                newWeights[key] = currentVal + adjustment;
                reasoning.push(`Adaptation ADN : Ajustement ${div.algo} (+${(adjustment * 100).toFixed(1)}%).`);
            }
        });
    }

    const newRules = { ...currentRules };
    return {
        newWeights: normalizeWeights(newWeights),
        newRules,
        reasoning
    };
};

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
