
import { ALL_DRAWS } from '../constants';
import { fetchResults } from './lotteryService';
import type { DrawResult } from '../types';

export interface InterGameHeat {
    sourceGame: string;
    targetGame: string;
    correlationFactor: number; 
    migratingNumbers: number[];
}

/**
 * Analyse si les résultats d'un jeu influencent mathématiquement le suivant (Translocation).
 * Recherche le tirage précédent (chronologique) sur l'ensemble des jeux disponibles.
 */
export const analyzeMigrationFlux = async (targetDrawName: string): Promise<InterGameHeat | null> => {
    // 1. Récupération de l'historique cible
    const { data: targetHist } = await fetchResults(targetDrawName);
    if (!targetHist || targetHist.length === 0) return null;

    const latestDraw = targetHist[0];
    const targetDate = new Date(latestDraw.date.split('/').reverse().join('-')); // Format YYYY-MM-DD supposé après parsing

    // 2. Identification du tirage précédent (tous jeux confondus)
    // On doit charger les résultats récents de TOUS les jeux pour trouver celui juste avant
    // Optimisation : On ne cherche que dans les jeux du même jour ou de la veille
    
    let bestPreviousDraw: { name: string, result: DrawResult, diff: number } | null = null;

    // Liste des jeux potentiels (excluant le jeu cible)
    const otherGames = ALL_DRAWS.filter(d => d.name !== targetDrawName);

    // On charge en parallèle les derniers résultats des autres jeux (limité à 1 pour perf)
    const promises = otherGames.map(game => 
        fetchResults(game.name).then(res => ({ name: game.name, history: res.data }))
    );

    const allGamesHistory = await Promise.all(promises);

    for (const gameData of allGamesHistory) {
        if (!gameData.history || gameData.history.length === 0) continue;
        
        const candidate = gameData.history[0];
        // Parsing date format (DD/MM/YYYY)
        const parts = candidate.date.split('/');
        const cDate = new Date(parseInt(parts[2]), parseInt(parts[1])-1, parseInt(parts[0]));
        
        // Ajout de l'heure approximative pour le tri fin (basé sur DRAW_SCHEDULE)
        // C'est une approximation heuristique suffisante
        const diff = targetDate.getTime() - cDate.getTime();

        // On cherche le tirage le plus proche dans le passé (positif mais petit)
        // Tolérance : doit être avant (diff > 0) et moins de 48h (172800000ms)
        if (diff > 0 && diff < 172800000) {
            if (!bestPreviousDraw || diff < bestPreviousDraw.diff) {
                bestPreviousDraw = {
                    name: gameData.name,
                    result: candidate,
                    diff: diff
                };
            }
        }
    }

    if (!bestPreviousDraw) return null;

    const sourceDraw = bestPreviousDraw.result;
    
    // 3. Calcul de la translocation (Combien de numéros du tirage source se retrouvent dans le tirage cible ?)
    const intersection = latestDraw.gagnants.filter(n => sourceDraw.gagnants.includes(n));
    
    // Calcul pondéré : On regarde aussi les voisins (+/-1) pour la "pression"
    let pressureScore = 0;
    sourceDraw.gagnants.forEach(src => {
        if (latestDraw.gagnants.includes(src)) pressureScore += 100; // Transfert direct
        if (latestDraw.gagnants.includes(src + 1) || latestDraw.gagnants.includes(src - 1)) pressureScore += 25; // Voisin
    });

    const correlationFactor = Math.min(100, pressureScore / 5 * 20); // Normalisation arbitraire

    return {
        sourceGame: bestPreviousDraw.name,
        targetGame: targetDrawName,
        correlationFactor,
        migratingNumbers: intersection // Numéros ayant translaté
    };
};
