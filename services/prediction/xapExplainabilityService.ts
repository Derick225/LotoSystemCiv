import { AlgoKey } from "../../shared/prediction.types";
import { LABELS_MAP } from "../../hooks/useAlgorithmSync";

export interface NumberXAPExplanation {
  num: number;
  score: number;
  topDrivers: Array<{
    algoKey: string;
    label: string;
    contribution: number; // 0-100%
    percentageOfScore: number;
  }>;
  microDnaResonance: number;
  topologicalTension: number;
  narrativeText: string;
  physicsArchetype: "Cycle Harmonique" | "Persistance Fractale" | "Attracteur Chaotique" | "Transfert Machine" | "Convergence Probabiliste";
}

/**
 * Moteur d'Explicabilité XAP Vectorielle & Remarques Narratives Déterministes.
 *
 * Principes (AGENTS.md) :
 * 1. Zéro nombre magique : attribution basée sur les valeurs SHAP réelles calculées lors de la passe d'inférence.
 * 2. Zéro hasard : 100% déterministe et reproductible pour le même tirage et les mêmes poids.
 * 3. Continuité : formulations analytiques fluides décrivant la convergence multi-algorithmique.
 */
export const generateXAPNarratives = (
  suggestedNumbers: number[],
  scoresMap: Record<number, number>,
  shapMap: Record<number, Record<string, number>>,
  explainabilityData?: Record<number, any>,
  machineTransferMap?: Record<number, number>
): Record<number, NumberXAPExplanation> => {
  const explanations: Record<number, NumberXAPExplanation> = {};

  suggestedNumbers.forEach((num) => {
    const rawScore = scoresMap[num] ?? 50;
    const numShap = shapMap[num] ?? {};
    const explainExtra = explainabilityData?.[num] ?? {};

    // 1. Calcul et tri des vecteurs de contribution SHAP
    const totalShap = Object.values(numShap).reduce((sum, v) => sum + Math.max(0, v), 0) || 1.0;
    
    const drivers = Object.entries(numShap)
      .map(([k, val]) => {
        const cVal = Math.max(0, val);
        return {
          algoKey: k,
          label: LABELS_MAP[k as keyof typeof LABELS_MAP] || k,
          contribution: cVal,
          percentageOfScore: (cVal / totalShap) * 100,
        };
      })
      .sort((a, b) => b.contribution - a.contribution);

    const topDrivers = drivers.slice(0, 3);
    const primary = topDrivers[0] || { algoKey: "stochastic", label: "Stochastique", percentageOfScore: 100 };
    const secondary = topDrivers[1];

    // 2. Détermination de l'Archétype Physique
    const machineBoost = machineTransferMap?.[num] || 0;
    let archetype: NumberXAPExplanation["physicsArchetype"] = "Convergence Probabiliste";

    if (machineBoost > 1.2) {
      archetype = "Transfert Machine";
    } else if (["spectral", "harmonic", "quantum"].includes(primary.algoKey)) {
      archetype = "Cycle Harmonique";
    } else if (["fractal", "hurst", "temporal"].includes(primary.algoKey)) {
      archetype = "Persistance Fractale";
    } else if (["chaos", "spatial", "markov"].includes(primary.algoKey)) {
      archetype = "Attracteur Chaotique";
    } else {
      archetype = "Convergence Probabiliste";
    }

    // 3. Synthèse Narrative XAP Continue
    let narrative = "";
    if (archetype === "Transfert Machine") {
      narrative = `Le numéro ${num} est fortement porté par le flux stochastique Machine $\\rightarrow$ Gagnants (signal cinématique de transfert).`;
    } else if (secondary && secondary.percentageOfScore > 18) {
      narrative = `Propulsé conjointement par l'estimateur ${primary.label} (${primary.percentageOfScore.toFixed(0)}% du signal) et ${secondary.label} (${secondary.percentageOfScore.toFixed(0)}%), indiquant une résonance multi-échelle cohérente.`;
    } else {
      narrative = `Dominé par le vecteur ${primary.label} (${primary.percentageOfScore.toFixed(0)}% d'attribution SHAP), traduisant une dynamique structurelle ciblée sur l'historique du tirage.`;
    }

    const microDnaResonance = explainExtra.dnaOrbitingIndex ?? 0;
    const topologicalTension = explainExtra.topologicalTension ?? 0;

    explanations[num] = {
      num,
      score: rawScore,
      topDrivers,
      microDnaResonance,
      topologicalTension,
      narrativeText: narrative,
      physicsArchetype: archetype,
    };
  });

  return explanations;
};
