import { DrawResult, Prediction, AlgoWeights, RiskProfile, SymbioticContext } from '../../types';
import { getAlgoWeights, normalizeWeights, applyRiskProfile, applyMetaLearning } from './weightsManager';
import { extractFeatures } from './featureExtractor';
import { calculateScores, applyPCADenoising } from './scoringEngine';
import { generateCombination } from './combinationGenerator';

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

    const features = extractFeatures(history);
    
    let masterScores = calculateScores(features, weights, metrics);
    masterScores = await applyPCADenoising(masterScores, weights);

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
    if (typeof window !== 'undefined') {
        try {
            const response = await fetch('/api/generate-prediction', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'master',
                    drawName,
                    history,
                    weightsToUse,
                    metrics,
                    symbioticContext,
                    riskProfile
                })
            });
            if (!response.ok) {
                throw new Error(`API Error: ${response.statusText}`);
            }
            const data = await response.json();
            if (data.error) throw new Error(data.error);
            return data.result;
        } catch (e) {
            console.warn("Backend prediction failed, falling back to local calculation:", e);
            return generateMasterPredictionCore(drawName, history, weightsToUse, metrics, symbioticContext, riskProfile);
        }
    } else {
        return generateMasterPredictionCore(drawName, history, weightsToUse, metrics, symbioticContext, riskProfile);
    }
};
