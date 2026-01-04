
import { DrawResult, Prediction, AlgoWeights, ScoreBreakdown, AdaptiveRules, ForensicReport, TicketAnalysisResult } from '../types';
import { calculateRegularity, calculateACValue, calculateHurstForNumber, calculateGravityField, validateDataIntegrity, calculatePredictionZScore } from './mathService';
import { supabase, isSupabaseConfigured } from './supabaseClient';

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

// --- CLOUD SYNC LOGIC START ---

export const saveAlgoWeights = async (drawName: string, weights: AlgoWeights) => {
    // 1. Sauvegarde Locale (Instantanéité)
    localStorage.setItem(`weights_${drawName}`, JSON.stringify(weights));

    // 2. Sauvegarde Cloud (Persistance Cross-Device)
    if (isSupabaseConfigured()) {
        try {
            const { error } = await supabase.from('algo_weights').upsert({
                draw_name: drawName,
                weights: weights,
                updated_at: new Date().toISOString()
            });
            if (error) console.warn("Cloud weights sync failed:", error.message);
        } catch (e) {
            console.warn("Cloud weights sync error", e);
        }
    }
};

export const getAlgoWeights = async (drawName: string): Promise<AlgoWeights> => {
    // Stratégie "Stale-While-Revalidate"
    // 1. On charge le local immédiatement
    const rawLocal = localStorage.getItem(`weights_${drawName}`);
    let currentWeights = rawLocal ? JSON.parse(rawLocal) : getDefaultWeights();

    // 2. Si on est connecté, on vérifie le Cloud silencieusement
    if (isSupabaseConfigured() && navigator.onLine) {
        try {
            const { data, error } = await supabase
                .from('algo_weights')
                .select('weights')
                .eq('draw_name', drawName)
                .single();

            if (data && data.weights) {
                // Si le cloud a des données différentes, on met à jour le local pour la prochaine fois
                if (JSON.stringify(data.weights) !== rawLocal) {
                    localStorage.setItem(`weights_${drawName}`, JSON.stringify(data.weights));
                    return data.weights; // On retourne la version Cloud (Vérité terrain)
                }
            }
        } catch (e) {
            // Ignore cloud error, use local
        }
    }

    return currentWeights;
};

// Version synchrone pour l'initialisation UI rapide (lectures seules)
export const getAlgoWeightsSync = (drawName: string): AlgoWeights => {
    const raw = localStorage.getItem(`weights_${drawName}`);
    return raw ? JSON.parse(raw) : getDefaultWeights();
};

// --- CLOUD SYNC LOGIC END ---

export const getAdaptiveRules = (drawName: string): AdaptiveRules => {
    const raw = localStorage.getItem(`rules_${drawName}`);
    return raw ? JSON.parse(raw) : getDefaultRules();
};

export const saveAdaptiveRules = (drawName: string, rules: AdaptiveRules) => {
    localStorage.setItem(`rules_${drawName}`, JSON.stringify(rules));
};

/**
 * Calibre dynamiquement les poids en fonction du Régime Fractal (Hurst).
 */
const adjustWeightsToRegime = (baseWeights: AlgoWeights, history: DrawResult[]): { weights: AlgoWeights, regimeLabel: string } => {
    let totalHurst = 0;
    const sampleSize = 5;
    for (let i = 1; i <= sampleSize; i++) {
        totalHurst += calculateHurstForNumber(i, history).hurst;
    }
    const avgHurst = totalHurst / sampleSize;

    const adjusted = { ...baseWeights };
    let label = "Neutre";

    if (avgHurst > 0.60) {
        label = "Tendance (Persistant)";
        adjusted.momentum = (adjusted.momentum || 0) * 1.5;
        adjusted.markov = (adjusted.markov || 0) * 1.4;
        adjusted.leader_succession = (adjusted.leader_succession || 0) * 1.3;
        adjusted.equilibrium = (adjusted.equilibrium || 0) * 0.7;
    } else if (avgHurst < 0.40) {
        label = "Oscillation (Retour Moyenne)";
        adjusted.equilibrium = (adjusted.equilibrium || 0) * 1.6;
        adjusted.gap = (adjusted.gap || 0) * 1.4;
        adjusted.frequency = (adjusted.frequency || 0) * 1.3;
        adjusted.momentum = (adjusted.momentum || 0) * 0.6;
    } else {
        label = "Chaos (Aléatoire)";
        adjusted.spatial = (adjusted.spatial || 0) * 1.5;
        adjusted.ai_intuition = (adjusted.ai_intuition || 0) * 1.8;
        adjusted.poisson = (adjusted.poisson || 0) * 1.5;
    }

    // Renormalisation
    const totalOld = Object.values(baseWeights).reduce((a, b) => a + (b||0), 0);
    const totalNew = Object.values(adjusted).reduce((a, b) => a + (b||0), 0);
    const ratio = totalNew > 0 ? totalOld / totalNew : 1;
    
    (Object.keys(adjusted) as Array<keyof AlgoWeights>).forEach(k => {
        adjusted[k] = (adjusted[k] || 0) * ratio;
    });

    return { weights: adjusted, regimeLabel: label };
};

/**
 * MOTEUR D'INFÉRENCE RÉEL (PLATINUM CORE v2.1 VALIDATED)
 */
export const generateMasterPrediction = async (
    drawName: string, 
    history: DrawResult[],
    weightsToUse?: AlgoWeights,
    extraMetrics?: any
): Promise<Prediction> => {
    
    const integrity = validateDataIntegrity(history);
    if (!integrity.valid) {
        console.warn("Prediction Warning: Data integrity check failed.", integrity.issues);
    }

    // Utilisation de la version Async/Cloud si possible pour les poids
    let weights = weightsToUse || await getAlgoWeights(drawName);
    const breakdown: Record<number, ScoreBreakdown> = {};
    
    if (history.length < 5) {
        throw new Error("Profondeur de données insuffisante pour l'inférence.");
    }

    const { weights: dynamicWeights, regimeLabel } = adjustWeightsToRegime(weights, history);
    weights = dynamicWeights;

    const regularity = calculateRegularity(history);
    const spectralMap = extraMetrics?.spectral || [];
    const fractalMap = extraMetrics?.fractal || [];
    const gravityField = calculateGravityField(history);
    
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
        const gravity = gravityField[num] || 0;
        
        const freqScore = ((history.filter(h => h.gagnants.includes(num)).length / history.length) * 500);
        const currentGap = reg?.currentGap || 0;
        const gapScore = (currentGap >= 8 && currentGap <= 18) ? 100 : (currentGap > 30 ? 60 : 20);
        const specScore = spec?.energy || 0;
        const markovScore = Math.min(100, (transitions[num] || 0) * 10);
        const spatialScore = Math.min(100, gravity * 50);

        const nBreakdown: ScoreBreakdown = {
            ...getDefaultWeights(),
            frequency: Math.min(100, freqScore),
            gap: gapScore,
            spectral: specScore,
            markov: markovScore,
            spatial: spatialScore,
            temporal: reg && Math.abs(reg.avgGap - reg.currentGap) < 2 ? 100 : 30,
            fractal: frac?.hurst ? frac.hurst * 100 : 50
        };

        breakdown[num] = nBreakdown;

        let finalScore = 0;
        Object.entries(weights).forEach(([key, weight]) => {
            const val = (nBreakdown as any)[key] || 0;
            finalScore += val * (weight as number);
        });

        return { num, score: finalScore };
    });

    const sorted = scores.sort((a, b) => b.score - a.score);
    const suggested = sorted.slice(0, 5).map(s => s.num);
    const zScore = calculatePredictionZScore(suggested);
    const isOutlier = Math.abs(zScore) > 2.5;

    const signalStrength = (sorted[0].score - sorted[10].score) / (sorted[0].score || 1);
    let baseConfidence = Math.min(99, Math.round(50 + (signalStrength * 500) + (history.length / 10)));
    
    if (integrity.score < 80) baseConfidence *= 0.8;
    if (isOutlier) baseConfidence *= 0.9;

    const analysisText = `Régime: ${regimeLabel}. Conv. sur ${suggested[0]} (Score: ${sorted[0].score.toFixed(1)}). ${isOutlier ? '⚠️ Combinaison atypique (Z>2.5).' : 'Structure équilibrée.'}`;

    return {
        suggestedNumbers: suggested,
        candidates: sorted.slice(5, 15).map(s => s.num),
        confidence: Math.round(baseConfidence),
        analysis: analysisText,
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
    if (top === 'ai_intuition') return "Chaos Oracle";
    return "Consensus Platinum";
};

export const analyzeTicketStrength = async (nums: number[], drawName: string): Promise<TicketAnalysisResult> => {
    const ac = calculateACValue(nums);
    const sum = nums.reduce((a,b) => a+b, 0);
    
    let score = 50;
    const warnings = [];

    if (ac < 7) { score -= 15; warnings.push("Complexité Arithmétique faible (Pattern trop simple)."); }
    if (sum < 150 || sum > 300) { score -= 10; warnings.push("Somme hors-zone gaussienne idéale."); }
    
    const even = nums.filter(n => n % 2 === 0).length;
    if (even === 0 || even === 5) { score -= 10; warnings.push("Déséquilibre Pair/Impair total."); }

    const sorted = [...nums].sort((a,b)=>a-b);
    let consecutive = 0;
    for(let i=0; i<sorted.length-1; i++) if(sorted[i+1] === sorted[i]+1) consecutive++;
    if (consecutive > 2) { score -= 20; warnings.push("Trop de suites consécutives."); }
    
    return {
        score: Math.max(0, Math.min(100, score + (ac * 5))),
        verdict: score > 75 ? "Structure Élite" : score > 50 ? "Configuration Viable" : "Risque Élevé",
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
        newWeights.spatial = Math.min(0.15, (newWeights.spatial || 0) + 0.02);
        reasoning.push("Augmentation du neurone Orchestration (Détection de frôlements)");
    } else if (hits >= 2) {
        reasoning.push("ADN validé. Renforcement des paramètres actuels.");
    } else {
        const keys = Object.keys(newWeights) as Array<keyof AlgoWeights>;
        const topKey = keys.reduce((a, b) => (newWeights[a] || 0) > (newWeights[b] || 0) ? a : b);
        newWeights[topKey] = Math.max(0.05, (newWeights[topKey] || 0) * 0.9);
        reasoning.push(`Diminution du poids dominant (${topKey}) suite à divergence.`);
    }

    return {
        newWeights,
        newRules: { ...rules },
        reasoning
    };
};
