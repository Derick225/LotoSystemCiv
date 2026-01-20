
import { DrawResult, Prediction, AlgoWeights, ScoreBreakdown, AdaptiveRules, ForensicReport, TicketAnalysisResult } from '../types';
import { calculateRegularity, calculateACValue, calculateVolatility, calculateDigitalRoot, calculateShannonEntropy } from './mathService';

/**
 * NEXUS PREDICTION ENGINE v13.0 - APEX KERNEL
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
    frequency: 0.15, gap: 0.10, spectral: 0.15, fractal: 0.05, markov: 0.15,
    wavelet: 0.10, orchestration: 0.10, momentum: 0.10, equilibrium: 0.05,
    ai_intuition: 0.05, digital_root: 0.0, gap_velocity: 0.0, isolation_anomaly: 0.0
} as any);

// Fix: Added missing getDefaultRules required by ExpertTuningPanel.tsx
export const getDefaultRules = (): AdaptiveRules => ({
    criticalZoneMin: 12,
    criticalZoneMax: 18
});

export const saveAlgoWeights = async (drawName: string, weights: AlgoWeights) => {
    localStorage.setItem(`weights_${drawName}`, JSON.stringify(weights));
};

export const getAlgoWeightsSync = (drawName: string): AlgoWeights => {
    const raw = localStorage.getItem(`weights_${drawName}`);
    return raw ? JSON.parse(raw) : getDefaultWeights();
};

export const getAlgoWeights = async (drawName: string): Promise<AlgoWeights> => {
    return getAlgoWeightsSync(drawName);
};

export const getAdaptiveRules = (drawName: string): AdaptiveRules => {
    const raw = localStorage.getItem(`rules_${drawName}`);
    return raw ? JSON.parse(raw) : getDefaultRules();
};

export const saveAdaptiveRules = (drawName: string, rules: AdaptiveRules) => {
    localStorage.setItem(`rules_${drawName}`, JSON.stringify(rules));
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
    
    // Calcul de l'Entropie globale pour réguler la confiance
    const entropy = calculateShannonEntropy(history.slice(0, 50));
    const chaosFactor = Math.max(0.5, 1 - (entropy.normalized - 0.85));

    const breakdown: Record<number, ScoreBreakdown> = {};
    const masterScores = Array.from({ length: 90 }, (_, i) => {
        const num = i + 1;
        const reg = regularity.find((r: any) => r.number === num);
        const spec = metrics?.spectral?.find((s: any) => s.number === num);
        
        const freqScore = (history.filter(h => h.gagnants.includes(num)).length / history.length) * 100;
        
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
            momentum: history.slice(0, 8).filter(h => h.gagnants.includes(num)).length * 20,
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
    
    // Calcul de confiance multi-factoriel APEX
    let baseConfidence = (sorted[0].score + sorted[4].score) / 2;
    // Malus si AC trop bas, Malus si Chaos trop haut
    let finalConfidence = Math.round(baseConfidence * (acScore / 8) * chaosFactor);

    let analysis = `Apex v13.0 Synchro. `;
    if (entropy.normalized > 0.95) analysis += `ALERTE : Entropie critique. Le flux est quasi-aléatoire. `;
    else if (chaosFactor > 0.9) analysis += `Régime structurel stable détecté. `;

    return {
        suggestedNumbers: top5,
        candidates: sorted.slice(5, 15).map(s => s.num),
        confidence: Math.min(98, Math.max(25, finalConfidence)),
        analysis: analysis + `Confluence majeure sur ${top5.slice(0,2).join(' & ')}.`,
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

// Fix: Added missing calculateCorrectionsFromForensics required by PredictionForensics.tsx
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
                reasoning.push(`Adaptation ADN : Renforcement du module ${div.algo} (+${(adjustment * 100).toFixed(1)}%).`);
            }
        });
    }

    const newRules = { ...currentRules };
    const hits = report.matches.filter(m => m.errorType === 'Hit').length;
    if (hits === 0) {
        newRules.criticalZoneMax = Math.min(45, newRules.criticalZoneMax + 1);
        reasoning.push("Élargissement du filtre temporel critique basé sur le décalage observé.");
    }

    return {
        newWeights: normalizeWeights(newWeights),
        newRules,
        reasoning
    };
};
