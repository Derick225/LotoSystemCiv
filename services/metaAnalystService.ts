import { PlatinumResult, DrawResult, SymbioticContext, PlatinumAudit, Prediction, PlatinumUserOptions } from '../types';
import { get, set } from 'idb-keyval';
import { useNexusStore } from '../store/useNexusStore';
import { getLocalForensicReports } from './postPredictionAnalysisService';
import { EnhancedMetrics } from './prediction/metrics.types';
import { generatePlatinumPredictionCore } from './platinumPredictionCore';

// ═══════════════════════════════════════════════════════════════
// PERSISTENCE
// ═══════════════════════════════════════════════════════════════
const storageKey = (name: string) => `platinum_hyper_${name}`;

export const savePlatinumHistory = async (result: PlatinumResult): Promise<void> => {
    try {
        const key = storageKey(result.drawName);
        const raw = await get(key);
        const existing = (!raw || raw.length === 0) ? [] : raw as PlatinumResult[];
        const updated = [result, ...existing.slice(0, 19)];
        await set(key, updated);
    } catch (err) {
        console.error('Storage Error', err);
    }
};

export const getPlatinumHistory = async (drawName: string): Promise<PlatinumResult[]> => {
    try {
        const raw = await get(storageKey(drawName));
        return raw ? raw as PlatinumResult[] : [];
    } catch {
        return [];
    }
};

export const performPlatinumAudit = (
    prediction: PlatinumResult,
    actualResult: DrawResult,
): PlatinumAudit => {
    const winners = new Set(actualResult.gagnants);
    let bestScenarioId = '';
    let bestHits = -1;

    const performances = prediction.scenarios.map(s => {
        const hits = s.numbers.filter(n => winners.has(n)).length;
        if (hits > bestHits) {
            bestHits = hits;
            bestScenarioId = s.name;
        }
        return {
            type: s.name,
            hits,
            numbers: s.numbers.filter(n => winners.has(n))
        };
    });

    return {
        predictionId: prediction.id,
        date: actualResult.date,
        actualDraw: actualResult.gagnants,
        bestTimeline: bestScenarioId,
        bestScore: bestHits,
        syncScore: Math.round((bestHits / 5) * 100),
        timelinePerformance: performances,
        verdict: bestHits >= 3 ? "Succès Confirmé" : bestHits >= 1 ? "Signal Partiel" : "Divergence"
    };
};

export async function generatePlatinumPrediction(
    drawName: string,
    history: DrawResult[],
    metrics?: EnhancedMetrics,
    userOptions?: PlatinumUserOptions | null,
    symbioticContext?: SymbioticContext | null,
    _basePrediction?: Prediction,
    onProgress?: (progress: number, message: string) => void,
): Promise<PlatinumResult> {
    if (typeof Worker !== 'undefined') {
        try {
            const temporalDepth = useNexusStore.getState().temporalDepth ?? 100;
            const useSpatioTemporalHawkes = useNexusStore.getState().useSpatioTemporalHawkes ?? true;
            const forensicReports = await getLocalForensicReports() || [];

            return await new Promise<PlatinumResult>((resolve, reject) => {
                const { workerPool } = require('./workerPoolManager');
                const worker = workerPool.getWorker('prediction');

                const timeoutId = setTimeout(() => {
                    workerPool.releaseWorker(worker);
                    reject(new Error("Timeout du Web Worker de prédiction locale Platinum"));
                }, 90000);

                worker.onmessage = (e: MessageEvent) => {
                    const { success, result, error, isProgress, progress, message } = e.data;
                    if (isProgress) {
                        onProgress?.(progress, message);
                        return;
                    }
                    clearTimeout(timeoutId);
                    if (success) {
                        resolve(result);
                    } else {
                        reject(new Error(error || "Erreur inconnue du worker de prédiction Platinum"));
                    }
                    workerPool.releaseWorker(worker);
                };

                worker.onerror = (err: any) => {
                    clearTimeout(timeoutId);
                    reject(err);
                    workerPool.releaseWorker(worker);
                };

                worker.postMessage({
                    taskId: `PLATINUM_${Date.now()}`,
                    type: 'platinum',
                    drawName,
                    history,
                    metrics,
                    userOptions,
                    symbioticContext,
                    _basePrediction,
                    temporalDepth,
                    useSpatioTemporalHawkes,
                    preloadedForensicReports: forensicReports
                });
            });
        } catch (workerError) {
            console.warn("[WORKER PLATINUM] Échec du worker Platinum. Fallback sur le thread principal.", workerError);
        }
    }

    return generatePlatinumPredictionCore(
        drawName,
        history,
        metrics,
        userOptions,
        symbioticContext,
        _basePrediction,
        onProgress
    );
}