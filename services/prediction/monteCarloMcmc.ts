import { buildAlgoBundle } from './predictionFacade';
import { extractFeatures } from './featureExtractor';
import { calculateScores } from './scoringEngine';
import { calculateGeneticDiversityIndex } from './diversityService';
import { DrawResult, AlgoWeights, Prediction } from '../../types';
import { EnhancedMetrics } from './metrics.types';
import { SymbioticContext } from '../../types';
import { generateMasterPredictionCore } from './predictionFacade';
import { AlgoKey } from '../../shared/prediction.types';
import { DNAOptimizer } from '../training/DNAOptimizer';
import { ParkMillerLCG } from './deterministicCore';

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
    const lastDraw = history[0];
    const timestampDernierTirage = lastDraw ? new Date(lastDraw.date).getTime() : Date.now();
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
        if (i % 5 === 0) onProgress(Math.round((i / resolvedMcIterations) * 90), `MCMC Metropolis-Hastings (${i}/${resolvedMcIterations})...`);
        
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

        
        const scoredNumbers = calculateScores(baseFeatures, perturbedWeights, baseBundle, history);
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

        // Log-likelihood energy: sum of log-scores for top-5 minus entropy penalty
        // This is a proper probabilistic objective vs the fragile top5/next15 heuristic
        const totalScore = scoredNumbers.reduce((s, x) => s + x.score, 0) || 1;
        let logLikelihood = 0;
        suggestedNumbers.forEach(n => {
            const s = scoredNumbers.find(x => x.num === n);
            const p = Math.max(Number.EPSILON, (s?.score || 0) / totalScore);
            logLikelihood += Math.log(p);
        });
        // Entropy regularization: penalize degenerate distributions (all mass on 1 number)
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

    onProgress(95, "Convergence Globale...");

    const topCands = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(x => Number(x[0]));
        
    const top5 = topCands.slice(0, 5).sort((a,b) => a - b);
    const candidates = topCands.slice(5, 15);

    const activeWeights = specificWeights;
    const optimizer = new DNAOptimizer(Object.keys(activeWeights) as AlgoKey[]);
    const dnaMatrix = top5.map(num => {
        const bdown = breakdownAcc[num] || {};
        const vec = new Float32Array(optimizer['numAlgos']);
        optimizer['algoKeys'].forEach((k, idx) => { vec[idx] = bdown[k] || 0; });
        return vec;
    });

    const historicalVectors: Float32Array[] = [];
    const sampleDepth = Math.min(30, history.length);
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
            const targetProfile = optimizer.extractTargetDNAProfile(historicalVectors, 30);
            const evaluation = optimizer.evaluateCandidate(dnaMatrix, targetProfile, top5, history.map(h => h.gagnants || []));
            calculatedAlignment = Math.round(100 * Math.exp(-evaluation.distance));
        } catch(e) {
            console.warn("[MC] DNA Evaluation bypassed:", e);
        }
    }

    const top5Consensus = top5.reduce((sum, n) => sum + counts[n], 0) / (5 * resolvedMcIterations);
    const dynamicConfidence = Math.round(Math.min(99, Math.max(10, top5Consensus * 100)));

    const aggregatedPred: Prediction = {
        suggestedNumbers: top5,
        candidates: candidates,
        breakdown: breakdownAcc as any,
        confidence: dynamicConfidence,
        analysis: `Convergence MCMC Metropolis-Hastings avec alignement historique de ${calculatedAlignment !== undefined ? calculatedAlignment + '%' : 'Non calculable'}. Moteur cybernétique optimisé.`,
        timestamp: Date.now(),
        realityAlignment: calculatedAlignment,
        diversityMetrics: {
            meanSimilarity: 0.1,
            diversityScore: 0.9,
            penalty: 0,
            isMonoculture: false,
            pairwiseSimilarities: [],
            dominantAlgo: "MCMC"
        }
    };

    return aggregatedPred;
};
