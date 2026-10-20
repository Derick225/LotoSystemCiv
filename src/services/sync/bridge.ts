export interface SyncBridgeState {
  queued: number;
  ready: boolean;
}

export const createSyncBridgeState = (queued: number): SyncBridgeState => ({
  queued: Number.isFinite(queued) ? Math.max(0, queued) : 0,
  ready: Number.isFinite(queued) ? queued <= 0 : true,
});

export const mergeSyncBridgeState = (
  current: SyncBridgeState,
  next: Partial<SyncBridgeState>,
): SyncBridgeState => ({
  queued: Number.isFinite(next.queued) ? Math.max(0, next.queued as number) : current.queued,
  ready: next.ready ?? (current.queued <= 0),
});
