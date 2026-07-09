import { AlgoWeights, ForensicReport } from '../../types';

// Helper pour éviter les overflows de Math.exp
const safeExp = (x: number): number => Math.exp(Math.max(-100, Math.min(100, x)));

export const computeDriftCorrectionWeights = (
    reports: ForensicReport[],
    currentWeights: AlgoWeights
): { newWeights: AlgoWeights, adjustments: Record<string, number> } => {
    const algoDrifts: Record<string, { over: number; under: number; count: number }> = {};

    // Analyse des 5 derniers rapports
    reports.slice(0, 5).forEach((r) => {
        if (Array.isArray(r.algorithmicDrift)) {
            r.algorithmicDrift.forEach((d) => {
                if (!algoDrifts[d.algo]) {
                    algoDrifts[d.algo] = { over: 0, under: 0, count: 0 };
                }
                if (d.direction === "overestimating") {
                    algoDrifts[d.algo].over += d.driftScore;
                } else {
                    algoDrifts[d.algo].under += d.driftScore;
                }
                algoDrifts[d.algo].count++;
            });
        }
    });

    const adjustments: Record<string, number> = {};
    const newWeights = { ...currentWeights } as Record<keyof AlgoWeights, number>;

    // 1. Calcul de la variance du drift pour obtenir un taux d'apprentissage dynamique
    const netDrifts: number[] = [];
    Object.values(algoDrifts).forEach((data) => {
        netDrifts.push((data.over - data.under) / (data.count || 1));
    });

    let dynamicLearningRate = 0.1; // Fallback
    if (netDrifts.length > 0) {
        const meanDrift = netDrifts.reduce((a, b) => a + b, 0) / netDrifts.length;
        const varianceDrift = netDrifts.reduce((a, b) => a + Math.pow(b - meanDrift, 2), 0) / netDrifts.length;
        
        // Si la variance est forte, on réduit le pas (dampening) pour éviter le sur-ajustement chaotique.
        // Utilisation de safeExp pour éviter l'overflow si varianceDrift est très grand.
        dynamicLearningRate = 1.0 / (1.0 + safeExp(varianceDrift));
    }

    // 2. Ajustement continu basé sur le drift et le taux dynamique
    Object.entries(algoDrifts).forEach(([algo, data]) => {
        const netDrift = (data.over - data.under) / (data.count || 1); // Positive means it overestimates
        const key = algo as keyof AlgoWeights;
        
        if (newWeights[key] !== undefined) {
            // Use continuous dampening factor derived from variance
            // safeExp évite ici qu'un netDrift extrême ne fasse exploser le facteur
            const correctionFactor = safeExp(-dynamicLearningRate * netDrift);
            const oldWeight = newWeights[key];
            const updatedWeight = Math.max(0.01, oldWeight * correctionFactor);
            
            newWeights[key] = updatedWeight;
            adjustments[algo] = updatedWeight - oldWeight;
        }
    });

    // Normalize weights so they sum to 1
    const totalWeight = Object.values(newWeights).reduce((sum, weight) => sum + weight, 0);
    
    // Sécurité : éviter la division par zéro si tous les poids sont à 0
    if (totalWeight > 0) {
        Object.keys(newWeights).forEach(key => {
            const k = key as keyof AlgoWeights;
            newWeights[k] = newWeights[k] / totalWeight;
        });
    }

    return { 
        newWeights: newWeights as AlgoWeights, 
        adjustments 
    };
};