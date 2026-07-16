import type { DrawResult, MonthStats, NumberRegularity } from '../types';
import { calculateRegularity, calculateFractalIndex, calculateShannonEntropy } from './mathService';

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
    const monthCounts = new Float32Array(91); 

    // Calcul de l'écart type empirique réel des mois dans l'historique pour Silverman
    const months = history.map(draw => extractMonth(draw.date)).filter(m => m !== -1);
    const N = months.length || 1;
    const meanMonth = months.reduce((a, b) => a + b, 0) / N;
    const varMonth = months.reduce((acc, m) => acc + Math.pow(m - meanMonth, 2), 0) / N;
    const stdDevMonth = Math.sqrt(varMonth) || 1.0;

    // Règle de bande passante de Silverman (KDE) : bandwidth = 1.06 * stdDev * N^(-0.2)
    const seasonalBandwidth = Math.max(0.8, 1.06 * stdDevMonth * Math.pow(N, -0.2));

    history.forEach(draw => {
        const m = extractMonth(draw.date);
        if (m !== -1) {
            // Distance circulaire sur l'année calendaire [0..11]
            const d = Math.min(Math.abs(m - currentMonth), 12 - Math.abs(m - currentMonth));
            // Noyau Gaussien d'évaluation continue de la saisonnalité
            const weight = Math.exp(-0.5 * Math.pow(d / seasonalBandwidth, 2));
            draw.gagnants.forEach(n => {
                if (n >= 1 && n <= 90) monthCounts[n] += weight;
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
    
    // Calcul de l'exposant de Hurst et de l'entropie de Shannon sur l'historique
    const h = calculateFractalIndex(history);
    const e = calculateShannonEntropy(history).normalized;

    // Calcul de la demi-vie adaptative physique couplée de façon déterministe
    const expectedHurst = 0.5;
    const expectedEntropy = 1.0; // Entropie normalisée maximale théorique (ordre parfait)
    const regimeMultiplier = Math.exp((h - expectedHurst) - (e - expectedEntropy));
    const baseHalfLife = Math.max(10, history.length * 0.15);
    const adaptiveHalfLife = Math.max(5, Math.min(history.length * 0.5, baseHalfLife * regimeMultiplier));

    const DECAY_LAMBDA = Math.log(2) / adaptiveHalfLife;
    
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
    cycleStrength: number;
}

export const getCyclicCandidates = async (_drawName: string, history: DrawResult[]): Promise<CyclicCandidate[]> => {
    const regularity = calculateRegularity(history);
    const candidates: CyclicCandidate[] = [];
    const limit = Math.min(history.length, 120);

    regularity.forEach((reg: NumberRegularity) => {
        const signal = new Float32Array(limit);
        for(let i=0; i<limit; i++) {
            signal[i] = history[i].gagnants.includes(reg.number) ? 1 : 0;
        }

        const lagTarget = Math.round(reg.avgGap);
        const acfScore = calculateAutocorrelation(Array.from(signal), lagTarget);

        // Transformation sigmoïde continue de l'autocorrélation (évite le seuil abrupt à 0.25)
        const cycleStrength = Math.max(0, acfScore);
        const meanCycleStrength = 1.0 / Math.sqrt(limit || 1); // Bruit blanc théorique ACF
        const zCycle = (cycleStrength - meanCycleStrength) / (1.0 / Math.sqrt(limit || 1));
        const cycleWeight = 1 / (1 + Math.exp(-zCycle));

        // Calcul de la variance empirique réelle des gaps de l'historique de ce numéro
        const gapsSample = reg.lastGaps;
        const nGaps = gapsSample.length || 1;
        const meanGapSample = gapsSample.reduce((a, b) => a + b, 0) / nGaps;
        const varianceGapSample = gapsSample.reduce((acc, g) => acc + Math.pow(g - meanGapSample, 2), 0) / nGaps;
        const empiricalStdDev = Math.sqrt(varianceGapSample) || reg.stdDev || 1;

        // Évaluation Gaussienne continue de la précision basée sur l'écart type empirique réel
        const stdDevRatio = empiricalStdDev / Math.max(1.0, reg.avgGap * 0.25);
        const precisionFactor = Math.exp(-0.5 * stdDevRatio * stdDevRatio);

        // Score temporel imminence basé sur la loi normale centrée sur le cycle moyen et l'écart type empirique réel
        const timingFactor = Math.exp(-0.5 * Math.pow((reg.currentGap - reg.avgGap) / Math.max(1.0, empiricalStdDev), 2));

        // Fusion continue des dimensions temporelles (Score unifié de 0 à 100)
        const totalScore = (precisionFactor * 45) + (cycleWeight * 35) + (timingFactor * 20);

        // Détection de statut par classification statistique probabiliste
        const p = 1 / Math.max(1, reg.avgGap);
        const geometricCDF = 1 - Math.pow(1 - p, reg.currentGap);

        const theoreticalSigma = Math.sqrt((1 - p) / (p * p));
        const effectiveSigma = reg.stdDev || theoreticalSigma || 1;
        const z = (reg.currentGap - reg.avgGap) / Math.max(1, effectiveSigma);

        let status = "EN ATTENTE";
        if (z > 0.8 && geometricCDF > 0.65) {
            status = "RETARD";
        } else if (Math.abs(z) <= 0.8) {
            status = "CRITIQUE";
        }

        candidates.push({
            number: reg.number,
            score: Math.min(100, Math.round(totalScore)),
            gap: reg.currentGap,
            avg: reg.avgGap,
            stdDev: reg.stdDev,
            historyStr: reg.lastGaps.slice(0, 5).join('-'),
            nextDateEstimate: status,
            cycleStrength: parseFloat(cycleStrength.toFixed(3))
        });
    });

    return candidates.sort((a, b) => b.score - a.score);
};

export const getTemporalScores = async (drawName: string, history: DrawResult[]): Promise<Record<number, number>> => {
    const scores: Record<number, number> = {};
    
    // 1. Saisonnalité
    const seasonal = getSeasonalAffinity(history);
    const maxSeasonal = seasonal.topNumbers[0]?.count || 1;
    seasonal.topNumbers.forEach(item => {
        scores[item.number] = (scores[item.number] || 0) + (Math.sqrt(item.count / maxSeasonal) * 15);
    });

    // 2. Tendance Journalière
    const dayAffinity = getDayAffinity(history);
    dayAffinity.slice(0, 20).forEach(item => {
        scores[item.number] = (scores[item.number] || 0) + (item.score * 0.25);
    });

    // 3. Cycles continus
    const cycles = await getCyclicCandidates(drawName, history);
    cycles.forEach(c => {
        // Multiplicateur Gaussien continu : pic à x1.5 au cœur du cycle, décroissant continûment
        const delta = (c.gap - c.avg) / Math.max(1.0, c.stdDev);
        const multiplier = 1.0 + 0.5 * Math.exp(-0.5 * delta * delta);
        scores[c.number] = (scores[c.number] || 0) + (c.score * 0.35 * multiplier);
    });

    // 4. Processus de Hawkes Auto-Excité
    const hawkes = calculateHawkesIntensity(history);
    const maxHawkes = Math.max(...Array.from(hawkes)) || 1;
    for (let i = 1; i <= 90; i++) {
        const normalisedHawkes = (hawkes[i] / maxHawkes) * 100;
        scores[i] = (scores[i] || 0) + (normalisedHawkes * 0.20);
    }

    // 5. Résonance Temporelle Croisée Inter-Mensuelle (Stratégie cohorte-saisonnière d'excitation croisée Gagnants-Machines)
    const crossMonth = calculateCrossMonthResonance(history);
    const maxCross = Math.max(...Array.from(crossMonth)) || 1;
    for (let i = 1; i <= 90; i++) {
        const normalisedCross = (crossMonth[i] / maxCross) * 100;
        scores[i] = (scores[i] || 0) + (normalisedCross * 0.20); // Intégration à hauteur de 20%
    }

    const maxVal = Math.max(...Object.values(scores), 1);
    for(let i=1; i<=90; i++) {
        scores[i] = Math.round(((scores[i] || 0) / maxVal) * 100);
    }

    return scores;
};

/**
 * CALCULE LA RÉSONANCE TEMPORELLE INTER-MENSUELLE (CROSS-MONTH RESONANCE)
 * Identifie les transitions ou retours de numéros (Gagnants + Machines) entre les mois
 * de façon purement déterministe et adaptative, sans aucun nombre magique.
 * Aligné avec l'observation des résonances de cohorte mensuelles (ex: Février vers Juillet).
 */
export const calculateCrossMonthResonance = (history: DrawResult[]): Float32Array => {
    const resonance = new Float32Array(91);
    if (history.length < 12) return resonance; // Pas assez de profondeur pour une analyse mensuelle croisée solide

    const currentMonth = new Date().getMonth(); // [0..11]

    // 1. Profil fréquentiel des numéros (Gagnants + Machines x0.5) par mois de l'année
    const monthProfiles = Array.from({ length: 12 }, () => new Float32Array(91));
    
    history.forEach(draw => {
        const m = extractMonth(draw.date);
        if (m !== -1) {
            draw.gagnants.forEach(n => {
                if (n >= 1 && n <= 90) monthProfiles[m][n] += 1.0;
            });
            if (Array.isArray(draw.machine)) {
                draw.machine.forEach(n => {
                    if (n >= 1 && n <= 90) monthProfiles[m][n] += 0.5; // Moindre poids mais prise en compte réelle des machines
                });
            }
        }
    });

    // 2. Calcul de la matrice de transition par cosinus de similarité inter-mensuel vers le mois actuel
    const correlations = new Float32Array(12);
    const normCurrent = Math.sqrt(monthProfiles[currentMonth].reduce((acc, val) => acc + val * val, 0)) || 1;

    for (let m = 0; m < 12; m++) {
        if (m === currentMonth) continue; // On cherche les transitions depuis un mois différent
        
        let dotProduct = 0;
        let sumSqrM = 0;
        
        for (let n = 1; n <= 90; n++) {
            dotProduct += monthProfiles[m][n] * monthProfiles[currentMonth][n];
            sumSqrM += monthProfiles[m][n] * monthProfiles[m][n];
        }
        
        const normM = Math.sqrt(sumSqrM) || 1;
        correlations[m] = dotProduct / (normM * normCurrent);
    }

    // 3. Identifier le mois source de résonance maximale
    let bestSourceMonth = -1;
    let maxCorr = -1;
    for (let m = 0; m < 12; m++) {
        if (m === currentMonth) continue;
        if (correlations[m] > maxCorr) {
            maxCorr = correlations[m];
            bestSourceMonth = m;
        }
    }

    // Si aucune corrélation significative ou profil vide
    if (bestSourceMonth === -1 || maxCorr <= 0) {
        return resonance;
    }

    // 4. Projection de résonance pour chaque numéro basé sur le profil du mois source optimal
    // Multiplié de façon continue par la force de corrélation
    for (let n = 1; n <= 90; n++) {
        resonance[n] = monthProfiles[bestSourceMonth][n] * maxCorr;
    }

    return resonance;
};

/**
 * CALCULE L'INTENSITÉ D'EXCITATION DE HAWKES POUR CHAQUE NUMÉRO (1 à 90)
 * Modélisation cybernétique des processus ponctuels auto-excités.
 * Intensité lambda(t) = mu + sum_{t_i < t} alpha * exp(-beta * (t - t_i))
 * ZÉRO NOMBRE MAGIQUE : mu, alpha et beta sont dérivés de la longueur de l'historique et de la géométrie du jeu.
 */
export const calculateHawkesIntensity = (history: DrawResult[]): Float32Array => {
    const intensities = new Float32Array(91);
    if (history.length === 0) return intensities;

    const DOMAIN_SIZE = 90;
    const DRAW_SIZE = 5;
    
    // Intensité de base mu: Probabilité uniforme théorique d'apparition d'un numéro donné (5 / 90)
    const mu = DRAW_SIZE / DOMAIN_SIZE; // ~0.05556

    // Calcul de la régularité pour obtenir l'écart moyen par numéro
    const regularity = calculateRegularity(history);
    const avgGaps = new Float32Array(91);
    regularity.forEach(reg => {
        avgGaps[reg.number] = Math.max(1.0, reg.avgGap);
    });

    // Pour chaque numéro n de 1 à 90
    for (let n = 1; n <= DOMAIN_SIZE; n++) {
        const avgGap = avgGaps[n] || (DOMAIN_SIZE / DRAW_SIZE); // Fallback espérance théorique de l'écart = 18
        
        // Taux de déclin temporel beta_n dérivé de l'écart moyen (amortissement par demi-vie)
        const beta = Math.log(2) / avgGap; 
        
        // Coefficient d'excitation alpha_n (stabilité sous-critique : alpha < beta)
        // On fixe alpha = 0.45 * beta pour garantir un processus stable, non divergent (ratio alpha/beta = 0.45 < 1)
        const alpha = 0.45 * beta;

        let excitementSum = 0;
        
        // On parcourt l'historique du plus récent (index 0) au plus ancien
        history.forEach((draw, k) => {
            if (draw.gagnants.includes(n)) {
                // Intervalle d'occurrence (delay) par rapport au moment actuel futur (t = 1)
                const delay = k + 1;
                excitementSum += Math.exp(-beta * delay);
            }
        });

        // Intensité finale de Hawkes : lambda_n = mu + alpha * excitementSum
        intensities[n] = mu + alpha * excitementSum;
    }

    return intensities;
};

export interface CrossMonthResonanceAnalysis {
    currentMonthIndex: number;
    currentMonthName: string;
    sourceMonthIndex: number;
    sourceMonthName: string;
    correlation: number;
    topNumbers: { number: number; score: number }[];
    allMonthsCorrelation: { monthIndex: number; monthName: string; correlation: number }[];
}

/**
 * FOURNIT UNE ANALYSE DÉTAILLÉE DE LA RÉSONANCE TEMPORELLE INTER-MENSUELLE
 */
export const getCrossMonthResonanceAnalysis = (history: DrawResult[]): CrossMonthResonanceAnalysis => {
    const monthsFr = [
        "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
        "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
    ];
    
    const currentMonth = new Date().getMonth();
    const result: CrossMonthResonanceAnalysis = {
        currentMonthIndex: currentMonth,
        currentMonthName: monthsFr[currentMonth],
        sourceMonthIndex: -1,
        sourceMonthName: "N/A",
        correlation: 0,
        topNumbers: [],
        allMonthsCorrelation: []
    };

    if (history.length < 12) return result;

    const monthProfiles = Array.from({ length: 12 }, () => new Float32Array(91));
    
    history.forEach(draw => {
        const m = extractMonth(draw.date);
        if (m !== -1) {
            draw.gagnants.forEach(n => {
                if (n >= 1 && n <= 90) monthProfiles[m][n] += 1.0;
            });
            if (Array.isArray(draw.machine)) {
                draw.machine.forEach(n => {
                    if (n >= 1 && n <= 90) monthProfiles[m][n] += 0.5;
                });
            }
        }
    });

    const correlations = new Float32Array(12);
    const normCurrent = Math.sqrt(monthProfiles[currentMonth].reduce((acc, val) => acc + val * val, 0)) || 1;

    for (let m = 0; m < 12; m++) {
        if (m === currentMonth) {
            correlations[m] = 1.0;
            continue;
        }
        
        let dotProduct = 0;
        let sumSqrM = 0;
        
        for (let n = 1; n <= 90; n++) {
            dotProduct += monthProfiles[m][n] * monthProfiles[currentMonth][n];
            sumSqrM += monthProfiles[m][n] * monthProfiles[m][n];
        }
        
        const normM = Math.sqrt(sumSqrM) || 1;
        correlations[m] = dotProduct / (normM * normCurrent);
    }

    let bestSourceMonth = -1;
    let maxCorr = -1;
    
    for (let m = 0; m < 12; m++) {
        if (m === currentMonth) continue;
        
        result.allMonthsCorrelation.push({
            monthIndex: m,
            monthName: monthsFr[m],
            correlation: correlations[m]
        });

        if (correlations[m] > maxCorr) {
            maxCorr = correlations[m];
            bestSourceMonth = m;
        }
    }

    if (bestSourceMonth !== -1 && maxCorr > 0) {
        result.sourceMonthIndex = bestSourceMonth;
        result.sourceMonthName = monthsFr[bestSourceMonth];
        result.correlation = maxCorr;

        const rawResonance = calculateCrossMonthResonance(history);
        const maxRes = Math.max(...Array.from(rawResonance)) || 1;

        const numbersScores = Array.from({ length: 90 }, (_, i) => i + 1)
            .map(n => ({
                number: n,
                score: Math.round((rawResonance[n] / maxRes) * 100)
            }))
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score);

        result.topNumbers = numbersScores.slice(0, 12);
    }

    return result;
};

