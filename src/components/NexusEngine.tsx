import React, { useEffect, useMemo, useRef } from "react";
import { useNexusStore } from "../store/useNexusStore";
import { useDrawHistory, useNexusAnalytics } from "../hooks/useLottery";
import {
  getAlgoWeights,
  generateMasterPrediction,
  generateMasterPredictionCore,
  runLocalSimplifiedPipeline,
  handleScenarioADegradedPrediction,
  buildPredictionRequestContext,
  hashWeights,
  normalizeWeights,
} from "../services/prediction/predictionFacade";
import { hashHistoryContent } from "../services/prediction/microSgd";
import { computeModelDnaFingerprint } from "../services/prediction/modelDnaKnowledgeBase";
import { generateEmpiricalCalibration } from "../services/prediction/ticketAnalysisService";
import { generateSmartInsights } from "../services/insightService";
import {
  getPredictionHistoryAsync,
  calculateExtendedHistoricalPerformance,
  linkPredictionToResult,
  findMatchingResultForPrediction,
} from "../services/predictionHistoryService";
import {
  performForensicAnalysis,
  saveForensicReport,
  syncForensicReportsWithCloud,
  getLocalForensicReports,
} from "../services/postPredictionAnalysisService";
import { reconcileDnaLogsWithDrawResult } from "../services/prediction/dnaAuditLogService";
import {
  DRAW_DOMAIN_SIZE,
  DRAW_PICK_SIZE,
  UNIFORM_BRIER_REFERENCE,
  UNIFORM_SINGLE_NUMBER_PROBABILITY,
} from "../shared/drawTheory";
import {
  AlgoKey,
  DEFAULT_ALGO_WEIGHTS,
  type PredictionStrategy,
} from "../shared/prediction.types";
import {
  drawHasMachineNumbers,
  getDrawNetworkId,
  normalizeDrawName,
  type InterDrawNetworkId,
} from "../constants";
import type {
  AlgoWeights,
  CalibrationData,
  DrawResult,
  Prediction,
} from "../types";
import { deriveSeedFromHistory } from "../utils/deterministicSeed";
import { AppError, logError } from "../utils/AppError";
import { logger } from "../utils/logger";
import { useAutonomousAgent } from "../hooks/useAutonomousAgent";
import { purifyHistoryForDraw } from "../utils/arrayUtils";

export interface DnaGeneChecksumSnapshot {
  genesChecksum: string;
  outputChecksum: string;
  predictionChecksum: string;
}

export interface DnaGeneBaselineSignature {
  drawName: string;
  networkId: InterDrawNetworkId | null;
  deterministicSeed: number;
  historyContentHash: string;
  historyLength: number;
  weightsFingerprint: string;
  inputBaselineChecksum: string;
}

export type DnaGeneIntegrityStatus =
  | "VERIFIED"
  | "BASELINE_REGISTERED"
  | "CHECKSUM_MISMATCH"
  | "INVARIANT_VIOLATION";

export interface DnaGeneIntegrityReport {
  valid: boolean;
  status: DnaGeneIntegrityStatus;
  drawName: string;
  networkId: InterDrawNetworkId | null;
  deterministicSeed: number;
  inputBaselineChecksum: string;
  genesChecksum: string;
  outputChecksum: string;
  predictionChecksum: string;
  expectedBaselineChecksum: string | null;
  expectedGenesChecksum: string | null;
  expectedOutputChecksum: string | null;
  discrepancyReasons: string[];
  checkedAt: number;
}

export interface DnaGeneIntegrityInput {
  prediction: Prediction;
  drawName: string;
  history: DrawResult[];
  weights?: AlgoWeights;
  temporalDepth?: number;
  predictionStrategy?: PredictionStrategy;
  adversarialMode?: boolean;
  forcedOutsiderCount?: number;
  isForensicOptimized?: boolean;
  useSpatioTemporalHawkes?: boolean;
  useCloudEngine?: boolean;
  skipTraining?: boolean;
  baselineRegistry?: Map<string, DnaGeneChecksumSnapshot>;
  recomputeBaseline?: boolean;
}

const fnv1a64Hex = (input: string): string => {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    hash = (hash ^ BigInt(code & 0xff)) & mask;
    hash = (hash * prime) & mask;
    if (code > 0xff) {
      hash = (hash ^ BigInt((code >> 8) & 0xff)) & mask;
      hash = (hash * prime) & mask;
    }
  }
  return hash.toString(16).padStart(16, "0");
};

const canonicalFloat = (value: unknown, digits = 6): string => {
  if (typeof value !== "number" || !Number.isFinite(value)) return "NaN";
  const rounded = value === 0 ? 0 : Number(value.toFixed(digits));
  return Object.is(rounded, -0) ? "0" : rounded.toFixed(digits);
};

const canonicalizeNumericRecord = (
  record: Record<number, number> | undefined,
  digits = 6,
): string => {
  if (!record) return "";
  return Object.keys(record)
    .map(Number)
    .filter((k) => Number.isFinite(k))
    .sort((a, b) => a - b)
    .map((k) => `${k}:${canonicalFloat(record[k], digits)}`)
    .join(",");
};

const canonicalizeStringNumberRecord = (
  record: Record<string, number> | undefined,
  digits = 6,
): string => {
  if (!record) return "";
  return Object.keys(record)
    .sort((a, b) => a.localeCompare(b))
    .map((k) => `${k}:${canonicalFloat(record[k], digits)}`)
    .join(",");
};

/**
 * Calcule les checksums FNV-1a 64-bit déterministes des gènes de l'ADN algorithmique
 * (poids des canaux, tamis génomique DnaSieve, phase cyclique) et des sorties stochastiques
 * (vecteur sélectionné, candidates, marginales 5/90, décomposition par canal).
 * Exclut intentionnellement les horodatages volatils pour garantir l'invariance reproductible.
 */
export const computePredictionDnaGeneChecksum = (
  prediction: Prediction,
): DnaGeneChecksumSnapshot => {
  const normDraw = normalizeDrawName(prediction.drawName || "");
  const networkId = getDrawNetworkId(prediction.drawName || "") || "isolated";
  const strategy = prediction.predictionStrategy ?? "optimal_selection";
  const pipeline = prediction.pipeline ?? "full";

  const channelWeightsStr = canonicalizeStringNumberRecord(
    prediction.walkForwardCalibration?.channelWeights,
    6,
  );

  const dnaSieve = prediction.dnaSieve;
  const dnaSieveStr = dnaSieve
    ? [
        `dom=${(dnaSieve.dominantAlgos || []).join(",")}`,
        `conc=${canonicalFloat(dnaSieve.dnaConcordanceMean, 4)}`,
        `ent=${canonicalFloat(dnaSieve.entropyBits, 4)}`,
        `snr=${canonicalFloat(dnaSieve.sieveIntensitySNR, 4)}`,
        `elites=${canonicalFloat(dnaSieve.elitesCount, 4)}`,
        `shadows=${canonicalFloat(dnaSieve.shadowsCount, 4)}`,
        `ret=${canonicalFloat(dnaSieve.retentionRatePct, 4)}`,
        `mult=${canonicalizeNumericRecord(dnaSieve.multipliers, 4)}`,
        `aff=${canonicalizeNumericRecord(dnaSieve.affinityPercent, 2)}`,
        `fam=${(dnaSieve.macroFamilies || [])
          .map(
            (f) =>
              `${f.familyKey}:${canonicalFloat(f.currentWeightPct, 2)}:${canonicalFloat(f.sieveEnergyPct, 2)}`,
          )
          .join(",")}`,
      ].join("|")
    : "none";

  const cyclic = prediction.cyclicPhaseProfile;
  const cyclicStr = cyclic
    ? [
        cyclic.phase,
        canonicalFloat(cyclic.lyapunovExponent, 6),
        canonicalFloat(cyclic.stochasticDispersionIndex, 6),
        canonicalFloat(cyclic.attractorTension, 6),
        canonicalFloat(cyclic.confidenceModulator, 6),
        cyclic.dominantMacroFamily,
      ].join("|")
    : "none";

  const genesPayload = [
    `draw=${normDraw}`,
    `net=${networkId}`,
    `strat=${strategy}`,
    `pipe=${pipeline}`,
    `weights=${channelWeightsStr}`,
    `sieve=${dnaSieveStr}`,
    `cyclic=${cyclicStr}`,
  ].join("||");

  const suggestedStr = (prediction.suggestedNumbers || []).join(",");
  const candidatesStr = (prediction.candidates || []).join(",");
  const probsStr = canonicalizeNumericRecord(prediction.numberProbabilities, 8);
  const breakdownKeys = Object.keys(prediction.breakdown || {})
    .map(Number)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  const breakdownStr = breakdownKeys
    .map(
      (num) =>
        `${num}={${canonicalizeStringNumberRecord(
          prediction.breakdown?.[num] as Record<string, number> | undefined,
          4,
        )}}`,
    )
    .join(";");
  const skill = prediction.empiricalSkill;
  const skillStr = skill
    ? [
        canonicalFloat(skill.shrinkage, 6),
        canonicalFloat(skill.brierSkillScore, 6),
        canonicalFloat(skill.expectedHitsTopK, 6),
        canonicalFloat(skill.liftVsUniform, 6),
      ].join("|")
    : "none";

  const outputPayload = [
    `sel=${suggestedStr}`,
    `cand=${candidatesStr}`,
    `probs=${probsStr}`,
    `skill=${skillStr}`,
    `conf=${canonicalFloat(prediction.confidence, 4)}`,
    `align=${canonicalFloat(prediction.realityAlignment, 4)}`,
    `stab=${canonicalFloat(prediction.stabilityScore, 4)}`,
    `bd=${breakdownStr}`,
  ].join("||");

  const genesChecksum = `gene_${fnv1a64Hex(genesPayload)}`;
  const outputChecksum = `out_${fnv1a64Hex(outputPayload)}`;
  const predictionChecksum = `dna_chk_${fnv1a64Hex(`${genesChecksum}|${outputChecksum}`)}`;

  return {
    genesChecksum,
    outputChecksum,
    predictionChecksum,
  };
};

/**
 * Construit la signature déterministe d'entrée de référence (base historique isolée,
 * seed FNV-1a 64-bit, réseau étanche, poids ADN normalisés et hyperparamètres actifs).
 */
export const buildPredictionBaselineSignature = ({
  drawName,
  history,
  weights,
  temporalDepth = 100,
  predictionStrategy = "optimal_selection",
  adversarialMode = false,
  forcedOutsiderCount,
  isForensicOptimized = false,
  useSpatioTemporalHawkes = true,
  useCloudEngine = false,
  skipTraining = false,
}: {
  drawName: string;
  history: DrawResult[];
  weights?: AlgoWeights;
  temporalDepth?: number;
  predictionStrategy?: PredictionStrategy;
  adversarialMode?: boolean;
  forcedOutsiderCount?: number;
  isForensicOptimized?: boolean;
  useSpatioTemporalHawkes?: boolean;
  useCloudEngine?: boolean;
  skipTraining?: boolean;
}): DnaGeneBaselineSignature => {
  const purifiedHistory = purifyHistoryForDraw(drawName, history || []);
  const networkId = getDrawNetworkId(drawName);
  const deterministicSeed = deriveSeedFromHistory(purifiedHistory);
  const historyContentHash = hashHistoryContent(purifiedHistory);

  const sanitizedWeights: AlgoWeights = {
    ...DEFAULT_ALGO_WEIGHTS,
    ...(weights || {}),
  };
  if (!drawHasMachineNumbers(drawName, purifiedHistory)) {
    sanitizedWeights[AlgoKey.MACHINE_TRANSFER] = 0;
  }
  const normalized = normalizeWeights(sanitizedWeights);
  const weightsFingerprint = computeModelDnaFingerprint(drawName, normalized);

  const baselineInputStr = [
    `draw=${normalizeDrawName(drawName)}`,
    `net=${networkId || "isolated"}`,
    `seed=${deterministicSeed}`,
    `hist=${historyContentHash}:${purifiedHistory.length}`,
    `wf=${weightsFingerprint}`,
    `depth=${temporalDepth}`,
    `strat=${predictionStrategy}`,
    `adv=${adversarialMode ? 1 : 0}`,
    `out=${forcedOutsiderCount ?? "auto"}`,
    `for=${isForensicOptimized ? 1 : 0}`,
    `hawkes=${useSpatioTemporalHawkes ? 1 : 0}`,
    `cloud=${useCloudEngine ? 1 : 0}`,
    `skip=${skipTraining ? 1 : 0}`,
  ].join("|");

  return {
    drawName,
    networkId,
    deterministicSeed,
    historyContentHash,
    historyLength: purifiedHistory.length,
    weightsFingerprint,
    inputBaselineChecksum: `base_${fnv1a64Hex(baselineInputStr)}`,
  };
};

/**
 * Vérifie l'intégrité des gènes de l'ADN algorithmique d'une prédiction par rapport
 * aux invariants stochastiques 5/90 et à la base déterministe de référence.
 */
export const verifyPredictionDnaGeneIntegrity = async (
  input: DnaGeneIntegrityInput,
): Promise<DnaGeneIntegrityReport> => {
  const {
    prediction,
    drawName,
    history,
    weights,
    temporalDepth = 100,
    predictionStrategy = prediction.predictionStrategy ?? "optimal_selection",
    adversarialMode = prediction.adversarialApplied ?? false,
    forcedOutsiderCount,
    isForensicOptimized = false,
    useSpatioTemporalHawkes = true,
    useCloudEngine = false,
    skipTraining = false,
    baselineRegistry,
    recomputeBaseline = false,
  } = input;

  const rawHistory = Array.isArray(history) ? history : [];
  const purifiedHistory = purifyHistoryForDraw(drawName, rawHistory);
  const baseline = buildPredictionBaselineSignature({
    drawName,
    history: purifiedHistory,
    weights,
    temporalDepth,
    predictionStrategy,
    adversarialMode,
    forcedOutsiderCount,
    isForensicOptimized,
    useSpatioTemporalHawkes,
    useCloudEngine,
    skipTraining,
  });
  const actualChecksum = computePredictionDnaGeneChecksum(prediction);
  const discrepancies: string[] = [];

  // 1. Vérification de l'isolation stricte du tirage et du réseau (AGENTS.md §2)
  if (
    prediction.drawName &&
    normalizeDrawName(prediction.drawName) !== normalizeDrawName(drawName)
  ) {
    discrepancies.push(
      `DRAW_ISOLATION_MISMATCH: prédiction '${prediction.drawName}' incompatible avec le tirage actif '${drawName}'.`,
    );
  }

  const targetNorm = normalizeDrawName(drawName);
  const foreignDrawCount = rawHistory.filter((entry) => {
    const entryName = entry?.drawName || entry?.draw_name;
    return entryName && normalizeDrawName(entryName) !== targetNorm;
  }).length;
  if (foreignDrawCount > 0) {
    discrepancies.push(
      `HISTORY_CROSS_DRAW_CONTAMINATION: ${foreignDrawCount} tirage(s) étrangers détectés dans le flux source.`,
    );
  }

  if (purifiedHistory.length === 0) {
    discrepancies.push(
      "EMPTY_ISOLATED_HISTORY: aucun tirage réel isolé disponible pour ancrer la base déterministe.",
    );
  }

  // 2. Vérification du ticket stochastique 5/90
  const suggested = prediction.suggestedNumbers || [];
  const uniqueSuggested = new Set(suggested);
  const allValidRange = suggested.every(
    (n) => Number.isInteger(n) && n >= 1 && n <= DRAW_DOMAIN_SIZE,
  );
  if (
    suggested.length !== DRAW_PICK_SIZE ||
    uniqueSuggested.size !== DRAW_PICK_SIZE ||
    !allValidRange
  ) {
    discrepancies.push(
      `INVALID_SELECTION_CARDINALITY: attendu ${DRAW_PICK_SIZE} numéros distincts dans [1..${DRAW_DOMAIN_SIZE}].`,
    );
  }

  // 3. Vérification des gènes algorithmiques & du simplexe (hors mode dégradé < 12 tirages)
  const isDegraded = prediction.pipeline === "degraded";
  const channelWeights = prediction.walkForwardCalibration?.channelWeights;
  if (!isDegraded) {
    if (!channelWeights || Object.keys(channelWeights).length === 0) {
      discrepancies.push(
        "MISSING_CHANNEL_GENES: gènes de pondération walkForwardCalibration.channelWeights absents.",
      );
    } else {
      const entries = Object.entries(channelWeights);
      const weightSum = entries.reduce(
        (acc, [, val]) => acc + (Number.isFinite(val) ? val : NaN),
        0,
      );
      const hasInvalidWeight = entries.some(
        ([, val]) => !Number.isFinite(val) || val < 0,
      );
      const weightTolerance = Math.max(1e-4, entries.length * 1e-5);
      if (hasInvalidWeight || !Number.isFinite(weightSum)) {
        discrepancies.push(
          "CORRUPT_CHANNEL_GENE_WEIGHTS: valeurs non finies ou négatives dans les gènes.",
        );
      } else if (Math.abs(weightSum - 1.0) > weightTolerance) {
        discrepancies.push(
          `GENE_SIMPLEX_DRIFT: somme des poids génétiques=${weightSum.toFixed(6)} (attendu 1.000000).`,
        );
      }

      const hasMachine = drawHasMachineNumbers(drawName, purifiedHistory);
      const machineWeight = channelWeights[AlgoKey.MACHINE_TRANSFER] ?? 0;
      if (!hasMachine && Math.abs(machineWeight) > 1e-9) {
        discrepancies.push(
          `MACHINE_TRANSFER_LEAK: poids ${AlgoKey.MACHINE_TRANSFER}=${machineWeight} non nul sur un tirage sans machine.`,
        );
      }
    }

    if (!prediction.dnaSieve || (prediction.dnaSieve.dominantAlgos || []).length === 0) {
      discrepancies.push(
        "MISSING_DNA_SIEVE_GENES: empreinte du tamis génomique DnaSieve absente.",
      );
    } else if (prediction.dnaSieve.multipliers) {
      const invalidMult = Object.values(prediction.dnaSieve.multipliers).some(
        (m) => typeof m !== "number" || !Number.isFinite(m) || m <= 0,
      );
      if (invalidMult) {
        discrepancies.push(
          "CORRUPT_DNA_SIEVE_MULTIPLIERS: multiplicateurs DnaSieve invalides ou négatifs.",
        );
      }
    }

    if (prediction.numberProbabilities) {
      let mass = 0;
      let missingCount = 0;
      let invalidProb = false;
      for (let n = 1; n <= DRAW_DOMAIN_SIZE; n++) {
        const p = prediction.numberProbabilities[n];
        if (p === undefined) {
          missingCount++;
        } else if (!Number.isFinite(p) || p < 0 || p > 1) {
          invalidProb = true;
        } else {
          mass += p;
        }
      }
      const simplexTolerance = DRAW_DOMAIN_SIZE * 1e-6;
      if (missingCount > 0 || invalidProb) {
        discrepancies.push(
          "INVALID_MARGINAL_PROBABILITIES: vecteur de probabilités 1..90 incomplet ou hors [0, 1].",
        );
      } else if (Math.abs(mass - DRAW_PICK_SIZE) > simplexTolerance) {
        discrepancies.push(
          `PROBABILITY_SIMPLEX_VIOLATION: masse totale=${mass.toFixed(6)} (attendu ${DRAW_PICK_SIZE}.000000).`,
        );
      }
    }
  }

  for (const num of suggested) {
    const bd = prediction.breakdown?.[num];
    if (bd) {
      const hasBadScore = Object.values(bd).some(
        (v) => typeof v === "number" && !Number.isFinite(v),
      );
      if (hasBadScore) {
        discrepancies.push(
          `NON_FINITE_BREAKDOWN: score non fini détecté pour le numéro ${num}.`,
        );
        break;
      }
    }
  }

  // 4. Comparaison avec la base déterministe (recalcul complet ou registre déterministe)
  let expectedBaselineChecksum: string | null = null;
  let expectedGenesChecksum: string | null = null;
  let expectedOutputChecksum: string | null = null;
  let status: DnaGeneIntegrityStatus =
    discrepancies.length > 0 ? "INVARIANT_VIOLATION" : "VERIFIED";

  if (recomputeBaseline && purifiedHistory.length > 0) {
    const resolvedWeights = weights || (await getAlgoWeights(drawName));
    let baselinePred: Prediction;
    if (prediction.pipeline === "degraded" || purifiedHistory.length < 12) {
      const ctx = buildPredictionRequestContext(
        drawName,
        purifiedHistory,
        temporalDepth,
        resolvedWeights,
        undefined,
        undefined,
        skipTraining,
        adversarialMode,
        forcedOutsiderCount,
        isForensicOptimized,
        undefined,
        undefined,
        useSpatioTemporalHawkes,
        useCloudEngine,
        predictionStrategy,
      );
      baselinePred = handleScenarioADegradedPrediction(ctx);
    } else if (prediction.pipeline === "simplified") {
      const ctx = buildPredictionRequestContext(
        drawName,
        purifiedHistory,
        temporalDepth,
        resolvedWeights,
        undefined,
        undefined,
        skipTraining,
        adversarialMode,
        forcedOutsiderCount,
        isForensicOptimized,
        undefined,
        undefined,
        useSpatioTemporalHawkes,
        useCloudEngine,
        predictionStrategy,
      );
      baselinePred = await runLocalSimplifiedPipeline(ctx);
    } else {
      baselinePred = await generateMasterPredictionCore(
        drawName,
        purifiedHistory,
        temporalDepth,
        resolvedWeights,
        undefined,
        undefined,
        skipTraining,
        adversarialMode,
        forcedOutsiderCount,
        isForensicOptimized,
        useSpatioTemporalHawkes,
        undefined,
        undefined,
        predictionStrategy,
      );
    }

    const expectedChecksum = computePredictionDnaGeneChecksum(baselinePred);
    expectedBaselineChecksum = expectedChecksum.predictionChecksum;
    expectedGenesChecksum = expectedChecksum.genesChecksum;
    expectedOutputChecksum = expectedChecksum.outputChecksum;

    if (actualChecksum.genesChecksum !== expectedChecksum.genesChecksum) {
      discrepancies.push(
        `GENES_CHECKSUM_MISMATCH: gènes=${actualChecksum.genesChecksum} vs référence=${expectedChecksum.genesChecksum}.`,
      );
    }
    if (actualChecksum.outputChecksum !== expectedChecksum.outputChecksum) {
      discrepancies.push(
        `OUTPUT_CHECKSUM_MISMATCH: sortie=${actualChecksum.outputChecksum} vs référence=${expectedChecksum.outputChecksum}.`,
      );
    }
    if (
      actualChecksum.predictionChecksum !== expectedChecksum.predictionChecksum
    ) {
      status = "CHECKSUM_MISMATCH";
    }
  } else if (baselineRegistry) {
    const existing = baselineRegistry.get(baseline.inputBaselineChecksum);
    if (existing) {
      expectedBaselineChecksum = existing.predictionChecksum;
      expectedGenesChecksum = existing.genesChecksum;
      expectedOutputChecksum = existing.outputChecksum;

      if (actualChecksum.genesChecksum !== existing.genesChecksum) {
        discrepancies.push(
          `GENES_CHECKSUM_MISMATCH: gènes=${actualChecksum.genesChecksum} vs base=${existing.genesChecksum}.`,
        );
      }
      if (actualChecksum.outputChecksum !== existing.outputChecksum) {
        discrepancies.push(
          `OUTPUT_CHECKSUM_MISMATCH: sortie=${actualChecksum.outputChecksum} vs base=${existing.outputChecksum}.`,
        );
      }
      if (actualChecksum.predictionChecksum !== existing.predictionChecksum) {
        status = "CHECKSUM_MISMATCH";
      }
    } else if (discrepancies.length === 0) {
      baselineRegistry.set(baseline.inputBaselineChecksum, actualChecksum);
      expectedBaselineChecksum = actualChecksum.predictionChecksum;
      expectedGenesChecksum = actualChecksum.genesChecksum;
      expectedOutputChecksum = actualChecksum.outputChecksum;
      status = "BASELINE_REGISTERED";
    }
  }

  if (discrepancies.length > 0 && status === "VERIFIED") {
    status = discrepancies.some((d) => d.includes("CHECKSUM_MISMATCH"))
      ? "CHECKSUM_MISMATCH"
      : "INVARIANT_VIOLATION";
  }

  return {
    valid: discrepancies.length === 0,
    status,
    drawName,
    networkId: baseline.networkId,
    deterministicSeed: baseline.deterministicSeed,
    inputBaselineChecksum: baseline.inputBaselineChecksum,
    genesChecksum: actualChecksum.genesChecksum,
    outputChecksum: actualChecksum.outputChecksum,
    predictionChecksum: actualChecksum.predictionChecksum,
    expectedBaselineChecksum,
    expectedGenesChecksum,
    expectedOutputChecksum,
    discrepancyReasons: discrepancies,
    checkedAt: Date.now(),
  };
};

export const NexusEngine: React.FC = () => {
  useAutonomousAgent(); // Initialize the autonomous agent daemon
  const drawName = useNexusStore((s) => s.drawName);
  const temporalDepth = useNexusStore((s) => s.temporalDepth);
  const globalWeights = useNexusStore((s) => s.globalWeights);
  const isForensicOptimized = useNexusStore((s) => s.isForensicOptimized);
  const useSpatioTemporalHawkes = useNexusStore(
    (s) => s.useSpatioTemporalHawkes,
  );
  const useCloudEngine = useNexusStore((s) => s.useCloudEngine);
  const setHistoryData = useNexusStore((s) => s.setHistoryData);
  const setAnalyticsData = useNexusStore((s) => s.setAnalyticsData);
  const setLoading = useNexusStore((s) => s.setLoading);
  const setLastPrediction = useNexusStore((s) => s.setLastPrediction);
  const setSmartInsights = useNexusStore((s) => s.setSmartInsights);
  const setCalibration = useNexusStore((s) => s.setCalibration);
  const setEmpiricalCalibration = useNexusStore(
    (s) => s.setEmpiricalCalibration,
  );

  // Direct length store selectors are replaced with content-aware logic below to prevent stale state on identical draw sizes

  // --- DATA FETCHING VIA REACT QUERY ---
  const {
    data: rawHistory,
    isLoading: historyLoading,
    refetch: refetchHistory,
  } = useDrawHistory(drawName);

  // Assurer l'isolation hermétique et la convergence (TIRAGE ISOLATION RULE)
  const history = useMemo(() => {
    return purifyHistoryForDraw(drawName, rawHistory || []);
  }, [drawName, rawHistory]);

  const { data: analytics, isLoading: analyticsLoading } = useNexusAnalytics(
    drawName,
    history,
  );

  const lastPrediction = useNexusStore((s) => s.lastPrediction);
  const addAgentLog = useNexusStore((s) => s.addAgentLog);

  const loading = historyLoading || analyticsLoading;
  const lastComputedDrawKeyRef = useRef<string>("");
  const deterministicBaselineRegistryRef = useRef<
    Map<string, DnaGeneChecksumSnapshot>
  >(new Map());
  const lastVerifiedPredictionSignatureRef = useRef<string>("");

  // Sync loading state
  useEffect(() => {
    setLoading(loading);
  }, [loading, setLoading]);

  // Force refetch on store rehydration
  useEffect(() => {
    const handleRehydrated = () => {
      logger.debug(
        "[NexusEngine] Store rehydration detected, forcing full state synchronization...",
      );
      refetchHistory();
    };
    window.addEventListener("NEXUS_STORE_REHYDRATED", handleRehydrated);
    return () =>
      window.removeEventListener("NEXUS_STORE_REHYDRATED", handleRehydrated);
  }, [refetchHistory]);

  // 1. Initialisation Configuration (Hydratation sans ré-écriture superflue)
  useEffect(() => {
    let mounted = true;
    const initConfig = async () => {
      const weights = await getAlgoWeights(drawName);
      if (mounted && useNexusStore.getState().drawName === drawName) {
        const current = useNexusStore.getState().globalWeights;
        if (JSON.stringify(current) !== JSON.stringify(weights)) {
          useNexusStore.setState({ globalWeights: weights });
        }
      }
    };
    initConfig();
    return () => {
      mounted = false;
    };
  }, [drawName]);

  // 2. Calcul des Stats basiques (Rapide, synchrone)
  useEffect(() => {
    if (!history || history.length === 0) {
      const currentStoreHistory = useNexusStore.getState().history;
      if (currentStoreHistory.length > 0) {
        setHistoryData([], [], []);
      }
      return;
    }

    const storeHistory = useNexusStore.getState().history;
    const hasDrawNameMismatch =
      history.length > 0 &&
      storeHistory.length > 0 &&
      (history[0].drawName !== storeHistory[0].drawName ||
        history[0].draw_name !== storeHistory[0].draw_name);

    if (
      storeHistory.length !== history.length ||
      hasDrawNameMismatch ||
      storeHistory.length === 0
    ) {
      const counts: Record<number, number> = {};
      const safeHist = Array.isArray(history) ? history : [];
      safeHist.forEach((d) => {
        if (d && Array.isArray(d.gagnants)) {
          d.gagnants.forEach((n) => (counts[n] = (counts[n] || 0) + 1));
        }
      });
      const computedStats = Object.entries(counts)
        .map(([n, c]) => ({ number: Number(n), count: c }))
        .sort((a, b) => b.count - a.count);

      const computedGaps: { number: number; gap: number }[] = [];
      for (let i = 1; i <= 90; i++) {
        let gap = 0;
        for (const draw of safeHist) {
          if (draw?.gagnants && Array.isArray(draw.gagnants) && draw.gagnants.includes(i)) break;
          gap++;
        }
        computedGaps.push({ number: i, gap });
      }

      const empCal = generateEmpiricalCalibration(history);
      setEmpiricalCalibration(empCal);

      setHistoryData(history, computedStats, computedGaps);
    }
  }, [history, setHistoryData, setEmpiricalCalibration]);

  // Sync Analytics
  useEffect(() => {
    if (analytics) {
      setAnalyticsData(analytics);
    }
  }, [analytics, setAnalyticsData]);

  // 3. Génération Prédiction & Insights (Dépendant des Analytics et Weights)
  useEffect(() => {
    if (!analytics || !history || history.length < 10) return;

    let mounted = true;
    const runEngine = async () => {
      try {
        // Insights
        const insights = await generateSmartInsights(
          drawName,
          history,
          analytics.spectral,
          analytics.regularity.map((r) => ({
            number: r.number,
            gap: r.currentGap,
          })),
          analytics.regularity,
        );
        if (mounted) setSmartInsights(insights);

        // Clé de version complète (tirage + historique + poids + profondeur + options moteur)
        const currentDataKey = `${drawName}_${history.length}_${history[0]?.date || ""}_${hashWeights(globalWeights)}_${temporalDepth}_${isForensicOptimized ? 1 : 0}_${useSpatioTemporalHawkes ? 1 : 0}_${useCloudEngine ? 1 : 0}`;
        const currentPred = useNexusStore.getState().lastPrediction;

        // Génération automatique si aucune prédiction active ou si la configuration/données ont évolué
        if (!currentPred || currentPred.drawName !== drawName || lastComputedDrawKeyRef.current !== currentDataKey) {
          lastComputedDrawKeyRef.current = currentDataKey;
          const prediction = await generateMasterPrediction(
            drawName,
            history,
            temporalDepth,
            globalWeights,
            {
              spectral: analytics.spectral,
              correlationMatrix: analytics.correlationMatrix,
              regularity: analytics.regularity,
            },
            analytics.symbioticContext || undefined,
            false,
            false,
            undefined,
            isForensicOptimized,
            undefined,
            undefined,
            useSpatioTemporalHawkes,
            useCloudEngine,
          );
          if (mounted) {
            const integrityReport = await verifyPredictionDnaGeneIntegrity({
              prediction,
              drawName,
              history,
              weights: globalWeights,
              temporalDepth,
              predictionStrategy:
                prediction.predictionStrategy ?? "optimal_selection",
              isForensicOptimized,
              useSpatioTemporalHawkes,
              useCloudEngine,
              baselineRegistry: deterministicBaselineRegistryRef.current,
            });
            if (!integrityReport.valid) {
              logError(
                new AppError(
                  `Dérive d'intégrité ADN détectée (${integrityReport.status}): ${integrityReport.discrepancyReasons.join(" | ")}`,
                  "DNA_GENE_INTEGRITY_ERROR",
                  "high",
                  { integrityReport },
                ),
                { source: "NexusEngine" },
              );
              addAgentLog({
                id: `dna_chk_${integrityReport.deterministicSeed}_${integrityReport.checkedAt}`,
                timestamp: new Date(integrityReport.checkedAt),
                action: `Alerte Intégrité ADN (${drawName}): ${integrityReport.status}`,
                type: "WARNING",
                impact: integrityReport.discrepancyReasons[0],
              });
            }
            if (mounted) setLastPrediction(prediction);
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        logError(
          new AppError(msg || "Engine Error", "NEXUS_ENGINE_ERROR", "high", {
            error: e,
          }),
          { source: "NexusEngine" },
        );
      }
    };

    const t = setTimeout(() => {
      runEngine();
    }, 250);
    return () => {
      mounted = false;
      clearTimeout(t);
    };
  }, [
    drawName,
    history,
    analytics,
    globalWeights,
    temporalDepth,
    isForensicOptimized,
    useSpatioTemporalHawkes,
    useCloudEngine,
    addAgentLog,
    setLastPrediction,
    setSmartInsights,
  ]);

  // 3bis. Audit continu d'intégrité des gènes de l'ADN algorithmique sur toute prédiction active
  useEffect(() => {
    if (!lastPrediction || !drawName || !history || history.length === 0) {
      return;
    }

    const activeChecksum = computePredictionDnaGeneChecksum(lastPrediction);
    const verificationKey = `${drawName}|${history.length}|${lastPrediction.timestamp}|${activeChecksum.predictionChecksum}`;
    if (lastVerifiedPredictionSignatureRef.current === verificationKey) {
      return;
    }
    lastVerifiedPredictionSignatureRef.current = verificationKey;

    let mounted = true;
    const verifyActivePrediction = async () => {
      const report = await verifyPredictionDnaGeneIntegrity({
        prediction: lastPrediction,
        drawName,
        history,
        weights: globalWeights,
        temporalDepth,
        predictionStrategy:
          lastPrediction.predictionStrategy ?? "optimal_selection",
        adversarialMode: lastPrediction.adversarialApplied ?? false,
        isForensicOptimized,
        useSpatioTemporalHawkes,
        useCloudEngine,
        baselineRegistry: deterministicBaselineRegistryRef.current,
      });

      if (!mounted) return;
      if (!report.valid) {
        logError(
          new AppError(
            `Intégrité ADN compromise (${report.status}): ${report.discrepancyReasons.join(" | ")}`,
            "DNA_GENE_INTEGRITY_VIOLATION",
            "high",
            { report },
          ),
          { source: "NexusEngine" },
        );
        addAgentLog({
          id: `dna_audit_${report.deterministicSeed}_${report.checkedAt}`,
          timestamp: new Date(report.checkedAt),
          action: `Anomalie Checksum ADN (${drawName}): ${report.status}`,
          type: "WARNING",
          impact: report.discrepancyReasons[0],
        });
      } else {
        logger.debug(
          {
            drawName,
            status: report.status,
            predictionChecksum: report.predictionChecksum,
            baselineChecksum: report.inputBaselineChecksum,
          },
          "[NexusEngine] Checksum gènes ADN algorithmique authentifié.",
        );
      }
    };

    verifyActivePrediction().catch((err) => {
      logger.warn({ err }, "[NexusEngine] Échec audit intégrité ADN.");
    });

    return () => {
      mounted = false;
    };
  }, [
    lastPrediction,
    drawName,
    history,
    globalWeights,
    temporalDepth,
    isForensicOptimized,
    useSpatioTemporalHawkes,
    useCloudEngine,
    addAgentLog,
  ]);

  // 4. Calibration & Forensic Automator (Dépendant de l'historique uniquement)
  useEffect(() => {
    if (!history || history.length < 10) return;

    let mounted = true;
    const runCalibration = async () => {
      try {
        // Calibration (Backtesting historique des prédictions)
        const preds = await getPredictionHistoryAsync(drawName);
        if (preds.length > 0 && mounted) {
          // Preload all local forensic reports to prevent O(N * M) IndexedDB lookups/parsing inside the loop
          const allLocalReports = await getLocalForensicReports();

          // --- AUTO-LINKER, DNA RECONCILER & FORENSIC AUTOMATOR ---
          let historyChanged = false;
          let forensicGenerated = false;
          const reconciledResultIds = new Set<string>();

          // Seules les 10 dernières prédictions (les plus récentes) ont besoin d'être vérifiées et analysées en arrière-plan.
          // Cela évite de recalculer l'analyse forensique pour des centaines de vieux tirages à chaque changement de jeu.
          const relevantPreds = preds.slice(0, 10);

          // Chunk the processing to avoid blocking main thread
          for (let i = 0; i < relevantPreds.length; i++) {
            if (!mounted) break;
            const item = relevantPreds[i];
            let match = item.drawResultId
              ? history.find((r) => r.id === item.drawResultId)
              : null;

            if (!item.drawResultId) {
              match = findMatchingResultForPrediction(item, history);
              if (match) {
                await linkPredictionToResult(item.id, match.id);
                historyChanged = true;
              }
            }

            // Automate Forensic Analysis & DNA reconciliation if matched
            if (match) {
              if (!reconciledResultIds.has(match.id)) {
                reconciledResultIds.add(match.id);
                try {
                  await reconcileDnaLogsWithDrawResult(drawName, match, history);
                } catch (e) {
                  console.warn("Auto-DNA reconciliation failed for", match.id, e);
                }
              }

              const existingReport = allLocalReports.find(
                (r) => r.predictionId === item.id,
              );
              if (!existingReport) {
                try {
                  const report = await performForensicAnalysis(
                    drawName,
                    match.date,
                    item.prediction.suggestedNumbers,
                    match.gagnants,
                    item.prediction.breakdown,
                    item.id,
                    match.id,
                    true, // skipLLM for automated background analysis
                    history,
                  );
                  await saveForensicReport(report);
                  forensicGenerated = true;
                } catch (e) {
                  console.warn("Auto-Forensic failed for", item.id, e);
                }
              }
            }

            // Yield to event loop every 5 items to keep UI responsive
            if (i % 5 === 0) {
              await new Promise((r) => setTimeout(r, 5));
            }
          }

          if (forensicGenerated && mounted) {
            syncForensicReportsWithCloud().catch((e) =>
              console.error("Auto-sync forensic failed", e),
            );
          }

          // Recalculate empirical calibration strictly from matched draws & 5/90 H0 baseline (zero magic numbers)
          const updatedPreds = historyChanged
            ? await getPredictionHistoryAsync(drawName)
            : preds;
          const perf = calculateExtendedHistoricalPerformance(updatedPreds, history);

          const matchedPairs = updatedPreds
            .map((pred) => {
              const res =
                (pred.drawResultId
                  ? history.find((r) => r.id === pred.drawResultId)
                  : null) || findMatchingResultForPrediction(pred, history);
              if (!res || !Array.isArray(res.gagnants)) return null;
              const suggested = pred.prediction?.suggestedNumbers || [];
              const hits = suggested.filter((n) => res.gagnants.includes(n)).length;
              const observedRate = suggested.length > 0 ? hits / suggested.length : 0;
              const rawConf = pred.prediction?.confidence;
              const predictedProb =
                typeof rawConf === "number" && Number.isFinite(rawConf)
                  ? Math.min(1, Math.max(0, rawConf / 100))
                  : UNIFORM_SINGLE_NUMBER_PROBABILITY;
              return { timestamp: pred.timestamp, observedRate, predictedProb };
            })
            .filter((item): item is NonNullable<typeof item> => item !== null)
            .sort((a, b) => a.timestamp - b.timestamp);

          const sampleCount = matchedPairs.length;
          const baseline = UNIFORM_BRIER_REFERENCE;
          const overallScore =
            sampleCount > 0 ? perf.meanBrierScore : Number(baseline.toFixed(4));
          const meanObservedRate =
            sampleCount > 0
              ? matchedPairs.reduce((acc, p) => acc + p.observedRate, 0) / sampleCount
              : UNIFORM_SINGLE_NUMBER_PROBABILITY;
          const variance =
            sampleCount > 1
              ? matchedPairs.reduce(
                  (acc, p) => acc + Math.pow(p.observedRate - meanObservedRate, 2),
                  0,
                ) /
                (sampleCount - 1)
              : UNIFORM_BRIER_REFERENCE / DRAW_PICK_SIZE;
          const meanPredictedProb =
            sampleCount > 0
              ? matchedPairs.reduce((acc, p) => acc + p.predictedProb, 0) / sampleCount
              : UNIFORM_SINGLE_NUMBER_PROBABILITY;
          const h0Std = Math.sqrt(UNIFORM_BRIER_REFERENCE / DRAW_PICK_SIZE);
          const biasDelta = meanPredictedProb - meanObservedRate;
          const bias: CalibrationData["bias"] =
            sampleCount === 0 || Math.abs(biasDelta) <= h0Std
              ? "NEUTRAL"
              : biasDelta > 0
                ? "OPTIMIST"
                : "PESSIMIST";

          let trend = 0;
          if (sampleCount >= 2) {
            const meanIdx = (sampleCount - 1) / 2;
            let num = 0;
            let den = 0;
            for (let idx = 0; idx < sampleCount; idx++) {
              const dx = idx - meanIdx;
              num += dx * (matchedPairs[idx].observedRate - meanObservedRate);
              den += dx * dx;
            }
            trend = den > 0 ? Number((num / den).toFixed(4)) : 0;
          }

          const cycleReference = DRAW_DOMAIN_SIZE / DRAW_PICK_SIZE;
          const confidence = Number(
            (sampleCount / (sampleCount + cycleReference)).toFixed(4),
          );
          const brierSkillVsUniform =
            baseline > 0 ? 1 - overallScore / baseline : 0;
          const reliability =
            sampleCount > 0
              ? Math.max(
                  0,
                  Math.min(
                    100,
                    Math.round((0.5 + 0.5 * Math.tanh(brierSkillVsUniform)) * 100),
                  ),
                )
              : 0;

          if (mounted) {
            setCalibration({
              overallScore,
              reliability,
              bias,
              sampleSize: sampleCount,
              baseline: Number(baseline.toFixed(4)),
              variance: Number(variance.toFixed(5)),
              trend,
              confidence,
            });
          }
        }
      } catch (e: unknown) {
        console.error("Calibration Error", e);
      }
    };

    const t = setTimeout(() => {
      runCalibration();
    }, 2000); // give the UI time to render first
    return () => {
      mounted = false;
      clearTimeout(t);
    };
  }, [drawName, history, setCalibration]);

  // Override refresh in store to use React Query refetch
  useEffect(() => {
    useNexusStore.setState({
      refresh: async () => {
        await refetchHistory();
      },
      refreshData: async (name: string, force?: boolean) => {
        useNexusStore.getState().setDrawName(name);
        if (force) {
          await refetchHistory();
        }
      },
    });
  }, [refetchHistory]);

  return null; // Headless component
};
