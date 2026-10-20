export interface ReconciliationSummary {
  dataset: string;
  parity: number;
}

export const summarizeReconciliation = (dataset: string, parity: number): ReconciliationSummary => ({
  dataset,
  parity: Number.isFinite(parity) ? Math.max(0, Math.min(1, parity)) : 0,
});
