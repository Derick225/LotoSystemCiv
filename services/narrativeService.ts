
import { isSupabaseConfigured } from './supabaseClient';
import { getNarrativeAnalysis } from './geminiService';
import type { NarrativeReport, DrawResult, EntropyMetric, ChiSquareMetric } from "../types";
import { AppError, logError } from '../utils/AppError';

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
    
    // --- MOTEUR NARRATIF PROCÉDURAL (FALLBACK MATHÉMATIQUE) ---
    // Génère un rapport crédible basé sur les métriques brutes si le cloud est absent.
    
    const isChaos = entropy.normalized > 0.92;
    const isPersistent = hurst > 0.6;
    const isAntiPersistent = hurst < 0.4;
    const isStable = !isChaos && hurst >= 0.4 && hurst <= 0.6;
    if (isStable) {
      // Structure standard de stabilité
    }

    let summary = "";
    let verdict = "";
    let risk = "";
    let confidence = 50;

    if (isPersistent) {
        summary = `Le flux montre une persistance rétinienne forte (Hurst ${hurst.toFixed(2)}). Les numéros en forme ("Chauds") ont une probabilité statistique de récidive supérieure à la normale. L'inertie du système favorise les séries longues.`;
        verdict = "Suivi de Tendance (Inertie)";
        risk = "Faible (Structure stable)";
        confidence = 85;
    } else if (isAntiPersistent) {
        summary = `Le système est en phase de compensation violente (Hurst ${hurst.toFixed(2)}). On observe une pression de retour à la moyenne : les numéros en retard ("Froids") accumulent une tension critique prête à se libérer.`;
        verdict = "Rebond Technique (Mean Reversion)";
        risk = "Modéré (Volatilité en hausse)";
        confidence = 78;
    } else if (isChaos) {
        summary = `Entropie maximale détectée (${entropy.normalized.toFixed(2)}). Le tirage est actuellement dominé par un bruit blanc stochastique sans direction claire. Les signaux faibles sont noyés.`;
        verdict = "Bruit Blanc (Hasard Pur)";
        risk = "Critique (Imprévisible)";
        confidence = 45;
    } else {
        summary = `Configuration neutre. Le marché est à l'équilibre avec une distribution homogène (Chi² ${chiSquare.score.toFixed(1)}). Idéal pour une stratégie mixte mêlant favoris et outsiders.`;
        verdict = "Équilibre Dynamique";
        risk = "Standard";
        confidence = 60;
    }

    // Calcul de confiance affiné
    const calculatedConfidence = Math.min(95, Math.round(confidence + (history.length > 50 ? 5 : 0)));
    
    const fallbackReport: NarrativeReport = {
        summary,
        technicalVerdict: verdict,
        riskAssessment: risk,
        confidence: calculatedConfidence
    };

    if (!navigator.onLine || !isSupabaseConfigured()) return fallbackReport;

    // --- APPEL CLOUD (SI DISPONIBLE) ---
    // Construction d'un contexte analytique riche pour l'IA
    const contextData = {
        metrics: {
            entropy: entropy.normalized.toFixed(4),
            chiSquare: chiSquare.score.toFixed(2),
            hurst: hurst.toFixed(4),
            regime: isPersistent ? "Persistant" : isAntiPersistent ? "Anti-Persistant" : "Brownien"
        },
        recentDraws: history.slice(0, 5).map(h => h.gagnants)
    };
    
    try {
        const data = await getNarrativeAnalysis(drawName, history, contextData.metrics);

        if (data) {
            try {
                const parsed = JSON.parse(data);
                if (parsed && typeof parsed === 'object') {
                    return {
                        summary: parsed.summary || fallbackReport.summary,
                        technicalVerdict: parsed.technicalVerdict || fallbackReport.technicalVerdict,
                        riskAssessment: parsed.riskAssessment || fallbackReport.riskAssessment,
                        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : fallbackReport.confidence
                    };
                }
            } catch (jsonErr) {
                // Si la réponse n'est pas du JSON valide, on met le texte brut dans le résumé
                return {
                    summary: data,
                    technicalVerdict: fallbackReport.technicalVerdict,
                    riskAssessment: fallbackReport.riskAssessment,
                    confidence: fallbackReport.confidence
                };
            }
        }
        
        return fallbackReport;

    } catch (e: unknown) {
        logError(new AppError((e instanceof Error ? e.message : String(e)) || "Nexus Cloud Narrative failed. Using mathematical fallback.", "NARRATIVE_ERROR", "low", { error: e }), { source: 'generateNarrativeReport' });
        return fallbackReport;
    }
};
