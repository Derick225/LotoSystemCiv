
import { fetchResults } from './lotteryService';
import type { AlgoWeights, AdaptiveRules, OptimizationResult, GeneticConfig } from '../types';

const DEFAULT_CONFIG: GeneticConfig = {
  populationSize: 30,
  eliteSize: 4,
  mutationRate: 0.25,
  crossoverRate: 0.8,
  maxGenerations: 40,
  historyDepth: 20, 
  earlyStopGenerations: 8
};

// --- MAIN PROCESS (WORKER DELEGATION) ---

export const runGeneticOptimization = async (
  drawName: string,
  baseWeights: AlgoWeights,
  baseRules: AdaptiveRules, 
  options?: Partial<GeneticConfig>,
  onRawProgress?: (data: any) => void
): Promise<OptimizationResult> => {
    
    const config = { ...DEFAULT_CONFIG, ...options };
    const startTime = Date.now();
    
    const { data: fullHistory } = await fetchResults(drawName);
    
    if (fullHistory.length < 50) {
        throw new Error(`Historique insuffisant sur le serveur (${fullHistory.length}/50 tirages requis). Veuillez importer plus de résultats.`);
    }

    const historyLite = fullHistory.map(h => ({
        gagnants: h.gagnants,
        maxhine: h.machine
    }));

    return new Promise((resolve, reject) => {
        const worker = new Worker(new URL('./workers/genetic.worker.ts', import.meta.url), { type: 'module' });

        worker.onmessage = (e) => {
            const { type, data, message } = e.data;

            if (type === 'progress') {
                if (onRawProgress) onRawProgress(data);
            } else if (type === 'result') {
                const result = data;
                worker.terminate();
                resolve({
                    ...result,
                    timeElapsed: Date.now() - startTime,
                    totalEvaluations: config.populationSize * config.maxGenerations 
                });
            } else if (type === 'error') {
                worker.terminate();
                reject(new Error(message));
            }
        };

        worker.onerror = (err) => {
            worker.terminate();
            reject(err);
        };

        worker.postMessage({
            type: 'start',
            payload: {
                drawName,
                history: historyLite,
                baseWeights,
                baseRules,
                config
            }
        });
    });
};
