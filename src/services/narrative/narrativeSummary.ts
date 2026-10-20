export interface NarrativeSummary {
  keyFact: string;
  confidence: number;
}

export const summarizeNarrative = (keyFact: string, confidence: number): NarrativeSummary => ({
  keyFact,
  confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
});
