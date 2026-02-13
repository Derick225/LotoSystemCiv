// ------------------ acoService.ts ------------------

import { DrawResult, AntColonyPath, OracleVocalContext } from '../types';

/**
 * Service ACO (Ant Colony Optimization) - Interface Client
 * Gère le cycle de vie du Worker et la diversification post-traitement.
 */
export const runAntColonyOptimization = async (history: DrawResult[], vocalContext?: OracleVocalContext | null): Promise<AntColonyPath[]> => {
    // Besoin d'un minimum d'historique pour construire le graphe heuristique
    if (history.length < 15) return fallbackHeuristic(history);

    return new Promise((resolve) => {
        const worker = new Worker(new URL('./workers/aco.worker.ts', import.meta.url), { type: 'module' });
        
        // Sécurité : Timeout côté client si le worker ne répond pas (5.5s)
        const timeout = setTimeout(() => {
            worker.terminate();
            console.warn("ACO Worker Timeout - Fallback Heuristic triggered");
            resolve(fallbackHeuristic(history));
        }, 5500);

        worker.onmessage = (e) => {
            const { type, bestPath, error } = e.data;
            
            if (type === 'result') {
                clearTimeout(timeout);
                worker.terminate();
                
                if (bestPath && bestPath.numbers.length === 5) {
                    // Génération de variations stratégiques autour du meilleur chemin
                    const variations = generateVariations(bestPath.numbers, vocalContext);
                    // On retourne le meilleur chemin + ses variations (Total 5 tickets)
                    resolve([bestPath, ...variations]);
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

        // Configuration ACS (Ant Colony System)
        worker.postMessage({ 
            history: history.map(h => ({ gagnants: h.gagnants })),
            config: { 
                antsCount: 50,    // Nombre de fourmis par itération
                generations: 100, // Nombre d'itérations
                alpha: 1.0,       // Poids Phéromone
                beta: 3.0,        // Poids Heuristique (Visibilité)
                rho: 0.1,         // Évaporation Globale
                q0: 0.9           // Facteur d'exploitation (vs Exploration)
            }
        });
    });
};

/**
 * Génère des variations intelligentes basées sur le meilleur chemin trouvé.
 * Utilise des mutations ±1, ±2, miroirs, shadows et injections Oracle.
 */
const generateVariations = (base: number[], vocalContext?: OracleVocalContext | null): AntColonyPath[] => {
    const variations: AntColonyPath[] = [];
    const oracleTargets = vocalContext?.targets || [];
    const seenTickets = new Set<string>();
    
    // Ajout du ticket de base au set pour éviter les doublons
    seenTickets.add([...base].sort((a,b)=>a-b).join('-'));

    // On veut générer 4 variations
    let attempts = 0;
    while (variations.length < 4 && attempts < 20) {
        attempts++;
        const variant = [...base];
        
        // 1. Mutation : On change 1 ou 2 numéros
        const mutationsCount = Math.random() > 0.7 ? 2 : 1;
        const indicesToChange = Array.from({length: 5}, (_, i) => i)
                                     .sort(() => 0.5 - Math.random())
                                     .slice(0, mutationsCount);

        for (const idx of indicesToChange) {
            const originalVal = variant[idx];
            let newVal = originalVal;
            const mutationType = Math.random();

            // A. Injection Oracle (Prioritaire si disponible)
            const unusedOracle = oracleTargets.filter(t => !variant.includes(t));
            if (unusedOracle.length > 0 && Math.random() < 0.4) {
                newVal = unusedOracle[Math.floor(Math.random() * unusedOracle.length)];
            } 
            // B. Mutation Voisinage (±1, ±2)
            else if (mutationType < 0.5) {
                const shift = (Math.random() > 0.5 ? 1 : -1) * (Math.random() > 0.8 ? 2 : 1);
                newVal = originalVal + shift;
            } 
            // C. Mutation Miroir (91 - n)
            else if (mutationType < 0.75) {
                newVal = 91 - originalVal;
            } 
            // D. Mutation Shadow (12 -> 21)
            else {
                const rev = parseInt(originalVal.toString().split('').reverse().join(''));
                if (!isNaN(rev)) newVal = rev;
            }

            // Correction des bornes [1, 90]
            if (newVal < 1) newVal = 90 + (newVal % 90); 
            if (newVal > 90) newVal = newVal % 90 || 90;

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
            let confidence = 85 - (variations.length * 5); // Dégressif
            if (isOracleBiased) confidence += 5;

            variations.push({
                numbers: sortedVariant,
                pheromoneDensity: 0.7 - (variations.length * 0.1), // Simulé pour l'affichage
                confidence: Math.min(99, confidence),
                isOracleBiased
            });
        }
    }

    return variations;
};

/**
 * Fallback rapide si le worker échoue ou timeout.
 * Retourne les numéros les plus fréquents récemment.
 */
const fallbackHeuristic = (history: DrawResult[]): AntColonyPath[] => {
    const freq: Record<number, number> = {};
    // Poids plus fort sur les 20 derniers tirages
    history.slice(0, 50).forEach((d, idx) => {
        const weight = idx < 20 ? 2 : 1;
        d.gagnants.forEach(n => freq[n] = (freq[n] || 0) + weight);
    });
    
    const top = Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(e => Number(e[0]))
        .sort((a, b) => a - b);
        
    return [{ numbers: top, pheromoneDensity: 0.5, confidence: 50, isOracleBiased: false }];
};