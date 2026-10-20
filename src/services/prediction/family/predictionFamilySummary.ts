export interface PredictionFamilySummary {
  name: string;
  coverage: number;
  determinism: number;
}

export const summarizePredictionFamily = (name: string, coverage: number, determinism: number): PredictionFamilySummary => ({
  name,
  coverage: Number.isFinite(coverage) ? Math.max(0, Math.min(1, coverage)) : 0,
  determinism: Number.isFinite(determinism) ? Math.max(0, Math.min(1, determinism)) : 0,
});
