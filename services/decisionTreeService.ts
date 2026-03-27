
import type { DrawResult, ForestVote, DecisionNode } from '../types';

export const FEATURES_LABELS = [
    'Critical Gap', 'Frequency', 'Shadow', 
    'Consensus Trap', 'Neighbor', 'Machine Leak', 'Norm Gap'
];

// Cache pour stocker la map de consensus associée à une référence d'historique spécifique
// WeakMap permet au Garbage Collector de nettoyer si l'historique n'est plus utilisé ailleurs
const consensusCache = new WeakMap<DrawResult[], Record<number, number>>();

/**
 * Extrait les caractéristiques numériques pour un numéro donné basé sur l'historique.
 * Optimisé pour utiliser des Sets et éviter les itérations excessives.
 * 
 * @param num - Le numéro à analyser (1-90).
 * @param results - L'historique des tirages (slice).
 * @param globalConsensusMap - Map de fréquence globale pré-calculée.
 * @param activeIndices - Indices des features actives.
 * @returns Un tableau de nombres représentant les features.
 */
const extractNumericFeatures = (
    num: number, 
    results: DrawResult[], 
    globalConsensusMap: Record<number, number>, 
    activeIndices: number[]
): number[] => {
    // Sanity checks rapides
    if (results.length < 5) return new Array(activeIndices.length).fill(0);
    if (num < 1 || num > 90) return new Array(activeIndices.length).fill(0);

    // Optimisation : On évite de recréer ces sets à chaque itération si possible, 
    // mais ici c'est nécessaire car results[0] change lors du sliding window du training.
    const lastDraw = results[0];
    const lastDrawWinners = new Set(lastDraw.gagnants);
    const lastDrawMachine = new Set(lastDraw.machine || []);

    // 1. Fréquence amortie sur 20 derniers tirages (Boucle simple au lieu de .filter().length pour perf)
    let rawFreq20 = 0;
    const limitFreq = Math.min(results.length, 20);
    for (let i = 0; i < limitFreq; i++) {
        if (results[i].gagnants.includes(num)) rawFreq20++;
    }
    const freqSignal = rawFreq20 >= 3 ? 1 : (rawFreq20 / 3);

    // 2. Consensus (Lecture O(1))
    const consensus = globalConsensusMap[num] || 0;

    // 3. Calcul du Gap (Écart)
    // On s'arrête dès qu'on trouve le numéro (optimisation temporelle)
    let gap = 0;
    const maxLen = results.length;
    let found = false;
    for (let i = 0; i < maxLen; i++) {
        if (results[i].gagnants.includes(num)) {
            gap = i;
            found = true;
            break;
        }
    }
    if (!found) gap = maxLen;

    // Construction du vecteur de features
    // Feature 0: Critical Gap (Zone de retour probable entre 8 et 18)
    // Feature 1: Frequency Signal
    // Feature 2: Shadow (Fréquence faible mais présente récemment)
    // Feature 3: Consensus Trap (Trop populaire)
    // Feature 4: Neighbor (Voisin du dernier tirage +/- 1) - Optimisé avec Set.has
    // Feature 5: Machine Leak (Présent dans la machine précédente) - Optimisé avec Set.has
    // Feature 6: Norm Gap (Écart normalisé)

    const allFeatures = [
        (gap >= 8 && gap <= 18) ? 1 : 0,
        freqSignal,
        (consensus < 40 && rawFreq20 >= 1) ? 1 : 0,
        consensus > 85 ? 1 : 0,
        (lastDrawWinners.has(num - 1) || lastDrawWinners.has(num + 1)) ? 1 : 0,
        lastDrawMachine.has(num) ? 1 : 0,
        Math.min(1, gap / 50)
    ];

    // Filtrage dynamique selon les features actives demandées
    // Utilisation d'une boucle simple map pour la performance sur petit tableau
    return activeIndices.map(idx => allFeatures[idx]);
};

/**
 * Exécute une forêt d'arbres décisionnels (Random Forest) via un Worker.
 * Prépare le dataset d'entrainement et lance le calcul asynchrone.
 * 
 * @param history - Historique complet des tirages.
 * @param mode - Mode de filtrage des résultats ('consensus', 'average', 'shadow').
 * @param activeFeatures - Liste des labels de features à utiliser.
 * @returns Une promesse contenant les votes agrégés et le dataset d'entraînement.
 */
export const runDecisionForest = async (
    history: DrawResult[], 
    mode: 'consensus' | 'average' | 'shadow' = 'consensus', 
    activeFeatures: string[] = FEATURES_LABELS
): Promise<{ votes: ForestVote[], dataset: any[] }> => {
    
    if (!history || history.length < 40) {
        console.warn("Historique insuffisant pour Decision Forest (Min 40).");
        return { votes: [], dataset: [] };
    }

    // Mapping des indices actifs
    const activeIndices = activeFeatures.map(label => FEATURES_LABELS.indexOf(label)).filter(idx => idx !== -1);
    if (activeIndices.length === 0) return { votes: [], dataset: [] };

    // Gestion du cache pour le consensus map via WeakMap
    let consensusMap = consensusCache.get(history);
    if (!consensusMap) {
        consensusMap = {};
        const slice50 = history.slice(0, 50);
        // Calcul optimisé de la fréquence globale
        for (let i = 1; i <= 90; i++) {
            let freq = 0;
            for(const r of slice50) {
                if(r.gagnants.includes(i)) freq++;
            }
            consensusMap[i] = (freq / 5) * 100; // Normalisation approximative
        }
        consensusCache.set(history, consensusMap);
    }

    // Préparation du Dataset d'entraînement (Sliding Window)
    // Label 1 = Le numéro est sorti au tirage T
    // Label 0 = Le numéro n'est pas sorti (échantillonnage négatif)
    const dataset: { features: number[], label: 0 | 1 }[] = [];
    const trainingSlice = history.slice(0, 50); // On s'entraine sur les 50 derniers tirages

    for (let idx = 0; idx < trainingSlice.length; idx++) {
        const target = trainingSlice[idx];
        const context = history.slice(idx + 1);
        
        // On a besoin d'un contexte suffisant pour calculer les features (gap, freq...)
        if (context.length < 25) continue;

        const winners = target.gagnants;
        const winnerSet = new Set(winners);
        
        // Exemples Positifs (Ceux qui sont sortis)
        for (const n of winners) {
            dataset.push({ 
                features: extractNumericFeatures(n, context, consensusMap, activeIndices), 
                label: 1 
            });
        }

        // Exemples Négatifs (Ratio 1:1 pour équilibrer les classes)
        // On choisit aléatoirement des numéros perdants pour éviter le biais
        let negativesCount = 0;
        while (negativesCount < winners.length) {
            const rnd = Math.floor(Math.random() * 90) + 1;
            if (!winnerSet.has(rnd)) {
                dataset.push({ 
                    features: extractNumericFeatures(rnd, context, consensusMap, activeIndices), 
                    label: 0 
                });
                negativesCount++;
            }
        }
    }

    // Préparation des candidats pour la prédiction (T+1)
    // On calcule les features basées sur l'historique complet actuel (T=0)
    const candidates = Array.from({ length: 90 }, (_, i) => {
        const num = i + 1;
        return {
            number: num,
            features: extractNumericFeatures(num, history, consensusMap!, activeIndices)
        };
    });

    // Délégation au Web Worker
    return new Promise((resolve, reject) => {
        const worker = new Worker(new URL('./workers/forest.worker.ts', import.meta.url), { type: 'module' });
        
        const timeout = setTimeout(() => {
            console.warn("Decision Forest Worker timed out");
            worker.terminate();
            resolve({ votes: [], dataset });
        }, 120000); // 120s timeout

        worker.onmessage = (e) => {
            clearTimeout(timeout);
            const { votes } = e.data;
            worker.terminate();
            
            if (!votes) {
                resolve({ votes: [], dataset });
                return;
            }

            // Transformation des résultats bruts en objets ForestVote
            const finalVotes: ForestVote[] = votes.map((v: any) => ({
                candidate: v.number,
                score: Math.round(v.score),
                votes: { temporal: 0, spatial: 0, structural: 0 },
                decisionPath: { id: 'root', type: 'condition', label: 'Forest Consensus', children: [] } as DecisionNode,
                features: { isConsensusTrap: v.score > 85 }
            }));

            // Filtrage selon le mode demandé
            let filtered: ForestVote[] = [];
            if (mode === 'consensus') {
                // Les favoris > 60%
                filtered = finalVotes.filter(v => v.score >= 60);
            } else if (mode === 'average') {
                // Zone de stabilité (40-60%)
                filtered = finalVotes.filter(v => v.score >= 40 && v.score < 60);
            } else {
                // Outsiders (15-40%) - Potentiel de surprise
                filtered = finalVotes.filter(v => v.score > 15 && v.score < 40);
            }
            
            resolve({ votes: filtered.sort((a, b) => b.score - a.score).slice(0, 20), dataset });
        };

        worker.onerror = (err) => { 
            clearTimeout(timeout);
            worker.terminate(); 
            console.error("Decision Forest Worker Error", err);
            reject(new Error("Echec du calcul Forest Worker")); 
        };

        // Configuration de la forêt : 80 arbres, profondeur max 6
        worker.postMessage({ dataset, candidates, config: { numTrees: 80, maxDepth: 6 } });
    });
};

/**
 * Calcule l'importance des features en utilisant le coefficient de corrélation de Pearson.
 * r = Σ((x - mx)(y - my)) / sqrt(Σ(x - mx)^2 * Σ(y - my)^2)
 * Utilise une Map pour retourner les résultats.
 * 
 * @param dataset - Le jeu de données utilisé pour l'entraînement.
 * @param activeFeatures - Les labels des features.
 * @returns Une Map associant chaque feature à son score d'importance (0-100).
 */
export const calculateFeatureImportance = (
    dataset: any[], 
    activeFeatures: string[]
): Map<string, number> => {
    const importanceMap = new Map<string, number>();

    if (!dataset || dataset.length === 0) return importanceMap;
    
    const n = dataset.length;
    
    // Calcul de la moyenne de Y (Label)
    const meanY = dataset.reduce((acc, d) => acc + d.label, 0) / n;

    // Calcul pour chaque feature X
    activeFeatures.forEach((label, featureIndex) => {
        // 1. Calcul moyenne X
        const meanX = dataset.reduce((acc, d) => acc + d.features[featureIndex], 0) / n;
        
        let numerator = 0;
        let denominatorX = 0;
        let denominatorY = 0;

        for (const d of dataset) {
            const x = d.features[featureIndex];
            const y = d.label;
            
            const diffX = x - meanX;
            const diffY = y - meanY;

            numerator += diffX * diffY;
            denominatorX += diffX * diffX;
            denominatorY += diffY * diffY;
        }

        const denominator = Math.sqrt(denominatorX * denominatorY);
        
        // Protection division par zéro et valeur absolue pour la force de corrélation
        const correlation = denominator === 0 ? 0 : Math.abs(numerator / denominator);
        
        importanceMap.set(label, Math.round(correlation * 100));
    });

    return importanceMap;
};
