import { AlgoKey } from '../../../shared/prediction.types';
import { AlgorithmPlugin } from '../algorithmRegistry';

// Utilitaire de normalisation robuste réutilisable
const getRobustStats = (arr: number[]) => {
  if (arr.length === 0) return { median: 0, iqr: 1 };
  const sorted = [...arr].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  return { median, iqr: Math.max(1e-6, q3 - q1) };
};

const sigmoidNormalize = (val: number, median: number, iqr: number) => {
  const slope = 1.0 / iqr;
  return 100.0 / (1.0 + Math.exp(-slope * (val - median)));
};

export const spectralPlugin: AlgorithmPlugin = {
  key: AlgoKey.SPECTRAL,
  category: 'advanced',
  stability: 'stable',
  mathematicalBasis: 'Transformée de Fourier Discrète (DFT) combinée à l\'Index de Volatilité',
  description: 'Énergie dominante de la décomposition fréquentielle pondérée par la volatilité temporelle.',
  isStrictlyDeterministic: true,
  precompute(ctx) {
    const metrics = ctx.advancedMetrics?.spectral as Array<{ number: number; energy: number }> | undefined;
    const energies = metrics?.map(s => s.energy) || [];
    const robustStats = energies.length > 0 ? getRobustStats(energies) : { median: 0, iqr: 1 };
    ctx.pluginCache = ctx.pluginCache || {};
    ctx.pluginCache[AlgoKey.SPECTRAL] = { robustStats };
  },
  evaluate(num, ctx) {
    // 1. Énergie spectrale brute
    const metrics = ctx.advancedMetrics?.spectral as Array<{ number: number; energy: number }> | undefined;
    const energy = metrics?.find(s => s.number === num)?.energy || 0;
    
    if (!ctx.pluginCache?.[AlgoKey.SPECTRAL]) {
      spectralPlugin.precompute(ctx);
    }
    const cache = ctx.pluginCache![AlgoKey.SPECTRAL];
    const { median, iqr } = cache.robustStats;
    const normSpectral = Math.max(0, Math.min(100, sigmoidNormalize(energy, median, iqr)));

    // 2. Volatilité (integrated into spectral score as modulation factor)
    const volMap = ctx.advancedMetrics?.volatility as Record<number, number> | number | undefined;
    let volFactor = 1.0;
    if (volMap && typeof volMap === 'object') {
      const v = volMap[num];
      if (typeof v === 'number') volFactor = 1.0 + (v / 100.0);
    } else if (typeof volMap === 'number') {
      volFactor = 1.0 + (volMap / 100.0);
    }

    const score = Math.max(0.0, Math.min(100.0, normSpectral * volFactor));
    return {
      score,
      confidence: 0.95,
      metadata: { energy, volFactor }
    };
  }
};

export const fractalPlugin: AlgorithmPlugin = {
  key: AlgoKey.FRACTAL,
  category: 'advanced',
  stability: 'stable',
  mathematicalBasis: 'Exposant de Hurst (Analyse R/S), Coefficients d\'Ondelettes et Dimension Fractale',
  description: 'Analyse multi-échelle mesurant la mémoire longue, la régularité locale et la dimension de Hurst.',
  isStrictlyDeterministic: true,
  precompute(ctx) {
    const metricsWavelet = ctx.advancedMetrics?.wavelet as Array<{ number: number; energy: number }> | undefined;
    const energiesWavelet = metricsWavelet?.map(s => s.energy) || [];
    const waveletStats = energiesWavelet.length > 0 ? getRobustStats(energiesWavelet) : { median: 0, iqr: 1 };

    const resValues = Object.values(ctx.advancedMetrics?.fractalResonance || {}).filter(v => typeof v === 'number') as number[];
    let resStats = { median: 0, iqr: 1 };
    if (resValues.length > 0) {
      const sortedRes = [...resValues].sort((a, b) => a - b);
      const medianRes = sortedRes[Math.floor(sortedRes.length / 2)] || 0;
      const q1Res = sortedRes[Math.floor(sortedRes.length * 0.25)] || 0;
      const q3Res = sortedRes[Math.floor(sortedRes.length * 0.75)] || 0;
      const iqrRes = Math.max(1e-6, q3Res - q1Res);
      resStats = { median: medianRes, iqr: iqrRes };
    }
    ctx.pluginCache = ctx.pluginCache || {};
    ctx.pluginCache[AlgoKey.FRACTAL] = { waveletStats, resStats };
  },
  evaluate(num, ctx) {
    // 1. Hurst Exponent (fractal base)
    const metricsFractal = ctx.advancedMetrics?.fractal as Array<{ number: number; hurst: number }> | undefined;
    const hurst = metricsFractal?.find(s => s.number === num)?.hurst || 0.5;
    const normHurst = Math.max(0.0, Math.min(100.0, hurst * 100.0));

    if (!ctx.pluginCache?.[AlgoKey.FRACTAL]) {
      fractalPlugin.precompute(ctx);
    }
    const cache = ctx.pluginCache![AlgoKey.FRACTAL];

    // 2. Wavelet Energy
    const metricsWavelet = ctx.advancedMetrics?.wavelet as Array<{ number: number; energy: number }> | undefined;
    const energy = metricsWavelet?.find(s => s.number === num)?.energy || 0;
    const { median: medW, iqr: iqrW } = cache.waveletStats;
    const normWavelet = Math.max(0, Math.min(100, sigmoidNormalize(energy, medW, iqrW)));

    // 3. Fractal Dimension Resonance
    const resVal = (ctx.advancedMetrics?.fractalResonance as Record<number, number>)?.[num] || 0.0;
    const { median: medRes, iqr: iqrRes } = cache.resStats;
    const zScoreRes = (resVal - medRes) / iqrRes;
    const normFractalRes = 100.0 / (1.0 + Math.exp(-zScoreRes));

    // 4. Modulateur de Lyapunov (Stabilité de l'attracteur géométrique)
    const lyapunov = (ctx.advancedMetrics?.topologicalLyapunov as Record<number, number>)?.[num] || 0.0;

    // Fusion continue sur l'analyse multi-échelle (Hurst, Ondelettes, Résonance + Lyapunov)
    const baseFused = Math.pow(normHurst * normWavelet * normFractalRes, 1/3);
    const MathMax = Math.max;
    const MathMin = Math.min;
    const fused = baseFused * (1.0 + lyapunov / 100.0);
    const score = MathMax(0.0, MathMin(100.0, fused));
    return {
      score,
      confidence: 0.95,
      metadata: { hurst, energy, resVal, lyapunov }
    };
  }
};
