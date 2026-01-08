
import { DrawResult, Prediction, AlgoWeights, ScoreBreakdown, AdaptiveRules, ForensicReport, TicketAnalysisResult } from '../types';
import { calculateRegularity, calculateACValue, calculateHurstForNumber, calculateGravityField, validateDataIntegrity, calculatePredictionZScore, calculateWaveletEnergy, calculateTechnicalResistance, calculatePoissonProbability, calculateVolatility, calculateGapTrend } from './mathService';
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
    gap_velocity: 0.05,
    poisson: 0.05, 
    leader_succession: 0.01,
    anti_consensus: 0.05
});

export const getDefaultRules = (): AdaptiveRules => ({
    criticalZoneMin: 8,
    criticalZoneMax: 18
});

// --- STORAGE UTILS ---

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

            if (data && data.weights) {
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

// --- CORE ENGINE LOGIC ---

const normalizeWeights = (w: AlgoWeights): AlgoWeights => {
    const total = Object.values(w).reduce((a, b) => a + (b || 0), 0);
    const keys = Object.keys(w) as Array<keyof AlgoWeights>;
    const normalized = { ...w };
    if (total > 0) {
        keys.forEach(k => {
            normalized[k] = parseFloat(((normalized[k] || 0) / total).toFixed(4));
        });
    }
    return normalized;
};

/**
 * AUTO-CALIBRATION: Analyse la "personnalité" mathématique du tirage
 * Cette fonction regarde l'historique STRICT du tirage concerné pour voir ce qui fonctionne.
 */
const autoCalibrateWeights = (drawName: string, baseWeights: AlgoWeights, history: DrawResult[]): { weights: AlgoWeights, analysis: string } => {
    // Si pas assez d'historique, on retourne les poids par défaut ou manuels
    if (history.length < 20) return { weights: baseWeights, analysis: "Données insuffisantes pour calibration." };

    const tuned = { ...baseWeights };
    const reportParts: string[] = [];

    // 1. Analyse de la Volatilité Spécifique (Écart-type des sommes)
    const sums = history.slice(0, 30).map(d => d.gagnants.reduce((a, b) => a + b, 0));
    const meanSum = sums.reduce((a, b) => a + b, 0) / sums.length;
    const variance = sums.reduce((a, b) => a + Math.pow(b - meanSum, 2), 0) / sums.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev > 50) {
        // Jeu très volatile : On favorise le Chaos et la résistance
        tuned.anti_consensus = (tuned.anti_consensus || 0.05) * 2.0;
        tuned.resistance = (tuned.resistance || 0.05) * 1.5;
        tuned.frequency = (tuned.frequency || 0.15) * 0.6; // La fréquence ment en cas de chaos
        reportParts.push("Volatilité Haute -> Mode Chaos activé");
    } else {
        // Jeu stable : On favorise la fréquence et l'équilibre
        tuned.frequency = (tuned.frequency || 0.15) * 1.4;
        tuned.equilibrium = (tuned.equilibrium || 0.05) * 1.5;
        reportParts.push("Jeu Stable -> Suivi de tendance");
    }

    // 2. Analyse de la Répétition (Inertie)
    let repetitionCount = 0;
    for(let i=0; i < 20; i++) {
        const current = history[i].gagnants;
        const prev = history[i+1].gagnants;
        if (current.some(n => prev.includes(n))) repetitionCount++;
    }
    const inertiaRate = repetitionCount / 20;

    if (inertiaRate > 0.4) { // Plus de 40% des tirages ont une répétition
        tuned.leader_succession = (tuned.leader_succession || 0.01) * 2.5; // Boost Markov/Succession
        tuned.momentum = (tuned.momentum || 0.05) * 1.5;
        reportParts.push("Forte Inertie -> Boost Succession");
    }

    // 3. Signature Spectrale (Est-ce que le jeu est cyclique ?)
    // Simulation simple : on regarde si les numéros reviennent par cycle
    // (Implémentation simplifiée pour performance)
    
    return { 
        weights: normalizeWeights(tuned), 
        analysis: reportParts.join(' | ') 
    };
};

/**
 * Calcule des poids optimaux basés uniquement sur l'historique (pour le Tuning Panel).
 */
export const calculateOptimalWeights = (history: DrawResult[]): AlgoWeights => {
    const base = getDefaultWeights();
    if (!history || history.length < 20) return base;
    const { weights } = autoCalibrateWeights("OPTIMIZER", base, history);
    return weights;
};

const sigmoid = (t: number) => 1 / (1 + Math.exp(-0.1 * (t - 50)));

/**
 * MOTEUR D'INFÉRENCE PLATINUM (ISOLÉ)
 * Utilise uniquement l'historique fourni en argument (qui doit être celui du tirage spécifique).
 */
export const generateMasterPrediction = async (
    drawName: string, 
    history: DrawResult[],
    weightsToUse?: AlgoWeights,
    extraMetrics?: any
): Promise<Prediction> => {
    
    if (!history || history.length < 5) throw new Error("Historique vide ou insuffisant pour ce tirage.");

    const integrity = validateDataIntegrity(history);
    
    // 1. Détermination des Poids (Manuel ou Auto-Calibré)
    let baseWeights = weightsToUse || await getAlgoWeights(drawName);
    const { weights: optimizedWeights, analysis: tuningAnalysis } = autoCalibrateWeights(drawName, baseWeights, history);
    
    // 2. Calcul des Indicateurs Techniques (Scope: Ce tirage uniquement)
    const volatility = calculateVolatility(history);
    const regularity = calculateRegularity(history);
    const spectralMap = extraMetrics?.spectral || [];
    const fractalMap = extraMetrics?.fractal || [];
    const gravityField = calculateGravityField(history);
    const gapTrend = calculateGapTrend(history); 
    
    const breakdown: Record<number, ScoreBreakdown> = {};
    const transitions: Record<number, number> = {};
    
    // Matrice de transition locale (Markov ordre 1 sur ce jeu)
    const lastWinners = history[0].gagnants;
    for(let i=0; i < Math.min(history.length - 1, 100); i++) {
        if (history[i+1].gagnants.some(n => lastWinners.includes(n))) {
            history[i].gagnants.forEach(n => transitions[n] = (transitions[n] || 0) + 1);
        }
    }

    // 3. Scoring Vectoriel 1-90
    const scores = Array.from({ length: 90 }, (_, i) => {
        const num = i + 1;
        const reg = regularity.find(r => r.number === num);
        const spec = spectralMap.find((s: any) => s.number === num);
        const frac = fractalMap.find((f: any) => f.number === num);
        const gravity = gravityField[num] || 0;
        
        // Signal binaire local pour ondelettes
        const signal = history.slice(0, 32).map(d => d.gagnants.includes(num) ? 1 : 0);
        
        // Fréquence locale (50 derniers tirages de CE jeu)
        const localFreqCount = history.slice(0, 50).filter(h => h.gagnants.includes(num)).length;
        const freqScore = (localFreqCount / 50) * 500; 

        // Gap Scoring
        const currentGap = reg?.currentGap || 0;
        let gapScore = (currentGap >= 8 && currentGap <= 18) ? 100 : (currentGap > 30 ? 60 : 20);
        if (gapTrend.trend === 'ACCELERATING' && currentGap < 10) gapScore += 40;
        if (gapTrend.trend === 'DECELERATING' && currentGap > 20) gapScore += 40;

        // Scores spécialisés
        const specScore = spec?.energy || 0;
        const markovScore = Math.min(100, (transitions[num] || 0) * 15);
        const spatialScore = Math.min(100, gravity * 50);
        const waveletScore = calculateWaveletEnergy(signal);
        const resistScore = calculateTechnicalResistance(num, history);
        
        // Poisson
        const lambda = (localFreqCount / 50) * (90/5); 
        const poissonVal = calculatePoissonProbability(lambda, currentGap);

        // Anti-Consensus (Si le numéro est trop "évident", on baisse son score en mode chaos)
        let antiConsensusScore = 0;
        const veryRecentFreq = history.slice(0, 10).filter(h => h.gagnants.includes(num)).length;
        if (veryRecentFreq === 0) antiConsensusScore = 100; // Froid localement = Potentiel
        else if (veryRecentFreq >= 2) antiConsensusScore = 0; // Trop chaud

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
            gap_velocity: 50, // Placeholder
            anti_consensus: antiConsensusScore
        };

        breakdown[num] = nBreakdown;

        let rawScore = 0;
        Object.entries(optimizedWeights).forEach(([key, weight]) => {
            const val = (nBreakdown as any)[key] || 0;
            rawScore += val * (weight as number);
        });

        return { num, score: sigmoid(rawScore) * 100 };
    });

    // 4. Finalisation
    const sorted = scores.sort((a, b) => b.score - a.score);
    const suggested = sorted.slice(0, 5).map(s => s.num);
    
    // Calcul de confiance basé sur la clarté du signal (écart entre le 1er et le 10ème)
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

export const calculateCorrectionsFromForensics = (weights: AlgoWeights, rules: AdaptiveRules, report: ForensicReport) => {
    // Logique de correction existante...
    const hits = report.matches.filter(m => m.errorType === 'Hit').length;
    const newWeights = { ...weights };
    const reasoning = [];

    if (hits === 0) {
        newWeights.anti_consensus = Math.min(0.3, (newWeights.anti_consensus || 0) + 0.05);
        reasoning.push("Renforcement Anti-Consensus suite échec total.");
    }
    
    return {
        newWeights: normalizeWeights(newWeights),
        newRules: { ...rules },
        reasoning
    };
};

export const analyzeTicketStrength = async (numbers: number[], _drawName: string): Promise<TicketAnalysisResult> => {
    // Logique existante préservée
    const ac = calculateACValue(numbers);
    const sum = numbers.reduce((a, b) => a + b, 0);
    const odd = numbers.filter(n => n % 2 !== 0).length;
    let score = 50;
    const warnings: string[] = [];
    if (ac >= 7) score += 20; else if (ac < 4) { score -= 20; warnings.push("AC faible"); }
    if (sum >= 150 && sum <= 300) score += 10; else { score -= 10; warnings.push("Somme hors zone"); }
    if (odd >= 2 && odd <= 3) score += 10; else warnings.push("Déséquilibre P/I");
    
    let verdict = "Standard";
    if (score >= 80) verdict = "Elite";
    else if (score >= 60) verdict = "Solide";
    else if (score < 40) verdict = "Fragile";

    return { score: Math.max(0, Math.min(100, score)), verdict, warnings };
};

export const getStrategyName = (weights: AlgoWeights): string => {
    const entries = Object.entries(weights).sort((a, b) => (b[1] || 0) - (a[1] || 0));
    const top = entries[0];
    if (!top) return "Hybride";
    
    switch (top[0]) {
        case 'spectral': return "Resonance Spectrale";
        case 'frequency': return "Tendance Chaude";
        case 'anti_consensus': return "Contre-Intuitive";
        case 'fractal': return "Fractale";
        case 'markov': return "Markovienne";
        default: return "Adaptive " + top[0];
    }
};
