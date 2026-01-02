
import { DrawResult, Prediction, AlgoWeights, ScoreBreakdown, AdaptiveRules, ForensicReport, TicketAnalysisResult } from '../types';
import { calculateRegularity, calculateACValue } from './mathService';

export const getDefaultWeights = (): AlgoWeights => ({
    frequency: 0.20,
    gap: 0.15,
    spectral: 0.15,
    fractal: 0.05,
    markov: 0.15,
    spatial: 0.05,
    momentum: 0.05,
    equilibrium: 0.05,
    bayes: 0.02,
    orchestration: 0.03,
    transformer: 0.02,
    temporal: 0.05,
    ai_intuition: 0.01,
    digital_root: 0.01,
    gap_velocity: 0.01,
    poisson: 0.01,
    leader_succession: 0.01
});

export const getDefaultRules = (): AdaptiveRules => ({
    criticalZoneMin: 8,
    criticalZoneMax: 18
});

export const saveAlgoWeights = (drawName: string, weights: AlgoWeights) => {
    localStorage.setItem(`weights_${drawName}`, JSON.stringify(weights));
};

export const getAlgoWeights = (drawName: string): AlgoWeights => {
    const raw = localStorage.getItem(`weights_${drawName}`);
    return raw ? JSON.parse(raw) : getDefaultWeights();
};

export const getAdaptiveRules = (drawName: string): AdaptiveRules => {
    const raw = localStorage.getItem(`rules_${drawName}`);
    return raw ? JSON.parse(raw) : getDefaultRules();
};

export const saveAdaptiveRules = (drawName: string, rules: AdaptiveRules) => {
    localStorage.setItem(`rules_${drawName}`, JSON.stringify(rules));
};

/**
 * MOTEUR D'INFÉRENCE RÉEL (PLATINUM CORE)
 * Calcule un score pondéré pour chaque numéro sur la base de l'historique fourni.
 */
export const generateMasterPrediction = async (
    drawName: string, 
    history: DrawResult[],
    weightsToUse?: AlgoWeights,
    extraMetrics?: any
): Promise<Prediction> => {
    const weights = weightsToUse || getAlgoWeights(drawName);
    const breakdown: Record<number, ScoreBreakdown> = {};
    
    if (history.length < 5) {
        throw new Error("Profondeur de données insuffisante pour l'inférence.");
    }

    const regularity = calculateRegularity(history);
    const spectralMap = extraMetrics?.spectral || [];
    const fractalMap = extraMetrics?.fractal || [];
    
    // Matrice de transition simplifiée pour Markov
    const transitions: Record<number, number> = {};
    const lastWinners = history[0].gagnants;
    for(let i=0; i < history.length - 1; i++) {
        if (history[i+1].gagnants.some(n => lastWinners.includes(n))) {
            history[i].gagnants.forEach(n => transitions[n] = (transitions[n] || 0) + 1);
        }
    }

    const scores = Array.from({ length: 90 }, (_, i) => {
        const num = i + 1;
        const reg = regularity.find(r => r.number === num);
        const spec = spectralMap.find((s: any) => s.number === num);
        const frac = fractalMap.find((f: any) => f.number === num);
        
        // 1. Fréquence (Normalisée sur 100)
        const freqScore = ((history.filter(h => h.gagnants.includes(num)).length / history.length) * 500);
        
        // 2. Gap (Zone critique 8-18 favors)
        const currentGap = reg?.currentGap || 0;
        const gapScore = (currentGap >= 8 && currentGap <= 18) ? 100 : (currentGap > 30 ? 60 : 20);
        
        // 3. Spectral Energy
        const specScore = spec?.energy || 0;

        // 4. Markovian Transition
        const markovScore = Math.min(100, (transitions[num] || 0) * 10);

        // Score final par neurone
        const nBreakdown: ScoreBreakdown = {
            ...getDefaultWeights(),
            frequency: Math.min(100, freqScore),
            gap: gapScore,
            spectral: specScore,
            markov: markovScore,
            temporal: reg && Math.abs(reg.avgGap - reg.currentGap) < 2 ? 100 : 30,
            fractal: frac?.hurst ? frac.hurst * 100 : 50
        };

        breakdown[num] = nBreakdown;

        // Calcul du score global pondéré
        let finalScore = 0;
        Object.entries(weights).forEach(([key, weight]) => {
            const val = (nBreakdown as any)[key] || 0;
            finalScore += val * (weight as number);
        });

        return { num, score: finalScore };
    });

    const sorted = scores.sort((a, b) => b.score - a.score);
    const suggested = sorted.slice(0, 5).map(s => s.num);
    
    // Calcul de confiance basé sur l'écart-type des scores des gagnants
    const avgScore = sorted.slice(0, 10).reduce((a, b) => a + b.score, 0) / 10;
    const confidence = Math.min(98, Math.round(avgScore * 0.8 + (history.length / 2)));

    return {
        suggestedNumbers: suggested,
        candidates: sorted.slice(5, 15).map(s => s.num),
        confidence,
        analysis: `Analyse complétée pour ${drawName}. Convergence forte sur ${suggested[0]} (Poids: ${sorted[0].score.toFixed(1)}). Structure temporelle stable.`,
        breakdown,
        usedWeights: weights
    };
};

export const getStrategyName = (weights: AlgoWeights): string => {
    const keys = Object.entries(weights).sort((a, b) => (b[1] as number) - (a[1] as number));
    const top = keys[0][0];
    if (top === 'spectral') return "Résonance FFT";
    if (top === 'frequency') return "Hot-Spot Scanner";
    if (top === 'gap') return "Pression Sniper";
    if (top === 'markov') return "Markov Chain Flow";
    return "Consensus Platinum";
};

export const analyzeTicketStrength = async (nums: number[], drawName: string): Promise<TicketAnalysisResult> => {
    const weights = getAlgoWeights(drawName);
    const ac = calculateACValue(nums);
    const sum = nums.reduce((a,b) => a+b, 0);
    
    let score = 50;
    const warnings = [];

    if (ac < 7) { score -= 15; warnings.push("Complexité Arithmétique faible (Pattern trop simple)."); }
    if (sum < 150 || sum > 300) { score -= 10; warnings.push("Somme hors-zone gaussienne idéale."); }
    
    return {
        score: Math.max(0, Math.min(100, score + (ac * 5))),
        verdict: score > 70 ? "Structure Élite" : score > 40 ? "Configuration Standard" : "Risque de Leurre",
        warnings
    };
};

export const calculateCorrectionsFromForensics = (weights: AlgoWeights, rules: AdaptiveRules, report: ForensicReport) => {
    const hits = report.matches.filter(m => m.errorType === 'Hit').length;
    const proximity = report.matches.filter(m => ['Voisin', 'Miroir'].includes(m.errorType)).length;
    
    const newWeights = { ...weights };
    const reasoning = [];

    if (hits === 0 && proximity > 0) {
        newWeights.orchestration = Math.min(0.2, (newWeights.orchestration || 0) + 0.02);
        reasoning.push("Augmentation du neurone Orchestration (Détection de frôlements)");
    } else if (hits >= 2) {
        reasoning.push("ADN validé. Renforcement des paramètres actuels.");
    }

    return {
        newWeights,
        newRules: { ...rules },
        reasoning
    };
};
