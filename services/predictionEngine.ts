
import { DrawResult, Prediction, AlgoWeights, ScoreBreakdown, AdaptiveRules, ForensicReport, TicketAnalysisResult, SymbioticContext } from '../types';
import { calculateACValue, calculateDigitalRoot, calculateShannonEntropy, calculateRegularity } from './mathService';
import { supabase, isSupabaseConfigured } from './supabaseClient';

/**
 * NEXUS PREDICTION ENGINE v19.4 - PURE DETERMINISTIC KERNEL
 * Fusion complète des signaux physiques, statistiques et décisionnels.
 * GARANTIE : 0% Random, 100% Algorithmique.
 */

export const normalizeWeights = (weights: AlgoWeights, history?: DrawResult[]): AlgoWeights => {
    let normalized = { ...weights };
    
    // Auto-ajustement basé sur l'entropie de Shannon
    if (history && history.length > 20) {
        const ent = calculateShannonEntropy(history.slice(0, 100));
        if (ent.normalized > 0.94) {
            // En régime chaotique, on favorise la structure forestière et le spectral
            normalized.spectral = (Number(normalized.spectral) || 0.1) * 1.3;
            normalized.decision_forest = (Number(normalized.decision_forest) || 0.1) * 1.5;
            normalized.markov = (Number(normalized.markov) || 0.1) * 0.6; 
            normalized.gap = (Number(normalized.gap) || 0.25) * 1.2;
        }
    }

    const total = Object.values(normalized).reduce((a, b) => a + (Number(b) || 0), 0);
    if (total <= 0) return getDefaultWeights();
    
    (Object.keys(normalized) as Array<keyof AlgoWeights>).forEach(key => {
        normalized[key] = parseFloat(((Number(normalized[key]) || 0) / total).toFixed(4));
    });
    return normalized;
};

export const getDefaultWeights = (): AlgoWeights => ({
    frequency: 0.10, gap: 0.12, spectral: 0.12, fractal: 0.08, 
    markov: 0.12, wavelet: 0.05, orchestration: 0.10, momentum: 0.05, 
    equilibrium: 0.05, ai_intuition: 0.05, digital_root: 0.01, gap_velocity: 0.01, 
    isolation_anomaly: 0.01, resistance: 0.0, spatial: 0.05, bayes: 0.0,
    transformer: 0.0, temporal: 0.0, poisson: 0.05, leader_succession: 0.05,
    anti_consensus: 0.0, monte_carlo: 0.0, lstm_pattern: 0.0,
    decision_forest: 0.10
} as any);

export const getDefaultRules = (): AdaptiveRules => ({
    criticalZoneMin: 12,
    criticalZoneMax: 18
});

export const generateMasterPrediction = async (
    drawName: string, 
    history: DrawResult[],
    weightsToUse?: AlgoWeights,
    metrics?: any,
    symbioticContext?: SymbioticContext
): Promise<Prediction> => {
    if (history.length < 5) throw new Error("Dataset insuffisant pour l'inférence v19.");

    let baseWeights = weightsToUse || await getAlgoWeights(drawName);
    let weights = normalizeWeights(baseWeights, history);
    let rules = getAdaptiveRules(drawName);

    const deepHistory = history.slice(0, 150);
    const regularity = metrics?.regularity || calculateRegularity(deepHistory);
    const correlationMap = metrics?.correlationMatrix || {};
    const lastWinners = deepHistory[0]?.gagnants || [];
    
    // SÉCURISATION DES DONNÉES
    const specMetrics = Array.isArray(metrics?.spectral) ? metrics.spectral : [];
    const fractalMetrics = Array.isArray(metrics?.fractal) ? metrics.fractal : [];
    const waveletMetrics = Array.isArray(metrics?.wavelet) ? metrics.wavelet : [];

    const maxSpecEnergy = specMetrics.length > 0 ? Math.max(...specMetrics.map((s:any) => s.energy)) : 100;

    const masterScores = Array.from({ length: 90 }, (_, i) => {
        const num = i + 1;
        const reg = regularity.find((r: any) => r.number === num);
        
        // Accès sécurisé aux métriques
        const spec = specMetrics.find((s: any) => s.number === num);
        const frac = fractalMetrics.find((f: any) => f.number === num);
        const wav = waveletMetrics.find((w: any) => w.number === num);
        
        const freq = deepHistory.filter(h => h.gagnants.includes(num)).length;
        
        // 1. ANALYSE MARKOVIENNE RÉELLE
        let markovScore = 0;
        lastWinners.forEach(lw => {
           const strength = correlationMap[lw]?.affinities?.[num] || 0;
           if (strength > 0.15) markovScore += (strength * 100);
        });

        // 2. ANALYSE FRACTALE (HURST)
        const hVal = frac?.hurst || 0.5;
        const fractalScore = Math.abs(hVal - 0.5) * 200;

        // 3. POISSON ESTIMÉ
        const lambda = (freq / Math.max(1, deepHistory.length)) * (90/5);
        const gap = reg?.currentGap || 18;
        const poissonP = (Math.exp(-lambda) * Math.pow(lambda, gap)); 

        const nBreakdown: ScoreBreakdown = {
            frequency: (Math.sqrt(freq) / Math.sqrt(Math.max(1, deepHistory.length))) * 100,
            gap: (reg?.currentGap || 50) >= rules.criticalZoneMin && (reg?.currentGap || 50) <= rules.criticalZoneMax ? 95 : 25,
            spectral: spec ? (spec.energy / Math.max(1, maxSpecEnergy)) * 100 : 0,
            fractal: Math.min(100, fractalScore),
            markov: Math.min(100, markovScore * 2.5),
            momentum: Math.sqrt(deepHistory.slice(0, 15).filter(h => h.gagnants.includes(num)).length) * 40,
            equilibrium: (1 - Math.abs(num - 45) / 45) * 100,
            wavelet: wav?.energy || 0,
            orchestration: 0, 
            spatial: 0, 
            ai_intuition: 50, 
            resistance: 50, 
            transformer: 0, 
            temporal: 0, 
            digital_root: calculateDigitalRoot(num) * 10, 
            gap_velocity: Math.abs((reg?.avgGap || 18) - (reg?.currentGap || 0)) * 6, 
            poisson: Math.min(100, poissonP * 250), 
            leader_succession: lastWinners.includes(num) ? 30 : 0, 
            anti_consensus: 0, 
            monte_carlo: 0, 
            lstm_pattern: 0, 
            isolation_anomaly: freq < 2 ? 80 : 20, 
            bayes: 0,
            decision_forest: symbioticContext?.forestVotes[num] || 0
        };
        
        // 4. INJECTION DU CONTEXTE SYMBIOTIQUE (TRANSVERSE)
        let symbiosisMultiplier = 1.0;

        if (symbioticContext) {
            if (symbioticContext.spatialDeadZones.includes(num)) symbiosisMultiplier *= 0.25;
            if (symbioticContext.spectralVeto.includes(num)) symbiosisMultiplier *= 0.45;
            if (symbioticContext.spatialHotZones.includes(num)) {
                symbiosisMultiplier *= 1.35;
                nBreakdown.spatial = 100;
            }
            const orchBoost = symbioticContext.orchestrationBoosts[num];
            if (orchBoost) {
                symbiosisMultiplier *= orchBoost; 
                nBreakdown.orchestration = Math.min(100, (orchBoost - 1) * 250);
            }
        }

        // CALCUL PONDÉRÉ FINAL
        let finalScore = 0;
        (Object.keys(weights) as Array<keyof AlgoWeights>).forEach(k => {
            finalScore += (nBreakdown[k] || 0) * (Number(weights[k]) || 0);
        });

        finalScore *= symbiosisMultiplier;

        return { num, score: finalScore, breakdown: nBreakdown, symbiosisFactor: symbiosisMultiplier };
    });

    // --- TRI DÉTERMINISTE STRICT (AUCUN HASARD) ---
    // En cas d'égalité de score, on utilise une cascade de critères physiques
    const sorted = masterScores.sort((a, b) => {
        const diff = b.score - a.score;
        
        // 1. Score Global (Priorité Absolue)
        if (Math.abs(diff) > 0.0001) return diff;

        // TIE-BREAKERS (Départage en cas d'égalité parfaite)
        
        // 2. Momentum (Force cinétique récente)
        const momDiff = (b.breakdown.momentum || 0) - (a.breakdown.momentum || 0);
        if (Math.abs(momDiff) > 0.001) return momDiff;

        // 3. Fréquence (Poids historique)
        const freqDiff = (b.breakdown.frequency || 0) - (a.breakdown.frequency || 0);
        if (Math.abs(freqDiff) > 0.001) return freqDiff;

        // 4. Écart (Pression de sortie)
        const gapDiff = (b.breakdown.gap || 0) - (a.breakdown.gap || 0);
        if (Math.abs(gapDiff) > 0.001) return gapDiff;

        // 5. Numéro (Ordre décroissant pour stabilité finale absolue)
        return b.num - a.num;
    });

    const selection = sorted.slice(0, 5).map(s => s.num).sort((a,b) => a-b);
    const acScore = calculateACValue(selection);

    const topAvgScore = sorted.slice(0, 5).reduce((a, b) => a + b.score, 0) / 5;
    const topSymbiosis = sorted.slice(0, 5).reduce((a, b) => a + (b.symbiosisFactor || 1), 0) / 5;
    
    // CALIBRAGE CONFIANCE PLATINUM
    const confidence = Math.min(99, Math.round(topAvgScore * (acScore / 8.2) * (topSymbiosis > 1.15 ? 1.12 : 1.0)));

    return {
        suggestedNumbers: selection,
        candidates: sorted.slice(5, 18).map(s => s.num),
        confidence,
        analysis: `Oracle v19.4 (Strict Mode). Calcul vectoriel pur sur ${selection[0]}-${selection[4]}. Facteur de certitude algorithmique : ${(topAvgScore).toFixed(1)}/100.`,
        breakdown: masterScores.reduce((acc, curr) => ({ ...acc, [curr.num]: curr.breakdown }), {}),
        usedWeights: weights,
        timestamp: Date.now(),
        symbiosisFactor: parseFloat(topSymbiosis.toFixed(2))
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
    const dataToSave = { weights, rules: getAdaptiveRules(drawName), updatedAt: new Date().toISOString() };
    localStorage.setItem(`nexus_config_${drawName}`, JSON.stringify(dataToSave));
    if (isSupabaseConfigured()) {
        try {
            await supabase.from('algo_weights').upsert({ draw_name: drawName, weights: weights, updated_at: new Date().toISOString() });
        } catch(e) {}
    }
};

export const getAdaptiveRules = (drawName: string): AdaptiveRules => {
    const raw = localStorage.getItem(`nexus_config_${drawName}`);
    return raw ? JSON.parse(raw).rules : getDefaultRules();
};

export const saveAdaptiveRules = async (drawName: string, rules: AdaptiveRules) => {
    const weights = await getAlgoWeights(drawName);
    const dataToSave = { weights, rules, updatedAt: new Date().toISOString() };
    localStorage.setItem(`nexus_config_${drawName}`, JSON.stringify(dataToSave));
};

export const getStrategyName = (weights: AlgoWeights): string => {
    const entries = Object.entries(weights) as [string, number][];
    const sorted = entries.sort((a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0));
    const dominant = sorted[0];
    const subDominant = sorted[1];

    const names: Record<string, string> = { 
        frequency: 'Inertie', gap: 'Écart', spectral: 'Spectral', markov: 'Séquentiel', 
        orchestration: 'Orchestral', spatial: 'Spatial', fractal: 'Fractal', decision_forest: 'Forest',
        poisson: 'Poisson', momentum: 'Momentum', equilibrium: 'Gauss', wavelet: 'Wavelet'
    };

    const domName = names[dominant[0]] || 'Apex';
    if (subDominant && subDominant[1] > 0.15) {
        const subName = names[subDominant[0]] || '';
        return `${domName}-${subName}`;
    }
    return `${domName} Pur`;
};

export const analyzeTicketStrength = async (numbers: number[], _drawName: string): Promise<TicketAnalysisResult> => {
    const ac = calculateACValue(numbers);
    const sum = numbers.reduce((a,b)=>a+b,0);
    let score = Math.min(100, Math.round((ac / 10) * 100));
    const warnings = [];
    if (ac < 7) { score -= 20; warnings.push("Structure trop prévisible (AC faible)"); }
    if (sum < 100 || sum > 350) { score -= 15; warnings.push("Somme hors normes (Sigma Risk)"); }
    return { score, verdict: score >= 80 ? "Optimale" : score >= 60 ? "Équilibrée" : "Risquée", warnings };
};

/**
 * LOGIQUE D'AUTO-CORRECTION AVANCÉE (Gradient Descent)
 * Ajuste les poids en fonction de la divergence entre prédiction et réalité.
 */
export const calculateCorrectionsFromForensics = (currentWeights: AlgoWeights, _rules: AdaptiveRules, report: ForensicReport) => {
    const newWeights = { ...currentWeights };
    const reasoning: string[] = [];
    const LEARNING_RATE = 0.08; // Taux d'apprentissage modéré

    // 1. Analyse de la Divergence Positive (Quels algos avaient raison sur les gagnants ?)
    // scoreDivergence contient { algo: string, impact: number } pour les algos qui ont bien scoré sur les vrais numéros gagnants.
    if (report.scoreDivergence.length > 0) {
        report.scoreDivergence.forEach(div => {
            const key = div.algo as keyof AlgoWeights;
            const currentVal = Number(newWeights[key]) || 0;
            
            // Calcul du boost proportionnel à l'impact manqué
            const boost = (div.impact / 100) * LEARNING_RATE;
            
            if (newWeights[key] !== undefined) {
                newWeights[key] = currentVal + boost;
                reasoning.push(`Boost ${div.algo.toUpperCase()} (+${(boost*100).toFixed(1)}%) : A détecté ${div.impact}% du signal réel.`);
            }
        });
    }

    // 2. Analyse des Occasions Manquées (Spécifique aux numéros totalement ignorés)
    if (report.missedOpportunities.length > 0) {
        // On augmente légèrement l'exploration (anti-consensus) si on rate trop de numéros
        newWeights.anti_consensus = (Number(newWeights.anti_consensus) || 0) + (LEARNING_RATE * 0.5);
        newWeights.decision_forest = (Number(newWeights.decision_forest) || 0) + (LEARNING_RATE * 0.5);
        reasoning.push(`Boost EXPLORATION (+${(LEARNING_RATE*0.5*100).toFixed(1)}%) : ${report.missedOpportunities.length} numéros hors radar.`);
    }

    // 3. Normalisation et Nettoyage
    const normalized = normalizeWeights(newWeights);
    
    // Comparaison finale pour le log
    const changes = Object.keys(normalized).filter(k => Math.abs((normalized[k as keyof AlgoWeights] || 0) - (currentWeights[k as keyof AlgoWeights] || 0)) > 0.01);
    if (changes.length === 0 && reasoning.length === 0) {
        reasoning.push("Aucune correction significative nécessaire. L'ADN est stable.");
    }

    return { 
        newWeights: normalized, 
        newRules: _rules, 
        reasoning 
    };
};
