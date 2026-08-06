import { describe, it, expect } from 'vitest';
import { frequencyPlugin } from '../services/prediction/algorithms/frequency';
import { gapsPlugin } from '../services/prediction/algorithms/gaps';
import { markovPlugin } from '../services/prediction/algorithms/markov';
import { momentumPlugin } from '../services/prediction/algorithms/momentum';
import { affinityPlugin } from '../services/prediction/algorithms/affinity';
import { spectralPlugin, fractalPlugin } from '../services/prediction/algorithms/signals';
import { spatialPlugin } from '../services/prediction/algorithms/spatial';
import { temporalPlugin, bayesPlugin } from '../services/prediction/algorithms/temporalBayes';
import { echoStateNetworkPlugin } from '../services/prediction/algorithms/echoState';
import { gapSequencePlugin } from '../services/prediction/algorithms/gapSequence';
import { gapPatternPlugin } from '../services/prediction/algorithms/gapPattern';
import { sequencePatternPlugin } from '../services/prediction/algorithms/sequencePattern';
import { derivedNeighborPlugin } from '../services/prediction/algorithms/derivedNeighbor';
import { gapCadencePlugin } from '../services/prediction/algorithms/gapCadence';
import { gapTrendPlugin } from '../services/prediction/algorithms/gapTrend';
import { interMonthlyResonancePlugin } from '../services/prediction/algorithms/interMonthlyResonance';
import { gapRangeSequencePlugin } from '../services/prediction/algorithms/gapRangeSequence';
import {
  shadowProbabilityPlugin,
  networkCorrelationPlugin,
  isolationAnomalyPlugin,
} from '../services/prediction/algorithms/advancedTopology';
import { AlgorithmContext } from '../services/prediction/algorithmRegistry';
import { DrawResult } from '../types';

describe('Core Algorithms - Complete Regression and Determinism Suite', () => {
  // Mock valid draw history
  const history: DrawResult[] = Array.from({ length: 45 }, (_, idx) => {
    // Alternate winner numbers deterministically to ensure realistic distribution
    const winners = idx % 2 === 0 ? [5, 12, 19, 28, 47] : [3, 14, 25, 36, 88];
    return {
      id: `draw-${idx}`,
      date: `2026-02-${String((idx % 28) + 1).padStart(2, '0')}`,
      gagnants: winners,
      machine: [],
      draw_name: 'Loto Test',
    };
  });

  // Construct a comprehensive and structurally correct mock AlgorithmContext
  const getMockContext = (): AlgorithmContext => {
    const gapsMap: Record<number, number> = {};
    const freqMap = new Float32Array(91);
    const markovMap = new Float32Array(91);
    const momentumMap = new Float32Array(91);
    const temporal: Record<number, number> = {};
    const poisson: Record<number, number> = {};
    const affinityMatrix: Record<string, number> = {};

    for (let i = 1; i <= 90; i++) {
      gapsMap[i] = (i % 7) + 1;
      freqMap[i] = (i % 10) + 1;
      markovMap[i] = 0.05 + (i * 0.002);
      momentumMap[i] = 0.1 + (i * 0.003);
      temporal[i] = 0.5 + (i * 0.005);
      poisson[i] = 0.3 + (i * 0.004);
      for (let j = 1; j <= 5; j++) {
        affinityMatrix[`${i},${j}`] = 0.15;
      }
    }

    return {
      history,
      features: {
        gapsMap,
        freqMap,
        markovMap,
        momentumMap,
      } as any,
      statisticalBounds: {
        hurstExponent: 0.52,
      },
      advancedMetrics: {
        temporal,
        poisson,
        affinityMatrix,
        entropy: 0.81,
        spectralDensity: Array(91).fill(0.08),
        fractalDimension: 1.45,
      },
      pluginCache: {},
    };
  };

  const pluginsToTest = [
    { name: 'Frequency', plugin: frequencyPlugin },
    { name: 'Gaps', plugin: gapsPlugin },
    { name: 'Markov', plugin: markovPlugin },
    { name: 'Momentum', plugin: momentumPlugin },
    { name: 'Affinity', plugin: affinityPlugin },
    { name: 'Spectral', plugin: spectralPlugin },
    { name: 'Fractal', plugin: fractalPlugin },
    { name: 'Spatial', plugin: spatialPlugin },
    { name: 'Temporal', plugin: temporalPlugin },
    { name: 'Bayes', plugin: bayesPlugin },
    { name: 'Echo State Network', plugin: echoStateNetworkPlugin },
    { name: 'Shadow Probability', plugin: shadowProbabilityPlugin },
    { name: 'Network Correlation', plugin: networkCorrelationPlugin },
    { name: 'Isolation Anomaly', plugin: isolationAnomalyPlugin },
    { name: 'Gap Sequence', plugin: gapSequencePlugin },
    { name: 'Gap Pattern', plugin: gapPatternPlugin },
    { name: 'Sequence Pattern', plugin: sequencePatternPlugin },
    { name: 'Derived Neighbor', plugin: derivedNeighborPlugin },
    { name: 'Gap Cadence', plugin: gapCadencePlugin },
    { name: 'Gap Trend', plugin: gapTrendPlugin },
    { name: 'Inter-Monthly Resonance', plugin: interMonthlyResonancePlugin },
    { name: 'Gap Range Sequence', plugin: gapRangeSequencePlugin },
  ];

  pluginsToTest.forEach(({ name, plugin }) => {
    describe(`Plugin: ${name}`, () => {
      it('should be structured correctly as an AlgorithmPlugin', () => {
        expect(plugin).toBeDefined();
        expect(plugin.key).toBeDefined();
        expect(plugin.category).toBeDefined();
        expect(plugin.stability).toBeDefined();
        expect(plugin.isStrictlyDeterministic).toBe(true);
      });

      it('should execute precompute and evaluate deterministically without errors', () => {
        const ctx = getMockContext();
        
        // Ensure precompute works
        plugin.precompute(ctx);

        // Evaluate on sample numbers across the domain [1, 90]
        const testNumbers = [1, 5, 12, 45, 90];
        testNumbers.forEach(num => {
          const evalResult1 = plugin.evaluate(num, ctx);
          expect(evalResult1).toBeDefined();
          expect(evalResult1.score).toBeGreaterThanOrEqual(0.0);
          expect(evalResult1.score).toBeLessThanOrEqual(100.0);
          expect(evalResult1.confidence).toBeGreaterThanOrEqual(0.0);
          expect(evalResult1.confidence).toBeLessThanOrEqual(100.0);

          // Test determinism
          const evalResult2 = plugin.evaluate(num, ctx);
          expect(evalResult2.score).toBe(evalResult1.score);
          expect(evalResult2.confidence).toBe(evalResult1.confidence);
        });
      });
    });
  });
});
