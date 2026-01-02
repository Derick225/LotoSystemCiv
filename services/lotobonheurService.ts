import type { DrawResult } from '../types';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { DRAW_SCHEDULE } from '../constants';

const fetchWithRetry = async (fn: () => Promise<any>, retries = 3, delay = 1000): Promise<any> => {
    try {
        return await fn();
    } catch (error) {
        if (retries <= 0) throw error;
        await new Promise(resolve => setTimeout(resolve, delay));
        return fetchWithRetry(fn, retries - 1, delay * 2);
    }
};

const getMonthParam = (date: Date) => {
    const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
    return `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
};

// Ensemble des noms de tirages valides pour filtrage rapide
const VALID_DRAW_NAMES = new Set<string>();
Object.values(DRAW_SCHEDULE).forEach((day) => {
    Object.values(day).forEach((drawName) => VALID_DRAW_NAMES.add(drawName.toUpperCase()));
});

export const ExternalProviderService = {
    fetchLatestResults: async (drawName: string): Promise<Omit<DrawResult, 'id'>[]> => {
        if (!navigator.onLine || !isSupabaseConfigured()) return [];

        try {
            const now = new Date();
            const monthsToFetch = [getMonthParam(now)];
            
            // Si début de mois, on regarde aussi le mois précédent pour ne rien rater
            if (now.getDate() <= 5) {
                const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                monthsToFetch.push(getMonthParam(prevDate));
            }

            const allResults: Omit<DrawResult, 'id'>[] = [];
            const targetClean = drawName.trim().toUpperCase();

            await Promise.all(monthsToFetch.map(async (monthParam) => {
                try {
                    // Appel via le Proxy Supabase pour contourner CORS
                    const response = await fetchWithRetry(() => 
                        supabase.functions.invoke('proxy-results', {
                            body: { month: monthParam }
                        })
                    );

                    const { data: resultsData, error } = response;
                    if (error || !resultsData?.success) return;

                    const drawsResultsWeekly = resultsData.drawsResultsWeekly || [];

                    for (const week of drawsResultsWeekly) {
                        // Extraction de l'année depuis la startDate de la semaine (ex: "24/02/2025")
                        const yearMatch = week.startDate.match(/\d{4}$/);
                        const year = yearMatch ? yearMatch[0] : now.getFullYear().toString();
                        
                        for (const dailyResult of week.drawResultsDaily) {
                            // Parsing de la date (ex: "Lun 24/02")
                            // On nettoie la chaîne pour garder "24/02"
                            const dateMatch = dailyResult.date.match(/(\d{2})\/(\d{2})/);
                            if (!dateMatch) continue;
                            
                            const formattedDate = `${dateMatch[1]}/${dateMatch[2]}/${year}`;

                            for (const draw of dailyResult.drawResults.standardDraws) {
                                const apiDrawName = (draw.drawName || "").trim().toUpperCase();
                                
                                // Vérification stricte du nom ou inclusion
                                // On vérifie si c'est le jeu demandé OU si c'est un jeu valide de notre système
                                const isMatch = apiDrawName === targetClean || apiDrawName.startsWith(targetClean);
                                const isKnownDraw = VALID_DRAW_NAMES.has(apiDrawName) || Array.from(VALID_DRAW_NAMES).some(v => apiDrawName.startsWith(v));

                                // Ignorer les tirages en attente (commençant par point ou vide)
                                if ((!isMatch && drawName !== 'ALL') || !draw.winningNumbers || draw.winningNumbers.includes('..') || draw.winningNumbers.startsWith('.')) {
                                    continue;
                                }

                                const winningNumbers = (draw.winningNumbers.match(/\d+/g) || []).map(Number).slice(0, 5);
                                const machineNumbers = (draw.machineNumbers?.match(/\d+/g) || []).map(Number).slice(0, 5);

                                if (winningNumbers.length === 5) {
                                    allResults.push({
                                        // On normalise le nom pour correspondre à nos constantes
                                        drawName: isMatch ? drawName : (draw.drawName || 'Unknown'), 
                                        date: formattedDate,
                                        gagnants: winningNumbers,
                                        machine: machineNumbers.length === 5 ? machineNumbers : undefined,
                                        version: 1
                                    });
                                }
                            }
                        }
                    }
                } catch (err) {
                    console.warn(`Erreur fetch mois ${monthParam}:`, err);
                }
            }));

            // Dédoublonnage basé sur la clé unique (Nom + Date)
            const uniqueResults = Array.from(new Map(allResults.map(item => [`${item.drawName}_${item.date}`, item])).values());
            
            // Tri décroissant par date
            return uniqueResults.sort((a, b) => {
                const [da, ma, ya] = a.date.split('/').map(Number);
                const [db, mb, yb] = b.date.split('/').map(Number);
                return new Date(yb, mb - 1, db).getTime() - new Date(ya, ma - 1, da).getTime();
            });

        } catch (error) {
            console.error(`Erreur critique de parsing API:`, error);
            return [];
        }
    },

    formatIsoToDisplay: (isoDate: string): string => {
        const parts = isoDate.split('-');
        if (parts.length !== 3) return isoDate;
        const [y, m, d] = parts;
        return `${d}/${m}/${y}`;
    }
};