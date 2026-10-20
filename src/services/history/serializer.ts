export interface SerializedHistoryEntry {
  drawName: string;
  count: number;
  snapshot: number[];
}

export const serializeHistoryWindow = (
  items: Array<{ drawName?: string; gagnants?: number[] }>,
): SerializedHistoryEntry[] => {
  return (Array.isArray(items) ? items : []).map((item, index) => ({
    drawName: item.drawName ?? `draw-${index}`,
    count: Array.isArray(item.gagnants) ? item.gagnants.length : 0,
    snapshot: Array.isArray(item.gagnants) ? [...item.gagnants].sort((a, b) => a - b) : [],
  }));
};
