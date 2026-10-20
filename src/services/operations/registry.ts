export type OperationKind = 'analysis' | 'sync' | 'report';

export interface OperationEntry {
  id: string;
  kind: OperationKind;
  label: string;
  priority: number;
}

export const normalizeOperationPriority = (priority: number): number => {
  if (!Number.isFinite(priority)) return 0;
  return Math.max(0, priority);
};

export const buildOperationRegistry = (
  entries: OperationEntry[],
): Map<string, OperationEntry> => {
  const registry = new Map<string, OperationEntry>();

  for (const entry of entries) {
    registry.set(entry.id, {
      ...entry,
      priority: normalizeOperationPriority(entry.priority),
    });
  }

  return registry;
};
