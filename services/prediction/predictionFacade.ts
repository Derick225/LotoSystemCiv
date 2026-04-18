import { DrawResult, Prediction, AlgoWeights, RiskProfile, SymbioticContext } from '../../types';
import { getAlgoWeights, normalizeWeights, applyRiskProfile, applyMetaLearning } from './weightsManager';
import { extractFeatures } from './featureExtractor';
import { calculateScores, applyPCADenoising } from './scoringEngine';
import { generateCombination } from './combinationGenerator';
import { predictWithLSTM } from './neuralEngine';
import { AlgoKey } from '../../shared/prediction.types';
import { supabase } from '../supabaseClient';
import { useNexusStore } from '../../store/useNexusStore';
import { secureRandom } from '../../utils/secureRandom';
import { 
    calculatePoissonScores, 
    calculateBayesianScore, 
    calculateTemporalScores,
    calculateDigitalRootAnalysis,
    calculateResistanceScores,
    calculateGapVelocityScores,
    calculateLeaderSuccession,
    calculateAiIntuition,
    calculateFractalResonance,
    calculateSpatialHotSpots
} from '../advancedMathService';

export const generateMasterPredictionCore = async (
    drawName: string, 
    history: DrawResult[],
    weightsToUse?: AlgoWeights,
    metrics?: any,
    symbioticContext?: SymbioticContext,
    riskProfile: RiskProfile = 'BALANCED',
    skipTraining: boolean = false
): Promise<Prediction> => {
    if (history.length < 10) throw new Error("Dataset insuffisant pour convergence.");

    let weights = normalizeWeights(weightsToUse || await getAlgoWeights(drawName));
    weights = applyMetaLearning(weights, history);
    weights = applyRiskProfile(weights, riskProfile);

    // Try Cloud Edge Function if enabled
    const useCloudEngine = useNexusStore.getState().useCloudEngine;
    if (useCloudEngine) {
        try {
            console.log("Tentative de calcul via Supabase Edge Functions (Deno)...");
            const { data, error } = await supabase.functions.invoke('predict-elite', {
                body: { 
                    drawName,
                    history: history.slice(0, 100), // Envoi que du pertinent
                    weights,
                    riskProfile,
                    symbioticContext,
                    metrics
                }
            });

            if (!error && data) {
                console.log("Succès Edge Function", data);
                const pred = data as Prediction;
                // Protection contre le bug typique Edge où la liste renvoyée est 1, 2, 3, 4, 5 par défaut d'ex-aequo
                if (pred.suggestedNumbers && pred.suggestedNumbers.join(',') === '1,2,3,4,5' && riskProfile === 'PRUDENT') {
                    console.warn("Bug Edge Function (1,2,3,4,5 successifs) détecté. Activation du fallback local pour une vraie prédiction.");
                } else {
                    return pred;
                }
            } else {
                console.warn("Échec Edge Function (Non déployée ou offline). Fallback sur le moteur local.");
            }
        } catch (e) {
            console.warn("Exception Edge Function, exécution locale continue.", e);
        }
    }

    // --- FALLBACK LOCAL (Le moteur existant) ---

    // Deep Learning (LSTM) Prediction
    const lstmPredictions = await predictWithLSTM(drawName, history, skipTraining);
    
    // Calculate Advanced Metrics
    const poissonScores = calculatePoissonScores(history);
    const bayesScores = calculateBayesianScore(history);
    const temporalScores = calculateTemporalScores(history);
    const digitalRootScores = calculateDigitalRootAnalysis(history);
    const resistanceScores = calculateResistanceScores(history);
    const gapVelocityScores = calculateGapVelocityScores(history);
    const leaderSuccessionScores = calculateLeaderSuccession(history);
    const aiIntuitionScores = calculateAiIntuition(history, metrics);
    const fractalResonanceScores = calculateFractalResonance(history);
    const spatialHotSpots = calculateSpatialHotSpots(history);

    const enhancedMetrics = { 
        ...metrics, 
        lstm: lstmPredictions,
        poisson: poissonScores,
        bayes: bayesScores,
        temporal: temporalScores,
        digitalRoot: digitalRootScores,
        resistance: resistanceScores,
        gapVelocity: gapVelocityScores,
        leaderSuccession: leaderSuccessionScores,
        aiIntuition: aiIntuitionScores,
        fractalResonance: fractalResonanceScores,
        spatial: spatialHotSpots,
        symbioticContext
    };

    const features = extractFeatures(history);
    
    let masterScores = calculateScores(features, weights, enhancedMetrics);
    masterScores = await applyPCADenoising(masterScores, weights);

    // Apply Thermodynamic Laplace Noise for CHAOS profile
    if (riskProfile === 'CHAOS') {
        // Temperature of the system models the chaos level
        const temperature = 12.0; 
        masterScores.forEach(scoreObj => {
            // Generate Laplace distributed noise: Laplace(mu=0, b=temperature)
            // U is uniform in (-0.5, 0.5]
            const u = secureRandom() - 0.5;
            // Inverse cumulative distribution function for Laplace
            const noise = -temperature * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
            
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
    riskProfile: RiskProfile = 'BALANCED',
    skipTraining: boolean = false
): Promise<Prediction> => {
    return generateMasterPredictionCore(drawName, history, weightsToUse, metrics, symbioticContext, riskProfile, skipTraining);
};
