export interface ExperimentSummary {
  name: string;
  score: number;
}

export const summarizeExperiment = (name: string, score: number): ExperimentSummary => ({
  name,
  score: Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 0,
});
