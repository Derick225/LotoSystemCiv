export interface OptimizationSummary {
  step: number;
  score: number;
}

export const summarizeOptimization = (step: number, score: number): OptimizationSummary => ({
  step: Number.isFinite(step) ? Math.max(0, step) : 0,
  score: Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 0,
});
