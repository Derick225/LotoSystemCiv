
import type { ForensicReport, ForensicEvidence, ScoreBreakdown, CounterfactualResult, SpectralDeviation, AlgoWeights, DrawResult } from '../types';
import { normalizeWeights } from './predictionEngine';
import { syncForensicReports } from './syncService';

const FORENSIC_KEY_PREFIX = 'forensic_report_';

export const saveForensicReport = (report: ForensicReport) => {
    try {
        localStorage.setItem(`${FORENSIC_KEY_PREFIX}${report.id}`, JSON.stringify(report));
    } catch (e) {
        console.error("Failed to save forensic report", e);
    }
};

export const getLocalForensicReports = (): ForensicReport[] => {
    const reports: ForensicReport[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(FORENSIC_KEY_PREFIX)) {
            try {
                const item = JSON.parse(localStorage.getItem(key) || '{}');
                reports.push(item);
            } catch (e) {
                console.error("Error parsing forensic report", e);
            }
        }
    }
    return reports.sort((a, b) => new Date(b.date.split('/').reverse().join('-')).getTime() - new Date(a.date.split('/').reverse().join('-')).getTime());
};

export const syncForensicReportsWithCloud = async (): Promise<ForensicReport[]> => {
    const local = getLocalForensicReports();
    try {
        const synced = await syncForensicReports(local);
        synced.forEach(saveForensicReport);
        return synced;
    } catch (e) {
        console.error("Forensic sync failed", e);
        return local;
    }
};

export const deleteForensicReportLocal = (id: string) => {
    localStorage.removeItem(`${FORENSIC_KEY_PREFIX}${id}`);
};

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
    
    // Pour calculer la divergence, on a besoin des scores bruts
    // On regarde quels algos avaient raison pour les numéros sortis
    actualWinningNumbers.forEach(win => {
        const isCovered = matches.some(m => m.actual === win);
        
        if (predictionBreakdown && predictionBreakdown[win]) {
            const scores = predictionBreakdown[win];
            // On cherche l'algo qui avait le score le plus haut pour ce numéro gagnant
            const sortedAlgos = Object.entries(scores)
                .filter(([_, v]) => typeof v === 'number')
                .sort((a: any, b: any) => b[1] - a[1]);
            
            const bestAlgo = sortedAlgos[0];
            
            if (bestAlgo && (bestAlgo[1] as number) > 50) {
                // On accumule l'impact : Si Frequency avait 90% sur ce gagnant, Frequency gagne 90 pts d'impact
                algoImpacts[bestAlgo[0]] = (algoImpacts[bestAlgo[0]] || 0) + (bestAlgo[1] as number);
            }

            if (!isCovered) {
                if (bestAlgo && (bestAlgo[1] as number) > 65) {
                    missed.push({ 
                        number: win, 
                        reason: `Signal fort sur ${bestAlgo[0]} (${Math.round(bestAlgo[1] as number)}%), mais filtré par le consensus.` 
                    });
                } else {
                     missed.push({ 
                        number: win, 
                        reason: "Signal faible global (Zone Morte)." 
                    });
                }
            }
        } else if (!isCovered) {
            missed.push({ number: win, reason: "Aucune donnée spectrale." });
        }
    });

    // 3. Calcul de la divergence des scores
    const scoreDivergence: { algo: string; impact: number }[] = [];
    const maxImpact = Math.max(...Object.values(algoImpacts), 1);
    Object.entries(algoImpacts).forEach(([algo, val]) => {
        if (val > 0) {
            scoreDivergence.push({ algo, impact: Math.round((val / maxImpact) * 100) });
        }
    });

    // 4. Calcul de la déviation spectrale (RMSE)
    const spectralDeviations: SpectralDeviation[] = [];
    let squaredErrorSum = 0;
    let validPoints = 0;

    if (predictionBreakdown) {
        for(let i=1; i<=90; i++) {
            const scores = predictionBreakdown[i];
            if (!scores) continue;

            const values = Object.values(scores).filter(v => typeof v === 'number') as number[];
            const predictedScore = values.length > 0 ? values.reduce((a,b) => a+b, 0) / values.length : 0;
            
            const isActual = actualSet.has(i) ? 100 : 0;
            const delta = predictedScore - isActual; // Négatif si sous-estimé (0 - 80 = -80), Positif si surestimé (80 - 0 = 80)
            
            squaredErrorSum += Math.pow(delta, 2);
            validPoints++;

            // On ne garde que les déviations significatives pour le rapport
            if (actualSet.has(i) || (predictedNumbers.includes(i) && Math.abs(delta) > 50)) {
                spectralDeviations.push({
                    number: i,
                    predictedEnergy: Math.round(predictedScore),
                    actualEnergy: isActual,
                    delta: Math.round(delta)
                });
            }
        }
    }
    
    const rmse = validPoints > 0 ? Math.sqrt(squaredErrorSum / validPoints) : 0;

    // 5. Simulation Contrefactuelle
    // On simule ce qui se serait passé si on avait écouté uniquement un algo spécifique
    // ou si on avait boosté cet algo.
    let counterfactuals: CounterfactualResult[] = [];
    if (predictionBreakdown) {
        // On utilise des poids fictifs de base pour la comparaison
        // Dans une app réelle, on passerait les poids utilisés lors de la prédiction
        const baseWeights: AlgoWeights = { frequency: 0.1, gap: 0.1, spectral: 0.1, markov: 0.1, momentum: 0.1, equilibrium: 0.1 }; 
        counterfactuals = runCounterfactualSimulation(baseWeights, predictionBreakdown, actualWinningNumbers);
    }

    return { 
        id: crypto.randomUUID(),
        drawName, 
        date, 
        predictionId, 
        matches, 
        missedOpportunities: missed, 
        scoreDivergence: scoreDivergence.sort((a,b) => b.impact - a.impact).slice(0, 5),
        spectralDeviations: spectralDeviations.sort((a,b) => a.delta - b.delta), // Tri par sous-estimation (négatif) vers surestimation
        rmse,
        counterfactuals
    };
};

/**
 * Moteur Contrefactuel : "Et si ?"
 * Simule quel aurait été le résultat si on avait modifié les poids pour isoler chaque algo.
 */
export const runCounterfactualSimulation = (
    currentWeights: AlgoWeights,
    breakdown: Record<number, ScoreBreakdown>,
    actualWinners: number[]
): CounterfactualResult[] => {
    const results: CounterfactualResult[] = [];
    
    // Liste des algos disponibles dans le breakdown
    const sampleBreakdown = Object.values(breakdown)[0];
    if (!sampleBreakdown) return [];
    
    const algos = Object.keys(sampleBreakdown).filter(k => typeof (sampleBreakdown as any)[k] === 'number');

    algos.forEach(algo => {
        // Scénario : Isolation Pure (Poids = 1.0 pour cet algo, 0 pour les autres)
        // Cela permet de voir si l'algo "savait" la réponse.
        
        const scores: { n: number, s: number }[] = [];
        
        for(let i=1; i<=90; i++) {
            const bd = breakdown[i];
            if(bd) {
                const val = (bd as any)[algo] || 0;
                scores.push({ n: i, s: val });
            }
        }
        
        // On trie par score décroissant
        scores.sort((a,b) => b.s - a.s);
        
        // On regarde le Top 5 de cet algo pur
        const top5 = scores.slice(0, 5).map(x => x.n);
        const hits = top5.filter(n => actualWinners.includes(n)).length;
        
        // On calcule l'amélioration théorique
        // Si cet algo donne 3 hits, c'est une piste majeure
        if (hits >= 2) {
             // On construit le poids "Optimal" suggéré : Boost de cet algo
             const optimalWeights = { ...currentWeights };
             optimalWeights[algo as keyof AlgoWeights] = (optimalWeights[algo as keyof AlgoWeights] || 0) + 0.3;
             
             results.push({
                 algo,
                 originalWeight: currentWeights[algo as keyof AlgoWeights] || 0,
                 optimalWeight: normalizeWeights(optimalWeights)[algo as keyof AlgoWeights] || 0,
                 potentialHits: hits,
                 potentialNumbers: top5.filter(n => actualWinners.includes(n)),
                 improvement: hits * 20 // Score arbitraire d'amélioration
             });
        }
    });

    return results.sort((a,b) => b.potentialHits - a.potentialHits);
};
