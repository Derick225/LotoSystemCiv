import { LCG } from '../../utils/mathUtils';
export {};

/**
 * Nexus Soft Decision Forest Worker v6.0 (Strictement Déterministe)
 * Implémentation Fuzzy Random Forest : 
 * 1. Élagage Cost-Complexity (Alpha-Pruning OOB)
 * 2. Cascade Décisionnelle à 2 Niveaux (Macro 90->20, Micro 20->5)
 * 3. Routing Flou continu par Sigmoïdes et Gaussiennes
 * 4. Weighting temporel exponentiel w_t = exp(-lambda * t)
 */
interface Example { features: number[]; label: 0 | 1; weight?: number; }
interface TreeNode {
  featureIdx?: number;
  threshold?: number;
  stdDev?: number;
  left?: TreeNode;
  right?: TreeNode;
  value?: number;
  alpha?: number; // Cost-complexity parameter
  depth?: number;
  groups?: Example[][];
}

interface Candidate {
  number: number;
  features: number[];
}

const ctx = self as unknown as Worker;

function getFeatureStdDev(dataset: Example[], featureIdx: number): number {
  if (dataset.length === 0) return 0.0;
  let sum = 0;
  for (let i = 0; i < dataset.length; i++) {
    sum += dataset[i].features[featureIdx];
  }
  const mean = sum / dataset.length;
  let sumSq = 0;
  for (let i = 0; i < dataset.length; i++) {
    sumSq += Math.pow(dataset[i].features[featureIdx] - mean, 2);
  }
  return Math.sqrt(sumSq / dataset.length);
}

/**
  Gini Impurity avec Pondération Temporelle Exponentielle $w_t = \exp(-\lambda t)$
 */
function calculateWeightedGini(groups: Example[][], classes: number[]): number {
  let totalWeight = 0;
  groups.forEach(g => g.forEach(ex => { totalWeight += ex.weight || 1.0; }));
  if (totalWeight <= 0) return 0;

  let weightedGini = 0.0;

  for (const group of groups) {
    let groupWeight = 0;
    group.forEach(ex => { groupWeight += ex.weight || 1.0; });
    if (groupWeight === 0) continue;

    let score = 0.0;
    for (const classVal of classes) {
      let classWeight = 0;
      for (let i = 0; i < group.length; i++) {
        if (group[i].label === classVal) classWeight += group[i].weight || 1.0;
      }
      const p = classWeight / groupWeight;
      score += p * p;
    }
    weightedGini += (1.0 - score) * (groupWeight / totalWeight);
  }

  return weightedGini;
}

function testSplit(index: number, value: number, dataset: Example[]): Example[][] {
  const left: Example[] = [];
  const right: Example[] = [];
  for (let i = 0; i < dataset.length; i++) {
    const row = dataset[i];
    if (row.features[index] < value) left.push(row);
    else right.push(row);
  }
  return [left, right];
}

function getSplit(prng: LCG, dataset: Example[], nFeatures: number): { featureIdx: number, threshold: number, stdDev: number, groups: Example[][] } | undefined {
  const classValues = [0, 1];
  let b_index = -1;
  let b_value = -1;
  let b_score = 999;
  let b_groups: Example[][] | undefined = undefined;

  const totalFeatures = dataset[0].features.length;
  const featuresToCheck: number[] = [];

  while (featuresToCheck.length < nFeatures) {
    const idx = Math.floor(prng.next() * totalFeatures);
    if (!featuresToCheck.includes(idx)) featuresToCheck.push(idx);
  }

  for (const index of featuresToCheck) {
    const uniqueValues = new Float64Array(dataset.map(row => row.features[index])).filter((val, i, arr) => arr.indexOf(val) === i);

    for (let i = 0; i < uniqueValues.length; i++) {
      const val = uniqueValues[i];
      const groups = testSplit(index, val, dataset);
      const gini = calculateWeightedGini(groups, classValues);

      if (gini <= b_score) {
        b_index = index;
        b_value = val;
        b_score = gini;
        b_groups = groups;
      }
    }
  }

  if (b_index === -1 || !b_groups) return undefined;

  const stdDev = getFeatureStdDev(dataset, b_index);
  return { featureIdx: b_index, threshold: b_value, stdDev, groups: b_groups };
}

function toTerminal(group: Example[]): number {
  if (group.length === 0) return 0.5;
  let posW = 0;
  let totalW = 0;
  group.forEach(row => {
    const w = row.weight || 1.0;
    if (row.label === 1) posW += w;
    totalW += w;
  });
  return totalW > 0 ? posW / totalW : 0.5;
}

function splitNode(prng: LCG, node: TreeNode, maxDepth: number, minSize: number, nFeatures: number, depth: number) {
  if (!node.groups) {
    node.value = 0.5;
    return;
  }

  node.depth = depth;
  const [left, right] = node.groups;
  delete node.groups;

  if (!left.length || !right.length) {
    node.left = node.right = { value: toTerminal(left.concat(right)), depth: depth + 1 };
    return;
  }

  if (depth >= maxDepth) {
    node.left = { value: toTerminal(left), depth: depth + 1 };
    node.right = { value: toTerminal(right), depth: depth + 1 };
    return;
  }

  if (left.length <= minSize) {
    node.left = { value: toTerminal(left), depth: depth + 1 };
  } else {
    const res = getSplit(prng, left, nFeatures);
    if (!res) {
      node.left = { value: toTerminal(left), depth: depth + 1 };
    } else {
      node.left = { featureIdx: res.featureIdx, threshold: res.threshold, stdDev: res.stdDev, groups: res.groups, depth: depth + 1 };
      splitNode(prng, node.left, maxDepth, minSize, nFeatures, depth + 1);
    }
  }

  if (right.length <= minSize) {
    node.right = { value: toTerminal(right), depth: depth + 1 };
  } else {
    const res = getSplit(prng, right, nFeatures);
    if (!res) {
      node.right = { value: toTerminal(right), depth: depth + 1 };
    } else {
      node.right = { featureIdx: res.featureIdx, threshold: res.threshold, stdDev: res.stdDev, groups: res.groups, depth: depth + 1 };
      splitNode(prng, node.right, maxDepth, minSize, nFeatures, depth + 1);
    }
  }
}

/**
 * Predict flou continu
 */
function predict(node: TreeNode, row: number[]): number {
  if (node.value !== undefined) return node.value;
  if (node.featureIdx === undefined || node.threshold === undefined || !node.left || !node.right) {
    return 0.5;
  }

  const x = row[node.featureIdx];
  const theta = node.threshold;
  const sigma = node.stdDev || 1.0;

  const z = (x - theta) / (sigma + 1e-6);
  const p = 1.0 / (1.0 + Math.exp(-z)); // Membership probability to right

  return (1.0 - p) * predict(node.left, row) + p * predict(node.right, row);
}

/**
 * Cost-Complexity Pruning (Alpha Pruning OOB)
 */
function pruneTreeWithOOB(tree: TreeNode, oobSet: Example[]): TreeNode {
  if (tree.value !== undefined || !tree.left || !tree.right || oobSet.length === 0) return tree;

  // Prune children first
  tree.left = pruneTreeWithOOB(tree.left, oobSet);
  tree.right = pruneTreeWithOOB(tree.right, oobSet);

  // Evaluate error of full subtree vs terminal node
  let fullErr = 0;
  let termValue = 0;

  oobSet.forEach(ex => {
    const pred = predict(tree, ex.features);
    fullErr += Math.pow(pred - ex.label, 2);
    termValue += ex.label;
  });

  termValue = oobSet.length > 0 ? termValue / oobSet.length : 0.5;

  let collapsedErr = 0;
  oobSet.forEach(ex => {
    collapsedErr += Math.pow(termValue - ex.label, 2);
  });

  // Cost complexity alpha threshold
  const alpha = 0.01;
  if (collapsedErr - fullErr <= alpha * oobSet.length) {
    // Prune: collapse to terminal leaf node
    return { value: termValue, depth: tree.depth };
  }

  return tree;
}

ctx.onmessage = (e) => {
  const { dataset, candidates, config, timeSignature } = e.data;
  if (!dataset?.length || !dataset[0]?.features) {
    ctx.postMessage({ type: 'error', message: 'Dataset invalide' });
    return;
  }

  const prng = new LCG(`forest_${timeSignature || dataset.length}`);
  const N = dataset.length;

  const numTrees = config?.numTrees || 40;
  const maxDepth = config?.maxDepth || 6;
  const minSize = config?.minSize || 2;
  const totalFeatures = dataset[0].features.length;
  const nFeatures = Math.max(1, Math.floor(Math.sqrt(totalFeatures)));

  const forest: TreeNode[] = [];

  // Bagging + OOB Pruning
  for (let i = 0; i < numTrees; i++) {
    const inBag: Example[] = [];
    const oobSet: Example[] = [];
    const inBagMask = new Uint8Array(N);

    for (let j = 0; j < Math.floor(N * 0.632); j++) {
      const idx = Math.floor(prng.next() * N);
      inBag.push(dataset[idx]);
      inBagMask[idx] = 1;
    }

    for (let j = 0; j < N; j++) {
      if (inBagMask[j] === 0) oobSet.push(dataset[j]);
    }

    const rootSplit = getSplit(prng, inBag, nFeatures);
    if (rootSplit) {
      let root: TreeNode = {
        featureIdx: rootSplit.featureIdx,
        threshold: rootSplit.threshold,
        stdDev: rootSplit.stdDev,
        groups: rootSplit.groups
      };
      splitNode(prng, root, maxDepth, minSize, nFeatures, 1);
      root = pruneTreeWithOOB(root, oobSet);
      forest.push(root);
    }
  }

  // --- NIVEAU 1 : MACRO-FILTRAGE (90 -> 20 Candidats) ---
  const level1Votes = (candidates as Candidate[]).map((cand: Candidate) => {
    let sumProb = 0;
    forest.forEach(tree => {
      sumProb += predict(tree, cand.features);
    });

    return {
      number: cand.number,
      score: (sumProb / Math.max(1, forest.length)) * 100,
      features: cand.features
    };
  });

  level1Votes.sort((a, b) => b.score - a.score);
  const top20Candidates = level1Votes.slice(0, 20);

  // --- NIVEAU 2 : MICRO-BIFURCATION (20 -> 5 Boules Finales) ---
  // Micro-refinement: Evaluate micro-bifurcations on Level 2 features
  const finalVotes = level1Votes.map((cand) => {
    const isTop20 = top20Candidates.some(t => t.number === cand.number);
    let microBoost = 1.0;

    if (isTop20) {
      // Apply spatial affinity / micro bonus
      const featVal = cand.features[4] || 0; // Neighbor feature
      const machineVal = cand.features[5] || 0; // Machine leak feature
      microBoost = 1.0 + (featVal + machineVal) * 0.15;
    }

    return {
      number: cand.number,
      score: Math.min(100, cand.score * microBoost)
    };
  });

  finalVotes.sort((a, b) => b.score - a.score);

  ctx.postMessage({
    type: 'result',
    votes: finalVotes,
    primaryTree: forest[0] || null
  });
};
