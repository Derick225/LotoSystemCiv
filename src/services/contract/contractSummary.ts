export interface ContractSummary {
  name: string;
  valid: boolean;
  version: number;
}

export const summarizeContract = (name: string, valid: boolean, version: number): ContractSummary => ({
  name,
  valid: Boolean(valid),
  version: Number.isFinite(version) ? Math.max(0, version) : 0,
});
