export interface OptimizationEngineSummary {
  phase: string;
  improvement: number;
}

export const summarizeOptimizationEngine = (phase: string, improvement: number): OptimizationEngineSummary => ({
  phase,
  improvement: Number.isFinite(improvement) ? Math.max(0, Math.min(1, improvement)) : 0,
});
