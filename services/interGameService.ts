
import { fetchResults } from './lotteryService';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import type { DrawResult, InterGameHeat, DayFlowMetrics } from '../types';
import { DRAW_SCHEDULE } from '../constants';

// --- CACHE SYSTÈME (TTL 5 min) ---
const MARKET_CACHE = {
    data: [] as any[],
    timestamp: 0,
    TTL: 300000 
};

// --- MATH HELPERS ---

/**
 * Convertit une liste de numéros (ex: [5, 10...]) en vecteur binaire de taille 90.
 */
const toBinaryVector = (numbers: number[]): Int8Array => {
    const v = new Int8Array(90); // Index 0-89 correspond à 1-90
    for (const n of numbers) {
        if (n >= 1 && n <= 90) v[n - 1] = 1;
    }
    return v;
};

/**
 * Calcule la Corrélation de Pearson entre deux tirages (Vecteurs binaires).
 * Retourne une valeur entre -1 (opposés) et 1 (identiques).
 */
const calculatePearsonCorrelation = (vecA: Int8Array, vecB: Int8Array): number => {
    const n = 90;
    let sumA = 0, sumB = 0, sumAB = 0;
    let sqSumA = 0, sqSumB = 0;

    for (let i = 0; i < n; i++) {
        const a = vecA[i];
        const b = vecB[i];
        sumA += a;
        sumB += b;
        sumAB += a * b;
        sqSumA += a * a;
        sqSumB += b * b;
    }

    const numerator = (n * sumAB) - (sumA * sumB);
    const denominator = Math.sqrt(((n * sqSumA) - (sumA * sumA)) * ((n * sqSumB) - (sumB * sumB)));

    if (denominator === 0) return 0;
    return numerator / denominator;
};

/**
 * Recherche Binaire pour trouver le tirage le plus proche dans le passé.
 * Suppose que `draws` est trié par date décroissante (le plus récent à l'index 0).
 */
const findClosestPreviousDraw = (draws: any[], targetTime: number): any | null => {
    let low = 0;
    let high = draws.length - 1;
    let bestIdx = -1;

    while (low <= high) {
        const mid = (low + high) >>> 1;
        const midDate = new Date(draws[mid].date).getTime();

        if (midDate < targetTime) {
            // C'est un candidat (plus vieux que la cible), on essaie de trouver plus récent (index plus petit)
            bestIdx = mid;
            high = mid - 1; 
        } else {
            // Trop récent ou égal, on doit chercher plus loin dans le tableau (index plus grand)
            low = mid + 1;
        }
    }

    // Validation de la fenêtre temporelle (ex: max 48h avant)
    if (bestIdx !== -1) {
        const diff = targetTime - new Date(draws[bestIdx].date).getTime();
        if (diff > 172800000) return null; // > 48h
        return draws[bestIdx];
    }
    return null;
};

/**
 * Analyse si les résultats d'un jeu influencent mathématiquement le suivant (Translocation).
 */
export const analyzeMigrationFlux = async (targetDrawName: string): Promise<InterGameHeat | null> => {
    const { data: targetHist } = await fetchResults(targetDrawName);
    if (!targetHist || targetHist.length === 0) return null;

    const latestDraw = targetHist[0];
    let targetDate: Date;
    
    // Normalisation Date
    if (latestDraw.date.includes('/')) {
        const [d, m, y] = latestDraw.date.split('/').map(Number);
        targetDate = new Date(y, m - 1, d);
    } else {
        targetDate = new Date(latestDraw.date);
    }
    const targetTimestamp = targetDate.getTime();

    // Gestion Cache Global
    const now = Date.now();
    if (MARKET_CACHE.data.length === 0 || (now - MARKET_CACHE.timestamp > MARKET_CACHE.TTL)) {
        if (isSupabaseConfigured()) {
            const { data } = await supabase
                .from('draw_results')
                .select('draw_name, date, gagnants')
                .order('date', { ascending: false }) // Important pour Binary Search
                .limit(400);
            
            if (data) {
                MARKET_CACHE.data = data;
                MARKET_CACHE.timestamp = now;
            }
        } else {
            return null;
        }
    }

    // On exclut le jeu cible lui-même pour trouver une influence EXTERNE
    const candidateDraws = MARKET_CACHE.data.filter(d => d.draw_name !== targetDrawName);
    
    // Recherche Optimisée (O(log N))
    const sourceDrawData = findClosestPreviousDraw(candidateDraws, targetTimestamp);

    if (!sourceDrawData) return null;

    // Calculs de Corrélation
    const vecTarget = toBinaryVector(latestDraw.gagnants);
    const vecSource = toBinaryVector(sourceDrawData.gagnants);
    
    // Pearson (Structure) + Jaccard (Contenu)
    const pearson = calculatePearsonCorrelation(vecTarget, vecSource);
    const intersection = latestDraw.gagnants.filter(n => sourceDrawData.gagnants.includes(n));
    
    // Score Hybride : Pearson donne la tendance, Intersection donne la force brute
    // On scale Pearson (-1..1) vers (0..100) pour l'affichage
    const pearsonScaled = ((pearson + 1) / 2) * 100;
    
    // Ajustement avec les voisins (Pression de proximité)
    let neighborPressure = 0;
    sourceDrawData.gagnants.forEach((src: number) => {
        if (latestDraw.gagnants.includes(src - 1) || latestDraw.gagnants.includes(src + 1)) {
            neighborPressure += 10;
        }
    });

    const correlationFactor = Math.min(100, Math.round((pearsonScaled * 0.4) + (intersection.length * 20) + neighborPressure));

    return {
        sourceGame: sourceDrawData.draw_name,
        targetGame: targetDrawName,
        correlationFactor,
        migratingNumbers: intersection
    };
};

/**
 * Analyse la résonance intra-journalière (Momentum Vectoriel).
 */
export const analyzeIntraDayResonance = async (targetDrawName: string, dayName: string): Promise<DayFlowMetrics | null> => {
    if (!isSupabaseConfigured()) return null;

    const daySchedule = DRAW_SCHEDULE[dayName];
    if (!daySchedule) return null;

    const targetTime = Object.keys(daySchedule).find(time => daySchedule[time] === targetDrawName);
    if (!targetTime) return null;

    const previousDrawsOfDay: string[] = [];
    Object.entries(daySchedule).forEach(([time, name]) => {
        if (time < targetTime && name !== targetDrawName) {
            previousDrawsOfDay.push(name);
        }
    });

    if (previousDrawsOfDay.length === 0) return null;

    const { data: latestTarget } = await fetchResults(targetDrawName);
    if (!latestTarget || latestTarget.length === 0) return null;
    
    // Normalisation Date
    let dateRef = latestTarget[0].date;
    if (dateRef.includes('/')) {
        const [d, m, y] = dateRef.split('/');
        dateRef = `${y}-${m}-${d}`;
    }

    const { data: dayResults } = await supabase
        .from('draw_results')
        .select('gagnants, draw_name, date')
        .in('draw_name', previousDrawsOfDay)
        .eq('date', dateRef)
        .order('created_at', { ascending: true }); // Chronologique

    if (!dayResults || dayResults.length === 0) return null;

    // --- ANALYSE DE FLUX VECTORIEL ---
    const numberVelocity: Record<number, number> = {};
    const counts: Record<number, number> = {};
    const decades: Record<number, number> = {};

    dayResults.forEach((draw, idx) => {
        // Poids temporel : Les tirages récents ont plus d'impact (Accélération)
        const timeWeight = 1 + (idx * 0.5); 
        
        draw.gagnants.forEach((n: number) => {
            counts[n] = (counts[n] || 0) + 1;
            numberVelocity[n] = (numberVelocity[n] || 0) + timeWeight;
            
            const dec = Math.floor((n-1)/10);
            decades[dec] = (decades[dec] || 0) + 1;
        });
    });

    // Numéros avec vélocité élevée (sortent de plus en plus tard dans la journée)
    const echoNumbers = Object.entries(numberVelocity)
        .sort((a, b) => b[1] - a[1]) // Tri par vélocité
        .filter(([_, v]) => v >= 1.5) // Seuil minimal
        .map(([n]) => parseInt(n))
        .slice(0, 5);

    const hotDecades = Object.entries(decades)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([d]) => parseInt(d));

    // Calcul du Momentum Global du Jour (0-100)
    // Basé sur la variance des fréquences (si certains numéros monopolisent, momentum fort)
    const totalFreq = Object.values(counts).reduce((a, b) => a + b, 0);
    const avgFreq = totalFreq / 90;
    const variance = Object.values(counts).reduce((acc, val) => acc + Math.pow(val - avgFreq, 2), 0) / 90;
    
    // Normalisation heuristique
    const dayMomentum = Math.min(100, Math.round(Math.sqrt(variance) * 50));

    // Bias Matin/Soir : Si > 50, tendance à la répétition le soir
    const morningToEveningBias = dayResults.length > 1 
        ? Math.min(100, (echoNumbers.length / 5) * 100)
        : 50;

    return {
        dayMomentum,
        echoNumbers,
        hotDecades,
        morningToEveningBias
    };
};
