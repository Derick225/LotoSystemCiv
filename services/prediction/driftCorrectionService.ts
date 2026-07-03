import { AlgoWeights } from '../../types';
import { ForensicReport } from '../../types';

export const computeDriftCorrectionWeights = (
  reports: ForensicReport[], 
  currentWeights: AlgoWeights
): { newWeights: AlgoWeights, adjustments: Record<string, number> } => {
  const algoDrifts: Record<string, { over: number; under: number; count: number }> = {};
  
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
  const newWeights = { ...currentWeights };
  
  // 1. Calcul de la variance du drift pour obtenir un taux d'apprentissage dynamique
  const netDrifts: number[] = [];
  Object.entries(algoDrifts).forEach(([_, data]) => {
    netDrifts.push((data.over - data.under) / (data.count || 1));
  });

  let dynamicLearningRate = 0.1; // Fallback
  if (netDrifts.length > 0) {
    const meanDrift = netDrifts.reduce((a, b) => a + b, 0) / netDrifts.length;
    const varianceDrift = netDrifts.reduce((a, b) => a + Math.pow(b - meanDrift, 2), 0) / netDrifts.length;
    // Si la variance est forte, on réduit le pas (dampening) pour éviter le sur-ajustement chaotique.
    // Si la variance est faible, on augmente légèrement pour converger plus vite.
    dynamicLearningRate = 1.0 / (1.0 + Math.exp(varianceDrift));
  }
  
  // 2. Ajustement continu basé sur le drift et le taux dynamique
  Object.entries(algoDrifts).forEach(([algo, data]) => {
    const netDrift = (data.over - data.under) / (data.count || 1); // Positive means it overestimates
    if (newWeights[algo as keyof AlgoWeights] !== undefined) {
      // Use continuous dampening factor derived from variance
      const correctionFactor = Math.exp(-dynamicLearningRate * netDrift);
      
      const oldWeight = newWeights[algo as keyof AlgoWeights] as number;
      const updatedWeight = Math.max(0.01, oldWeight * correctionFactor);
      newWeights[algo as keyof AlgoWeights] = updatedWeight;
      
      adjustments[algo] = updatedWeight - oldWeight;
    }
  });
  
  // Normalize weights so they sum to 1
  const totalWeight = Object.values(newWeights).reduce((a, b) => (a as number) + (b as number), 0) as number;
  Object.keys(newWeights).forEach(key => {
    newWeights[key as keyof AlgoWeights] = (newWeights[key as keyof AlgoWeights] as number) / totalWeight;
  });

  return { newWeights, adjustments };
};
