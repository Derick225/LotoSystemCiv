import { algorithmRegistry, AlgorithmContext, AlgorithmPlugin } from '../prediction/algorithmRegistry';
import { extractFeatures } from '../prediction/featureExtractor';
import type { DrawResult } from '../../types';
import { AlgoKey } from '../../shared/prediction.types';
import { EnhancedMetrics } from '../prediction/metrics.types';
import { calculateStatisticalBounds } from '../mathService';
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

    const deterministicSeed = pastContext.length > 0 
      ? pastContext[0].gagnants.reduce((a,b)=>a+b, 0) * pastContext.length 
      : 12345;

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

    const getGridPos = (val: number) => {
      const row = Math.floor((val - 1) / 10);
      const col = (val - 1) % 10;
      return { row, col };
    };

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

      // Câblage de la rétro-injection Topologique Continue 
      let maxSimForWinner = 1e-9;
      targetDraw.gagnants.forEach((w) => {
        const linSim = Math.exp(-0.25 * Math.abs(num - w));
        const gridDist = Math.sqrt(Math.pow(getGridPos(num).row - getGridPos(w).row, 2) + Math.pow(getGridPos(num).col - getGridPos(w).col, 2));
        const gridSim = Math.exp(-0.35 * gridDist);
        const mirror91Sim = Math.exp(-0.5 * Math.abs((num + w) - 91));
        const revP = parseInt(num.toString().split("").reverse().join(""), 10) || 0;
        const mirrorRevSim = Math.exp(-0.5 * Math.abs(revP - w));
        
        const modP = num % 10;
        const modW = w % 10;
        const harmonicDist = Math.min(Math.abs(modP - modW), 10 - Math.abs(modP - modW));
        const harmonicSim = Math.exp(-0.5 * harmonicDist);
        
        const decadeSim = Math.exp(-0.5 * Math.abs(Math.floor((num - 1) / 10) - Math.floor((w - 1) / 10)));
        const sim = Math.max(linSim, gridSim, mirror91Sim, mirrorRevSim, harmonicSim, decadeSim);
        if (sim > maxSimForWinner) maxSimForWinner = sim;
      });
      topologicalProximity[num] = maxSimForWinner;
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
