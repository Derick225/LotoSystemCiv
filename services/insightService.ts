
import type { DrawResult, SmartInsight, SpectralMetric, NumberGap, NumberRegularity } from '../types';
import { calculateVolatility } from './mathService';

export const generateSmartInsights = async (
    _drawName: string, 
    history: DrawResult[],
    spectral: SpectralMetric[],
    gaps: NumberGap[],
    regularity: NumberRegularity[]
): Promise<SmartInsight[]> => {
    const insights: SmartInsight[] = [];
    
    if (history.length < 15) return insights;

    const volatility = calculateVolatility(history);
    if (volatility.score > 75) {
        insights.push({
            id: 'vol-chaos',
            type: 'risk',
            title: 'Phase de Turbulence',
            description: `Volatilité critique (${volatility.score}%). Les patterns de succession sont instables.`,
            score: 90,
            icon: '⚡'
        });
    } else if (volatility.score < 35) {
        insights.push({
            id: 'vol-stable',
            type: 'info',
            title: 'Flux Laminaire',
            description: `Le signal est stable. Les algorithmes spectraux et de résonance sont optimaux.`,
            score: 85,
            icon: '🌊'
        });
    }

    const dominant = spectral.find(s => s.energy > 85);
    if (dominant) {
        insights.push({
            id: 'spec-res',
            type: 'opportunity',
            title: `Point de Résonance: ${dominant.number}`,
            description: `Vecteur harmonique ultra-fort détecté sur le cycle de ${dominant.dominantPeriod} tirages.`,
            score: 95,
            icon: '🎯'
        });
    }

    const avgHistoricalGap = 18; 
    const outlierThreshold = avgHistoricalGap * 3; 
    const topGap = [...gaps].sort((a,b) => b.gap - a.gap)[0];
    
    if (topGap && topGap.gap > outlierThreshold) {
        insights.push({
            id: 'gap-crit',
            type: 'risk',
            title: `Tension Critique N°${topGap.number}`,
            description: `Absent depuis ${topGap.gap} tirages. Pression de retour au-delà de 3 Sigma.`,
            score: 88,
            icon: '💣'
        });
    }

    const clock = regularity.find(r => r.stdDev < 1.3 && r.lastGaps.length >= 3);
    if (clock) {
        const imminence = Math.abs(clock.avgGap - clock.currentGap);
        if (imminence <= 1.5) {
             insights.push({
                id: 'clock-precise',
                type: 'opportunity',
                title: `Séquence Horloge: ${clock.number}`,
                description: `Sortie attendue dans la fenêtre immédiate (Intervalle ±${clock.avgGap}t).`,
                score: 94,
                icon: '⏱️'
            });
        }
    }

    return insights.sort((a, b) => b.score - a.score).slice(0, 4);
};
