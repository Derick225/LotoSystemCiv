export interface ResearchSummary {
  topic: string;
  confidence: number;
}

export const summarizeResearch = (topic: string, confidence: number): ResearchSummary => ({
  topic,
  confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
});
