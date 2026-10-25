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
  /** Part du signal SHAP positif portée par la famille dominante, dans [0, 1]. */
  dominantFamilyShare: number;
}

export interface XAPSkillContext {
  /** Rétention du signal mesuré λ ∈ [0,1] (voir empiricalSkillCalibration). */
  shrinkage: number;
  /** BSS out-of-fold retenu, éventuellement négatif. */
  brierSkillScore: number;
}

type PhysicsArchetype = NumberXAPExplanation["physicsArchetype"];

/**
 * Familles physiques dérivées des canaux réellement présents dans le moteur. L'archétype
 * d'un numéro est la famille qui porte la PLUS GRANDE part de son signal SHAP positif :
 * aucun seuil binaire, aucune famille privilégiée par une constante arbitraire.
 */
const ARCHETYPE_FAMILIES: ReadonlyArray<{
  name: PhysicsArchetype;
  keys: ReadonlySet<string>;
}> = [
  {
    name: "Transfert Machine",
    keys: new Set<string>([AlgoKey.MACHINE_TRANSFER]),
  },
  {
    name: "Cycle Harmonique",
    keys: new Set<string>([
      AlgoKey.SPECTRAL,
      AlgoKey.INTER_DRAW_RESONANCE,
      AlgoKey.NETWORK_CORRELATION,
      AlgoKey.GAP_CADENCE,
      AlgoKey.INTER_MONTHLY_RESONANCE,
    ]),
  },
  {
    name: "Persistance Fractale",
    keys: new Set<string>([
      AlgoKey.FRACTAL,
      AlgoKey.TEMPORAL,
      AlgoKey.GAP_TREND,
      AlgoKey.SEQUENCE_PATTERN,
    ]),
  },
  {
    name: "Attracteur Chaotique",
    keys: new Set<string>([
      AlgoKey.SPATIAL,
      AlgoKey.MARKOV,
      AlgoKey.SHADOW_PROBABILITY,
      AlgoKey.ECHO_STATE,
      AlgoKey.ISOLATION_ANOMALY,
      AlgoKey.GAP_BAND_SEQUENCE,
      AlgoKey.GAP_PATTERN,
      AlgoKey.GAP_SEQUENCE,
    ]),
  },
];

const DEFAULT_ARCHETYPE: PhysicsArchetype = "Convergence Probabiliste";

const resolveArchetypeFamily = (algoKey: string): PhysicsArchetype => {
  for (const family of ARCHETYPE_FAMILIES) {
    if (family.keys.has(algoKey)) return family.name;
  }
  return DEFAULT_ARCHETYPE;
};

/**
 * Moteur d'Explicabilité XAP Vectorielle & Remarques Narratives Déterministes.
 *
 * Principes (AGENTS.md) :
 * 1. Zéro nombre magique : l'archétype et la narration dérivent des parts SHAP réelles,
 *    sans seuil du type « machineBoost > 1.2 » ni branche privilégiée.
 * 2. Zéro hasard : 100% déterministe pour les mêmes poids et le même historique.
 * 3. Honnêteté : la narration décrit la STRUCTURE INTERNE du score. Elle ne prétend pas
 *    qu'un canal prédit le tirage ; le contexte de skill (λ, BSS) le rappelle explicitement.
 */
export const generateXAPNarratives = (
  suggestedNumbers: number[],
  scoresMap: Record<number, number>,
  shapMap: Record<number, Record<string, number>>,
  explainabilityData?: Record<number, any>,
  skillContext?: XAPSkillContext
): Record<number, NumberXAPExplanation> => {
  const explanations: Record<number, NumberXAPExplanation> = {};

  suggestedNumbers.forEach((num) => {
    const rawScore = typeof scoresMap[num] === "number" && Number.isFinite(scoresMap[num]) ? scoresMap[num] : 0;
    const numShap = shapMap[num] ?? {};
    const explainExtra = explainabilityData?.[num] ?? {};

    // 1. Vecteurs de contribution SHAP strictement positifs (les négatifs n'expliquent pas le score)
    let totalShap = 0;
    const drivers = Object.entries(numShap)
      .map(([k, val]) => {
        const cVal = Number.isFinite(val) && val > 0 ? val : 0;
        totalShap += cVal;
        return {
          algoKey: k,
          label: LABELS_MAP[k as keyof typeof LABELS_MAP] || k,
          contribution: cVal,
          percentageOfScore: 0,
        };
      })
      .filter((driver) => driver.contribution > 0);

    if (totalShap > 0) {
      drivers.forEach((driver) => {
        driver.percentageOfScore = (driver.contribution / totalShap) * 100;
      });
    }
    drivers.sort((a, b) => b.contribution - a.contribution || a.algoKey.localeCompare(b.algoKey));

    const topDrivers = drivers.slice(0, 3);

    // 2. Famille dominante = argmax de la masse SHAP, continûment répartie
    const familyMass = new Map<PhysicsArchetype, number>();
    drivers.forEach((driver) => {
      const family = resolveArchetypeFamily(driver.algoKey);
      familyMass.set(family, (familyMass.get(family) ?? 0) + driver.contribution);
    });

    let dominantFamily: PhysicsArchetype = DEFAULT_ARCHETYPE;
    let dominantMass = 0;
    ARCHETYPE_FAMILIES.forEach((family) => {
      const mass = familyMass.get(family.name) ?? 0;
      if (mass > dominantMass) {
        dominantMass = mass;
        dominantFamily = family.name;
      }
    });
    const fallbackMass = familyMass.get(DEFAULT_ARCHETYPE) ?? 0;
    if (fallbackMass > dominantMass) {
      dominantMass = fallbackMass;
      dominantFamily = DEFAULT_ARCHETYPE;
    }

    const dominantFamilyShare = totalShap > 0 ? dominantMass / totalShap : 0;
    const archetype = totalShap > 0 ? dominantFamily : DEFAULT_ARCHETYPE;

    // 3. Synthèse narrative descriptive (jamais de promesse de gain)
    const primary = topDrivers[0];
    const secondary = topDrivers[1];
    let narrative: string;

    if (!primary) {
      narrative = `Aucune contribution SHAP positive mesurée pour le numéro ${num} : son score provient du socle uniforme du simplexe.`;
    } else if (secondary) {
      narrative = `Attribution SHAP du numéro ${num} : ${primary.label} (${primary.percentageOfScore.toFixed(0)} % du signal) puis ${secondary.label} (${secondary.percentageOfScore.toFixed(0)} %), famille dominante « ${archetype} » à ${(dominantFamilyShare * 100).toFixed(0)} %.`;
    } else {
      narrative = `Attribution SHAP du numéro ${num} concentrée sur ${primary.label} (${primary.percentageOfScore.toFixed(0)} % du signal), famille « ${archetype} ».`;
    }

    if (skillContext) {
      if (skillContext.shrinkage === 0) {
        narrative += ` Aucun edge out-of-fold mesuré (BSS=${skillContext.brierSkillScore.toFixed(4)}, λ=0) : attribution descriptive, probabilités marginales ramenées à 5/90.`;
      } else {
        narrative += ` Edge out-of-fold partiel retenu (BSS=${skillContext.brierSkillScore.toFixed(4)}, λ=${skillContext.shrinkage.toFixed(4)}) : attribution partiellement informative.`;
      }
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
      dominantFamilyShare,
    };
  });

  return explanations;
};
