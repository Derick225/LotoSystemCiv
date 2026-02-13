
export {};

/**
 * Nexus Backtesting Worker v3.0 (HPC Edition)
 * Moteur de simulation financière haute performance.
 * Inclut: Sharpe Ratio, Kelly Criterion adaptatif, Max Drawdown continu.
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

// Buffer réutilisable pour éviter les allocations mémoire dans la boucle (GC Optimization)
const scoresBuffer = new Float32Array(91);

/**
 * Prédiction rapide optimisée pour la simulation (Zéro allocation)
 * Utilise le buffer global `scoresBuffer`.
 */
const quickPredict = (history: DrawResultLite[], weights: AlgoWeights, buffer: Float32Array): number[] => {
    buffer.fill(0);
    const limit = Math.min(history.length, 30);
    
    // 1. Fréquence (Optimisée)
    const freqWeight = weights.frequency || 0.2;
    // Unrolling partiel ou accès direct
    for(let i=0; i<limit; i++) {
        const d = history[i].gagnants;
        // Poids décroissant temporel simple
        const w = freqWeight * (1 - (i / 50)); 
        for(let k=0; k<d.length; k++) {
            buffer[d[k]] += w;
        }
    }

    // 2. Markov (Simplifié)
    const markovWeight = weights.markov || 0.15;
    if(history.length > 1) {
        const last = history[0].gagnants;
        for(let i=0; i<limit-1; i++) {
            const current = history[i].gagnants;
            const prev = history[i+1].gagnants;
            // Intersection check optimisé (taille 5, boucle nested ok)
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

    // Sélection Top 5 (Tri partiel in-place serait mieux, mais mapping simple ok pour <100 items)
    // On utilise un tableau temporaire minimal pour stocker index et score
    const candidates = [];
    for(let i=1; i<=90; i++) {
        if (buffer[i] > 0) candidates.push({ n: i, s: buffer[i] });
    }
    // Tri décroissant
    candidates.sort((a,b) => b.s - a.s);
    
    // Extraction
    const result = new Array(5);
    // Fill avec 0 si pas assez de candidats (ne devrait pas arriver avec freqWeight > 0)
    for(let i=0; i<5; i++) result[i] = candidates[i] ? candidates[i].n : (i+1);
    return result;
};

const calculateStandardDeviation = (data: number[], mean: number): number => {
    if (data.length < 2) return 0;
    const variance = data.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / (data.length - 1);
    return Math.sqrt(variance);
};

ctx.onmessage = (e: MessageEvent) => {
    const { history, weights, depth, strategy } = e.data as SimulationConfig;
    
    if (!history || history.length < depth) {
        ctx.postMessage({ error: "Historique insuffisant pour la profondeur demandée." });
        return;
    }

    // Inversion pour chronologie : [Plus ancien ... Plus récent]
    // On simule du passé vers le présent
    const simWindow = history.slice(0, depth).reverse();
    
    // Paramètres financiers
    const INITIAL_BANKROLL = 50000;
    const UNIT_BET = 200; // Mise de base réaliste
    
    let balance = INITIAL_BANKROLL;
    let peakBalance = INITIAL_BANKROLL;
    let maxDrawdown = 0;
    
    let wins = 0;
    let consecutiveLosses = 0;
    let bankruptcyAt: number | null = null;
    
    // Métriques pour Sharpe Ratio (Rendement par tirage)
    const returns: number[] = [];
    
    // Kelly Metrics (Adaptive)
    let rollingWins = 0;
    let rollingDraws = 0;

    const simHistory = [];

    // Seuil de progression (tous les 5%)
    const progressStep = Math.max(1, Math.floor(depth * 0.05));

    for (let i = 0; i < simWindow.length; i++) {
        // Stop si faillite
        if (balance < UNIT_BET) {
            if (bankruptcyAt === null) bankruptcyAt = i;
            simHistory.push({ date: simWindow[i].date, balance: 0, bet: 0, hits: 0, profit: 0 });
            // On continue la boucle pour avoir l'historique complet mais avec balance 0
            continue;
        }

        const prevBalance = balance;
        const target = simWindow[i];
        
        // Context : Historique disponible À CE MOMENT LÀ (excluant le futur simulé)
        // L'historique brut est décroissant. 
        // Si depth=50, i=0 (le plus vieux simulé), c'est l'index 49 dans history.
        // On a besoin de tout ce qui est APRES l'index 49.
        const originalIndex = depth - 1 - i;
        const context = history.slice(originalIndex + 1);

        const prediction = quickPredict(context, weights, scoresBuffer);
        
        // --- GESTION DES MISES ---
        let bet = UNIT_BET;

        if (strategy === 'MARTINGALE') {
            // Martingale bornée (max 6 coups pour éviter l'explosion exponentielle)
            bet = UNIT_BET * Math.pow(2, Math.min(consecutiveLosses, 6));
        } 
        else if (strategy === 'KELLY') {
            // Kelly Adaptatif Fractionnel (Safe Kelly)
            const ODDS = 240; // Cote moyenne pondérée pour 2N
            
            // Estimation proba (Prior optimiste 5% + historique récent)
            const winRate = rollingDraws > 0 ? (rollingWins / rollingDraws) : 0.05;
            const p = Math.max(0.005, winRate); // Min 0.5% prob
            const q = 1 - p;
            
            // Formule Kelly : f* = (bp - q) / b
            let f = ((ODDS * p) - q) / ODDS;
            
            // Sécurité : Half-Kelly (0.5) et max 5% du capital par pari
            f = Math.max(0, f * 0.3); 
            f = Math.min(f, 0.05); 
            
            bet = Math.floor(balance * f);
            // Fallback mise min si Kelly trop faible mais positif
            if (bet < UNIT_BET && f > 0) bet = UNIT_BET;
            if (f <= 0) bet = UNIT_BET; // Fallback Flat si espérance négative
        }

        if (balance < bet) bet = balance; // All-in forcé

        // --- RÉSULTAT ---
        const hits = prediction.filter(n => target.gagnants.includes(n)).length;
        let winAmount = 0;
        
        // Table des gains (Standard Loto)
        if (hits === 2) winAmount = bet * 15; // Gain standard pour 2 numéros
        else if (hits === 3) winAmount = bet * 100;
        else if (hits === 4) winAmount = bet * 1500;
        else if (hits === 5) winAmount = bet * 15000;

        // Mise à jour stats
        const profit = winAmount - bet;
        balance += profit;
        
        // Drawdown Tracking
        if (balance > peakBalance) {
            peakBalance = balance;
        } else {
            const dd = (peakBalance - balance) / peakBalance;
            if (dd > maxDrawdown) maxDrawdown = dd;
        }

        // Streak Tracking
        if (hits < 2) {
            consecutiveLosses++;
        } else {
            consecutiveLosses = 0;
            wins++;
            rollingWins++;
        }
        rollingDraws++;

        // Return Tracking (pour Sharpe) - Rendement par trade
        // Évite la division par zéro
        const periodReturn = prevBalance > 0 ? (balance - prevBalance) / prevBalance : 0;
        returns.push(periodReturn);

        simHistory.push({
            date: target.date,
            balance,
            bet,
            hits,
            profit
        });

        // Reporting progressif
        if (i % progressStep === 0) {
            ctx.postMessage({ type: 'progress', percent: Math.round((i / depth) * 100) });
        }
    }

    // --- ANALYSE FINALE ---
    
    // Calcul Sharpe Ratio (Annualisé simplifié)
    const avgReturn = returns.reduce((a, b) => a + b, 0) / (returns.length || 1);
    const stdDevReturn = calculateStandardDeviation(returns, avgReturn);
    // Sharpe = (Rp - Rf) / Sigma. Rf (Risk Free) = 0 ici.
    // On normalise le ratio pour qu'il soit lisible (souvent annualisé, ici "par tirage")
    const sharpeRatio = stdDevReturn === 0 ? 0 : (avgReturn / stdDevReturn);

    const report = {
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

    ctx.postMessage({ type: 'result', report });
};
