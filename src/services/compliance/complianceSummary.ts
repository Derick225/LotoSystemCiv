export interface ComplianceSummary {
  rule: string;
  compliant: boolean;
}

export const summarizeCompliance = (rule: string, compliant: boolean): ComplianceSummary => ({
  rule,
  compliant: Boolean(compliant),
});
