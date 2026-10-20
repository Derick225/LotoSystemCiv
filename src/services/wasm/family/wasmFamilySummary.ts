export interface WasmFamilySummary {
  bridge: string;
  enabled: boolean;
  abi: number;
}

export const summarizeWasmFamily = (bridge: string, enabled: boolean, abi: number): WasmFamilySummary => ({
  bridge,
  enabled: Boolean(enabled),
  abi: Number.isFinite(abi) ? Math.max(0, Math.min(1, abi)) : 0,
});
