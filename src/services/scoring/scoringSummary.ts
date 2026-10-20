export interface ScoringSummary {
  dimension: string;
  score: number;
}

export const summarizeScoring = (dimension: string, score: number): ScoringSummary => ({
  dimension,
  score: Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 0,
});
