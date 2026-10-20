export interface SchemaFamilySummary {
  module: string;
  version: number;
}

export const summarizeSchemaFamily = (module: string, version: number): SchemaFamilySummary => ({
  module,
  version: Number.isFinite(version) ? Math.max(0, version) : 0,
});
