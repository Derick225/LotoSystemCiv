export interface ObservabilitySummary {
  layer: string;
  signal: number;
}

export const summarizeObservability = (layer: string, signal: number): ObservabilitySummary => ({
  layer,
  signal: Number.isFinite(signal) ? Math.max(0, Math.min(1, signal)) : 0,
});
