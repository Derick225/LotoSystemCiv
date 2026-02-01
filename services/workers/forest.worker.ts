
export {};

/**
 * Nexus Decision Forest Worker v4.0
 * Algorithme CART réel (Gini Impurity).
 */

interface Example { features: number[]; label: 0 | 1; }
interface Node { featureIdx?: number; threshold?: number; left?: Node; right?: Node; value?: number; }

const ctx = self as unknown as Worker;

function calculateGini(groups: Example[][], classes: number[]): number {
    const totalSamples = groups.reduce((acc, g) => acc + g.length, 0);
    let gini = 0.0;
    for (const group of groups) {
        const size = group.length;
        if (size === 0) continue;
        let score = 0.0;
        for (const classVal of classes) {
            const p = group.filter(r => r.label === classVal).length / size;
            score += p * p;
        }
        gini += (1.0 - score) * (size / totalSamples);
    }
    return gini;
}

function testSplit(index: number, value: number, dataset: Example[]): Example[][] {
    const left: Example[] = [], right: Example[] = [];
    for (const row of dataset) {
        if (row.features[index] < value) left.push(row);
        else right.push(row);
    }
    return [left, right];
}

function getSplit(dataset: Example[]): { featureIdx: number, threshold: number, groups: Example[][] } {
    const classValues = [0, 1];
    let b_index = 999, b_value = 999, b_score = 999, b_groups: Example[][] = [];
    
    const numFeatures = dataset[0].features.length;
    const featuresToCheck = [];
    const nFeaturesCheck = Math.max(1, Math.floor(Math.sqrt(numFeatures)));
    
    while(featuresToCheck.length < nFeaturesCheck) {
        const idx = Math.floor(Math.random() * numFeatures);
        if(!featuresToCheck.includes(idx)) featuresToCheck.push(idx);
    }

    for (const featureIdx of featuresToCheck) {
        for (const row of dataset) {
            const groups = testSplit(featureIdx, row.features[featureIdx], dataset);
            const gini = calculateGini(groups, classValues);
            if (gini < b_score) {
                b_index = featureIdx; b_value = row.features[featureIdx]; b_score = gini; b_groups = groups;
            }
        }
    }
    return { featureIdx: b_index, threshold: b_value, groups: b_groups };
}

function toTerminal(group: Example[]): number {
    const outcomes = group.map(r => r.label);
    const pos = outcomes.filter(o => o === 1).length;
    return (pos / outcomes.length) > 0.5 ? 1 : 0;
}

function split(node: any, maxDepth: number, minSize: number, depth: number) {
    const [left, right] = node.groups;
    delete node.groups;

    if (!left.length || !right.length) {
        node.left = node.right = { value: toTerminal(left.concat(right)) };
        return;
    }
    if (depth >= maxDepth) {
        node.left = { value: toTerminal(left) };
        node.right = { value: toTerminal(right) };
        return;
    }
    // Left child
    if (left.length <= minSize) node.left = { value: toTerminal(left) };
    else {
        const res = getSplit(left);
        node.left = { featureIdx: res.featureIdx, threshold: res.threshold, groups: res.groups };
        split(node.left, maxDepth, minSize, depth + 1);
    }
    // Right child
    if (right.length <= minSize) node.right = { value: toTerminal(right) };
    else {
        const res = getSplit(right);
        node.right = { featureIdx: res.featureIdx, threshold: res.threshold, groups: res.groups };
        split(node.right, maxDepth, minSize, depth + 1);
    }
}

function predict(node: Node, row: number[]): number {
    if (node.value !== undefined) return node.value;
    if (node.featureIdx === undefined || node.threshold === undefined || !node.left || !node.right) return 0;
    return row[node.featureIdx] < node.threshold ? predict(node.left, row) : predict(node.right, row);
}

ctx.onmessage = (e) => {
    const { dataset, candidates, config } = e.data;
    if (!dataset?.length) return;

    const numTrees = config?.numTrees || 60;
    const forest: Node[] = [];

    for (let i = 0; i < numTrees; i++) {
        const sample = [];
        for (let j = 0; j < dataset.length; j++) {
            sample.push(dataset[Math.floor(Math.random() * dataset.length)]);
        }
        const root = getSplit(sample);
        const tree: any = { featureIdx: root.featureIdx, threshold: root.threshold, groups: root.groups };
        split(tree, config?.maxDepth || 6, 5, 1);
        forest.push(tree);
    }

    const votes = candidates.map((cand: any) => {
        let score = 0;
        forest.forEach(tree => score += predict(tree, cand.features));
        return { number: cand.number, score: Math.round((score / numTrees) * 100) };
    });

    ctx.postMessage({ type: 'result', votes: votes.sort((a: any, b: any) => b.score - a.score) });
};
