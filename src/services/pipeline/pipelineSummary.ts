export interface PipelineSummary {
  pipeline: string;
  throughput: number;
}

export const summarizePipeline = (pipeline: string, throughput: number): PipelineSummary => ({
  pipeline,
  throughput: Number.isFinite(throughput) ? Math.max(0, throughput) : 0,
});
