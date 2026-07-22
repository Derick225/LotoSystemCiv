import { DrawResult, AntColonyPath, OracleVocalContext } from '../types';
import { useNexusStore } from '../store/useNexusStore';
import { LCG } from '../utils/mathUtils';
import { apiClient } from '../core/api/apiClient';
import { calculateFractalIndex, calculateShannonEntropy } from './mathService';
import { purifyHistoryForDraw } from '../utils/arrayUtils';

/**
 * Service ACO (Ant Colony Optimization) - Interface Client v3.0 (100% Déterministe & Continu)
 * Gère le cycle de vie du Worker, la diversification post-traitement et l'injection de biais.
 */

const DEFAULT_TIMEOUT = 8000;

const getStringHash = (str: string): number => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
};

const shuffleArray = <T>(arr: T[], prng: LCG): T[] => {
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(prng.next() * (i + 1));
        const temp = result[i];
        result[i] = result[j];
        result[j] = temp;
    }
    return result;
};

/**
 * Exécute l'optimisation par colonie de fourmis avec gestion de timeout et contexte vocal.
 */
export const runAntColonyOptimization = async (
    history: DrawResult[], 
    vocalContext?: OracleVocalContext | null,
    timeoutMs: number = DEFAULT_TIMEOUT
): Promise<AntColonyPath[]> => {
    // Besoin d'un minimum d'historique pour construire le graphe heuristique
    if (!history) return [];
    
    const activeDraw = useNexusStore.getState().drawName || "Reveil";
    const purifiedHistory = purifyHistoryForDraw(activeDraw, history);
    
    if (purifiedHistory.length < 15) return fallbackHeuristic(purifiedHistory);

    const h = calculateFractalIndex(purifiedHistory);
    const entropy = calculateShannonEntropy(purifiedHistory.slice(0, 50)).normalized;

    // CORRECTION : Paramètres ACO dérivés continûment du régime du marché
    // Alpha (Pheromone) : Plus Hurst est élevé, plus on fait confiance à l'historique (phéromones)
    const alpha = 1.0 + (2.0 * Math.max(0, h - 0.5));
    // Beta (Heuristique) : Plus le système est chaotique, plus on se fie à l'heuristique locale (gaps, etc.)
    const beta = 1.0 + (3.0 * entropy);
    // Rho (Évaporation) : Plus l'entropie est haute, plus l'évaporation doit être rapide pour oublier les vieux chemins
    const rho = 0.05 + (0.25 * entropy);
    // q0 (Exploitation) : Inversement proportionnel à l'incertitude
    const q0 = Math.max(0.1, 1.0 - entropy);

    const oracleTargets = vocalContext?.targets || [];

    const config = { 
        antsCount: Math.ceil(90 * (0.5 + entropy)), // Nombre de fourmis proportionnel au chaos (ex: 90 * (0.5 + entropy))
        generations: Math.ceil(100 * (1.0 + h)), 
        alpha, 
        beta, 
        rho, 
        q0,
        biasTargets: oracleTargets
    };

    const useCloudEngine = useNexusStore.getState().useCloudEngine;
    if (useCloudEngine) {
        try {
            console.log(`Tentative ACO via Supabase Edge Function (run-ml-models)...`);
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error("Edge Function Timeout")), 5000)
            );
            
            // Usage de apiClient.post pour une gestion globale des erreurs
            const invokePromise = apiClient.post<{ bestPath?: { numbers: number[], confidence: number } }>('run-ml-models', {
                model: 'aco', history: purifiedHistory.slice(0, 50), config
            }, { suppressErrorLogging: true });

            const data = await Promise.race([invokePromise, timeoutPromise]) as { bestPath?: { numbers: number[], confidence: number } };
            
            if (data && data.bestPath) {
                const bestPathObj = data.bestPath;
                const isOracle = oracleTargets.some(t => bestPathObj.numbers.includes(t));
                const confidence = isOracle ? Math.min(99, bestPathObj.confidence + 10) : bestPathObj.confidence;
                const optimizedBestPath: AntColonyPath = {
                    numbers: bestPathObj.numbers,
                    pheromoneDensity: confidence / 100.0,
                    isOracleBiased: isOracle,
                    confidence: confidence
                };
                const variations = generateVariations(bestPathObj.numbers, purifiedHistory, vocalContext, confidence);
                return [optimizedBestPath, ...variations];
            }
        } catch (e) {
            console.warn("Exception Edge Function ACO, fallback sur Worker local.");
        }
    }

    return new Promise((resolve) => {
        const worker = new Worker(new URL('./workers/aco.worker.ts?worker', import.meta.url), { type: 'module' });
        
        // Sécurité : Timeout configurable côté client
        const timeout = setTimeout(() => {
            worker.terminate();
            console.warn(`ACO Worker Timeout (${timeoutMs}ms) - Fallback Heuristic triggered`);
            resolve(fallbackHeuristic(purifiedHistory));
        }, timeoutMs);

        worker.onmessage = (e) => {
            const { type, bestPath, error } = e.data;
            
            if (type === 'result') {
                clearTimeout(timeout);
                worker.terminate();
                
                if (bestPath && Array.isArray(bestPath.numbers) && bestPath.numbers.length === 5) {
                    const isOracle = oracleTargets.some(t => bestPath.numbers.includes(t));
                    const confidence = isOracle ? Math.min(99, bestPath.confidence + 10) : bestPath.confidence;
                    const optimizedBestPath: AntColonyPath = {
                        ...bestPath,
                        isOracleBiased: isOracle,
                        confidence: confidence,
                        pheromoneDensity: confidence / 100.0
                    };

                    const variations = generateVariations(bestPath.numbers, purifiedHistory, vocalContext, confidence);
                    
                    resolve([optimizedBestPath, ...variations]);
                } else {
                    resolve(fallbackHeuristic(purifiedHistory));
                }
            } else if (error) {
                clearTimeout(timeout);
                worker.terminate();
                console.error("ACO Worker Error:", error);
                resolve(fallbackHeuristic(purifiedHistory));
            }
        };

        worker.onerror = (err) => {
            clearTimeout(timeout);
            worker.terminate();
            console.error("ACO Worker Error Event:", err);
            resolve(fallbackHeuristic(purifiedHistory));
        };

        // Configuration ACS (Ant Colony System) envoyée au worker
        worker.postMessage({ 
            history: purifiedHistory.map(h => ({ gagnants: h.gagnants })),
            config
        });
    });
};

/**
 * Génère des variations intelligentes basées sur le meilleur chemin trouvé.
 */
const generateVariations = (
    base: number[], 
    history: DrawResult[],
    vocalContext?: OracleVocalContext | null,
    baseConfidence: number = 80
): AntColonyPath[] => {
    const variations: AntColonyPath[] = [];
    const oracleTargets = vocalContext?.targets || [];
    const normalizedConfidence = Math.max(Number.EPSILON, Math.min(1 - Number.EPSILON, baseConfidence / 100.0));
    
    // Seed déterministe basé sur le contexte de tirage et de l'historique
    const activeDraw = useNexusStore.getState().drawName || "Reveil";
    const timestamp = history.length > 0 ? getStringHash(history[0].date) : Date.now();
    const seed = base.reduce((a, b) => a + b, 0) + history.length + getStringHash(activeDraw) + timestamp;
    const prng = new LCG(seed);

    const seenTickets = new Set<string>();
    seenTickets.add([...base].sort((a, b) => a - b).join('-'));

    // Pré-calcul des gaps pour heuristique
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

    const maxVariations = Math.ceil(5 * (1.0 - normalizedConfidence)); // Plus la confiance est basse, plus on explore

    for (let v = 0; v < maxVariations; v++) {
        const variant = [...base];
        const mutationsCount = prng.next() < (1.0 - normalizedConfidence) ? 2 : 1;
        
        // Sélection déterministe des indices à muter à l'aide de Fisher-Yates
        const indices = shuffleArray([0, 1, 2, 3, 4], prng).slice(0, mutationsCount);

        for (const idx of indices) {
            const originalVal = variant[idx];
            
            // Calcul des scores heuristiques pour chaque stratégie de mutation
            const scoreOracle = oracleTargets.filter(t => !variant.includes(t)).length > 0 ? normalizedConfidence : 0;
            
            const originalGap = currentGaps.get(originalVal) || 0;
            const gapCandidates = Array.from(currentGaps.entries())
                .filter(([n, g]) => n !== originalVal && Math.abs(g - originalGap) <= 2 && !variant.includes(n));
            const scoreGap = gapCandidates.length > 0 ? (1.0 - normalizedConfidence) : 0;
            
            const scoreVoisinage = normalizedConfidence; // Toujours une option viable

            // CORRECTION : Distribution Softmax pour choisir la stratégie, pas de probabilités magiques
            const scores = [scoreOracle, scoreGap, scoreVoisinage];
            const maxScore = Math.max(...scores, Number.EPSILON);
            const exps = scores.map(s => Math.exp((s - maxScore) / 0.5)); // Température 0.5 pour lisser
            const sumExps = exps.reduce((a, b) => a + b, 0);
            const probs = exps.map(e => e / sumExps);
            
            const pOracle = probs[0];
            const pGap = probs[1];

            const roll = prng.next();
            let newVal = originalVal;

            if (roll < pOracle && scoreOracle > 0) {
                const unused = oracleTargets.filter(t => !variant.includes(t));
                const unusedIdx = unused.length > 0 ? Math.floor(prng.next() * unused.length) : 0;
                newVal = unused.length > 0 ? unused[unusedIdx] : originalVal;
            } else if (roll < pOracle + pGap && scoreGap > 0) {
                const candidateIdx = gapCandidates.length > 0 ? Math.floor(prng.next() * gapCandidates.length) : 0;
                newVal = gapCandidates.length > 0 ? gapCandidates[candidateIdx][0] : originalVal;
            } else {
                // Mutation de voisinage déterministe
                const shift = prng.next() > 0.5 ? 1 : -1;
                newVal = originalVal + shift;
            }

            // Correction des bornes [1, 90] de manière mathématiquement robuste et continue
            newVal = ((newVal - 1) % 90 + 90) % 90 + 1;

            if (!variant.includes(newVal)) {
                variant[idx] = newVal;
            }
        }

        const sortedVariant = variant.sort((a, b) => a - b);
        const signature = sortedVariant.join('-');

        if (!seenTickets.has(signature)) {
            seenTickets.add(signature);
            const isOracleBiased = oracleTargets.some(t => sortedVariant.includes(t));
            
            // Décroissance de confiance théorique basée sur la distance de Hamming implicite
            const decayFactor = Math.exp(-v / (normalizedConfidence * 2 + Number.EPSILON));
            const confidence = Math.max(1, Math.min(99, baseConfidence * decayFactor + (isOracleBiased ? 5 : 0)));

            variations.push({
                numbers: sortedVariant,
                pheromoneDensity: (confidence / 100.0) * decayFactor, 
                confidence: Math.round(confidence),
                isOracleBiased
            });
        }
    }
    return variations;
};

/**
 * Fallback rapide optimisé sans nombres magiques d'historique.
 * Retourne les numéros les plus récents pondérés exponentiellement.
 */
const fallbackHeuristic = (history: DrawResult[]): AntColonyPath[] => {
    const freqMap = new Map<number, number>();
    const limit = Math.min(history.length, Math.ceil(history.length * 0.5)); // 50% de l'historique disponible
    
    for (let i = 0; i < limit; i++) {
        // Poids décroissant exponentiel : w = exp(-i / half_life)
        const halfLife = Math.max(1, Math.floor(limit / 3));
        const weight = Math.exp(-i / halfLife);
        for (const n of history[i].gagnants) {
            freqMap.set(n, (freqMap.get(n) || 0) + weight);
        }
    }
    
    const sorted = Array.from(freqMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(e => e[0])
        .sort((a, b) => a - b);

    return [{
        numbers: sorted.length === 5 ? sorted : (history[0]?.gagnants.slice(0, 5) || []),
        pheromoneDensity: 0.5,
        confidence: 45,
        isOracleBiased: false
    }];
};

