export interface LotterySummary {
  drawName: string;
  coverage: number;
  determinism: number;
}

export const summarizeLottery = (drawName: string, coverage: number, determinism: number): LotterySummary => ({
  drawName,
  coverage: Number.isFinite(coverage) ? Math.max(0, Math.min(1, coverage)) : 0,
  determinism: Number.isFinite(determinism) ? Math.max(0, Math.min(1, determinism)) : 0,
});
