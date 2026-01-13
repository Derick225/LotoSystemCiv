
import { isSupabaseConfigured } from './supabaseClient';
import { invokeEdgeFunction } from './apiClient';
import type { NarrativeReport, DrawResult, EntropyMetric, ChiSquareMetric } from "../types";

/**
 * Génère un rapport narratif sur l'état du flux stochastique actuel.
 */
export const generateNarrativeReport = async (
    drawName: string, 
    history: DrawResult[], 
    entropy: EntropyMetric, 
    chiSquare: ChiSquareMetric,
    hurst: number
): Promise<NarrativeReport | null> => {
    
    // Calcul de fallback mathématique immédiat
    const calculatedConfidence = Math.min(95, Math.round((Math.abs(hurst - 0.5) * 200) + (entropy.normalized > 0.9 ? 0 : 30)));
    
    const fallbackReport: NarrativeReport = {
        summary: `Signal partiel (Mode Hors-Ligne). Les métriques indiquent un régime ${hurst > 0.55 ? 'persistant' : 'chaotique'}. L'entropie est de ${entropy.normalized.toFixed(2)}.`,
        technicalVerdict: hurst > 0.55 ? "Tendance Persistante (Algorithmique)" : "Bruit Blanc Dominant",
        riskAssessment: entropy.normalized > 0.92 ? "Volatilité Critique (Risque Élevé)" : "Volatilité Nominale",
        confidence: calculatedConfidence
    };

    if (!navigator.onLine || !isSupabaseConfigured()) return fallbackReport;

    // Construction d'un contexte analytique riche
    const contextData = {
        metrics: {
            entropy: entropy.normalized.toFixed(4),
            chiSquare: chiSquare.score.toFixed(2),
            hurst: hurst.toFixed(4),
            regime: hurst > 0.6 ? "Persistant" : hurst < 0.4 ? "Anti-Persistant" : "Brownien"
        },
        recentDraws: history.slice(0, 5).map(h => h.gagnants)
    };
    
    try {
        const { data, error } = await invokeEdgeFunction('ask-oracle', {
            body: {
                task: 'narrative',
                drawName,
                history: history.slice(0, 5),
                metrics: contextData.metrics
            }
        });

        if (error) {
            console.warn("Narrative Cloud Error:", error);
            return fallbackReport;
        }
        
        if (data) return data as NarrativeReport;
        
        return fallbackReport;

    } catch (e) {
        console.warn("Nexus Cloud Narrative failed. Using mathematical fallback.", e);
        return fallbackReport;
    }
};
