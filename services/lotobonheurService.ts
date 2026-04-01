import type { DrawResult } from '../types';
import { isSupabaseConfigured } from './supabaseClient';
import { apiClient } from '../core/api/apiClient';
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
                try {
                    const resultsData = await apiClient.post<any>('proxy-results', { month: monthParam });

                    if (!resultsData?.success) continue;

                    const weeks = resultsData.drawsResultsWeekly || [];
                for (const week of weeks) {
                    const yearMatch = week.startDate ? week.startDate.match(/\d{4}$/) : null;
                    const startYear = yearMatch ? parseInt(yearMatch[0]) : now.getFullYear();
                    
                    if (!week.drawResultsDaily) continue;

                    for (const daily of week.drawResultsDaily) {
                        const dateStr = daily.date; 
                        const dateMatch = dateStr.match(/(\d{2})\/(\d{2})/);
                        
                        if (!dateMatch) continue;
                        
                        let currentYear = startYear;
                        if (dateMatch[2] === '01' && week.startDate && (week.startDate.includes('/12/') || week.startDate.includes('-12-'))) {
                            currentYear += 1;
                        } else if (dateMatch[2] === '12' && week.startDate && (week.startDate.includes('/01/') || week.startDate.includes('-01-'))) {
                            currentYear -= 1;
                        }
                        
                        const formattedDate = `${dateMatch[1]}/${dateMatch[2]}/${currentYear}`;

                        const apiDraws = [
                            ...(daily.drawResults?.standardDraws || []),
                            ...(daily.drawResults?.turboDraws || [])
                        ];

                        for (const draw of apiDraws) {
                            let rawName = (draw.drawName || "").trim().toUpperCase();
                            rawName = rawName.replace(/^TIRAGE\s+/, "");
                            
                            // Normalize accents
                            rawName = rawName.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

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
                } catch (e) {
                    console.warn(`Failed to fetch results for ${monthParam}`, e);
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