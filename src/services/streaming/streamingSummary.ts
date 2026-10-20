export interface StreamingSummary {
  stream: string;
  queued: number;
}

export const summarizeStreaming = (stream: string, queued: number): StreamingSummary => ({
  stream,
  queued: Number.isFinite(queued) ? Math.max(0, queued) : 0,
});
