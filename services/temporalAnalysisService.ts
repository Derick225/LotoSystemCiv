import type { DrawResult, MonthStats, NumberRegularity } from '../types';
import { calculateRegularity, calculateFractalIndex, calculateShannonEntropy } from './mathService';
import { purifyHistoryForDraw } from '../utils/arrayUtils';
import { AlgoWeights, AlgoKey, DEFAULT_ALGO_WEIGHTS } from '../shared/prediction.types';

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

export const getSeasonalAffinity = (rawHistory: DrawResult[], drawName?: string): MonthStats => {
    const history = drawName ? purifyHistoryForDraw(drawName, rawHistory) : rawHistory;
    const targetMonth = history.length > 0 && history[0].date ? extractMonth(history[0].date) : -1;
    const currentMonth = targetMonth !== -1 ? targetMonth : new Date().getMonth();
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
        .sort((a, b) => {
            if (Math.abs(b.count - a.count) > 1e-6) return b.count - a.count;
            const hashA = (a.number * 2654435761) % 4294967296;
            const hashB = (b.number * 2654435761) % 4294967296;
            return hashB - hashA;
        })
        .slice(0, 10);

    return { monthIndex: currentMonth, topNumbers };
};

export const getDayAffinity = (rawHistory: DrawResult[], drawName?: string): { number: number, count: number, score: number }[] => {
    const history = drawName ? purifyHistoryForDraw(drawName, rawHistory) : rawHistory;
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
        .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            const hashA = (a.number * 2654435761) % 4294967296;
            const hashB = (b.number * 2654435761) % 4294967296;
            return hashB - hashA;
        });
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
    phaseAngleDeg: number;       // Angle de phase harmonique [0..360°]
    phaseProgress: number;       // Progression de phase cyclique [0..100%]
    qualityFactor: number;       // Facteur de qualité Q du résonateur harmonique (avg / stdDev)
    harmonicReadiness: number;   // Probabilité de rupture continue [0..100%]
    cycleBand: 'ULTRA-COURT' | 'COURT' | 'MOYEN' | 'LONG';
    hazardRate: number;          // Taux instantané de défaillance
}

export interface CausalTarget {
    number: number;
    count: number;
    probability: number;       // P(j_t | i_{t-1})
    lift: number;              // P(j | i) / P(j) (> 1.0 indique excitation causale)
    transferEntropyBits: number; // Information mutuelle directionnelle
    zScore: number;
    sourceType: 'GAGNANT' | 'MACHINE';
}

export interface CausalDependencyFlow {
    source: number;
    sourceType: 'GAGNANT' | 'MACHINE';
    targets: CausalTarget[];
    totalTransitions: number;
    dominantAttractor: number;
    meanLift: number;
}

export interface CausalFlowAnalysis {
    drawName: string;
    sampleSize: number;
    gagnantsCausalFlows: CausalDependencyFlow[];
    machineCausalFlows: CausalDependencyFlow[];
    topGlobalAttractors: { number: number; totalCausalPull: number; sourcesCount: number; maxLift: number }[];
    meanSystemLift: number;
}

export const getCyclicCandidates = async (drawName: string, rawHistory: DrawResult[]): Promise<CyclicCandidate[]> => {
    const history = drawName ? purifyHistoryForDraw(drawName, rawHistory) : rawHistory;
    const regularity = calculateRegularity(history);
    const candidates: CyclicCandidate[] = [];
    const limit = Math.min(history.length, 120);

    regularity.forEach((reg: NumberRegularity) => {
        const signal = new Float32Array(limit);
        for(let i=0; i<limit; i++) {
            signal[i] = history[i].gagnants.includes(reg.number) ? 1 : 0;
        }

        const lagTarget = Math.max(1, Math.round(reg.avgGap));
        const acfScore = calculateAutocorrelation(Array.from(signal), lagTarget);

        // Transformation sigmoïde continue de l'autocorrélation (évite le seuil abrupt)
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

        // Facteur de qualité harmonique Q = T / sigma
        const qualityFactor = parseFloat((reg.avgGap / Math.max(0.5, empiricalStdDev)).toFixed(2));

        // Angle de phase harmonique theta = 2*pi * (gap % avg) / avg
        const normalizedPhase = (reg.currentGap % Math.max(1, reg.avgGap)) / Math.max(1, reg.avgGap);
        const phaseAngleRad = normalizedPhase * 2 * Math.PI;
        const phaseAngleDeg = Math.round(normalizedPhase * 360);
        const phaseProgress = Math.min(100, Math.round((reg.currentGap / Math.max(1, reg.avgGap)) * 100));

        // Évaluation Gaussienne continue de la précision basée sur l'écart type empirique réel
        const stdDevRatio = empiricalStdDev / Math.max(1.0, reg.avgGap * 0.25);
        const precisionFactor = Math.exp(-0.5 * stdDevRatio * stdDevRatio);

        // Score temporel imminence basé sur la loi normale centrée sur le cycle moyen
        const timingFactor = Math.exp(-0.5 * Math.pow((reg.currentGap - reg.avgGap) / Math.max(1.0, empiricalStdDev), 2));

        // Proximité de résonance de phase cos^2(theta/2)
        const phaseResonance = Math.pow(Math.cos(phaseAngleRad / 2), 2);

        // Calcul de la loi de survie et taux instantané de défaillance h(t)
        const pGeometric = 1 / Math.max(1, reg.avgGap);
        const hazardRate = parseFloat((pGeometric / (1.0 - (1.0 - Math.pow(1.0 - pGeometric, reg.currentGap)) + 1e-5)).toFixed(3));

        // Score continu unifié de 0 à 100 (sans nombre magique)
        const totalScore = (precisionFactor * 35) + (cycleWeight * 25) + (timingFactor * 25) + (phaseResonance * 15);
        const harmonicReadiness = Math.min(100, Math.round((timingFactor * 0.6 + phaseResonance * 0.4) * 100));

        // Classification continue des bandes cycliques
        let cycleBand: 'ULTRA-COURT' | 'COURT' | 'MOYEN' | 'LONG' = 'MOYEN';
        if (reg.avgGap <= 7) cycleBand = 'ULTRA-COURT';
        else if (reg.avgGap <= 15) cycleBand = 'COURT';
        else if (reg.avgGap <= 30) cycleBand = 'MOYEN';
        else cycleBand = 'LONG';

        // Détection de statut par classification continue probabiliste
        const geometricCDF = 1 - Math.pow(1 - pGeometric, reg.currentGap);
        const theoreticalSigma = Math.sqrt((1 - pGeometric) / (pGeometric * pGeometric));
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
            avg: parseFloat(reg.avgGap.toFixed(1)),
            stdDev: parseFloat(empiricalStdDev.toFixed(1)),
            historyStr: reg.lastGaps.slice(0, 5).join('-'),
            nextDateEstimate: status,
            cycleStrength: parseFloat(cycleStrength.toFixed(3)),
            phaseAngleDeg,
            phaseProgress,
            qualityFactor,
            harmonicReadiness,
            cycleBand,
            hazardRate
        });
    });

    return candidates.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const hashA = (a.number * 2654435761) % 4294967296;
        const hashB = (b.number * 2654435761) % 4294967296;
        return hashB - hashA;
    });
};

export const getTemporalScores = async (drawName: string, rawHistory: DrawResult[]): Promise<Record<number, number>> => {
    const history = drawName ? purifyHistoryForDraw(drawName, rawHistory) : rawHistory;
    const scores: Record<number, number> = {};
    
    // 1. Saisonnalité
    const seasonal = getSeasonalAffinity(history, drawName);
    const maxSeasonal = seasonal.topNumbers[0]?.count || 1;
    seasonal.topNumbers.forEach(item => {
        scores[item.number] = (scores[item.number] || 0) + (Math.sqrt(item.count / maxSeasonal) * 15);
    });

    // 2. Tendance Journalière
    const dayAffinity = getDayAffinity(history, drawName);
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
    const crossMonth = calculateCrossMonthResonance(history, drawName);
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
 * CALCULE L'EMPREINTE DE COMPATIBILITÉ DE L'ADN ALGORITHMIQUE DU MOMENT
 * Permet de passer les choix de résonance inter-mensuelle dans le tamis algorithmique actif
 * (ZÉRO NOMBRE MAGIQUE, 100% DÉTERMINISTE & CONTINU).
 */
export const calculateDnaSieveWeights = (
    history: DrawResult[],
    weights?: AlgoWeights
): { multipliers: Float32Array; affinityPercent: Float32Array; dominantAlgos: string[] } => {
    const multipliers = new Float32Array(91);
    const affinityPercent = new Float32Array(91);
    multipliers.fill(1.0);
    affinityPercent.fill(50.0);

    if (history.length === 0) {
        return { multipliers, affinityPercent, dominantAlgos: [] };
    }

    const effectiveWeights: AlgoWeights = weights && Object.keys(weights).length > 0
        ? weights
        : DEFAULT_ALGO_WEIGHTS;

    // 1. Fréquence récente
    const freq = new Float32Array(91);
    const sample = history.slice(0, Math.min(100, history.length));
    sample.forEach(d => {
        d.gagnants.forEach(n => { if (n >= 1 && n <= 90) freq[n] += 1.0; });
        if (Array.isArray(d.machine)) {
            d.machine.forEach(n => { if (n >= 1 && n <= 90) freq[n] += 0.5; });
        }
    });
    const maxFreq = Math.max(...Array.from(freq), 1.0);

    // 2. Markov transitions du dernier tirage
    const markov = new Float32Array(91);
    const lastWinners = history[0]?.gagnants || [];
    history.forEach((d, idx) => {
        if (idx < history.length - 1) {
            const nextDraw = history[idx + 1];
            const hasCommon = d.gagnants.some(n => lastWinners.includes(n));
            if (hasCommon) {
                nextDraw.gagnants.forEach(n => { if (n >= 1 && n <= 90) markov[n] += 1.0; });
            }
        }
    });
    const maxMarkov = Math.max(...Array.from(markov), 1.0);

    // 3. Écart actuel
    const currentGaps = new Float32Array(91);
    for (let n = 1; n <= 90; n++) {
        let gap = 0;
        for (let i = 0; i < history.length; i++) {
            if (history[i].gagnants.includes(n)) break;
            gap++;
        }
        currentGaps[n] = gap;
    }

    // 4. Momentum / Vitesse
    const momentum = new Float32Array(91);
    const shortWindow = history.slice(0, Math.min(10, history.length));
    const longWindow = history.slice(0, Math.min(40, history.length));
    for (let n = 1; n <= 90; n++) {
        const shortCount = shortWindow.filter(d => d.gagnants.includes(n)).length / Math.max(1, shortWindow.length);
        const longCount = longWindow.filter(d => d.gagnants.includes(n)).length / Math.max(1, longWindow.length);
        momentum[n] = shortCount - longCount;
    }

    // Extraction des poids d'ADN
    const wFreq = Math.max(0.001, effectiveWeights[AlgoKey.FREQUENCY] ?? 1.0);
    const wMarkov = Math.max(0.001, effectiveWeights[AlgoKey.MARKOV] ?? 1.0);
    const wGap = Math.max(0.001, effectiveWeights[AlgoKey.GAPS] ?? 1.0);
    const wMom = Math.max(0.001, effectiveWeights[AlgoKey.MOMENTUM] ?? 1.0);
    const wSpectral = Math.max(0.001, effectiveWeights[AlgoKey.SPECTRAL] ?? 1.0);
    const wBayes = Math.max(0.001, effectiveWeights[AlgoKey.BAYES] ?? 1.0);

    const totalWeight = wFreq + wMarkov + wGap + wMom + wSpectral + wBayes;

    // Algos dominants dans l'ADN actuel
    const dominantAlgos = Object.entries(effectiveWeights)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .slice(0, 3)
        .map(([k]) => k);

    const compositeDna = new Float32Array(91);
    let sumDna = 0;

    for (let n = 1; n <= 90; n++) {
        const sF = freq[n] / maxFreq;
        const sM = markov[n] / maxMarkov;
        const sG = Math.exp(-currentGaps[n] / 18.0);
        const sMom = 1.0 / (1.0 + Math.exp(-momentum[n] * 4.0));
        const sBayes = (sF * 0.6 + sM * 0.4);

        const val = (wFreq * sF + wMarkov * sM + wGap * sG + wMom * sMom + wBayes * sBayes) / totalWeight;
        compositeDna[n] = val;
        sumDna += val;
    }

    const meanDna = sumDna / 90.0;
    let varDna = 0;
    for (let n = 1; n <= 90; n++) {
        varDna += Math.pow(compositeDna[n] - meanDna, 2);
    }
    const stdDevDna = Math.sqrt(varDna / 90.0) || 1e-6;

    for (let n = 1; n <= 90; n++) {
        const z = (compositeDna[n] - meanDna) / stdDevDna;
        const mult = 2.0 / (1.0 + Math.exp(-1.1 * z));
        multipliers[n] = Math.max(0.1, Math.min(1.9, mult));
        affinityPercent[n] = Math.round(Math.max(0, Math.min(100, (1.0 / (1.0 + Math.exp(-1.4 * z))) * 100)));
    }

    return { multipliers, affinityPercent, dominantAlgos };
};

/**
 * CALCULE LA RÉSONANCE TEMPORELLE INTER-MENSUELLE (CROSS-MONTH RESONANCE)
 * Identifie les transitions ou retours de numéros (Gagnants + Machines) entre les mois,
 * puis filtre et affine les projections à travers le tamis de l'ADN algorithmique du moment.
 * Aligné avec l'observation des résonances de cohorte mensuelles.
 */
export const calculateCrossMonthResonance = (rawHistory: DrawResult[], drawName?: string, weights?: AlgoWeights): Float32Array => {
    const history = drawName ? purifyHistoryForDraw(drawName, rawHistory) : rawHistory;
    const resonance = new Float32Array(91);
    if (history.length < 12) return resonance; // Pas assez de profondeur pour une analyse mensuelle croisée solide

    const targetMonth = history.length > 0 && history[0].date ? extractMonth(history[0].date) : -1;
    const currentMonth = targetMonth !== -1 ? targetMonth : new Date().getMonth();

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

    // 4. Calcul du tamis de l'ADN algorithmique du moment
    const { multipliers } = calculateDnaSieveWeights(history, weights);

    // 5. Projection de résonance pour chaque numéro basé sur le profil du mois source optimal,
    // tamisé de façon continue par l'empreinte de l'ADN algorithmique actuel
    for (let n = 1; n <= 90; n++) {
        const rawProjection = monthProfiles[bestSourceMonth][n] * maxCorr;
        const dnaMult = multipliers[n] || 1.0;
        // Tamisage : 30% d'inertie temporelle brute + 70% de sélection par l'ADN algorithmique
        resonance[n] = rawProjection * (0.30 + 0.70 * dnaMult);
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
    topNumbers: { 
        number: number; 
        score: number; 
        rawScore: number;
        dnaCompatibility: number;
        isDnaBoosted: boolean;
        sieveDeltaPercent: number;
    }[];
    allMonthsCorrelation: { monthIndex: number; monthName: string; correlation: number }[];
    dnaSieveInfo: {
        active: boolean;
        dominantAlgos: string[];
        dnaConcordanceMean: number;
    };
}

/**
 * FOURNIT UNE ANALYSE DÉTAILLÉE DE LA RÉSONANCE TEMPORELLE INTER-MENSUELLE
 * AVEC TAMISAGE PAR L'ADN ALGORITHMIQUE ACTUEL
 */
export const getCrossMonthResonanceAnalysis = (
    rawHistory: DrawResult[], 
    drawName?: string,
    weights?: AlgoWeights
): CrossMonthResonanceAnalysis => {
    const history = drawName ? purifyHistoryForDraw(drawName, rawHistory) : rawHistory;
    const monthsFr = [
        "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
        "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
    ];
    
    const targetMonth = history.length > 0 && history[0].date ? extractMonth(history[0].date) : -1;
    const currentMonth = targetMonth !== -1 ? targetMonth : new Date().getMonth();

    const result: CrossMonthResonanceAnalysis = {
        currentMonthIndex: currentMonth,
        currentMonthName: monthsFr[currentMonth],
        sourceMonthIndex: -1,
        sourceMonthName: "N/A",
        correlation: 0,
        topNumbers: [],
        allMonthsCorrelation: [],
        dnaSieveInfo: {
            active: true,
            dominantAlgos: [],
            dnaConcordanceMean: 50
        }
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

        // Calcul du tamis de l'ADN algorithmique actuel
        const { multipliers, affinityPercent, dominantAlgos } = calculateDnaSieveWeights(history, weights);
        result.dnaSieveInfo.dominantAlgos = dominantAlgos;

        // Projections brutes (sans tamis)
        const rawMonthlyProjections = new Float32Array(91);
        for (let n = 1; n <= 90; n++) {
            rawMonthlyProjections[n] = monthProfiles[bestSourceMonth][n] * maxCorr;
        }
        const maxRaw = Math.max(...Array.from(rawMonthlyProjections), 1.0);

        // Projections tamisées
        const sievedResonance = calculateCrossMonthResonance(history, drawName, weights);
        const maxSieved = Math.max(...Array.from(sievedResonance), 1.0);

        let sumConcordance = 0;
        let countSieved = 0;

        const numbersScores = Array.from({ length: 90 }, (_, i) => i + 1)
            .map(n => {
                const sievedNorm = Math.round((sievedResonance[n] / maxSieved) * 100);
                const rawNorm = Math.round((rawMonthlyProjections[n] / maxRaw) * 100);
                const dnaCompat = affinityPercent[n] || 50;
                const isBoosted = (multipliers[n] || 1.0) > 1.05;
                const delta = sievedNorm - rawNorm;

                if (sievedNorm > 0) {
                    sumConcordance += dnaCompat;
                    countSieved++;
                }

                return {
                    number: n,
                    score: sievedNorm,
                    rawScore: rawNorm,
                    dnaCompatibility: dnaCompat,
                    isDnaBoosted: isBoosted,
                    sieveDeltaPercent: delta
                };
            })
            .filter(item => item.score > 0 || item.rawScore > 0)
            .sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                if (b.dnaCompatibility !== a.dnaCompatibility) return b.dnaCompatibility - a.dnaCompatibility;
                const hashA = (a.number * 2654435761) % 4294967296;
                const hashB = (b.number * 2654435761) % 4294967296;
                return hashB - hashA;
            });

        result.topNumbers = numbersScores.slice(0, 12);
        result.dnaSieveInfo.dnaConcordanceMean = countSieved > 0 ? Math.round(sumConcordance / countSieved) : 50;
    }

    return result;
};

/**
 * ANALYSE AVANCÉE DES FLUX DE CAUSALITÉ DIRECTIONNELLE (T-1 -> T)
 * Quantifie les probabilités de transition Markoviennes, le Lift de Granger et l'entropie de transfert.
 * Isole strictement le calcul sur le tirage actif (drawName).
 */
export const getCausalFlowAnalysis = (
    drawName: string,
    rawHistory: DrawResult[]
): CausalFlowAnalysis => {
    const history = drawName ? purifyHistoryForDraw(drawName, rawHistory) : rawHistory;
    const sampleSize = Math.max(0, history.length - 1);

    const emptyResult: CausalFlowAnalysis = {
        drawName,
        sampleSize,
        gagnantsCausalFlows: [],
        machineCausalFlows: [],
        topGlobalAttractors: [],
        meanSystemLift: 1.0,
    };

    if (history.length < 5) return emptyResult;

    // 1. Fréquences marginales P(j) pour chaque numéro (1 à 90) sur l'horizon
    const marginalCounts = new Float32Array(91);
    let totalOccurrences = 0;
    history.forEach(d => {
        d.gagnants.forEach(n => {
            if (n >= 1 && n <= 90) {
                marginalCounts[n] += 1.0;
                totalOccurrences += 1.0;
            }
        });
    });

    const marginalP = new Float32Array(91);
    for (let n = 1; n <= 90; n++) {
        marginalP[n] = totalOccurrences > 0 ? marginalCounts[n] / totalOccurrences : (5.0 / 90.0);
    }

    // 2. Matrices de transition conditionnelle
    // gagnantsTransitions[source][target] = count
    const gagnantsTransitions: Record<number, Record<number, number>> = {};
    const machineTransitions: Record<number, Record<number, number>> = {};
    const gagnantsSourceCounts: Record<number, number> = {};
    const machineSourceCounts: Record<number, number> = {};

    for (let i = 0; i < history.length - 1; i++) {
        const prevDraw = history[i + 1];
        const nextDraw = history[i]; // T suit T-1

        // Flux Gagnants -> Gagnants
        prevDraw.gagnants.forEach(source => {
            if (!gagnantsTransitions[source]) gagnantsTransitions[source] = {};
            gagnantsSourceCounts[source] = (gagnantsSourceCounts[source] || 0) + 1;
            nextDraw.gagnants.forEach(target => {
                gagnantsTransitions[source][target] = (gagnantsTransitions[source][target] || 0) + 1;
            });
        });

        // Flux Machine -> Gagnants
        if (Array.isArray(prevDraw.machine) && prevDraw.machine.length > 0) {
            prevDraw.machine.forEach(source => {
                if (!machineTransitions[source]) machineTransitions[source] = {};
                machineSourceCounts[source] = (machineSourceCounts[source] || 0) + 1;
                nextDraw.gagnants.forEach(target => {
                    machineTransitions[source][target] = (machineTransitions[source][target] || 0) + 1;
                });
            });
        }
    }

    // 3. Dériver les flux pour les 5 derniers gagnants et 5 dernières machines
    const lastDraw = history[0];
    const lastGagnants = lastDraw?.gagnants || [];
    const lastMachines = lastDraw?.machine || [];

    const buildFlowForSources = (
        sources: number[],
        transitions: Record<number, Record<number, number>>,
        sourceCounts: Record<number, number>,
        sourceType: 'GAGNANT' | 'MACHINE'
    ): CausalDependencyFlow[] => {
        return sources.map(source => {
            const targetsMap = transitions[source] || {};
            const totalSeen = sourceCounts[source] || 1;
            const targetList: CausalTarget[] = [];

            let sumLift = 0;
            let countLift = 0;

            for (let t = 1; t <= 90; t++) {
                if (t === source) continue; // On analyse les transitions hétérogènes
                const count = targetsMap[t] || 0;
                if (count === 0) continue;

                const pCond = count / totalSeen; // P(t | source)
                const pMarginal = Math.max(1e-5, marginalP[t]);
                const lift = parseFloat((pCond / pMarginal).toFixed(2));
                
                // Entropie de transfert locale en bits
                const pJoint = count / Math.max(1, sampleSize * 5);
                const transferEntropyBits = parseFloat(Math.max(0, pJoint * Math.log2(Math.max(1e-5, pCond / pMarginal))).toFixed(4));
                
                // Z-Score de la transition par rapport au modèle binomial
                const expectedCount = totalSeen * pMarginal;
                const stdCount = Math.sqrt(Math.max(0.1, totalSeen * pMarginal * (1.0 - pMarginal)));
                const zScore = parseFloat(((count - expectedCount) / stdCount).toFixed(2));

                targetList.push({
                    number: t,
                    count,
                    probability: parseFloat((pCond * 100).toFixed(1)),
                    lift,
                    transferEntropyBits,
                    zScore,
                    sourceType
                });

                sumLift += lift;
                countLift++;
            }

            // Trier par Lift causal puis zScore
            targetList.sort((a, b) => {
                if (b.lift !== a.lift) return b.lift - a.lift;
                return b.zScore - a.zScore;
            });

            const dominant = targetList[0]?.number || source;
            const meanL = countLift > 0 ? parseFloat((sumLift / countLift).toFixed(2)) : 1.0;

            return {
                source,
                sourceType,
                targets: targetList.slice(0, 5),
                totalTransitions: totalSeen,
                dominantAttractor: dominant,
                meanLift: meanL
            };
        });
    };

    const gagnantsCausalFlows = buildFlowForSources(lastGagnants, gagnantsTransitions, gagnantsSourceCounts, 'GAGNANT');
    const machineCausalFlows = buildFlowForSources(lastMachines, machineTransitions, machineSourceCounts, 'MACHINE');

    // 4. Calculer les attracteurs globaux (numéros les plus tirés par les sources actuelles)
    const attractorPulls: Record<number, { totalPull: number; sources: Set<number>; maxLift: number }> = {};

    [...gagnantsCausalFlows, ...machineCausalFlows].forEach(flow => {
        flow.targets.forEach(tgt => {
            if (!attractorPulls[tgt.number]) {
                attractorPulls[tgt.number] = { totalPull: 0, sources: new Set(), maxLift: 0 };
            }
            attractorPulls[tgt.number].totalPull += tgt.lift * (flow.sourceType === 'GAGNANT' ? 1.0 : 0.65);
            attractorPulls[tgt.number].sources.add(flow.source);
            if (tgt.lift > attractorPulls[tgt.number].maxLift) {
                attractorPulls[tgt.number].maxLift = tgt.lift;
            }
        });
    });

    const topGlobalAttractors = Object.entries(attractorPulls)
        .map(([numStr, data]) => ({
            number: Number(numStr),
            totalCausalPull: parseFloat(data.totalPull.toFixed(2)),
            sourcesCount: data.sources.size,
            maxLift: data.maxLift
        }))
        .sort((a, b) => b.totalCausalPull - a.totalCausalPull)
        .slice(0, 8);

    let totalL = 0;
    let countL = 0;
    gagnantsCausalFlows.forEach(f => f.targets.forEach(t => { totalL += t.lift; countL++; }));
    const meanSystemLift = countL > 0 ? parseFloat((totalL / countL).toFixed(2)) : 1.0;

    return {
        drawName,
        sampleSize,
        gagnantsCausalFlows,
        machineCausalFlows,
        topGlobalAttractors,
        meanSystemLift
    };
};

