export interface ForecastSummary {
  drawName: string;
  candidateCount: number;
  confidence: number;
}

export const summarizeForecast = (drawName: string, candidateCount: number, confidence: number): ForecastSummary => ({
  drawName,
  candidateCount: Number.isFinite(candidateCount) ? Math.max(0, candidateCount) : 0,
  confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
});
