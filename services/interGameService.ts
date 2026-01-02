
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
 * Analyse si les résultats d'un jeu influencent mathématiquement le suivant.
 * Version v3.5 : Jaccard Pondéré Temporellement (Récence) avec gestion circulaire.
 */
export const analyzeMigrationFlux = async (targetDrawName: string): Promise<InterGameHeat | null> => {
    const draws = ALL_DRAWS;
    const currentIndex = draws.findIndex(d => d.name === targetDrawName);
    
    // Gestion circulaire : si c'est le premier tirage, on prend le dernier de la liste (Dimanche soir précédent)
    // Sinon on prend simplement le précédent.
    const prevIndex = currentIndex <= 0 ? draws.length - 1 : currentIndex - 1;
    const prevDrawDef = draws[prevIndex];
    
    // Sécurité si la liste est vide ou erreur d'index
    if (!prevDrawDef) return null;
    
    try {
        const [{ data: targetHist }, { data: sourceHist }] = await Promise.all([
            fetchResults(targetDrawName),
            fetchResults(prevDrawDef.name)
        ]);

        if (targetHist.length < 20 || sourceHist.length < 20) return null;

        let weightedJaccardSum = 0;
        let totalWeights = 0;
        const migrationFreq: Record<number, number> = {};

        // Analyse sur les 50 derniers tirages
        const depth = Math.min(50, targetHist.length);

        for (let i = 0; i < depth; i++) {
            const tDraw = targetHist[i];
            
            // Recherche heuristique du tirage source correspondant (même jour ou jour précédent selon le cycle)
            // Note: Pour une analyse parfaite, il faudrait aligner les timestamps exacts, 
            // mais ici on cherche une corrélation structurelle proche.
            // On cherche le tirage source le plus proche temporellement de tDraw.date
            const sameDaySource = sourceHist.find(s => s.date === tDraw.date);
            // Si pas trouvé le même jour (ex: transition Lundi/Dimanche), on prend juste l'index correspondant
            // en supposant une régularité, ou on saute.
            const sourceDraw = sameDaySource || sourceHist[i]; 
            
            if (sourceDraw) {
                // Poids temporel : Les tirages récents comptent plus (décroissance exponentielle)
                const weight = Math.exp(-0.05 * i); 
                totalWeights += weight;

                const intersection = tDraw.gagnants.filter(n => sourceDraw.gagnants.includes(n));
                const unionSize = new Set([...tDraw.gagnants, ...sourceDraw.gagnants]).size;
                
                // Jaccard local
                const jaccard = intersection.length / unionSize;
                weightedJaccardSum += (jaccard * weight);
                
                intersection.forEach(n => migrationFreq[n] = (migrationFreq[n] || 0) + weight);
            }
        }

        if (totalWeights === 0) return null;

        // Facteur de corrélation global normalisé
        const avgWeightedJaccard = weightedJaccardSum / totalWeights;
        // On amplifie pour la lisibilité (0.1 Jaccard est déjà énorme pour du loto)
        const factor = Math.min(100, Math.round(avgWeightedJaccard * 500)); 
        
        // Seuil de bruit pour les migrants
        const hotMigrators = Object.entries(migrationFreq)
            .sort((a,b) => b[1] - a[1])
            .slice(0, 5)
            .map(e => Number(e[0]));

        return {
            sourceGame: prevDrawDef.name,
            targetGame: targetDrawName,
            correlationFactor: factor,
            migratingNumbers: hotMigrators
        };
    } catch (e) {
        return null;
    }
};
