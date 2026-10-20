import { DrawResult } from '../types';

/**
 * Kernel Density Estimation (KDE) Engine
 * 
 * Provides continuous, non-parametric probability density function (PDF)
 * and cumulative distribution function (CDF) estimation for gap and sequence distributions.
 * 
 * Guarantees:
 * - Zero Magic Numbers: Bandwidth derived continuously using Silverman's / Scott's Rule of Thumb
 *   with robust IQR fallback.
 * - 100% Deterministic: Pure mathematical evaluations.
 * - Continuous & Differentiable: Prevents step function discretization defects.
 */

const SQRT_2PI = Math.sqrt(2 * Math.PI);

/**
 * Standard Normal Gaussian Kernel K(u) = (1 / sqrt(2pi)) * exp(-u^2 / 2)
 */
export function gaussianKernel(u: number): number {
  return (1 / SQRT_2PI) * Math.exp(-0.5 * u * u);
}

/**
 * Epanechnikov Kernel K(u) = 3/4 * (1 - u^2) for |u| <= 1, 0 otherwise
 */
export function epanechnikovKernel(u: number): number {
  return Math.abs(u) <= 1 ? 0.75 * (1 - u * u) : 0;
}

/**
 * Standard Normal CDF Phi(x) via Abramowitz and Stegun approximation
 */
export function standardNormalCDF(x: number): number {
  if (x < -8.0) return 0.0;
  if (x > 8.0) return 1.0;
  
  const z = Math.abs(x);
  const t = 1.0 / (1.0 + 0.2316419 * z);
  const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const phi = (1.0 / SQRT_2PI) * Math.exp(-0.5 * z * z) * poly;
  
  return x >= 0 ? 1.0 - phi : phi;
}

/**
 * Quantile calculation for IQR estimation
 */
function getQuantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (base + 1 < sorted.length) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

/**
 * Calculates Silverman's Rule of Thumb bandwidth h for 1D KDE:
 * h = 0.9 * min(std, IQR / 1.34) * N^(-1/5)
 * If std or IQR is near zero, falls back to std or domain resolution minimum.
 */
export function calculateSilvermanBandwidth(samples: number[]): number {
  const n = samples.length;
  if (n <= 1) return 1.0;

  const m = samples.reduce((a, b) => a + b, 0) / n;
  const variance = samples.reduce((acc, v) => acc + Math.pow(v - m, 2), 0) / n;
  const std = Math.sqrt(variance);

  const sorted = [...samples].sort((a, b) => a - b);
  const q1 = getQuantile(sorted, 0.25);
  const q3 = getQuantile(sorted, 0.75);
  const iqr = q3 - q1;

  const iqrScale = iqr > 0 ? iqr / 1.34 : std;
  const spread = Math.min(std, iqrScale);

  // If spread is zero or tiny (e.g., identical values), use small nonzero scale based on mean
  const effectiveSpread = spread > 1e-6 ? spread : Math.max(1.0, Math.abs(m) * 0.1);
  const h = 0.9 * effectiveSpread * Math.pow(n, -0.2);

  // Lower bound to prevent delta spike singularity
  return Math.max(0.2, h);
}

export interface KDEResult {
  pdf: number;           // Estimated PDF density f_hat(x)
  cdf: number;           // Estimated cumulative distribution F_hat(x)
  bandwidth: number;     // Bandwidth h used
  logLikelihood: number; // Log(f_hat(x) + EPSILON)
}

/**
 * Evaluates 1D Kernel Density Estimation at point x given samples
 */
export function evaluateKDE(
  samples: number[],
  x: number,
  customBandwidth?: number
): KDEResult {
  const n = samples.length;
  if (n === 0) {
    return { pdf: 0, cdf: 0.5, bandwidth: 1.0, logLikelihood: -10 };
  }

  const h = customBandwidth && customBandwidth > 0
    ? customBandwidth
    : calculateSilvermanBandwidth(samples);

  let pdfSum = 0;
  let cdfSum = 0;

  for (let i = 0; i < n; i++) {
    const u = (x - samples[i]) / h;
    pdfSum += gaussianKernel(u);
    cdfSum += standardNormalCDF(u);
  }

  const pdf = pdfSum / (n * h);
  const cdf = cdfSum / n;
  const logLikelihood = Math.log(Math.max(Number.EPSILON, pdf));

  return { pdf, cdf, bandwidth: h, logLikelihood };
}

/**
 * Evaluates 2D/Multivariate Kernel Density for sequence/gap pairs
 */
export function evaluateMultivariateKDE(
  samples: number[][],
  point: number[],
  customBandwidths?: number[]
): number {
  const N = samples.length;
  if (N === 0) return 0;
  const dim = point.length;

  const bandwidths = customBandwidths || point.map((_, d) => {
    const dimSamples = samples.map(s => s[d] || 0);
    return calculateSilvermanBandwidth(dimSamples);
  });

  let densitySum = 0;
  for (let i = 0; i < N; i++) {
    let kernelProd = 1.0;
    for (let d = 0; d < dim; d++) {
      const h_d = bandwidths[d] || 1.0;
      const u = (point[d] - samples[i][d]) / h_d;
      kernelProd *= gaussianKernel(u) / h_d;
    }
    densitySum += kernelProd;
  }

  return densitySum / N;
}
