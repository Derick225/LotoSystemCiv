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
    bankruptcyDraw: number | null; 
    strategy: BettingStrategy;
    history: { date: string, balance: number, bet: number, hits: number, profit: number }[];
}

// Version interne rapide pour la simulation massive
const quickPredict = (history: any[], weights: AlgoWeights): number[] => {
    const scores = new Float32Array(91).fill(0);
    const limit = Math.min(history.length, 30);
    const freqWeight = weights.frequency || 0.2;
    for(let i=0; i<limit; i++) {
        history[i].gagnants.forEach((n: number) => scores[n] += freqWeight);
    }
    const markovWeight = weights.markov || 0.15;
    if(history.length > 1) {
        const last = history[0].gagnants;
        for(let i=0; i<limit-1; i++) {
            const current = history[i].gagnants;
            const prev = history[i+1].gagnants;
            if (prev.some((p: number) => last.includes(p))) {
                current.forEach((n: number) => scores[n] += markovWeight * 2);
            }
        }
    }
    const candidates = [];
    for(let i=1; i<=90; i++) candidates.push({n: i, s: scores[i]});
    candidates.sort((a,b) => b.s - a.s);
    return candidates.slice(0, 5).map(c => c.n);
};

export const runSurvivalSimulation = async (
    drawName: string, 
    history: DrawResult[], 
    weights: AlgoWeights, 
    depth: number = 50,
    strategy: BettingStrategy = 'FLAT',
    onProgress?: (percent: number) => void
): Promise<BacktestReport> => {
    
    return new Promise((resolve, reject) => {
        const worker = new Worker(new URL('./workers/simulation.worker.ts', import.meta.url), { type: 'module' });
        
        worker.onmessage = (e) => {
            const { type, report, percent, error } = e.data;
            if (type === 'progress') {
                if(onProgress) onProgress(percent);
            } else if (type === 'result') {
                worker.terminate();
                resolve(report);
            } else if (error) {
                worker.terminate();
                reject(new Error(error));
            }
        };

        worker.onerror = (e) => {
            worker.terminate();
            reject(new Error("Worker Error: " + e.message));
        };

        const liteHistory = history.map(h => ({ gagnants: h.gagnants, date: h.date }));
        
        worker.postMessage({
            drawName,
            history: liteHistory,
            weights,
            depth,
            strategy
        });
    });
};

/**
 * Lance 3 simulations en parallèle pour comparer les rendements.
 */
export const runComparativeSimulation = async (
    drawName: string,
    history: DrawResult[],
    weights: AlgoWeights,
    depth: number = 60
): Promise<Record<BettingStrategy, BacktestReport>> => {
    const [flat, martingale, kelly] = await Promise.all([
        runSurvivalSimulation(drawName, history, weights, depth, 'FLAT'),
        runSurvivalSimulation(drawName, history, weights, depth, 'MARTINGALE'),
        runSurvivalSimulation(drawName, history, weights, depth, 'KELLY')
    ]);

    return { FLAT: flat, MARTINGALE: martingale, KELLY: kelly };
};