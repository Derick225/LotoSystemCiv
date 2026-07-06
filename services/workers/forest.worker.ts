import { LCG } from '../../utils/mathUtils';
export {};

/**
 * Nexus Soft Decision Forest Worker v5.0 (Strictement Déterministe)
 * Implémentation Fuzzy Random Forest : Bagging + Feature Randomness + Soft Routing (Sigmoïde continue)
 * ZÉRO HASARD : Utilise exclusivement le LCG seedé de manière déterministe.
 */
interface Example { features: number[]; label: 0 | 1; }
interface TreeNode {
  featureIdx?: number;
  threshold?: number;
  stdDev?: number; // Écart-type local pour l'activation sigmoïde continue
  left?: TreeNode;
  right?: TreeNode;
  value?: number;
  groups?: Example[][];
}
interface Candidate {
  number: number;
  features: number[];
}

const ctx = self as unknown as Worker;

/**
 * Calcule l'écart-type d'un ensemble de valeurs de features pour un index donné.
 * Protection contre les divisions par zéro.
 */
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
 * Calcule l'indice de Gini pondéré pour un split donné.
 * Gini = 1 - sum(p_i^2)
 * Weighted Gini = sum((n_group / n_total) * Gini_group)
 */
function calculateGini(groups: Example[][], classes: number[]): number {
  const totalSamples = groups[0].length + groups[1].length;
  let gini = 0.0;
  
  for (const group of groups) {
    const size = group.length;
    if (size === 0) continue;
    
    let score = 0.0;
    for (const classVal of classes) {
      let count = 0;
      for (let i = 0; i < size; i++) {
        if (group[i].label === classVal) count++;
      }
      const p = count / size;
      score += p * p;
    }
    gini += (1.0 - score) * (size / totalSamples);
  }
  return gini;
}

/**
 * Divise le dataset en deux groupes basés sur une feature et un seuil.
 */
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

/**
 * Sélectionne le meilleur split pour un dataset donné.
 * Optimisation Random Forest : ne teste qu'un sous-ensemble aléatoire de features.
 * Optimisation supplémentaire : ne teste que les valeurs uniques de chaque feature.
 */
function getSplit(prng: LCG, dataset: Example[], nFeatures: number): { featureIdx: number, threshold: number, stdDev: number, groups: Example[][] } | undefined {
  const classValues = [0, 1];
  let b_index = -1;
  let b_value = -1;
  let b_score = 999;
  let b_groups: Example[][] | undefined = undefined;
  
  const totalFeatures = dataset[0].features.length;
  const featuresToCheck: number[] = [];
  
  // Sélection déterministe de features via LCG (Feature Subsampling)
  while (featuresToCheck.length < nFeatures) {
    const idx = Math.floor(prng.next() * totalFeatures);
    if (!featuresToCheck.includes(idx)) featuresToCheck.push(idx);
  }

  for (const index of featuresToCheck) {
    // Collecte des valeurs uniques pour éviter les tests de splits redondants
    const uniqueValues = new Float64Array(dataset.map(row => row.features[index])).filter((val, i, arr) => arr.indexOf(val) === i);
    
    for (let i = 0; i < uniqueValues.length; i++) {
      const val = uniqueValues[i];
      const groups = testSplit(index, val, dataset);
      const gini = calculateGini(groups, classValues);
      
      // Utilisation de <= pour garantir un comportement déterministe en cas d'égalité de Gini
      if (gini <= b_score) {
        b_index = index;
        b_value = val;
        b_score = gini;
        b_groups = groups;
      }
    }
  }
  
  if (b_index === -1 || !b_groups) return undefined;
  
  // Calcul de l'écart-type local pour l'index choisi
  const stdDev = getFeatureStdDev(dataset, b_index);
  
  return { featureIdx: b_index, threshold: b_value, stdDev, groups: b_groups };
}

/**
 * Calcule la valeur terminale (feuille) : Probabilité d'appartenance à la classe 1.
 */
function toTerminal(group: Example[]): number {
  if (group.length === 0) return 0.5; // Fallback neutre
  const pos = group.reduce((acc, row) => acc + row.label, 0);
  return pos / group.length;
}

/**
 * Construit l'arbre de manière récursive.
 */
function split(prng: LCG, node: TreeNode, maxDepth: number, minSize: number, nFeatures: number, depth: number) {
  if (!node.groups) {
    node.value = 0.5;
    return;
  }
  
  const [left, right] = node.groups;
  delete node.groups; // Libère la mémoire immédiatement

  // Cas terminal : un des groupes est vide
  if (!left.length || !right.length) {
    node.left = node.right = { value: toTerminal(left.concat(right)) };
    return;
  }
  
  // Cas terminal : Profondeur max atteinte
  if (depth >= maxDepth) {
    node.left = { value: toTerminal(left) };
    node.right = { value: toTerminal(right) };
    return;
  }

  // Traitement Enfant Gauche
  if (left.length <= minSize) {
    node.left = { value: toTerminal(left) };
  } else {
    const res = getSplit(prng, left, nFeatures);
    if (!res) {
      node.left = { value: toTerminal(left) };
    } else {
      node.left = { featureIdx: res.featureIdx, threshold: res.threshold, stdDev: res.stdDev, groups: res.groups };
      split(prng, node.left, maxDepth, minSize, nFeatures, depth + 1);
    }
  }

  // Traitement Enfant Droit
  if (right.length <= minSize) {
    node.right = { value: toTerminal(right) };
  } else {
    const res = getSplit(prng, right, nFeatures);
    if (!res) {
      node.right = { value: toTerminal(right) };
    } else {
      node.right = { featureIdx: res.featureIdx, threshold: res.threshold, stdDev: res.stdDev, groups: res.groups };
      split(prng, node.right, maxDepth, minSize, nFeatures, depth + 1);
    }
  }
}

/**
 * Prédit une valeur pour une ligne donnée en parcourant l'arbre de manière douce (Soft/Fuzzy Routing).
 * ZÉRO BIFURCATION SÈCHE : Évite les sauts brusques en acheminant continûment l'exemple vers
 * les deux sous-arbres selon une probabilité logistique continue (Sigmoïde).
 */
function predict(node: TreeNode, row: number[]): number {
  if (node.value !== undefined) return node.value;
  
  // Protection contre les arbres mal formés
  if (node.featureIdx === undefined || node.threshold === undefined || !node.left || !node.right) {
    return 0.5;
  }
  
  const x = row[node.featureIdx];
  const theta = node.threshold;
  const sigma = node.stdDev || 1.0;
  
  // Différence normalisée par l'écart-type local (Z-score)
  // Prévient les divisions par zéro via epsilon
  const z = (x - theta) / (sigma + 1e-6);
  
  // Fonction de transition sigmoïde continue (Soft routing probability to right child)
  const p = 1.0 / (1.0 + Math.exp(-z));
  
  // Inférence continue : somme pondérée des prédictions des deux branches
  return (1.0 - p) * predict(node.left, row) + p * predict(node.right, row);
}

ctx.onmessage = (e) => {
  const { dataset, candidates, config, timeSignature } = e.data;
  if (!dataset?.length || !dataset[0]?.features) {
    ctx.postMessage({ type: 'error', message: 'Dataset invalide' });
    return;
  }

  // PRNG isolé selon la profondeur de l'historique
  const prng = new LCG(`forest_${timeSignature || dataset.length}`);

  const N = dataset.length;
  
  // Zéro Nombre Magique : Fallbacks dérivés de la théorie de l'apprentissage statistique
  const numTrees = config?.numTrees || Math.min(100, Math.max(20, Math.floor(Math.sqrt(N) * 5)));
  const maxDepth = config?.maxDepth || Math.max(3, Math.floor(Math.log2(N)));
  const minSize = config?.minSize || Math.max(2, Math.floor(Math.sqrt(N)));
  
  const totalFeatures = dataset[0].features.length;
  const nFeatures = Math.max(1, Math.floor(Math.sqrt(totalFeatures))); // Empirique de Breiman

  const forest: TreeNode[] = [];
  const sampleSizeRatio = 1.0 - (1.0 / Math.E); // Fraction Out-Of-Bag théorique exacte (~63.2%)
  const sampleSize = Math.max(2, Math.floor(N * sampleSizeRatio));

  // Construction de la forêt (Bagging Déterministe)
  for (let i = 0; i < numTrees; i++) {
    const sample: Example[] = [];
    for (let j = 0; j < sampleSize; j++) {
      sample.push(dataset[Math.floor(prng.next() * N)]);
    }

    const rootSplit = getSplit(prng, sample, nFeatures);
    if (rootSplit) {
      const root: TreeNode = { 
        featureIdx: rootSplit.featureIdx, 
        threshold: rootSplit.threshold, 
        stdDev: rootSplit.stdDev,
        groups: rootSplit.groups 
      };
      split(prng, root, maxDepth, minSize, nFeatures, 1);
      forest.push(root);
    }
  }

  // Prédiction (Aggrégation des votes)
  const votes = (candidates as Candidate[]).map((cand: Candidate) => {
    let sumProb = 0;
    forest.forEach(tree => {
      sumProb += predict(tree, cand.features);
    });
    
    return { 
      number: cand.number, 
      score: (sumProb / forest.length) * 100 
    };
  });

  // Tri 100% déterministe : Score décroissant, puis Numéro croissant en cas d'égalité parfaite
  ctx.postMessage({ 
    type: 'result', 
    votes: votes.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.number - b.number;
    }) 
  });
};
