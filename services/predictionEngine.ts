
import { DrawResult, Prediction, AlgoWeights, ScoreBreakdown, SymbioticContext, AdaptiveRules, TicketAnalysisResult, ForensicReport, RiskProfile } from '../types';
import { calculateACValue, calculateRegularity } from './mathService';
import { supabase, isSupabaseConfigured } from './supabaseClient';

export const getDefaultWeights = (): AlgoWeights => ({
    // Configuration optimisée pour 5/90 Loto Bonheur/Ghana
    frequency: 0.20,
    markov: 0.20,
    gap: 0.15,
    spectral: 0.10,
    poisson: 0.05,
    momentum: 0.10,
    equilibrium: 0.05,
    ai_intuition: 0.0,
    decision_forest: 0.05,
    fractal: 0.05,
    wavelet: 0.0,
    resistance: 0.0,
    spatial: 0.0,
    orchestration: 0.0,
    gap_velocity: 0.05,
    anti_consensus: 0.0
});

export const normalizeWeights = (weights: AlgoWeights): AlgoWeights => {
    let total = 0;
    const cleanWeights: AlgoWeights = {};

    // 1. Sanitization: Zéro pour les négatifs ou NaN
    (Object.keys(weights) as Array<keyof AlgoWeights>).forEach(key => {
        let val = weights[key];
        if (typeof val !== 'number' || isNaN(val) || val < 0) val = 0;
        cleanWeights[key] = val;
        total += val;
    });

    if (total <= 0.0001) return getDefaultWeights();

    // 2. Normalisation
    (Object.keys(cleanWeights) as Array<keyof AlgoWeights>).forEach(key => {
        const val = cleanWeights[key] || 0;
        cleanWeights[key] = parseFloat((val / total).toFixed(4));
    });
    
    return cleanWeights;
};

const applyRiskProfile = (weights: AlgoWeights, profile: RiskProfile): AlgoWeights => {
    const modified = { ...weights };
    console.debug(`[PredictionEngine] Application Profil Risque: ${profile}`);
    
    switch (profile) {
        case 'PRUDENT': // Sécurité : on mise sur ce qui sort souvent et les suites logiques
            modified.frequency = (modified.frequency || 0.20) * 1.8;
            modified.markov = (modified.markov || 0.20) * 1.5;
            modified.equilibrium = (modified.equilibrium || 0.05) * 1.3;
            modified.gap = (modified.gap || 0.15) * 0.3; // On évite les écarts risqués
            modified.anti_consensus = 0;
            break;

        case 'BALANCED': // Équilibré (Mixte)
            modified.frequency = (modified.frequency || 0.20) * 1.1;
            modified.gap = (modified.gap || 0.15) * 1.1;
            modified.spectral = (modified.spectral || 0.10) * 1.1;
            break;

        case 'AUDACIOUS': // Audace : on chasse les écarts et le momentum
            modified.gap = (modified.gap || 0.15) * 2.5;
            modified.momentum = (modified.momentum || 0.10) * 1.8;
            modified.frequency = (modified.frequency || 0.20) * 0.4; // On ignore la fréquence
            break;

        case 'CHAOS': // Chaos : on joue contre la statistique
            modified.anti_consensus = 0.5; // Force brute
            modified.spectral = 0.3;
            modified.frequency = 0;
            modified.markov = 0;
            break;
    }
    
    return normalizeWeights(modified);
};

// Ajustement dynamique des poids selon la météo mathématique du jeu
const adjustWeightsForRegime = (weights: AlgoWeights, regimeInfo?: { regime: string, hurst: number }): AlgoWeights => {
    if (!regimeInfo) return weights;

    const { regime, hurst } = regimeInfo;
    const adjusted = { ...weights };
    
    console.debug(`[PredictionEngine] Adaptation Régime: ${regime} (H=${hurst.toFixed(2)})`);

    if (hurst > 0.6) {
        // Régime Persistant (Tendance suivie)
        adjusted.frequency = (adjusted.frequency || 0) * 1.4;
        adjusted.markov = (adjusted.markov || 0) * 1.4;
        adjusted.momentum = (adjusted.momentum || 0) * 1.3;
        adjusted.equilibrium = (adjusted.equilibrium || 0) * 0.5;
    } else if (hurst < 0.4) {
        // Régime Anti-Persistant (Retour à la moyenne)
        adjusted.gap = (adjusted.gap || 0) * 1.6;
        adjusted.equilibrium = (adjusted.equilibrium || 0) * 1.5;
        adjusted.frequency = (adjusted.frequency || 0) * 0.6;
    } else {
        // Régime Random / Brownien
        adjusted.spectral = (adjusted.spectral || 0) * 1.3;
        adjusted.wavelet = (adjusted.wavelet || 0) * 1.3;
        adjusted.monte_carlo = (adjusted.monte_carlo || 0) * 1.4;
    }

    return normalizeWeights(adjusted);
};

export const getDefaultRules = (): AdaptiveRules => ({
    criticalZoneMin: 12,
    criticalZoneMax: 28
});

export const getAdaptiveRules = (drawName: string): AdaptiveRules => {
    try {
        const raw = localStorage.getItem(`nexus_rules_${drawName}`);
        return raw ? JSON.parse(raw) : getDefaultRules();
    } catch { return getDefaultRules(); }
};

export const saveAdaptiveRules = (drawName: string, rules: AdaptiveRules) => {
    try { localStorage.setItem(`nexus_rules_${drawName}`, JSON.stringify(rules)); } catch {}
};

export const generateMasterPrediction = async (
    drawName: string, 
    history: DrawResult[],
    weightsToUse?: AlgoWeights,
    metrics?: any,
    symbioticContext?: SymbioticContext,
    riskProfile: RiskProfile = 'BALANCED'
): Promise<Prediction> => {
    if (history.length < 10) throw new Error("Dataset insuffisant pour convergence.");

    let weights = normalizeWeights(weightsToUse || await getAlgoWeights(drawName));
    
    // 1. Application du Profil de Risque
    weights = applyRiskProfile(weights, riskProfile);
    
    // 2. Adaptation au Régime Fractal (Hurst)
    if (metrics?.fractal && Array.isArray(metrics.fractal)) {
        // On calcule un Hurst moyen global pour le tirage
        const avgHurst = metrics.fractal.reduce((acc: number, f: any) => acc + (f.hurst || 0.5), 0) / metrics.fractal.length;
        weights = adjustWeightsForRegime(weights, { 
            regime: avgHurst > 0.6 ? 'PERSISTANT' : avgHurst < 0.4 ? 'ANTI-PERSISTANT' : 'RANDOM', 
            hurst: avgHurst 
        });
    }

    // DÉTERMINATION DE LA STRUCTURE DU TICKET BASÉE SUR L'ADN
    const stabilityWeight = (weights.frequency || 0) + (weights.markov || 0) + (weights.equilibrium || 0);
    const chaosWeight = (weights.anti_consensus || 0) + (weights.gap || 0) + (weights.spectral || 0);
    
    let topPickCount = 3;
    let outsiderCount = 2;
    
    if (chaosWeight > stabilityWeight * 1.5) {
        topPickCount = 1; // Stratégie Hyper-Chaos : 1 Top + 4 Outsiders
        outsiderCount = 4;
    } else if (chaosWeight > stabilityWeight) {
        topPickCount = 2; // Stratégie Audacieuse : 2 Top + 3 Outsiders
        outsiderCount = 3;
    } else if (stabilityWeight > chaosWeight * 2) {
        topPickCount = 5; // Stratégie Béton : 5 Top
        outsiderCount = 0;
    }

    const N = 90; // Total numbers
    const sampleSize = Math.min(history.length, 100);
    const recentHistory = history.slice(0, sampleSize);
    const lastDraw = history[0].gagnants;
    
    // --- PRE-CALCULS DE MASSE ---
    const freqMap = new Map<number, number>();
    const gapsMap = new Map<number, number>();
    const lastSeenIndex = new Map<number, number>();
    
    for (let i = 0; i < recentHistory.length; i++) {
        const draw = recentHistory[i];
        for (const n of draw.gagnants) {
            freqMap.set(n, (freqMap.get(n) || 0) + 1);
            if (!lastSeenIndex.has(n)) {
                lastSeenIndex.set(n, i);
                gapsMap.set(n, i);
            }
        }
    }
    // Remplir les jamais vus
    for (let i = 1; i <= N; i++) {
        if (!gapsMap.has(i)) gapsMap.set(i, sampleSize);
    }

    const markovMap = new Map<number, number>();
    if (weights.markov && weights.markov > 0) {
        for (let i = 0; i < recentHistory.length - 1; i++) {
            const current = recentHistory[i].gagnants;
            const prev = recentHistory[i+1].gagnants;
            const common = prev.filter(n => lastDraw.includes(n));
            if (common.length > 0) {
                current.forEach(n => markovMap.set(n, (markovMap.get(n) || 0) + common.length));
            }
        }
    }

    const momentumMap = new Map<number, number>();
    if (weights.momentum && weights.momentum > 0) {
        history.slice(0, 10).forEach(d => {
            d.gagnants.forEach(n => momentumMap.set(n, (momentumMap.get(n) || 0) + 1));
        });
    }

    // --- CALCUL VECTORIEL PAR NUMÉRO ---
    const masterScores = Array.from({ length: N }, (_, i) => {
        const num = i + 1;
        const nBreakdown: ScoreBreakdown = {};
        
        // A. FREQUENCY (Normalisée 0-100)
        const rawFreq = freqMap.get(num) || 0;
        const maxFreq = Math.max(...freqMap.values()) || 1;
        nBreakdown.frequency = (rawFreq / maxFreq) * 100;

        // B. GAP
        const currentGap = gapsMap.get(num) || 0;
        const theoreticalGap = 17; 
        let gapScore = 0;
        if (currentGap < theoreticalGap) gapScore = (currentGap / theoreticalGap) * 50; 
        else if (currentGap < theoreticalGap * 3) gapScore = 50 + ((currentGap - theoreticalGap) / (theoreticalGap * 2)) * 50;
        else gapScore = 90; 
        nBreakdown.gap = gapScore;

        // C. MARKOV
        const rawMarkov = markovMap.get(num) || 0;
        const maxMarkov = Math.max(...markovMap.values()) || 1;
        nBreakdown.markov = maxMarkov > 0 ? (rawMarkov / maxMarkov) * 100 : 0;

        // D. SPECTRAL
        const specMetric = metrics?.spectral?.find((s: any) => s.number === num);
        nBreakdown.spectral = specMetric ? specMetric.energy : 0;

        // E. MOMENTUM
        const rawMom = momentumMap.get(num) || 0;
        nBreakdown.momentum = Math.min(100, rawMom * 25); 

        // F. EQUILIBRIUM
        nBreakdown.equilibrium = 100 - nBreakdown.frequency!;

        // G. ANTI-CONSENSUS
        nBreakdown.anti_consensus = (200 - (nBreakdown.frequency! + nBreakdown.markov!)) / 2;

        // H. POISSON
        const lambda = (rawFreq / sampleSize) * (90/5);
        nBreakdown.poisson = (1 - Math.exp(-lambda)) * 100;

        // I. EXTERNAL INJECTIONS
        nBreakdown.decision_forest = symbioticContext?.forestVotes?.[num] || 0;
        nBreakdown.orchestration = symbioticContext?.orchestrationBoosts?.[num] ? symbioticContext.orchestrationBoosts[num] * 20 : 0;
        nBreakdown.spatial = symbioticContext?.spatialHotZones?.includes(num) ? 80 : 0;
        nBreakdown.fractal = (metrics?.fractal?.find((f:any) => f.number === num)?.hurst || 0.5) * 100;
        nBreakdown.wavelet = (metrics?.wavelet?.find((w:any) => w.number === num)?.energy || 0);

        // --- AGREGATION PONDEREE ---
        let finalScore = 0;
        let totalWeight = 0;

        (Object.keys(weights) as Array<keyof AlgoWeights>).forEach(key => {
            const w = weights[key] || 0;
            const s = (nBreakdown as any)[key] || 0;
            
            if (w > 0) {
                finalScore += s * w;
                totalWeight += w;
            }
        });

        // Bonus Symbiotique (Hors pondération)
        if (nBreakdown.orchestration) finalScore += (nBreakdown.orchestration * 0.15);
        if (nBreakdown.spatial) finalScore += (nBreakdown.spatial * 0.10);

        return { num, score: finalScore, breakdown: nBreakdown };
    });

    const sorted = masterScores.sort((a, b) => b.score - a.score);
    
    // SÉLECTION INFLUENCÉE PAR L'ADN
    const topPicks = sorted.slice(0, topPickCount).map(s => s.num);
    const outsiderPoolStart = topPickCount + 2;
    const outsiderPoolEnd = outsiderCount > 0 ? outsiderPoolStart + 20 : outsiderPoolStart;
    
    const outsiders = sorted
        .slice(outsiderPoolStart, outsiderPoolEnd)
        .sort(() => 0.5 - Math.random()) 
        .slice(0, outsiderCount)
        .map(s => s.num);
        
    const selection = [...topPicks, ...outsiders].sort((a,b) => a-b);

    const dnaDominant = Object.entries(weights).sort((a,b) => b[1]-a[1])[0];
    let dnaType = "Équilibré";
    if (dnaDominant[1] > 0.3) dnaType = `${dnaDominant[0].toUpperCase()} Dominant`;
    
    const structureType = outsiderCount === 0 ? "Logique Pure" : outsiderCount > 2 ? "Chaos Structuré" : "Mixte";

    let analysisText = `ADN Actif : ${dnaType} (${getStrategyName(weights)}). `;
    analysisText += `Structure : ${structureType} (${topPickCount} Top / ${outsiderCount} Outsiders). `;
    analysisText += `Pression dominante: ${dnaDominant[0]} (${(dnaDominant[1]*100).toFixed(0)}%).`;
    
    return {
        suggestedNumbers: selection,
        candidates: sorted.slice(5, 15).map(s => s.num),
        confidence: Math.min(99, Math.round(sorted.slice(0, 5).reduce((a,b) => a + b.score, 0) / 5)),
        analysis: analysisText,
        breakdown: masterScores.reduce((acc, curr) => ({ ...acc, [curr.num]: curr.breakdown }), {}),
        timestamp: Date.now(),
        symbiosisFactor: symbioticContext ? 1.5 : 1.0,
        riskProfile,
        realityAlignment: 0
    };
};

export const getAlgoWeights = async (drawName: string): Promise<AlgoWeights> => {
    if (isSupabaseConfigured() && navigator.onLine) {
        try {
            const { data } = await supabase.from('algo_weights').select('weights').eq('draw_name', drawName).single();
            if (data?.weights) return data.weights;
        } catch (e) { }
    }
    const raw = localStorage.getItem(`nexus_config_${drawName}`);
    return raw ? JSON.parse(raw).weights : getDefaultWeights();
};

export const saveAlgoWeights = async (drawName: string, weights: AlgoWeights) => {
    try {
        localStorage.setItem(`nexus_config_${drawName}`, JSON.stringify({ weights, updatedAt: new Date().toISOString() }));
        if (isSupabaseConfigured()) {
            await supabase.from('algo_weights').upsert({ draw_name: drawName, weights }); 
        }
    } catch (e) {}
};

export const getStrategyName = (weights: AlgoWeights): string => {
    const sorted = Object.entries(weights).sort((a,b) => (Number(b[1]) || 0) - (Number(a[1]) || 0));
    const topAlgo = sorted[0]?.[0] || 'Standard';
    
    const strategies: Record<string, string> = {
        frequency: 'Tendance Pure',
        gap: 'Chasseur d\'Écarts',
        spectral: 'Résonance Cyclique',
        markov: 'Chaîne Logique',
        anti_consensus: 'Contrarian',
        momentum: 'Vélocité',
        equilibrium: 'Retour Moyenne',
        fractal: 'Fractal Pulse'
    };
    
    return strategies[topAlgo] || `Hybride (${topAlgo})`;
};

export const analyzeTicketStrength = async (numbers: number[], _drawName: string): Promise<TicketAnalysisResult> => {
    const ac = calculateACValue(numbers);
    const sum = numbers.reduce((a, b) => a + b, 0);
    const warnings: string[] = [];
    
    if (ac < 7) warnings.push("Complexité Arithmétique faible.");
    if (sum < 120) warnings.push("Somme statistiquement basse.");
    if (sum > 330) warnings.push("Somme statistiquement haute.");
    
    let score = 100;
    if (ac < 7) score -= 20;
    if (ac < 5) score -= 30;
    if (sum < 120 || sum > 330) score -= 15;
    
    const odds = numbers.filter(n => n % 2 !== 0).length;
    if (odds === 0 || odds === 5) score -= 20; 
    
    return { score, verdict: score > 80 ? "Elite" : score > 60 ? "Solide" : "Fragile", warnings };
};

export const calculateCorrectionsFromForensics = (weights: AlgoWeights, rules: AdaptiveRules, report: ForensicReport) => {
    const newWeights = { ...weights };
    const reasoning: string[] = [];
    
    // Learning Rate (Vitesse d'apprentissage)
    const LEARNING_RATE = 0.05; 

    report.scoreDivergence.forEach(div => {
        const key = div.algo.toLowerCase() as keyof AlgoWeights;
        if (newWeights[key] !== undefined) {
            // Impact progressif : On ne saute pas directement, on glisse vers la cible
            // div.impact est entre 0 et 100.
            const impactFactor = div.impact / 100; 
            const boost = LEARNING_RATE * impactFactor; 
            
            const oldVal = Number(newWeights[key]) || 0;
            const newVal = oldVal + boost;
            
            newWeights[key] = parseFloat(newVal.toFixed(4));
            
            if (boost > 0.01) {
                reasoning.push(`Micro-ajustement ${div.algo} (+${(boost*100).toFixed(2)}%).`);
                console.debug(`[Learning] ${key} adjusted: ${oldVal} -> ${newVal} (Impact: ${div.impact})`);
            }
        }
    });
    
    return { newWeights: normalizeWeights(newWeights), newRules: rules, reasoning };
};
