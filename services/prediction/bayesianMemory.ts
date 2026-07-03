import { AlgoWeights } from '../../shared/prediction.types';

const memoryStore = new Map<string, { weights: AlgoWeights; score: number }[]>();

export const getBayesianMemory = (drawName: string): { weights: AlgoWeights; score: number }[] => {
    // Dans un environnement de production, ceci pourrait lire depuis localForage ou Supabase.
    // Pour assurer la reproductibilité et isolation, on utilise une clé stricte.
    return memoryStore.get(drawName) || [];
};

export const saveBayesianMemory = (drawName: string, observations: { weights: AlgoWeights; score: number }[]) => {
    // Conserver uniquement les 100 meilleures observations pour éviter l'oubli catastrophique
    // tout en limitant la consommation mémoire et garantissant un historique de qualité.
    const sorted = [...observations].sort((a, b) => b.score - a.score).slice(0, 100);
    memoryStore.set(drawName, sorted);
};

export const clearBayesianMemory = (drawName: string) => {
    memoryStore.delete(drawName);
};
