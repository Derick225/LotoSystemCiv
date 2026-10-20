export interface OrchestrationSummary {
  stage: string;
  status: 'queued' | 'running' | 'done';
  progress: number;
}

export const summarizeOrchestration = (stage: string, status: 'queued' | 'running' | 'done', progress: number): OrchestrationSummary => ({
  stage,
  status,
  progress: Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0,
});
