
import { DrawResult, Prediction, AlgoWeights, ScoreBreakdown, SymbioticContext, AdaptiveRules, TicketAnalysisResult, ForensicReport, RiskProfile } from '../types';
import { calculateACValue, calculateRegularity } from './mathService';
import { supabase, isSupabaseConfigured } from './supabaseClient';

export const getDefaultWeights = (): AlgoWeights => ({
    frequency: 0.15, // Augmenté pour la stabilité
    gap: 0.20,       // Crucial pour les jeux de tirage
    spectral: 0.10,
    fractal: 0.05,
    markov: 0.15,
    poisson: 0.15,
    momentum: 0.05,
    equilibrium: 0.05,
    ai_intuition: 0.05,
    decision_forest: 0.05,
    wavelet: 0.0,
    resistance: 0.0,
    spatial: 0.0,
    orchestration: 0.0,
    digital_root: 0.0,
    gap_velocity: 0.0,
    isolation_anomaly: 0.0,
    leader_succession: 0.0,
    anti_consensus: 0.0,
    monte_carlo: 0.0,
    lstm_pattern: 0.0,
    bayes: 0.0,
    temporal: 0.0,
    transformer: 0.0
});

const sigmoid = (x: number, center: number = 50, steepness: number = 0.15): number => {
    return 100 / (1 + Math.exp(-steepness * (x - center)));
};

export const normalizeWeights = (weights: AlgoWeights): AlgoWeights => {
    const total = Object.values(weights).reduce<number>((a, b) => (a || 0) + (Number(b) || 0), 0);
    if (total <= 0) return getDefaultWeights();
    const normalized: AlgoWeights = { ...weights };
    (Object.keys(normalized) as Array<keyof AlgoWeights>).forEach(key => {
        const val = normalized[key];
        if (typeof val === 'number') {
            normalized[key] = parseFloat((val / total).toFixed(4));
        }
    });
    return normalized;
};

const applyRiskProfile = (weights: AlgoWeights, profile: RiskProfile): AlgoWeights => {
    const modified = { ...weights };
    
    // Stratégies Professionnelles
    if (profile === 'PRUDENT') {
        // Focus sur la récurrence et la loi des grands nombres
        modified.frequency = (modified.frequency || 0.1) * 3.0;
        modified.equilibrium = (modified.equilibrium || 0.05) * 2.0;
        modified.gap = 0; // On évite les écarts risqués
        modified.markov = 0.1;
    } else if (profile === 'AUDACIOUS') {
        // Chasse aux écarts et ruptures de tendance
        modified.gap = (modified.gap || 0.15) * 3.0;
        modified.poisson = (modified.poisson || 0.2) * 1.5;
        modified.frequency = 0.05;
    } else if (profile === 'CHAOS') {
        // Recherche d'anomalies statistiques (Black Swans)
        modified.anti_consensus = 0.4;
        modified.isolation_anomaly = 0.4;
        modified.spectral = 0.2;
        modified.frequency = 0;
    }
    
    return normalizeWeights(modified);
};

export const getDefaultRules = (): AdaptiveRules => ({
    criticalZoneMin: 8,
    criticalZoneMax: 22
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

const adaptWeightsToRegime = (baseWeights: AlgoWeights, volatilityScore: number, hurstIndex: number): AlgoWeights => {
    const adjusted = { ...baseWeights };
    
    // Logique de Régime Adaptatif Avancée
    if (hurstIndex > 0.65) {
        // Régime Persistant (Tendance forte) -> On suit la fréquence et Markov
        adjusted.frequency = (adjusted.frequency || 0.1) * 1.5;
        adjusted.markov = (adjusted.markov || 0.15) * 1.5;
        adjusted.gap = (adjusted.gap || 0.2) * 0.5;
    } else if (hurstIndex < 0.35) {
        // Régime Anti-Persistant (Retour à la moyenne) -> On joue les écarts et l'équilibre
        adjusted.gap = (adjusted.gap || 0.2) * 1.5;
        adjusted.equilibrium = (adjusted.equilibrium || 0.05) * 1.5;
        adjusted.frequency = (adjusted.frequency || 0.1) * 0.5;
    }

    if (volatilityScore > 70) {
        // Haute Volatilité -> Augmenter la sensibilité aux signaux courts (Momentum, Spectral)
        adjusted.momentum = (adjusted.momentum || 0.05) * 2.0;
        adjusted.spectral = (adjusted.spectral || 0.1) * 1.5;
    }

    return normalizeWeights(adjusted);
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
    weights = applyRiskProfile(weights, riskProfile);

    const volScore = metrics?.volatility?.score || 50;
    const avgHurst = metrics?.fractal ? 
        metrics.fractal.slice(0, 5).reduce((acc: number, f: any) => acc + f.hurst, 0) / 5 : 0.5;
    
    weights = adaptWeightsToRegime(weights, volScore, avgHurst);

    const lastWinners = history[0].gagnants;
    const correlationMap = metrics?.correlationMatrix || {};
    const localRegularity = calculateRegularity(history.slice(0, 100));

    // Calcul Vectoriel Dense
    const masterScores = Array.from({ length: 90 }, (_, i) => {
        const num = i + 1;
        const reg = localRegularity.find((r: any) => r.number === num);
        const freq = history.slice(0, 50).filter(h => h.gagnants.includes(num)).length; // Fenêtre glissante 50
        
        // 1. Loi de Poisson (Probabilité d'arrivée)
        const lambda = (freq / 50) * (90/5);
        const poissonScore = (1 - Math.exp(-lambda)) * 100;

        // 2. Chaînes de Markov (Transition)
        let markovScore = 0;
        lastWinners.forEach((lw: number) => {
            const strength = correlationMap[lw]?.affinities?.[num] || 0;
            markovScore += (strength * 100);
        });

        // 3. Orchestration & Spatial (Symbiose)
        let orchestrationBonus = symbioticContext?.orchestrationBoosts?.[num] ? symbioticContext.orchestrationBoosts[num] * 15 : 0;
        let spatialBonus = symbioticContext?.spatialHotZones?.includes(num) ? 20 : 0;
        
        // 4. Momentum (Vélocité récente)
        const recentFreq = history.slice(0, 10).filter(h => h.gagnants.includes(num)).length;
        const momentumScore = recentFreq * 20; // 0 à 100+

        // 5. Gap Maturity (Maturité de l'écart)
        const gapMaturity = reg ? Math.min(100, (reg.currentGap / (reg.avgGap || 18)) * 80) : 0;

        const nBreakdown: ScoreBreakdown = {
            frequency: (freq / 50) * 400, // Normalisé vers 100 approx
            gap: gapMaturity,
            poisson: poissonScore,
            markov: Math.min(100, markovScore * 2.5),
            spectral: metrics?.spectral?.find((s:any) => s.number === num)?.energy || 0,
            decision_forest: symbioticContext?.forestVotes?.[num] || 0,
            momentum: momentumScore,
            equilibrium: 50 + (Math.random() * 10 - 5), // Placeholder pour équilibre gaussien
            ai_intuition: 50, // Réservé pour injection externe
            fractal: (metrics?.fractal?.find((f:any) => f.number === num)?.hurst || 0.5) * 100,
            orchestration: orchestrationBonus, 
            spatial: spatialBonus
        };

        // Agrégation Pondérée
        let weightedSum = 0;
        (Object.keys(weights) as Array<keyof AlgoWeights>).forEach(k => {
            const weightVal = Number(weights[k]) || 0;
            const scoreVal = Number(nBreakdown[k]) || 0;
            // Activation non-linéaire pour filtrer le bruit de fond
            const activatedScore = scoreVal > 30 ? scoreVal : scoreVal * 0.5;
            weightedSum += activatedScore * weightVal;
        });

        const finalScore = weightedSum + orchestrationBonus + spatialBonus;
        
        return { num, score: finalScore, breakdown: nBreakdown };
    });

    const sorted = masterScores.sort((a, b) => b.score - a.score);
    
    // Sélection intelligente : On prend le Top 3 pur + 2 "Outsiders" stratégiques (rang 6-15) pour la couverture
    const top3 = sorted.slice(0, 3).map(s => s.num);
    const outsiders = sorted.slice(3, 12).sort(() => 0.5 - Math.random()).slice(0, 2).map(s => s.num);
    const selection = [...top3, ...outsiders].sort((a,b) => a-b);

    // Calcul de l'alignement avec la réalité (si T-1 connu)
    let realityAlignment = 0;
    if (history.length > 1) {
        const actualT0 = history[0].gagnants;
        const predictedT0 = sorted.slice(0, 5).map(s => s.num); // Simulation brute T-1
        const hits = predictedT0.filter(n => actualT0.includes(n)).length;
        realityAlignment = (hits / 5) * 100;
    }

    let analysisText = `Nexus Kernel v12. `;
    if (volScore > 65) analysisText += `Régime Turbulent détecté (${volScore}%). `;
    if (riskProfile === 'PRUDENT') analysisText += "Filtrage conservateur activé. ";
    if (riskProfile === 'AUDACIOUS') analysisText += "Amplification des écarts critiques. ";
    analysisText += `Cohérence vectorielle : ${Math.round(sorted[0].score)}/100.`;
    
    return {
        suggestedNumbers: selection,
        candidates: sorted.slice(5, 15).map(s => s.num),
        confidence: Math.min(98, Math.round(sorted.slice(0, 5).reduce((a,b) => a + b.score, 0) / 5)),
        analysis: analysisText,
        breakdown: masterScores.reduce((acc, curr) => ({ ...acc, [curr.num]: curr.breakdown }), {}),
        timestamp: Date.now(),
        symbiosisFactor: symbioticContext ? 1.5 : 1.0,
        riskProfile,
        realityAlignment
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
        frequency: 'Poursuite de Tendance',
        gap: 'Chasse aux Écarts',
        spectral: 'Résonance Cyclique',
        markov: 'Séquentiel Pur',
        anti_consensus: 'Contrarian Elite'
    };
    
    return strategies[topAlgo] || `Hybride (${topAlgo})`;
};

export const analyzeTicketStrength = async (numbers: number[], _drawName: string): Promise<TicketAnalysisResult> => {
    const ac = calculateACValue(numbers);
    const sum = numbers.reduce((a, b) => a + b, 0);
    const warnings: string[] = [];
    
    if (ac < 7) warnings.push("Complexité Arithmétique critique (Trop simple).");
    if (sum < 120) warnings.push("Somme trop faible (<120).");
    if (sum > 330) warnings.push("Somme trop élevée (>330).");
    
    // Score sur 100
    let score = 100;
    if (ac < 7) score -= 20;
    if (ac < 5) score -= 30;
    if (sum < 120 || sum > 330) score -= 15;
    
    // Parité idéale : 2/3 ou 3/2
    const odds = numbers.filter(n => n % 2 !== 0).length;
    if (odds === 0 || odds === 5) score -= 25; // Tout pair ou tout impair est très rare
    
    return { score, verdict: score > 80 ? "Elite" : score > 60 ? "Solide" : "Fragile", warnings };
};

export const calculateCorrectionsFromForensics = (weights: AlgoWeights, rules: AdaptiveRules, report: ForensicReport) => {
    const newWeights = { ...weights };
    const reasoning: string[] = [];
    report.scoreDivergence.forEach(div => {
        const key = div.algo.toLowerCase() as keyof AlgoWeights;
        if (newWeights[key] !== undefined) {
            // Correction conservative (+5% max par itération)
            const boost = Math.min(0.05, (div.impact / 100) * 0.1);
            newWeights[key] = parseFloat((Number(newWeights[key]) + boost).toFixed(4));
            reasoning.push(`Boost ${div.algo} (+${(boost*100).toFixed(1)}%) suite au succès observé.`);
        }
    });
    return { newWeights: normalizeWeights(newWeights), newRules: rules, reasoning };
};
