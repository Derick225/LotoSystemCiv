
/**
 * Utilitaires mathématiques partagés pour l'analyse stochastique.
 * Centralise les calculs de moyenne, écart-type, Hurst et cycles.
 */

export const calculateMean = (data: number[]): number => {
    if (data.length === 0) return 0;
    return data.reduce((a, b) => a + b, 0) / data.length;
};

export const calculateStandardDeviation = (data: number[]): number => {
    if (data.length === 0) return 0;
    const mean = calculateMean(data);
    const variance = data.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / data.length;
    return Math.sqrt(variance);
};

/**
 * Analyse R/S (Rescaled Range) pour estimer l'exposant de Hurst sur une série temporelle.
 * @param signal Série de données (ex: binaire 0/1 ou valeurs continues)
 */
export const calculateHurstForSeries = (signal: number[]): number => {
    const N = signal.length;
    if (N < 10) return 0.5;

    const mean = calculateMean(signal);
    const y = signal.map(x => x - mean);
    
    let cumsum = 0;
    const cumDev = y.map(val => {
        cumsum += val;
        return cumsum;
    });

    const R = Math.max(...cumDev) - Math.min(...cumDev);
    const S = calculateStandardDeviation(signal);

    if (R === 0 || S === 0) return 0.5;

    // Formule empirique ajustée pour les petits échantillons
    const hurst = Math.log(R / S) / Math.log(N);
    return Math.max(0, Math.min(1, hurst));
};

/**
 * Calcule la volatilité et la tendance d'une série numérique.
 */
export const calculateSeriesVolatility = (data: number[]): { score: number; status: string; trend: string } => {
    if (data.length < 10) return { score: 0, status: 'Unknown', trend: 'Flat' };
    
    const stdDev = calculateStandardDeviation(data);
    // Normalisation arbitraire sur une échelle 0-100 basée sur la variance attendue
    const score = Math.min(100, Math.round(stdDev));
    
    const recentMean = calculateMean(data.slice(0, 5));
    const globalMean = calculateMean(data);
    const trend = recentMean > globalMean ? 'Rising' : 'Falling';
    
    const status = score > 60 ? 'Chaos' : score > 30 ? 'Volatile' : 'Stable';
    
    return { score, status, trend };
};

/**
 * Détecte si une série d'écarts (gaps) présente une structure cyclique stable.
 */
export const detectPositionalCycles = (gaps: number[]): { hasCycle: boolean; period: number; strength: number; precision: number } => {
    if (gaps.length < 2) return { hasCycle: false, period: 0, strength: 0, precision: 0 };

    const avg = calculateMean(gaps);
    const stdDev = calculateStandardDeviation(gaps);
    
    // Un écart-type faible indique une périodicité forte
    const isStable = stdDev < 5.0;
    
    // Calcul de la "force" du cycle (inverse de la variance, normalisé)
    const precisionScore = Math.max(0, 10 - stdDev) * 10;
    
    return {
        hasCycle: isStable,
        period: avg,
        strength: precisionScore, // 0-100
        precision: stdDev
    };
};
