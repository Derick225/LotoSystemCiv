export interface GuardrailSummary {
  rule: string;
  enforced: boolean;
}

export const summarizeGuardrail = (rule: string, enforced: boolean): GuardrailSummary => ({
  rule,
  enforced: Boolean(enforced),
});
