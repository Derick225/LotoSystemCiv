
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
    anti_consensus: 0.05 // NOUVEAU : Poids Contre-Intuitif
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
 * Applique des ajustements spécifiques basés sur le NOM du tirage et ses tendances connues.
 */
const applyDrawSpecificTuning = (drawName: string, weights: AlgoWeights): AlgoWeights => {
    const tuned = { ...weights };
    const name = drawName.toUpperCase();

    // Monday Special : Tendance à la répétition et aux cycles courts
    if (name.includes('MONDAY') || name.includes('SPECIAL')) {
        tuned.gap_velocity = Math.max(0.15, (tuned.gap_velocity || 0) * 2.0);
        tuned.poisson = Math.max(0.12, (tuned.poisson || 0) * 1.5);
        tuned.equilibrium = (tuned.equilibrium || 0) * 0.5; 
        tuned.anti_consensus = (tuned.anti_consensus || 0) * 1.5; // Favorise les surprises
    }
    // National / Diamant : Tirages très "Mathématiques" et stables
    else if (name.includes('NATIONAL') || name.includes('DIAMANT')) {
        tuned.spectral = Math.max(0.15, (tuned.spectral || 0) * 1.5);
        tuned.resistance = Math.max(0.10, (tuned.resistance || 0) * 1.5);
    }
    // Bonanza : Tendance chaotique forte
    else if (name.includes('BONANZA')) {
        tuned.ai_intuition = Math.max(0.15, (tuned.ai_intuition || 0) * 2.0);
        tuned.spatial = Math.max(0.15, (tuned.spatial || 0) * 1.5);
        tuned.anti_consensus = Math.max(0.15, (tuned.anti_consensus || 0) * 2.5); // Chaos maximum
    }

    return normalizeWeights(tuned);
};

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
 * Moteur Harmonique : Ajuste les poids selon la "Musique" (Vélocité des écarts)
 */
const adjustWeightsToGapTrend = (weights: AlgoWeights, history: DrawResult[]): { weights: AlgoWeights, trendLabel: string } => {
    const analysis = calculateGapTrend(history);
    const adjusted = { ...weights };
    let label = "Stable (Neutre)";

    if (analysis.trend === 'ACCELERATING') {
        label = "Accelerando (Compression)";
        // Le jeu accélère : il faut jouer les numéros chauds
        adjusted.frequency = (adjusted.frequency || 0) * 1.6;
        adjusted.momentum = (adjusted.momentum || 0) * 1.5;
        adjusted.markov = (adjusted.markov || 0) * 1.3;
        adjusted.gap = (adjusted.gap || 0) * 0.5; // On réduit l'importance des écarts froids
        adjusted.resistance = (adjusted.resistance || 0) * 0.6;
    } else if (analysis.trend === 'DECELERATING') {
        label = "Rallentando (Expansion)";
        // Le jeu ralentit : les écarts s'agrandissent, chercher les numéros froids
        adjusted.gap = (adjusted.gap || 0) * 1.7;
        adjusted.resistance = (adjusted.resistance || 0) * 1.5;
        adjusted.anti_consensus = (adjusted.anti_consensus || 0) * 1.4;
        adjusted.frequency = (adjusted.frequency || 0) * 0.6;
        adjusted.momentum = (adjusted.momentum || 0) * 0.5;
    }

    return { weights: normalizeWeights(adjusted), trendLabel: label };
};

/**
 * Calibre dynamiquement les poids en fonction du Régime Fractal (Hurst) ET du tirage.
 */
const adjustWeightsToRegime = (drawName: string, baseWeights: AlgoWeights, history: DrawResult[]): { weights: AlgoWeights, regimeLabel: string } => {
    let totalHurst = 0;
    for (let i = 0; i < Math.min(5, history.length); i++) {
        const draw = history[i];
        if(draw && draw.gagnants.length > 0) {
             totalHurst += calculateHurstForNumber(draw.gagnants[0], history).hurst;
        }
    }
    const avgHurst = totalHurst / 5;

    // 1. Ajustement Spécifique au Jeu (Monday, Bonanza, etc.)
    let adjusted = applyDrawSpecificTuning(drawName, baseWeights);

    // 2. Ajustement Fractal Global
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
        adjusted.anti_consensus = (adjusted.anti_consensus || 0) * 1.4; // En retour à la moyenne, les favoris chutent
    } else {
        label = "Chaos (Aléatoire)";
        adjusted.spatial = (adjusted.spatial || 0) * 1.5;
        adjusted.resistance = (adjusted.resistance || 0) * 1.4; 
        adjusted.poisson = (adjusted.poisson || 0) * 1.8;
        adjusted.anti_consensus = (adjusted.anti_consensus || 0) * 2.0; // En chaos, les favoris sont imprévisibles
    }

    // 3. Ajustement Harmonique (Musique des écarts)
    const gapAnalysis = adjustWeightsToGapTrend(adjusted, history);
    adjusted = gapAnalysis.weights;
    // On combine les labels pour le rapport
    const combinedLabel = `${label} / ${gapAnalysis.trendLabel}`;

    return { weights: normalizeWeights(adjusted), regimeLabel: combinedLabel };
};

/**
 * CALCULATEUR D'ADN (NOUVEAU)
 */
export const calculateOptimalWeights = (history: DrawResult[]): AlgoWeights => {
    if (history.length < 30) return getDefaultWeights();

    const scoresSum: AlgoWeights = { ...getDefaultWeights() };
    const keys = Object.keys(scoresSum) as Array<keyof AlgoWeights>;
    keys.forEach(k => scoresSum[k] = 0);

    const analysisWindow = Math.min(history.length - 1, 50);
    
    for (let i = 0; i < analysisWindow; i++) {
        const targetDraw = history[i]; 
        const pastContext = history.slice(i + 1); 
        
        if (pastContext.length < 20) break;

        const regularity = calculateRegularity(pastContext);
        const gravityField = calculateGravityField(pastContext);
        
        targetDraw.gagnants.forEach(winner => {
            const reg = regularity.find(r => r.number === winner);
            
            const freq = pastContext.slice(0, 20).filter(h => h.gagnants.includes(winner)).length;
            if (freq >= 3) scoresSum.frequency = (scoresSum.frequency || 0) + 1;

            // Détection si c'était un "Anti-Favori" (0 sortie récente sur 12 tirages)
            const recFreq = pastContext.slice(0, 12).filter(h => h.gagnants.includes(winner)).length;
            if (recFreq === 0) scoresSum.anti_consensus = (scoresSum.anti_consensus || 0) + 1;

            if (reg && reg.currentGap >= 8 && reg.currentGap <= 18) {
                scoresSum.gap = (scoresSum.gap || 0) + 1;
            }

            if ((gravityField[winner] || 0) > 1.5) {
                scoresSum.spatial = (scoresSum.spatial || 0) + 1;
            }

            if (pastContext.length > 0) {
                if (pastContext.slice(0,5).some(d => d.gagnants.includes(winner))) {
                     scoresSum.markov = (scoresSum.markov || 0) + 1;
                }
            }
            
            const lambda = (freq / 20) * 18; 
            const poissonP = calculatePoissonProbability(lambda, reg?.currentGap || 0);
            if (poissonP > 60) scoresSum.poisson = (scoresSum.poisson || 0) + 1;
            
            const resScore = calculateTechnicalResistance(winner, pastContext);
            if (resScore > 50) scoresSum.resistance = (scoresSum.resistance || 0) + 1;
        });
    }

    const totalScore = Object.values(scoresSum).reduce((a, b) => a + (b || 0), 0);
    const optimizedWeights = { ...getDefaultWeights() }; 
    
    if (totalScore > 0) {
        keys.forEach(k => {
            const raw = scoresSum[k] || 0;
            const historicalWeight = raw / totalScore;
            optimizedWeights[k] = (optimizedWeights[k]! * 0.4) + (historicalWeight * 0.6);
        });
    }
    
    return normalizeWeights(optimizedWeights);
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
    // Ajustement contextuel complet (Draw Name + Hurst + Gap Trend)
    const { weights: dynamicWeights, regimeLabel } = adjustWeightsToRegime(drawName, weights, history);
    weights = dynamicWeights;

    const regularity = calculateRegularity(history);
    const spectralMap = extraMetrics?.spectral || [];
    const fractalMap = extraMetrics?.fractal || [];
    const gravityField = calculateGravityField(history);
    const gapTrend = calculateGapTrend(history); // Pour l'analyse individuelle
    
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
        const avgGap = reg?.avgGap || 15;
        
        let gapScore = (currentGap >= 8 && currentGap <= 18) ? 100 : (currentGap > 30 ? 60 : 20);
        if (currentGap > 60) gapScore = 5; 

        // Modulation Harmonique Individuelle
        // Si le jeu accélère (Gap Trend Neg), on favorise les petits écarts
        if (gapTrend.trend === 'ACCELERATING') {
            if (currentGap < 10) gapScore += 40;
            else if (currentGap > 20) gapScore -= 30;
        } 
        // Si le jeu ralentit (Gap Trend Pos), on favorise les gros écarts
        else if (gapTrend.trend === 'DECELERATING') {
            if (currentGap > 20) gapScore += 40;
            else if (currentGap < 5) gapScore -= 20;
        }

        // Anti-Consensus Scoring : "Pas toujours les favoris"
        // Si le numéro est très fréquent récemment (top favori), on le pénalise dans ce score.
        // Si le numéro est "caché" (froid récemment) mais pas mort, on le valorise.
        const recentFreq = history.slice(0, 12).filter(h => h.gagnants.includes(num)).length;
        let antiConsensusScore = 0;
        if (recentFreq === 0) antiConsensusScore = 100; // Froid sur 12 tours = Potentiel surprise
        else if (recentFreq === 1) antiConsensusScore = 60;
        else if (recentFreq === 2) antiConsensusScore = 30;
        else antiConsensusScore = 0; // Trop chaud = 0 point pour l'anti-consensus

        const gapRatio = avgGap > 0 ? currentGap / avgGap : 0;
        let gapVelocity = 0;
        if (gapRatio >= 0.8 && gapRatio <= 1.2) gapVelocity = 100; 
        else if (gapRatio > 1.2) gapVelocity = Math.max(0, 100 - (gapRatio - 1.2) * 50); 
        else gapVelocity = gapRatio * 80; 

        const specScore = spec?.energy || 0;
        const markovScore = Math.min(100, (transitions[num] || 0) * 10);
        const spatialScore = Math.min(100, gravity * 50);
        const waveletScore = calculateWaveletEnergy(signal);
        const resistScore = calculateTechnicalResistance(num, history);
        
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
            poisson: poissonVal,
            gap_velocity: gapVelocity,
            anti_consensus: antiConsensusScore // Injection du score Anti-Favori
        };

        breakdown[num] = nBreakdown;

        let rawScore = 0;
        Object.entries(weights).forEach(([key, weight]) => {
            const val = (nBreakdown as any)[key] || 0;
            rawScore += val * (weight as number);
        });

        const finalScore = sigmoid(rawScore) * 100;

        return { num, score: finalScore };
    });

    const sorted = scores.sort((a, b) => b.score - a.score);
    const suggested = sorted.slice(0, 5).map(s => s.num);
    const zScore = calculatePredictionZScore(suggested);
    const isOutlier = Math.abs(zScore) > 2.5;

    const topScoreAvg = (sorted[0].score + sorted[1].score + sorted[2].score) / 3;
    let baseConfidence = Math.min(99, Math.round(topScoreAvg));
    if (integrity.score < 80) baseConfidence *= 0.8;
    if (volatility.score > 70) baseConfidence *= 0.9;

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

export const calculateCorrectionsFromForensics = (weights: AlgoWeights, rules: AdaptiveRules, report: ForensicReport) => {
    const hits = report.matches.filter(m => m.errorType === 'Hit').length;
    const proximity = report.matches.filter(m => ['Voisin', 'Miroir'].includes(m.errorType)).length;
    
    const newWeights = { ...weights };
    const reasoning = [];

    const velocityMiss = report.missedOpportunities.length > 3;

    if (hits === 0 && proximity > 0) {
        newWeights.orchestration = Math.min(0.2, (newWeights.orchestration || 0) + 0.02);
        newWeights.spatial = Math.min(0.15, (newWeights.spatial || 0) + 0.02);
        reasoning.push("Augmentation du neurone Orchestration (Détection de frôlements)");
    } else if (hits >= 2) {
        reasoning.push("ADN validé. Renforcement des paramètres actuels.");
    } else if (velocityMiss) {
        newWeights.gap_velocity = Math.min(0.2, (newWeights.gap_velocity || 0) + 0.03);
        newWeights.poisson = Math.min(0.2, (newWeights.poisson || 0) + 0.02);
        reasoning.push("Renforcement Vélocité & Poisson suite à une rupture de cycle.");
    } else {
        // Echec majeur : Peut-être un tirage "Surprise" (Anti-Consensus)
        newWeights.anti_consensus = Math.min(0.3, (newWeights.anti_consensus || 0) + 0.05);
        newWeights.frequency = Math.max(0.05, (newWeights.frequency || 0) * 0.8);
        reasoning.push("Echec du Consensus. Bascule vers stratégie Anti-Favori (Black Swan).");
    }

    return {
        newWeights: normalizeWeights(newWeights),
        newRules: { ...rules },
        reasoning
    };
};

/**
 * Analyse la structure d'un ticket et retourne un score de qualité (0-100)
 */
export const analyzeTicketStrength = async (numbers: number[], _drawName: string): Promise<TicketAnalysisResult> => {
    const ac = calculateACValue(numbers);
    const sum = numbers.reduce((a, b) => a + b, 0);
    const odd = numbers.filter(n => n % 2 !== 0).length;
    
    let score = 50;
    const warnings: string[] = [];

    // AC Value logic
    if (ac >= 7) score += 20;
    else if (ac < 4) { score -= 20; warnings.push("Complexité AC trop faible"); }

    // Sum logic
    if (sum >= 150 && sum <= 300) score += 10;
    else { score -= 10; warnings.push("Somme hors zone statistique (150-300)"); }

    // Parity
    if (odd >= 2 && odd <= 3) score += 10;
    else warnings.push("Déséquilibre Pair/Impair");

    let verdict = "Standard";
    if (score >= 80) verdict = "Elite";
    else if (score >= 60) verdict = "Solide";
    else if (score < 40) verdict = "Fragile";

    return { score: Math.max(0, Math.min(100, score)), verdict, warnings };
};

export const getStrategyName = (weights: AlgoWeights): string => {
    // Simple heuristic to name the strategy based on dominant weights
    const entries = Object.entries(weights).sort((a, b) => (b[1] || 0) - (a[1] || 0));
    const top = entries[0];
    if (!top) return "Standard";
    
    switch (top[0]) {
        case 'spectral': return "Spectral Resonance";
        case 'gap_velocity': return "Velocity Break";
        case 'frequency': return "Frequentist";
        case 'equilibrium': return "Mean Reversion";
        case 'ai_intuition': return "AI Intuition";
        case 'fractal': return "Fractal Analysis";
        case 'spatial': return "Spatial Gravity";
        case 'anti_consensus': return "Contrarian (Black Swan)"; // NOUVEAU
        default: return "Adaptive Hybrid";
    }
};