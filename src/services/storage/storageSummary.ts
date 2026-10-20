export interface StorageSummary {
  scope: string;
  used: number;
}

export const summarizeStorage = (scope: string, used: number): StorageSummary => ({
  scope,
  used: Number.isFinite(used) ? Math.max(0, used) : 0,
});
