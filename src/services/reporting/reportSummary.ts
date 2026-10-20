export interface ReportSummary {
  drawName: string;
  totalSignals: number;
  confidence: number;
}

export const summarizeReport = (drawName: string, totalSignals: number, confidence: number): ReportSummary => ({
  drawName,
  totalSignals: Number.isFinite(totalSignals) ? Math.max(0, totalSignals) : 0,
  confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
});
