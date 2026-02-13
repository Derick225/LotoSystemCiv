
import { DrawResult, AlgoWeights } from '../types';

const INITIAL_BANKROLL = 50000; 
const TICKET_COST = 100; 

export type BettingStrategy = 'FLAT' | 'MARTINGALE' | 'KELLY';

export interface BacktestReport {
    totalDraws: number;
    netProfit: number;
    roi: number;
    maxDrawdown: number;
    winRate: number;
    sharpeRatio: number; // Nouvelle métrique de performance ajustée au risque
    bankruptcyDraw: number | null; 
    strategy: BettingStrategy;
    history: { date: string, balance: number, bet: number, hits: number, profit: number }[];
}

/**
 * Prédiction rapide optimisée avec TypedArrays (Float32Array).
 * Utilise moins de mémoire et est plus performant pour les itérations massives.
 */
const quickPredict = (history: any[], weights: AlgoWeights): number[] => {
    // Allocation unique d'un buffer typé (Index 0 inutilisé, 1-90 utilisés)
    const scores = new Float32Array(91); 
    const limit = Math.min(history.length, 30);
    
    // 1. Fréquence avec amortissement racinaire
    const freqWeight = weights.frequency || 0.08;
    for(let i=0; i<limit; i++) {
        const decay = 1 / Math.sqrt(i + 1);
        const winners = history[i].gagnants;
        for (let k = 0; k < winners.length; k++) {
            scores[winners[k]] += freqWeight * decay;
        }
    }
    
    // 2. Markov (Transitions T-1)
    const markovWeight = weights.markov || 0.18;
    if(history.length > 1) {
        const lastDrawSet = new Set(history[0].gagnants);
        for(let i=0; i<limit-1; i++) {
            const current = history[i].gagnants;
            const prev = history[i+1].gagnants;
            
            // Si le tirage précédent (historique) partage un numéro avec le dernier tirage connu
            let hasIntersection = false;
            for(let k=0; k<prev.length; k++) {
                if(lastDrawSet.has(prev[k])) {
                    hasIntersection = true;
                    break;
                }
            }

            if (hasIntersection) {
                for(let k=0; k<current.length; k++) {
                    scores[current[k]] += markovWeight * 1.5;
                }
            }
        }
    }

    // Extraction et tri des candidats
    const candidates = [];
    for(let i=1; i<=90; i++) {
        // On ignore les scores nuls pour optimiser le tri
        if(scores[i] > 0) candidates.push({n: i, s: scores[i]});
    }
    
    // Tri décroissant
    candidates.sort((a,b) => b.s - a.s);
    
    // Retourne le top 5 (ou moins si pas assez de candidats)
    return candidates.slice(0, 5).map(c => c.n);
};

/**
 * Lance une simulation de survie financière sur un Worker dédié.
 */
export const runSurvivalSimulation = async (
    drawName: string, 
    history: DrawResult[], 
    weights: AlgoWeights, 
    depth: number = 50,
    strategy: BettingStrategy = 'FLAT',
    onProgress?: (percent: number) => void
): Promise<BacktestReport> => {
    
    // Validation robuste en amont
    if (!history || history.length < 10) {
        throw new Error("Historique insuffisant pour lancer une simulation fiable.");
    }
    
    // Clamp depth to available history
    const safeDepth = Math.min(depth, history.length - 5);

    return new Promise((resolve, reject) => {
        const worker = new Worker(new URL('./workers/simulation.worker.ts', import.meta.url), { type: 'module' });
        
        // Timeout de sécurité pour le worker (15s)
        const timeoutId = setTimeout(() => {
            worker.terminate();
            reject(new Error("Simulation Timeout (Worker unresponsive)"));
        }, 15000);

        worker.onmessage = (e) => {
            const { type, report, percent, error, log } = e.data;
            
            if (type === 'progress') {
                if(onProgress) onProgress(percent);
            } else if (type === 'log') {
                console.debug(`[Backtest Worker] ${log}`);
            } else if (type === 'result') {
                clearTimeout(timeoutId);
                worker.terminate();
                resolve(report);
            } else if (error) {
                clearTimeout(timeoutId);
                worker.terminate();
                reject(new Error(error));
            }
        };

        worker.onerror = (e) => {
            clearTimeout(timeoutId);
            worker.terminate();
            reject(new Error("Worker Critical Error: " + e.message));
        };

        // Données légères pour le transfert (Structured Clone)
        const liteHistory = history.map(h => ({ gagnants: h.gagnants, date: h.date }));
        
        worker.postMessage({
            drawName,
            history: liteHistory,
            weights,
            depth: safeDepth,
            strategy
        });
    });
};

/**
 * Lance 3 simulations en parallèle pour comparer les stratégies.
 * Optimisé avec Promise.all pour réduire le temps d'attente global.
 */
export const runComparativeSimulation = async (
    drawName: string,
    history: DrawResult[],
    weights: AlgoWeights,
    depth: number = 60
): Promise<Record<BettingStrategy, BacktestReport>> => {
    
    if (!history || history.length === 0) {
        throw new Error("Impossible de comparer : Historique vide.");
    }

    try {
        const [flat, martingale, kelly] = await Promise.all([
            runSurvivalSimulation(drawName, history, weights, depth, 'FLAT'),
            runSurvivalSimulation(drawName, history, weights, depth, 'MARTINGALE'),
            runSurvivalSimulation(drawName, history, weights, depth, 'KELLY')
        ]);

        return { FLAT: flat, MARTINGALE: martingale, KELLY: kelly };
    } catch (e) {
        console.error("Erreur lors de la simulation parallèle", e);
        throw e;
    }
};
