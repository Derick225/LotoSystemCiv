import type { DrawResult, ForestVote, DecisionNode } from '../types';

export const FEATURES_LABELS = [
    'Critical Gap', 'Frequency', 'Shadow', 
    'Consensus Trap', 'Neighbor', 'Machine Leak', 'Norm Gap'
];

// Cache pour stocker la map de consensus associée à une référence d'historique spécifique
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
    if (results.length < 5) return new Array(activeIndices.length).fill(0);
    if (num < 1 || num > 90) return new Array(activeIndices.length).fill(0);

    const recent20 = results.slice(0, 20);
    const lastDraw = results[0];
    
    // Optimisation : Utilisation de Set pour recherche O(1) sur le dernier tirage
    const lastDrawWinners = new Set(lastDraw.gagnants);
    const lastDrawMachine = new Set(lastDraw.machine || []);

    // 1. Fréquence amortie sur 20 derniers tirages (Boucle simple au lieu de filter)
    let rawFreq20 = 0;
    for (const r of recent20) {
        if (r.gagnants.includes(num)) rawFreq20++;
    }
    const freqSignal = rawFreq20 >= 3 ? 1 : (rawFreq20 / 3);

    // 2. Consensus
    const consensus = globalConsensusMap[num] || 0;

    // 3. Calcul du Gap (Écart)
    let gap = 0;
    for (let i = 0; i < results.length; i++) {
        if (results[i].gagnants.includes(num)) {
            gap = i;
            break;
        }
        // Si on atteint la fin sans trouver, le gap est la longueur max
        if (i === results.length - 1) gap = results.length;
    }

    // Construction du vecteur de features
    // Feature 0: Critical Gap (Zone de retour probable entre 8 et 18)
    // Feature 1: Frequency Signal
    // Feature 2: Shadow (Fréquence faible mais présente récemment)
    // Feature 3: Consensus Trap (Trop populaire)
    // Feature 4: Neighbor (Voisin du dernier tirage +/- 1)
    // Feature 5: Machine Leak (Présent dans la machine précédente)
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

    // Filtrage selon les features actives demandées
    return activeIndices.map(idx => allFeatures[idx]);
};

/**
 * Exécute une forêt d'arbres décisionnels (Random Forest) via un Worker.
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
    // Gestion d'erreurs basique
    if (!history || history.length < 40) {
        console.warn("Historique insuffisant pour Decision Forest (Min 40).");
        return { votes: [], dataset: [] };
    }

    const activeIndices = activeFeatures.map(label => FEATURES_LABELS.indexOf(label)).filter(idx => idx !== -1);
    if (activeIndices.length === 0) return { votes: [], dataset: [] };

    // Gestion du cache pour le consensus map
    let consensusMap = consensusCache.get(history);
    if (!consensusMap) {
        consensusMap = {};
        const slice50 = history.slice(0, 50);
        for (let i = 1; i <= 90; i++) {
            let freq = 0;
            for(const r of slice50) {
                if(r.gagnants.includes(i)) freq++;
            }
            consensusMap[i] = (freq / 5) * 100; // Normalisation approximative
        }
        consensusCache.set(history, consensusMap);
    }

    // Préparation du Dataset d'entraînement
    // Label 1 = Le numéro est sorti
    // Label 0 = Le numéro n'est pas sorti (échantillonnage négatif)
    const dataset: { features: number[], label: 0 | 1 }[] = [];
    const trainingSlice = history.slice(0, 50);

    for (let idx = 0; idx < trainingSlice.length; idx++) {
        const target = trainingSlice[idx];
        const context = history.slice(idx + 1);
        
        // On a besoin d'un contexte suffisant pour calculer les features
        if (context.length < 25) continue;

        const winners = target.gagnants;
        
        // Exemples Positifs
        for (const n of winners) {
            dataset.push({ 
                features: extractNumericFeatures(n, context, consensusMap, activeIndices), 
                label: 1 
            });
        }

        // Exemples Négatifs (Ratio 1:1 pour équilibrer les classes)
        let negativesCount = 0;
        const winnerSet = new Set(winners);
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
    const candidates = Array.from({ length: 90 }, (_, i) => {
        const num = i + 1;
        return {
            number: num,
            features: extractNumericFeatures(num, history, consensusMap!, activeIndices)
        };
    });

    return new Promise((resolve, reject) => {
        const worker = new Worker(new URL('./workers/forest.worker.ts', import.meta.url), { type: 'module' });
        
        worker.onmessage = (e) => {
            const { votes } = e.data;
            worker.terminate();
            
            const finalVotes: ForestVote[] = votes.map((v: any) => ({
                candidate: v.number,
                score: Math.round(v.score),
                votes: { temporal: 0, spatial: 0, structural: 0 },
                decisionPath: { id: 'root', type: 'condition', label: 'Forest Consensus', children: [] } as DecisionNode,
                features: { isConsensusTrap: v.score > 85 }
            }));

            let filtered: ForestVote[] = [];

            if (mode === 'consensus') {
                // Les favoris > 60%
                filtered = finalVotes.filter(v => v.score >= 60);
            } else if (mode === 'average') {
                // Zone de stabilité (40-60%)
                filtered = finalVotes.filter(v => v.score >= 40 && v.score < 60);
            } else {
                // Outsiders (15-40%)
                filtered = finalVotes.filter(v => v.score > 15 && v.score < 40);
            }
            
            resolve({ votes: filtered.sort((a, b) => b.score - a.score).slice(0, 20), dataset });
        };

        worker.onerror = (err) => { 
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
 * 
 * @param dataset - Le jeu de données utilisé pour l'entraînement.
 * @param activeFeatures - Les labels des features.
 * @returns Un objet mappant chaque feature à son score d'importance (0-100).
 */
export const calculateFeatureImportance = (dataset: any[], activeFeatures: string[]): Record<string, number> => {
    if (!dataset || dataset.length === 0) return {};
    
    const importance: Record<string, number> = {};
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
        
        // Protection division par zéro
        const correlation = denominator === 0 ? 0 : Math.abs(numerator / denominator);
        
        importance[label] = Math.round(correlation * 100);
    });

    return importance;
};