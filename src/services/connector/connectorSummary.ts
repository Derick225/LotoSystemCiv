export interface ConnectorSummary {
  source: string;
  connected: boolean;
  latency: number;
}

export const summarizeConnector = (source: string, connected: boolean, latency: number): ConnectorSummary => ({
  source,
  connected: Boolean(connected),
  latency: Number.isFinite(latency) ? Math.max(0, latency) : 0,
});
