
import type { DrawResult, MonthStats, NumberRegularity } from '../types';
import { calculateRegularity } from './mathService';
import { DRAW_SCHEDULE } from '../constants';

// --- HELPERS STATISTIQUES ---

const extractMonth = (dateStr: string): number => {
    if (!dateStr) return -1;
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? -1 : d.getMonth();
};

const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / (arr.length || 1);

// Fonction d'Autocorrélation (ACF) pour détecter la saisonnalité
const calculateAutocorrelation = (data: number[], lag: number) => {
    const n = data.length;
    if (n <= lag) return 0;
    const mu = mean(data);
    let num = 0, den = 0;
    
    for (let i = 0; i < n; i++) {
        den += Math.pow(data[i] - mu, 2);
        if (i < n - lag) {
            num += (data[i] - mu) * (data[i + lag] - mu);
        }
    }
    return den === 0 ? 0 : num / den;
};

// --- CORE SERVICES ---

export const getSeasonalAffinity = (history: DrawResult[]): MonthStats => {
    const currentMonth = new Date().getMonth();
    const monthCounts = new Uint16Array(91); 

    history.forEach(draw => {
        if (extractMonth(draw.date) === currentMonth) {
            draw.gagnants.forEach(n => {
                if (n >= 1 && n <= 90) monthCounts[n]++;
            });
        }
    });

    const topNumbers = Array.from({length: 90}, (_, i) => i + 1)
        .map(n => ({ number: n, count: monthCounts[n] }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

    return { monthIndex: currentMonth, topNumbers };
};

export const getDayAffinity = (history: DrawResult[]): { number: number, count: number, score: number }[] => {
    const scores = new Float32Array(91);
    const DECAY_LAMBDA = 0.05; // Facteur d'oubli
    
    history.forEach((draw, idx) => {
        const weight = Math.exp(-DECAY_LAMBDA * idx);
        draw.gagnants.forEach(n => {
            if (n >= 1 && n <= 90) scores[n] += weight;
        });
    });

    const maxScore = Math.max(...scores) || 1;
    
    return Array.from({length: 90}, (_, i) => i + 1)
        .map(n => ({ 
            number: n, 
            count: 0, 
            score: Math.round((scores[n] / maxScore) * 100) 
        }))
        .sort((a, b) => b.score - a.score);
};

// --- NOUVEAU : ANALYSE CHRONOBIOLOGIQUE (Time Slots) ---
export interface TimeSlotMetric {
    slot: string; // '10:00', '13:00', '16:00', '18:00'
    label: string; // 'Matin', 'Zénith', 'Après-midi', 'Soir'
    activity: number; // Score global d'activité (Somme des sorties normalisée)
    topNumbers: number[];
}

const getTimeSlotFromDrawName = (drawName: string): string => {
    const upperName = drawName.toUpperCase().trim();
    for (const day in DRAW_SCHEDULE) {
        for (const time in DRAW_SCHEDULE[day]) {
            if (DRAW_SCHEDULE[day][time].toUpperCase() === upperName) {
                return time;
            }
        }
    }
    return 'UNKNOWN';
};

export const getTimeSlotAffinity = (history: DrawResult[]): TimeSlotMetric[] => {
    const slots: Record<string, { count: number, numbers: Record<number, number> }> = {
        '10:00': { count: 0, numbers: {} },
        '13:00': { count: 0, numbers: {} },
        '16:00': { count: 0, numbers: {} },
        '18:15': { count: 0, numbers: {} }
    };

    const labels: Record<string, string> = {
        '10:00': 'Matin', '13:00': 'Zénith', '16:00': 'Jour', '18:15': 'Crépuscule'
    };

    history.forEach(draw => {
        const time = getTimeSlotFromDrawName(draw.drawName);
        // Si on ne trouve pas exactement l'heure (ex: noms différents), on essaie de mapper approximativement ou on ignore
        // Pour la robustesse, on mappe les clés connues.
        let targetKey = '';
        if (['10:00', '10H', 'MATIN'].some(k => time.includes(k))) targetKey = '10:00';
        else if (['13:00', '13H', 'ZENITH'].some(k => time.includes(k))) targetKey = '13:00';
        else if (['16:00', '16H', 'JOUR'].some(k => time.includes(k))) targetKey = '16:00';
        else if (['18:00', '18:15', '18H', 'SOIR'].some(k => time.includes(k))) targetKey = '18:15';
        else targetKey = time; // Fallback direct (si le drawName est directement mappé dans DRAW_SCHEDULE)

        if (slots[targetKey]) {
            slots[targetKey].count++;
            draw.gagnants.forEach(n => {
                slots[targetKey].numbers[n] = (slots[targetKey].numbers[n] || 0) + 1;
            });
        }
    });

    return Object.entries(slots).map(([time, data]) => {
        const topNums = Object.entries(data.numbers)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(e => Number(e[0]));

        return {
            slot: time,
            label: labels[time] || time,
            activity: data.count,
            topNumbers: topNums
        };
    }); // On ne trie pas ici pour garder l'ordre chronologique
};

export interface CyclicCandidate {
    number: number;
    score: number;
    gap: number;
    avg: number;
    stdDev: number;
    historyStr: string;
    nextDateEstimate: string;
    cycleStrength: number;
}

export const getCyclicCandidates = async (_drawName: string, history: DrawResult[]): Promise<CyclicCandidate[]> => {
    const regularity = calculateRegularity(history);
    const candidates: CyclicCandidate[] = [];
    const limit = Math.min(history.length, 100);

    regularity.forEach((reg: NumberRegularity) => {
        const signal = new Float32Array(limit);
        for(let i=0; i<limit; i++) {
            signal[i] = history[i].gagnants.includes(reg.number) ? 1 : 0;
        }

        const lagTarget = Math.round(reg.avgGap);
        const acfScore = calculateAutocorrelation(Array.from(signal), lagTarget);

        if (acfScore > 0.25 || (reg.stdDev < 3.0 && reg.lastGaps.length >= 3)) {
            const imminence = reg.currentGap / (reg.avgGap || 1);
            const precisionScore = Math.max(0, (10 - reg.stdDev) * 8);
            const cycleBoost = acfScore * 100;
            const timingScore = (imminence >= 0.9 && imminence <= 1.3) ? 30 : 0;

            const totalScore = precisionScore + cycleBoost + timingScore;

            const lowerBound = Math.round(reg.avgGap - 1.5 * reg.stdDev);
            const upperBound = Math.round(reg.avgGap + 1.5 * reg.stdDev);

            let status = "EN ATTENTE";
            if (reg.currentGap >= lowerBound && reg.currentGap <= upperBound) status = "CRITIQUE";
            else if (reg.currentGap > upperBound) status = "RETARD";

            candidates.push({
                number: reg.number,
                score: Math.min(100, Math.round(totalScore)),
                gap: reg.currentGap,
                avg: reg.avgGap,
                stdDev: reg.stdDev,
                historyStr: reg.lastGaps.join('-'),
                nextDateEstimate: status,
                cycleStrength: parseFloat(acfScore.toFixed(2))
            });
        }
    });

    return candidates.sort((a, b) => b.score - a.score);
};

export const getTemporalScores = async (drawName: string, history: DrawResult[]): Promise<Record<number, number>> => {
    const scores: Record<number, number> = {};
    
    // 1. Saisonnalité
    const seasonal = getSeasonalAffinity(history);
    const maxSeasonal = seasonal.topNumbers[0]?.count || 1;
    seasonal.topNumbers.forEach(item => {
        scores[item.number] = (scores[item.number] || 0) + (Math.sqrt(item.count / maxSeasonal) * 20);
    });

    // 2. Tendance Journalière
    const dayAffinity = getDayAffinity(history);
    dayAffinity.slice(0, 20).forEach(item => {
        scores[item.number] = (scores[item.number] || 0) + (item.score * 0.3);
    });

    // 3. Cycles
    const cycles = await getCyclicCandidates(drawName, history);
    cycles.forEach(c => {
        const multiplier = c.nextDateEstimate === 'CRITIQUE' ? 1.5 : 1.0;
        scores[c.number] = (scores[c.number] || 0) + (c.score * 0.5 * multiplier);
    });

    // 4. Chronobiologie (Time Slot actuel)
    // On détecte le slot du tirage courant (via drawName) et on booste les numéros forts de ce slot
    const currentSlot = getTimeSlotFromDrawName(drawName);
    const timeStats = getTimeSlotAffinity(history);
    const matchingSlot = timeStats.find(s => s.slot === currentSlot);
    
    if (matchingSlot) {
        matchingSlot.topNumbers.forEach((n, idx) => {
            scores[n] = (scores[n] || 0) + (15 - idx * 2); // Boost léger pour le top 5 du slot
        });
    }

    const maxVal = Math.max(...Object.values(scores), 1);
    for(let i=1; i<=90; i++) {
        scores[i] = Math.round(((scores[i] || 0) / maxVal) * 100);
    }

    return scores;
};
