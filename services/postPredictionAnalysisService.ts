
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
    
    // Fonction utilitaire pour inverser un nombre (ex: 12 -> 21, 05 -> 50)
    const getReverse = (n: number) => {
        const rev = parseInt(n.toString().split('').reverse().join(''));
        return (rev >= 1 && rev <= 90 && rev !== n) ? rev : null;
    };

    // 1. Analyse Balistique des Hits et Écarts
    predictedNumbers.forEach(pred => {
        if (actualSet.has(pred)) {
            matches.push({ predicted: pred, actual: pred, errorType: 'Hit', delta: 'Direct' });
        } else {
            let found = false;
            
            // A. Détection Voisinage (+/- 1)
            if (actualSet.has(pred - 1)) { 
                matches.push({ predicted: pred, actual: pred - 1, errorType: 'Voisin', delta: '-1' }); 
                found = true; 
            } else if (actualSet.has(pred + 1)) { 
                matches.push({ predicted: pred, actual: pred + 1, errorType: 'Voisin', delta: '+1' }); 
                found = true; 
            }
            
            // B. Détection Miroir (91 - n)
            if (!found) {
                const mirror = 91 - pred;
                if (actualSet.has(mirror)) { 
                    matches.push({ predicted: pred, actual: mirror, errorType: 'Miroir', delta: 'Inv' }); 
                    found = true; 
                }
            }

            // C. Détection Shadow (Inversion de chiffres ou Complément à 9)
            if (!found) {
                const reverse = getReverse(pred);
                if (reverse && actualSet.has(reverse)) {
                    matches.push({ predicted: pred, actual: reverse, errorType: 'Shadow', delta: 'Flip' });
                    found = true;
                }
            }
            
            if (!found) matches.push({ predicted: pred, actual: null, errorType: 'None', delta: '??' });
        }
    });

    // 2. Identification des occasions manquées (Signaux forts non retenus)
    const missed: { number: number; reason: string }[] = [];
    actualWinningNumbers.forEach(win => {
        // On ne vérifie que ceux qui n'ont pas été trouvés (ni hit, ni voisin, ni miroir détecté ci-dessus)
        const isCovered = matches.some(m => m.actual === win);
        
        if (!isCovered) {
            const scores = predictionBreakdown?.[win];
            if (scores) {
                // On cherche quel algo avait "vu" ce numéro avec un score élevé (> 60)
                const sortedAlgos = Object.entries(scores)
                    .filter(([_, v]) => typeof v === 'number')
                    .sort((a: any, b: any) => b[1] - a[1]);
                
                const bestAlgo = sortedAlgos[0];
                
                // Si un algo spécifique l'avait très bien classé
                if (bestAlgo && (bestAlgo[1] as number) > 65) {
                    missed.push({ 
                        number: win, 
                        reason: `Signal fort sur ${bestAlgo[0]} (${Math.round(bestAlgo[1] as number)}%), mais filtré par le consensus.` 
                    });
                    
                    // Collecte d'impact pour la correction automatique
                    algoImpacts[bestAlgo[0]] = (algoImpacts[bestAlgo[0]] || 0) + (bestAlgo[1] as number);
                }
                else {
                     missed.push({ 
                        number: win, 
                        reason: "Signal faible global (Zone Morte)." 
                    });
                }
            } else {
                missed.push({ number: win, reason: "Aucune donnée spectrale." });
            }
        }
    });

    // 3. Calcul de la divergence des scores
    // Cela nous dit quels algos auraient dû être plus écoutés
    const scoreDivergence: { algo: string; impact: number }[] = [];
    const maxImpact = Math.max(...Object.values(algoImpacts), 1);
    Object.entries(algoImpacts).forEach(([algo, val]) => {
        // On ignore les algos à impact négligeable
        if (val > 50) {
            scoreDivergence.push({ algo, impact: Math.round((val / maxImpact) * 100) });
        }
    });

    return { 
        drawName, 
        date, 
        predictionId, 
        matches, 
        missedOpportunities: missed, 
        scoreDivergence: scoreDivergence.sort((a,b) => b.impact - a.impact).slice(0, 5) 
    };
};
