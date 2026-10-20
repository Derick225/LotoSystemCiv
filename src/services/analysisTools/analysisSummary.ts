export interface AnalysisToolsSummary {
  drawName: string;
  confidence: number;
}

export const summarizeAnalysisTools = (drawName: string, confidence: number): AnalysisToolsSummary => ({
  drawName,
  confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
});
