import { DrawResult, Prediction, AlgoWeights, RiskProfile, SymbioticContext } from '../../types';
import { getAlgoWeights, normalizeWeights, applyRiskProfile, applyMetaLearning } from './weightsManager';
import { extractFeatures } from './featureExtractor';
import { calculateScores, applyPCADenoising } from './scoringEngine';
import { generateCombination } from './combinationGenerator';
import { predictWithLSTM } from './neuralEngine';
import { AlgoKey } from '../../shared/prediction.types';

export const generateMasterPredictionCore = async (
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

    // Deep Learning (LSTM) Prediction
    const lstmPredictions = await predictWithLSTM(drawName, history);
    const enhancedMetrics = { ...metrics, lstm: lstmPredictions };

    const features = extractFeatures(history);
    
    let masterScores = calculateScores(features, weights, enhancedMetrics);
    masterScores = await applyPCADenoising(masterScores, weights);

    // Apply Quantum Noise for CHAOS profile
    if (riskProfile === 'CHAOS') {
        const moonPhase = Math.sin(Date.now() / (1000 * 60 * 60 * 24 * 29.53)); // Pseudo moon phase
        masterScores.forEach(scoreObj => {
            // Add a random perturbation between -15 and +15, influenced by the "moon phase"
            const noise = (Math.random() * 30 - 15) * (1 + Math.abs(moonPhase));
            scoreObj.score += noise;
            scoreObj.breakdown[AlgoKey.QUANTUM_ENTANGLEMENT] = noise > 0 ? noise : 0;
        });
    }

    const sortedScores = masterScores.sort((a, b) => b.score - a.score);
    
    const outsiderCount = riskProfile === 'CHAOS' ? 4 : riskProfile === 'AUDACIOUS' ? 3 : riskProfile === 'PRUDENT' ? 0 : 2;
    
    const selection = generateCombination(sortedScores, features.affinityMap, outsiderCount);

    return {
        suggestedNumbers: selection,
        candidates: sortedScores.slice(5, 15).map(s => s.num),
        confidence: Math.min(99, Math.round(sortedScores.slice(0, 5).reduce((a,b) => a + b.score, 0) / 5)),
        analysis: `Généré via architecture modulaire. Profil: ${riskProfile}.`,
        breakdown: masterScores.reduce((acc, curr) => ({ ...acc, [curr.num]: curr.breakdown }), {}),
        timestamp: Date.now(),
        symbiosisFactor: symbioticContext ? 1.5 : 1.0,
        riskProfile,
        realityAlignment: 0
    };
};

export const generateMasterPrediction = async (
    drawName: string, 
    history: DrawResult[],
    weightsToUse?: AlgoWeights,
    metrics?: any,
    symbioticContext?: SymbioticContext,
    riskProfile: RiskProfile = 'BALANCED'
): Promise<Prediction> => {
    return generateMasterPredictionCore(drawName, history, weightsToUse, metrics, symbioticContext, riskProfile);
};
