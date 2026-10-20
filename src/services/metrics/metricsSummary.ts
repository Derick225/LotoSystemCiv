export interface MetricsSummary {
  label: string;
  value: number;
}

export const summarizeMetrics = (label: string, value: number): MetricsSummary => ({
  label,
  value: Number.isFinite(value) ? value : 0,
});
