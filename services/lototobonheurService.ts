
import type { DrawResult } from '../types';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { DRAW_SCHEDULE } from '../constants';

const getMonthParam = (date: Date) => {
    const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
    return `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
};

// Construction d'un Set de noms valides pour une vérification rapide (case insensitive)
const VALID_DRAW_NAMES = new Set<string>();
Object.values(DRAW_SCHEDULE).forEach(day => {
    Object.values(day).forEach(name => VALID_DRAW_NAMES.add(name.toUpperCase()));
});

// Mapping pour normalisation stricte (ex: "TIRAGE REVEIL" -> "Reveil")
const NORMALIZE_MAP: Record<string, string> = {};
Object.values(DRAW_SCHEDULE).forEach(day => {
    Object.values(day).forEach(name => {
        NORMALIZE_MAP[name.toUpperCase()] = name; // REVEIL -> Reveil
    });
});

export const ExternalProviderService = {
    fetchLatestResults: async (drawName: string): Promise<Omit<DrawResult, 'id'>[]> => {
        if (!navigator.onLine || !isSupabaseConfigured()) return [];

        try {
            const now = new Date();
            // On vérifie le mois courant et le mois précédent pour assurer la continuité
            const targetMonths = [
                getMonthParam(now),
                getMonthParam(new Date(now.getFullYear(), now.getMonth() - 1, 1))
            ];

            const allResults: Omit<DrawResult, 'id'>[] = [];
            const targetUpper = drawName.toUpperCase();

            for (const monthParam of targetMonths) {
                const { data: resultsData, error } = await supabase.functions.invoke('proxy-results', {
                    body: { month: monthParam }
                });

                if (error || !resultsData?.success) continue;

                const weeks = resultsData.drawsResultsWeekly || [];
                for (const week of weeks) {
                    const yearMatch = week.startDate ? week.startDate.match(/\d{4}$/) : null;
                    const year = yearMatch ? yearMatch[0] : now.getFullYear().toString();
                    
                    if (!week.drawResultsDaily) continue;

                    for (const daily of week.drawResultsDaily) {
                        const dateStr = daily.date; // Ex: "Lun 24/02" ou "24/02"
                        const dateMatch = dateStr.match(/(\d{2})\/(\d{2})/);
                        
                        if (!dateMatch) continue;
                        const formattedDate = `${dateMatch[1]}/${dateMatch[2]}/${year}`;

                        // On combine tous les types de tirages (Standard, Turbo, etc. si dispo)
                        const apiDraws = [
                            ...(daily.drawResults?.standardDraws || []),
                            ...(daily.drawResults?.turboDraws || [])
                        ];

                        for (const draw of apiDraws) {
                            let rawName = (draw.drawName || "").trim().toUpperCase();
                            // Nettoyage de préfixes communs
                            rawName = rawName.replace(/^TIRAGE\s+/, "");

                            // Vérification si c'est un tirage connu
                            if (!VALID_DRAW_NAMES.has(rawName)) continue;

                            const normalizedName = NORMALIZE_MAP[rawName];

                            // Filtrage : Si on cherche un jeu spécifique, on ignore les autres
                            // Si 'ALL', on prend tout
                            if (drawName !== 'ALL' && normalizedName.toUpperCase() !== targetUpper) continue;
                            
                            // Ignorer les tirages incomplets ou placeholder
                            if (!draw.winningNumbers || draw.winningNumbers.includes('..') || draw.winningNumbers.startsWith('.')) continue;

                            const win = (draw.winningNumbers.match(/\d+/g) || []).map(Number).slice(0, 5);
                            const mac = (draw.machineNumbers?.match(/\d+/g) || []).map(Number).slice(0, 5);

                            if (win.length === 5) {
                                allResults.push({
                                    drawName: normalizedName, // Nom propre (ex: "Reveil")
                                    date: formattedDate,
                                    gagnants: win,
                                    machine: mac.length === 5 ? mac : [],
                                    version: 1
                                });
                            }
                        }
                    }
                }
            }

            // Dédoublonnage et tri par date décroissante
            const uniqueResults = Array.from(new Map(allResults.map(item => [`${item.drawName}_${item.date}`, item])).values());
            return uniqueResults.sort((a, b) => {
                const [da, ma, ya] = a.date.split('/').map(Number);
                const [db, mb, yb] = b.date.split('/').map(Number);
                return new Date(yb, mb - 1, db).getTime() - new Date(ya, ma - 1, da).getTime();
            });

        } catch (error) {
            console.error(`[Nexus Scraper] Failure:`, error);
            return [];
        }
    }
};
