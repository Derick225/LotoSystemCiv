
import { DrawResult } from '../types';

interface TwinMatch {
    drawIndex: number;
    similarity: number;
    nextDraw: number[];
}

/**
 * Calcule la similarité entre deux séquences de tirages
 * Utilise une combinaison de Jaccard (intersection) et de distance vectorielle
 */
const calculateSequenceSimilarity = (seqA: DrawResult[], seqB: DrawResult[]): number => {
    if (seqA.length !== seqB.length) return 0;

    let totalSim = 0;
    let weightSum = 0;

    for (let i = 0; i < seqA.length; i++) {
        const setA = new Set(seqA[i].gagnants);
        const setB = new Set(seqB[i].gagnants);

        // Jaccard Index pour ce tirage
        const intersection = new Set([...setA].filter(x => setB.has(x)));
        const union = new Set([...setA, ...setB]);
        
        const jaccard = intersection.size / (union.size || 1);
        
        // Poids temporel : les tirages récents (fin de séquence) comptent plus
        const weight = 1 + (i / seqA.length); // 1.0 à 1.8
        totalSim += jaccard * weight;
        weightSum += weight;
    }
    
    return Math.min(1, totalSim / (weightSum * 0.15)); // Normalisation empirique pour booster les scores faibles
};

export const PatternMatcherService = {
    /**
     * Trouve les séquences historiques similaires aux N derniers tirages (Tirages Jumeaux)
     * @param history Historique complet
     * @param windowSize Taille de la fenêtre de comparaison (ex: 5 derniers tirages)
     * @param threshold Seuil de similarité (0-1)
     */
    findTwinDraws: (history: DrawResult[], minWindow: number = 3, maxWindow: number = 8, threshold: number = 0.4): TwinMatch[] => {
        if (history.length < maxWindow * 2) return [];

        const matches: TwinMatch[] = [];

        // Scan multiple window sizes
        for (let w = minWindow; w <= maxWindow; w++) {
            const targetSequence = history.slice(0, w).reverse(); 
            
            // On parcourt l'historique
            for (let i = w; i < history.length - w; i++) {
                const candidateSequence = history.slice(i, i + w).reverse();
                const nextDrawIndex = i - 1; 
                
                if (nextDrawIndex < 0) continue;

                let similarity = calculateSequenceSimilarity(targetSequence, candidateSequence);
                
                // Boost for longer windows (Confidence factor)
                // A match of length 8 is more significant than length 3
                const confidenceBoost = 1 + ((w - minWindow) * 0.05); 
                similarity *= confidenceBoost;

                if (similarity >= threshold) {
                    matches.push({
                        drawIndex: i,
                        similarity,
                        nextDraw: history[nextDrawIndex].gagnants
                    });
                }
            }
        }

        // Deduplicate by drawIndex (keep best score)
        const uniqueMatches = new Map<number, TwinMatch>();
        matches.forEach(m => {
            if (!uniqueMatches.has(m.drawIndex) || uniqueMatches.get(m.drawIndex)!.similarity < m.similarity) {
                uniqueMatches.set(m.drawIndex, m);
            }
        });

        return Array.from(uniqueMatches.values())
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, 20); // Top 20 matches
    },

    /**
     * Génère des scores de prédiction basés sur les tirages jumeaux
     */
    predictFromTwins: (matches: TwinMatch[]): number[] => {
        const scores = new Array(91).fill(0); // 1-90
        if (matches.length === 0) return scores;

        let maxVal = 0;

        matches.forEach(match => {
            const weight = Math.pow(match.similarity, 3); // Poids cubique pour filtrer le bruit
            match.nextDraw.forEach(num => {
                if (num >= 1 && num <= 90) {
                    scores[num] += weight;
                    if (scores[num] > maxVal) maxVal = scores[num];
                }
            });
        });

        // Normalisation 0-100
        if (maxVal > 0) {
            for (let i = 1; i <= 90; i++) {
                scores[i] = (scores[i] / maxVal) * 100;
            }
        }

        return scores;
    }
};
