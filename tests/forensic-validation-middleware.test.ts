import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  validateAndSanitizeForensicReportMiddleware,
  getForensicValidationLogs,
  clearForensicValidationLogs,
  getLocalForensicReports,
  saveForensicReport,
} from "../src/services/forensic/forensicStorageService";
import { globalCache } from "../src/services/cache/CacheService";
import { logger } from "../src/utils/logger";
import type { ForensicReport } from "../src/types";

describe("Forensic Validation & Sanitization Middleware", () => {
  beforeEach(() => {
    clearForensicValidationLogs();
    vi.restoreAllMocks();
  });

  it("valide sans altération ni alerte un rapport canonique conforme", () => {
    const warnSpy = vi.spyOn(logger, "warn");
    const infoSpy = vi.spyOn(logger, "info");

    const canonical: ForensicReport = {
      id: "rep-valid-001",
      drawName: "NATIONAL",
      date: "2026-11-20T18:00:00.000Z",
      predictionId: "pred-123",
      drawResultId: "res-456",
      matches: [
        { predicted: 12, actual: 12, errorType: "Hit", delta: "0" },
        { predicted: 25, actual: 26, errorType: "Voisin", delta: "+1" },
      ],
      missedOpportunities: [],
      scoreDivergence: [],
      aiAnalysis: "Alignement nominal.",
      rmse: 0.707,
      divergenceMetric: 25,
    };

    const result = validateAndSanitizeForensicReportMiddleware(canonical, {
      source: "globalCache:nexus_forensic_report",
      storageKey: "nexus_forensic_report_rep-valid-001",
    });

    expect(result.valid).toBe(true);
    expect(result.action).toBe("VALID");
    expect(result.reasons).toEqual([]);
    expect(result.report?.id).toBe("rep-valid-001");
    expect(getForensicValidationLogs()).toHaveLength(0);
    expect(warnSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
  });

  it("nettoie avant Zod les champs null SQL, snake_case, métriques non finies et tableaux manquants", () => {
    const infoSpy = vi.spyOn(logger, "info");
    const legacyCloudPayload = {
      id: 404,
      draw_name: " LUCKY TUESDAY ",
      draw_date: "2026-11-18T18:00:00.000Z",
      prediction_id: "pred-cloud-9",
      draw_result_id: null,
      ai_analysis: null,
      matchesSummary: [
        { predicted: 7, actual: 7, errorType: "Hit", delta: "0" },
        { predicted: 33, actual: null, errorType: "None", delta: "miss" },
      ],
      rmse: Number.NaN,
      kl_divergence: Number.POSITIVE_INFINITY,
      brier_score: null,
      nearMisses: "corrupt-non-array",
    };

    const result = validateAndSanitizeForensicReportMiddleware(legacyCloudPayload, {
      source: "cloudSync",
      storageKey: "cloud_forensic_404",
    });

    expect(result.valid).toBe(true);
    expect(result.action).toBe("CLEANED");
    expect(result.report).not.toBeNull();
    expect(result.report?.id).toBe("404");
    expect(result.report?.drawName).toBe("LUCKY TUESDAY");
    expect(result.report?.predictionId).toBe("pred-cloud-9");
    expect(result.report?.drawResultId).toBeUndefined();
    expect(result.report?.aiAnalysis).toBeUndefined();
    expect(result.report?.matches).toHaveLength(2);
    expect(result.report?.missedOpportunities).toEqual([]);
    expect(result.report?.scoreDivergence).toEqual([]);
    expect(result.report?.kl_divergence).toBeUndefined();
    expect(result.report?.brier_score).toBeUndefined();
    // RMSE déterministe recalculée à partir du Hit (7 -> 7)
    expect(result.report?.rmse).toBe(0);

    const logs = getForensicValidationLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].source).toBe("cloudSync");
    expect(logs[0].storageKey).toBe("cloud_forensic_404");
    expect(logs[0].action).toBe("CLEANED");
    expect(logs[0].reasons).toContain("NUMERIC_ID_COERCED_TO_STRING");
    expect(logs[0].reasons).toContain("SNAKE_CASE_DRAW_NAME_MIGRATED");
    expect(logs[0].reasons).toContain("MATCHES_HYDRATED_FROM_CONDENSED_SUMMARY");
    expect(logs[0].reasons).toContain("NON_FINITE_OR_NULL_METRIC_STRIPPED:kl_divergence");
    expect(infoSpy).toHaveBeenCalledTimes(1);
  });

  it("décode un JSON doublement sérialisé dans une enveloppe { data } et récupère l'id depuis la clé", () => {
    const wrapped = JSON.stringify({
      data: JSON.stringify({
        drawName: "ESPOIR",
        date: 1763640000000,
        matches: [{ predicted: 14, actual: 14, errorType: "Hit", delta: "0" }],
        missedOpportunities: [],
        scoreDivergence: [],
      }),
    });

    const result = validateAndSanitizeForensicReportMiddleware(wrapped, {
      source: "idb:forensic_report_legacy",
      storageKey: "forensic_report_legacy-rec-77",
    });

    expect(result.valid).toBe(true);
    expect(result.action).toBe("CLEANED");
    expect(result.report?.id).toBe("legacy-rec-77");
    expect(result.report?.drawName).toBe("ESPOIR");
    expect(result.reasons).toContain("JSON_STRING_DECODED");
    expect(result.reasons).toContain("ENVELOPE_DATA_UNWRAPPED");
    expect(result.reasons).toContain("ID_RECOVERED_FROM_STORAGE_KEY");
    expect(result.reasons).toContain("EPOCH_DATE_COERCED");
  });

  it("ignore proprement les rapports corrompus irrécupérables avec un log identifiant la source exacte", () => {
    const warnSpy = vi.spyOn(logger, "warn");

    const malformedJsonResult = validateAndSanitizeForensicReportMiddleware(
      "{broken-json",
      {
        source: "idb:forensic_report_legacy",
        storageKey: "forensic_report_corrupt_1",
      },
    );
    expect(malformedJsonResult.valid).toBe(false);
    expect(malformedJsonResult.action).toBe("IGNORED");
    expect(malformedJsonResult.report).toBeNull();
    expect(malformedJsonResult.reasons).toContain("MALFORMED_JSON_STRING");

    const missingDrawNameResult = validateAndSanitizeForensicReportMiddleware(
      { id: "bad-2", date: "2026-11-20", matches: [] },
      {
        source: "globalCache:nexus_forensic_report",
        storageKey: "nexus_forensic_report_bad-2",
      },
    );
    expect(missingDrawNameResult.valid).toBe(false);
    expect(missingDrawNameResult.action).toBe("IGNORED");
    expect(missingDrawNameResult.reasons).toContain("MISSING_OR_INVALID_DRAW_NAME");

    const nullInputResult = validateAndSanitizeForensicReportMiddleware(null, {
      source: "external",
    });
    expect(nullInputResult.valid).toBe(false);
    expect(nullInputResult.action).toBe("IGNORED");

    const logs = getForensicValidationLogs();
    expect(logs).toHaveLength(3);
    expect(logs[0].source).toBe("external");
    expect(logs[0].rawShapeSummary).toBe("null");
    expect(logs[1].source).toBe("globalCache:nexus_forensic_report");
    expect(logs[1].storageKey).toBe("nexus_forensic_report_bad-2");
    expect(logs[2].source).toBe("idb:forensic_report_legacy");
    expect(logs[2].storageKey).toBe("forensic_report_corrupt_1");
    expect(warnSpy).toHaveBeenCalledTimes(3);
  });

  it("filtre et assainit les entrées mixtes dans getLocalForensicReports et refuse les sauvegardes invalides", async () => {
    const validItem: ForensicReport = {
      id: "rep-ok",
      drawName: "NATIONAL",
      date: "2026-11-22T18:00:00.000Z",
      matches: [{ predicted: 5, actual: 5, errorType: "Hit", delta: "0" }],
      missedOpportunities: [],
      scoreDivergence: [],
    };
    const recoverableLegacyItem = {
      id: "rep-repaired",
      draw_name: "WARI",
      draw_date: "2026-11-21T18:00:00.000Z",
      prediction_id: null,
      matches: [{ predicted: 10, actual: 11, errorType: "Voisin", delta: "+1" }],
    };
    const unrecoverableCorruptItem = {
      id: "rep-corrupt",
      // drawName absent et irrécupérable
      date: "2026-11-20T18:00:00.000Z",
    };

    vi.spyOn(globalCache, "getByDomain").mockResolvedValue([
      validItem,
      recoverableLegacyItem,
      unrecoverableCorruptItem,
      "not-even-json{",
    ]);

    const reports = await getLocalForensicReports();
    expect(reports.map((r) => r.id)).toEqual(["rep-ok", "rep-repaired"]);
    expect(reports[1].drawName).toBe("WARI");
    expect(reports[1].missedOpportunities).toEqual([]);

    const logs = getForensicValidationLogs();
    expect(logs.some((l) => l.action === "CLEANED" && l.reportId === "rep-repaired")).toBe(true);
    expect(logs.some((l) => l.action === "IGNORED" && l.source === "globalCache:nexus_forensic_report")).toBe(true);

    const setSpy = vi.spyOn(globalCache, "set").mockResolvedValue(undefined);
    await saveForensicReport({ id: "", drawName: "" } as unknown as ForensicReport);
    expect(setSpy).not.toHaveBeenCalled();
  });
});
