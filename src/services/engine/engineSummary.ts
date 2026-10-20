export interface EngineSummary {
  kind: string;
  stability: number;
}

export const summarizeEngine = (kind: string, stability: number): EngineSummary => ({
  kind,
  stability: Number.isFinite(stability) ? Math.max(0, Math.min(1, stability)) : 0,
});
