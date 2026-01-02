
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
                const sortedAlgos = Object.entries(scores)
                    .filter(([_, v]) => typeof v === 'number')
                    .sort((a: any, b: any) => b[1] - a[1]);
                
                const bestAlgo = sortedAlgos[0];
                if (bestAlgo && (bestAlgo[1] as number) > 65) {
                    missed.push({ 
                        number: win, 
                        reason: `Le neurone ${bestAlgo[0]} avait isolé ce signal (${Math.round(bestAlgo[1] as number)}%), mais le consensus l'a étouffé.` 
                    });
                }

                // Collecte d'impact pour le rapport final
                Object.entries(scores).forEach(([algo, val]) => {
                    if (typeof val === 'number') {
                        algoImpacts[algo] = (algoImpacts[algo] || 0) + val;
                    }
                });
            }
        }
    });

    // 3. Calcul de la divergence des scores
    const scoreDivergence: { algo: string; impact: number }[] = [];
    const maxImpact = Math.max(...Object.values(algoImpacts), 1);
    Object.entries(algoImpacts).forEach(([algo, val]) => {
        scoreDivergence.push({ algo, impact: Math.round((val / maxImpact) * 100) });
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
