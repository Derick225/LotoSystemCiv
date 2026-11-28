import { buildAlgoBundle } from './predictionFacade';
import { extractFeatures } from './featureExtractor';
import { calculateScores, applyPCADenoising } from './scoringEngine';
import { calculateGeneticDiversityIndex } from './diversityService';
import { DrawResult, AlgoWeights, Prediction } from '../../types';
import { EnhancedMetrics } from './metrics.types';
import { SymbioticContext } from '../../types';
import { AlgoKey } from '../../shared/prediction.types';
import { DNAOptimizer } from '../training/DNAOptimizer';
import { ParkMillerLCG } from './deterministicCore';
import { calculateShannonEntropy } from '../mathService';
import { getCalibratedHyperparameters, normalizeWeights } from './weightsManager';
import { generateXAPNarratives } from './xapExplainabilityService';
import { generateProbabilisticScenarioMatrix, ScenarioCoherenceCalibration, HONEST_NOTE } from './predictionScenarios';
import { computeWalkForwardCalibrationHpc } from '../wasm/lotoEngineBridge';
import {
    deriveSkillShrinkage,
    shrinkProbabilityVector,
    summarizePredictionEdge,
} from './empiricalSkillCalibration';
import { DRAW_DOMAIN_SIZE, DRAW_PICK_SIZE } from '../../shared/drawTheory';

export const runMonteCarloMcmcCore = async (
    drawName: string,
    history: DrawResult[],
    temporalDepth: number,
    specificWeights: AlgoWeights,
    metrics: EnhancedMetrics,
    symbioticContext: SymbioticContext | undefined,
    adversarialMode: boolean,
    isForensicOptimized: boolean,
    resolvedMcIterations: number,
    resolvedNoiseLevel: number,
    resolvedLearningRate: number,
    onProgress: (progress: number, message: string) => void
): Promise<Prediction> => {
    if (!history || history.length === 0) {
        throw new Error(`Calcul MCMC refusé pour '${drawName}' : aucun tirage réel n'est disponible en base.`);
    }

    const lastDraw = history[0];
    const parsedTime = lastDraw?.date ? new Date(lastDraw.date).getTime() : NaN;
    const timestampDernierTirage = !isNaN(parsedTime) && parsedTime > 0 ? parsedTime : (history.length * 86400000 + (drawName.length * 1000));
    const seedString = `${drawName}_${timestampDernierTirage}`;
    const pmLcg = new ParkMillerLCG(seedString);
    const nextRandom = () => pmLcg.nextFloat();
    
    let currentStateVector = new Float32Array(Object.keys(specificWeights).length);
    Object.keys(specificWeights).forEach((k, idx) => {
        currentStateVector[idx] = (specificWeights as any)[k] || 0;
    });
    let currentEnergy = -Infinity;
    let currentPred: Prediction | null = null;
    
    const counts: Record<number, number> = {};
    const breakdownAcc: Record<number, Record<string, number>> = {};

    onProgress(10, "Pré-calcul des métriques et features (Zéro-copy)...");
    const useSpatioTemporalHawkes = true;
    const baseBundle = await buildAlgoBundle(history, drawName, useSpatioTemporalHawkes);
    const baseFeatures = await extractFeatures(drawName, history);
    
    for (let i = 0; i < resolvedMcIterations; i++) {
        if (i % 5 === 0) onProgress(Math.round((i / resolvedMcIterations) * 85), `MCMC Metropolis-Hastings (${i}/${resolvedMcIterations})...`);
        
        const proposedVector = new Float32Array(currentStateVector.length);
        let sumWeights = 0;
        Object.keys(specificWeights).forEach((_, idx) => {
            const u1 = Math.max(Number.EPSILON, nextRandom());
            const u2 = Math.max(Number.EPSILON, nextRandom());
            const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
            
            const noise = z0 * 0.1 * resolvedNoiseLevel;
            proposedVector[idx] = Math.max(0.01, currentStateVector[idx] * (1.0 + noise));
            sumWeights += proposedVector[idx];
        });
        for(let j=0; j<proposedVector.length; j++) proposedVector[j] /= sumWeights;

        const perturbedWeights = {} as AlgoWeights;
        Object.keys(specificWeights).forEach((k, idx) => {
            (perturbedWeights as any)[k] = proposedVector[idx];
        });

        // Inférence avec drawName explicitement injecté pour l'isolation et la conformité machine
        const scoredNumbers = calculateScores(baseFeatures, perturbedWeights, baseBundle, history, 0.90, drawName);
        const suggestedNumbers = scoredNumbers.slice(0, 5).map(s => s.num).sort((a,b)=>a-b);
        const candidates = scoredNumbers.slice(5, 15).map(s => s.num);

        const breakdown: Record<number, Record<string, number>> = {};
        scoredNumbers.forEach(s => { breakdown[s.num] = s.breakdown || {}; });

        const pred: Prediction = {
            suggestedNumbers,
            candidates,
            breakdown,
            confidence: 50,
            analysis: "MCMC Iteration",
            timestamp: Date.now(),
            diversityMetrics: calculateGeneticDiversityIndex(suggestedNumbers, breakdown)
        };

        // Log-likelihood objective: log-scores for top-5 with entropy regularization
        const totalScore = scoredNumbers.reduce((s, x) => s + x.score, 0) || 1;
        let logLikelihood = 0;
        suggestedNumbers.forEach(n => {
            const s = scoredNumbers.find(x => x.num === n);
            const p = Math.max(Number.EPSILON, (s?.score || 0) / totalScore);
            logLikelihood += Math.log(p);
        });
        const entropyPenalty = scoredNumbers.reduce((acc, x) => {
            const p = Math.max(Number.EPSILON, x.score / totalScore);
            return acc - p * Math.log(p);
        }, 0);
        const proposedEnergy = logLikelihood + 0.1 * entropyPenalty;

        if (i === 0) {
            currentStateVector = proposedVector;
            currentEnergy = proposedEnergy;
            currentPred = pred;
        } else {
            const beta = 1.0 / (resolvedLearningRate + 0.01);
            const acceptanceRatio = Math.min(1.0, Math.exp(beta * (proposedEnergy - currentEnergy)));
            const transitionProb = nextRandom();

            if (transitionProb < acceptanceRatio) {
                currentStateVector = proposedVector;
                currentEnergy = proposedEnergy;
                currentPred = pred;
            }
        }

        if (currentPred) {
            currentPred.suggestedNumbers.forEach(n => {
                counts[n] = (counts[n] || 0) + 1;
                if (!breakdownAcc[n] && currentPred!.breakdown[n]) {
                    breakdownAcc[n] = { ...currentPred!.breakdown[n] };
                }
            });
        }
    }

    onProgress(90, "Synthèse vectorielle et convergence Platt...");

    const topCands = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(x => Number(x[0]));
        
    const top5 = topCands.slice(0, 5).sort((a,b) => a - b);
    const candidates = topCands.slice(5, 15);

    // Évaluation de l'alignement ADN historique
    const activeWeights = specificWeights;
    const optimizer = new DNAOptimizer(Object.keys(activeWeights) as AlgoKey[]);
    const dnaMatrix = top5.map(num => {
        const bdown = breakdownAcc[num] || {};
        const vec = new Float32Array(optimizer['numAlgos']);
        optimizer['algoKeys'].forEach((k, idx) => { vec[idx] = bdown[k] || 0; });
        return vec;
    });

    const historicalVectors: Float32Array[] = [];
    const sampleDepth = Math.min(temporalDepth || 30, history.length);
    for (let i = 0; i < sampleDepth; i++) {
        const winners = history[i]?.gagnants || [];
        winners.forEach(w => {
            const bdown = breakdownAcc[w] || {};
            const vec = new Float32Array(optimizer['numAlgos']);
            optimizer['algoKeys'].forEach((k, idx) => { vec[idx] = bdown[k] || 0; });
            historicalVectors.push(vec);
        });
    }

    let calculatedAlignment: number | undefined; 
    if (historicalVectors.length > 0 && dnaMatrix.length > 0) {
        try {
            const targetProfile = optimizer.extractTargetDNAProfile(historicalVectors, sampleDepth);
            const evaluation = optimizer.evaluateCandidate(dnaMatrix, targetProfile, top5, history.map(h => h.gagnants || []));
            calculatedAlignment = Math.round(100 * Math.exp(-evaluation.distance));
        } catch(e) {
            console.warn("[MC] DNA Evaluation bypassed:", e);
        }
    }

    // Calcul des scores finaux optimaux avec poids MCMC
    const finalWeights = {} as AlgoWeights;
    Object.keys(specificWeights).forEach((k, idx) => {
        (finalWeights as any)[k] = currentStateVector[idx] || (specificWeights as any)[k];
    });
    const rawFinalScores = calculateScores(baseFeatures, normalizeWeights(finalWeights), baseBundle, history, 0.90, drawName);
    const finalScores = await applyPCADenoising(rawFinalScores, normalizeWeights(finalWeights), baseBundle, 0.90);

    // Calibrage empirique causal aligné sur predictionFinalize.ts (shrinkage H0 5/90 sans inflation)
    const boundedHistory = temporalDepth > 0 ? history.slice(0, temporalDepth) : history;
    const walkForwardCalibration = computeWalkForwardCalibrationHpc(drawName, 15, boundedHistory);
    const skillEstimate = deriveSkillShrinkage(walkForwardCalibration);

    const currentEntropyResult = calculateShannonEntropy(boundedHistory);
    const currentEntropy = currentEntropyResult.normalized;
    const calibratedParams = await getCalibratedHyperparameters(drawName, currentEntropy);
    const plattA = calibratedParams.sigmoid_slope;
    const plattB = calibratedParams.sigmoid_intercept;

    // Extraction des probabilités brutes post-PCA avec repli softmax canonique si absentes
    const rawProbabilityVector = new Array<number>(DRAW_DOMAIN_SIZE).fill(0);
    let hasExplainabilityProbs = false;
    finalScores.forEach((s) => {
        const idx = s.num - 1;
        const p = s.explainability?.calibratedProbability;
        if (idx >= 0 && idx < DRAW_DOMAIN_SIZE && typeof p === 'number' && Number.isFinite(p) && p > 0) {
            rawProbabilityVector[idx] = p;
            hasExplainabilityProbs = true;
        }
    });
    if (!hasExplainabilityProbs && finalScores.length > 0) {
        const maxS = Math.max(...finalScores.map((s) => s.score || 0));
        let sumExp = 0;
        const exps = new Array<number>(DRAW_DOMAIN_SIZE).fill(1);
        finalScores.forEach((s) => {
            const idx = s.num - 1;
            if (idx >= 0 && idx < DRAW_DOMAIN_SIZE) {
                const e = Math.exp((s.score || 0) - maxS);
                exps[idx] = e;
            }
        });
        for (let i = 0; i < DRAW_DOMAIN_SIZE; i++) sumExp += exps[i];
        const safeSum = sumExp > 0 ? sumExp : DRAW_DOMAIN_SIZE;
        for (let i = 0; i < DRAW_DOMAIN_SIZE; i++) {
            rawProbabilityVector[i] = (exps[i] / safeSum) * DRAW_PICK_SIZE;
        }
    }

    const probabilityVector = shrinkProbabilityVector(rawProbabilityVector, skillEstimate.shrinkage);
    const numberProbabilities: Record<number, number> = {};
    for (let n = 1; n <= DRAW_DOMAIN_SIZE; n++) {
        numberProbabilities[n] = probabilityVector[n - 1];
    }

    const edgeSummary = summarizePredictionEdge(probabilityVector, top5);
    const uniformMarginal = DRAW_PICK_SIZE / DRAW_DOMAIN_SIZE;
    const sumSelectedProbs = top5.reduce((sum, n) => sum + (numberProbabilities[n] || uniformMarginal), 0);
    const meanSelectedProb = top5.length > 0 ? sumSelectedProbs / top5.length : uniformMarginal;
    const expectedLift = parseFloat((meanSelectedProb / uniformMarginal).toFixed(3));
    const dynamicConfidence = Math.max(1, Math.min(99, Math.round(meanSelectedProb * 100)));

    const hasDisplayedRetention = skillEstimate.shrinkage > 0 && skillEstimate.shrinkage.toFixed(4) !== '0.0000';
    const skillEvidenceNote = !hasDisplayedRetention
        ? 'Aucun avantage prouvé (distribution neutre 5/90, lift 1.00x).'
        : `Skill out-of-fold mesuré (${skillEstimate.source}, n=${skillEstimate.evidenceDraws}) : BSS=${skillEstimate.pointEstimate.toFixed(4)}, σ=${Number.isFinite(skillEstimate.uncertainty) ? skillEstimate.uncertainty.toFixed(4) : 'n/d'}, rétention λ=${skillEstimate.shrinkage.toFixed(4)}, lift=${expectedLift.toFixed(2)}x.`;
    const honestConfidenceNote = `${HONEST_NOTE} ${skillEvidenceNote}`;

    // Construction des dictionnaires d'explicabilité pour les 90 numéros
    const scoresMap: Record<number, number> = {};
    const shapMap: Record<number, Record<string, number>> = {};
    const explainabilityRecord: Record<number, any> = {};

    finalScores.forEach(s => {
        scoresMap[s.num] = s.score;
        shapMap[s.num] = s.explainability?.shapValues || {};
        explainabilityRecord[s.num] = {
            shapValues: s.explainability?.shapValues || {},
            topologicalTension: s.explainability?.topologicalTension || 0,
            dnaOrbitingIndex: s.explainability?.dnaOrbitingIndex || 0,
            narrativeInterpretation: s.explainability?.narrativeInterpretation,
            rawCalibratedProbability: rawProbabilityVector[s.num - 1],
            calibratedProbability: probabilityVector[s.num - 1],
            skillShrinkage: skillEstimate.shrinkage,
        };
    });

    // Génération XAP pour le Top 5 et les 10 candidats
    const numbersToExplain = Array.from(new Set([...top5, ...candidates]));
    const xapExplanations = generateXAPNarratives(
        numbersToExplain,
        scoresMap,
        shapMap,
        explainabilityRecord,
        { shrinkage: skillEstimate.shrinkage, brierSkillScore: skillEstimate.pointEstimate }
    );

    numbersToExplain.forEach(num => {
        if (xapExplanations[num]) {
            if (!explainabilityRecord[num]) {
                explainabilityRecord[num] = {
                    shapValues: shapMap[num] || {},
                    topologicalTension: 0,
                    dnaOrbitingIndex: 0
                };
            }
            explainabilityRecord[num].narrativeInterpretation = xapExplanations[num].narrativeText;
            explainabilityRecord[num].physicsArchetype = xapExplanations[num].physicsArchetype;
            explainabilityRecord[num].topDrivers = xapExplanations[num].topDrivers;
        }
    });

    onProgress(98, "Formulation des scénarios et quantification de l'incertitude...");

    // Matrice de simulation multi-scénarios déterministe (multiplicateur shrinké par la preuve)
    const shrunkBoostingMultiplier =
        1.0 + skillEstimate.shrinkage * (calibratedParams.boosting_multiplier - 1.0);
    const scenarioCalibration: ScenarioCoherenceCalibration = {
        plattSlope: plattA,
        plattIntercept: plattB,
        boostingMultiplier: shrunkBoostingMultiplier,
        cyclicModulator: 1.0,
        shrinkageMultiplier: 1.0,
    };

    const simulationScenarios = generateProbabilisticScenarioMatrix({
        selection: top5,
        denoisedScores: finalScores,
        explainabilityRecord,
        primaryCoherence: dynamicConfidence,
        drawName,
        calibration: scenarioCalibration,
    });

    // Quantification de l'incertitude cohérente avec predictionFinalize
    const maxShannonEntropy = Math.log2(DRAW_DOMAIN_SIZE);
    const normalizedEntropy = Math.min(1.0, Math.max(0.0, currentEntropy / maxShannonEntropy));
    const aleatoricUncertainty = parseFloat((normalizedEntropy * 100.0).toFixed(2));
    const top5Consensus = top5.reduce((sum, n) => sum + (counts[n] || 0), 0) / Math.max(1, 5 * resolvedMcIterations);
    const epistemicUncertainty = parseFloat(
        (Math.max(0, 100.0 - dynamicConfidence) * (1.0 - (top5Consensus || 0.5))).toFixed(2)
    );
    const coherenceHalfWidth = parseFloat(((epistemicUncertainty / 100.0) * dynamicConfidence).toFixed(1));
    const ciLower = Math.max(1, Math.round(dynamicConfidence - coherenceHalfWidth));
    const ciUpper = Math.min(99, Math.round(dynamicConfidence + coherenceHalfWidth));

    const uncertaintyQuantification = {
        epistemicUncertainty,
        aleatoricUncertainty,
        confidenceInterval: { lower: ciLower, upper: ciUpper },
        intervalKind: 'epistemic_coherence_band' as const,
        intervalNote:
            'Bande de cohérence épistémique (± incertitude de stabilité MCMC), distincte d’un intervalle de confiance fréquentiste sur les gains.',
        entropyBits: parseFloat(currentEntropy.toFixed(3)),
        credibleIntervalRange: ciUpper - ciLower,
    };

    walkForwardCalibration.channelWeights = { ...normalizeWeights(finalWeights) };

    const aggregatedPred: Prediction = {
        drawName,
        suggestedNumbers: top5,
        candidates,
        breakdown: breakdownAcc as any,
        confidence: dynamicConfidence,
        expectedLift,
        confidenceNote: honestConfidenceNote,
        analysis: `Convergence MCMC Metropolis-Hastings (${resolvedMcIterations} cycles) avec alignement structurel ADN de ${calculatedAlignment !== undefined ? calculatedAlignment + '%' : 'Non calculable'}. Moteur cybernétique déterministe calibré.`,
        timestamp: Date.now(),
        realityAlignment: calculatedAlignment,
        realityAlignmentNote: `Score d'alignement structurel ADN (n'augmente pas la probabilité de gain). ${HONEST_NOTE}`,
        diversityMetrics: calculateGeneticDiversityIndex(top5, breakdownAcc as any),
        explainabilityData: explainabilityRecord,
        simulationScenarios,
        uncertaintyQuantification,
        walkForwardCalibration,
        numberProbabilities,
        empiricalSkill: {
            shrinkage: skillEstimate.shrinkage,
            brierSkillScore: skillEstimate.pointEstimate,
            positiveBrierSkillScore: skillEstimate.positiveEstimate,
            uncertainty: Number.isFinite(skillEstimate.uncertainty) ? skillEstimate.uncertainty : null,
            evidenceDraws: skillEstimate.evidenceDraws,
            source: skillEstimate.source,
            expectedHitsTopK: edgeSummary.expectedHitsTopK,
            uniformExpectedHitsTopK: edgeSummary.uniformExpectedHitsTopK,
            liftVsUniform: edgeSummary.liftVsUniform,
            maxProbability: edgeSummary.maxProbability,
            maxLiftVsUniform: edgeSummary.maxLiftVsUniform,
        },
    };

    return aggregatedPred;
};
