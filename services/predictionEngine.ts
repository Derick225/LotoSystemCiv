
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
    
    if (profile === 'PRUDENT') {
        // Sécurité : on mise sur ce qui sort souvent et les suites logiques
        modified.frequency = (modified.frequency || 0.20) * 1.5;
        modified.markov = (modified.markov || 0.20) * 1.5;
        modified.gap = 0.05; 
        modified.anti_consensus = 0;
    } else if (profile === 'AUDACIOUS') {
        // Audace : on chasse les écarts et le momentum
        modified.gap = (modified.gap || 0.15) * 2.0;
        modified.momentum = (modified.momentum || 0.10) * 1.5;
        modified.frequency = 0.1;
    } else if (profile === 'CHAOS') {
        // Chaos : on joue contre la statistique (Anti-Consensus)
        modified.anti_consensus = 0.4;
        modified.spectral = 0.3;
        modified.frequency = 0;
        modified.markov = 0;
    }
    
    return normalizeWeights(modified);
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
    weights = applyRiskProfile(weights, riskProfile);

    const N = 90; // Total numbers
    const sampleSize = Math.min(history.length, 100);
    const recentHistory = history.slice(0, sampleSize);
    const lastDraw = history[0].gagnants;
    
    // --- PRE-CALCULS DE MASSE ---
    
    // 1. Fréquence & Ecarts (Optimisé)
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

    // 2. Markov (Transition T-1 -> T)
    // On calcule la probabilité qu'un numéro suive les numéros du dernier tirage
    const markovMap = new Map<number, number>();
    if (weights.markov && weights.markov > 0) {
        for (let i = 0; i < recentHistory.length - 1; i++) {
            const current = recentHistory[i].gagnants;
            const prev = recentHistory[i+1].gagnants;
            
            // Si le tirage précédent contient au moins un numéro du dernier tirage réel
            const common = prev.filter(n => lastDraw.includes(n));
            if (common.length > 0) {
                // On booste les numéros qui ont suivi
                current.forEach(n => markovMap.set(n, (markovMap.get(n) || 0) + common.length));
            }
        }
    }

    // 3. Momentum (10 derniers tirages)
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

        // B. GAP (Ratio Ecart Actuel / Ecart Moyen Théorique)
        const currentGap = gapsMap.get(num) || 0;
        // Théorie : proba 5/90 => Ecart moyen ~17
        const theoreticalGap = 17; 
        // Score non-linéaire : favorise les écarts proches de la moyenne ou critiques (>2x moyenne)
        let gapScore = 0;
        if (currentGap < theoreticalGap) gapScore = (currentGap / theoreticalGap) * 50; // Monte doucement
        else if (currentGap < theoreticalGap * 3) gapScore = 50 + ((currentGap - theoreticalGap) / (theoreticalGap * 2)) * 50; // Monte fort
        else gapScore = 90; // Saturation critique
        nBreakdown.gap = gapScore;

        // C. MARKOV (Puissance associative)
        const rawMarkov = markovMap.get(num) || 0;
        const maxMarkov = Math.max(...markovMap.values()) || 1;
        nBreakdown.markov = (rawMarkov / maxMarkov) * 100;

        // D. SPECTRAL (Données externes HPC)
        const specMetric = metrics?.spectral?.find((s: any) => s.number === num);
        nBreakdown.spectral = specMetric ? specMetric.energy : 0;

        // E. MOMENTUM (Vélocité court terme)
        const rawMom = momentumMap.get(num) || 0;
        nBreakdown.momentum = Math.min(100, rawMom * 25); // 4 sorties en 10 tirages = 100%

        // F. EQUILIBRIUM (Retour à la moyenne)
        // Si freq est basse, equilibrium est haut
        nBreakdown.equilibrium = 100 - nBreakdown.frequency!;

        // G. ANTI-CONSENSUS (Rareté absolue)
        // Poids fort si le numéro a peu de fréquence ET peu de markov (l'outsider)
        nBreakdown.anti_consensus = (200 - (nBreakdown.frequency! + nBreakdown.markov!)) / 2;

        // H. POISSON (Probabilité pure)
        const lambda = (rawFreq / sampleSize) * (90/5);
        nBreakdown.poisson = (1 - Math.exp(-lambda)) * 100;

        // I. EXTERNAL INJECTIONS (Symbiose)
        nBreakdown.decision_forest = symbioticContext?.forestVotes?.[num] || 0;
        nBreakdown.orchestration = symbioticContext?.orchestrationBoosts?.[num] ? symbioticContext.orchestrationBoosts[num] * 20 : 0;
        nBreakdown.spatial = symbioticContext?.spatialHotZones?.includes(num) ? 80 : 0;
        nBreakdown.fractal = (metrics?.fractal?.find((f:any) => f.number === num)?.hurst || 0.5) * 100;

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

        // Bonus Symbiotique (Hors pondération standard pour influencer)
        if (nBreakdown.orchestration) finalScore += (nBreakdown.orchestration * 0.15);
        if (nBreakdown.spatial) finalScore += (nBreakdown.spatial * 0.10);

        return { num, score: finalScore, breakdown: nBreakdown };
    });

    const sorted = masterScores.sort((a, b) => b.score - a.score);
    
    // Sélection intelligente : Top 3 + 2 Outsiders du Top 10-20 (pour éviter le sur-ajustement)
    const top3 = sorted.slice(0, 3).map(s => s.num);
    const outsiders = sorted.slice(3, 12).sort(() => 0.5 - Math.random()).slice(0, 2).map(s => s.num);
    const selection = [...top3, ...outsiders].sort((a,b) => a-b);

    let analysisText = `Moteur Nexus v12 opérationnel. `;
    analysisText += `Profil : ${riskProfile}. `;
    analysisText += `Dominante : ${Object.entries(weights).sort((a,b) => b[1]-a[1])[0][0].toUpperCase()}. `;
    analysisText += `Confiance calculée : ${Math.round(sorted[0].score)}/100.`;
    
    return {
        suggestedNumbers: selection,
        candidates: sorted.slice(5, 15).map(s => s.num),
        confidence: Math.min(99, Math.round(sorted.slice(0, 5).reduce((a,b) => a + b.score, 0) / 5)),
        analysis: analysisText,
        breakdown: masterScores.reduce((acc, curr) => ({ ...acc, [curr.num]: curr.breakdown }), {}),
        timestamp: Date.now(),
        symbiosisFactor: symbioticContext ? 1.5 : 1.0,
        riskProfile,
        realityAlignment: 0 // Sera calculé par le composant UI si T-1 disponible
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
        // Sauvegarde Locale (Instantané)
        localStorage.setItem(`nexus_config_${drawName}`, JSON.stringify({ weights, updatedAt: new Date().toISOString() }));
        
        // Sauvegarde Cloud (Asynchrone)
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
        equilibrium: 'Retour Moyenne'
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
    report.scoreDivergence.forEach(div => {
        const key = div.algo.toLowerCase() as keyof AlgoWeights;
        if (newWeights[key] !== undefined) {
            const boost = Math.min(0.05, (div.impact / 100) * 0.1);
            newWeights[key] = parseFloat((Number(newWeights[key]) + boost).toFixed(4));
            reasoning.push(`Boost ${div.algo} (+${(boost*100).toFixed(1)}%) suite au succès observé.`);
        }
    });
    return { newWeights: normalizeWeights(newWeights), newRules: rules, reasoning };
};
