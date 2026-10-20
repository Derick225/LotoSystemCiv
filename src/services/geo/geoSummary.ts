export interface GeoSummary {
  region: string;
  density: number;
}

export const summarizeGeo = (region: string, density: number): GeoSummary => ({
  region,
  density: Number.isFinite(density) ? Math.max(0, density) : 0,
});
