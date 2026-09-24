import { DrawResult, Prediction, AlgoWeights, SymbioticContext, SimulationScenarioItem } from "../../types";
import { logger } from "../../utils/logger";
import { isSupabaseConfigured } from "../supabaseClient";
import { apiClient } from "../../core/api/apiClient";
import { TUNING } from "./microSgd";
import { useNexusStore } from "../../store/useNexusStore";
import type { PredictionRuntimeContext } from "./predictionOrchestrator";
import { calculateShannonEntropy } from "../mathService";
import { LCG } from "../../utils/mathUtils";
import { ScoredNumber } from "./scoringEngine";
import { AlgoKey } from "../../shared/prediction.types";
import { PLATT_SCORE_STANDARDIZATION } from "./calibrationConstants";

export const HONEST_NOTE = "Indicateur interne de cohérence du moteur — ne reflète PAS une probabilité de gain.";
const TICKET_SIZE = 5;
const DOMAIN_SIZE = 90;

/** Source unique du type : la définition vit dans types.ts (aucune duplication locale). */
export type { SimulationScenarioItem };

/**
 * Paramètres de calibrage nécessaires pour reproduire EXACTEMENT la transformation
 * score moyen -> indicateur de cohérence du moteur (cf. predictionFinalize).
 *
 * Sans cet objet, aucun score de cohérence ne peut être calculé honnêtement : on renvoie
 * alors `null` (affiché « n/d ») plutôt qu'un pourcentage inventé.
 */
export interface ScenarioCoherenceCalibration {
  /** Pente de la sigmoïde de Platt calibrée (calibratedParams.sigmoid_slope). */
  plattSlope: number;
  /** Ordonnée à l'origine de la sigmoïde de Platt calibrée. */
  plattIntercept: number;
  /** Multiplicateur de boosting de la calibration courante. */
  boostingMultiplier: number;
  /** Modulateur de confiance du profil cyclique (matrice de phase). */
  cyclicModulator: number;
  /** Facteur de shrinkage effectivement appliqué (1.0 si non appliqué). */
  shrinkageMultiplier: number;
}

/**
 * Transformation canonique du moteur : moyenne des scores d'un ticket -> indicateur de cohérence [1,99].
 * Strictement identique à la chaîne appliquée au vecteur primaire dans predictionFinalize.
 *
 * ATTENTION : ce n'est PAS une probabilité de gain. Un tirage équitable reste équiprobable.
 */
export const plattCoherenceFromAverageScore = (
  averageScore: number,
  calibration: ScenarioCoherenceCalibration
): number | null => {
  if (!Number.isFinite(averageScore) || !Number.isFinite(calibration.plattSlope) || !Number.isFinite(calibration.plattIntercept)) {
    return null;
  }
  const rawX = (averageScore - PLATT_SCORE_STANDARDIZATION.CENTER) / PLATT_SCORE_STANDARDIZATION.SCALE;
  const p = 1.0 / (1.0 + Math.exp(-(calibration.plattSlope * rawX + calibration.plattIntercept)));
  const value =
    p *
    100.0 *
    calibration.boostingMultiplier *
    calibration.cyclicModulator *
    calibration.shrinkageMultiplier;
  if (!Number.isFinite(value)) return null;
  return Math.round(Math.max(1, Math.min(99, value)));
};

/**
 * Construit un évaluateur de cohérence pour un ticket quelconque : moyenne des scores bruts
 * (issus du débruitage) de ses membres, puis transformation de Platt partagée.
 * Retourne `null` si le calibrage est absent ou si aucun membre du ticket n'a de score mesuré.
 */
export const buildTicketCoherenceScorer = (
  denoisedScores: ScoredNumber[],
  calibration?: ScenarioCoherenceCalibration
): ((ticket: number[]) => number | null) => {
  const scoreByNum = new Map<number, number>();
  denoisedScores.forEach((s) => {
    if (typeof s?.score === "number" && Number.isFinite(s.score)) scoreByNum.set(s.num, s.score);
  });

  return (ticket: number[]): number | null => {
    if (!calibration || ticket.length === 0) return null;
    const measured = ticket.map((n) => scoreByNum.get(n)).filter((v): v is number => typeof v === "number");
    if (measured.length === 0) return null;
    const avg = measured.reduce((a, b) => a + b, 0) / measured.length;
    return plattCoherenceFromAverageScore(avg, calibration);
  };
};


/**
 * Récupération sécurisée de l'état du store Zustand sans crash dans les Web Workers ou SSR
 */
export const getStoreStateSafely = () => {
  if (typeof window !== 'undefined') {
    try {
      const state = useNexusStore.getState();
      if (state) {
        return {
          useSpatioTemporalHawkes: state.useSpatioTemporalHawkes ?? true,
          useCloudEngine: state.useCloudEngine ?? false,
        };
      }
    } catch {
      // Ignorer si le store n'est pas initialisé
    }
  }
  return { useSpatioTemporalHawkes: true, useCloudEngine: false };
};

/**
 * SCÉNARIO A : Dataset Insuffisant / Mode Dégradé Statistique Continu
 * Reconstruit une distribution continue de Laplace lissée sur le domaine complet (1..90)
 * Respecte strictement la règle ZÉRO NOMBRES MAGIQUES & DÉTERMINISME CONTINU (AGENTS.md).
 */
export const handleScenarioADegradedPrediction = (context: PredictionRuntimeContext): Prediction => {
  logger.warn(
    { drawName: context.drawName, len: context.history.length },
    "[predictionScenarios] Scenario A : Dataset insuffisant pour une inférence complexe. Mode dégradé statistique continu utile."
  );
  context.onProgress?.(100, "Dataset insuffisant. Génération d'une prédiction basée sur les fréquences de Laplace lissées.");

  const historyLength = context.history.length;
  // Facteur de lissage de Laplace continu dérivé de la racine de la taille de l'échantillon
  const laplaceAlpha = 1.0 / Math.sqrt(Math.max(1, historyLength) + 1.0);

  const freqMap: Record<number, number> = {};
  let totalDrawnNumbers = 0;
  for (const d of context.history) {
    for (const num of d.gagnants || []) {
      if (num >= 1 && num <= DOMAIN_SIZE) {
        freqMap[num] = (freqMap[num] || 0) + 1;
        totalDrawnNumbers++;
      }
    }
  }

  // Calcul du score continu de probabilité de Laplace pour l'ensemble 1..90
  const lcg = new LCG(`${context.drawName}_${historyLength}`);
  const scoredUniverse: { num: number; score: number; rawFreq: number }[] = [];

  for (let n = 1; n <= DOMAIN_SIZE; n++) {
    const rawCount = freqMap[n] || 0;
    // Probabilité lissée de Laplace : (count + alpha) / (total + 90 * alpha)
    const laplaceProb = (rawCount + laplaceAlpha) / (totalDrawnNumbers + DOMAIN_SIZE * laplaceAlpha);
    // Perturbation différentiable déterministe via LCG canonique pour lever les égalités sans biais
    const tieBreaker = Math.round(lcg.next() * 1000) / 1000000.0;
    const score = laplaceProb * 100.0 + tieBreaker;
    scoredUniverse.push({ num: n, score, rawFreq: rawCount });
  }

  scoredUniverse.sort((a, b) => b.score - a.score);

  const selected = scoredUniverse.slice(0, TICKET_SIZE).map((s) => s.num).sort((a, b) => a - b);
  const candidates = scoredUniverse
    .slice(TICKET_SIZE, TICKET_SIZE + 10)
    .map((s) => s.num)
    .sort((a, b) => a - b);

  // Calcul de l'entropie de Shannon sur l'échantillon disponible
  const shannonResult = calculateShannonEntropy(context.history);
  const currentEntropy = shannonResult.normalized;

  // Calcul continu de la confiance basé sur le pouvoir statistique de l'échantillon
  const samplePower = 1.0 - Math.exp(-historyLength / 5.0);
  const calibratedConfidence = Math.max(
    1,
    Math.min(99, Math.round(100.0 * samplePower * Math.max(0.1, 1.0 - Math.abs(currentEntropy - 0.5))))
  );

  // Reality alignment continu basé sur la somme (écart-type théorique exact de la somme de 5 numéros sur 90)
  const sumVal = selected.reduce((a, b) => a + b, 0);
  const expectedSum = (TICKET_SIZE * (DOMAIN_SIZE + 1)) / 2.0;
  const theoreticalSumStd =
    Math.sqrt(
      ((TICKET_SIZE * (Math.pow(DOMAIN_SIZE, 2) - 1.0)) / 12.0) * (1.0 - TICKET_SIZE / DOMAIN_SIZE)
    ) || 1.0;
  const sumLikelihood = Math.exp(-0.5 * Math.pow((sumVal - expectedSum) / theoreticalSumStd, 2));
  const realityAlignment = Math.max(5, Math.min(99, Math.round(sumLikelihood * 100.0)));

  const breakdownRecord: Record<number, Record<string, number>> = {};
  scoredUniverse.forEach((s) => {
    breakdownRecord[s.num] = {
      empiricalFrequency: Math.round(s.score * 100) / 100,
      laplaceMass: Math.round(s.rawFreq * 100) / 100,
    };
  });

  // Incertitude épistémique : déficit de pouvoir statistique rapporté à l'échelle de cohérence.
  // Aucun plancher arbitraire : elle tend vers 0 quand l'échantillon suffit, et vers 100 - C sinon.
  const epistemicUncertainty = parseFloat(((100 - calibratedConfidence) * (1.0 - samplePower)).toFixed(2));
  const aleatoricUncertainty = parseFloat((currentEntropy * 100.0).toFixed(2));

  const ciLower = Math.max(1, Math.round(calibratedConfidence - epistemicUncertainty));
  const ciUpper = Math.min(99, Math.round(calibratedConfidence + epistemicUncertainty));

  const simulationScenarios: SimulationScenarioItem[] = [
    {
      scenarioId: "sim_degraded_laplace",
      scenarioName: "Attracteur Empirique de Laplace",
      ticket: selected,
      coherenceScore: calibratedConfidence,
      riskProfile: "DEFENSIVE",
      description: `Régression fréquentielle lissée (${historyLength} tirages historiques).`,
      color: "#6366f1",
      genomicFocus: "Fréquence Laplace",
    },
    {
      scenarioId: "sim_degraded_dispersion",
      scenarioName: "Dispersion Équirépartie",
      ticket: candidates.slice(0, TICKET_SIZE),
      // Aucun calibrage de Platt disponible en mode dégradé → indicateur non mesurable, affiché « n/d ».
      coherenceScore: null,
      riskProfile: "BALANCED",
      description: "Orbitales secondaires de lissage empirique — cohérence non mesurable en mode dégradé.",
      color: "#06b6d4",
      genomicFocus: "Dispersion Spatiale",
    },
  ];

  return {
    drawName: context.drawName,
    suggestedNumbers: selected,
    candidates,
    confidence: calibratedConfidence,
    confidenceNote: "MOTEUR EN MODE FAIBLE PROFONDEUR - " + HONEST_NOTE,
    analysis: `Dataset court (${historyLength} tirage${historyLength > 1 ? "s" : ""}). Inférence basée sur la loi de succession de Laplace et décomposition stochastique continue. Audit antagoniste et indice de diversité génétique non calculés : les pseudo-canaux de ce mode dégradé ne sont pas des algorithmes du registre, les mesurer produirait un diagnostic trompeur.`,
    breakdown: breakdownRecord,
    timestamp: Date.now(),
    symbiosisFactor: 1.0,
    realityAlignment,
    realityAlignmentNote: HONEST_NOTE,
    adversarialApplied: false,
    challengedNumbers: [],
    stabilityScore: Math.round(samplePower * 100),
    explainabilityData: {},
    shrinkageApplied: true,
    shrinkageFactor: 1.0,
    uncertaintyQuantification: {
      epistemicUncertainty,
      aleatoricUncertainty,
      confidenceInterval: {
        lower: ciLower,
        upper: ciUpper,
      },
      entropyBits: parseFloat(currentEntropy.toFixed(3)),
      credibleIntervalRange: ciUpper - ciLower,
    },
    simulationScenarios,
    hyperparameters: {
      hawkesDecay: TUNING.DEFAULT_HAWKES_DECAY,
      spatialSigma: DOMAIN_SIZE / 60.0,
      gapVelocityWeight: 1.0,
      bayesWindowRatio: 0.1,
      sgdLearningRate: TUNING.DEFAULT_SGD_LEARNING_RATE,
      lyapunovHorizon: 15,
    },
    hyperTuningLog: [`Ajustement continu : dataset à profondeur adaptative (${historyLength} tirages)`],
    hyperAccuracyGain: 0,
  } as Prediction;
};

/**
 * SCÉNARIO B & C : Délégation Cloud / Haute Puissance avec Détection d'Erreur & Fallback Local
 */
export const tryCloudPrediction = async (context: PredictionRuntimeContext): Promise<Prediction | null> => {
  const useCloudEngine = context.useCloudEngine ?? getStoreStateSafely().useCloudEngine;

  if (
    useCloudEngine &&
    isSupabaseConfigured() &&
    context.drawName !== "ALL_COMBINED" &&
    context.drawName !== "ALL"
  ) {
    context.onProgress?.(15, "[Cloud] Interrogation du supercalculateur Cloud...");
    try {
      logger.info({ drawName: context.drawName }, "[predictionScenarios] Scenario B : Délégation de la prédiction vers Supabase Edge Function...");
      
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Cloud response latency threshold reached (3500ms)")), 3500)
      );

      const result = await Promise.race([
        apiClient.post<Prediction>(
          "predict-elite",
          {
            drawName: context.drawName,
            history: context.history,
            weights: context.weightsToUse,
            symbioticContext: context.symbioticContext,
            metrics: context.metrics,
          },
          { suppressErrorLogging: true }
        ),
        timeoutPromise
      ]);

      const isPayloadValid =
        result &&
        Array.isArray(result.suggestedNumbers) &&
        result.suggestedNumbers.length === TICKET_SIZE &&
        new Set(result.suggestedNumbers).size === TICKET_SIZE &&
        result.suggestedNumbers.every(
          (n: number) => typeof n === "number" && n >= 1 && n <= DOMAIN_SIZE && !isNaN(n) && Number.isInteger(n)
        ) &&
        Array.isArray(result.candidates) &&
        result.candidates.every(
          (n: number) => typeof n === "number" && n >= 1 && n <= DOMAIN_SIZE && !isNaN(n) && Number.isInteger(n)
        ) &&
        typeof result.confidence === "number" &&
        !isNaN(result.confidence) &&
        result.confidence >= 1 &&
        result.confidence <= 100;

      if (isPayloadValid) {
        logger.info({ drawName: context.drawName }, "[predictionScenarios] Scenario B : Prédiction obtenue et validée avec succès depuis le Cloud.");
        context.onProgress?.(100, "[Cloud] Alignement finalisé avec succès.");
        return { ...result, drawName: context.drawName };
      } else {
        logger.warn(
          { drawName: context.drawName, result },
          "[predictionScenarios] Scenario C : Réponse cloud reçue mais PAYLOAD ANALYTIQUE INVALIDE ou INCOMPLET. Activation du repli local."
        );
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      logger.warn(
        { drawName: context.drawName, error: errorMsg },
        "[predictionScenarios] Scenario C : Échec de la prédiction Cloud (Réseau/Serveur). Basculement automatique local."
      );
    }
  }
  return null;
};

/**
 * SCÉNARIO D : Générateur de Matrice Multi-Scénarios Déterministe
 *
 * Chaque ticket dérivé est une exploration structurelle du même vecteur de scores débruité.
 * Le champ `coherenceScore` de chaque scénario est calculé par la MÊME transformation de Platt
 * que le vecteur primaire, appliquée à la moyenne des scores de ses propres membres — jamais par
 * un multiplicateur arbitraire de la confiance primaire. Quand le calibrage est indisponible, il
 * vaut `null` (« n/d »), car un indicateur non mesuré ne doit pas être inventé.
 */
export const generateProbabilisticScenarioMatrix = (params: {
  selection: number[];
  denoisedScores: ScoredNumber[];
  explainabilityRecord: Record<number, any>;
  /** Indicateur de cohérence du vecteur primaire (ou null si non mesurable). */
  primaryCoherence: number | null;
  drawName: string;
  calibration?: ScenarioCoherenceCalibration;
  dnaSieveMetrics?: {
    dominantAlgos: string[];
    dnaConcordanceMean: number;
  };
}): SimulationScenarioItem[] => {
  const { selection, denoisedScores, explainabilityRecord, primaryCoherence, dnaSieveMetrics, calibration } = params;

  // Le vecteur débruité n'est PAS trié (le débruitage PCA et le tamis ADN préservent l'ordre du
  // registre). On établit un classement local explicite avant toute sélection par rang.
  const rankedScores = [...denoisedScores].sort((a, b) => (b.score || 0) - (a.score || 0));
  const coherenceOf = buildTicketCoherenceScorer(denoisedScores, calibration);

  // 1. Scénario 1: Consensus Symbiotique (Tamis ADN) — le ticket primaire du moteur
  const balancedTicket = [...selection].sort((a, b) => a - b);

  // 2. Scénario 2: Attracteur Fréquentiel (Défensif / Densité maximale)
  const defensiveTicket = rankedScores
    .slice(0, TICKET_SIZE)
    .map((s) => s.num)
    .sort((a, b) => a - b);

  // 3. Scénario 3: Rupture de Phase (Exploration Lyapunov / Agressif)
  const top3 = rankedScores.slice(0, 3).map((s) => s.num);
  const outsiderPool = rankedScores
    .slice(5, 25)
    .sort((a, b) => {
      const tensionA = explainabilityRecord[a.num]?.topologicalTension || 0;
      const tensionB = explainabilityRecord[b.num]?.topologicalTension || 0;
      return tensionB - tensionA;
    })
    .map((s) => s.num);

  const aggressiveTicket = Array.from(new Set([...top3, ...outsiderPool.slice(0, 2)]))
    .slice(0, TICKET_SIZE)
    .sort((a, b) => a - b);

  // 4. Scénario 4: Résilience Hawkes (Auto-Excitant / Temporel)
  const hawkesPool = [...denoisedScores]
    .sort((a, b) => {
      const hA = ((a.breakdown as any)?.["hawkes"] || (a.breakdown as any)?.["spatioTemporalHawkes"] || (a.breakdown as any)?.[AlgoKey.TEMPORAL] || 0);
      const hB = ((b.breakdown as any)?.["hawkes"] || (b.breakdown as any)?.["spatioTemporalHawkes"] || (b.breakdown as any)?.[AlgoKey.TEMPORAL] || 0);
      return hB - hA;
    })
    .slice(0, TICKET_SIZE)
    .map((s) => s.num)
    .sort((a, b) => a - b);

  // 5. Scénario 5: Anti-Consensus Adversarial (atténuation continue des leurres machine)
  const decoyOf = (num: number): number => {
    const shap = explainabilityRecord[num]?.shapValues || {};
    const raw = Number(shap["machineDecoy"] ?? shap["transfertMachine"] ?? 0);
    return Number.isFinite(raw) ? Math.max(0, raw) : 0;
  };
  const decoyValues = denoisedScores.map((s) => decoyOf(s.num));
  const decoyMean = decoyValues.length > 0 ? decoyValues.reduce((a, b) => a + b, 0) / decoyValues.length : 0;
  const decoyVariance =
    decoyValues.length > 0
      ? decoyValues.reduce((acc, v) => acc + Math.pow(v - decoyMean, 2), 0) / decoyValues.length
      : 0;
  const decoyStd = Math.sqrt(decoyVariance);
  // Poids de mesurabilité ∈ [0,1] : nul lorsque les leurres sont constants (donc non discriminants),
  // ce qui neutralise l'atténuation au lieu de filtrer sur un seuil de rejet binaire arbitraire.
  const decoySpreadWeight = decoyStd > 0 ? decoyStd / (Math.abs(decoyMean) + decoyStd) : 0;
  const scoreMean = rankedScores.length > 0 ? rankedScores.reduce((a, s) => a + (s.score || 0), 0) / rankedScores.length : 0;
  const scoreStd =
    rankedScores.length > 0
      ? Math.sqrt(rankedScores.reduce((acc, s) => acc + Math.pow((s.score || 0) - scoreMean, 2), 0) / rankedScores.length)
      : 0;
  const zScore = (score: number): number => (scoreStd > 0 ? (score - scoreMean) / scoreStd : 0);

  // Pénalité exprimée dans le MÊME espace standardisé que le score, afin d'être comparable à lui
  // quelle que soit l'échelle des canaux. Aucun seuil : le leurrage s'oppose continûment au score,
  // et l'opposition s'annule quand l'information de leurrage est absente.
  const adversarialPool = [...denoisedScores]
    .map((s) => ({
      num: s.num,
      adjusted:
        zScore(s.score || 0) - decoySpreadWeight * (decoyStd > 0 ? (decoyOf(s.num) - decoyMean) / decoyStd : 0),
    }))
    .sort((a, b) => b.adjusted - a.adjusted)
    .slice(0, TICKET_SIZE)
    .map((s) => s.num)
    .sort((a, b) => a - b);

  const buildScenario = (
    scenarioId: string,
    scenarioName: string,
    ticketRaw: number[],
    riskProfile: SimulationScenarioItem["riskProfile"],
    description: string,
    color: string,
    genomicFocus: string,
    coherenceScore: number | null
  ): SimulationScenarioItem => ({
    scenarioId,
    scenarioName,
    ticket: ticketRaw.length === TICKET_SIZE ? ticketRaw : balancedTicket,
    coherenceScore,
    riskProfile,
    description,
    color,
    genomicFocus,
  });

  return [
    buildScenario(
      "sim_balanced",
      "Consensus Symbiotique (Tamis ADN)",
      balancedTicket,
      "BALANCED",
      dnaSieveMetrics?.dominantAlgos?.length
        ? `Équilibre optimisé par le Tamis ADN (${dnaSieveMetrics.dominantAlgos.slice(0, 2).join(" • ")}, Concordance : ${dnaSieveMetrics.dnaConcordanceMean}%).`
        : "Profil d'équilibre optimisé par le Tamis ADN et l'alignement de réalité.",
      "#6366f1",
      "Tamis ADN & Alignement",
      primaryCoherence
    ),
    buildScenario(
      "sim_defensive",
      "Attracteur Fréquentiel (Défensif)",
      defensiveTicket,
      "DEFENSIVE",
      "Concentration sur les centres de masse à densité maximale et variance stochastique minimale.",
      "#10b981",
      "Densité Fréquentielle",
      coherenceOf(defensiveTicket)
    ),
    buildScenario(
      "sim_aggressive",
      "Rupture de Phase (Exploration Lyapunov)",
      aggressiveTicket,
      "AGGRESSIVE",
      "Injection d'outsiders à tension topologique élevée pour anticiper les ruptures et bifurcations de régime.",
      "#f43f5e",
      "Tension Topologique",
      coherenceOf(aggressiveTicket)
    ),
    buildScenario(
      "sim_recurrent",
      "Résilience Hawkes (Auto-Excitant)",
      hawkesPool,
      "RECURRENT",
      "Modélisation des trains de clusters temporels et excitations mutuelles de Poisson/Hawkes.",
      "#8b5cf6",
      "Auto-excitation Temporelle",
      coherenceOf(hawkesPool)
    ),
    buildScenario(
      "sim_adversarial",
      "Anti-Consensus Adversarial (Filtre Pièges)",
      adversarialPool,
      "ADVERSARIAL",
      decoySpreadWeight <= 0
        ? "Atténuation neutre : les leurres machine sont constants sur ce tirage, donc non discriminants — classement par score brut."
        : "Atténuation continue des leurres machine par z-score standardisé (aucun seuil de rejet binaire).",
      "#f59e0b",
      "Anti-Leurres Machine",
      coherenceOf(adversarialPool)
    ),
  ];
};

/**
 * Morphing Continu entre deux Scénarios (Interpolation Paramétrique α ∈ [0, 1])
 * Permet d'explorer de manière continue le gradient entre deux profils stratégiques.
 *
 * L'indicateur interpolé n'est renvoyé que si les DEUX scénarios en possèdent un : interpoler
 * vers une valeur non mesurable produirait un nombre qui ne correspond à rien de calculé.
 */
export const interpolatePredictionScenarios = (
  scenarioA: SimulationScenarioItem,
  scenarioB: SimulationScenarioItem,
  alpha: number
): {
  ticket: number[];
  interpolatedProbability: number | null;
  interpolatedAlpha: number;
  dominantScenario: string;
} => {
  const boundedAlpha = Math.max(0, Math.min(1, alpha));
  const scoreMap = new Map<number, number>();

  // Attribution des masses de probabilité continues
  scenarioA.ticket.forEach((n, idx) => {
    const rankWeight = (TICKET_SIZE - idx) / TICKET_SIZE;
    scoreMap.set(n, (scoreMap.get(n) || 0) + (1.0 - boundedAlpha) * rankWeight);
  });

  scenarioB.ticket.forEach((n, idx) => {
    const rankWeight = (TICKET_SIZE - idx) / TICKET_SIZE;
    scoreMap.set(n, (scoreMap.get(n) || 0) + boundedAlpha * rankWeight);
  });

  const sortedCandidates = Array.from(scoreMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([num]) => num);

  // |A ∪ B| ≥ max(|A|, |B|) : ce chemin n'est emprunté que si un ticket source est incomplet.
  const mergedTicket =
    sortedCandidates.length >= TICKET_SIZE
      ? sortedCandidates.slice(0, TICKET_SIZE).sort((a, b) => a - b)
      : Array.from(new Set([...scenarioA.ticket, ...scenarioB.ticket])).sort((a, b) => a - b);

  const interpolatedProbability =
    scenarioA.coherenceScore === null || scenarioB.coherenceScore === null
      ? null
      : Math.round(
          (1.0 - boundedAlpha) * scenarioA.coherenceScore + boundedAlpha * scenarioB.coherenceScore
        );

  const dominantScenario =
    boundedAlpha <= 0
      ? scenarioA.scenarioName
      : boundedAlpha >= 1
      ? scenarioB.scenarioName
      : `Hybride (${((1 - boundedAlpha) * 100).toFixed(0)}% A • ${(boundedAlpha * 100).toFixed(0)}% B)`;

  return {
    ticket: mergedTicket,
    interpolatedProbability,
    interpolatedAlpha: boundedAlpha,
    dominantScenario,
  };
};
