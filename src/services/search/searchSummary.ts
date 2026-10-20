export interface SearchSummary {
  query: string;
  coverage: number;
  confidence: number;
}

export const summarizeSearch = (query: string, coverage: number, confidence: number): SearchSummary => ({
  query,
  coverage: Number.isFinite(coverage) ? Math.max(0, Math.min(1, coverage)) : 0,
  confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
});
