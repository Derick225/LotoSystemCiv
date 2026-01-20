
import type { DrawResult, MonthStats, NumberRegularity } from '../types';
import { calculateRegularity } from './mathService';
import { detectPositionalCycles } from '../utils/mathUtils';

const extractMonth = (dateStr: string): number => {
    if (!dateStr) return -1;
    if (dateStr.includes('/')) {
        const parts = dateStr.split('/');
        return parts.length >= 2 ? parseInt(parts[1], 10) - 1 : -1;
    }
    if (dateStr.includes('-')) {
        const parts = dateStr.split('-');
        return parts.length >= 2 ? parseInt(parts[1], 10) - 1 : -1;
    }
    return -1;
};

export const getSeasonalAffinity = (history: DrawResult[]): MonthStats => {
    const currentMonth = new Date().getMonth();
    const monthCounts: Record<number, number> = {};

    history.forEach(draw => {
        const m = extractMonth(draw.date);
        if (m === currentMonth) {
            draw.gagnants.forEach(n => {
                monthCounts[n] = (monthCounts[n] || 0) + 1;
            });
        }
    });

    const topNumbers = Object.entries(monthCounts)
        .map(([n, c]) => ({ number: Number(n), count: c }))
        // Amortissement pour éviter de sur-favoriser les sorties multiples du même mois
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

    return { monthIndex: currentMonth, topNumbers };
};

export const getDayAffinity = (history: DrawResult[], _currentDrawDayName?: string): { number: number, count: number, score: number }[] => {
    const dayScores: Record<number, number> = {};
    const DECAY_FACTOR = 0.05;
    
    history.forEach((draw, index) => {
        // Décroissance exponentielle : plus le tirage est vieux, moins il impacte le score du jour
        const weight = Math.exp(-DECAY_FACTOR * index); 
        draw.gagnants.forEach(n => {
            dayScores[n] = (dayScores[n] || 0) + weight;
        });
    });

    return Object.entries(dayScores)
        .map(([n, s]) => ({ 
            number: Number(n), 
            count: 0, 
            // Amortissement racinaire du score pour équilibrer
            score: Math.sqrt(s) 
        }))
        .sort((a, b) => b.score - a.score);
};

export interface CyclicCandidate {
    number: number;
    score: number;
    gap: number;
    avg: number;
    stdDev: number;
    historyStr: string;
    nextDateEstimate: string;
}

export const getCyclicCandidates = async (_drawName: string, history: DrawResult[]): Promise<CyclicCandidate[]> => {
    const regularity = calculateRegularity(history);
    const candidates: CyclicCandidate[] = [];

    regularity.forEach((reg: NumberRegularity) => {
        const cycleAnalysis = detectPositionalCycles(reg.lastGaps);

        if (cycleAnalysis.hasCycle) {
            const diff = Math.abs(reg.currentGap - reg.avgGap);
            if (diff <= 2.5 || (reg.currentGap > reg.avgGap && reg.currentGap < reg.avgGap * 1.5)) {
                
                const precisionScore = cycleAnalysis.strength;
                const imminenceScore = (3 - Math.min(3, diff)) * 15;
                const stabilityBonus = (1 / (Math.abs(reg.lastGaps[0] - (reg.lastGaps[1] || 0)) + 1)) * 20;

                candidates.push({
                    number: reg.number,
                    score: precisionScore + imminenceScore + stabilityBonus,
                    gap: reg.currentGap,
                    avg: reg.avgGap,
                    stdDev: reg.stdDev,
                    historyStr: reg.lastGaps.map((g: number) => g.toString()).join('-'),
                    nextDateEstimate: "Bientôt"
                });
            }
        }
    });

    return candidates.sort((a, b) => b.score - a.score);
};

export const getTemporalScores = async (drawName: string, history: DrawResult[]): Promise<Record<number, number>> => {
    const scores: Record<number, number> = {};
    
    const seasonal = getSeasonalAffinity(history);
    const maxSeasonal = seasonal.topNumbers[0]?.count || 1;
    seasonal.topNumbers.forEach(item => {
        // Contribution pondérée (amortie)
        scores[item.number] = (scores[item.number] || 0) + Math.sqrt(item.count / maxSeasonal) * 25;
    });

    const dayAffinity = getDayAffinity(history);
    const maxDayScore = dayAffinity[0]?.score || 1;
    dayAffinity.forEach(item => {
        scores[item.number] = (scores[item.number] || 0) + (item.score / maxDayScore) * 35;
    });

    const cycles = await getCyclicCandidates(drawName, history);
    cycles.forEach(c => {
        // Les cycles ont plus d'importance que la fréquence brute
        scores[c.number] = (scores[c.number] || 0) + Math.min(60, c.score);
    });

    for(let i=1; i<=90; i++) {
        if (!scores[i]) scores[i] = 0;
    }

    const maxVal = Math.max(...Object.values(scores), 1);
    for(let i=1; i<=90; i++) {
        scores[i] = Math.round((scores[i] / maxVal) * 100);
    }

    return scores;
};
