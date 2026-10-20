export interface AnalystSummary {
  mode: 'parse' | 'generate';
  confidence: number;
}

export const summarizeAnalyst = (mode: 'parse' | 'generate', confidence: number): AnalystSummary => ({
  mode,
  confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
});
