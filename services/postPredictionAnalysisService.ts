
import type { ForensicReport, ForensicEvidence, ScoreBreakdown, CounterfactualResult, SpectralDeviation, AlgoWeights, DrawResult } from '../types';
import { normalizeWeights, getAlgoWeights } from './predictionEngine';
import { syncForensicReports } from './syncService';
import { AppError, logError } from '../utils/AppError';

const FORENSIC_KEY_PREFIX = 'forensic_report_';

export const getForensicReportByPredictionId = (predictionId: string): ForensicReport | undefined => {
    const reports = getLocalForensicReports();
    return reports.find(r => r.predictionId === predictionId);
};

export const saveForensicReport = (report: ForensicReport) => {
    try {
        localStorage.setItem(`${FORENSIC_KEY_PREFIX}${report.id}`, JSON.stringify(report));
    } catch (e: any) {
        logError(new AppError(e.message || "Failed to save forensic report", "FORENSIC_SAVE_ERROR", "low", { error: e, reportId: report.id }), { source: 'saveForensicReport' });
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
            } catch (e: any) {
                logError(new AppError(e.message || "Error parsing forensic report", "FORENSIC_PARSE_ERROR", "low", { error: e, key }), { source: 'getLocalForensicReports' });
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
    } catch (e: any) {
        logError(new AppError(e.message || "Forensic sync failed", "FORENSIC_SYNC_ERROR", "medium", { error: e }), { source: 'syncForensicReportsWithCloud' });
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
        // On utilise les poids actuels pour la comparaison
        const baseWeights: AlgoWeights = await getAlgoWeights(drawName); 
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
 * Simule quel aurait été le résultat si on avait modifié les poids pour isoler chaque algo,
 * les booster, les réduire, ou créer des synergies.
 */
export const runCounterfactualSimulation = (
    currentWeights: AlgoWeights,
    breakdown: Record<number, ScoreBreakdown>,
    actualWinners: number[]
): CounterfactualResult[] => {
    const results: CounterfactualResult[] = [];
    
    if (!breakdown || Object.keys(breakdown).length === 0) return [];
    
    // 1. Identify available algos
    const sampleBreakdown = Object.values(breakdown).find(b => b && Object.keys(b).length > 0);
    if (!sampleBreakdown) return [];
    const algos = Object.keys(sampleBreakdown).filter(k => typeof (sampleBreakdown as any)[k] === 'number');

    if (algos.length === 0) return [];

    // Helper to calculate scores and ranks given a set of weights
    const evaluateWeights = (weights: AlgoWeights) => {
        const scores: { n: number, s: number }[] = [];
        for (let i = 1; i <= 90; i++) {
            const bd = breakdown[i];
            let totalScore = 0;
            if (bd) {
                for (const algo of algos) {
                    const w = (weights as any)[algo] || 0;
                    const s = (bd as any)[algo] || 0;
                    totalScore += w * s;
                }
            }
            scores.push({ n: i, s: totalScore });
        }
        scores.sort((a, b) => b.s - a.s);
        
        const top5 = scores.slice(0, 5).map(x => x.n);
        const hits = top5.filter(n => actualWinners.includes(n));
        const missedNumbers = actualWinners.filter(n => !top5.includes(n));
        
        // Calculate average rank of winning numbers
        let rankSum = 0;
        actualWinners.forEach(winner => {
            const rank = scores.findIndex(x => x.n === winner) + 1;
            rankSum += rank > 0 ? rank : 90;
        });
        const avgRank = actualWinners.length > 0 ? rankSum / actualWinners.length : 90;

        return { top5, hits, missedNumbers, avgRank, scores };
    };

    // 2. Baseline Evaluation
    const baseline = evaluateWeights(currentWeights);

    // 3. Test Scenarios for each algo
    algos.forEach(algo => {
        const originalWeight = (currentWeights as any)[algo] || 0;

        // Scenario A: Pure Isolation (Weight = 1.0, others = 0)
        const isolatedWeights: any = {};
        algos.forEach(a => isolatedWeights[a] = a === algo ? 1.0 : 0.0);
        const isolated = evaluateWeights(isolatedWeights);

        if (isolated.hits.length >= 2 || isolated.avgRank < baseline.avgRank - 10) {
            results.push({
                algo,
                originalWeight,
                optimalWeight: 1.0,
                potentialHits: isolated.hits.length,
                potentialNumbers: isolated.hits,
                missedNumbers: isolated.missedNumbers,
                improvement: Math.max(0, baseline.avgRank - isolated.avgRank),
                action: 'ISOLATE',
                description: `Si on avait écouté uniquement '${algo}', on aurait eu ${isolated.hits.length} numéros gagnants dans le Top 5.`,
                rankImprovement: baseline.avgRank - isolated.avgRank
            });
        }

        // Scenario B: Boost (Weight + 0.5)
        const boostedWeights = { ...currentWeights };
        (boostedWeights as any)[algo] = originalWeight + 0.5;
        const normalizedBoosted = normalizeWeights(boostedWeights);
        const boosted = evaluateWeights(normalizedBoosted);

        if (boosted.hits.length > baseline.hits.length || boosted.avgRank < baseline.avgRank - 5) {
            results.push({
                algo,
                originalWeight,
                optimalWeight: (normalizedBoosted as any)[algo],
                potentialHits: boosted.hits.length,
                potentialNumbers: boosted.hits,
                missedNumbers: boosted.missedNumbers,
                improvement: Math.max(0, baseline.avgRank - boosted.avgRank),
                action: 'BOOST',
                description: `Augmenter l'importance de '${algo}' aurait fait remonter les numéros gagnants de ${Math.round(baseline.avgRank - boosted.avgRank)} places en moyenne.`,
                rankImprovement: baseline.avgRank - boosted.avgRank
            });
        }

        // Scenario C: Exclusion/Reduce (Weight = 0)
        if (originalWeight > 0.05) {
            const reducedWeights = { ...currentWeights };
            (reducedWeights as any)[algo] = 0;
            const normalizedReduced = normalizeWeights(reducedWeights);
            const reduced = evaluateWeights(normalizedReduced);

            if (reduced.hits.length > baseline.hits.length || reduced.avgRank < baseline.avgRank - 5) {
                results.push({
                    algo,
                    originalWeight,
                    optimalWeight: 0,
                    potentialHits: reduced.hits.length,
                    potentialNumbers: reduced.hits,
                    missedNumbers: reduced.missedNumbers,
                    improvement: Math.max(0, baseline.avgRank - reduced.avgRank),
                    action: 'REDUCE',
                    description: `L'algorithme '${algo}' a induit le système en erreur. L'ignorer aurait amélioré le classement des gagnants.`,
                    rankImprovement: baseline.avgRank - reduced.avgRank
                });
            }
        }
    });

    // 4. Test Synergy (Pairs of top 3 isolated algos)
    // Find top 3 algos by isolation avgRank
    const isolationRanks = algos.map(algo => {
        const w: any = {};
        algos.forEach(a => w[a] = a === algo ? 1.0 : 0.0);
        return { algo, rank: evaluateWeights(w).avgRank };
    }).sort((a, b) => a.rank - b.rank).slice(0, 3);

    if (isolationRanks.length >= 2) {
        for (let i = 0; i < isolationRanks.length; i++) {
            for (let j = i + 1; j < isolationRanks.length; j++) {
                const algo1 = isolationRanks[i].algo;
                const algo2 = isolationRanks[j].algo;
                
                const synergyWeights: any = {};
                algos.forEach(a => {
                    synergyWeights[a] = (a === algo1 || a === algo2) ? 0.5 : 0.0;
                });
                
                const synergy = evaluateWeights(synergyWeights);
                
                if (synergy.hits.length >= 2 || synergy.avgRank < baseline.avgRank - 5) {
                    results.push({
                        algo: `${algo1} + ${algo2}`,
                        originalWeight: ((currentWeights as any)[algo1] || 0) + ((currentWeights as any)[algo2] || 0),
                        optimalWeight: 1.0, // Combined weight
                        potentialHits: synergy.hits.length,
                        potentialNumbers: synergy.hits,
                        missedNumbers: synergy.missedNumbers,
                        improvement: Math.max(0, baseline.avgRank - synergy.avgRank),
                        action: 'SYNERGY',
                        description: `La combinaison de '${algo1}' et '${algo2}' crée une forte synergie, capturant ${synergy.hits.length} gagnants.`,
                        rankImprovement: baseline.avgRank - synergy.avgRank
                    });
                }
            }
        }
    }

    // Sort by rank improvement (highest first), then by potential hits
    return results.sort((a, b) => {
        if (b.potentialHits !== a.potentialHits) {
            return b.potentialHits - a.potentialHits;
        }
        return (b.rankImprovement || 0) - (a.rankImprovement || 0);
    });
};
