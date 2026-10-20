export interface AnalyticsSummary {
  drawName: string;
  sampleCount: number;
  mean: number;
  variance: number;
  entropy: number;
}

export const summarizeDrawHistory = (
  draws: Array<{ gagnants?: number[]; date?: string }>,
  drawName = 'unknown',
): AnalyticsSummary => {
  const valid = Array.isArray(draws) ? draws : [];
  const flat = valid.flatMap((draw) => Array.isArray(draw.gagnants) ? draw.gagnants : []);
  const sampleCount = flat.length;

  const mean = sampleCount > 0 ? flat.reduce((sum, value) => sum + value, 0) / sampleCount : 0;
  const variance = sampleCount > 0
    ? flat.reduce((sum, value) => sum + (value - mean) ** 2, 0) / sampleCount
    : 0;

  const entropy = sampleCount > 0
    ? flat.reduce((sum, value) => {
        const p = value > 0 ? 1 / value : 0;
        return sum + (p > 0 ? -p * Math.log2(p) : 0);
      }, 0) / Math.max(1, sampleCount)
    : 0;

  return {
    drawName,
    sampleCount,
    mean,
    variance,
    entropy,
  };
};
