
import type { ForensicReport, ForensicEvidence, ScoreBreakdown, CounterfactualResult, SpectralDeviation, AlgoWeights, DrawResult } from '../types';
import { normalizeWeights } from './predictionEngine';

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
        const isCovered = matches.some(m => m.actual === win);
        
        if (!isCovered) {
            const scores = predictionBreakdown?.[win];
            if (scores) {
                const sortedAlgos = Object.entries(scores)
                    .filter(([_, v]) => typeof v === 'number')
                    .sort((a: any, b: any) => b[1] - a[1]);
                
                const bestAlgo = sortedAlgos[0];
                
                if (bestAlgo && (bestAlgo[1] as number) > 65) {
                    missed.push({ 
                        number: win, 
                        reason: `Signal fort sur ${bestAlgo[0]} (${Math.round(bestAlgo[1] as number)}%), mais filtré par le consensus.` 
                    });
                    
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
    const scoreDivergence: { algo: string; impact: number }[] = [];
    const maxImpact = Math.max(...Object.values(algoImpacts), 1);
    Object.entries(algoImpacts).forEach(([algo, val]) => {
        if (val > 50) {
            scoreDivergence.push({ algo, impact: Math.round((val / maxImpact) * 100) });
        }
    });

    // 4. Calcul de la déviation spectrale (Nouvelle métrique)
    const spectralDeviations: SpectralDeviation[] = [];
    let squaredErrorSum = 0;

    for(let i=1; i<=90; i++) {
        const predictedScore = predictionBreakdown?.[i] ? 
            Object.values(predictionBreakdown[i]).reduce((a,b) => (a as number)+(b as number), 0) / 5 : 0; // Moyenne approx
        
        const isActual = actualSet.has(i) ? 100 : 0;
        const delta = Math.abs(predictedScore - isActual);
        
        squaredErrorSum += Math.pow(delta, 2);

        if (actualSet.has(i) || predictedNumbers.includes(i)) {
            spectralDeviations.push({
                number: i,
                predictedEnergy: predictedScore,
                actualEnergy: isActual,
                delta
            });
        }
    }
    
    const rmse = Math.sqrt(squaredErrorSum / 90);

    return { 
        drawName, 
        date, 
        predictionId, 
        matches, 
        missedOpportunities: missed, 
        scoreDivergence: scoreDivergence.sort((a,b) => b.impact - a.impact).slice(0, 5),
        spectralDeviations: spectralDeviations.sort((a,b) => b.delta - a.delta).slice(0, 10),
        rmse
    };
};

/**
 * Moteur Contrefactuel : "Et si ?"
 * Simule quel aurait été le résultat si on avait modifié les poids
 */
export const runCounterfactualSimulation = (
    currentWeights: AlgoWeights,
    breakdown: Record<number, ScoreBreakdown>,
    actualWinners: number[]
): CounterfactualResult[] => {
    const results: CounterfactualResult[] = [];
    const algos = ['frequency', 'gap', 'markov', 'spectral', 'momentum', 'equilibrium'] as const;

    // Pour chaque algo clé, on teste un boost de 20%
    algos.forEach(algo => {
        const modifiedWeights = { ...currentWeights };
        modifiedWeights[algo] = (modifiedWeights[algo] || 0) + 0.2; // Boost significatif
        const normalized = normalizeWeights(modifiedWeights);

        // Re-calcul du score global pour chaque numéro avec les nouveaux poids
        const newScores: { n: number, s: number }[] = [];
        
        Object.entries(breakdown).forEach(([nStr, scores]) => {
            const num = parseInt(nStr);
            let weightedSum = 0;
            
            (Object.keys(normalized) as Array<keyof AlgoWeights>).forEach(k => {
                const w = normalized[k] || 0;
                const s = (scores as any)[k] || 0;
                weightedSum += s * w;
            });
            newScores.push({ n: num, s: weightedSum });
        });

        // Top 5 simulé
        const top5 = newScores.sort((a,b) => b.s - a.s).slice(0, 5).map(x => x.n);
        const hits = top5.filter(n => actualWinners.includes(n)).length;

        // Si on a au moins 1 hit de plus ou >= 3 hits total
        if (hits >= 3) {
            results.push({
                algo,
                originalWeight: currentWeights[algo] || 0,
                optimalWeight: normalized[algo] || 0,
                potentialHits: hits,
                potentialNumbers: top5.filter(n => actualWinners.includes(n)),
                improvement: 20 // Arbitraire pour simulation
            });
        }
    });

    return results.sort((a,b) => b.potentialHits - a.potentialHits);
};
