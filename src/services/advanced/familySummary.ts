export interface AdvancedFamilySummary {
  family: 'advanced';
  metrics: number;
  stats: number;
  coverage: number;
}

export const summarizeAdvancedFamily = (
  metrics: number,
  stats: number,
  coverage: number,
): AdvancedFamilySummary => ({
  family: 'advanced',
  metrics: Number.isFinite(metrics) ? metrics : 0,
  stats: Number.isFinite(stats) ? stats : 0,
  coverage: Number.isFinite(coverage) ? Math.max(0, Math.min(1, coverage)) : 0,
});
