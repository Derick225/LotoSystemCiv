
export {};

/**
 * Nexus Backtesting Worker v2.0
 * Moteur de simulation financière asynchrone
 */

interface DrawResultLite { gagnants: number[]; date: string; }
interface AlgoWeights { [key: string]: number; }
interface SimulationConfig {
    drawName: string;
    history: DrawResultLite[];
    weights: AlgoWeights;
    depth: number;
    strategy: 'FLAT' | 'MARTINGALE' | 'KELLY';
}

const ctx = self as unknown as Worker;

// Version simplifiée et rapide du moteur de prédiction pour les milliers d'itérations
const quickPredict = (history: DrawResultLite[], weights: AlgoWeights): number[] => {
    const scores = new Float32Array(91).fill(0);
    const limit = Math.min(history.length, 30);
    
    // Fréquence pondérée
    const freqWeight = weights.frequency || 0.2;
    for(let i=0; i<limit; i++) {
        history[i].gagnants.forEach(n => scores[n] += freqWeight);
    }

    // Markov simplifié
    const markovWeight = weights.markov || 0.15;
    if(history.length > 1) {
        const last = history[0].gagnants;
        for(let i=0; i<limit-1; i++) {
            const current = history[i].gagnants;
            const prev = history[i+1].gagnants;
            if (prev.some(p => last.includes(p))) {
                current.forEach(n => scores[n] += markovWeight * 2);
            }
        }
    }

    // Sélection Top 5
    const candidates = [];
    for(let i=1; i<=90; i++) candidates.push({n: i, s: scores[i]});
    candidates.sort((a,b) => b.s - a.s);
    return candidates.slice(0, 5).map(c => c.n);
};

ctx.onmessage = (e: MessageEvent) => {
    const { history, weights, depth, strategy } = e.data as SimulationConfig;
    
    if (!history || history.length < depth) {
        ctx.postMessage({ error: "Historique insuffisant" });
        return;
    }

    // Inversion pour chronologie : [Oldest ... Newest]
    const simWindow = history.slice(0, depth).reverse();
    
    let balance = 50000;
    let peak = 50000;
    let maxDD = 0;
    let wins = 0;
    let bankruptcyAt: number | null = null;
    let consecutiveLosses = 0;
    const simHistory = [];

    const unitBet = 100;

    for (let i = 0; i < simWindow.length; i++) {
        if (balance < unitBet) {
            if (bankruptcyAt === null) bankruptcyAt = i;
            simHistory.push({ date: simWindow[i].date, balance: 0, bet: 0, hits: 0, profit: 0 });
            continue;
        }

        const target = simWindow[i];
        // Contexte historique au moment du tirage (exclut le tirage cible et les futurs)
        // L'index dans history original (qui est desc) est: depth - 1 - i + 1
        const contextStartIdx = (depth - 1 - i) + 1;
        const context = history.slice(contextStartIdx);

        const prediction = quickPredict(context, weights);
        
        // Stratégie de Mise
        let bet = unitBet;
        if (strategy === 'MARTINGALE') {
            bet = unitBet * Math.pow(2, Math.min(consecutiveLosses, 5));
        } else if (strategy === 'KELLY') {
            // Kelly simplifié sur proba fixe estimée
            bet = Math.max(unitBet, Math.floor(balance * 0.05));
        }

        if (balance < bet) bet = balance; // All-in si reste moins que la mise

        const hits = prediction.filter(n => target.gagnants.includes(n)).length;
        let winAmount = 0;
        
        if (hits === 2) winAmount = bet * 10;
        if (hits === 3) winAmount = bet * 100;
        if (hits === 4) winAmount = bet * 1000;
        if (hits === 5) winAmount = bet * 10000;

        const profit = winAmount - bet;
        balance += profit;

        if (hits < 2) consecutiveLosses++;
        else {
            consecutiveLosses = 0;
            wins++;
        }

        if (balance > peak) peak = balance;
        const dd = peak > 0 ? (peak - balance) / peak : 0;
        if (dd > maxDD) maxDD = dd;

        simHistory.push({
            date: target.date,
            balance,
            bet,
            hits,
            profit
        });

        // Progress report tous les 10%
        if (i % Math.floor(depth / 10) === 0) {
            ctx.postMessage({ type: 'progress', percent: Math.round((i / depth) * 100) });
        }
    }

    const report = {
        totalDraws: depth,
        netProfit: balance - 50000,
        roi: ((balance - 50000) / 50000) * 100,
        maxDrawdown: maxDD * 100,
        winRate: (wins / depth) * 100,
        bankruptcyDraw: bankruptcyAt,
        strategy,
        history: simHistory
    };

    ctx.postMessage({ type: 'result', report });
};
