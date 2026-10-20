export interface ExperimentRunnerSummary {
  name: string;
  convergence: number;
}

export const summarizeExperimentRunner = (name: string, convergence: number): ExperimentRunnerSummary => ({
  name,
  convergence: Number.isFinite(convergence) ? Math.max(0, Math.min(1, convergence)) : 0,
});
