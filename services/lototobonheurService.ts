import type { DrawResult } from '../types';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { DRAW_SCHEDULE } from '../constants';

const getMonthParam = (date: Date) => {
    const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
    return `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
};

const NORMALIZE_MAP: Record<string, string> = {};
Object.values(DRAW_SCHEDULE).forEach(day => {
    Object.values(day).forEach(name => {
        NORMALIZE_MAP[name.toUpperCase()] = name;
        NORMALIZE_MAP[`TIRAGE ${name.toUpperCase()}`] = name;
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
                const { data: resultsData, error } = await supabase.functions.invoke('proxy-results', {
                    body: { month: monthParam }
                });

                if (error || !resultsData?.success) continue;

                const weeks = resultsData.drawsResultsWeekly || [];
                for (const week of weeks) {
                    const yearMatch = week.startDate.match(/\d{4}$/);
                    const year = yearMatch ? yearMatch[0] : now.getFullYear().toString();
                    
                    for (const daily of week.drawResultsDaily) {
                        const dateMatch = daily.date.match(/(\d{2})\/(\d{2})/);
                        if (!dateMatch) continue;
                        const formattedDate = `${dateMatch[1]}/${dateMatch[2]}/${year}`;

                        const apiDraws = [
                            ...(daily.drawResults?.standardDraws || []),
                            ...(daily.drawResults?.turboDraws || [])
                        ];

                        for (const draw of apiDraws) {
                            const rawName = (draw.drawName || "").trim().toUpperCase();
                            const normalizedName = NORMALIZE_MAP[rawName] || rawName;

                            if (normalizedName !== drawName && drawName !== 'ALL') continue;
                            
                            if (!draw.winningNumbers || draw.winningNumbers.includes('..')) continue;

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

            return Array.from(new Map(allResults.map(item => [item.date, item])).values());

        } catch (error) {
            console.error(`[Nexus Scraper] Failure:`, error);
            return [];
        }
    }
};