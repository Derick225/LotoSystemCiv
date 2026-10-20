export interface QualitySummary {
  issue: string;
  score: number;
}

export const summarizeQuality = (issue: string, score: number): QualitySummary => ({
  issue,
  score: Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 0,
});
