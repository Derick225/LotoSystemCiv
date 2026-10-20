export interface LedgerSummary {
  account: string;
  balance: number;
}

export const summarizeLedger = (account: string, balance: number): LedgerSummary => ({
  account,
  balance: Number.isFinite(balance) ? balance : 0,
});
