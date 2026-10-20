export interface TemporalSummary {
  series: string;
  seasonality: number;
  momentum: number;
}

export const summarizeTemporal = (series: string, seasonality: number, momentum: number): TemporalSummary => ({
  series,
  seasonality: Number.isFinite(seasonality) ? Math.max(0, Math.min(1, seasonality)) : 0,
  momentum: Number.isFinite(momentum) ? Math.max(-1, Math.min(1, momentum)) : 0,
});
