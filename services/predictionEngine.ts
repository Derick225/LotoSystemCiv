
import { DrawResult, Prediction, AlgoWeights, ScoreBreakdown, AdaptiveRules, ForensicReport, TicketAnalysisResult } from '../types';
import { calculateRegularity, calculateACValue, calculateHurstForNumber, calculateGravityField, validateDataIntegrity, calculateWaveletEnergy, calculateTechnicalResistance, calculatePoissonProbability, calculateVolatility, calculateGapTrend, mathService, calculateShannonEntropy } from './mathService';
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
        // Plafond de sécurité à 0.6 par algo pour éviter l'overfitting extrême
        const capped = Math.min(val, total * 0.6);
        normalized[key] = parseFloat((capped / total).toFixed(4));
    });
    return normalized;
};

export const getDefaultWeights = (): AlgoWeights => normalizeWeights({
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
 * Cette fonction regarde l'historique STRICT du tirage concerné pour voir ce qui fonctionne.
 */
const autoCalibrateWeights = (drawName: string, baseWeights: AlgoWeights, history: DrawResult[]): { weights: AlgoWeights, analysis: string } => {
    // Si pas assez d'historique, on retourne les poids par défaut ou manuels
    if (history.length < 20) return { weights: normalizeWeights(baseWeights), analysis: "Données insuffisantes pour calibration." };

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

    // 3. Signature Spectrale & Vélocité Réelle
    // Calcul de la puissance harmonique moyenne
    const spectralMap = mathService.calculateSpectral(history.slice(0, 50));
    const avgEnergy = spectralMap.reduce((acc, s) => acc + s.energy, 0) / (spectralMap.length || 1);
    
    if (avgEnergy > 45) {
        tuned.spectral = (tuned.spectral || 0.10) * 1.6;
        tuned.wavelet = (tuned.wavelet || 0.10) * 1.4;
        reportParts.push("Résonance Harmonique -> Boost Spectral");
    }

    // Analyse de la vélocité des écarts
    const gapTrend = calculateGapTrend(history);
    if (gapTrend.trend === 'ACCELERATING') {
        tuned.gap_velocity = (tuned.gap_velocity || 0.05) * 2.0;
        tuned.gap = (tuned.gap || 0.10) * 0.8; // On joue l'accélération, pas l'écart brut
        reportParts.push("Compression des Écarts -> Boost Vélocité");
    }

    // 4. Entropie pour Intuition IA
    const entropy = calculateShannonEntropy(history.slice(0, 50));
    if (entropy.normalized > 0.92) {
        // Système très aléatoire, on fait confiance à l'intuition IA (Pattern recognition profond)
        tuned.ai_intuition = (tuned.ai_intuition || 0.01) * 3.0;
        reportParts.push("Entropie Max -> Boost Intuition IA");
    }
    
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
    
    // Si aucun poids personnalisé n'est fourni, on tente l'auto-calibration
    const { weights: optimizedWeights, analysis: tuningAnalysis } = weightsToUse 
        ? { weights: normalizeWeights(weightsToUse), analysis: "Mode Manuel" }
        : autoCalibrateWeights(drawName, baseWeights, history);
    
    // 2. Calcul des Indicateurs Techniques (Scope: Ce tirage uniquement)
    const volatility = calculateVolatility(history);
    const regularity = calculateRegularity(history);
    const spectralMap = extraMetrics?.spectral || mathService.calculateSpectral(history.slice(0, 100));
    const fractalMap = extraMetrics?.fractal || mathService.calculateFractal(history.slice(0, 100));
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
            gap_velocity: gapTrend.trend !== 'STABLE' ? 80 : 40,
            anti_consensus: antiConsensusScore,
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

export const calculateCorrectionsFromForensics = (
    currentWeights: AlgoWeights,
    currentRules: AdaptiveRules,
    report: ForensicReport
): { newWeights: AlgoWeights, newRules: AdaptiveRules, reasoning: string[] } => {
    let newWeights = { ...currentWeights };
    const reasoning: string[] = ["Adaptation balistique post-tirage."];

    report.scoreDivergence.forEach(div => {
        const key = div.algo.toLowerCase() as keyof AlgoWeights;
        // On renforce les algos qui avaient vu juste (impact fort)
        if (div.impact > 70 && newWeights[key] !== undefined) {
            // Incrément prudent (+2%) avant renormalisation
            newWeights[key] = (Number(newWeights[key]) || 0) + 0.02;
            reasoning.push(`Renforcement de ${div.algo} (+2%).`);
        }
    });
    
    const hits = report.matches.filter(m => m.errorType === 'Hit').length;
    if (hits === 0) {
        newWeights.anti_consensus = Math.min(0.3, (newWeights.anti_consensus || 0) + 0.05);
        newWeights.equilibrium = Math.min(0.3, (newWeights.equilibrium || 0) + 0.05);
        reasoning.push("Renforcement Anti-Consensus & Équilibre suite échec total.");
    }

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
    
    // Ajout d'analyse de parité
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
    // Détection heuristique de la stratégie dominante
    if ((w.frequency || 0) > 0.25) return "Domination Fréquence";
    if ((w.spectral || 0) > 0.25) return "Résonance Harmonique";
    if ((w.markov || 0) > 0.25) return "Transition de Phase";
    if ((w.gap || 0) > 0.25) return "Sniper d'Écarts";
    if ((w.anti_consensus || 0) > 0.15) return "Contre-Intuitive";
    
    // Si pas de dominance claire
    return "Consensus Nexus";
};
