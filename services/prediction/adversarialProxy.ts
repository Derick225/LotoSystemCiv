import { DrawResult } from '../../types';
import { AlgoKey, ScoreBreakdown } from '../../shared/prediction.types';
import { calculateHurstForNumber } from '../mathService';

/**
 * Calcule dynamiquement la moyenne et l'écart-type d'un ensemble de valeurs réelles.
 * Zéro nombre magique : statistiques inférentielles continues.
 */
const calculateMeanAndStdDev = (values: number[]): { mean: number; stdDev: number } => {
  if (values.length === 0) return { mean: 0, stdDev: 1.0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance) || Number.EPSILON;
  return { mean, stdDev };
};

/**
 * Fonction d'activation logistique douce continue
 */
const logisticSigmoid = (x: number): number => 1.0 / (1.0 + Math.exp(-Math.max(-50, Math.min(50, x))));

/**
 * Générateur Antagoniste Déterministe (Generative Adversarial Proxy)
 * 
 * Sa mission est de soumettre le ticket de prédiction à un stress-test continu
 * sans aucun seuil binaire arbitraire, en utilisant des fonctions d'activation lisses et
 * des métriques de théorie de l'information (entropie de Shannon, distribution de Boltzmann,
 * persistance de Hurst et résilience topologique).
 */
export const evaluateAdversarialSurvival = (
    selection: number[],
    breakdownRecord: Record<number, ScoreBreakdown>,
    history: DrawResult[],
    forensicOracleDrift: Record<string, number> = {}
): { survivalScore: number; risks: string[] } => {
    if (!selection || selection.length === 0) {
        return { survivalScore: 10, risks: ["Sélection vide ou non initialisée"] };
    }

    const risks: string[] = [];

    // 1. Stress-Test de Diversité Algorithmique & Monoculture (Herfindahl-Hirschman & Entropie de Shannon)
    const algoSums: Record<string, number> = {};
    let totalScoreMass = 0;

    selection.forEach(num => {
        const bd = breakdownRecord[num] || {};
        Object.entries(bd).forEach(([k, v]) => {
            if (typeof v === 'number' && !isNaN(v) && v > 0) {
                algoSums[k] = (algoSums[k] || 0) + v;
                totalScoreMass += v;
            }
        });
    });

    const algoKeys = Object.keys(algoSums);
    let algoEntropy = 0;
    let hhi = 0;

    if (totalScoreMass > 0 && algoKeys.length > 0) {
        algoKeys.forEach(k => {
            const p = algoSums[k] / totalScoreMass;
            if (p > 0) {
                algoEntropy -= p * Math.log(p);
                hhi += p * p;
            }
        });
    }

    const maxPossibleEntropy = Math.log(Math.max(2, Object.values(AlgoKey).length));
    const normalizedAlgoEntropy = maxPossibleEntropy > 0 ? (algoEntropy / maxPossibleEntropy) : 0.5;
    const diversitySurvival = logisticSigmoid(5.0 * (normalizedAlgoEntropy - 0.40));

    if (normalizedAlgoEntropy < 0.35) {
        risks.push("Monoculture algorithmique : dépendance excessive envers un sous-ensemble restreint de prédicteurs");
    }

    // 2. Stress-Test Topologique & Énergie de Boltzmann (Somme, Parité, Espacement)
    const sortedNums = [...selection].sort((a, b) => a - b);
    const sumVal = sortedNums.reduce((a, b) => a + b, 0);
    
    // Espérance théorique pour 5 numéros sur 90 : E = 5 * 45.5 = 227.5, Var = 5 * (90^2 - 1)/12 * (1 - 5/90) ≈ 3183.75, Sigma ≈ 56.42
    const expectedSum = (selection.length * (90 + 1)) / 2.0;
    const theoreticalSumVariance = (selection.length * (Math.pow(90, 2) - 1.0) / 12.0) * (1.0 - selection.length / 90.0);
    const theoreticalSumStd = Math.sqrt(theoreticalSumVariance) || 50.0;
    const zSum = (sumVal - expectedSum) / theoreticalSumStd;
    const sumSurvival = Math.exp(-0.5 * zSum * zSum);

    // Parité : distribution binomiale B(n, 0.5)
    const evens = sortedNums.filter(n => n % 2 === 0).length;
    const expectedEvens = selection.length * 0.5;
    const stdEvens = Math.sqrt(selection.length * 0.25) || 1.118;
    const zParity = (evens - expectedEvens) / stdEvens;
    const paritySurvival = Math.exp(-0.5 * zParity * zParity);

    // Espacement minimal (pénalisation continue des paquets trop serrés)
    let minDiff = 90;
    for (let i = 0; i < sortedNums.length - 1; i++) {
        const diff = sortedNums[i + 1] - sortedNums[i];
        if (diff < minDiff) minDiff = diff;
    }
    const spacingSurvival = 1.0 - Math.exp(-0.8 * Math.max(1, minDiff));

    const topoSurvival = (sumSurvival * 0.45) + (paritySurvival * 0.35) + (spacingSurvival * 0.20);
    if (sumSurvival < 0.25 || paritySurvival < 0.25) {
        risks.push("Anomalie topologique : distribution de somme ou de parité en queue de Gaussienne théorique");
    }

    // 3. Stress-Test de Dérive Médico-Légale (Forensic Drift Resistance)
    let driftAccumulator = 0;
    selection.forEach(n => {
        const d = forensicOracleDrift[n.toString()] ?? forensicOracleDrift[n] ?? 0;
        driftAccumulator += Math.abs(d);
    });
    const avgDrift = driftAccumulator / (selection.length || 1);
    const driftSurvival = Math.exp(-0.08 * avgDrift);

    if (avgDrift > 15.0) {
        risks.push("Susceptibilité à la dérive : présence de vecteurs en zone de forte distorsion historique récente");
    }

    // 4. Stress-Test de Persistance Temporelle (Exposant de Hurst)
    let hurstSum = 0;
    let hurstValidCount = 0;
    if (history && history.length >= 10) {
        selection.forEach(n => {
            const h = calculateHurstForNumber(n, history);
            if (typeof h.hurst === 'number' && !isNaN(h.hurst)) {
                hurstSum += h.hurst;
                hurstValidCount++;
            }
        });
    }
    const meanHurst = hurstValidCount > 0 ? (hurstSum / hurstValidCount) : 0.5;
    // La persistance modérée (0.50 à 0.65) est robuste ; l'hyper-anti-persistance (<0.35) ou hyper-persistance (>0.85) est instable sous bruit
    const zHurst = (meanHurst - 0.55) / 0.15;
    const hurstSurvival = Math.exp(-0.5 * zHurst * zHurst);

    // 5. Agrégation Continue du Score de Survie Adversariale
    const rawSurvival = (
        (diversitySurvival * 0.35) +
        (topoSurvival * 0.35) +
        (driftSurvival * 0.15) +
        (hurstSurvival * 0.15)
    );

    const survivalScore = Math.round(
        Math.max(10, Math.min(99, rawSurvival * 100))
    );

    return { survivalScore, risks };
};

