export interface ForestSummary {
  treeCount: number;
  depth: number;
  score: number;
}

export const summarizeForest = (treeCount: number, depth: number, score: number): ForestSummary => ({
  treeCount: Number.isFinite(treeCount) ? Math.max(0, treeCount) : 0,
  depth: Number.isFinite(depth) ? Math.max(0, depth) : 0,
  score: Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 0,
});
