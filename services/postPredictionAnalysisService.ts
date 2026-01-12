
import type { ForensicReport, ForensicEvidence, ScoreBreakdown } from '../types';

/**
 * Effectue une autopsie mathématique complète du résultat réel face à la prédiction faite.
 */
export const performForensicAnalysis = async (
    drawName: string, 
    date: string, 
    predictedNumbers: number[], 
    actualWinningNumbers: number[], 
    predictionBreakdown?: Record<number, ScoreBreakdown>, 
    predictionId?: string
): Promise<ForensicReport> => {
    const matches: ForensicEvidence[] = [];
    const actualSet = new Set(actualWinningNumbers);
    const algoImpacts: Record<string, number> = {};
    
    // 1. Analyse Balistique des Hits et Écarts
    predictedNumbers.forEach(pred => {
        if (actualSet.has(pred)) {
            matches.push({ predicted: pred, actual: pred, errorType: 'Hit', delta: 'Direct' });
        } else {
            let found = false;
            // Détection Voisinage (+/- 1)
            if (actualSet.has(pred - 1)) { 
                matches.push({ predicted: pred, actual: pred - 1, errorType: 'Voisin', delta: '-1' }); 
                found = true; 
            } else if (actualSet.has(pred + 1)) { 
                matches.push({ predicted: pred, actual: pred + 1, errorType: 'Voisin', delta: '+1' }); 
                found = true; 
            }
            
            // Détection Miroir (91 - n)
            if (!found) {
                const mirror = 91 - pred;
                if (actualSet.has(mirror)) { 
                    matches.push({ predicted: pred, actual: mirror, errorType: 'Miroir', delta: 'Inv' }); 
                    found = true; 
                }
            }
            
            if (!found) matches.push({ predicted: pred, actual: null, errorType: 'None', delta: '??' });
        }
    });

    // 2. Identification des occasions manquées (Signaux forts non retenus)
    const missed: { number: number; reason: string }[] = [];
    actualWinningNumbers.forEach(win => {
        if (!predictedNumbers.includes(win)) {
            const scores = predictionBreakdown?.[win];
            if (scores) {
                // On cherche quel algo avait "vu" ce numéro avec un score élevé (> 60)
                const sortedAlgos = Object.entries(scores)
                    .filter(([_, v]) => typeof v === 'number')
                    .sort((a: any, b: any) => b[1] - a[1]);
                
                const bestAlgo = sortedAlgos[0];
                const totalScore = Object.values(scores).reduce((a:any, b:any) => a + (typeof b === 'number' ? b : 0), 0);
                
                // Si un algo spécifique l'avait très bien classé
                if (bestAlgo && (bestAlgo[1] as number) > 60) {
                    missed.push({ 
                        number: win, 
                        reason: `Signal fort sur ${bestAlgo[0]} (${Math.round(bestAlgo[1] as number)}%), mais filtré par le consensus.` 
                    });
                }
                // Ou si le score moyen était correct mais pas suffisant pour le top 5
                else if (totalScore > 200) { // Valeur arbitraire dépendant de la normalisation
                     missed.push({ 
                        number: win, 
                        reason: "Score global moyen-haut, a manqué le cut-off du Top 5." 
                    });
                }

                // Collecte d'impact pour le rapport final (Score Divergence)
                // On incrémente les compteurs pour les algos qui avaient raison sur ce numéro manqué
                Object.entries(scores).forEach(([algo, val]) => {
                    if (typeof val === 'number') {
                        // On ajoute au poids de l'algo seulement s'il avait "vu" le numéro (score > 50)
                        if (val > 50) {
                            algoImpacts[algo] = (algoImpacts[algo] || 0) + val;
                        }
                    }
                });
            } else {
                missed.push({ number: win, reason: "Aucun signal détecté (Zone Morte)." });
            }
        }
    });

    // 3. Calcul de la divergence des scores
    // Cela nous dit quels algos auraient dû être plus écoutés
    const scoreDivergence: { algo: string; impact: number }[] = [];
    const maxImpact = Math.max(...Object.values(algoImpacts), 1);
    Object.entries(algoImpacts).forEach(([algo, val]) => {
        // On ignore les algos à impact négligeable
        if (val > maxImpact * 0.1) {
            scoreDivergence.push({ algo, impact: Math.round((val / maxImpact) * 100) });
        }
    });

    return { 
        drawName, 
        date, 
        predictionId, 
        matches, 
        missedOpportunities: missed, 
        scoreDivergence: scoreDivergence.sort((a,b) => b.impact - a.impact).slice(0, 8) 
    };
};
