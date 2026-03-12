import type { DrawResult } from '../types';
import { isSupabaseConfigured } from './supabaseClient';
import { invokeEdgeFunction } from './apiClient';
import { DRAW_SCHEDULE } from '../constants';

const getMonthParam = (date: Date) => {
    const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
    return `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
};

const VALID_DRAW_NAMES = new Set<string>();
Object.values(DRAW_SCHEDULE).forEach(day => {
    Object.values(day).forEach(name => VALID_DRAW_NAMES.add(name.toUpperCase()));
});

const NORMALIZE_MAP: Record<string, string> = {};
Object.values(DRAW_SCHEDULE).forEach(day => {
    Object.values(day).forEach(name => {
        NORMALIZE_MAP[name.toUpperCase()] = name; 
    });
});

export const ExternalProviderService = {
    fetchLatestResults: async (drawName: string): Promise<Omit<DrawResult, 'id'>[]> => {
        if (!navigator.onLine || !isSupabaseConfigured()) return [];

        try {
            const now = new Date();
            const targetMonths = [
                getMonthParam(now),
                getMonthParam(new Date(now.getFullYear(), now.getMonth() - 1, 1))
            ];

            const allResults: Omit<DrawResult, 'id'>[] = [];
            const targetUpper = drawName.toUpperCase();

            for (const monthParam of targetMonths) {
                const { data: resultsData, error } = await invokeEdgeFunction('proxy-results', {
                    body: { month: monthParam }
                });

                if (error || !resultsData?.success) continue;

                const weeks = resultsData.drawsResultsWeekly || [];
                for (const week of weeks) {
                    const yearMatch = week.startDate ? week.startDate.match(/\d{4}$/) : null;
                    const year = yearMatch ? yearMatch[0] : now.getFullYear().toString();
                    
                    if (!week.drawResultsDaily) continue;

                    for (const daily of week.drawResultsDaily) {
                        const dateStr = daily.date; 
                        const dateMatch = dateStr.match(/(\d{2})\/(\d{2})/);
                        
                        if (!dateMatch) continue;
                        const formattedDate = `${dateMatch[1]}/${dateMatch[2]}/${year}`;

                        const apiDraws = [
                            ...(daily.drawResults?.standardDraws || []),
                            ...(daily.drawResults?.turboDraws || [])
                        ];

                        for (const draw of apiDraws) {
                            let rawName = (draw.drawName || "").trim().toUpperCase();
                            rawName = rawName.replace(/^TIRAGE\s+/, "");

                            if (!VALID_DRAW_NAMES.has(rawName)) continue;

                            const normalizedName = NORMALIZE_MAP[rawName];

                            if (drawName !== 'ALL' && normalizedName.toUpperCase() !== targetUpper) continue;
                            
                            if (!draw.winningNumbers || draw.winningNumbers.includes('..') || draw.winningNumbers.startsWith('.')) continue;

                            const win = (draw.winningNumbers.match(/\d+/g) || []).map(Number).slice(0, 5);
                            const mac = (draw.machineNumbers?.match(/\d+/g) || []).map(Number).slice(0, 5);

                            if (win.length === 5) {
                                allResults.push({
                                    drawName: normalizedName,
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