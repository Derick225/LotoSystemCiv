import { AlgoWeights } from '../shared/prediction.types';
import { fetchResults } from './lotteryService';
import { getAlgoWeights } from './predictionEngine';
import { calculateFractalIndex, calculateShannonEntropy } from './mathService';
import { getBayesianMemoryAsync, saveBayesianMemoryAsync } from './prediction/bayesianMemory';
import { purifyHistoryForDraw } from '../utils/arrayUtils';
import { packHistory } from './workers/zeroCopy';

export interface BayesianConfig {
    initialSamples: number;
    bayesianIterations: number;
    gamma: number;
    historyDepth: number;
}

export const runBayesianOptimization = async (
    drawName: string,
    options?: Partial<BayesianConfig>,
    onProgress?: (progress: number, bestScore: number) => void
): Promise<{ bestWeights: AlgoWeights; improvement: number; finalScore: number; iterations: number }> => {
    
    const { data: rawHistory } = await fetchResults(drawName);
    const fullHistory = purifyHistoryForDraw(drawName, rawHistory);
    
    // Dynamic sampling/validation threshold based on the fractal dimension (Hurst exponent)
    if (fullHistory.length < 5) {
        throw new Error(`Historique insuffisant pour la calibration bayésienne (minimum absolu de 5 tirages requis).`);
    }
    const h = calculateFractalIndex(fullHistory);
    const minHistoryRequired = Math.ceil(30 * ((1 + Math.abs(h)) / (1 - Math.abs(h) + Number.EPSILON)));
    if (fullHistory.length < minHistoryRequired) {
        console.debug(`[Bayesian] Sample size (${fullHistory.length}) below recommended ${minHistoryRequired}, proceeding with available history.`);
    }

    const currentWeights = await getAlgoWeights(drawName);
    const numFeatures = Object.keys(currentWeights).length;
    const entropy = calculateShannonEntropy(fullHistory.slice(0, 100)).normalized;

    // CORRECTION : Paramètres dérivés continûment
    const dynamicConfig: BayesianConfig = {
        // Initial samples = 2 * dimensionality of search space
        initialSamples: Math.max(10, numFeatures * 2),
        // Iterations scale with sqrt of history depth
        bayesianIterations: Math.ceil(Math.sqrt(fullHistory.length) * 2),
        // Gamma (exploration scale) increases with entropy
        gamma: 1.0 + (2.0 * entropy),
        // Safe historical depth calculated via signal persistence
        historyDepth: Math.max(20, Math.floor(fullHistory.length * (1.0 - Math.abs(h - 0.5))))
    };

    const config = { ...dynamicConfig, ...options };

    return new Promise((resolve, reject) => {
        if (typeof Worker === 'undefined') {
            console.warn("Bayesian Worker not available, returning base weights.");
            resolve({
                bestWeights: currentWeights,
                improvement: 0,
                finalScore: 0,
                iterations: 0
            });
            return;
        }

        const worker = new Worker(new URL('./workers/bayesian.worker.ts?worker', import.meta.url), { type: 'module' });

        const timeoutMs = 45000;
        const timeoutTimer = setTimeout(() => {
            worker.terminate();
            reject(new Error(`Bayesian Optimizer Timeout (${timeoutMs}ms)`));
        }, timeoutMs);

        worker.onmessage = (e) => {
            const { type, data, message } = e.data;

            if (type === 'progress') {
                if (onProgress) onProgress(data.progress, data.bestScore);
            } else if (type === 'result') {
                clearTimeout(timeoutTimer);
                worker.terminate();
                if (data.observations) {
                    saveBayesianMemoryAsync(drawName, data.observations).then(() => {
                        resolve(data);
                    }).catch((err) => {
                        console.error("Failed to save bayesian memory:", err);
                        resolve(data);
                    });
                } else {
                    resolve(data);
                }
            } else if (type === 'error') {
                clearTimeout(timeoutTimer);
                worker.terminate();
                reject(new Error(message));
            }
        };

        worker.onerror = (err: any) => {
            clearTimeout(timeoutTimer);
            worker.terminate();
            reject(new Error(err?.message || "Échec de l'optimiseur Bayésien"));
        };

        const historyLite = fullHistory.map(h => ({
            gagnants: h.gagnants,
            machine: h.machine || [],
            date: h.date || ""
        }));

        getBayesianMemoryAsync(drawName).then((memoryObservations) => {
            const packed = packHistory(historyLite);
            worker.postMessage({
                type: 'start',
                payload: {
                    drawName,
                    historyBuffer: packed.historyBuffer,
                    drawCount: packed.drawCount,
                    winningCount: packed.winningCount,
                    totalCols: packed.totalCols,
                    currentWeights,
                    config,
                    memoryObservations,
                    timeSignature: `${drawName}_${fullHistory.length}`
                }
            }, [packed.historyBuffer]);
        }).catch((err) => {
            clearTimeout(timeoutTimer);
            worker.terminate();
            reject(new Error(`Failed to load bayesian memory: ${err.message}`));
        });
    });
};
