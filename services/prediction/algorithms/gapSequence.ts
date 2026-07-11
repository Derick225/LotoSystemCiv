import { AlgoKey } from '../../../shared/prediction.types';
import { AlgorithmPlugin } from '../algorithmRegistry';

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
    const sortedHistory = [...history].sort((a, b) => a.timestamp - b.timestamp);
    const totalDraws = sortedHistory.length;
    
    const lastSeenIndex: Record<number, number> = {};
    const gapSequences: Record<number, number[]> = {};
    
    for (let i = 1; i <= N; i++) {
        lastSeenIndex[i] = -1;
        gapSequences[i] = [];
    }
    
    sortedHistory.forEach((draw, index) => {
        (draw.winningNumbers || draw.gagnants || []).forEach(num => {
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
                currentGap, expectedNextGap: currentGap, lag1Autocorrelation: 0, meanGap: currentGap, stdGap: 1
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
        
        patternData[num] = {
            currentGap,
            expectedNextGap,
            lag1Autocorrelation,
            meanGap,
            stdGap
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
    
    const { currentGap, expectedNextGap, stdGap, meanGap, lag1Autocorrelation } = data;
    
    // Normal CDF for fatigue
    const z = (currentGap - meanGap) / stdGap;
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989423 * Math.exp(-z * z / 2);
    const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    const fatigueScore = z > 0 ? 1 - prob : prob;
    
    // Pattern Resonance Score : Gaussienne autour de l'écart attendu
    const zScoreResonance = (currentGap - expectedNextGap) / (stdGap / 1.5 + Number.EPSILON);
    const patternResonanceScore = Math.exp(-0.5 * Math.pow(zScoreResonance, 2));
    
    // Mix basé sur la force du pattern (Hurst exponent proxy)
    const patternWeight = Math.abs(lag1Autocorrelation);
    const combinedSignal = (patternWeight * patternResonanceScore) + ((1 - patternWeight) * fatigueScore);
    
    // Sigmoïde finale pour lisser le score sur [0, 100]
    const finalScore = 100.0 / (1.0 + Math.exp(-5.0 * (combinedSignal - 0.5)));
    
    return {
      score: Math.max(0, Math.min(100, finalScore)),
      confidence: 0.85 + 0.1 * patternWeight, // Plus le pattern est fort, plus on est confiant
      metadata: { 
          currentGap, 
          expectedNextGap: parseFloat(expectedNextGap.toFixed(2)), 
          lag1: parseFloat(lag1Autocorrelation.toFixed(3))
      }
    };
  }
};
