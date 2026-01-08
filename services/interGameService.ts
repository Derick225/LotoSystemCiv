
import { fetchResults } from './lotteryService';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import type { DrawResult } from '../types';

export interface InterGameHeat {
    sourceGame: string;
    targetGame: string;
    correlationFactor: number; 
    migratingNumbers: number[];
}

/**
 * Analyse si les résultats d'un jeu influencent mathématiquement le suivant (Translocation).
 * VERSION OPTIMISÉE : Utilise une requête globale au lieu de N requêtes unitaires.
 */
export const analyzeMigrationFlux = async (targetDrawName: string): Promise<InterGameHeat | null> => {
    // 1. Récupération de l'historique cible
    const { data: targetHist } = await fetchResults(targetDrawName);
    if (!targetHist || targetHist.length === 0) return null;

    const latestDraw = targetHist[0];
    // Parsing robuste de la date
    let targetDate: Date;
    if (latestDraw.date.includes('/')) {
        const [d, m, y] = latestDraw.date.split('/').map(Number);
        targetDate = new Date(y, m - 1, d);
    } else {
        targetDate = new Date(latestDraw.date);
    }

    // 2. Récupération optimisée du marché global (500 derniers tirages tous jeux confondus)
    // Cela remplace les 30+ appels individuels
    let allMarketDraws: any[] = [];
    
    if (isSupabaseConfigured()) {
        const { data } = await supabase
            .from('draw_results')
            .select('draw_name, date, gagnants')
            .neq('draw_name', targetDrawName) // On exclut le jeu cible
            .order('date', { ascending: false })
            .limit(300);
        
        allMarketDraws = data || [];
    } else {
        // Fallback Local (Moins précis mais fonctionnel hors ligne)
        // On ne peut pas scanner tout le localstorage efficacement, on retourne null
        return null; 
    }

    let bestPreviousDraw: { name: string, result: DrawResult, diff: number } | null = null;

    for (const entry of allMarketDraws) {
        // Parsing date
        const dStr = entry.date;
        let cDate: Date;
        if (dStr.includes('/')) {
            const [d, m, y] = dStr.split('/').map(Number);
            cDate = new Date(y, m - 1, d);
        } else {
            cDate = new Date(dStr);
        }

        // Calcul du delta temps
        const diff = targetDate.getTime() - cDate.getTime();

        // On cherche le tirage le plus proche dans le passé immédiat ( < 48h )
        // diff > 0 signifie que cDate est AVANT targetDate
        if (diff > 0 && diff < 172800000) {
            // Si on a plusieurs tirages le même jour, on prend le plus proche (logique simplifiée ici)
            if (!bestPreviousDraw || diff < bestPreviousDraw.diff) {
                bestPreviousDraw = {
                    name: entry.draw_name,
                    result: { ...entry, id: 'temp', machine: [], version: 1 }, // Reconstruction type DrawResult
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

    const correlationFactor = Math.min(100, Math.round(pressureScore / 5 * 20)); // Normalisation arbitraire

    return {
        sourceGame: bestPreviousDraw.name,
        targetGame: targetDrawName,
        correlationFactor,
        migratingNumbers: intersection // Numéros ayant translaté
    };
};
