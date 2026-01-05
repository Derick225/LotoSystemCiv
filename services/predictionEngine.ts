
import { DrawResult, Prediction, AlgoWeights, ScoreBreakdown, AdaptiveRules, ForensicReport, TicketAnalysisResult } from '../types';
import { calculateRegularity, calculateACValue, calculateHurstForNumber, calculateGravityField, validateDataIntegrity, calculatePredictionZScore, calculateWaveletEnergy, calculateTechnicalResistance, calculatePoissonProbability, calculateVolatility } from './mathService';
import { supabase, isSupabaseConfigured } from './supabaseClient';

export const getDefaultWeights = (): AlgoWeights => ({
    frequency: 0.15,
    gap: 0.10,
    spectral: 0.10,
    fractal: 0.05,
    wavelet: 0.10, 
    resistance: 0.05, 
    markov: 0.15,
    spatial: 0.05,
    momentum: 0.05,
    equilibrium: 0.05,
    bayes: 0.02,
    orchestration: 0.03,
    transformer: 0.02,
    temporal: 0.03,
    ai_intuition: 0.01,
    digital_root: 0.01,
    gap_velocity: 0.01,
    poisson: 0.05, 
    leader_succession: 0.01
});

export const getDefaultRules = (): AdaptiveRules => ({
    criticalZoneMin: 8,
    criticalZoneMax: 18
});

// --- CLOUD SYNC LOGIC START ---

export const saveAlgoWeights = async (drawName: string, weights: AlgoWeights) => {
    localStorage.setItem(`weights_${drawName}`, JSON.stringify(weights));
    if (isSupabaseConfigured()) {
        try {
            await supabase.from('algo_weights').upsert({
                draw_name: drawName,
                weights: weights,
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

            if (data && data.weights && JSON.stringify(data.weights) !== rawLocal) {
                localStorage.setItem(`weights_${drawName}`, JSON.stringify(data.weights));
                return data.weights;
            }
        } catch (e) { /* Ignore */ }
    }
    return currentWeights;
};

export const getAlgoWeightsSync = (drawName: string): AlgoWeights => {
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
 * Calibre dynamiquement les poids en fonction du Régime Fractal (Hurst).
 */
const adjustWeightsToRegime = (baseWeights: AlgoWeights, history: DrawResult[]): { weights: AlgoWeights, regimeLabel: string } => {
    let totalHurst = 0;
    for (let i = 1; i <= 5; i++) {
        totalHurst += calculateHurstForNumber(i, history).hurst;
    }
    const avgHurst = totalHurst / 5;

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
        adjusted.wavelet = (adjusted.wavelet || 0) * 1.5; 
        adjusted.momentum = (adjusted.momentum || 0) * 0.6;
    } else {
        label = "Chaos (Aléatoire)";
        adjusted.spatial = (adjusted.spatial || 0) * 1.5;
        adjusted.resistance = (adjusted.resistance || 0) * 1.4; 
        adjusted.poisson = (adjusted.poisson || 0) * 1.8;
    }

    const totalOld = Object.values(baseWeights).reduce((a, b) => a + (b||0), 0);
    const totalNew = Object.values(adjusted).reduce((a, b) => a + (b||0), 0);
    const ratio = totalNew > 0 ? totalOld / totalNew : 1;
    
    (Object.keys(adjusted) as Array<keyof AlgoWeights>).forEach(k => {
        adjusted[k] = (adjusted[k] || 0) * ratio;
    });

    return { weights: adjusted, regimeLabel: label };
};

// Fonction Sigmoid pour la normalisation non-linéaire des scores
const sigmoid = (t: number) => 1 / (1 + Math.exp(-0.1 * (t - 50)));

/**
 * MOTEUR D'INFÉRENCE RÉEL (PLATINUM CORE v2.3)
 */
export const generateMasterPrediction = async (
    drawName: string, 
    history: DrawResult[],
    weightsToUse?: AlgoWeights,
    extraMetrics?: any
): Promise<Prediction> => {
    
    const integrity = validateDataIntegrity(history);
    let weights = weightsToUse || await getAlgoWeights(drawName);
    const breakdown: Record<number, ScoreBreakdown> = {};
    
    if (history.length < 5) throw new Error("Profondeur de données insuffisante.");

    const volatility = calculateVolatility(history);
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
        const signal = history.slice(0, 32).map(d => d.gagnants.includes(num) ? 1 : 0);
        
        const freqScore = ((history.filter(h => h.gagnants.includes(num)).length / history.length) * 500);
        const currentGap = reg?.currentGap || 0;
        
        // Gap Scoring amélioré avec pénalité sur les gaps extrêmes (> 40)
        let gapScore = (currentGap >= 8 && currentGap <= 18) ? 100 : (currentGap > 30 ? 60 : 20);
        if (currentGap > 60) gapScore = 5; // Pénalité "Froid polaire"

        const specScore = spec?.energy || 0;
        const markovScore = Math.min(100, (transitions[num] || 0) * 10);
        const spatialScore = Math.min(100, gravity * 50);
        const waveletScore = calculateWaveletEnergy(signal);
        const resistScore = calculateTechnicalResistance(num, history);
        
        // Lambda estimé par moyenne locale (50 derniers tirages)
        const localFreq = history.slice(0, 50).filter(h => h.gagnants.includes(num)).length;
        const lambda = (localFreq / 50) * (90/5); 
        const poissonVal = calculatePoissonProbability(lambda, currentGap);

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
            poisson: poissonVal
        };

        breakdown[num] = nBreakdown;

        let rawScore = 0;
        Object.entries(weights).forEach(([key, weight]) => {
            const val = (nBreakdown as any)[key] || 0;
            rawScore += val * (weight as number);
        });

        // Boost non-linéaire pour les candidats très forts
        const finalScore = sigmoid(rawScore) * 100;

        return { num, score: finalScore };
    });

    const sorted = scores.sort((a, b) => b.score - a.score);
    const suggested = sorted.slice(0, 5).map(s => s.num);
    const zScore = calculatePredictionZScore(suggested);
    const isOutlier = Math.abs(zScore) > 2.5;

    // Calcul de la confiance
    const topScoreAvg = (sorted[0].score + sorted[1].score + sorted[2].score) / 3;
    let baseConfidence = Math.min(99, Math.round(topScoreAvg));
    if (integrity.score < 80) baseConfidence *= 0.8;
    if (volatility.score > 70) baseConfidence *= 0.9;

    // Détection de "Dizaines Manquantes" pour le texte d'analyse
    const decades = suggested.map(n => Math.floor(n/10));
    const missingDecades = [0,1,2,3,4,5,6,7,8].filter(d => !decades.includes(d));
    const missingText = missingDecades.length > 4 ? `Zones vides: ${missingDecades.slice(0,3).join(',')}` : 'Répartition homogène';

    const analysisText = `Régime: ${regimeLabel} (Volatilité ${volatility.score}%). Convergence sur ${suggested[0]} (Score: ${sorted[0].score.toFixed(1)}). Structure: ${missingText}. ${isOutlier ? '⚠️ Combinaison atypique (Z>2.5).' : 'Ticket équilibré.'}`;

    return {
        suggestedNumbers: suggested,
        candidates: sorted.slice(5, 15).map(s => s.num),
        confidence: Math.round(baseConfidence),
        analysis: analysisText,
        breakdown,
        usedWeights: weights
    };
};

const applyBayesianTrendCorrection = (weights: AlgoWeights, history: DrawResult[]): AlgoWeights => {
    if (history.length < 5) return weights;
    const newWeights = { ...weights };
    const winningNumbers = history[0].gagnants;
    const intersection = history.slice(1)[0]?.gagnants.filter(n => winningNumbers.includes(n)).length || 0;
    
    if (intersection >= 2) {
        newWeights.markov = Math.min(0.25, (newWeights.markov || 0) * 1.2);
        newWeights.leader_succession = Math.min(0.1, (newWeights.leader_succession || 0) * 1.2);
    }
    
    const spread = Math.max(...winningNumbers) - Math.min(...winningNumbers);
    if (spread > 80) {
        newWeights.spatial = Math.min(0.15, (newWeights.spatial || 0) * 1.15);
    }
    return newWeights;
};

export const getStrategyName = (weights: AlgoWeights): string => {
    const keys = Object.entries(weights).sort((a, b) => (b[1] as number) - (a[1] as number));
    const top = keys[0][0];
    if (top === 'spectral') return "Résonance FFT";
    if (top === 'wavelet') return "Ondelette Pulse";
    if (top === 'frequency') return "Hot-Spot Scanner";
    if (top === 'gap') return "Pression Sniper";
    if (top === 'markov') return "Markov Chain Flow";
    if (top === 'ai_intuition') return "Chaos Oracle";
    if (top === 'poisson') return "Poisson Distribution";
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
