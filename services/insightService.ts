
import type { DrawResult, SmartInsight, SpectralMetric, NumberGap, NumberRegularity } from '../types';
import { calculateVolatility } from './mathService';

// Typage strict interne pour la maintenabilité
export enum InsightType {
    RISK = 'risk',
    OPPORTUNITY = 'opportunity',
    INFO = 'info'
}

/**
 * Génère des insights contextuels intelligents basés sur une analyse croisée
 * des métriques (Volatilité, Spectral, Gaps, Régularité).
 */
export const generateSmartInsights = async (
    _drawName: string, 
    history: DrawResult[],
    spectral: SpectralMetric[],
    gaps: NumberGap[],
    regularity: NumberRegularity[]
): Promise<SmartInsight[]> => {
    
    // Map pour éviter les doublons (1 insight max par entité/numéro)
    // Clé: 'global' | 'num-{n}'
    const insightMap = new Map<string, SmartInsight>();

    if (history.length < 15) return [];

    // --- 1. ANALYSE GLOBALE (Volatilité Dynamique) ---
    const volatility = calculateVolatility(history);
    
    // Seuils basés sur une échelle standard 0-100
    if (volatility.score > 70) {
        insightMap.set('volatility', {
            id: 'vol-chaos',
            type: InsightType.RISK,
            title: 'Zone de Turbulence',
            description: `Instabilité détectée (${volatility.score}%). Le système diverge vers un régime chaotique. Prudence sur les mises.`,
            score: 90,
            icon: '⚡'
        });
    } else if (volatility.score < 30) {
        insightMap.set('volatility', {
            id: 'vol-stable',
            type: InsightType.INFO,
            title: 'Flux Laminaire',
            description: `Stabilité vectorielle excellente. Les modèles spectraux sont hautement fiables.`,
            score: 85,
            icon: '🌊'
        });
    }

    // --- 2. CALCULS DE SEUILS DYNAMIQUES (Contexte Local) ---
    // On calcule la moyenne des gaps actuels pour définir ce qu'est un "outlier"
    // Plutôt qu'une valeur fixe (ex: 18), on s'adapte au rythme actuel du jeu.
    const totalGap = gaps.reduce((acc, g) => acc + g.gap, 0);
    const avgCurrentGap = totalGap / (gaps.length || 1);
    
    // Seuil critique = 3x la moyenne des écarts actuels (Loi des grands nombres)
    const dynamicGapThreshold = Math.max(15, avgCurrentGap * 2.8); 

    // Création d'une Map Spectral pour accès rapide O(1)
    const spectralMap = new Map<number, number>();
    spectral.forEach(s => spectralMap.set(s.number, s.energy));

    // --- 3. DÉTECTION HYBRIDE (Gap + Spectral) ---
    // On cherche les numéros qui sont EN RETARD (Gap) mais ÉNERGIQUES (Spectral)
    // C'est le signal le plus fort possible ("Cocotte minute").
    
    // Tri des gaps décroissants
    const sortedGaps = [...gaps].sort((a,b) => b.gap - a.gap);

    for (const g of sortedGaps) {
        const energy = spectralMap.get(g.number) || 0;
        
        // A. Insight Hybride (Convergence)
        if (g.gap > dynamicGapThreshold && energy > 75) {
            insightMap.set(`num-${g.number}`, {
                id: `hybrid-${g.number}`,
                type: InsightType.OPPORTUNITY,
                title: `Convergence Critique: ${g.number}`,
                description: `Signal Hybride : Écart extrême (${g.gap}) + Énergie spectrale haute (${Math.round(energy)}%). Sortie imminente probable.`,
                score: 98, // Score très haut
                icon: '🔥'
            });
        } 
        // B. Insight Gap Critique pur (Risque ou Opportunité selon stratégie)
        else if (g.gap > dynamicGapThreshold * 1.2) {
            // On ne l'ajoute que si on n'a pas déjà un insight hybride (plus précis) pour ce numéro
            if (!insightMap.has(`num-${g.number}`)) {
                insightMap.set(`num-${g.number}`, {
                    id: `gap-crit-${g.number}`,
                    type: InsightType.RISK,
                    title: `Tension Maximale: ${g.number}`,
                    description: `Absent depuis ${g.gap} tirages. Écart hors normes (> 3σ). Risque de blocage prolongé.`,
                    score: 88,
                    icon: '💣'
                });
            }
        }
    }

    // --- 4. RÉSONANCE SPECTRALE PURE ---
    // Si un numéro a une énergie > 90% mais n'est pas forcément en grand écart
    const topSpectral = [...spectral].sort((a,b) => b.energy - a.energy)[0];
    if (topSpectral && topSpectral.energy > 88) {
        if (!insightMap.has(`num-${topSpectral.number}`)) {
             insightMap.set(`num-${topSpectral.number}`, {
                id: `spec-res-${topSpectral.number}`,
                type: InsightType.OPPORTUNITY,
                title: `Résonance Harmonique: ${topSpectral.number}`,
                description: `Vecteur dominant (${Math.round(topSpectral.energy)}% énergie). Cycle périodique parfaitement aligné.`,
                score: 92,
                icon: '🎯'
            });
        }
    }

    // --- 5. PATTERNS HORLOGE (Régularité) ---
    // Détection des métronomes (Faible écart-type)
    const clock = regularity.find(r => r.stdDev < 1.2 && r.lastGaps.length >= 3);
    if (clock) {
        const imminence = Math.abs(clock.avgGap - clock.currentGap);
        // Si on est dans la fenêtre de tir (+/- 1.5 tirages autour de la moyenne)
        if (imminence <= 1.5 && !insightMap.has(`num-${clock.number}`)) {
             insightMap.set(`num-${clock.number}`, {
                id: `clock-${clock.number}`,
                type: InsightType.OPPORTUNITY,
                title: `Séquence Horloge: ${clock.number}`,
                description: `Régularité métronomique détectée. Sortie attendue dans la fenêtre immédiate (±${Math.round(clock.avgGap)}t).`,
                score: 94,
                icon: '⏱️'
            });
        }
    }

    // --- 6. AGREGATION ET TRI ---
    // Conversion Map -> Array et tri par score décroissant
    return Array.from(insightMap.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, 4); // On garde le Top 4 pour l'UI
};
