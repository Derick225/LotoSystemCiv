import { AlgoKey } from '../../../shared/prediction.types';
import { AlgorithmPlugin } from '../algorithmRegistry';
import { evaluateKDE, standardNormalCDF, gaussianKernel, calculateSilvermanBandwidth } from '../../kdeService';

// Corrected R/S Hurst Exponent: uses proper cumulative deviation from mean
function calculateHurstExponent(seq: number[]): number {
  const N = seq.length;
  if (N < 4) return 0.5;

  const mean = seq.reduce((a, b) => a + b, 0) / N;
  // Cumulative deviation series (centered)
  const cumDev: number[] = [];
  let running = 0;
  let sumSq = 0;
  for (let i = 0; i < N; i++) {
    running += seq[i] - mean;
    cumDev.push(running);
    sumSq += (seq[i] - mean) ** 2;
  }

  const R = Math.max(...cumDev) - Math.min(...cumDev);
  const S = Math.sqrt(sumSq / N) || Number.EPSILON;
  const hurst = Math.log(R / S + Number.EPSILON) / Math.log(N);

  return isNaN(hurst) || !isFinite(hurst) ? 0.5 : Math.max(0.01, Math.min(0.99, hurst));
}

export const gapSequencePlugin: AlgorithmPlugin = {
  key: AlgoKey.GAP_SEQUENCE as any,
  category: 'advanced',
  stability: 'stable',
  mathematicalBasis: 'Autocorrélation de Lag-1, Variance continue et Processus Stochastique de Retour à la Moyenne',
  description: 'Analyse les séquences historiques d\'écarts d\'un numéro pour détecter des patterns de rebond cycliques via l\'autocorrélation (Lag-1) et projeter le prochain écart attendu.',
  isStrictlyDeterministic: true,

  precompute(ctx) {
    const N = 90;
    const history = ctx.history; // This is sorted newest to oldest in standard prediction facade
    
    // Reverse history to process from oldest to newest
    const sortedHistory = [...history].reverse();
    const totalDraws = sortedHistory.length;
    
    const lastSeenIndex: Record<number, number> = {};
    const gapSequences: Record<number, number[]> = {};
    
    for (let i = 1; i <= N; i++) {
        lastSeenIndex[i] = -1;
        gapSequences[i] = [];
    }
    
    sortedHistory.forEach((draw, index) => {
        (draw.gagnants || []).forEach((num: number) => {
            if (num >= 1 && num <= N) {
                const gap = index - lastSeenIndex[num] - 1;
                gapSequences[num].push(gap);
                lastSeenIndex[num] = index;
            }
        });
    });
    
    const patternData: Record<number, any> = {};
    
    for (let num = 1; num <= N; num++) {
        const seq = gapSequences[num];
        const currentGap = totalDraws - lastSeenIndex[num] - 1;
        
        if (seq.length < 2) {
            patternData[num] = {
                currentGap, expectedNextGap: currentGap, lag1Autocorrelation: 0, meanGap: currentGap, stdGap: 1, hurstExponent: 0.5
            };
            continue;
        }
        
        const n = seq.length;
        const meanGap = seq.reduce((acc, val) => acc + val, 0) / n;
        const variance = seq.reduce((acc, val) => acc + Math.pow(val - meanGap, 2), 0) / n;
        const stdGap = Math.sqrt(variance) || 1;
        
        // Autocorrélation de Lag 1
        let numerator = 0;
        let denominator = 0;
        for (let i = 1; i < n; i++) {
            numerator += (seq[i] - meanGap) * (seq[i - 1] - meanGap);
        }
        for (let i = 0; i < n; i++) {
            denominator += Math.pow(seq[i] - meanGap, 2);
        }
        const lag1Autocorrelation = denominator > 0 ? numerator / denominator : 0;
        
        // Projection continue du prochain écart attendu (E[g_n])
        const lastGap = seq[n - 1];
        let expectedNextGap = meanGap + lag1Autocorrelation * (lastGap - meanGap);
        expectedNextGap = Math.max(0, expectedNextGap); 
        
        const hurstExponent = calculateHurstExponent(seq);
        
        patternData[num] = {
            currentGap,
            expectedNextGap,
            lag1Autocorrelation,
            meanGap,
            stdGap,
            hurstExponent,
            numGaps: n
        };
    }
    
    ctx.pluginCache = ctx.pluginCache || {};
    ctx.pluginCache[AlgoKey.GAP_SEQUENCE] = patternData;
  },

  evaluate(num, ctx) {
    if (!ctx.pluginCache?.[AlgoKey.GAP_SEQUENCE]) {
      this.precompute(ctx);
    }
    
    const data = ctx.pluginCache![AlgoKey.GAP_SEQUENCE][num];
    if (!data) return { score: 50, confidence: 0.5 };
    
    const { currentGap, expectedNextGap, stdGap, meanGap, lag1Autocorrelation, hurstExponent, numGaps } = data;
    
    // Continuous Normal CDF for fatigue using standardNormalCDF
    const z = (currentGap - meanGap) / stdGap;
    const prob = standardNormalCDF(z);
    const fatigueScore = z > 0 ? 1 - prob : prob;
    
    // Pattern Resonance Score : Noyau de Gauss avec bande passante KDE dérivée de la séquence d'écarts
    const bandwidth = calculateSilvermanBandwidth([meanGap, stdGap, expectedNextGap]);
    const uResonance = (currentGap - expectedNextGap) / (bandwidth + Number.EPSILON);
    const patternResonanceScore = Math.exp(-0.5 * Math.pow(uResonance, 2));
    
    /**
     * CONTINUITY & STATISTICAL SIGNIFICANCE MANDATES (AGENTS.md):
     * 1. The significance threshold of the lag-1 autocorrelation is derived from time series theory:
     *    threshold = 1.96 / sqrt(N), representing a 95% confidence interval for white noise.
     * 2. Any binary decision threshold is strictly avoided. We use a logistic function (sigmoid)
     *    to smoothly map the significance level.
     * 3. The Hurst exponent is mapped to a continuous sigmoid to define the memory regime score
     *    (Persistence vs. Anti-Persistence) smoothly.
     */
    const threshold = numGaps > 0 ? 1.96 / Math.sqrt(numGaps) : 1.96;
    const significance = 1.0 / (1.0 + Math.exp(-10.0 * (Math.abs(lag1Autocorrelation) - threshold)));
    
    // Continuous Regime Score (Persistence vs Anti-Persistence)
    // H > 0.5 is persistent (pattern/cycles), H < 0.5 is anti-persistent (mean reversion fatigue)
    const hurstSigmoid = 1.0 / (1.0 + Math.exp(-12.0 * (hurstExponent - 0.5)));
    
    // Blended weight of pattern resonance vs fatigue.
    // Highly significant autocorrelation and high persistence favor pattern resonance.
    const blendedWeight = 0.5 * significance * Math.abs(lag1Autocorrelation) + 0.5 * hurstSigmoid;
    const combinedSignal = (blendedWeight * patternResonanceScore) + ((1.0 - blendedWeight) * fatigueScore);
    
    // Sigmoïde finale pour lisser le score sur [0, 100]
    const finalScore = 100.0 / (1.0 + Math.exp(-5.0 * (combinedSignal - 0.5)));
    
    return {
      score: Math.max(0, Math.min(100, finalScore)),
      confidence: 0.85 + 0.1 * blendedWeight, // Plus le pattern est fort, plus on est confiant
      metadata: { 
          currentGap, 
          expectedNextGap: parseFloat(expectedNextGap.toFixed(2)), 
          lag1: parseFloat(lag1Autocorrelation.toFixed(3)),
          hurst: parseFloat(hurstExponent.toFixed(3)),
          autocorrSignificance: parseFloat(significance.toFixed(3))
      }
    };
  }
};
