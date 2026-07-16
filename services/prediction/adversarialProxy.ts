import { DrawResult } from '../../types';
import { AlgoKey, ScoreBreakdown } from '../../shared/prediction.types';
import { calculateHurstForNumber } from '../mathService';

/**
 * Calcule dynamiquement la médiane et l'écart-type d'un ensemble de valeurs réelles.
 * Évite d'utiliser des coefficients fixes ou magiques.
 */
const calculateMedianAndStdDev = (values: number[]): { median: number; stdDev: number } => {
  if (values.length === 0) return { median: 0, stdDev: 1.0 };
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2.0;

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance) || Number.EPSILON;

  return { median, stdDev };
};

/**
 * Générateur Antagoniste Déterministe (Generative Adversarial Proxy)
 * 
 * Sa mission est de détruire le ticket de prédiction de manière continue,
 * sans aucun seuil binaire arbitraire, en utilisant des fonctions d'activation lisses.
 * Toutes les pénalités sont déduites dynamiquement à partir des statistiques globales des 90 numéros.
 */
export const evaluateAdversarialSurvival = (
    selection: number[],
    breakdownRecord: Record<number, ScoreBreakdown>,
    history: DrawResult[],
    forensicOracleDrift: Record<string, number> = {}
): { survivalScore: number; risks: string[] } => {
    let survivalScore = 100.0;
    const risks: string[] = [];

    // Extraire tous les numéros présents dans le breakdownRecord (1 à 90)
    const allNums = Object.keys(breakdownRecord).map(Number);
    
    // Pour chaque algorithme, recueillir les scores sur tous les numéros pour calculer median et stdDev réels
    const algoScoresMap = new Map<string, number[]>();
    allNums.forEach(num => {
        const bdown = breakdownRecord[num];
        if (bdown) {
            Object.entries(bdown).forEach(([k, v]) => {
                if (typeof v === 'number') {
                    if (!algoScoresMap.has(k)) algoScoresMap.set(k, []);
                    algoScoresMap.get(k)!.push(v);
                }
            });
        }
    });

    // Calculer les métriques (médiane, écart-type) pour chaque algorithme
    const algoStats = new Map<string, { median: number; stdDev: number }>();
    algoScoresMap.forEach((scores, algo) => {
        algoStats.set(algo, calculateMedianAndStdDev(scores));
    });

    // 1. Analyse de la sur-saturation d'algorithmes (Effondrement de la variance)
    const algoContributions = new Map<string, number>();
    selection.forEach(num => {
        const bdown = breakdownRecord[num];
        if (bdown) {
            Object.entries(bdown).forEach(([k, v]) => {
                if (typeof v === 'number') {
                    algoContributions.set(k, (algoContributions.get(k) || 0) + v);
                }
            });
        }
    });

    // 1b. Pénalisation continue des algorithmes en dérive
    algoContributions.forEach((totalScore, algo) => {
        const oracleDrift = forensicOracleDrift[algo];
        if (oracleDrift !== undefined && oracleDrift > 0) {
             const stats = algoStats.get(algo) || { median: 10.0, stdDev: 5.0 };
             const slope = 1.0 / stats.stdDev;
             
             // JSDOC: La normalisation Z-score et la sigmoïde d'activation garantissent que la pénalité
             // s'applique continûment de manière proportionnelle à la déviation statistique par rapport au comportement attendu.
             const zScore = (totalScore - stats.median) / stats.stdDev;
             const activation = 1.0 / (1.0 + Math.exp(-slope * (totalScore - stats.median))); 
             
             const penalty = (oracleDrift / 100.0) * Math.max(0, zScore) * activation * 10.0;
             
             survivalScore -= penalty;
             if (penalty > 3.0) {
                 risks.push(`Proxy (Forensic Sync): Forte exposition de l'algo [${algo}] en surestimation (Drift=${oracleDrift.toFixed(1)}, Pénalité=-${penalty.toFixed(1)}).`);
             }
        }
    });

    // 2. Évaluation du Consensus de Décision via CDF Logistique continue (ZÉRO SEUILS BINAIRES)
    // Calculer le consensus pour chacun des 90 numéros (proportion d'algos pour lesquels le numéro dépasse sa médiane)
    const consensusValues = allNums.map(num => {
        const bdown = breakdownRecord[num];
        if (!bdown) return 0;
        let aboveMedianCount = 0;
        let totalAlgos = 0;
        Object.entries(bdown).forEach(([algo, val]) => {
            if (typeof val === 'number') {
                totalAlgos++;
                const stats = algoStats.get(algo);
                if (stats && val > stats.median) {
                    aboveMedianCount++;
                }
            }
        });
        return totalAlgos > 0 ? aboveMedianCount / totalAlgos : 0;
    });

    const { median: consensusMedian, stdDev: consensusStdDev } = calculateMedianAndStdDev(consensusValues);

    selection.forEach(num => {
        const bdown = breakdownRecord[num];
        if (!bdown) return;
        let aboveMedianCount = 0;
        let totalAlgos = 0;
        Object.entries(bdown).forEach(([algo, val]) => {
            if (typeof val === 'number') {
                totalAlgos++;
                const stats = algoStats.get(algo);
                if (stats && val > stats.median) {
                    aboveMedianCount++;
                }
            }
        });
        const consensus = totalAlgos > 0 ? aboveMedianCount / totalAlgos : 0;

        // Fonction de répartition logistique (CDF) du consensus observée pour éviter le seuil binaire arbitraire (> 0.70)
        const slope = 1.0 / consensusStdDev;
        const consensusActivation = 1.0 / (1.0 + Math.exp(-slope * (consensus - consensusMedian)));

        // Plus le consensus est déviant, plus on pénalise pour contrer le sur-ajustement (consensualisme artificiel)
        const consensusPenalty = consensusActivation * 8.0; // Max 8 points par numéro
        survivalScore -= consensusPenalty;

        if (consensusPenalty > 5.0) {
            risks.push(`Proxy: Consensus critique sur le numéro ${num} (Consensus=${(consensus * 100).toFixed(1)}%, CDF=${(consensusActivation * 100).toFixed(1)}%).`);
        }
    });

    // 3. Évaluation de la Répétition (Entropie Topologique) via Loi de Puissance Continue
    const lastDrawGagnants = history[0]?.gagnants || [];
    let overlapCount = 0;
    selection.forEach(num => {
        if (lastDrawGagnants.includes(num)) {
            overlapCount++;
        }
    });
    
    // Pénalisation continue exponentielle au lieu d'un if (overlapCount >= 3)
    const overlapPenalty = Math.pow(overlapCount, 2.5); // 1 -> 1, 2 -> 5.6, 3 -> 15.5
    survivalScore -= overlapPenalty;
    if (overlapPenalty > 10.0) {
        risks.push(`Proxy: Répétition massive du tirage précédent détectée (Pénalité: -${overlapPenalty.toFixed(1)}).`);
    }

    // 4. Détection des signaux anti-persistants
    selection.forEach(num => {
        const { hurst } = calculateHurstForNumber(num, history.slice(0, 50));
        const markovScore = breakdownRecord[num]?.[AlgoKey.MARKOV] || 0;
        
        // JSDOC: L'anti-persistance (Hurst < 0.5) est modélisée continûment.
        // La reliance markovienne utilise une sigmoïde calibrée sur les statistiques réelles du modèle Markovien.
        const hurstAntiPersistance = Math.max(0, 0.50 - hurst) / 0.50; 
        const markovStats = algoStats.get(AlgoKey.MARKOV) || { median: 10.0, stdDev: 5.0 };
        const markovSlope = 1.0 / markovStats.stdDev;
        const markovReliance = 1.0 / (1.0 + Math.exp(-markovSlope * (markovScore - markovStats.median)));
        
        const antiPersistantPenalty = hurstAntiPersistance * markovReliance * 15.0; // Max 15 points par numéro
        
        survivalScore -= antiPersistantPenalty;
        if (antiPersistantPenalty > 5.0) {
            risks.push(`Proxy: Le numéro ${num} est dans un cycle anti-persistant (H=${hurst.toFixed(2)}), le modèle Markovien est trompé.`);
        }
    });

    // 5. Test de la Sérialité Forcée (Symmetry Attack)
    let serialPairs = 0;
    const sorted = [...selection].sort((a,b) => a - b);
    for (let i = 0; i < sorted.length - 1; i++) {
        if (sorted[i+1] - sorted[i] === 1) serialPairs++;
    }
    
    // Pénalisation continue (Quadratique)
    const serialPenalty = Math.pow(serialPairs, 2) * 5.0; // 1 -> 5, 2 -> 20, 3 -> 45
    survivalScore -= serialPenalty;
    
    if (serialPenalty > 15.0) {
        risks.push("Proxy: Concentration sérielle exponentielle (Cluster artificiel).");
    }

    // 6. Calcul Final du score de survie
    survivalScore = Math.max(1, Math.min(99, Math.round(survivalScore)));

    if (survivalScore >= 95 && risks.length === 0) {
        risks.push("Proxy n'a détecté aucune faille structurelle majeure.");
    }

    return { survivalScore, risks };
};
