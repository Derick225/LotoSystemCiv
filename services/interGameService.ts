
import { fetchResults } from './lotteryService';
import { supabase, isSupabaseConfigured } from './supabaseClient';
import type { DrawResult, InterGameHeat, DayFlowMetrics } from '../types';
import { DRAW_SCHEDULE } from '../constants';

/**
 * Analyse si les résultats d'un jeu influencent mathématiquement le suivant (Translocation).
 */
export const analyzeMigrationFlux = async (targetDrawName: string): Promise<InterGameHeat | null> => {
    const { data: targetHist } = await fetchResults(targetDrawName);
    if (!targetHist || targetHist.length === 0) return null;

    const latestDraw = targetHist[0];
    let targetDate: Date;
    if (latestDraw.date.includes('/')) {
        const [d, m, y] = latestDraw.date.split('/').map(Number);
        targetDate = new Date(y, m - 1, d);
    } else {
        targetDate = new Date(latestDraw.date);
    }

    let allMarketDraws: any[] = [];
    
    if (isSupabaseConfigured()) {
        const { data } = await supabase
            .from('draw_results')
            .select('draw_name, date, gagnants')
            .neq('draw_name', targetDrawName)
            .order('date', { ascending: false })
            .limit(300);
        
        allMarketDraws = data || [];
    } else {
        return null; 
    }

    let bestPreviousDraw: { name: string, result: DrawResult, diff: number } | null = null;

    for (const entry of allMarketDraws) {
        const dStr = entry.date;
        let cDate: Date;
        if (dStr.includes('/')) {
            const [d, m, y] = dStr.split('/').map(Number);
            cDate = new Date(y, m - 1, d);
        } else {
            cDate = new Date(dStr);
        }

        const diff = targetDate.getTime() - cDate.getTime();

        if (diff > 0 && diff < 172800000) {
            if (!bestPreviousDraw || diff < bestPreviousDraw.diff) {
                bestPreviousDraw = {
                    name: entry.draw_name,
                    result: { ...entry, id: 'temp', machine: [], version: 1 },
                    diff: diff
                };
            }
        }
    }

    if (!bestPreviousDraw) return null;

    const sourceDraw = bestPreviousDraw.result;
    const intersection = latestDraw.gagnants.filter(n => sourceDraw.gagnants.includes(n));
    
    let pressureScore = 0;
    sourceDraw.gagnants.forEach(src => {
        if (latestDraw.gagnants.includes(src)) pressureScore += 100;
        if (latestDraw.gagnants.includes(src + 1) || latestDraw.gagnants.includes(src - 1)) pressureScore += 25;
    });

    const correlationFactor = Math.min(100, Math.round(pressureScore / 5 * 20));

    return {
        sourceGame: bestPreviousDraw.name,
        targetGame: targetDrawName,
        correlationFactor,
        migratingNumbers: intersection
    };
};

/**
 * Analyse la résonance intra-journalière (Ex: Est-ce que les numéros de 'La Matinale' ressortent à 'Lucky Tuesday' ?)
 */
export const analyzeIntraDayResonance = async (targetDrawName: string, dayName: string): Promise<DayFlowMetrics | null> => {
    if (!isSupabaseConfigured()) return null;

    // 1. Identifier les tirages du même jour qui précèdent le tirage cible
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

    // 2. Récupérer les résultats de CE JOUR pour ces tirages
    // On suppose qu'on analyse pour "Aujourd'hui" ou le dernier jour d'activité
    const { data: latestTarget } = await fetchResults(targetDrawName);
    if (!latestTarget || latestTarget.length === 0) return null;
    const dateRef = latestTarget[0].date; // Date du dernier tirage cible connu

    // Conversion format date DB
    let dbDateRef = dateRef;
    if (dateRef.includes('/')) {
        const [d, m, y] = dateRef.split('/');
        dbDateRef = `${y}-${m}-${d}`;
    } else if (dateRef.match(/^\d{4}-\d{2}-\d{2}$/)) {
        dbDateRef = dateRef;
    }

    const { data: dayResults } = await supabase
        .from('draw_results')
        .select('gagnants, draw_name')
        .in('draw_name', previousDrawsOfDay)
        .eq('date', dbDateRef);

    if (!dayResults || dayResults.length === 0) return null;

    // 3. Calculer les métriques
    const allNumbersOfDay = dayResults.flatMap(d => d.gagnants);
    const counts: Record<number, number> = {};
    const decades: Record<number, number> = {};
    
    allNumbersOfDay.forEach(n => {
        counts[n] = (counts[n] || 0) + 1;
        const dec = Math.floor((n-1)/10);
        decades[dec] = (decades[dec] || 0) + 1;
    });

    // Numéros sortis au moins une fois aujourd'hui (résonance potentielle)
    const echoNumbers = Object.entries(counts)
        .filter(([_, c]) => c >= 1)
        .map(([n]) => parseInt(n));

    // Dizaines chaudes
    const hotDecades = Object.entries(decades)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([d]) => parseInt(d));

    // Calcul du Momentum (Force de répétition)
    // Plus il y a de numéros qui se répètent, plus le momentum est fort
    const multipleOccurrences = Object.values(counts).filter(c => c >= 2).length;
    const dayMomentum = Math.min(100, Math.round(multipleOccurrences * 20 + echoNumbers.length * 5)); 

    return {
        dayMomentum,
        echoNumbers,
        hotDecades,
        morningToEveningBias: dayMomentum 
    };
};
