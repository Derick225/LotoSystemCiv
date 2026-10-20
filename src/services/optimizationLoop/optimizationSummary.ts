export interface OptimizationLoopSummary {
  iteration: number;
  objective: number;
}

export const summarizeOptimizationLoop = (iteration: number, objective: number): OptimizationLoopSummary => ({
  iteration: Number.isFinite(iteration) ? Math.max(0, iteration) : 0,
  objective: Number.isFinite(objective) ? Math.max(0, Math.min(1, objective)) : 0,
});
