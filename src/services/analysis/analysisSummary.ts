export interface AnalysisSummary {
  phase: string;
  confidence: number;
  drift: number;
}

export const summarizeAnalysis = (phase: string, confidence: number, drift: number): AnalysisSummary => ({
  phase,
  confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
  drift: Number.isFinite(drift) ? Math.max(0, Math.min(1, drift)) : 0,
});
