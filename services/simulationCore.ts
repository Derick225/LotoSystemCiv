import type { AlgoWeights } from '../types';
export interface DrawResultLite { gagnants: number[]; date: string; }
export type BettingStrategy = 'FLAT' | 'MARTINGALE' | 'KELLY';

export interface BacktestReport {
    totalDraws: number;
    netProfit: number;
    roi: number;
    maxDrawdown: number;
    winRate: number;
    sharpeRatio: number;
    bankruptcyDraw: number | null;
    strategy: BettingStrategy;
    history: { date: string, balance: number, bet: number, hits: number, profit: number }[];
}

export interface SimulationConfig {
    drawName: string;
    history: DrawResultLite[];
    weights: AlgoWeights;
    depth: number;
    strategy: BettingStrategy;
}

const scoresBuffer = new Float32Array(91);

const quickPredict = (history: DrawResultLite[], weights: AlgoWeights, buffer: Float32Array): number[] => {
    buffer.fill(0);
    const limit = Math.min(history.length, 30);
    
    const freqWeight = weights.frequency || 0.2;
    for(let i=0; i<limit; i++) {
        const d = history[i].gagnants;
        const w = freqWeight * (1 - (i / 50)); 
        for(let k=0; k<d.length; k++) {
            buffer[d[k]] += w;
        }
    }

    const markovWeight = weights.markov || 0.15;
    if(history.length > 1) {
        const last = history[0].gagnants;
        for(let i=0; i<limit-1; i++) {
            const current = history[i].gagnants;
            const prev = history[i+1].gagnants;
            let intersect = false;
            for(let a=0; a<prev.length; a++) {
                if(last.includes(prev[a])) { intersect = true; break; }
            }
            
            if (intersect) {
                for(let b=0; b<current.length; b++) {
                    buffer[current[b]] += markovWeight;
                }
            }
        }
    }

    const candidates = [];
    for(let i=1; i<=90; i++) {
        if (buffer[i] > 0) candidates.push({ n: i, s: buffer[i] });
    }
    candidates.sort((a,b) => b.s - a.s);
    
    const result = new Array(5);
    for(let i=0; i<5; i++) result[i] = candidates[i] ? candidates[i].n : (i+1);
    return result;
};

const calculateStandardDeviation = (data: number[], mean: number): number => {
    if (data.length < 2) return 0;
    const variance = data.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / (data.length - 1);
    return Math.sqrt(variance);
};

export function runSimulationCore(config: SimulationConfig) {
    const { history, weights, depth, strategy } = config;
    
    if (!history || history.length < depth) {
        throw new Error("Historique insuffisant pour la profondeur demandée.");
    }

    const simWindow = history.slice(0, depth).reverse();
    const INITIAL_BANKROLL = 50000;
    const UNIT_BET = 200;
    
    let balance = INITIAL_BANKROLL;
    let peakBalance = INITIAL_BANKROLL;
    let maxDrawdown = 0;
    let wins = 0;
    let consecutiveLosses = 0;
    let bankruptcyAt: number | null = null;
    const returns: number[] = [];
    let rollingWins = 0;
    let rollingDraws = 0;
    const simHistory = [];

    for (let i = 0; i < simWindow.length; i++) {
        if (balance < UNIT_BET) {
            if (bankruptcyAt === null) bankruptcyAt = i;
            simHistory.push({ date: simWindow[i].date, balance: 0, bet: 0, hits: 0, profit: 0 });
            continue;
        }

        const prevBalance = balance;
        const target = simWindow[i];
        const originalIndex = depth - 1 - i;
        const context = history.slice(originalIndex + 1);

        const prediction = quickPredict(context, weights, scoresBuffer);
        let bet = UNIT_BET;

        if (strategy === 'MARTINGALE') {
            bet = UNIT_BET * Math.pow(2, Math.min(consecutiveLosses, 6));
        } 
        else if (strategy === 'KELLY') {
            const ODDS = 240;
            const winRate = rollingDraws > 0 ? (rollingWins / rollingDraws) : 0.05;
            const p = Math.max(0.005, winRate);
            const q = 1 - p;
            let f = ((ODDS * p) - q) / ODDS;
            f = Math.max(0, f * 0.3); 
            f = Math.min(f, 0.05); 
            bet = Math.floor(balance * f);
            if (bet < UNIT_BET && f > 0) bet = UNIT_BET;
            if (f <= 0) bet = UNIT_BET;
        }

        if (balance < bet) bet = balance;

        const hits = prediction.filter(n => target.gagnants.includes(n)).length;
        let winAmount = 0;
        if (hits === 2) winAmount = bet * 15;
        else if (hits === 3) winAmount = bet * 100;
        else if (hits === 4) winAmount = bet * 1500;
        else if (hits === 5) winAmount = bet * 15000;

        const profit = winAmount - bet;
        balance += profit;
        
        if (balance > peakBalance) {
            peakBalance = balance;
        } else {
            const dd = (peakBalance - balance) / peakBalance;
            if (dd > maxDrawdown) maxDrawdown = dd;
        }

        if (hits < 2) {
            consecutiveLosses++;
        } else {
            consecutiveLosses = 0;
            wins++;
            rollingWins++;
        }
        rollingDraws++;

        const periodReturn = prevBalance > 0 ? (balance - prevBalance) / prevBalance : 0;
        returns.push(periodReturn);

        simHistory.push({
            date: target.date,
            balance,
            bet,
            hits,
            profit
        });
    }

    const avgReturn = returns.reduce((a, b) => a + b, 0) / (returns.length || 1);
    const stdDevReturn = calculateStandardDeviation(returns, avgReturn);
    const sharpeRatio = stdDevReturn === 0 ? 0 : (avgReturn / stdDevReturn);

    return {
        totalDraws: depth,
        netProfit: balance - INITIAL_BANKROLL,
        roi: ((balance - INITIAL_BANKROLL) / INITIAL_BANKROLL) * 100,
        maxDrawdown: parseFloat((maxDrawdown * 100).toFixed(2)),
        winRate: parseFloat(((wins / depth) * 100).toFixed(2)),
        sharpeRatio: parseFloat(sharpeRatio.toFixed(4)),
        bankruptcyDraw: bankruptcyAt,
        strategy,
        history: simHistory
    };
}
