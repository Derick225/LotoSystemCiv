
import { DrawResult, AlgoWeights } from '../types';
import { generateMasterPrediction } from './predictionEngine';

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
    strategy: BettingStrategy = 'FLAT'
): Promise<BacktestReport> => {
    
    // On simule sur les X derniers tirages
    const simulationWindow = history.slice(0, depth).reverse(); // On remet dans l'ordre chronologique pour la simu
    
    let currentBalance = INITIAL_BANKROLL;
    let peakBalance = INITIAL_BANKROLL;
    let maxDD = 0; 
    let wins = 0;
    let bankruptcyDraw: number | null = null;
    
    const simHistory: BacktestReport['history'] = [];

    // Paramètres Martingale
    let consecutiveLosses = 0;

    for (let i = 0; i < simulationWindow.length; i++) {
        const targetDraw = simulationWindow[i];
        
        // Si on est ruiné, on arrête
        if (currentBalance < TICKET_COST) {
            if (bankruptcyDraw === null) bankruptcyDraw = i;
            simHistory.push({ date: targetDraw.date, balance: 0, bet: 0, hits: 0, profit: 0 });
            continue;
        }

        // Simulation de la prédiction à T-1
        // Note: Pour une simulation parfaite, il faudrait recalculer les métriques à chaque étape.
        // Ici on utilise une approximation basée sur les poids actuels pour la performance.
        const contextHistory = history.slice(history.findIndex(h => h.id === targetDraw.id) + 1);
        
        // On génère une prédiction (Simulée)
        const prediction = await generateMasterPrediction(drawName, contextHistory, weights);
        const playedNumbers = prediction.suggestedNumbers.slice(0, 5); // On joue les 5 meilleurs
        
        // Gestion de mise
        let betAmount = TICKET_COST;
        if (strategy === 'MARTINGALE') {
            betAmount = TICKET_COST * Math.pow(2, Math.min(consecutiveLosses, 5)); // Cap à 32x
        } else if (strategy === 'KELLY') {
            const confidence = prediction.confidence / 100;
            const kellyFraction = confidence - ((1 - confidence) / 240); // Odds approx 240
            betAmount = Math.max(TICKET_COST, Math.floor(currentBalance * Math.max(0, kellyFraction * 0.1))); // Kelly fractionné prudent
        }

        // Vérification Gain (Simplifié : 2 numéros = rembourse, 3+ = gain)
        const hits = playedNumbers.filter(n => targetDraw.gagnants.includes(n)).length;
        let winAmount = 0;
        
        // Table de gains simplifiée (Standard Loto)
        if (hits === 2) winAmount = betAmount * 10;
        if (hits === 3) winAmount = betAmount * 100;
        if (hits === 4) winAmount = betAmount * 1000;
        if (hits === 5) winAmount = betAmount * 10000;

        const profit = winAmount - betAmount;
        currentBalance += profit;

        if (hits < 2) consecutiveLosses++;
        else {
            consecutiveLosses = 0;
            wins++;
        }

        // Drawdown stats
        if (currentBalance > peakBalance) peakBalance = currentBalance;
        const dd = (peakBalance - currentBalance) / peakBalance;
        if (dd > maxDD) maxDD = dd;

        simHistory.push({
            date: targetDraw.date,
            balance: currentBalance,
            bet: betAmount,
            hits,
            profit
        });
    }

    return {
        totalDraws: simulationWindow.length,
        netProfit: currentBalance - INITIAL_BANKROLL,
        roi: ((currentBalance - INITIAL_BANKROLL) / INITIAL_BANKROLL) * 100,
        maxDrawdown: maxDD * 100,
        winRate: (wins / simulationWindow.length) * 100,
        bankruptcyDraw,
        strategy,
        history: simHistory
    };
};
