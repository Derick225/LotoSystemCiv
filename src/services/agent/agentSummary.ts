export interface AgentSummary {
  name: string;
  status: 'idle' | 'active' | 'error';
  confidence: number;
}

export const summarizeAgent = (name: string, status: 'idle' | 'active' | 'error', confidence: number): AgentSummary => ({
  name,
  status,
  confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
});
