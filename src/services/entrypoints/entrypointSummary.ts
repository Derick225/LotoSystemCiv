export interface EntrypointSummary {
  name: string;
  ready: boolean;
}

export const summarizeEntrypoints = (name: string, ready: boolean): EntrypointSummary => ({
  name,
  ready: Boolean(ready),
});
