export interface ContextSummary {
  scope: string;
  freshness: number;
}

export const summarizeContext = (scope: string, freshness: number): ContextSummary => ({
  scope,
  freshness: Number.isFinite(freshness) ? Math.max(0, Math.min(1, freshness)) : 0,
});
