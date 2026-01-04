
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

        // Envoi des données allégées
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
