
export {};

/**
 * Nexus Random Forest Worker v4.0 (Gini Impurity)
 * Implémente un véritable algorithme CART (Classification and Regression Trees).
 */

interface Example { features: number[]; label: 0 | 1; }

interface Node { 
    featureIdx?: number; 
    threshold?: number; 
    left?: Node; 
    right?: Node; 
    value?: number; 
    samples?: number;
}

const ctx = self as unknown as Worker;

// Calcul de l'impureté de Gini
// Gini = 1 - sum(p_i^2)
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
        
        // Pondération par la taille du groupe par rapport au total
        gini += (1.0 - score) * (size / totalSamples);
    }
    return gini;
}

// Trouve le meilleur split pour un dataset donné
function getSplit(dataset: Example[]): { featureIdx: number, threshold: number, groups: Example[][] } {
    const classValues = [0, 1];
    let b_index = 999, b_value = 999, b_score = 999, b_groups: Example[][] = [];
    
    // On teste un sous-ensemble aléatoire de features (sqrt(total)) pour la Random Forest
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
                b_index = featureIdx;
                b_value = row.features[featureIdx];
                b_score = gini;
                b_groups = groups;
            }
        }
    }
    
    return { featureIdx: b_index, threshold: b_value, groups: b_groups };
}

function testSplit(index: number, value: number, dataset: Example[]): Example[][] {
    const left: Example[] = [];
    const right: Example[] = [];
    for (const row of dataset) {
        if (row.features[index] < value) left.push(row);
        else right.push(row);
    }
    return [left, right];
}

function toTerminal(group: Example[]): number {
    const outcomes = group.map(r => r.label);
    const pos = outcomes.filter(o => o === 1).length;
    return (pos / outcomes.length) > 0.5 ? 1 : 0;
}

// Construction récursive de l'arbre
function split(node: Node, maxDepth: number, minSize: number, depth: number) {
    // @ts-ignore - node.groups est temporaire lors de la construction
    const [left, right] = node.groups;
    // @ts-ignore
    delete node.groups;

    if (!left || !right || left.length === 0 || right.length === 0) {
        node.left = node.right = { value: toTerminal(left.concat(right)) };
        return;
    }

    if (depth >= maxDepth) {
        node.left = { value: toTerminal(left) };
        node.right = { value: toTerminal(right) };
        return;
    }

    if (left.length <= minSize) {
        node.left = { value: toTerminal(left) };
    } else {
        const result = getSplit(left);
        // @ts-ignore
        node.left = { featureIdx: result.featureIdx, threshold: result.threshold, groups: result.groups };
        split(node.left, maxDepth, minSize, depth + 1);
    }

    if (right.length <= minSize) {
        node.right = { value: toTerminal(right) };
    } else {
        const result = getSplit(right);
        // @ts-ignore
        node.right = { featureIdx: result.featureIdx, threshold: result.threshold, groups: result.groups };
        split(node.right, maxDepth, minSize, depth + 1);
    }
}

function buildTree(train: Example[], maxDepth: number, minSize: number): Node {
    const root = getSplit(train);
    // @ts-ignore
    const node: Node = { featureIdx: root.featureIdx, threshold: root.threshold, groups: root.groups };
    split(node, maxDepth, minSize, 1);
    return node;
}

function predict(node: Node, row: number[]): number {
    if (node.value !== undefined) return node.value;
    if (node.featureIdx === undefined || node.threshold === undefined || !node.left || !node.right) return 0;

    if (row[node.featureIdx] < node.threshold) {
        return predict(node.left, row);
    } else {
        return predict(node.right, row);
    }
}

ctx.onmessage = (e) => {
    const { dataset, candidates, config } = e.data;
    if (!dataset || dataset.length === 0) return;

    const numTrees = config?.numTrees || 60;
    const maxDepth = config?.maxDepth || 6;
    const minSize = 5; // Nombre minimum d'échantillons par feuille
    const forest: Node[] = [];

    // Training (Bootstrap Aggregation - Bagging)
    for (let i = 0; i < numTrees; i++) {
        const sample = [];
        // Bootstrapping : tirage avec remise
        for (let j = 0; j < dataset.length; j++) {
            sample.push(dataset[Math.floor(Math.random() * dataset.length)]);
        }
        forest.push(buildTree(sample, maxDepth, minSize));
    }

    // Prediction (Majority Vote)
    const votes = candidates.map((cand: any) => {
        let score = 0;
        forest.forEach(tree => score += predict(tree, cand.features));
        // Score de probabilité (0-100)
        return { number: cand.number, score: Math.round((score / numTrees) * 100) };
    });

    ctx.postMessage({ type: 'result', votes: votes.sort((a: any, b: any) => b.score - a.score) });
};
