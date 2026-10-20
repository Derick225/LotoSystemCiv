import type { DrawResult } from "../../../types";
import type { AlgorithmContext } from "../algorithmRegistry";

export const createAlgorithmTestContext = (
  history: DrawResult[],
  gapsMap: Int32Array = new Int32Array(91),
  freqMap: Float32Array = new Float32Array(91),
): AlgorithmContext => ({
  history,
  features: {
    freqMap,
    gapsMap,
    markovMap: new Float32Array(91),
    affinityMap: Array.from({ length: 91 }, () => new Float32Array(91)),
    momentumMap: new Float32Array(91),
    machineTransferMap: new Float32Array(91),
    shadowProbabilityMap: new Float32Array(91),
    networkCorrelationMap: new Float32Array(91),
    interDrawMap: new Float32Array(91),
  },
  advancedMetrics: {},
  deterministicSeed: 1,
  statisticalBounds: {
    median: 0,
    q1: 0,
    q3: 0,
    variance: 0,
    kurtosis: 0,
    skewness: 0,
    shannonEntropy: 0,
    hurstExponent: 0.5,
  },
  pluginCache: {},
});
