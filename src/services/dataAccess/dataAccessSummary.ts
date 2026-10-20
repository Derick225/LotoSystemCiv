export interface DataAccessSummary {
  collection: string;
  count: number;
}

export const summarizeDataAccess = (collection: string, count: number): DataAccessSummary => ({
  collection,
  count: Number.isFinite(count) ? Math.max(0, count) : 0,
});
