import { fetchResults } from './lotteryService';
import type { AlgoWeights } from '../types';
import { calculateFractalIndex, calculateShannonEntropy } from './mathService'; 
import { purifyHistoryForDraw } from '../utils/arrayUtils'; 
import { packHistory } from './workers/zeroCopy'; 

export interface SimulatedAnnealingConfig {
    maxIterations: number;
    historyDepth: number;
}

export const runSimulatedAnnealingOptimization = async (
  drawName: string,
  baseWeights: AlgoWeights,
  options?: Partial<SimulatedAnnealingConfig>,
  onProgress?: (data: { progress: number; bestScore: number; currentScore: number; temperature: number }) => void
): Promise<{ bestWeights: AlgoWeights; improvement: number; finalScore: number; iterations: number }> => {
  const { data: rawHistory } = await fetchResults(drawName);  
  const fullHistory = purifyHistoryForDraw(drawName, rawHistory);
  
  if (fullHistory.length < 5) {
    throw new Error(`Historique insuffisant pour le recuit simulé (minimum absolu de 5 tirages requis).`);
  }

  // Métriques de régime stochastique déterministes
  const hurst = calculateFractalIndex(fullHistory);
  const entropy = calculateShannonEntropy(fullHistory.slice(0, Math.min(100, fullHistory.length))).normalized;

  const numWeights = Object.keys(baseWeights).length;
  const maxIterations = options?.maxIterations || Math.max(50, Math.ceil(numWeights * Math.sqrt(fullHistory.length) * 0.8));
  const historyDepth = options?.historyDepth || Math.max(20, Math.floor(fullHistory.length * 0.5));

  const historyLite = fullHistory.map(h => ({ 
    gagnants: h.gagnants, 
    machine: h.machine || [] 
  }));

  return new Promise((resolve, reject) => {
    if (typeof Worker === 'undefined') {
      console.warn("Web Worker non disponible, fallback déterministe vers les poids de base.");
      resolve({ 
        bestWeights: baseWeights,
        improvement: 0,
        finalScore: 0,
        iterations: 0
      });
      return;
    }

    const worker = new Worker(new URL('./workers/simulatedAnnealing.worker.ts?worker', import.meta.url), { type: 'module' });

    const timeoutMs = 45000;
    const timeoutTimer = setTimeout(() => {
      worker.terminate();
      reject(new Error(`Simulated Annealing Worker Timeout (${timeoutMs}ms)`));
    }, timeoutMs);

    worker.onmessage = (e) => {
      const { type, data, message } = e.data;
      if (type === 'progress') {
        if (onProgress) {
          onProgress({
            progress: data.progress,
            bestScore: data.bestScore,
            currentScore: data.currentScore,
            temperature: data.temperature
          });
        }
      } else if (type === 'result') {
        clearTimeout(timeoutTimer);
        worker.terminate();
        resolve({
          bestWeights: data.bestWeights,
          improvement: data.improvement,
          finalScore: data.bestScore,
          iterations: data.iterations
        });
      } else if (type === 'error') {
        clearTimeout(timeoutTimer);
        worker.terminate();
        reject(new Error(message || "Erreur inconnue dans le Simulated Annealing Worker"));
      }
    };

    worker.onerror = (err) => {
      clearTimeout(timeoutTimer);
      worker.terminate();
      reject(new Error(`Échec de l'exécution du Worker de Recuit Simulé: ${err.message}`));
    };

    const packed = packHistory(historyLite);
    worker.postMessage({ 
      type: 'start', 
      payload: { 
        drawName, 
        baseWeights,
        config: {
          maxIterations,
          historyDepth
        },
        historyBuffer: packed.historyBuffer,
        drawCount: packed.drawCount,
        winningCount: packed.winningCount,
        totalCols: packed.totalCols,
        regimeMetrics: { hurst, entropy },
        timeSignature: `${drawName}_${fullHistory.length}`
      }
    }, [packed.historyBuffer]);
  });
};
