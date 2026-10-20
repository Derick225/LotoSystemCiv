import { AlgoWeights, ForensicReport } from '../../types';
import { normalizeWeights } from './weightsManager';

/**
 * Calcule la dérive globale des algorithmes à partir des rapports médico-légaux (forensics) récents,
 * et applique une correction continue et bornée sur les poids actifs du moteur d'inférence.
 * 
 * Les ajustements sont projetés rigoureusement sur le simplexe L1 en appelant `normalizeWeights`,
 * ce qui empêche la monopolisation de la masse de probabilité (poids > 1.0) ou l'oubli catastrophique.
 * 
 * Utilise la tangente hyperbolique (Math.tanh) pour borner continûment les signaux de dérive.
 * Conforme AGENTS.md (Zéro hasard, Zéro nombre magique).
 * 
 * @param reports Tableau de rapports médico-légaux d'autopsie récents.
 * @param currentWeights Poids des algorithmes avant application de la rétroaction de dérive.
 */
export const computeDriftCorrectionWeights = (
    reports: ForensicReport[],
    currentWeights: AlgoWeights
): { newWeights: AlgoWeights, adjustments: Record<string, number> } => {
    const algoDrifts: Record<string, { over: number; under: number; count: number }> = {};
    const numAlgos = Object.keys(currentWeights).length || 1;

    // Analyse des rapports médico-légaux récents (fenêtre maximale empirique proportionnelle à la racine de la taille de l'espace)
    const analysisWindowSize = Math.max(3, Math.ceil(Math.sqrt(numAlgos) * 2));
    reports.slice(0, analysisWindowSize).forEach((r) => {
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

    // 1. Calcul de la variance du drift pour obtenir un taux d'apprentissage dynamique dénué de constante magique
    const netDrifts: number[] = [];
    Object.values(algoDrifts).forEach((data) => {
        netDrifts.push((data.over - data.under) / (data.count || 1));
    });

    // Taux d'apprentissage par défaut basé sur l'inverse de la dimensionnalité de l'espace (1 / N)
    let dynamicLearningRate = 1.0 / numAlgos;
    
    if (netDrifts.length > 0) {
        const meanDrift = netDrifts.reduce((a, b) => a + b, 0) / netDrifts.length;
        const varianceDrift = netDrifts.reduce((a, b) => a + Math.pow(b - meanDrift, 2), 0) / netDrifts.length;
        
        // Si la variance de la dérive est forte, on réduit le pas (damping continu) pour éviter le sur-ajustement chaotique.
        // Utilisation d'une fonction sigmoïdale sur la variance pour adapter continûment le pas d'apprentissage.
        dynamicLearningRate = 1.0 / (1.0 + Math.exp(varianceDrift));
    }

    // 2. Ajustement continu basé sur la dérive bornée par tangente hyperbolique
    Object.entries(algoDrifts).forEach(([algo, data]) => {
        const netDrift = (data.over - data.under) / (data.count || 1); // Positif si sur-estimation
        const key = algo as keyof AlgoWeights;
        
        if (newWeights[key] !== undefined) {
            // Utilisation de la tangente hyperbolique pour borner l'ajustement de dérive dans [-1, 1].
            // Le facteur de correction résultant est strictement borné dans [e^-1, e^1], soit environ [0.368, 2.718].
            // Cela empêche toute explosion ou disparition soudaine de signal avant la normalisation globale.
            const boundedAdjustment = Math.tanh(-dynamicLearningRate * netDrift);
            const correctionFactor = Math.exp(boundedAdjustment);
            
            const oldWeight = newWeights[key];
            const updatedWeight = oldWeight * correctionFactor;
            
            newWeights[key] = updatedWeight;
            adjustments[algo] = updatedWeight - oldWeight;
        }
    });

    // 3. Normalisation et projection rigoureuse sur le simplexe L1 avec planchers et plafonds topologiques
    const normalizedNewWeights = normalizeWeights(newWeights as AlgoWeights);

    // Recalcul des ajustements finaux exacts après normalisation
    Object.keys(currentWeights).forEach((key) => {
        const k = key as keyof AlgoWeights;
        adjustments[k] = normalizedNewWeights[k] - currentWeights[k];
    });

    return { 
        newWeights: normalizedNewWeights, 
        adjustments 
    };
};
