import { AlgoKey } from '../../../shared/prediction.types';
import { AlgorithmPlugin, AlgorithmContext } from '../algorithmRegistry';

export interface RobustStats {
  median: number;
  iqr: number;
}

/**
 * Calcule des statistiques robustes de dispersion (Médiane, IQR) pour résister aux valeurs aberrantes (outliers).
 * 
 * @param arr Tableau de valeurs numériques réelles issues de l'échantillon.
 */
export const getRobustStats = (arr: number[]): RobustStats => {
  if (arr.length === 0) return { median: 0.0, iqr: 1.0 };
  const sorted = [...arr].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] || 0.0;
  const q1 = sorted[Math.floor(sorted.length * 0.25)] || 0.0;
  const q3 = sorted[Math.floor(sorted.length * 0.75)] || 0.0;
  return { median, iqr: Math.max(Number.EPSILON, q3 - q1) };
};

/**
 * Normalisation par sigmoïde robuste (adaptation continue basée sur les écarts types empiriques).
 * 
 * @param val Valeur à normaliser.
 * @param median Médiane de référence.
 * @param iqr Écart interquartile robuste.
 */
export const sigmoidNormalize = (val: number, median: number, iqr: number): number => {
  const slope = 1.0 / iqr;
  return 100.0 / (1.0 + Math.exp(-slope * (val - median)));
};

/**
 * Fonction utilitaire unifiée de normalisation robuste réutilisable.
 */
export const normalizeWithRobustStats = (value: number, allValues: number[]): number => {
  const stats = getRobustStats(allValues);
  return sigmoidNormalize(value, stats.median, stats.iqr);
};

/**
 * ============================================================================
 *               SPECTRAL DECOMPOSITION (FOURIER & VOLATILITY) PLUGIN
 * ============================================================================
 * Basis: Discrete Fourier Transform (DFT) with continuous volatility scaling.
 *
 * Theory:
 * Extracts the harmonic energy component of draw spacings to identify cyclic recurrence 
 * frequencies, scaled continuously by temporal volatility.
 */
export const spectralPlugin: AlgorithmPlugin = {
  key: AlgoKey.SPECTRAL,
  category: 'advanced',
  stability: 'stable',
  mathematicalBasis: 'Transformée de Fourier Discrète (DFT) combinée à l\'Index de Volatilité',
  description: 'Énergie dominante de la décomposition fréquentielle pondérée continûment par la volatilité temporelle.',
  isStrictlyDeterministic: true,

  precompute(ctx: AlgorithmContext) {
    const metrics = ctx.advancedMetrics?.spectral as Array<{ number: number; energy: number }> | undefined;
    const energies = metrics?.map(s => s.energy).filter((v): v is number => typeof v === 'number') || [];
    const robustStats = energies.length > 0 ? getRobustStats(energies) : { median: 0.0, iqr: 1.0 };
    ctx.pluginCache = ctx.pluginCache || {};
    ctx.pluginCache[AlgoKey.SPECTRAL] = { robustStats };
  },

  evaluate(num: number, ctx: AlgorithmContext) {
    if (!ctx.pluginCache?.[AlgoKey.SPECTRAL]) {
      this.precompute(ctx);
    }
    const cache = ctx.pluginCache![AlgoKey.SPECTRAL] as { robustStats: RobustStats };
    
    // 1. Énergie spectrale brute
    const metrics = ctx.advancedMetrics?.spectral as Array<{ number: number; energy: number }> | undefined;
    const energy = metrics?.find(s => s.number === num)?.energy || 0.0;
    
    const { median, iqr } = cache.robustStats;
    const normSpectral = Math.max(0.0, Math.min(100.0, sigmoidNormalize(energy, median, iqr)));

    // 2. Volatilité (intégrée sous forme de modulation d'amplitude pour la résonance spectrale)
    const volMap = ctx.advancedMetrics?.volatility as Record<number, number> | number | undefined;
    let volFactor = 1.0;
    if (volMap && typeof volMap === 'object') {
      const v = volMap[num];
      if (typeof v === 'number') {
        volFactor = 1.0 + Math.max(-0.5, Math.min(0.5, v / 100.0)); // Borné à ±50%
      }
    } else if (typeof volMap === 'number') {
      volFactor = 1.0 + Math.max(-0.5, Math.min(0.5, volMap / 100.0));
    }

    const score = Math.max(0.0, Math.min(100.0, normSpectral * volFactor));
    return {
      score,
      confidence: 0.95,
      metadata: { 
        energy: parseFloat(energy.toFixed(4)), 
        volFactor: parseFloat(volFactor.toFixed(4)),
        normSpectral: parseFloat(normSpectral.toFixed(4))
      }
    };
  }
};

/**
 * ============================================================================
 *               FRACTAL & HURST LONG-MEMORY DECAY PLUGIN
 * ============================================================================
 * Basis: Hurst Exponent (R/S Analysis), Wavelet Coefficients & Lyapunon Attractors.
 *
 * Theory:
 * Measures long-term trend persistence (Hurst > 0.5) vs mean reversion (Hurst < 0.5).
 * Neutrality is mathematically centered at 50 with continuous tanh scaling to avoid
 * penalizing anti-persistent structures (Hurst < 0.5).
 */
export const fractalPlugin: AlgorithmPlugin = {
  key: AlgoKey.FRACTAL,
  category: 'advanced',
  stability: 'stable',
  mathematicalBasis: 'Exposant de Hurst (Analyse R/S), Coefficients d\'Ondelettes et Dimension Fractale de Hausdorff',
  description: 'Analyse multi-échelle mesurant la mémoire longue débyasée (Hurst), la régularité locale (ondelettes) et l\'attracteur de Lyapunov.',
  isStrictlyDeterministic: true,

  precompute(ctx: AlgorithmContext) {
    const metricsWavelet = ctx.advancedMetrics?.wavelet as Array<{ number: number; energy: number }> | undefined;
    const energiesWavelet = metricsWavelet?.map(s => s.energy).filter((v): v is number => typeof v === 'number') || [];
    const waveletStats = energiesWavelet.length > 0 ? getRobustStats(energiesWavelet) : { median: 0.0, iqr: 1.0 };

    const resValues = Object.values(ctx.advancedMetrics?.fractalResonance || {}).filter((v): v is number => typeof v === 'number');
    const resStats = resValues.length > 0 ? getRobustStats(resValues) : { median: 0.0, iqr: 1.0 };
    
    ctx.pluginCache = ctx.pluginCache || {};
    ctx.pluginCache[AlgoKey.FRACTAL] = { waveletStats, resStats };
  },

  evaluate(num: number, ctx: AlgorithmContext) {
    if (!ctx.pluginCache?.[AlgoKey.FRACTAL]) {
      this.precompute(ctx);
    }
    const cache = ctx.pluginCache![AlgoKey.FRACTAL] as {
      waveletStats: RobustStats;
      resStats: RobustStats;
    };

    // 1. Exposant de Hurst (base fractale)
    const metricsFractal = ctx.advancedMetrics?.fractal as Array<{ number: number; hurst: number }> | undefined;
    const hurst = metricsFractal?.find(s => s.number === num)?.hurst ?? 0.5;
    
    // VIOLATION CORRIGÉE : Utilisation de la fonction tangente hyperbolique continue décentrée.
    // Neutralise à 50 (si Hurst = 0.5), tend vers 100 pour Hurst -> 1.0 (persistance), et 0 pour Hurst -> 0.0 (anti-persistance).
    const normHurst = 50.0 + 50.0 * Math.tanh((hurst - 0.5) * 4.0);

    // 2. Énergie d'ondelette
    const metricsWavelet = ctx.advancedMetrics?.wavelet as Array<{ number: number; energy: number }> | undefined;
    const energy = metricsWavelet?.find(s => s.number === num)?.energy || 0.0;
    const { median: medW, iqr: iqrW } = cache.waveletStats;
    const normWavelet = Math.max(0.0, Math.min(100.0, sigmoidNormalize(energy, medW, iqrW)));

    // 3. Résonance de dimension fractale (Fractal Dimension Resonance)
    const resVal = (ctx.advancedMetrics?.fractalResonance as Record<number, number>)?.[num] || 0.0;
    const { median: medRes, iqr: iqrRes } = cache.resStats;
    const normFractalRes = Math.max(0.0, Math.min(100.0, sigmoidNormalize(resVal, medRes, iqrRes)));

    // 4. Modulateur de Lyapunov (Stabilité locale de l'attracteur géométrique)
    const lyapunov = (ctx.advancedMetrics?.topologicalLyapunov as Record<number, number>)?.[num] || 0.0;
    // Bornage continu du modulateur de Lyapunov pour éviter d'exploser le signal final (capping à ±50%)
    const boundedLyapunovMultiplier = 1.0 + Math.max(-0.5, Math.min(0.5, lyapunov / 100.0));

    // Fusion géométrique continue des composantes de l'attracteur
    const safeHurst = Math.max(Number.EPSILON, normHurst);
    const safeWavelet = Math.max(Number.EPSILON, normWavelet);
    const safeResonance = Math.max(Number.EPSILON, normFractalRes);
    
    const baseFused = Math.pow(safeHurst * safeWavelet * safeResonance, 1.0 / 3.0);
    const fused = baseFused * boundedLyapunovMultiplier;
    const score = Math.max(0.0, Math.min(100.0, fused));

    return {
      score,
      confidence: 0.95,
      metadata: { 
        hurst: parseFloat(hurst.toFixed(4)), 
        normHurst: parseFloat(normHurst.toFixed(4)),
        energy: parseFloat(energy.toFixed(4)), 
        normWavelet: parseFloat(normWavelet.toFixed(4)),
        resVal: parseFloat(resVal.toFixed(4)), 
        normFractalRes: parseFloat(normFractalRes.toFixed(4)),
        lyapunov: parseFloat(lyapunov.toFixed(4)),
        boundedLyapunovMultiplier: parseFloat(boundedLyapunovMultiplier.toFixed(4))
      }
    };
  }
};
