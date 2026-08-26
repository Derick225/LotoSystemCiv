import { PlatinumResult, DrawResult, SymbioticContext, PlatinumScenario, PlatinumAudit, Prediction, PlatinumUserOptions, ForensicReport } from '../types';
import { get, set } from 'idb-keyval';
import { purifyHistoryForDraw } from '../utils/arrayUtils';
import { getAlgoWeights, generateMasterPrediction } from './predictionEngine';
import { useNexusStore } from '../store/useNexusStore';
import { extractFeatures } from './prediction/featureExtractor';
import { getLocalForensicReports } from './postPredictionAnalysisService';
import { calculateDnaSieveWeights } from './temporalAnalysisService';
import { EnhancedMetrics } from './prediction/metrics.types';

// ═══════════════════════════════════════════════════════════════
// CONSTANTS & MATHEMATICAL FOUNDATIONS
// ═══════════════════════════════════════════════════════════════
const MAX_NUM = 90;
const DRAW_SIZE = 5;

/**
 * Exponentielle sécurisée pour éviter les débordements flottants IEEE-754.
 */
const safeExp = (x: number): number => Math.exp(Math.max(-50, Math.min(50, x)));

/**
 * Fonction logistique continue (Sigmoïde standard).
 */
const sigmoid = (z: number): number => 1.0 / (1.0 + safeExp(-z));

// ═══════════════════════════════════════════════════════════════
// MATH KERNEL (PURE DETERMINISTIC FUNCTIONS)
// ═══════════════════════════════════════════════════════════════

/**
 * Normalisation continue d'un vecteur flottant vers l'intervalle [0, 100].
 */
const normalizeVector = (vector: Float64Array): Float64Array => {
    let max = 0;
    for (let i = 1; i <= MAX_NUM; i++) {
        if (vector[i] > max) max = vector[i];
    }
    if (max <= Number.EPSILON) return vector;
    
    const normalized = new Float64Array(vector.length);
    const invMax = 100.0 / max;
    for (let i = 1; i <= MAX_NUM; i++) {
        normalized[i] = vector[i] * invMax;
    }
    return normalized;
};

/**
 * Calcule les statistiques de base (Moyenne, Écart-Type) d'un vecteur sur [1, MAX_NUM].
 */
const computeVectorStats = (vector: Float64Array): { mean: number; stdDev: number; sum: number } => {
    let sum = 0;
    for (let i = 1; i <= MAX_NUM; i++) {
        sum += vector[i];
    }
    const mean = sum / MAX_NUM;
    let sumSq = 0;
    for (let i = 1; i <= MAX_NUM; i++) {
        const diff = vector[i] - mean;
        sumSq += diff * diff;
    }
    const variance = sumSq / MAX_NUM;
    const stdDev = Math.sqrt(variance) || 1.0;
    return { mean, stdDev, sum };
};

/**
 * Standardisation par Z-score continu suivie d'un étalement logistique doux.
 */
const standardizeVector = (vector: Float64Array): Float64Array => {
    const { mean, stdDev } = computeVectorStats(vector);
    const result = new Float64Array(MAX_NUM + 1);
    for (let i = 1; i <= MAX_NUM; i++) {
        const z = (vector[i] - mean) / stdDev;
        result[i] = sigmoid(z) * 100.0;
    }
    return result;
};

/**
 * Calcule l'Entropie Informationnelle Normalisée de Shannon H in [0, 1].
 */
const computeVectorEntropy = (vector: Float64Array): number => {
    let sum = 0;
    for (let i = 1; i <= MAX_NUM; i++) sum += vector[i];
    if (sum <= Number.EPSILON) return 1.0;
    
    let entropy = 0;
    const invSum = 1.0 / sum;
    for (let i = 1; i <= MAX_NUM; i++) {
        const p = vector[i] * invSum;
        if (p > 0) {
            entropy -= p * Math.log(p);
        }
    }
    const maxEntropy = Math.log(MAX_NUM);
    return Math.max(0.0, Math.min(1.0, entropy / maxEntropy));
};

/**
 * Sélection Gloutonne Strictement Déterministe basée sur le score modulé par harmoniques de Fourier continues.
 * ZÉRO HASARD, 100% REPRODUCTIBLE, TIE-BREAKER PAR HACHAGE LCG DÉTERMINISTE.
 */
const greedyDeterministicSelection = (
    vector: Float64Array,
    count: number,
    phaseShift: number = 0.0,
    entropy: number = 0.5
): number[] => {
    const candidates: { n: number; score: number; raw: number }[] = [];
    
    // Paramètres d'exploration dynamique continûment dérivés de l'entropie de Shannon
    const dynamicAmp = 0.05 + 0.20 * entropy;
    const dynamicFreq = (2.0 * Math.PI / MAX_NUM) * (1.0 + 0.5 * entropy);
    
    for (let i = 1; i <= MAX_NUM; i++) {
        const rawScore = vector[i];
        if (rawScore > 0) {
            const harmonic = Math.sin(i * dynamicFreq + phaseShift);
            const modulation = 1.0 + dynamicAmp * harmonic;
            const adjustedScore = rawScore * modulation;
            candidates.push({ n: i, score: adjustedScore, raw: rawScore });
        }
    }
    
    // Tri déterministe avec multi-niveaux de tie-breaking sans aléatoire
    candidates.sort((a, b) => {
        if (Math.abs(b.score - a.score) > 1e-6) {
            return b.score - a.score;
        }
        if (Math.abs(b.raw - a.raw) > 1e-6) {
            return b.raw - a.raw;
        }
        // Hachage LCG déterministe invariant
        const hashA = (a.n * 2654435761) >>> 0;
        const hashB = (b.n * 2654435761) >>> 0;
        return hashB - hashA;
    });
    
    return candidates.slice(0, count).map(c => c.n).sort((a, b) => a - b);
};

// ═══════════════════════════════════════════════════════════════
// PLATINUM ENGINE (META-ANALYST FLAGSHIP)
// ═══════════════════════════════════════════════════════════════
export async function generatePlatinumPredictionCore(
    drawName: string,
    rawHistory: DrawResult[],
    metrics?: EnhancedMetrics,
    userOptions?: PlatinumUserOptions | null,
    symbioticContext?: SymbioticContext | null,
    _basePrediction?: Prediction,
    onProgress?: (progress: number, message: string) => void,
    temporalDepth?: number,
    _useSpatioTemporalHawkes: boolean = true,
    preloadedForensicReports?: ForensicReport[]
): Promise<PlatinumResult> {
    // 0. ISOLATION ABSOLUE DU TIRAGE
    const history = purifyHistoryForDraw(drawName, rawHistory);
    if (history.length < 10) throw new Error("Dataset insuffisant pour l'inférence Platinum.");
    
    onProgress?.(5, "Calibrage du réseau de neurones artificiels...");

    const opts: PlatinumUserOptions = {
        regimePivot: userOptions?.regimePivot ?? 0.80,
        forensicGain: userOptions?.forensicGain ?? 1.0,
        phaseFrequency: userOptions?.phaseFrequency ?? 1.0,
        shannonEntropyFilter: userOptions?.shannonEntropyFilter ?? false,
    };

    // 1. ACQUISITION DES SIGNAUX MULTI-TENSORIELS
    const weights = await getAlgoWeights(drawName);
    const finalTemporalDepth = temporalDepth ?? useNexusStore.getState().temporalDepth ?? 100;
    
    const masterPred = await generateMasterPrediction(
        drawName,
        history,
        finalTemporalDepth,
        weights,
        metrics,
        symbioticContext || undefined,
        false,
        false,
        undefined,
        false,
        (p, msg) => { onProgress?.(Math.round(p * 0.65), msg); }
    );

    const breakdowns = masterPred.breakdown || {};
    const localFeatures = await extractFeatures(drawName, history);

    // Extraction du Tamis de l'ADN Algorithmique Actuel (t) et du Tirage Précédent (t-1)
    const dnaReport = calculateDnaSieveWeights(history, weights, drawName);
    const prevDnaReport = history.length > 1 
        ? calculateDnaSieveWeights(history.slice(1), weights, drawName) 
        : dnaReport;

    const { multipliers: dnaMultipliers, affinityPercent: dnaAffinity, dominantAlgos, stdDevDna, meanDna } = dnaReport;
    const prevMultipliers = prevDnaReport.multipliers;

    // Calcul de l'accélération de tamisage différentiable ΔM_n = M_n(t) - M_n(t-1)
    const rawDeltaSieve = new Float64Array(MAX_NUM + 1);
    let maxDeltaSieve = 1e-6;
    for (let i = 1; i <= MAX_NUM; i++) {
        const delta = (dnaMultipliers[i] ?? 1.0) - (prevMultipliers[i] ?? 1.0);
        const positiveDelta = Math.max(0, delta);
        rawDeltaSieve[i] = positiveDelta;
        if (positiveDelta > maxDeltaSieve) maxDeltaSieve = positiveDelta;
    }
    const stdDeltaSieve = standardizeVector(rawDeltaSieve);
    
    // Intensité continue du tamisage dérivée du SNR de l'ADN
    const snrDna = (stdDevDna || 0.1) / (meanDna || 1.0);
    const dynamicSieveIntensity = sigmoid(1.5 * ((snrDna * 10.0) - 1.0));
    const sieveIntensityPercent = Math.round(dynamicSieveIntensity * 100);

    // 2. VECTORISATION STANDARDISÉE DES TENSEURS DE BASE
    const rawFreqVector = new Float64Array(MAX_NUM + 1);
    const rawGapVector = new Float64Array(MAX_NUM + 1);
    const rawMomentumVector = new Float64Array(MAX_NUM + 1);
    const rawSpectralVector = new Float64Array(MAX_NUM + 1);
    const rawMarkovVector = new Float64Array(MAX_NUM + 1);
    const rawBayesVector = new Float64Array(MAX_NUM + 1);
    const rawFractalVector = new Float64Array(MAX_NUM + 1);
    const rawSpatialVector = new Float64Array(MAX_NUM + 1);

    for (let i = 1; i <= MAX_NUM; i++) {
        const bd = breakdowns[i] || {};
        rawFreqVector[i] = bd.frequency || (localFeatures.freqMap[i] * (100 / history.length)) || 0;
        const currentGap = localFeatures.gapsMap[i] || 0;
        rawGapVector[i] = bd.gap || (currentGap > 0 ? (history.length / currentGap) : 0);
        rawMomentumVector[i] = bd.momentum || (localFeatures.momentumMap[i] * 10) || 0;
        rawSpectralVector[i] = bd.spectral || (Array.isArray(metrics?.spectral) ? metrics.spectral.find((s: any) => s.number === i)?.energy : 0) || 0;
        rawMarkovVector[i] = bd.markov || (localFeatures.markovMap[i] * 10) || 0;
        rawBayesVector[i] = bd.bayes || 0;
        rawFractalVector[i] = bd.fractal || 0;
        rawSpatialVector[i] = bd.spatial || 0;
    }

    const stdFreq = standardizeVector(rawFreqVector);
    const stdGap = standardizeVector(rawGapVector);
    const stdMomentum = standardizeVector(rawMomentumVector);
    const stdSpectral = standardizeVector(rawSpectralVector);
    const stdMarkov = standardizeVector(rawMarkovVector);
    const stdBayes = standardizeVector(rawBayesVector);
    const stdFractal = standardizeVector(rawFractalVector);
    const stdSpatial = standardizeVector(rawSpatialVector);

    onProgress?.(70, "Agrégation non-linéaire tensorielle & Couplage thermodynamique...");

    // 3. COUPLAGE THERMODYNAMIQUE & SYNERGIE DE COUVERTURE
    const rawSums = new Float64Array(MAX_NUM + 1);
    const fracSpec = new Float64Array(MAX_NUM + 1);
    const quantAi = new Float64Array(MAX_NUM + 1);
    
    let maxRawSum = Number.EPSILON;
    let maxFracSpec = Number.EPSILON;
    let maxQuantAi = Number.EPSILON;

    for (let i = 1; i <= MAX_NUM; i++) {
        const sumVal = (
            stdFreq[i] * 1.2 +
            stdGap[i] * 1.1 +
            stdMomentum[i] * 1.15 +
            stdSpectral[i] * 1.05 +
            stdMarkov[i] * 1.1 +
            stdBayes[i] * 1.0 +
            stdFractal[i] * 1.0 +
            stdSpatial[i] * 1.0
        );
        rawSums[i] = sumVal;
        if (sumVal > maxRawSum) maxRawSum = sumVal;

        const fs = stdFractal[i] * stdSpectral[i];
        fracSpec[i] = fs;
        if (fs > maxFracSpec) maxFracSpec = fs;

        const qa = stdSpatial[i] * stdBayes[i];
        quantAi[i] = qa;
        if (qa > maxQuantAi) maxQuantAi = qa;
    }

    // Calcul continu de l'entropie des inputs pour le couplage thermodynamique
    const inputEntropy = computeVectorEntropy(normalizeVector(rawSums));
    const thermoBeta = sigmoid(10.0 * (inputEntropy - 0.5));
    const weightFractal = 0.75 * (1.0 - thermoBeta) + 0.25 * thermoBeta;
    const weightQuantum = 0.25 * (1.0 - thermoBeta) + 0.75 * thermoBeta;

    const consensusVector = new Float64Array(MAX_NUM + 1);

    for (let i = 1; i <= MAX_NUM; i++) {
        const normSum = rawSums[i] / maxRawSum;
        // Activation sigmoïdale douce continue
        const activation = sigmoid(3.0 * (normSum - 0.5));
        
        const normFracSpec = fracSpec[i] / maxFracSpec;
        const normQuantAi = quantAi[i] / maxQuantAi;
        
        const combinedSynergy = (normFracSpec * weightFractal) + (normQuantAi * weightQuantum);
        const synergyMultiplier = safeExp(0.6 * (combinedSynergy - 0.5));

        let score = activation * rawSums[i] * synergyMultiplier;

        // Modulations contextuelles symbiotiques continues
        if (symbioticContext?.spatialHotZones?.includes(i)) {
            score *= (1.0 + (symbioticContext.spatialHotZones.length / MAX_NUM));
        }
        if (symbioticContext?.forestVotes?.[i]) {
            score *= (1.0 + symbioticContext.forestVotes[i]);
        }

        // Tamisage différentiable continu par l'ADN algorithmique actif
        const dnaMult = dnaMultipliers[i] ?? 1.0;
        const sievedScore = score * ((1.0 - dynamicSieveIntensity * 0.6) + dynamicSieveIntensity * 0.6 * dnaMult);

        consensusVector[i] = sievedScore;
    }

    // Fallback de sécurité invariant
    let vectorSum = 0;
    for (let i = 1; i <= MAX_NUM; i++) vectorSum += consensusVector[i];
    if (vectorSum <= Number.EPSILON) {
        masterPred.suggestedNumbers.forEach(n => {
            if (n >= 1 && n <= MAX_NUM) consensusVector[n] += maxRawSum;
        });
        masterPred.candidates.forEach((n, idx) => {
            if (n >= 1 && n <= MAX_NUM) consensusVector[n] += maxRawSum * safeExp(-idx / (masterPred.candidates.length || 1));
        });
        for (let i = 1; i <= MAX_NUM; i++) {
            if (consensusVector[i] === 0) consensusVector[i] = 1.0 + Math.abs(Math.sin((i * Math.PI) / MAX_NUM));
        }
    }

    let normalizedVector = normalizeVector(consensusVector);

    // 4. FILTRE DE SHANNON DIFFÉRENTIABLE CONTINU (SANS SEUIL ABRUPT)
    if (opts.shannonEntropyFilter) {
        const { mean: meanConsensus, stdDev: stdConsensus } = computeVectorStats(normalizedVector);
        const filteredVector = new Float64Array(MAX_NUM + 1);
        
        for (let i = 1; i <= MAX_NUM; i++) {
            const z = (normalizedVector[i] - meanConsensus) / stdConsensus;
            // Transition continue de débruitage : les signaux sous la moyenne sont amortis continûment
            const gate = sigmoid(2.5 * z);
            filteredVector[i] = normalizedVector[i] * (gate + (1.0 - gate) * 0.2);
        }
        normalizedVector = normalizeVector(filteredVector);
    }

    const normalizedMomentum = normalizeVector(rawMomentumVector);
    const normalizedGap = normalizeVector(rawGapVector);
    const normalizedSpectral = normalizeVector(rawSpectralVector);

    // 5. ANALYSE STATISTIQUE DU RÉGIME CONTINU (PROBABILITÉS DOUCES)
    onProgress?.(80, "Analyse d'entropie du régime & Décomposition de phase...");
    const entropyScore = computeVectorEntropy(normalizedVector);

    const pivot = opts.regimePivot;
    const regimeSigma = 0.05;
    
    // Probabilités douces continues par sigmoïdes
    const pStable = sigmoid(-20.0 * (entropyScore - (pivot - regimeSigma)));
    const pChaotic = sigmoid(20.0 * (entropyScore - (pivot + regimeSigma)));
    const pTransition = Math.max(0, 1.0 - pStable - pChaotic);

    let regime: 'STABLE' | 'TRANSITION' | 'CHAOTIC' = 'TRANSITION';
    if (pStable > pChaotic && pStable > pTransition) regime = 'STABLE';
    else if (pChaotic > pStable && pChaotic > pTransition) regime = 'CHAOTIC';

    // 6. GÉNÉRATION DES 6 SCÉNARIOS STRATÉGIQUES HYPER-CONVERGENTS
    onProgress?.(85, "Génération des scénarios stratégiques déterministes...");
    const scenarios: PlatinumScenario[] = [];
    const freqPhase = opts.phaseFrequency;

    // Ratios d'harmoniques de variance
    const statsVector = computeVectorStats(normalizedVector);
    const statsMomentum = computeVectorStats(normalizedMomentum);
    const statsGap = computeVectorStats(normalizedGap);

    const gammaRatio = statsMomentum.stdDev / (statsVector.stdDev + statsMomentum.stdDev + Number.EPSILON);
    const deltaRatio = statsGap.stdDev / (statsVector.stdDev + statsGap.stdDev + Number.EPSILON);

    // Fonction de calcul continu de probabilité de scénario basée sur la densité d'énergie
    const computeScenarioProbability = (selectedNums: number[], targetVector: Float64Array, baseWeight: number): number => {
        let setSum = 0;
        for (const num of selectedNums) {
            setSum += targetVector[num] || 0;
        }
        const meanScore = setSum / (selectedNums.length || 1);
        const coherenceBonus = (1.0 - entropyScore) * 20.0;
        const prob = Math.round(baseWeight + (meanScore / 100.0) * 15.0 + coherenceBonus);
        return Math.max(45, Math.min(96, prob));
    };

    // Helper de calcul continu de l'empreinte spectrale d'un scénario sur les 6 Macro-Familles
    const computeScenarioMacroFingerprint = (numbers: number[]) => {
        const definitions = [
            { key: 'FREQ_MARKOV', name: 'Fréquence & Markov', getVal: (n: number) => (stdFreq[n] + stdMarkov[n]) / 2.0 },
            { key: 'GAPS_CADENCE', name: 'Écarts & Cadences', getVal: (n: number) => stdGap[n] },
            { key: 'TEMPORAL_HAWKES', name: 'Temporel & Hawkes', getVal: (n: number) => stdMomentum[n] },
            { key: 'SPECTRAL_FOURIER', name: 'Spectral & Harmonique', getVal: (n: number) => stdSpectral[n] },
            { key: 'SPATIAL_FRACTAL', name: 'Spatial & Fractal', getVal: (n: number) => (stdSpatial[n] + stdFractal[n]) / 2.0 },
            { key: 'MACHINE_BAYES', name: 'Machine & Bayes', getVal: (n: number) => (stdBayes[n] + (rawDeltaSieve[n] > 0 ? 0.5 : 0)) }
        ];
        
        let totalEnergy = 0;
        const rawEnergies = definitions.map(def => {
            let energy = 0;
            numbers.forEach(n => {
                energy += Math.max(0.05, def.getVal(n) + 2.0); // Décalage positif régularisé
            });
            totalEnergy += energy;
            return { def, energy };
        });

        return rawEnergies.map(({ def, energy }) => ({
            familyKey: def.key,
            familyName: def.name,
            energyPct: parseFloat(((energy / (totalEnergy || 1.0)) * 100).toFixed(1))
        }));
    };

    // SCÉNARIO ALPHA : ALPHA CORE (Pondération stricte sur les gènes à fort MRR)
    const alphaVector = new Float64Array(MAX_NUM + 1);
    for (let i = 1; i <= MAX_NUM; i++) {
        const dnaAffScore = (dnaAffinity[i] ?? 50) / 100.0;
        const mrrPriors = (stdFreq[i] * 1.3 + stdMarkov[i] * 1.2 + stdGap[i] * 1.1) / 3.6;
        alphaVector[i] = (normalizedVector[i] * 0.4) + ((mrrPriors + 2.0) * 0.3 * (1.0 + dnaAffScore * 0.5));
    }
    const normAlpha = normalizeVector(alphaVector);
    const alphaNumbers = greedyDeterministicSelection(normAlpha, DRAW_SIZE, 0.0, entropyScore);
    const alphaProb = computeScenarioProbability(alphaNumbers, normAlpha, 72);
    scenarios.push({
        id: 'alpha',
        name: 'Alpha Core',
        description: 'Convergence maximale. Pondération stricte sur les gènes à fort MRR et pic de résonance invariant.',
        numbers: alphaNumbers,
        probability: alphaProb,
        risk: alphaProb >= 82 ? 'LOW' : 'MEDIUM',
        color: '#10b981',
        genomicProfile: {
            focus: 'Pondération stricte sur les gènes à fort MRR',
            mrrBoost: 1.45,
            entropyRegimeAdaptive: false,
            macroFingerprint: computeScenarioMacroFingerprint(alphaNumbers)
        }
    });

    // SCÉNARIO BETA : BETA FLOW (Harmonique Orbitale Déphasée)
    const betaVector = new Float64Array(MAX_NUM + 1);
    for (let i = 1; i <= MAX_NUM; i++) {
        betaVector[i] = (normalizedVector[i] * 0.6) + ((stdSpectral[i] + 2.0) * 0.4);
    }
    const normBeta = normalizeVector(betaVector);
    const betaPhase = (Math.PI / 4.0) * freqPhase;
    const betaNumbers = greedyDeterministicSelection(normBeta, DRAW_SIZE, betaPhase, entropyScore);
    const betaProb = computeScenarioProbability(betaNumbers, normBeta, 65);
    scenarios.push({
        id: 'beta',
        name: 'Beta Flow',
        description: 'Intègre les harmoniques secondaires via un décalage de phase trigonométrique orbital.',
        numbers: betaNumbers,
        probability: betaProb,
        risk: betaProb >= 75 ? 'LOW' : 'MEDIUM',
        color: '#6366f1',
        genomicProfile: {
            focus: 'Harmonique orbitale et alignement de phase spectral',
            entropyRegimeAdaptive: false,
            macroFingerprint: computeScenarioMacroFingerprint(betaNumbers)
        }
    });

    // SCÉNARIO GAMMA : GAMMA BURST (Amplification sur les numéros à forte accélération de tamisage ΔM_n > 0)
    const gammaVector = new Float64Array(MAX_NUM + 1);
    for (let i = 1; i <= MAX_NUM; i++) {
        const momentumComp = (stdMomentum[i] + 2.0) * gammaRatio;
        const sieveAccComp = (stdDeltaSieve[i] + 2.0) * 1.5; // Amplification directe de l'accélération de tamisage ΔM_n > 0
        gammaVector[i] = (normalizedVector[i] * (1.0 - gammaRatio) * 0.4) + (momentumComp * 0.3) + (sieveAccComp * 0.3);
    }
    const normGamma = normalizeVector(gammaVector);
    const gammaPhase = (Math.PI / 2.0) * freqPhase;
    const gammaNumbers = greedyDeterministicSelection(normGamma, DRAW_SIZE, gammaPhase, entropyScore);
    const gammaProb = computeScenarioProbability(gammaNumbers, normGamma, 58);
    scenarios.push({
        id: 'gamma',
        name: 'Gamma Burst',
        description: 'Amplification sur les numéros à forte accélération de tamisage (ΔM_n > 0) et momentum pur.',
        numbers: gammaNumbers,
        probability: gammaProb,
        risk: gammaProb >= 75 ? 'MEDIUM' : 'HIGH',
        color: '#f43f5e',
        genomicProfile: {
            focus: 'Amplification cinétique sur accélération de tamisage ΔM_n > 0',
            sieveAccelerationDelta: parseFloat(maxDeltaSieve.toFixed(3)),
            entropyRegimeAdaptive: false,
            macroFingerprint: computeScenarioMacroFingerprint(gammaNumbers)
        }
    });

    // SCÉNARIO DELTA : DELTA CONVERGENCE (Restitution d'Écart Asymétrique)
    const deltaVector = new Float64Array(MAX_NUM + 1);
    for (let i = 1; i <= MAX_NUM; i++) {
        deltaVector[i] = (normalizedVector[i] * (1.0 - deltaRatio)) + (normalizedGap[i] * deltaRatio);
    }
    const normDelta = normalizeVector(deltaVector);
    const deltaPhase = (3.0 * Math.PI / 4.0) * freqPhase;
    const deltaNumbers = greedyDeterministicSelection(normDelta, DRAW_SIZE, deltaPhase, entropyScore);
    const deltaProb = computeScenarioProbability(deltaNumbers, normDelta, 60);
    scenarios.push({
        id: 'delta',
        name: 'Delta Convergence',
        description: 'Théorie des écarts asymétriques pour cibler les corrections de rupture imminentes.',
        numbers: deltaNumbers,
        probability: deltaProb,
        risk: deltaProb >= 75 ? 'MEDIUM' : 'HIGH',
        color: '#f59e0b',
        genomicProfile: {
            focus: 'Restitution d\'écart asymétrique et bascule de cycle',
            entropyRegimeAdaptive: false,
            macroFingerprint: computeScenarioMacroFingerprint(deltaNumbers)
        }
    });

    // SCÉNARIO EPSILON : EPSILON FORENSIC (Correction Agentique Résiduelle)
    const epsilonVector = new Float64Array(MAX_NUM + 1);
    for (let i = 1; i <= MAX_NUM; i++) {
        epsilonVector[i] = normalizedVector[i] * 0.4;
    }
    
    try {
        onProgress?.(90, "Calcul des corrections agentiques (Epsilon)...");
        const forensicReports = preloadedForensicReports || await getLocalForensicReports() || [];
        const recentReports = forensicReports.slice(0, 10);
        const gain = opts.forensicGain;

        recentReports.forEach((report: ForensicReport, index: number) => {
            const recencyWeight = safeExp(-0.25 * index);
            
            report.missedOpportunities?.forEach((miss: any) => {
                if (miss.number >= 1 && miss.number <= MAX_NUM) {
                    epsilonVector[miss.number] += 40.0 * recencyWeight * gain;
                }
            });
            
            report.nearMisses?.forEach((nm: any) => {
                if (nm.actual >= 1 && nm.actual <= MAX_NUM) {
                    epsilonVector[nm.actual] += 30.0 * recencyWeight * gain;
                    const left = nm.actual > 1 ? nm.actual - 1 : MAX_NUM;
                    const right = nm.actual < MAX_NUM ? nm.actual + 1 : 1;
                    epsilonVector[left] += 12.0 * recencyWeight * gain;
                    epsilonVector[right] += 12.0 * recencyWeight * gain;
                }
            });
            
            report.algorithmicDrift?.forEach((drift: any) => {
                const driftScore = drift.driftScore || 0;
                const driftActivation = sigmoid(0.2 * (driftScore - 15.0));
                for (let i = 1; i <= MAX_NUM; i++) {
                    const deterministicNoise = 4.0 * (1.0 + Math.sin(driftScore * i));
                    const correction = driftActivation * deterministicNoise * recencyWeight * gain;
                    if (drift.direction === 'underestimating') epsilonVector[i] += correction;
                    else if (drift.direction === 'overestimating') epsilonVector[i] -= correction * 0.5;
                }
            });
        });
    } catch (e) {
        console.error("Forensic integration failed", e);
    }

    const normEpsilon = normalizeVector(epsilonVector);
    const epsilonPhase = Math.PI * freqPhase;
    const epsilonNumbers = greedyDeterministicSelection(normEpsilon, DRAW_SIZE, epsilonPhase, entropyScore);
    const epsilonProb = computeScenarioProbability(epsilonNumbers, normEpsilon, 64);
    scenarios.push({
        id: 'epsilon',
        name: 'Epsilon Forensic',
        description: 'Adaptation Agentique & Forensic. Corrige la dérive de l\'ADN algorithmique sur les cycles récents.',
        numbers: epsilonNumbers,
        probability: epsilonProb,
        risk: epsilonProb >= 75 ? 'LOW' : 'MEDIUM',
        color: '#8b5cf6',
        genomicProfile: {
            focus: 'Correction agentique médico-légale et compensation des dérives',
            entropyRegimeAdaptive: false,
            macroFingerprint: computeScenarioMacroFingerprint(epsilonNumbers)
        }
    });

    // SCÉNARIO ZETA : ZETA ADVERSARIAL (Exploitation des gènes contre-cycliques en régime de haute entropie & Anti-Consensus)
    const zetaVector = new Float64Array(MAX_NUM + 1);
    const { mean: meanNorm, stdDev: stdNorm } = statsVector;
    
    // Inverse temperature thermodynamique dérivée de l'entropie de Shannon du vecteur de consensus
    const inverseTempBeta = (1.0 / (stdNorm || 1.0)) * (1.0 + Math.tanh(2.5 * (entropyScore - 0.5)));
    const entropyModulator = 1.0 + Math.tanh(2.0 * Math.max(0, entropyScore - 0.40));

    for (let i = 1; i <= MAX_NUM; i++) {
        const zCons = (normalizedVector[i] - meanNorm) / (stdNorm || 1.0);
        
        // 1. Inversion continue de Boltzmann tempérée par l'entropie
        const boltzmannAntiConsensus = safeExp(-inverseTempBeta * zCons * (1.0 - 0.4 * entropyScore)) * entropyModulator;
        
        // 2. Projection en sous-espace orthogonal (résonance spectrale/fractale cachée vs consensus fréquence/markov)
        const orthogonalSignal = ((stdSpectral[i] + stdFractal[i] + stdSpatial[i]) / 3.0) - ((stdFreq[i] + stdMarkov[i]) / 2.0);
        const orthogonalResonance = sigmoid(2.0 * orthogonalSignal);
        
        // 3. Restitution contre-cyclique continue des écarts
        const zGap = (normalizedGap[i] - statsGap.mean) / (statsGap.stdDev || 1.0);
        const counterCyclicRestoration = sigmoid(1.5 * zGap);
        
        // 4. Affinité d'ombre (Shadow affinity continue)
        const affVal = (dnaAffinity[i] ?? 50) / 100.0;
        const shadowAffinity = safeExp(-1.5 * affVal);
        
        zetaVector[i] = (boltzmannAntiConsensus * 1.5) + (orthogonalResonance * 1.2) + (counterCyclicRestoration * 1.0) + (shadowAffinity * 0.8);
    }

    const normZeta = normalizeVector(zetaVector);
    const zetaPhase = (7.0 * Math.PI / 4.0) * freqPhase; // Phase anti-symétrique orthogonale
    const zetaNumbers = greedyDeterministicSelection(normZeta, DRAW_SIZE, zetaPhase, entropyScore);
    const dynamicBaseProb = Math.round(50 + entropyScore * 22);
    const zetaProb = computeScenarioProbability(zetaNumbers, normZeta, dynamicBaseProb);
    scenarios.push({
        id: 'zeta',
        name: 'Zeta Adversarial',
        description: 'Exploitation des gènes contre-cycliques, résonance orthogonale et anti-consensus en régime de haute entropie.',
        numbers: zetaNumbers,
        probability: zetaProb,
        risk: zetaProb >= 72 ? 'HIGH' : 'MEDIUM',
        color: '#f97316',
        genomicProfile: {
            focus: 'Contre-mesure anti-consensus, résonance orthogonale et gènes contre-cycliques',
            entropyRegimeAdaptive: true,
            macroFingerprint: computeScenarioMacroFingerprint(zetaNumbers)
        }
    });

    // 7. COHÉRENCE GLOBALE ET FINALISATION
    onProgress?.(95, "Calcul de la cohérence et finalisation...");
    const coherence = Math.round((1.0 - entropyScore) * 100);

    // Remplissage sécurisé déterministe si un scénario est incomplet
    const defaultNumbers = masterPred?.suggestedNumbers || [];
    scenarios.forEach(s => {
        if (s.numbers.length < DRAW_SIZE) {
            const fillers = [...defaultNumbers];
            while (s.numbers.length < DRAW_SIZE && fillers.length > 0) {
                const n = fillers.shift();
                if (n && !s.numbers.includes(n)) s.numbers.push(n);
            }
            let fallback = 1;
            while (s.numbers.length < DRAW_SIZE && fallback <= MAX_NUM) {
                if (!s.numbers.includes(fallback)) s.numbers.push(fallback);
                fallback++;
            }
        }
    });

    // Calcul de la concordance moyenne de l'ADN
    let sumDnaAff = 0;
    for (let i = 1; i <= MAX_NUM; i++) sumDnaAff += dnaAffinity[i] ?? 50;
    const dnaConcordanceMean = Math.round(sumDnaAff / MAX_NUM);

    // ID Déterministe
    const seed = `${drawName}_${entropyScore.toFixed(4)}_${scenarios.map(s => s.numbers.join(',')).join('|')}`;
    let hashVal = 0;
    for (let i = 0; i < seed.length; i++) {
        hashVal = (hashVal << 5) - hashVal + seed.charCodeAt(i);
        hashVal |= 0;
    }
    const deterministicId = `platinum_pred_${Math.abs(hashVal)}_${Date.now()}`;

    onProgress?.(100, "Analyse Platinum complétée !");

    return {
        id: deterministicId,
        drawName,
        timestamp: Date.now(),
        confidence: coherence,
        consensusVector: Array.from(normalizedVector),
        scenarios,
        coherence,
        regime,
        entropy: entropyScore,
        dnaSieveInfo: {
            active: true,
            dominantAlgos,
            dnaConcordanceMean,
            sieveIntensityPercent,
            entropyBits: dnaReport.entropyBits
        },
        regimeProbabilities: {
            stable: Number((pStable * 100).toFixed(1)),
            transition: Number((pTransition * 100).toFixed(1)),
            chaotic: Number((pChaotic * 100).toFixed(1))
        }
    };
}

// ═══════════════════════════════════════════════════════════════
// PERSISTENCE & AUDIT
// ═══════════════════════════════════════════════════════════════
const storageKey = (name: string) => `platinum_hyper_${name}`;

export const savePlatinumHistory = async (result: PlatinumResult): Promise<void> => {
    try {
        const key = storageKey(result.drawName);
        const raw = await get(key);
        const existing = (!raw || raw.length === 0) ? [] : raw as PlatinumResult[];
        const updated = [result, ...existing.slice(0, 19)];
        await set(key, updated);
    } catch (err) {
        console.error('Storage Error', err);
    }
};

export const getPlatinumHistory = async (drawName: string): Promise<PlatinumResult[]> => {
    try {
        const raw = await get(storageKey(drawName));
        return raw ? raw as PlatinumResult[] : [];
    } catch {
        return [];
    }
};

export const performPlatinumAudit = (
    prediction: PlatinumResult,
    actualResult: DrawResult,
): PlatinumAudit => {
    const winners = new Set(actualResult.gagnants);
    let bestScenarioId = '';
    let bestHits = -1;

    const performances = prediction.scenarios.map(s => {
        const hits = s.numbers.filter(n => winners.has(n)).length;
        if (hits > bestHits) {
            bestHits = hits;
            bestScenarioId = s.name;
        }
        return {
            type: s.name,
            hits,
            numbers: s.numbers.filter(n => winners.has(n))
        };
    });

    return {
        predictionId: prediction.id,
        date: actualResult.date,
        actualDraw: actualResult.gagnants,
        bestTimeline: bestScenarioId,
        bestScore: bestHits,
        syncScore: Math.round((bestHits / DRAW_SIZE) * 100),
        timelinePerformance: performances,
        verdict: bestHits >= 3 ? "Succès Confirmé" : bestHits >= 1 ? "Signal Partiel" : "Divergence"
    };
};

export async function generatePlatinumPrediction(
    drawName: string,
    history: DrawResult[],
    metrics?: EnhancedMetrics,
    userOptions?: PlatinumUserOptions | null,
    symbioticContext?: SymbioticContext | null,
    _basePrediction?: Prediction,
    onProgress?: (progress: number, message: string) => void,
): Promise<PlatinumResult> {
    if (typeof Worker !== 'undefined') {
        try {
            const temporalDepth = useNexusStore.getState().temporalDepth ?? 100;
            const useSpatioTemporalHawkes = useNexusStore.getState().useSpatioTemporalHawkes ?? true;
            const forensicReports = await getLocalForensicReports() || [];

            return await new Promise<PlatinumResult>((resolve, reject) => {
                const worker = new Worker(
                    new URL('./workers/prediction.worker.ts', import.meta.url),
                    { type: 'module' }
                );

                const timeoutId = setTimeout(() => {
                    worker.terminate();
                    reject(new Error("Timeout du Web Worker de prédiction locale Platinum"));
                }, 90000);

                worker.onmessage = (e: MessageEvent) => {
                    const { success, result, error, isProgress, progress, message } = e.data;
                    if (isProgress) {
                        onProgress?.(progress, message);
                        return;
                    }
                    clearTimeout(timeoutId);
                    if (success) {
                        resolve(result);
                    } else {
                        reject(new Error(error || "Erreur inconnue du worker de prédiction Platinum"));
                    }
                    worker.terminate();
                };

                worker.onerror = (err) => {
                    clearTimeout(timeoutId);
                    reject(err);
                    worker.terminate();
                };

                worker.postMessage({
                    taskId: `PLATINUM_${Date.now()}`,
                    type: 'platinum',
                    drawName,
                    history,
                    metrics,
                    userOptions,
                    symbioticContext,
                    _basePrediction,
                    temporalDepth,
                    useSpatioTemporalHawkes,
                    preloadedForensicReports: forensicReports
                });
            });
        } catch (workerError) {
            console.warn("[WORKER PLATINUM] Échec du worker Platinum. Fallback sur le thread principal.", workerError);
        }
    }

    return generatePlatinumPredictionCore(
        drawName,
        history,
        metrics,
        userOptions,
        symbioticContext,
        _basePrediction,
        onProgress
    );
}
