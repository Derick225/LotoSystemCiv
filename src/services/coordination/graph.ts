export interface DependencyNode {
  id: string;
  dependsOn: string[];
  weight: number;
}

export const resolveExecutionOrder = (nodes: DependencyNode[]): string[] => {
  const map = new Map(nodes.map((node) => [node.id, { ...node, dependsOn: [...node.dependsOn] }]));
  const ordered: string[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (nodeId: string): void => {
    if (visited.has(nodeId)) return;
    if (visiting.has(nodeId)) {
      throw new Error(`Circular dependency detected for node: ${nodeId}`);
    }

    const node = map.get(nodeId);
    if (!node) return;

    visiting.add(nodeId);
    for (const dependency of node.dependsOn) {
      visit(dependency);
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
    ordered.push(nodeId);
  };

  for (const node of nodes) {
    visit(node.id);
  }

  return ordered;
};

export const normalizeNodeWeight = (weight: number): number => {
  if (!Number.isFinite(weight)) return 0;
  return Math.max(0, weight);
};
