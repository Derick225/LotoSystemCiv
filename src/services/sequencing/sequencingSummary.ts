export interface SequencingSummary {
  key: string;
  order: number;
}

export const summarizeSequencing = (key: string, order: number): SequencingSummary => ({
  key,
  order: Number.isFinite(order) ? Math.max(0, order) : 0,
});
