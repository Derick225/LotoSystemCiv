export interface WorkerFamilySummary {
  worker: string;
  ready: boolean;
}

export const summarizeWorkerFamily = (worker: string, ready: boolean): WorkerFamilySummary => ({
  worker,
  ready: Boolean(ready),
});
