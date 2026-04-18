import { secureRandom } from '../../utils/secureRandom';

export {};

/**
 * Nexus Decision Forest Worker v4.5 (Optimized)
 * Implémentation Random Forest : Bagging + Feature Randomness + CART
 */

interface Example { features: number[]; label: 0 | 1; }
interface Node { 
    featureIdx?: number; 
    threshold?: number; 
    left?: Node; 
    right?: Node; 
    value?: number; 
}

const ctx = self as unknown as Worker;

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
            for(let i=0; i<size; i++) {
                if(group[i].label === classVal) count++;
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
 */
function getSplit(dataset: Example[], nFeatures: number): { featureIdx: number, threshold: number, groups: Example[][] } | undefined {
    const classValues = [0, 1];
    let b_index = 999, b_value = 999, b_score = 999, b_groups: Example[][] | undefined = undefined;
    
    const totalFeatures = dataset[0].features.length;
    const featuresToCheck: number[] = [];
    
    // Sélection aléatoire de features (Feature Subsampling)
    while (featuresToCheck.length < nFeatures) {
        const idx = Math.floor(secureRandom() * totalFeatures);
        if (!featuresToCheck.includes(idx)) featuresToCheck.push(idx);
    }

    for (const index of featuresToCheck) {
        for (let i = 0; i < dataset.length; i++) {
            const row = dataset[i];
            const groups = testSplit(index, row.features[index], dataset);
            const gini = calculateGini(groups, classValues);
            
            if (gini < b_score) {
                b_index = index;
                b_value = row.features[index];
                b_score = gini;
                b_groups = groups;
            }
        }
    }

    if (!b_groups) return undefined;
    
    return { featureIdx: b_index, threshold: b_value, groups: b_groups };
}

/**
 * Calcule la valeur terminale (feuille) : Classe majoritaire ou probabilité.
 */
function toTerminal(group: Example[]): number {
    if (group.length === 0) return 0;
    const pos = group.reduce((acc, row) => acc + row.label, 0);
    // Retourne la probabilité d'être 1 (pour scoring fin) plutôt que 0/1 binaire
    // Cela permet un classement plus précis des candidats
    return pos / group.length; 
}

/**
 * Construit l'arbre de manière récursive.
 */
function split(node: any, maxDepth: number, minSize: number, nFeatures: number, depth: number) {
    if (!node.groups) {
        node.value = 0.5; // Fallback safe
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
        const res = getSplit(left, nFeatures);
        if (!res) {
            node.left = { value: toTerminal(left) };
        } else {
            node.left = { featureIdx: res.featureIdx, threshold: res.threshold, groups: res.groups };
            split(node.left, maxDepth, minSize, nFeatures, depth + 1);
        }
    }

    // Traitement Enfant Droit
    if (right.length <= minSize) {
        node.right = { value: toTerminal(right) };
    } else {
        const res = getSplit(right, nFeatures);
        if (!res) {
            node.right = { value: toTerminal(right) };
        } else {
            node.right = { featureIdx: res.featureIdx, threshold: res.threshold, groups: res.groups };
            split(node.right, maxDepth, minSize, nFeatures, depth + 1);
        }
    }
}

/**
 * Predit une valeur pour une ligne donnée en parcourant l'arbre.
 */
function predict(node: Node, row: number[]): number {
    if (node.value !== undefined) return node.value;
    
    // Protection contre les arbres mal formés
    if (node.featureIdx === undefined || node.threshold === undefined || !node.left || !node.right) {
        return 0.5;
    }

    if (row[node.featureIdx] < node.threshold) {
        return predict(node.left, row);
    } else {
        return predict(node.right, row);
    }
}

ctx.onmessage = (e) => {
    const { dataset, candidates, config } = e.data;
    if (!dataset?.length || !dataset[0]?.features) {
        ctx.postMessage({ type: 'error', message: 'Dataset invalide' });
        return;
    }

    const numTrees = config?.numTrees || 50;
    const maxDepth = config?.maxDepth || 8;
    const minSize = config?.minSize || 4; // Min samples split
    
    // Nombre de features à tester à chaque split (sqrt(total_features))
    const totalFeatures = dataset[0].features.length;
    const nFeatures = Math.max(1, Math.floor(Math.sqrt(totalFeatures)));

    const forest: Node[] = [];

    // Construction de la forêt (Bagging)
    for (let i = 0; i < numTrees; i++) {
        // Bootstrap Sample (Tirage avec remise)
        const sample: Example[] = [];
        const sampleSize = Math.round(dataset.length * 0.8); // 80% du dataset pour variété
        for (let j = 0; j < sampleSize; j++) {
            sample.push(dataset[Math.floor(secureRandom() * dataset.length)]);
        }

        const rootSplit = getSplit(sample, nFeatures);
        if (rootSplit) {
            const root: any = { 
                featureIdx: rootSplit.featureIdx, 
                threshold: rootSplit.threshold, 
                groups: rootSplit.groups 
            };
            split(root, maxDepth, minSize, nFeatures, 1);
            forest.push(root);
        }
    }

    // Prédiction (Aggregation des votes)
    const votes = candidates.map((cand: any) => {
        let sumProb = 0;
        forest.forEach(tree => {
            sumProb += predict(tree, cand.features);
        });
        
        // Moyenne des probabilités de la forêt
        return { 
            number: cand.number, 
            score: (sumProb / forest.length) * 100 
        };
    });

    ctx.postMessage({ type: 'result', votes: votes.sort((a: any, b: any) => b.score - a.score) });
};