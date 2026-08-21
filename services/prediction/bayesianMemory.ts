import { get, set } from 'idb-keyval';
import { AlgoWeights } from '../../shared/prediction.types';

export interface BayesianObservation {
    weights: AlgoWeights;
    score: number;
}

// Cache en mémoire vive pour un accès synchrone ultra-rapide
const memoryStore = new Map<string, BayesianObservation[]>();

/**
 * Récupère l'historique des observations de calibration bayésienne de manière asynchrone depuis IndexedDB (idb-keyval).
 * 
 * @param drawName Nom unique du tirage actif.
 */
export const getBayesianMemoryAsync = async (drawName: string): Promise<BayesianObservation[]> => {
    try {
        const cached = memoryStore.get(drawName);
        if (cached) return cached;

        const stored = await get<BayesianObservation[]>(`bayesian_mem_${drawName}`);
        if (stored && Array.isArray(stored)) {
            memoryStore.set(drawName, stored);
            return stored;
        }
    } catch (e) {
        console.warn("Erreur de lecture de la mémoire bayésienne via IndexedDB :", e);
    }
    return [];
};

/**
 * Enregistre l'historique des observations de calibration bayésienne de manière asynchrone dans IndexedDB (idb-keyval).
 * Conserve uniquement les 100 meilleures observations de l'historique pour prévenir la saturation mémoire.
 * 
 * @param drawName Nom unique du tirage actif.
 * @param observations Liste complète des observations candidats-scores.
 */
export const saveBayesianMemoryAsync = async (drawName: string, observations: BayesianObservation[]): Promise<void> => {
    try {
        // Memory limit derived from sqrt(N_algos * N_domain) to balance coverage vs storage
        // For 22 algos and 90 numbers: sqrt(22*90) ~= 45, rounded up to nearest power of 2 = 64
        const numAlgos = observations.length > 0 && observations[0].weights
            ? Object.keys(observations[0].weights).length
            : 22;
        const memoryLimit = Math.pow(2, Math.ceil(Math.log2(Math.sqrt(numAlgos * 90))));
        const sorted = [...observations]
            .filter(o => o && o.weights && typeof o.score === 'number')
            .sort((a, b) => b.score - a.score)
            .slice(0, memoryLimit);

        memoryStore.set(drawName, sorted);
        await set(`bayesian_mem_${drawName}`, sorted);
    } catch (e) {
        console.warn("Erreur d'écriture de la mémoire bayésienne via IndexedDB :", e);
    }
};

/**
 * Supprime la mémoire bayésienne associée à un tirage donné de manière asynchrone.
 * 
 * @param drawName Nom unique du tirage actif.
 */
export const clearBayesianMemoryAsync = async (drawName: string): Promise<void> => {
    memoryStore.delete(drawName);
    try {
        await set(`bayesian_mem_${drawName}`, undefined);
    } catch (e) {
        console.warn("Erreur de suppression de la mémoire bayésienne via IndexedDB :", e);
    }
};

/**
 * Récupère l'historique de manière synchrone depuis le cache mémoire vive (fallback).
 * 
 * @param drawName Nom unique du tirage actif.
 */
export const getBayesianMemory = (drawName: string): BayesianObservation[] => {
    return memoryStore.get(drawName) || [];
};

/**
 * Enregistre l'historique de manière synchrone dans le cache mémoire vive et lance l'écriture IDB en tâche de fond.
 * 
 * @param drawName Nom unique du tirage actif.
 * @param observations Liste des observations.
 */
export const saveBayesianMemory = (drawName: string, observations: BayesianObservation[]) => {
    const numAlgos = observations.length > 0 && observations[0].weights
        ? Object.keys(observations[0].weights).length
        : 22;
    const memoryLimit = Math.pow(2, Math.ceil(Math.log2(Math.sqrt(numAlgos * 90))));
    const sorted = [...observations]
        .filter(o => o && o.weights && typeof o.score === 'number')
        .sort((a, b) => b.score - a.score)
        .slice(0, memoryLimit);
    memoryStore.set(drawName, sorted);
    saveBayesianMemoryAsync(drawName, sorted).catch(() => {});
};

/**
 * Supprime la mémoire de manière synchrone et lance la suppression IDB en tâche de fond.
 * 
 * @param drawName Nom unique du tirage actif.
 */
export const clearBayesianMemory = (drawName: string) => {
    memoryStore.delete(drawName);
    clearBayesianMemoryAsync(drawName).catch(() => {});
};
