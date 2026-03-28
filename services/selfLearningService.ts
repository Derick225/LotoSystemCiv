import { getLocalForensicReports } from './postPredictionAnalysisService';
import { getAlgoWeights, saveAlgoWeights } from './predictionEngine';
import { AlgoWeights, ForensicReport, CounterfactualResult } from '../types';
import { useNexusStore } from '../store/useNexusStore';
import { normalizeWeights } from './predictionEngine';
import { calculateShannonEntropy } from './mathService';

/**
 * SELF-LEARNING SERVICE (Boucle de Rétroaction Automatique)
 * Analyse les erreurs passées (Forensic Reports) pour ajuster automatiquement
 * les poids des algorithmes (AlgoWeights) pour les prochaines prédictions.
 */

export interface LearningResult {
    oldWeights: AlgoWeights;
    newWeights: AlgoWeights;
    adjustments: { algo: string; delta: number; reason: string }[];
    reportsAnalyzed: number;
}

export const runSelfLearningLoop = async (drawName: string, lookbackCount: number = 5): Promise<LearningResult | null> => {
    // 1. Récupérer les derniers rapports d'autopsie
    const allReports = getLocalForensicReports().filter(r => r.drawName === drawName);
    
    // Trier par date décroissante et prendre les plus récents
    const recentReports = allReports
        .sort((a, b) => new Date(b.date.split('/').reverse().join('-')).getTime() - new Date(a.date.split('/').reverse().join('-')).getTime())
        .slice(0, lookbackCount);

    if (recentReports.length === 0) {
        return null; // Pas assez de données pour apprendre
    }

    // 2. Récupérer les poids actuels
    const currentWeights = await getAlgoWeights(drawName);
    const newWeights = { ...currentWeights };
    
    // 3. Agréger les recommandations contrefactuelles
    // On va accumuler les "votes" pour booster ou réduire chaque algo
    const algoVotes: Record<string, number> = {};
    const algoReasons: Record<string, Set<string>> = {};

    recentReports.forEach(report => {
        // A. Analyse des contrefactuels existants
        if (report.counterfactuals) {
            report.counterfactuals.forEach(cf => {
                if (!algoVotes[cf.algo]) {
                    algoVotes[cf.algo] = 0;
                    algoReasons[cf.algo] = new Set();
                }

                // Si l'action recommandée est BOOST, on ajoute un vote positif proportionnel à l'amélioration
                if (cf.action === 'BOOST' && cf.improvement > 0) {
                    algoVotes[cf.algo] += (cf.improvement / 100); // Ex: +0.2 pour 20% d'amélioration
                    algoReasons[cf.algo].add(`Sous-estimé le ${report.date}`);
                } 
                // Si l'action recommandée est REDUCE
                else if (cf.action === 'REDUCE') {
                    algoVotes[cf.algo] -= 0.1; // Pénalité standard
                    algoReasons[cf.algo].add(`Surestimé le ${report.date}`);
                }
            });
        }

        // B. Analyse des occasions manquées (Near-Miss Analysis)
        // Si un algo avait un signal fort sur un numéro gagnant mais a été ignoré par le consensus
        if (report.missedOpportunities) {
            report.missedOpportunities.forEach(miss => {
                // Le format de la raison est : "Signal fort sur [algo] (X%), mais filtré..."
                const match = miss.reason.match(/Signal fort sur (\w+) \(/);
                if (match && match[1]) {
                    const algo = match[1];
                    if (!algoVotes[algo]) {
                        algoVotes[algo] = 0;
                        algoReasons[algo] = new Set();
                    }
                    // On booste l'algo qui avait raison
                    algoVotes[algo] += 0.15; 
                    algoReasons[algo].add(`A correctement identifié le ${miss.number} le ${report.date}`);
                }
            });
        }
    });

    // C. Détection de Régime (Regime Detection)
    // Analyser l'entropie récente pour ajuster les algos adaptés au chaos ou à la stabilité
    const history = useNexusStore.getState().history.filter(h => h.drawName === drawName).slice(0, 10);
    if (history.length > 0) {
        const entropy = calculateShannonEntropy(history).normalized;
        
        // Si le tirage est très chaotique (entropie > 0.8)
        if (entropy > 0.8) {
            ['fractal', 'ai_intuition', 'spatial'].forEach(algo => {
                if (!algoVotes[algo]) { algoVotes[algo] = 0; algoReasons[algo] = new Set(); }
                algoVotes[algo] += 0.1;
                algoReasons[algo].add(`Régime chaotique détecté (Entropie: ${(entropy*100).toFixed(1)}%)`);
            });
            ['frequency', 'markov', 'equilibrium'].forEach(algo => {
                if (!algoVotes[algo]) { algoVotes[algo] = 0; algoReasons[algo] = new Set(); }
                algoVotes[algo] -= 0.05;
                algoReasons[algo].add(`Pénalité pour régime chaotique`);
            });
        } 
        // Si le tirage est très stable (entropie < 0.5)
        else if (entropy < 0.5) {
            ['frequency', 'markov', 'equilibrium'].forEach(algo => {
                if (!algoVotes[algo]) { algoVotes[algo] = 0; algoReasons[algo] = new Set(); }
                algoVotes[algo] += 0.1;
                algoReasons[algo].add(`Régime stable détecté (Entropie: ${(entropy*100).toFixed(1)}%)`);
            });
            ['fractal', 'ai_intuition', 'spatial'].forEach(algo => {
                if (!algoVotes[algo]) { algoVotes[algo] = 0; algoReasons[algo] = new Set(); }
                algoVotes[algo] -= 0.05;
                algoReasons[algo].add(`Pénalité pour régime stable`);
            });
        }
    }

    // 4. Appliquer les ajustements (Learning Rate)
    const LEARNING_RATE = 0.05; // Vitesse d'apprentissage (max 5% de changement par itération)
    const adjustments: { algo: string; delta: number; reason: string }[] = [];

    Object.keys(algoVotes).forEach(algo => {
        const voteScore = algoVotes[algo];
        if (Math.abs(voteScore) > 0.01) {
            const currentW = (newWeights as any)[algo] || 0;
            
            // Calcul du delta (limité par le learning rate)
            let delta = voteScore * LEARNING_RATE;
            
            // On limite le changement maximum en une seule fois pour éviter l'instabilité (Clipping)
            delta = Math.max(-0.1, Math.min(0.1, delta)); 
            
            const newW = Math.max(0, currentW + delta); // Pas de poids négatif
            
            if (Math.abs(newW - currentW) > 0.001) {
                (newWeights as any)[algo] = newW;
                adjustments.push({
                    algo,
                    delta: newW - currentW,
                    reason: Array.from(algoReasons[algo] || []).slice(0, 2).join(', ')
                });
            }
        }
    });

    if (adjustments.length === 0) {
        return null; // Aucun ajustement nécessaire
    }

    // 5. Normaliser les nouveaux poids (pour que la somme fasse 1)
    const normalizedWeights = normalizeWeights(newWeights);

    // 6. Sauvegarder les nouveaux poids
    await saveAlgoWeights(drawName, normalizedWeights);
    
    // Mettre à jour le store Zustand
    useNexusStore.getState().updateGlobalWeights(normalizedWeights);

    return {
        oldWeights: currentWeights,
        newWeights: normalizedWeights,
        adjustments,
        reportsAnalyzed: recentReports.length
    };
};
