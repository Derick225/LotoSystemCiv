export interface InsightSummary {
  label: string;
  impact: number;
}

export const summarizeInsight = (label: string, impact: number): InsightSummary => ({
  label,
  impact: Number.isFinite(impact) ? Math.max(0, Math.min(1, impact)) : 0,
});
