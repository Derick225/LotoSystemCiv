import { algorithmRegistry, AlgorithmContext, AlgorithmPlugin } from '../prediction/algorithmRegistry';
import { extractFeatures } from '../prediction/featureExtractor';
import type { DrawResult } from '../../types';
import { AlgoKey } from '../../shared/prediction.types';
import { EnhancedMetrics } from '../prediction/metrics.types';
import { calculateStatisticalBounds } from '../mathService';
import { computeTopologicalProximityVectorHpc } from '../wasm/lotoEngineBridge';
import { deriveSeedFromHistory } from '../../utils/deterministicSeed';
import { 
    calculatePoissonScores, 
    calculateBayesianScore, 
    calculateTemporalScores,
    calculateDigitalRootAnalysis,
    calculateResistanceScores,
    calculateGapVelocityScores,
    calculateLeaderSuccession,
    calculateAiIntuition,
    calculateFractalResonance,
    calculateSpatialHotSpots,
    calculateCoOccurrenceScores,
    calculateAnomalyScores
} from '../advancedMathService';

export interface TensorContext {
  drawId: string;
  drawDate: string;
  targetWinners: number[];
  topologicalScore?: number; // Injection optionnelle
  topologicalProximity?: Record<number, number>; // Rétro-injection
  matrix: Record<number, Record<AlgoKey, number>>;
}

const tensorMemoryCache = new Map<string, TensorContext>();

export const buildTensorMatrix = async (
  drawName: string,
  history: DrawResult[], 
  depth: number = 30
): Promise<TensorContext[]> => {
  const startIndex = Math.min(depth, history.length - 20);
  if (startIndex <= 0) return [];
  
  const tasks = Array.from({ length: startIndex }).map(async (_, i) => {
    const targetDraw = history[i];
    const pastContext = history.slice(i + 1);
    
    const cacheKey = `tensor_${drawName}_${targetDraw.id || targetDraw.date}_${pastContext.length}`;
    if (tensorMemoryCache.has(cacheKey)) {
        return tensorMemoryCache.get(cacheKey)!;
    }

    const features = await extractFeatures(drawName, pastContext);

    const advancedMetrics: EnhancedMetrics = {
        poisson: calculatePoissonScores(pastContext),
        bayes: calculateBayesianScore(pastContext),
        temporal: calculateTemporalScores(pastContext),
        digitalRoot: calculateDigitalRootAnalysis(pastContext),
        resistance: calculateResistanceScores(pastContext),
        gapVelocity: calculateGapVelocityScores(pastContext),
        leaderSuccession: calculateLeaderSuccession(pastContext),
        aiIntuition: calculateAiIntuition(pastContext, { frequency: 0, gap: 0, symbiotics: 0, markov: 0, spectral: 0, meta_llm_ensemble: 0, poisson: 0, bayes: 0 }), 
        fractalResonance: calculateFractalResonance(pastContext),
        spatial: calculateSpatialHotSpots(pastContext),
        clusters: calculateCoOccurrenceScores(pastContext),
        anomalies: calculateAnomalyScores(pastContext),
        statisticalBounds: calculateStatisticalBounds(pastContext),
    };
    
    const statisticalBounds = calculateStatisticalBounds(pastContext);

    const deterministicSeed = deriveSeedFromHistory(pastContext);

    const context: AlgorithmContext = {
      features,
      advancedMetrics,
      history: pastContext,
      statisticalBounds,
      deterministicSeed,
    };

    context.pluginCache = {};
    algorithmRegistry.forEach(plugin => {
      try {
        if (typeof plugin.precompute === 'function') {
          plugin.precompute(context);
        }
      } catch (e) {
        // Ignored
      }
    });

    const matrix: Record<number, Record<string, number>> = {};
    const topologicalProximity: Record<number, number> = {};

    // 1. Évaluation matricielle des algorithmes enregistrés
    for (let num = 1; num <= 90; num++) {
      const breakdown: Record<string, number> = {};
      algorithmRegistry.forEach((plugin: AlgorithmPlugin) => {
        try {
            breakdown[plugin.key] = plugin.evaluate(num, context).score;
        } catch (e) {
            breakdown[plugin.key] = 0;
        }
      });
      matrix[num] = breakdown;
    }

    // 2. Rétro-injection Topologique Continue Vectorisée en Rust/WASM HPC (Zéro Allocation String)
    const proxVector = computeTopologicalProximityVectorHpc(targetDraw.gagnants);
    for (let num = 1; num <= 90; num++) {
      topologicalProximity[num] = proxVector[num];
    }

    const compiledTensor = {
      drawId: targetDraw.id || 'unknown',
      drawDate: targetDraw.date,
      targetWinners: targetDraw.gagnants,
      topologicalProximity,
      matrix: matrix as unknown as Record<number, Record<AlgoKey, number>>
    };

    if (tensorMemoryCache.size >= 1000) {
        const firstKey = tensorMemoryCache.keys().next().value;
        if (firstKey) tensorMemoryCache.delete(firstKey);
    }
    tensorMemoryCache.set(cacheKey, compiledTensor);
    return compiledTensor;
  });

  const tensors = await Promise.all(tasks);
  return tensors;
};

/**
 * Version asynchrone avec régulation de cadence 60 FPS (Yielding de microtâches)
 * Garantit que l'extraction profonde de tenseurs n'engendre aucun micro-gel de l'interface.
 */
export const buildTensorMatrixAsync = async (
  drawName: string,
  history: DrawResult[],
  depth: number = 30,
  onProgress?: (progressPercent: number) => void
): Promise<TensorContext[]> => {
  const startIndex = Math.min(depth, history.length - 20);
  if (startIndex <= 0) return [];

  const results: TensorContext[] = [];
  const chunkSize = 5;

  for (let i = 0; i < startIndex; i += chunkSize) {
    const sliceEnd = Math.min(i + chunkSize, startIndex);
    const chunkIndices = Array.from({ length: sliceEnd - i }, (_, k) => i + k);

    const chunkResults = await Promise.all(
      chunkIndices.map(async (idx) => {
        const sub = await buildTensorMatrix(drawName, history.slice(idx, idx + 21), 1);
        return sub[0];
      })
    );

    for (const res of chunkResults) {
      if (res) results.push(res);
    }

    if (onProgress) {
      onProgress(Math.min(100, Math.round((results.length / startIndex) * 100)));
    }

    // Cède le fil d'exécution au navigateur pour maintenir 60 FPS
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return results;
};
