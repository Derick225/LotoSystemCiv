
import type { DrawResult, MonthStats, NumberRegularity } from '../types';
import { calculateRegularity } from './mathService';

// --- HELPERS STATISTIQUES ---

const extractMonth = (dateStr: string): number => {
    if (!dateStr) return -1;
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? -1 : d.getMonth();
};

const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / (arr.length || 1);

const stdDev = (arr: number[]) => {
    const mu = mean(arr);
    const variance = arr.reduce((a, b) => a + Math.pow(b - mu, 2), 0) / (arr.length || 1);
    return Math.sqrt(variance);
};

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
    // Utilisation d'un Uint16Array pour performance
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
    // Score pondéré exponentiellement : Récence > Ancienneté
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

export interface CyclicCandidate {
    number: number;
    score: number;
    gap: number;
    avg: number;
    stdDev: number;
    historyStr: string;
    nextDateEstimate: string;
    cycleStrength: number; // Force du signal périodique (ACF)
}

export const getCyclicCandidates = async (_drawName: string, history: DrawResult[]): Promise<CyclicCandidate[]> => {
    const regularity = calculateRegularity(history);
    const candidates: CyclicCandidate[] = [];
    const limit = Math.min(history.length, 100);

    regularity.forEach((reg: NumberRegularity) => {
        // Transformation en signal binaire pour l'analyse ACF
        const signal = new Float32Array(limit);
        for(let i=0; i<limit; i++) {
            signal[i] = history[i].gagnants.includes(reg.number) ? 1 : 0;
        }

        // Calcul de la périodicité dominante via Autocorrélation
        // On teste les lags autour de la moyenne d'écart (Gap moyen)
        const lagTarget = Math.round(reg.avgGap);
        const acfScore = calculateAutocorrelation(Array.from(signal), lagTarget);

        // Seuil de détection de cycle (ACF > 0.3 est significatif pour du bruit stochastique)
        if (acfScore > 0.25 || (reg.stdDev < 3.0 && reg.lastGaps.length >= 3)) {
            
            const imminence = reg.currentGap / (reg.avgGap || 1);
            
            // Score composite : Précision (inverse variance) + Force du cycle (ACF) + Imminence
            const precisionScore = Math.max(0, (10 - reg.stdDev) * 8);
            const cycleBoost = acfScore * 100;
            const timingScore = (imminence >= 0.9 && imminence <= 1.3) ? 30 : 0;

            const totalScore = precisionScore + cycleBoost + timingScore;

            // Estimation intervalle de confiance (95%)
            const lowerBound = Math.round(reg.avgGap - 1.96 * reg.stdDev);
            const upperBound = Math.round(reg.avgGap + 1.96 * reg.stdDev);

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
    
    // 1. Saisonnalité (Mois en cours)
    const seasonal = getSeasonalAffinity(history);
    const maxSeasonal = seasonal.topNumbers[0]?.count || 1;
    seasonal.topNumbers.forEach(item => {
        scores[item.number] = (scores[item.number] || 0) + (Math.sqrt(item.count / maxSeasonal) * 20);
    });

    // 2. Tendance Journalière (Récence)
    const dayAffinity = getDayAffinity(history);
    dayAffinity.slice(0, 20).forEach(item => {
        scores[item.number] = (scores[item.number] || 0) + (item.score * 0.3);
    });

    // 3. Cycles & Périodicité
    const cycles = await getCyclicCandidates(drawName, history);
    cycles.forEach(c => {
        // Boost massif si le cycle est mature ("CRITIQUE")
        const multiplier = c.nextDateEstimate === 'CRITIQUE' ? 1.5 : 1.0;
        scores[c.number] = (scores[c.number] || 0) + (c.score * 0.5 * multiplier);
    });

    // Normalisation finale (0-100)
    const maxVal = Math.max(...Object.values(scores), 1);
    for(let i=1; i<=90; i++) {
        scores[i] = Math.round(((scores[i] || 0) / maxVal) * 100);
    }

    return scores;
};
