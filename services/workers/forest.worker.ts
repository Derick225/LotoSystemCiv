
export {};

/**
 * Nexus Random Forest Worker v3.0 (Classification Réelle)
 */

interface Example { features: number[]; label: 0 | 1; }
interface Node { 
    featureIdx?: number; 
    threshold?: number; 
    left?: Node; 
    right?: Node; 
    value?: number; 
}

// Fix: Explicit typing for self
const ctx = self as unknown as Worker;

ctx.onmessage = (e) => {
    const { dataset, candidates, config } = e.data;
    if (!dataset || dataset.length === 0) return;

    const numTrees = config?.numTrees || 60;
    const maxDepth = config?.maxDepth || 6;
    const forest: Node[] = [];

    // Training (Bagging)
    for (let i = 0; i < numTrees; i++) {
        const sample = [];
        for (let j = 0; j < dataset.length; j++) {
            sample.push(dataset[Math.floor(Math.random() * dataset.length)]);
        }
        forest.push(buildTree(sample, maxDepth));
    }

    // Prediction (Majority Vote)
    const votes = candidates.map((cand: any) => {
        let score = 0;
        forest.forEach(tree => score += predict(tree, cand.features));
        return { number: cand.number, score: Math.round((score / numTrees) * 100) };
    });

    ctx.postMessage({ type: 'result', votes: votes.sort((a: any, b: any) => b.score - a.score) });
};

function buildTree(data: Example[], depth: number): Node {
    const numSamples = data.length;
    const pos = data.filter(d => d.label === 1).length;
    const purity = pos / numSamples;

    if (depth === 0 || purity === 0 || purity === 1 || numSamples < 5) {
        return { value: purity > 0.5 ? 1 : 0 };
    }

    const featIdx = Math.floor(Math.random() * data[0].features.length);
    const threshold = data[Math.floor(Math.random() * numSamples)].features[featIdx];

    const left = data.filter(d => d.features[featIdx] <= threshold);
    const right = data.filter(d => d.features[featIdx] > threshold);

    if (left.length === 0 || right.length === 0) return { value: purity > 0.5 ? 1 : 0 };

    return {
        featureIdx: featIdx,
        threshold,
        left: buildTree(left, depth - 1),
        right: buildTree(right, depth - 1)
    };
}

function predict(node: Node, features: number[]): number {
    if (node.value !== undefined) return node.value;
    return features[node.featureIdx!] <= node.threshold! 
        ? predict(node.left!, features) 
        : predict(node.right!, features);
}
