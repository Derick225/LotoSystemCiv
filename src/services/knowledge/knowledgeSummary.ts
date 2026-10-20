export interface KnowledgeSummary {
  key: string;
  confidence: number;
}

export const summarizeKnowledge = (key: string, confidence: number): KnowledgeSummary => ({
  key,
  confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
});
