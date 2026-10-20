export interface GovernanceSummary {
  domain: string;
  status: 'pass' | 'warn' | 'fail';
  confidence: number;
}

export const summarizeGovernance = (domain: string, status: 'pass' | 'warn' | 'fail', confidence: number): GovernanceSummary => ({
  domain,
  status,
  confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
});
