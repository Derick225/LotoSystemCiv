export interface InfrastructureSummary {
  layer: string;
  healthy: boolean;
  latencyMs: number;
}

export const summarizeInfrastructure = (layer: string, healthy: boolean, latencyMs: number): InfrastructureSummary => ({
  layer,
  healthy: Boolean(healthy),
  latencyMs: Number.isFinite(latencyMs) ? Math.max(0, latencyMs) : 0,
});
