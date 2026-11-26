import type { ForensicReport, ForensicEvidence } from "../../types";
import { syncForensicReports } from "../syncService";
import { AppError, logError } from "../../utils/AppError";
import { logger } from "../../utils/logger";
import { get, del, keys } from "idb-keyval";
import { globalCache, CACHE_TTL } from "../cache/CacheService";
import { z } from "zod";
import { parseDateSafely } from "../../utils/dateUtils";

// ============================================================================
// SCHÉMAS DE VALIDATION & PERSISTANCE FORENSIC (IDB / CACHE / CLOUD)
// ============================================================================
const ForensicReportSchema = z
  .object({
    id: z.string().min(1),
    drawName: z.string().min(1),
    date: z.string().min(1),
    predictionId: z.string().optional(),
    drawResultId: z.string().optional(),
    matches: z.array(z.unknown()),
    missedOpportunities: z.array(z.unknown()),
    scoreDivergence: z.array(z.unknown()),
    aiAnalysis: z.string().optional(),
  })
  .catchall(z.unknown());

const FORENSIC_KEY_PREFIX = "forensic_report_";
const NEXUS_FORENSIC_PREFIX = "nexus_forensic_report_";
const DISMISSED_AUTOPSY_PREFIX = "dismissed_autopsy_";
const MAX_INCONSISTENCY_LOGS = 100;

export type ForensicStorageSource =
  | "globalCache:nexus_forensic_report"
  | "idb:forensic_report_legacy"
  | "saveForensicReport"
  | "cloudSync"
  | "external";

export type ForensicValidationAction =
  | "VALID"
  | "CLEANED"
  | "IGNORED"
  | "PURGED";

export interface ForensicInconsistencyRecord {
  timestamp: string;
  source: ForensicStorageSource;
  storageKey?: string;
  reportId?: string;
  action: ForensicValidationAction;
  reasons: string[];
  rawShapeSummary: string;
  zodIssues?: string[];
}

export interface ForensicMiddlewareContext {
  source: ForensicStorageSource;
  storageKey?: string;
}

export interface ForensicMiddlewareResult {
  valid: boolean;
  action: ForensicValidationAction;
  report: ForensicReport | null;
  reasons: string[];
  inconsistencyLog?: ForensicInconsistencyRecord;
}

const forensicInconsistencyLogs: ForensicInconsistencyRecord[] = [];

export const getForensicValidationLogs = (): ForensicInconsistencyRecord[] => [
  ...forensicInconsistencyLogs,
];

export const clearForensicValidationLogs = (): void => {
  forensicInconsistencyLogs.length = 0;
};

const recordForensicInconsistency = (
  record: ForensicInconsistencyRecord,
): void => {
  forensicInconsistencyLogs.unshift(record);
  if (forensicInconsistencyLogs.length > MAX_INCONSISTENCY_LOGS) {
    forensicInconsistencyLogs.length = MAX_INCONSISTENCY_LOGS;
  }

  const logPayload = {
    source: record.source,
    storageKey: record.storageKey,
    reportId: record.reportId,
    action: record.action,
    reasons: record.reasons,
    rawShapeSummary: record.rawShapeSummary,
    ...(record.zodIssues && record.zodIssues.length > 0
      ? { zodIssues: record.zodIssues }
      : {}),
  };

  if (record.action === "IGNORED" || record.action === "PURGED") {
    logger.warn(
      logPayload,
      `[ForensicValidationMiddleware] Rapport forensic corrompu ignoré (${record.source}${record.storageKey ? ` :: ${record.storageKey}` : ""})`,
    );
  } else if (record.action === "CLEANED") {
    logger.info(
      logPayload,
      `[ForensicValidationMiddleware] Incohérence forensic nettoyée avant validation Zod (${record.source}${record.storageKey ? ` :: ${record.storageKey}` : ""})`,
    );
  }
};

const summarizeRawShape = (value: unknown): string => {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return `array(len=${value.length})`;
  if (typeof value === "string") {
    return `string(len=${value.length}, prefix=${JSON.stringify(value.slice(0, 48))})`;
  }
  if (typeof value === "object") {
    const keysList = Object.keys(value as Record<string, unknown>);
    const preview = keysList.slice(0, 12).join(",");
    return `object(keys=[${preview}${keysList.length > 12 ? ",..." : ""}])`;
  }
  return typeof value;
};

const extractIdFromStorageKey = (storageKey?: string): string | undefined => {
  if (!storageKey) return undefined;
  if (storageKey.startsWith(FORENSIC_KEY_PREFIX)) {
    const suffix = storageKey.slice(FORENSIC_KEY_PREFIX.length).trim();
    return suffix || undefined;
  }
  if (storageKey.startsWith(NEXUS_FORENSIC_PREFIX)) {
    const suffix = storageKey.slice(NEXUS_FORENSIC_PREFIX.length).trim();
    return suffix || undefined;
  }
  return undefined;
};

const unwrapEnvelopeSafely = (
  raw: unknown,
  reasons: string[],
): { unwrapped: unknown; jsonError: boolean } => {
  let current: unknown = raw;
  for (let depth = 0; depth < 3; depth++) {
    if (typeof current === "string") {
      try {
        current = JSON.parse(current);
        reasons.push("JSON_STRING_DECODED");
      } catch {
        reasons.push("MALFORMED_JSON_STRING");
        return { unwrapped: null, jsonError: true };
      }
    }
    if (
      current &&
      typeof current === "object" &&
      !Array.isArray(current) &&
      "data" in current &&
      (current as Record<string, unknown>).data !== undefined
    ) {
      current = (current as Record<string, unknown>).data;
      reasons.push("ENVELOPE_DATA_UNWRAPPED");
      continue;
    }
    break;
  }
  return { unwrapped: current, jsonError: false };
};

const OPTIONAL_NUMERIC_FIELDS = [
  "rmse",
  "brier_score",
  "kl_divergence",
  "klDivergenceProxy",
  "shannon_entropy",
  "forensicScore",
  "suspicionScore",
  "riggedProbability",
  "unifiedIntegrityIndex",
  "idealAlgorithmicDriftTolerance",
  "divergenceMetric",
  "benfordCompliance",
  "wassersteinLoss",
  "continuousTopologicalLoss",
  "drawAnomalyScore",
  "modelMissScore",
  "structuralQualityScore",
  "postMortemStabilityScore",
  "lyapunovChaosExponent",
  "topologicalEntropy",
  "divergenceForce",
  "gravitationalDriftVelocity",
  "dnaOrbitingIndex",
  "consensusStrength",
  "topologicalTensionIndex",
] as const;

const OPTIONAL_ARRAY_FIELDS = [
  "nearMisses",
  "missedSignals",
  "algorithmicDrift",
  "proposedAdjustments",
  "recommendedAdjustments",
  "recommendations",
  "warnings",
  "combo",
  "z_scores",
  "evidenceLogs",
  "indicators",
  "counterfactuals",
  "spectralDeviations",
  "dominantCauses",
  "challengedTargets",
  "winningXAP",
] as const;

/**
 * Middleware robuste de pré-validation et d'assainissement des rapports Forensic.
 * Nettoie les formats hérités/Cloud (champs null, snake_case, tableaux manquants,
 * double encodage JSON, en-têtes condensés) avant le parsing Zod, ou ignore proprement
 * les entrées irrécupérables avec un log système détaillant la source de l'incohérence.
 */
export const validateAndSanitizeForensicReportMiddleware = (
  rawInput: unknown,
  context: ForensicMiddlewareContext = { source: "external" },
): ForensicMiddlewareResult => {
  const reasons: string[] = [];
  const rawShapeSummary = summarizeRawShape(rawInput);

  const { unwrapped, jsonError } = unwrapEnvelopeSafely(rawInput, reasons);
  if (jsonError) {
    const log: ForensicInconsistencyRecord = {
      timestamp: new Date().toISOString(),
      source: context.source,
      storageKey: context.storageKey,
      reportId: extractIdFromStorageKey(context.storageKey),
      action: "IGNORED",
      reasons,
      rawShapeSummary,
    };
    recordForensicInconsistency(log);
    return { valid: false, action: "IGNORED", report: null, reasons, inconsistencyLog: log };
  }

  if (!unwrapped || typeof unwrapped !== "object" || Array.isArray(unwrapped)) {
    reasons.push(`NON_OBJECT_PAYLOAD:${summarizeRawShape(unwrapped)}`);
    const log: ForensicInconsistencyRecord = {
      timestamp: new Date().toISOString(),
      source: context.source,
      storageKey: context.storageKey,
      reportId: extractIdFromStorageKey(context.storageKey),
      action: "IGNORED",
      reasons,
      rawShapeSummary,
    };
    recordForensicInconsistency(log);
    return { valid: false, action: "IGNORED", report: null, reasons, inconsistencyLog: log };
  }

  const candidate: Record<string, unknown> = {
    ...(unwrapped as Record<string, unknown>),
  };

  // 1. Identifiant (id)
  let resolvedId: string | undefined;
  if (typeof candidate.id === "string" && candidate.id.trim().length > 0) {
    resolvedId = candidate.id.trim();
  } else if (typeof candidate.id === "number" && Number.isFinite(candidate.id)) {
    resolvedId = String(candidate.id);
    reasons.push("NUMERIC_ID_COERCED_TO_STRING");
  } else {
    const keyId = extractIdFromStorageKey(context.storageKey);
    if (keyId) {
      resolvedId = keyId;
      reasons.push("ID_RECOVERED_FROM_STORAGE_KEY");
    }
  }

  if (!resolvedId) {
    reasons.push("MISSING_REPORT_ID");
    const log: ForensicInconsistencyRecord = {
      timestamp: new Date().toISOString(),
      source: context.source,
      storageKey: context.storageKey,
      action: "IGNORED",
      reasons,
      rawShapeSummary,
    };
    recordForensicInconsistency(log);
    return { valid: false, action: "IGNORED", report: null, reasons, inconsistencyLog: log };
  }
  candidate.id = resolvedId;

  // 2. Nom du tirage (drawName / draw_name / tirage)
  const rawDrawName =
    candidate.drawName ?? candidate.draw_name ?? candidate.tirage;
  if (typeof rawDrawName === "string" && rawDrawName.trim().length > 0) {
    if (candidate.drawName !== rawDrawName.trim()) {
      reasons.push(
        candidate.drawName === undefined
          ? "SNAKE_CASE_DRAW_NAME_MIGRATED"
          : "DRAW_NAME_TRIMMED",
      );
    }
    candidate.drawName = rawDrawName.trim();
  } else {
    reasons.push("MISSING_OR_INVALID_DRAW_NAME");
    const log: ForensicInconsistencyRecord = {
      timestamp: new Date().toISOString(),
      source: context.source,
      storageKey: context.storageKey,
      reportId: resolvedId,
      action: "IGNORED",
      reasons,
      rawShapeSummary,
    };
    recordForensicInconsistency(log);
    return { valid: false, action: "IGNORED", report: null, reasons, inconsistencyLog: log };
  }

  // 3. Date (date / draw_date / timestamp)
  const rawDate = candidate.date ?? candidate.draw_date ?? candidate.timestamp;
  let resolvedDate: string | undefined;
  if (typeof rawDate === "string" && rawDate.trim().length > 0) {
    resolvedDate = rawDate.trim();
    if (candidate.date === undefined) {
      reasons.push("DATE_RECOVERED_FROM_ALIAS");
    }
  } else if (rawDate instanceof Date && !Number.isNaN(rawDate.getTime())) {
    resolvedDate = rawDate.toISOString();
    reasons.push("DATE_INSTANCE_COERCED");
  } else if (typeof rawDate === "number" && Number.isFinite(rawDate)) {
    resolvedDate = new Date(rawDate).toISOString();
    reasons.push("EPOCH_DATE_COERCED");
  }

  if (!resolvedDate) {
    reasons.push("MISSING_OR_INVALID_DATE");
    const log: ForensicInconsistencyRecord = {
      timestamp: new Date().toISOString(),
      source: context.source,
      storageKey: context.storageKey,
      reportId: resolvedId,
      action: "IGNORED",
      reasons,
      rawShapeSummary,
    };
    recordForensicInconsistency(log);
    return { valid: false, action: "IGNORED", report: null, reasons, inconsistencyLog: log };
  }
  candidate.date = resolvedDate;

  // 4. Champs optionnels string (null -> undefined, snake_case -> camelCase)
  const rawPredictionId = candidate.predictionId ?? candidate.prediction_id;
  if (typeof rawPredictionId === "string" && rawPredictionId.trim().length > 0) {
    if (candidate.predictionId === undefined) {
      reasons.push("SNAKE_CASE_PREDICTION_ID_MIGRATED");
    }
    candidate.predictionId = rawPredictionId.trim();
  } else {
    if (candidate.predictionId !== undefined) {
      reasons.push("INVALID_OR_NULL_PREDICTION_ID_CLEANED");
    }
    delete candidate.predictionId;
  }

  const rawDrawResultId = candidate.drawResultId ?? candidate.draw_result_id;
  if (typeof rawDrawResultId === "string" && rawDrawResultId.trim().length > 0) {
    if (candidate.drawResultId === undefined) {
      reasons.push("SNAKE_CASE_DRAW_RESULT_ID_MIGRATED");
    }
    candidate.drawResultId = rawDrawResultId.trim();
  } else {
    if (candidate.drawResultId !== undefined) {
      reasons.push("INVALID_OR_NULL_DRAW_RESULT_ID_CLEANED");
    }
    delete candidate.drawResultId;
  }

  const rawAiAnalysis =
    candidate.aiAnalysis ?? candidate.ai_analysis ?? candidate.aiAnalysisSummary;
  if (typeof rawAiAnalysis === "string") {
    if (candidate.aiAnalysis === undefined) {
      reasons.push("AI_ANALYSIS_ALIAS_MIGRATED");
    }
    candidate.aiAnalysis = rawAiAnalysis;
  } else if (candidate.aiAnalysis !== undefined) {
    reasons.push("INVALID_OR_NULL_AI_ANALYSIS_CLEANED");
    delete candidate.aiAnalysis;
  }

  // 5. Tableaux obligatoires (matches, missedOpportunities, scoreDivergence)
  if (Array.isArray(candidate.matches)) {
    const validMatches = candidate.matches.filter(
      (item) => item !== null && typeof item === "object" && !Array.isArray(item),
    );
    if (validMatches.length !== candidate.matches.length) {
      reasons.push("CORRUPT_MATCH_ENTRIES_STRIPPED");
      candidate.matches = validMatches;
    }
  } else if (Array.isArray(candidate.matchesSummary)) {
    candidate.matches = candidate.matchesSummary
      .filter((m) => m && typeof m === "object")
      .map((m) => {
        const item = m as Record<string, unknown>;
        return {
          predicted: Number(item.predicted) || 0,
          actual:
            typeof item.actual === "number" && Number.isFinite(item.actual)
              ? item.actual
              : null,
          errorType: typeof item.errorType === "string" ? item.errorType : "None",
          delta: typeof item.delta === "string" ? item.delta : "0",
        };
      });
    reasons.push("MATCHES_HYDRATED_FROM_CONDENSED_SUMMARY");
  } else {
    reasons.push("MISSING_OR_INVALID_MATCHES_ARRAY_REPAIRED");
    candidate.matches = [];
  }

  if (Array.isArray(candidate.missedOpportunities)) {
    const validMissed = candidate.missedOpportunities.filter(
      (item) => item !== null && item !== undefined,
    );
    if (validMissed.length !== candidate.missedOpportunities.length) {
      reasons.push("CORRUPT_MISSED_OPPORTUNITIES_STRIPPED");
      candidate.missedOpportunities = validMissed;
    }
  } else {
    reasons.push("MISSING_OR_INVALID_MISSED_OPPORTUNITIES_REPAIRED");
    candidate.missedOpportunities = [];
  }

  if (Array.isArray(candidate.scoreDivergence)) {
    const validDiv = candidate.scoreDivergence.filter(
      (item) => item !== null && item !== undefined,
    );
    if (validDiv.length !== candidate.scoreDivergence.length) {
      reasons.push("CORRUPT_SCORE_DIVERGENCE_STRIPPED");
      candidate.scoreDivergence = validDiv;
    }
  } else {
    reasons.push("MISSING_OR_INVALID_SCORE_DIVERGENCE_REPAIRED");
    candidate.scoreDivergence = [];
  }

  // 6. Nettoyage des nombres non finis (NaN / Infinity / null) et champs tableaux optionnels
  for (const field of OPTIONAL_NUMERIC_FIELDS) {
    if (candidate[field] !== undefined) {
      const val = candidate[field];
      if (typeof val !== "number" || !Number.isFinite(val)) {
        reasons.push(`NON_FINITE_OR_NULL_METRIC_STRIPPED:${field}`);
        delete candidate[field];
      }
    }
  }

  for (const arrField of OPTIONAL_ARRAY_FIELDS) {
    if (candidate[arrField] !== undefined && !Array.isArray(candidate[arrField])) {
      reasons.push(`INVALID_OPTIONAL_ARRAY_STRIPPED:${arrField}`);
      delete candidate[arrField];
    }
  }

  // 7. Validation Zod finale sur le rapport assaini
  const validated = ForensicReportSchema.safeParse(candidate);
  if (!validated.success) {
    const zodIssues = validated.error.issues.map(
      (issue) => `${issue.path.join(".") || "root"}: ${issue.message}`,
    );
    reasons.push("ZOD_SCHEMA_REJECTION_POST_SANITIZATION");
    const log: ForensicInconsistencyRecord = {
      timestamp: new Date().toISOString(),
      source: context.source,
      storageKey: context.storageKey,
      reportId: resolvedId,
      action: "IGNORED",
      reasons,
      rawShapeSummary,
      zodIssues,
    };
    recordForensicInconsistency(log);
    return { valid: false, action: "IGNORED", report: null, reasons, inconsistencyLog: log };
  }

  const healed = healForensicReport(validated.data as ForensicReport);
  if (reasons.length > 0) {
    const log: ForensicInconsistencyRecord = {
      timestamp: new Date().toISOString(),
      source: context.source,
      storageKey: context.storageKey,
      reportId: healed.id,
      action: "CLEANED",
      reasons,
      rawShapeSummary,
    };
    recordForensicInconsistency(log);
    return {
      valid: true,
      action: "CLEANED",
      report: healed,
      reasons,
      inconsistencyLog: log,
    };
  }

  return {
    valid: true,
    action: "VALID",
    report: healed,
    reasons: [],
  };
};

export const getForensicReportByPredictionId = async (
  predictionId: string,
): Promise<ForensicReport | undefined> => {
  const reports = await getLocalForensicReports();
  const matched = reports.find((r) => r.predictionId === predictionId);
  if (matched?.id) {
    const { getFullForensicReportById } = await import("../storageOptimizationService");
    const full = await getFullForensicReportById(matched.id);
    if (full) return full;
  }
  return matched;
};

export const getForensicReportById = async (
  id: string
): Promise<ForensicReport | null> => {
  if (!id) return null;
  const { getFullForensicReportById } = await import("../storageOptimizationService");
  return getFullForensicReportById(id);
};

export const saveForensicReport = async (report: ForensicReport) => {
  try {
    const middlewareResult = validateAndSanitizeForensicReportMiddleware(
      report,
      {
        source: "saveForensicReport",
        storageKey: report?.id ? `${NEXUS_FORENSIC_PREFIX}${report.id}` : undefined,
      },
    );
    if (!middlewareResult.valid || !middlewareResult.report) {
      return;
    }
    const cleanReport = middlewareResult.report;

    const cacheKey = `${NEXUS_FORENSIC_PREFIX}${cleanReport.id}`;
    // Store in global cache for unified memory + idb access
    await globalCache.set(cacheKey, cleanReport, CACHE_TTL.LONG, cleanReport.drawName);

    // Enregistrement par compression différentielle (En-tête condensé + payload détaillé)
    try {
      const { saveCompressedForensicReport } = await import("../storageOptimizationService");
      await saveCompressedForensicReport(cleanReport);
    } catch (compErr) {
      console.warn("Compressed forensic report save warning:", compErr);
    }

    // Dynamic Pruning: keep local DB clean and high-performing by keeping max 200 recent reports
    try {
      const allReports = await getLocalForensicReports();
      if (allReports.length > 200) {
        const toDelete = allReports.slice(200);
        for (const r of toDelete) {
          if (r.id) {
            await deleteForensicReportLocal(r.id);
          }
        }
      }
    } catch (pruneErr) {
      console.warn("Forensic reports pruning failed", pruneErr);
    }
  } catch (e: unknown) {
    logError(
      new AppError(
        (e instanceof Error ? e.message : String(e)) ||
          "Failed to save forensic report",
        "FORENSIC_SAVE_ERROR",
        "low",
        { error: e, reportId: report?.id },
      ),
      { source: "saveForensicReport" },
    );
  }
};

export const healForensicReport = (report: ForensicReport): ForensicReport => {
  const healed = { ...report };

  // Reconstruct combo if missing or if combo was set to predictedNumbers erroneously
  const matches = Array.isArray(healed.matches) ? healed.matches : [];
  const predictedSet = new Set(matches.map((m: ForensicEvidence) => m.predicted).filter(Boolean));
  const actualFromMatches = Array.from(
    new Set(matches.map((m: ForensicEvidence) => m.actual).filter((a): a is number => typeof a === "number" && a > 0))
  );

  const isComboIdenticalToPredicted =
    healed.combo &&
    healed.combo.length === predictedSet.size &&
    healed.combo.length > 0 &&
    healed.combo.every((n) => predictedSet.has(n));
  const hasNonHit = matches.some((m: ForensicEvidence) => m.errorType !== "Hit");

  // Only override combo from actualFromMatches if actualFromMatches has a full set (>= 5 numbers)
  if ((!healed.combo || healed.combo.length < 5 || (isComboIdenticalToPredicted && hasNonHit)) && actualFromMatches.length >= 5) {
    healed.combo = actualFromMatches.sort((a, b) => a - b);
  }

  // Fallback timestamp if missing
  if (!healed.timestamp && healed.date) {
    try {
      healed.timestamp = parseDateSafely(healed.date).toISOString();
    } catch (e) {
      healed.timestamp = new Date().toISOString();
    }
  }

  // Reconstitution continue des métriques statistiques dérivées de façon déterministe
  const exactHits = matches.filter((m: ForensicEvidence) => m.errorType === "Hit").length;
  const nearMissesCount = matches.filter(
    (m: ForensicEvidence) => m.errorType === "Voisin" || m.errorType === "Miroir" || m.errorType === "Shadow"
  ).length;

  if (healed.divergenceMetric === undefined) {
    const predCount = Math.max(1, predictedSet.size || 5);
    healed.divergenceMetric = Math.max(0, Math.min(100, Math.round((1.0 - (exactHits + 0.5 * nearMissesCount) / predCount) * 100)));
  }

  // Seule la RMSE admet une reconstitution exacte : elle se recalcule sur les paires
  // (prédit, sorti) réellement archivées. Toutes les autres statistiques (Brier, KL,
  // entropie, Benford théorique, indices d'intégrité, pertes topologiques) dépendent du
  // breakdown spectral du moteur : sans lui, elles restent absentes et l'UI affiche
  // « n/d » plutôt qu'une valeur reconstituée par une formule arbitraire.
  if (healed.rmse === undefined) {
    let sumSq = 0;
    let count = 0;
    matches.forEach((m: ForensicEvidence) => {
      if (typeof m.predicted === "number" && typeof m.actual === "number") {
        sumSq += Math.pow(m.predicted - m.actual, 2);
        count++;
      }
    });
    if (count > 0) healed.rmse = Math.sqrt(sumSq / count);
  }

  if (healed.benfordCompliance === undefined) {
    const numbers = Array.isArray(healed.combo) ? healed.combo : [];
    const firstDigits = numbers
      .filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n >= 1)
      .map(n => parseInt(String(n)[0], 10))
      .filter(d => d >= 1 && d <= 9);
    if (firstDigits.length > 0) {
      const digitCounts = new Float32Array(10);
      firstDigits.forEach(d => digitCounts[d]++);
      let dev = 0;
      for (let d = 1; d <= 9; d++) {
        const pEmp = digitCounts[d] / firstDigits.length;
        const pTheo = Math.log10(1 + 1 / d);
        dev += Math.abs(pEmp - pTheo);
      }
      // Σ|p_emp − p_théo| ∈ [0, 2] entre deux distributions : conformité ramenée sur
      // [0, 1] sans plancher arbitraire, qui afficherait une conformité minimale inventée.
      healed.benfordCompliance = parseFloat(Math.max(0, Math.min(1, 1 - dev / 2)).toFixed(3));
    }
  }

  // Reconstruct missing list fields if empty
  if (!healed.nearMisses) healed.nearMisses = [];
  if (!healed.missedSignals) healed.missedSignals = [];
  if (!healed.algorithmicDrift) healed.algorithmicDrift = [];
  if (!healed.proposedAdjustments) healed.proposedAdjustments = [];

  return healed;
};

export const getLocalForensicReports = async (): Promise<ForensicReport[]> => {
  const reports: ForensicReport[] = [];
  try {
    const fetchedEntries: Array<{
      payload: unknown;
      source: ForensicStorageSource;
      storageKey?: string;
    }> = [];

    const cachedItems = await globalCache.getByDomain<unknown>("forensic_report");
    for (const item of cachedItems) {
      const candidateId =
        item && typeof item === "object" && !Array.isArray(item) && typeof (item as Record<string, unknown>).id === "string"
          ? ((item as Record<string, unknown>).id as string)
          : undefined;
      fetchedEntries.push({
        payload: item,
        source: "globalCache:nexus_forensic_report",
        storageKey: candidateId ? `${NEXUS_FORENSIC_PREFIX}${candidateId}` : undefined,
      });
    }

    // Backwards compatibility with legacy FORENSIC_KEY_PREFIX & raw IDB entries
    if (typeof indexedDB !== "undefined") {
      const allKeys = await keys();
      const loadedIds = new Set(
        cachedItems
          .map((r) =>
            r && typeof r === "object" && !Array.isArray(r)
              ? (r as Record<string, unknown>).id
              : undefined,
          )
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      );
      const oldKeys = allKeys.filter(
        (k): k is string => typeof k === "string" && k.startsWith(FORENSIC_KEY_PREFIX),
      );
      for (const key of oldKeys) {
        const suffixId = extractIdFromStorageKey(key);
        if (!suffixId || !loadedIds.has(suffixId)) {
          try {
            const item = await get(key);
            if (item !== undefined) {
              fetchedEntries.push({
                payload: item,
                source: "idb:forensic_report_legacy",
                storageKey: key,
              });
            }
          } catch (readErr) {
            recordForensicInconsistency({
              timestamp: new Date().toISOString(),
              source: "idb:forensic_report_legacy",
              storageKey: key,
              reportId: suffixId,
              action: "IGNORED",
              reasons: [
                `IDB_READ_ERROR:${readErr instanceof Error ? readErr.message : String(readErr)}`,
              ],
              rawShapeSummary: "unreadable",
            });
          }
        }
      }
    }

    const uniqueReportsMap = new Map<string, ForensicReport>();
    const corruptedKeysToPurge = new Set<string>();

    for (const entry of fetchedEntries) {
      const result = validateAndSanitizeForensicReportMiddleware(entry.payload, {
        source: entry.source,
        storageKey: entry.storageKey,
      });
      if (result.valid && result.report?.id) {
        uniqueReportsMap.set(result.report.id, result.report);
      } else if (entry.storageKey && entry.source === "idb:forensic_report_legacy") {
        corruptedKeysToPurge.add(entry.storageKey);
      } else if (!result.valid && entry.storageKey?.startsWith(NEXUS_FORENSIC_PREFIX)) {
        corruptedKeysToPurge.add(entry.storageKey);
      }
    }

    if (corruptedKeysToPurge.size > 0 && typeof indexedDB !== "undefined") {
      for (const badKey of corruptedKeysToPurge) {
        try {
          await del(badKey);
          await globalCache.delete(badKey);
          logger.info(
            { storageKey: badKey },
            `[ForensicValidationMiddleware] Clé forensic irrécupérable purgée du stockage local.`,
          );
        } catch (purgeErr) {
          logger.warn(
            { storageKey: badKey, error: purgeErr },
            `[ForensicValidationMiddleware] Échec de purge de clé forensic corrompue.`,
          );
        }
      }
    }

    reports.push(...uniqueReportsMap.values());
  } catch (e) {
    logger.error(
      { error: e instanceof Error ? e.message : String(e) },
      "[ForensicValidationMiddleware] IDB load error",
    );
  }
  return reports.sort(
    (a, b) =>
      parseDateSafely(b.date).getTime() -
      parseDateSafely(a.date).getTime(),
  );
};

export const syncForensicReportsWithCloud = async (): Promise<
  ForensicReport[]
> => {
  const local = await getLocalForensicReports();
  try {
    const synced = await syncForensicReports(local);
    const sanitizedSynced: ForensicReport[] = [];
    for (const rawReport of synced) {
      const check = validateAndSanitizeForensicReportMiddleware(rawReport, {
        source: "cloudSync",
        storageKey: rawReport?.id ? `cloud_forensic_${rawReport.id}` : undefined,
      });
      if (check.valid && check.report) {
        sanitizedSynced.push(check.report);
        await saveForensicReport(check.report);
      }
    }
    return sanitizedSynced;
  } catch (e: unknown) {
    logError(
      new AppError(
        (e instanceof Error ? e.message : String(e)) || "Forensic sync failed",
        "FORENSIC_SYNC_ERROR",
        "medium",
        { error: e },
      ),
      { source: "syncForensicReportsWithCloud" },
    );
    return local;
  }
};

/**
 * Enregistre l'ID d'une prédiction dont le rapport d'autopsie a été volontairement supprimé
 * pour éviter toute régénération automatique intempestive en arrière-plan.
 */
export const markAutopsyDismissed = async (predictionId: string): Promise<void> => {
  if (!predictionId) return;
  try {
    const { set: idbSet } = await import("idb-keyval");
    await idbSet(`${DISMISSED_AUTOPSY_PREFIX}${predictionId}`, true);
  } catch (e) {
    console.warn("[Forensic] Impossible d'enregistrer l'exclusion d'autopsie:", e);
  }
};

/**
 * Récupère l'ensemble des IDs de prédictions dont l'autopsie a été définitivement supprimée.
 */
export const getDismissedAutopsyPredictionIds = async (): Promise<Set<string>> => {
  try {
    if (typeof indexedDB === 'undefined') {
      return new Set<string>();
    }
    const allK = await keys();
    const dismissed = new Set<string>();
    for (const k of allK) {
      if (typeof k === "string" && k.startsWith(DISMISSED_AUTOPSY_PREFIX)) {
        dismissed.add(k.substring(DISMISSED_AUTOPSY_PREFIX.length));
      }
    }
    return dismissed;
  } catch {
    return new Set<string>();
  }
};

/**
 * Supprime définitivement un rapport d'autopsie de la base locale (IndexedDB + Cache mémoire).
 */
export const deleteForensicReportLocal = async (id: string, predictionId?: string) => {
  await del(`${FORENSIC_KEY_PREFIX}${id}`);
  await del(`nexus_forensic_report_${id}`);
  await del(`nexus_forensic_index_${id}`);
  await del(`nexus_forensic_detail_${id}`);
  await globalCache.invalidateByPrefix(`nexus_forensic_report_${id}`);
  await globalCache.invalidateByPrefix(`nexus_forensic_index_${id}`);
  if (predictionId) {
    await markAutopsyDismissed(predictionId);
  }
};

/**
 * Supprime définitivement une collection de rapports d'autopsie en une opération par lot.
 */
export const deleteMultipleForensicReportsLocal = async (
  items: { id: string; predictionId?: string }[]
) => {
  for (const item of items) {
    await del(`${FORENSIC_KEY_PREFIX}${item.id}`);
    await del(`nexus_forensic_report_${item.id}`);
    await del(`nexus_forensic_index_${item.id}`);
    await del(`nexus_forensic_detail_${item.id}`);
    await globalCache.invalidateByPrefix(`nexus_forensic_report_${item.id}`);
    await globalCache.invalidateByPrefix(`nexus_forensic_index_${item.id}`);
    if (item.predictionId) {
      await markAutopsyDismissed(item.predictionId);
    }
  }
};
