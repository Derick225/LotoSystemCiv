export interface FeatureSummary {
  name: string;
  strength: number;
}

export const summarizeFeatureLibrary = (name: string, strength: number): FeatureSummary => ({
  name,
  strength: Number.isFinite(strength) ? Math.max(0, Math.min(1, strength)) : 0,
});
