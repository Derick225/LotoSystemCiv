import type { ForensicReport, ForensicEvidence } from "../../types";
import { syncForensicReports } from "../syncService";
import { AppError, logError } from "../../utils/AppError";
import { get, del, keys } from "idb-keyval";
import { globalCache, CACHE_TTL } from "../cache/CacheService";
import { z } from "zod";
import { parseDateSafely } from "../../utils/dateUtils";

// ============================================================================
// SCHÉMAS DE VALIDATION & PERSISTANCE FORENSIC (IDB / CACHE / CLOUD)
// ============================================================================
const ForensicReportSchema = z
  .object({
    id: z.string(),
    drawName: z.string(),
    date: z.string(),
    predictionId: z.string().optional(),
    drawResultId: z.string().optional(),
    matches: z.array(z.unknown()),
    missedOpportunities: z.array(z.unknown()),
    scoreDivergence: z.array(z.unknown()),
    aiAnalysis: z.string().optional(),
  })
  .catchall(z.unknown());

const FORENSIC_KEY_PREFIX = "forensic_report_";
const DISMISSED_AUTOPSY_PREFIX = "dismissed_autopsy_";

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
    const cacheKey = `nexus_forensic_report_${report.id}`;
    // Store in global cache for unified memory + idb access
    await globalCache.set(cacheKey, report, CACHE_TTL.LONG, report.drawName);

    // Enregistrement par compression différentielle (En-tête condensé + payload détaillé)
    try {
      const { saveCompressedForensicReport } = await import("../storageOptimizationService");
      await saveCompressedForensicReport(report);
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
        { error: e, reportId: report.id },
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
    const numbers = healed.combo || [];
    const firstDigits = numbers
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
    const fetched = await globalCache.getByDomain<ForensicReport>('forensic_report');

    // Backwards compatibility with legacy FORENSIC_KEY_PREFIX entries in IDB
    if (typeof indexedDB !== 'undefined') {
      const allKeys = await keys();
      const oldKeys = allKeys.filter(
        (k) => typeof k === "string" && k.startsWith(FORENSIC_KEY_PREFIX),
      );
      for (const key of oldKeys) {
        if (!fetched.find(r => `${FORENSIC_KEY_PREFIX}${r.id}` === key || `nexus_forensic_report_${r.id}` === key)) {
          const item = await get(key as string);
          if (item) {
            const parsed = typeof item === "string" ? JSON.parse(item) : item;
            const unwrapped = (parsed && typeof parsed === "object" && "data" in parsed && parsed.data) ? parsed.data : parsed;
            fetched.push(unwrapped);
          }
        }
      }
    }

    const uniqueReportsMap = new Map<string, ForensicReport>();
    for (const parsed of fetched) {
      const unwrapped = (parsed && typeof parsed === "object" && "data" in parsed && parsed.data) ? parsed.data : parsed;
      const validated = ForensicReportSchema.safeParse(unwrapped);
      if (validated.success) {
        const rep = healForensicReport(validated.data as ForensicReport);
        if (rep.id) {
          uniqueReportsMap.set(rep.id, rep);
        }
      } else {
        console.warn(`Dropped invalid forensic report:`, validated.error);
      }
    }
    reports.push(...uniqueReportsMap.values());
  } catch (e) {
    console.error("IDB load error", e);
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
    for (const s of synced) {
      await saveForensicReport(s);
    }
    return synced;
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
