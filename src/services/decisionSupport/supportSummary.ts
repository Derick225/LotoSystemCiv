export interface DecisionSupportSummary {
  label: string;
  confidence: number;
}

export const summarizeDecisionSupport = (label: string, confidence: number): DecisionSupportSummary => ({
  label,
  confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
});
