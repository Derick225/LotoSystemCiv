
import { DrawResult, AntColonyPath, OracleVocalContext } from '../types';
import { secureRandom } from '../utils/secureRandom';


/**
 * Service ACO (Ant Colony Optimization) - Interface Client v2.0
 * Gère le cycle de vie du Worker, la diversification post-traitement et l'injection de biais.
 */

// Configuration par défaut
const DEFAULT_TIMEOUT = 8000;
const MAX_VARIATIONS = 4;

/**
 * Exécute l'optimisation par colonie de fourmis avec gestion de timeout et contexte vocal.
 */
export const runAntColonyOptimization = async (
    history: DrawResult[], 
    vocalContext?: OracleVocalContext | null,
    timeoutMs: number = DEFAULT_TIMEOUT
): Promise<AntColonyPath[]> => {
    // Besoin d'un minimum d'historique pour construire le graphe heuristique
    if (!history || history.length < 15) return fallbackHeuristic(history);

    return new Promise((resolve) => {
        const worker = new Worker(new URL('./workers/aco.worker.ts', import.meta.url), { type: 'module' });
        
        // Sécurité : Timeout configurable côté client
        const timeout = setTimeout(() => {
            worker.terminate();
            console.warn(`ACO Worker Timeout (${timeoutMs}ms) - Fallback Heuristic triggered`);
            resolve(fallbackHeuristic(history));
        }, timeoutMs);

        worker.onmessage = (e) => {
            const { type, bestPath, error } = e.data;
            
            if (type === 'result') {
                clearTimeout(timeout);
                worker.terminate();
                
                if (bestPath && Array.isArray(bestPath.numbers) && bestPath.numbers.length === 5) {
                    // Génération de variations stratégiques autour du meilleur chemin
                    // On passe l'historique pour calculer les mutations de gaps
                    const variations = generateVariations(bestPath.numbers, history, vocalContext);
                    
                    // Construction du résultat final : Best Path + Variations
                    // Le bestPath du worker reçoit un boost de confiance s'il matche l'Oracle
                    const isOracle = vocalContext?.targets?.some(t => bestPath.numbers.includes(t));
                    const optimizedBestPath: AntColonyPath = {
                        ...bestPath,
                        isOracleBiased: isOracle,
                        confidence: isOracle ? Math.min(99, bestPath.confidence + 10) : bestPath.confidence
                    };

                    resolve([optimizedBestPath, ...variations]);
                } else {
                    resolve(fallbackHeuristic(history));
                }
            } else if (error) {
                clearTimeout(timeout);
                worker.terminate();
                console.error("ACO Worker Error:", error);
                resolve(fallbackHeuristic(history));
            }
        };

        // Extraction des cibles Oracle pour le biais initial (Pheromone seeding)
        const oracleTargets = vocalContext?.targets || [];

        // Configuration ACS (Ant Colony System) envoyée au worker
        worker.postMessage({ 
            history: history.map(h => ({ gagnants: h.gagnants })),
            config: { 
                antsCount: 60,    // Augmentation légère pour plus d'exploration
                generations: 120, 
                alpha: 1.2,       // Poids Phéromone légèrement augmenté
                beta: 2.8,        // Poids Heuristique
                rho: 0.1,         // Évaporation Globale
                q0: 0.85,         // Facteur d'exploitation
                biasTargets: oracleTargets // Nouveau : Cibles à privilégier dans le graphe
            }
        });
    });
};

/**
 * Génère des variations intelligentes basées sur le meilleur chemin trouvé.
 * Intègre : Biais Oracle, Mutations de Voisinage, Mutations de Gaps (Écarts).
 */
const generateVariations = (
    base: number[], 
    history: DrawResult[],
    vocalContext?: OracleVocalContext | null
): AntColonyPath[] => {
    const variations: AntColonyPath[] = [];
    const oracleTargets = vocalContext?.targets || [];
    
    // Set pour éviter les duplications (normalisation string "1-2-3-4-5")
    const seenTickets = new Set<string>();
    seenTickets.add([...base].sort((a,b)=>a-b).join('-'));

    // Pré-calcul simple des écarts actuels pour la mutation "Gap"
    const currentGaps = new Map<number, number>();
    if (history.length > 0) {
        for (let i = 1; i <= 90; i++) {
            let gap = 0;
            for (const draw of history) {
                if (draw.gagnants.includes(i)) break;
                gap++;
            }
            currentGaps.set(i, gap);
        }
    }

    let attempts = 0;
    const maxAttempts = 30;

    while (variations.length < MAX_VARIATIONS && attempts < maxAttempts) {
        attempts++;
        const variant = [...base];
        
        // Décision : Combien de mutations ? (1 ou 2 gènes)
        const mutationsCount = secureRandom() > 0.7 ? 2 : 1;
        const indicesToChange = Array.from({length: 5}, (_, i) => i)
                                     .sort(() => 0.5 - secureRandom())
                                     .slice(0, mutationsCount);

        for (const idx of indicesToChange) {
            const originalVal = variant[idx];
            let newVal = originalVal;
            const mutationType = secureRandom();

            // A. Injection Oracle (Priorité Absolue)
            // Si le contexte vocal contient des cibles non utilisées, on les force avec une forte probabilité
            const unusedOracle = oracleTargets.filter(t => !variant.includes(t));
            if (unusedOracle.length > 0 && secureRandom() < 0.6) {
                newVal = unusedOracle[Math.floor(secureRandom() * unusedOracle.length)];
            } 
            
            // B. Mutation "Gap Balancing" (Écart)
            // Remplace un numéro par un autre ayant un écart similaire (+/- 2)
            else if (mutationType < 0.4 && currentGaps.size > 0) {
                const originalGap = currentGaps.get(originalVal) || 0;
                // Trouver des candidats avec un gap proche
                const gapCandidates = Array.from(currentGaps.entries())
                    .filter(([n, g]) => n !== originalVal && Math.abs(g - originalGap) <= 2 && !variant.includes(n))
                    .map(e => e[0]);
                
                if (gapCandidates.length > 0) {
                    newVal = gapCandidates[Math.floor(secureRandom() * gapCandidates.length)];
                }
            }

            // C. Mutation Voisinage (±1, ±2)
            else if (mutationType < 0.7) {
                const shift = (secureRandom() > 0.5 ? 1 : -1) * (secureRandom() > 0.8 ? 2 : 1);
                newVal = originalVal + shift;
            } 
            
            // D. Mutation Miroir (91 - n)
            else {
                newVal = 91 - originalVal;
            }

            // Correction des bornes [1, 90]
            if (newVal < 1) newVal = 90 + (newVal % 90); 
            if (newVal > 90) newVal = newVal % 90 || 90;
            if (newVal === 0) newVal = 90;

            // Vérification doublon interne au ticket
            if (!variant.includes(newVal)) {
                variant[idx] = newVal;
            }
        }

        const sortedVariant = variant.sort((a, b) => a - b);
        const signature = sortedVariant.join('-');

        // Vérification doublon global (vs autres tickets générés)
        if (!seenTickets.has(signature)) {
            seenTickets.add(signature);
            
            // Calcul confiance dynamique
            const isOracleBiased = oracleTargets.some(t => sortedVariant.includes(t));
            
            // La confiance diminue légèrement pour les variations, mais remonte si Oracle présent
            let confidence = 85 - (variations.length * 4); 
            if (isOracleBiased) confidence += 8;

            variations.push({
                numbers: sortedVariant,
                pheromoneDensity: 0.7 - (variations.length * 0.1), // Dégradé visuel pour l'UI
                confidence: Math.min(99, confidence),
                isOracleBiased
            });
        }
    }

    return variations;
};

/**
 * Fallback rapide optimisé avec Map.
 * Retourne les numéros les plus fréquents récemment pondérés.
 */
const fallbackHeuristic = (history: DrawResult[]): AntColonyPath[] => {
    // Map pour performance O(1) en lecture/écriture
    const freqMap = new Map<number, number>();
    
    // Analyse pondérée sur les 50 derniers tirages
    const limit = Math.min(history.length, 50);
    
    for (let i = 0; i < limit; i++) {
        const draw = history[i];
        // Poids: Récents (0-9) = 3x, Moyens (10-29) = 2x, Vieux = 1x
        const weight = i < 10 ? 3 : i < 30 ? 2 : 1;
        
        for (const n of draw.gagnants) {
            freqMap.set(n, (freqMap.get(n) || 0) + weight);
        }
    }
    
    const sorted = Array.from(freqMap.entries())
        .sort((a, b) => b[1] - a[1]) // Tri décroissant par score
        .slice(0, 5)
        .map(e => e[0])
        .sort((a, b) => a - b); // Tri croissant des numéros pour le ticket
        
    return [{ 
        numbers: sorted.length === 5 ? sorted : [1, 2, 3, 4, 5], // Safety check
        pheromoneDensity: 0.5, 
        confidence: 45, 
        isOracleBiased: false 
    }];
};
