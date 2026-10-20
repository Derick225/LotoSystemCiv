export interface KnowledgeBaseSummary {
  concept: string;
  score: number;
}

export const summarizeKnowledgeBase = (concept: string, score: number): KnowledgeBaseSummary => ({
  concept,
  score: Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 0,
});
