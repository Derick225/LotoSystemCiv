export interface MarketSummary {
  segment: string;
  momentum: number;
}

export const summarizeMarket = (segment: string, momentum: number): MarketSummary => ({
  segment,
  momentum: Number.isFinite(momentum) ? Math.max(-1, Math.min(1, momentum)) : 0,
});
