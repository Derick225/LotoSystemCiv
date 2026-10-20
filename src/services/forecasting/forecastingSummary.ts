export interface ForecastingSummary {
  horizon: string;
  confidence: number;
}

export const summarizeForecasting = (horizon: string, confidence: number): ForecastingSummary => ({
  horizon,
  confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
});
