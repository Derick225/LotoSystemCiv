import { getLocalForensicReports } from '../postPredictionAnalysisService';
import { getAlgoWeights, saveAlgoWeights, normalizeWeights } from '../prediction/weightsManager';

export interface DriftCorrelation {
    algoName: string;
    driftSeverity: number; // Positive means overestimating, negative means underestimating
    failureFrequency: number;
    proposedWeightMultiplier: number;
}

export const analyzeDriftCorrelations = async (drawName: string, depth: number = 5): Promise<DriftCorrelation[]> => {
    const reports = await getLocalForensicReports();
    // Intercept 'Invalid Date' errors across all streams
    const relevantReports = reports.filter(r => r.drawName === drawName && r.date !== 'Invalid Date' && r.date !== null).slice(0, depth);
    
    const driftMap = new Map<string, { severitySum: number; count: number }>();
    
    relevantReports.forEach(report => {
        if (report.algorithmicDrift) {
            report.algorithmicDrift.forEach(drift => {
                const val = drift.direction === 'overestimating' ? drift.driftScore : -drift.driftScore;
                const existing = driftMap.get(drift.algo) || { severitySum: 0, count: 0 };
                existing.severitySum += val;
                existing.count += 1;
                driftMap.set(drift.algo, existing);
            });
        }
    });

    const correlations: DriftCorrelation[] = [];
    
    driftMap.forEach((data, algo) => {
        const avgSeverity = data.severitySum / data.count;
        // Continuous activation function for the weight multiplier
        // If average severity is highly overestimating, reduce weight (multiplier < 1)
        // If highly underestimating, boost weight (multiplier > 1)
        const proposedWeightMultiplier = Math.exp(-0.5 * avgSeverity); 
        
        correlations.push({
            algoName: algo,
            driftSeverity: avgSeverity,
            failureFrequency: data.count,
            proposedWeightMultiplier
        });
    });

    return correlations.sort((a, b) => Math.abs(b.driftSeverity) - Math.abs(a.driftSeverity));
};

export const applyDriftCorrelationsToNeuralEngine = async (drawName: string): Promise<void> => {
    const correlations = await analyzeDriftCorrelations(drawName);
    const currentWeights = await getAlgoWeights(drawName);
    
    if (correlations.length === 0) return;

    let updatedWeights = { ...currentWeights };
    let hasChanges = false;
    
    correlations.forEach(corr => {
        if (updatedWeights[corr.algoName as keyof typeof updatedWeights] !== undefined) {
            // Apply a continuous damping factor based on failure frequency
            // Zero magic numbers, bounded by frequency volume
            const dampingFactor = 1.0 - Math.exp(-0.2 * corr.failureFrequency);
            const blendedMultiplier = 1.0 * (1.0 - dampingFactor) + corr.proposedWeightMultiplier * dampingFactor;
            
            updatedWeights[corr.algoName as keyof typeof updatedWeights] = 
                (updatedWeights[corr.algoName as keyof typeof updatedWeights] || 0) * blendedMultiplier;
            hasChanges = true;
        }
    });

    if (hasChanges) {
        const finalWeights = normalizeWeights(updatedWeights);
        await saveAlgoWeights(drawName, finalWeights);
    }
};
