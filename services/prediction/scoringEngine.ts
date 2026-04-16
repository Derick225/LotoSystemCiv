import { AlgoWeights, ScoreBreakdown, AlgoKey } from '../../shared/prediction.types';
import { ExtractedFeatures } from './featureExtractor';
import { workerService } from '../workerService';
import { denoiseFeaturesPCA } from '../mathService';

export interface ScoredNumber {
    num: number;
    score: number;
    breakdown: ScoreBreakdown;
}

export const calculateScores = (
    features: ExtractedFeatures,
    weights: AlgoWeights,
    advancedMetrics: any
): ScoredNumber[] => {
    const N = 90;
    const { freqMap, gapsMap, markovMap, machineTransferMap, momentumMap, antiConsensusMap, equilibriumMap } = features;
    
    const maxFreq = Math.max(...freqMap.values()) || 1;
    const maxMarkov = Math.max(...markovMap.values()) || 1;
    const maxMachineTransfer = Math.max(...machineTransferMap.values()) || 1;

    const masterScores: ScoredNumber[] = Array.from({ length: N }, (_, i) => {
        const num = i + 1;
        const breakdown: ScoreBreakdown = {};
        
        breakdown[AlgoKey.FREQUENCY] = ((freqMap.get(num) || 0) / maxFreq) * 100;

        const currentGap = gapsMap.get(num) || 0;
        const theoreticalGap = 17; 
        let gapScore = 0;
        if (currentGap < theoreticalGap) gapScore = (currentGap / theoreticalGap) * 40; 
        else if (currentGap < theoreticalGap * 3) gapScore = 40 + ((currentGap - theoreticalGap) / (theoreticalGap * 2)) * 60;
        else gapScore = 90; 
        breakdown[AlgoKey.GAPS] = gapScore;

        breakdown[AlgoKey.MARKOV] = ((markovMap.get(num) || 0) / maxMarkov) * 100;
        breakdown[AlgoKey.MACHINE] = ((machineTransferMap.get(num) || 0) / maxMachineTransfer) * 100;
        
        // Momentum
        breakdown[AlgoKey.MOMENTUM] = Math.min(100, (momentumMap.get(num) || 0) * 30);

        // Anti-Consensus
        const acFreq = antiConsensusMap.get(num) || 0;
        let acScore = 0;
        if (acFreq === 0) acScore = 80;
        else if (acFreq === 1) acScore = 100;
        else if (acFreq > 3) acScore = 20;
        else acScore = 60;
        breakdown[AlgoKey.ANTI_CONSENSUS] = acScore;

        // Equilibrium
        breakdown[AlgoKey.EQUILIBRIUM] = equilibriumMap.get(num) || 50;
        
        // Calculate Affinity Score based on Markov probabilities
        let affinityScore = 0;
        features.affinityMap.forEach((affinities, c1) => {
            const markovProb = features.markovMap.get(c1) || 0;
            const affinityProb = affinities.get(num) || 0;
            affinityScore += markovProb * affinityProb;
        });
        // Normalize roughly (max possible is around maxMarkov, but we'll scale it)
        breakdown[AlgoKey.AFFINITY] = (affinityScore / maxMarkov) * 100;

        // Use advanced metrics if provided
        const spectralMetric = advancedMetrics?.spectral?.find((s: any) => s.number === num);
        breakdown[AlgoKey.SPECTRAL] = spectralMetric ? Math.min(100, spectralMetric.energy) : 0;

        const waveletMetric = advancedMetrics?.wavelet?.find((s: any) => s.number === num);
        breakdown[AlgoKey.WAVELET] = waveletMetric ? Math.min(100, waveletMetric.energy) : 0;

        const fractalMetric = advancedMetrics?.fractal?.find((s: any) => s.number === num);
        // Hurst exponent is usually between 0 and 1. We scale it to 0-100.
        breakdown[AlgoKey.FRACTAL] = fractalMetric ? Math.min(100, fractalMetric.hurst * 100) : 0;

        breakdown[AlgoKey.STRUCTURAL] = advancedMetrics?.structural?.[num] || 0;
        breakdown[AlgoKey.TREND] = advancedMetrics?.trend?.[num] || 0;
        breakdown[AlgoKey.LSTM] = advancedMetrics?.lstm?.[num] || 0;

        // Advanced Math Metrics
        breakdown[AlgoKey.POISSON] = advancedMetrics?.poisson?.[num] || 0;
        breakdown[AlgoKey.BAYES] = advancedMetrics?.bayes?.[num] || 0;
        breakdown[AlgoKey.TEMPORAL] = advancedMetrics?.temporal?.[num] || 0;
        breakdown[AlgoKey.DIGITAL_ROOT] = advancedMetrics?.digitalRoot?.[num] || 0;
        breakdown[AlgoKey.RESISTANCE] = advancedMetrics?.resistance?.[num] || 0;
        breakdown[AlgoKey.GAP_VELOCITY] = advancedMetrics?.gapVelocity?.[num] || 0;
        breakdown[AlgoKey.LEADER_SUCCESSION] = advancedMetrics?.leaderSuccession?.[num] || 0;
        breakdown[AlgoKey.AI_INTUITION] = advancedMetrics?.aiIntuition?.[num] || 0;
        breakdown[AlgoKey.FRACTAL_RESONANCE] = advancedMetrics?.fractalResonance?.[num] || 0;
        breakdown[AlgoKey.SPATIAL] = advancedMetrics?.spatial?.includes(num) ? 100 : 0;
        breakdown[AlgoKey.ORCHESTRATION] = advancedMetrics?.symbioticContext?.orchestrationBoosts?.[num] || 0;
        breakdown[AlgoKey.DECISION_FOREST] = advancedMetrics?.symbioticContext?.forestVotes?.[num] || 0;

        let finalScore = 0;
        (Object.keys(weights) as Array<AlgoKey>).forEach(key => {
            const w = weights[key] || 0;
            const s = breakdown[key] || 0;
            if (w > 0) {
                finalScore += s * w;
            }
        });

        return { num, score: finalScore, breakdown: breakdown as ScoreBreakdown };
    });

    return masterScores;
};

export const applyPCADenoising = async (
    masterScores: ScoredNumber[],
    weights: AlgoWeights
): Promise<ScoredNumber[]> => {
    try {
        const featureKeys = Object.keys(weights) as Array<AlgoKey>;
        const featureMatrix = masterScores.map(item => featureKeys.map(k => item.breakdown[k] || 0));
        
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
                    const val = Math.max(0, denoisedMatrix[idx][fIdx]); 
                    item.breakdown[key] = val; 
                    newScore += val * (weights[key] || 0);
                });
                item.score = newScore;
            });
        }
    } catch (e) {
        console.warn("PCA Denoising failed", e);
    }
    return masterScores;
};
