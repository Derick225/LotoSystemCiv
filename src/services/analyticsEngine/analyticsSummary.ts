export interface AnalyticsEngineSummary {
  key: string;
  score: number;
}

export const summarizeAnalyticsEngine = (key: string, score: number): AnalyticsEngineSummary => ({
  key,
  score: Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 0,
});
