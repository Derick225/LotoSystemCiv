
import { DrawResult, Prediction, AlgoWeights, ScoreBreakdown, SymbioticContext, AdaptiveRules, TicketAnalysisResult, ForensicReport, RiskProfile } from '../types';
import { calculateACValue, denoiseFeaturesPCA, trainRidgeRegression, applyL2Regularization } from './mathService';
import { workerService } from './workerService';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { LSTMService } from './lstmService';

export const getDefaultWeights = (): AlgoWeights => ({
    frequency: 0.20,
    markov: 0.15,
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
    anti_consensus: 0.0,
    lstm: 0.05,
    shadow_factor: 0.0 // Protocole Shadow (+/- 1)
});

export const getDefaultRules = (): AdaptiveRules => ({
    criticalZoneMin: 12,
    criticalZoneMax: 28,
    dayEchoBoost: 1.1
});

export const normalizeWeights = (weights: AlgoWeights): AlgoWeights => {
    let total = 0;
    const cleanWeights: AlgoWeights = {};

    (Object.keys(weights) as Array<keyof AlgoWeights>).forEach(key => {
        let val = weights[key];
        if (typeof val !== 'number' || isNaN(val) || val < 0) val = 0;
        val = Math.min(1.0, val);
        cleanWeights[key] = val;
        total += val;
    });

    if (total <= 0.0001) return getDefaultWeights();

    (Object.keys(cleanWeights) as Array<keyof AlgoWeights>).forEach(key => {
        const val = cleanWeights[key] || 0;
        // On ne normalise pas shadow_factor car c'est un modificateur post-calcul, pas un poids contributif direct
        if (key !== 'shadow_factor') {
            cleanWeights[key] = parseFloat((val / total).toFixed(4));
        } else {
            cleanWeights[key] = val; // On garde la valeur brute (ex: 0.1)
        }
    });
    
    return cleanWeights;
};

const applyRiskProfile = (weights: AlgoWeights, profile: RiskProfile): AlgoWeights => {
    const modified = { ...weights };
    
    switch (profile) {
        case 'PRUDENT':
            modified.frequency = (modified.frequency || 0.20) * 1.8;
            modified.markov = (modified.markov || 0.20) * 1.5;
            modified.equilibrium = (modified.equilibrium || 0.05) * 1.3;
            modified.gap = (modified.gap || 0.15) * 0.3; 
            modified.anti_consensus = 0;
            modified.shadow_factor = 0.15; // Couverture défensive (+/- 1)
            break;

        case 'BALANCED': 
            modified.frequency = (modified.frequency || 0.20) * 1.1;
            modified.gap = (modified.gap || 0.15) * 1.1;
            modified.spectral = (modified.spectral || 0.10) * 1.1;
            modified.shadow_factor = 0.05; // Légère couverture
            break;

        case 'AUDACIOUS': 
            modified.gap = (modified.gap || 0.15) * 2.5;
            modified.momentum = (modified.momentum || 0.10) * 1.8;
            modified.frequency = (modified.frequency || 0.20) * 0.4;
            modified.shadow_factor = 0.0; // Tir direct, pas de couverture
            break;

        case 'CHAOS': 
            modified.anti_consensus = 0.5;
            modified.spectral = 0.3;
            modified.frequency = 0;
            modified.markov = 0;
            modified.shadow_factor = 0.2; // Forte incertitude
            break;
    }
    
    return normalizeWeights(modified);
};

const adjustWeightsForRegime = (weights: AlgoWeights, regimeInfo?: { regime: string, hurst: number }): AlgoWeights => {
    if (!regimeInfo) return weights;

    const { regime, hurst } = regimeInfo;
    const adjusted = { ...weights };
    
    if (hurst > 0.6) {
        adjusted.frequency = (adjusted.frequency || 0) * 1.4;
        adjusted.markov = (adjusted.markov || 0) * 1.4;
        adjusted.momentum = (adjusted.momentum || 0) * 1.3;
        adjusted.equilibrium = (adjusted.equilibrium || 0) * 0.5;
    } else if (hurst < 0.4) {
        adjusted.gap = (adjusted.gap || 0) * 1.6;
        adjusted.equilibrium = (adjusted.equilibrium || 0) * 1.5;
        adjusted.frequency = (adjusted.frequency || 0) * 0.6;
    } else {
        adjusted.spectral = (adjusted.spectral || 0) * 1.3;
        adjusted.wavelet = (adjusted.wavelet || 0) * 1.3;
        adjusted.monte_carlo = (adjusted.monte_carlo || 0) * 1.4;
    }

    return normalizeWeights(adjusted);
};

const applyMetaLearning = (weights: AlgoWeights, history: DrawResult[]): AlgoWeights => {
    if (history.length < 20) return weights;
    
    // Évaluation de la performance des stratégies sur les 5 derniers tirages
    const recentDraws = history.slice(0, 5);
    const evaluationHistory = history.slice(5, 55); // 50 tirages précédents
    
    let freqScore = 0;
    let gapScore = 0;
    
    const freqMap = new Map<number, number>();
    const gapsMap = new Map<number, number>();
    
    evaluationHistory.forEach((d, idx) => {
        d.gagnants.forEach(n => {
            freqMap.set(n, (freqMap.get(n) || 0) + 1);
            if (!gapsMap.has(n)) gapsMap.set(n, idx);
        });
    });
    
    recentDraws.forEach(draw => {
        draw.gagnants.forEach(n => {
            const freq = freqMap.get(n) || 0;
            if (freq > 4) freqScore += 1; // Succès de la stratégie Fréquence
            
            const gap = gapsMap.get(n) || 50;
            if (gap > 12) gapScore += 1; // Succès de la stratégie Écart
        });
    });
    
    const dynamicWeights = { ...weights };
    const learningRate = 0.25; // Taux d'apprentissage
    
    // Ajustement dynamique des poids (Online Stacking)
    if (freqScore > gapScore * 1.5) {
        dynamicWeights.frequency = (dynamicWeights.frequency || 0) * (1 + learningRate);
        dynamicWeights.gap = (dynamicWeights.gap || 0) * (1 - learningRate * 0.5);
    } else if (gapScore > freqScore * 1.5) {
        dynamicWeights.gap = (dynamicWeights.gap || 0) * (1 + learningRate);
        dynamicWeights.frequency = (dynamicWeights.frequency || 0) * (1 - learningRate * 0.5);
    }
    
    return normalizeWeights(dynamicWeights);
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
    weights = applyMetaLearning(weights, history);
    weights = applyRiskProfile(weights, riskProfile);

    // --- L2 REGULARIZATION (Generalization) ---
    // On applique une pénalité L2 pour éviter la sur-confiance dans un seul algo
    const l2Lambda = 0.05;
    (Object.keys(weights) as Array<keyof AlgoWeights>).forEach(key => {
        if (key !== 'shadow_factor') {
            weights[key] = (weights[key] || 0) * (1 - l2Lambda);
        }
    });
    weights = normalizeWeights(weights);
    
    if (metrics?.fractal && Array.isArray(metrics.fractal)) {
        const avgHurst = metrics.fractal.reduce((acc: number, f: any) => acc + (f.hurst || 0.5), 0) / metrics.fractal.length;
        weights = adjustWeightsForRegime(weights, { 
            regime: avgHurst > 0.6 ? 'PERSISTANT' : avgHurst < 0.4 ? 'ANTI-PERSISTANT' : 'RANDOM', 
            hurst: avgHurst 
        });
    }

    const rules = getAdaptiveRules(drawName);
    const N = 90;
    const sampleSize = Math.min(history.length, 100);
    const recentHistory = history.slice(0, sampleSize);
    const lastDraw = history[0].gagnants;

    const freqMap = new Map<number, number>();
    const gapsMap = new Map<number, number>();
    const markovMap = new Map<number, number>();
    const momentumMap = new Map<number, number>();
    const affinityMap = new Map<number, Map<number, number>>();
    
    // --- LSTM PREDICTION (Experimental) ---
    let lstmProbs: number[] = new Array(90).fill(0);
    if (weights.lstm && weights.lstm > 0) {
        try {
            const { probabilities } = await LSTMService.runPrediction(history);
            lstmProbs = probabilities;
        } catch (e) {
            console.error("LSTM Error:", e);
        }
    }
    
    for (let i = 0; i < recentHistory.length; i++) {
        const draw = recentHistory[i];
        for (const n of draw.gagnants) {
            freqMap.set(n, (freqMap.get(n) || 0) + 1);
            if (!gapsMap.has(n)) gapsMap.set(n, i);
        }
    }
    for (let i = 1; i <= N; i++) { if (!gapsMap.has(i)) gapsMap.set(i, sampleSize); }

    // --- MARKOV TRANSITION MATRIX & AFFINITY MODULE ---
    const markovTransitionMap = new Map<number, Map<number, number>>();

    for (let i = 0; i < recentHistory.length - 1; i++) {
        const current = recentHistory[i].gagnants;
        const prev = recentHistory[i+1].gagnants;
        
        // Markov: What came after 'prev' numbers? ('current' came after 'prev')
        prev.forEach(p => {
            if (!markovTransitionMap.has(p)) markovTransitionMap.set(p, new Map());
            const transitions = markovTransitionMap.get(p)!;
            current.forEach(c => {
                transitions.set(c, (transitions.get(c) || 0) + 1);
            });
        });

        // Affinity: What numbers appear together in 'current'?
        current.forEach(c1 => {
            if (!affinityMap.has(c1)) affinityMap.set(c1, new Map());
            const affinities = affinityMap.get(c1)!;
            current.forEach(c2 => {
                if (c1 !== c2) affinities.set(c2, (affinities.get(c2) || 0) + 1);
            });
        });
    }

    if (weights.markov && weights.markov > 0) {
        // Boost scores based on the LAST draw (Markov)
        lastDraw.forEach(lastNum => {
            const transitions = markovTransitionMap.get(lastNum);
            if (transitions) {
                transitions.forEach((count, nextNum) => {
                    markovMap.set(nextNum, (markovMap.get(nextNum) || 0) + count);
                });
            }
        });
    }

    if (weights.momentum && weights.momentum > 0) {
        history.slice(0, 10).forEach(d => {
            d.gagnants.forEach(n => momentumMap.set(n, (momentumMap.get(n) || 0) + 1));
        });
    }

    const masterScores = Array.from({ length: N }, (_, i) => {
        const num = i + 1;
        const nBreakdown: ScoreBreakdown = {};
        
        const maxFreq = Math.max(...freqMap.values()) || 1;
        nBreakdown.frequency = ((freqMap.get(num) || 0) / maxFreq) * 100;

        const currentGap = gapsMap.get(num) || 0;
        const theoreticalGap = 17; 
        let gapScore = 0;
        if (currentGap < theoreticalGap) gapScore = (currentGap / theoreticalGap) * 40; 
        else if (currentGap < theoreticalGap * 3) gapScore = 40 + ((currentGap - theoreticalGap) / (theoreticalGap * 2)) * 60;
        else gapScore = 90; 
        nBreakdown.gap = gapScore;

        const maxMarkov = Math.max(...markovMap.values()) || 1;
        nBreakdown.markov = ((markovMap.get(num) || 0) / maxMarkov) * 100;

        nBreakdown.spectral = metrics?.spectral?.find((s: any) => s.number === num)?.energy || 0;
        nBreakdown.momentum = Math.min(100, (momentumMap.get(num) || 0) * 25);
        nBreakdown.equilibrium = 100 - nBreakdown.frequency!;
        nBreakdown.anti_consensus = (200 - (nBreakdown.frequency! + nBreakdown.markov!)) / 2;
        nBreakdown.decision_forest = symbioticContext?.forestVotes?.[num] || 0;
        nBreakdown.orchestration = symbioticContext?.orchestrationBoosts?.[num] ? symbioticContext.orchestrationBoosts[num] * 20 : 0;
        nBreakdown.spatial = symbioticContext?.spatialHotZones?.includes(num) ? 80 : 0;
        nBreakdown.fractal = (metrics?.fractal?.find((f:any) => f.number === num)?.hurst || 0.5) * 100;
        nBreakdown.wavelet = (metrics?.wavelet?.find((w:any) => w.number === num)?.energy || 0);
        nBreakdown.lstm = (lstmProbs[i] || 0) * 100;

        let finalScore = 0;
        let totalW = 0;

        (Object.keys(weights) as Array<keyof AlgoWeights>).forEach(key => {
            const w = weights[key] || 0;
            const s = (nBreakdown as any)[key] || 0;
            if (w > 0) {
                finalScore += s * w;
                totalW += w;
            }
        });

        if (num >= rules.criticalZoneMin && num <= rules.criticalZoneMax) {
            finalScore *= 1.1; 
        }
        if (symbioticContext?.dayMetrics?.echoNumbers.includes(num)) {
            finalScore *= (rules.dayEchoBoost || 1.1);
        }
        if (nBreakdown.orchestration) finalScore += (nBreakdown.orchestration * 0.15);
        if (nBreakdown.spatial) finalScore += (nBreakdown.spatial * 0.10);

        return { num, score: finalScore, breakdown: nBreakdown };
    });

    // --- PCA DENOISING (Réduction de dimensionnalité) ---
    // On projette les features dans un espace latent pour réduire le bruit (95% variance conservée)
    try {
        const featureKeys = Object.keys(weights).filter(k => k !== 'shadow_factor') as Array<keyof AlgoWeights>;
        const featureMatrix = masterScores.map(item => featureKeys.map(k => (item.breakdown as any)[k] || 0));
        
        let denoisedMatrix: number[][];
        if (workerService.isAvailable()) {
            denoisedMatrix = await workerService.runTask<number[][]>('DENOISE_PCA', { matrix: featureMatrix, variance: 0.95 });
        } else {
            denoisedMatrix = denoiseFeaturesPCA(featureMatrix, 0.95);
        }
        
        if (denoisedMatrix && denoisedMatrix.length === masterScores.length) {
            masterScores.forEach((item, idx) => {
                let newScore = 0;
                featureKeys.forEach((key, fIdx) => {
                    const val = Math.max(0, denoisedMatrix[idx][fIdx]); // Clamp to 0
                    (item.breakdown as any)[key] = val; 
                    newScore += val * (weights[key] || 0);
                });
                
                // Ré-application des bonus contextuels
                if (item.num >= rules.criticalZoneMin && item.num <= rules.criticalZoneMax) {
                    newScore *= 1.1; 
                }
                if (symbioticContext?.dayMetrics?.echoNumbers.includes(item.num)) {
                    newScore *= (rules.dayEchoBoost || 1.1);
                }
                if (item.breakdown?.orchestration) newScore += (item.breakdown.orchestration * 0.15);
                if (item.breakdown?.spatial) newScore += (item.breakdown.spatial * 0.10);
                
                item.score = newScore;
            });
        }
    } catch (e) {
        console.warn("PCA Denoising failed, using raw scores:", e);
    }

    // --- SHADOW PROTOCOL (Voisinage +/- 1) ---
    if (weights.shadow_factor && weights.shadow_factor > 0) {
        const shadowStrength = weights.shadow_factor; 
        const originalScores = [...masterScores.map(s => s.score)];
        
        masterScores.forEach((item, idx) => {
            const prevIdx = idx === 0 ? 89 : idx - 1;
            const nextIdx = idx === 89 ? 0 : idx + 1;
            
            // On ajoute une fraction du score des voisins
            const neighborBoost = (originalScores[prevIdx] + originalScores[nextIdx]) * (shadowStrength * 0.5);
            
            item.score += neighborBoost;
        });
    }

    const sorted = masterScores.sort((a, b) => b.score - a.score);

    const stabilityWeight = (weights.frequency || 0) + (weights.markov || 0) + (weights.equilibrium || 0);
    const chaosWeight = (weights.anti_consensus || 0) + (weights.gap || 0) + (weights.spectral || 0);
    
    let topPickCount = 3;
    let outsiderCount = 2;
    
    if (chaosWeight > stabilityWeight * 1.5) {
        topPickCount = 1; 
        outsiderCount = 4;
    } else if (chaosWeight > stabilityWeight) {
        topPickCount = 2; 
        outsiderCount = 3;
    } else if (stabilityWeight > chaosWeight * 2) {
        topPickCount = 5; 
        outsiderCount = 0;
    }

    // --- COMBINATION GENERATION WITH FILTERS & AFFINITY ---
    const isValidCombination = (combo: number[]) => {
        if (combo.length !== 5) return false;
        const sum = combo.reduce((a, b) => a + b, 0);
        if (sum < 100 || sum > 350) return false; // Sum filter
        
        const evens = combo.filter(n => n % 2 === 0).length;
        if (evens === 0 || evens === 5) return false; // Parity filter (no all-even or all-odd)
        
        let consecutiveCount = 0;
        const sortedCombo = [...combo].sort((a, b) => a - b);
        for (let i = 0; i < sortedCombo.length - 1; i++) {
            if (sortedCombo[i] + 1 === sortedCombo[i+1]) consecutiveCount++;
        }
        if (consecutiveCount > 2) return false; // Max 2 consecutive numbers
        
        return true;
    };

    let selection: number[] = [];
    let attempts = 0;
    const maxAttempts = 100;

    while (selection.length !== 5 && attempts < maxAttempts) {
        attempts++;
        let currentSelection: number[] = [];
        
        // Start with the absolute best number
        const seed = sorted[0].num;
        currentSelection.push(seed);

        // Iteratively pick numbers based on affinity to the CURRENT selection
        for (let i = 1; i < 5; i++) {
            const isOutsiderSlot = i >= (5 - outsiderCount);
            
            // Calculate combined affinity to all numbers already in currentSelection
            const adjustedSorted = sorted
                .filter(s => !currentSelection.includes(s.num))
                .map(s => {
                    let totalAffinity = 0;
                    currentSelection.forEach(selectedNum => {
                        const affinities = affinityMap.get(selectedNum);
                        if (affinities) {
                            totalAffinity += (affinities.get(s.num) || 0);
                        }
                    });
                    // Boost score by total affinity found
                    return { ...s, tempScore: s.score + (totalAffinity * 3) };
                })
                .sort((a, b) => b.tempScore - a.tempScore);

            if (adjustedSorted.length === 0) break;

            if (isOutsiderSlot) {
                // Pick a random number from a lower probability pool for variety
                const pool = adjustedSorted.slice(10, 35);
                const picked = pool[Math.floor(Math.random() * pool.length)] || adjustedSorted[0];
                currentSelection.push(picked.num);
            } else {
                // Pick the best one based on affinity + base score
                currentSelection.push(adjustedSorted[0].num);
            }
        }

        if (currentSelection.length === 5) {
            const sortedCombo = [...currentSelection].sort((a, b) => a - b);
            if (isValidCombination(sortedCombo)) {
                selection = sortedCombo;
                break;
            }
        }
    }

    // Fallback if filters are too strict
    if (selection.length !== 5) {
        const topPicks = sorted.slice(0, topPickCount).map(s => s.num);
        const outsiderPoolStart = Math.max(topPickCount + 2, 10);
        const outsiderPool = sorted.slice(outsiderPoolStart, outsiderPoolStart + 25);
        const outsiders = outsiderPool.sort(() => 0.5 - Math.random()).slice(0, outsiderCount).map(s => s.num);
        selection = [...topPicks, ...outsiders].sort((a,b) => a-b);
    }

    const dnaDominant = Object.entries(weights).sort((a,b) => b[1]-a[1])[0];
    let dnaType = "Équilibré";
    if (dnaDominant[1] > 0.3) dnaType = `${dnaDominant[0].toUpperCase()} Dominant`;
    const structureType = outsiderCount === 0 ? "Logique Pure" : outsiderCount > 2 ? "Chaos Structuré" : "Mixte";

    return {
        suggestedNumbers: selection,
        candidates: sorted.slice(5, 15).map(s => s.num),
        confidence: Math.min(99, Math.round(sorted.slice(0, 5).reduce((a,b) => a + b.score, 0) / 5)),
        analysis: `ADN : ${dnaType} (${getStrategyName(weights)}). Structure : ${structureType}.`,
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

export const getAdaptiveRules = (drawName: string): AdaptiveRules => {
    try {
        const raw = localStorage.getItem(`nexus_rules_${drawName}`);
        return raw ? JSON.parse(raw) : getDefaultRules();
    } catch { return getDefaultRules(); }
};

export const saveAdaptiveRules = (drawName: string, rules: AdaptiveRules) => {
    try { localStorage.setItem(`nexus_rules_${drawName}`, JSON.stringify(rules)); } catch {}
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
    
    const LEARNING_RATE = 0.05; 

    report.scoreDivergence.forEach(div => {
        const key = div.algo.toLowerCase() as keyof AlgoWeights;
        if (newWeights[key] !== undefined) {
            const impactFactor = div.impact / 100; 
            const boost = LEARNING_RATE * impactFactor; 
            
            const oldVal = Number(newWeights[key]) || 0;
            const newVal = oldVal + boost;
            
            newWeights[key] = parseFloat(newVal.toFixed(4));
            
            if (boost > 0.01) {
                reasoning.push(`Micro-ajustement ${div.algo} (+${(boost*100).toFixed(2)}%).`);
            }
        }
    });
    
    return { newWeights: normalizeWeights(newWeights), newRules: rules, reasoning };
};

// --- AUTO-LEARN ENGINE ---

const calculateSimpleFeatures = (num: number, history: DrawResult[]): number[] => {
    // Features: [Frequency (last 10), Gap, Markov Score]
    const recent = history.slice(0, 10);
    const freq = recent.filter(d => d.gagnants.includes(num)).length;
    
    let gap = 0;
    for (let i = 0; i < Math.min(history.length, 50); i++) {
        if (history[i].gagnants.includes(num)) break;
        gap++;
    }
    
    // Markov simplified: How often num follows any number from the previous draw
    let markov = 0;
    if (history.length > 1) {
        const lastDraw = history[0].gagnants;
        // Look at previous transitions in history
        for (let i = 1; i < Math.min(history.length, 50) - 1; i++) {
            const prev = history[i+1].gagnants;
            const curr = history[i].gagnants;
            // If prev had any number from lastDraw, did curr have num?
            const common = prev.filter(n => lastDraw.includes(n));
            if (common.length > 0 && curr.includes(num)) {
                markov++;
            }
        }
    }
    
    return [freq, gap, markov];
};

export const runAutoLearn = async (drawName: string, fullHistory: DrawResult[]): Promise<{ success: boolean; message: string; newWeights?: AlgoWeights }> => {
    const LAST_RUN_KEY = `nexus_autolearn_last_${drawName}`;
    const lastRun = localStorage.getItem(LAST_RUN_KEY);
    const now = Date.now();
    
    // Check if 24h passed (86400000 ms)
    if (lastRun && (now - Number(lastRun)) < 86400000) {
        return { success: false, message: "Auto-Learn déjà exécuté aujourd'hui." };
    }
    
    if (fullHistory.length < 60) {
        return { success: false, message: "Historique insuffisant pour Auto-Learn (>60 requis)." };
    }
    
    // Training Data Collection
    // We use the last 50 draws as validation targets
    // For each target draw T (at index i), we use history starting at i+1
    const trainingFeatures: number[][] = [];
    const trainingLabels: number[] = [];
    
    const TRAINING_WINDOW = 50;
    
    for (let i = 0; i < TRAINING_WINDOW; i++) {
        const targetDraw = fullHistory[i];
        const historyContext = fullHistory.slice(i + 1); // History available AT THAT TIME
        
        // Positive samples (winners)
        targetDraw.gagnants.forEach(num => {
            trainingFeatures.push(calculateSimpleFeatures(num, historyContext));
            trainingLabels.push(1);
        });
        
        // Negative samples (random losers to balance)
        // We pick 5 random losers per draw
        let losersCount = 0;
        while (losersCount < 5) {
            const rnd = Math.floor(Math.random() * 90) + 1;
            if (!targetDraw.gagnants.includes(rnd)) {
                trainingFeatures.push(calculateSimpleFeatures(rnd, historyContext));
                trainingLabels.push(0);
                losersCount++;
            }
        }
    }
    
    // Train Ridge Regression
    // Features: [Freq, Gap, Markov]
    // Weights returned: [w_freq, w_gap, w_markov]
    try {
        let learnedWeights: number[];
        if (workerService.isAvailable()) {
            learnedWeights = await workerService.runTask<number[]>('TRAIN_RIDGE', { features: trainingFeatures, labels: trainingLabels, lambda: 0.1 });
        } else {
            learnedWeights = trainRidgeRegression(trainingFeatures, trainingLabels, 0.1);
        }
        
        // Apply learned weights to global config
        const currentWeights = await getAlgoWeights(drawName);
        const newWeights = { ...currentWeights };
        
        // Normalize learned weights to be positive and relative
        // Ridge can return negative weights, but our engine expects 0-1.
        // We take absolute value or clamp, then normalize.
        // Actually, negative weight for Gap means "smaller gap is better", which is usually true for hot numbers.
        // But our engine logic: score = feature * weight.
        // Feature Gap: 0..100 (normalized score).
        // If Ridge says Gap is negative, it means high gap is bad.
        // Our Gap Score logic already handles "high gap is bad" (or good depending on strategy).
        // Let's assume learned weights are importance factors.
        
        const wFreq = Math.abs(learnedWeights[0] || 0);
        const wGap = Math.abs(learnedWeights[1] || 0);
        const wMarkov = Math.abs(learnedWeights[2] || 0);
        
        // Blend with existing (Alpha 0.3 = 30% new, 70% old)
        const ALPHA = 0.3;
        newWeights.frequency = (newWeights.frequency || 0) * (1 - ALPHA) + wFreq * ALPHA;
        newWeights.gap = (newWeights.gap || 0) * (1 - ALPHA) + wGap * ALPHA;
        newWeights.markov = (newWeights.markov || 0) * (1 - ALPHA) + wMarkov * ALPHA;
        
        const normalized = normalizeWeights(newWeights);
        await saveAlgoWeights(drawName, normalized);
        
        localStorage.setItem(LAST_RUN_KEY, now.toString());
        
        return { 
            success: true, 
            message: `Auto-Learn terminé. Poids ajustés : Freq ${(wFreq*100).toFixed(0)}%, Gap ${(wGap*100).toFixed(0)}%, Markov ${(wMarkov*100).toFixed(0)}%.`,
            newWeights: normalized
        };
        
    } catch (e) {
        console.error("Auto-Learn Error:", e);
        return { success: false, message: "Erreur lors de l'apprentissage." };
    }
};
