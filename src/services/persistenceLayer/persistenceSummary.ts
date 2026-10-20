export interface PersistenceSummary {
  storageId: string;
  retained: boolean;
}

export const summarizePersistence = (storageId: string, retained: boolean): PersistenceSummary => ({
  storageId,
  retained: Boolean(retained),
});
