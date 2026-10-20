export interface MathSummary {
  metric: string;
  value: number;
  stability: number;
}

export const summarizeMath = (metric: string, value: number, stability: number): MathSummary => ({
  metric,
  value: Number.isFinite(value) ? value : 0,
  stability: Number.isFinite(stability) ? Math.max(0, Math.min(1, stability)) : 0,
});
