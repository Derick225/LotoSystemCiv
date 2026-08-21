import { AlgoWeights } from "../types";
import { DrawResult } from "../types";
import { generateMasterPrediction } from "./predictionEngine";
import { purifyHistoryForDraw } from "../utils/arrayUtils";
import { useNexusStore } from "../store/useNexusStore";
import { getPayoutMultiplier } from "../constants";

export type BettingStrategy = "FLAT" | "MARTINGALE" | "KELLY" | "CONFIDENCE_SMART";

export interface BacktestReport {
  totalDraws: number;
  netProfit: number;
  roi: number;
  maxDrawdown: number;
  winRate: number;
  sharpeRatio: number;
  sortinoRatio: number; // NOUVEAU
  profitFactor: number; // NOUVEAU
  recoveryFactor: number; // NOUVEAU
  bankruptcyDraw: number | null;
  strategy: BettingStrategy;
  history: {
    date: string;
    balance: number;
    bet: number;
    hits: number;
    profit: number;
  }[];
}

export interface SimulationConfig {
  drawName: string;
  history: DrawResult[];
  weights: AlgoWeights;
  depth: number;
  strategy: BettingStrategy;
  onProgress?: (percent: number) => void;
  initialBankroll?: number;
  unitBet?: number;
  payoutModel?: string;
}



const calculateStandardDeviation = (data: number[], mean: number): number => {
  if (data.length < 2) return 0;
  const variance =
    data.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) /
    (data.length - 1);
  return Math.sqrt(variance);
};

export async function runSimulationCore(config: SimulationConfig) {
  const { drawName, weights, depth, strategy, initialBankroll, unitBet } = config;
  
  const history = purifyHistoryForDraw(drawName, config.history);

  if (!history || history.length < depth) {
    throw new Error("Historique insuffisant pour la profondeur demandée.");
  }

  const simWindow = history.slice(0, depth).reverse();
  const INITIAL_BANKROLL = initialBankroll || 50000;
  const UNIT_BET = unitBet || 200;

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

  let stdDevReturn = 0; // Calcul différé pour pouvoir l'utiliser dans la boucle, mais avec les données courantes

  for (let i = 0; i < simWindow.length; i++) {
    // Calcul anticipé de stdDevReturn pour utilisation dans la stratégie Kelly
    if (returns.length > 1) {
      const currentAvgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
      stdDevReturn = calculateStandardDeviation(returns, currentAvgReturn);
    }
    if (config.onProgress && i % 5 === 0) {
      config.onProgress(Math.round((i / simWindow.length) * 100));
    }

    if (balance < UNIT_BET) {
      if (bankruptcyAt === null) bankruptcyAt = i;
      simHistory.push({
        date: simWindow[i].date,
        balance: 0,
        bet: 0,
        hits: 0,
        profit: 0,
      });
      continue;
    }

    const prevBalance = balance;
    const target = simWindow[i];
    const originalIndex = depth - 1 - i;
    const context = history.slice(originalIndex + 1);

    const temporalDepth = useNexusStore?.getState()?.temporalDepth ?? 100;
    const predictionResult = await generateMasterPrediction(
      config.drawName,
      context,
      temporalDepth,
      weights,
      undefined,
      undefined,
      true // skipTraining
    );
    const prediction = predictionResult.suggestedNumbers;

    let bet = UNIT_BET;

    if (strategy === "MARTINGALE") {
      // Croissance continue dérivée de la fonction exponentielle au lieu du pow(2, 6) arbitraire
      const growthRate = Math.log(2); 
      const growthFactor = Math.exp(consecutiveLosses * growthRate);
      bet = UNIT_BET * growthFactor;
      
      // Plafond dynamique basé sur l'aversion au risque continue
      const dynamicCap = balance * Math.exp(-maxDrawdown * 5.0);
      if (bet > dynamicCap) bet = Math.floor(dynamicCap);
    } else if (strategy === "KELLY") {
      const confidence = predictionResult.confidence || Math.round(100 * Math.exp(-1.0));
      const modelProb = confidence / 100.0;
      
      // Probabilité de base théorique C(5,2)*C(85,3)/C(90,5) -> ~0.0224
      const theoreticalProb = (10 * 98770) / 43949268;
      const empiricalProb = rollingDraws > 0 ? rollingWins / rollingDraws : theoreticalProb;
      
      // Combinaison convexe de la probabilité selon la confiance
      const p = modelProb * empiricalProb + (1 - modelProb) * theoreticalProb;
      const q = 1 - p;

      // Cote moyenne dynamique calculée depuis l'historique des gains
      const recentWins = simHistory.filter(h => h.hits >= 2);
      const avgPayoutOdds = recentWins.length > 0
        ? recentWins.reduce((sum, h) => sum + (h.profit + h.bet) / h.bet, 0) / recentWins.length
        // Fallback: theoretical expected payout = 1/p where p = theoreticalProb (fair odds)
        : 1.0 / theoreticalProb;
      
      const b = avgPayoutOdds - 1;
      let f = b > 0 ? (b * p - q) / b : 0;
      
      // Tolérance au risque dynamique dérivée de la volatilité (Drawdown) au lieu des fractions de Kelly hardcodées (0.25, 0.10)
      const riskTolerance = Math.exp(-maxDrawdown * 3.0); // Décroissance exponentielle du risque autorisée
      f = Math.max(0, f * riskTolerance);
      
      // Fraction lissée par la variance des retours
      const variancePenalty = stdDevReturn > 0 ? (1 / (1 + stdDevReturn)) : 1.0;
      f = f * variancePenalty;

      bet = Math.floor(balance * f);
      if (bet < UNIT_BET) bet = UNIT_BET;
    } else if (strategy === "CONFIDENCE_SMART") {
      const confidence = predictionResult.confidence || Math.round(100 * Math.exp(-1.0));
      const modelConfidence = confidence / 100.0;
      
      // Taux de réussite récent glissant
      const theoreticalProb = (10 * 98770) / 43949268;
      const recentForm = rollingDraws > 0 ? rollingWins / rollingDraws : theoreticalProb;
      
      // formZ weight: 1/log(rollingDraws+2) ensures influence decays as sample grows
      const formZ = recentForm > 0 ? Math.log(recentForm / theoreticalProb) : 0;
      const formWeight = rollingDraws > 0 ? 1.0 / Math.log(rollingDraws + 2) : 0.1;
      const continuousMultiplier = Math.exp(modelConfidence + formZ * formWeight);
      
      bet = Math.floor(UNIT_BET * continuousMultiplier);
      
      // Protection strictement différentiable 
      const dynamicCap = balance * Math.max(0.01, modelConfidence * Math.exp(-maxDrawdown * 4.0));
      if (bet > dynamicCap) bet = Math.floor(dynamicCap);
      if (bet < UNIT_BET) bet = UNIT_BET;
    }

    if (balance < bet) bet = balance;

    const hits = prediction.filter((n) => target.gagnants.includes(n)).length;
    const mult = getPayoutMultiplier(config.payoutModel || "LEGACY", hits);
    const winAmount = bet * mult;

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

    const periodReturn =
      prevBalance > 0 ? (balance - prevBalance) / prevBalance : 0;
    returns.push(periodReturn);

    simHistory.push({
      date: target.date,
      balance,
      bet,
      hits,
      profit,
    });
  }

  const avgReturn = returns.reduce((a, b) => a + b, 0) / (returns.length || 1);
  stdDevReturn = calculateStandardDeviation(returns, avgReturn);
  const sharpeRatio = stdDevReturn === 0 ? 0 : avgReturn / stdDevReturn;

  // Calcul du Sortino Ratio (ne pénalise que la volatilité négative)
  const negativeReturns = returns.filter(r => r < 0);
  const avgNegativeReturn = negativeReturns.length > 0 ? negativeReturns.reduce((a, b) => a + b, 0) / negativeReturns.length : 0;
  const downsideDeviation = calculateStandardDeviation(negativeReturns, avgNegativeReturn);
  const sortinoRatio = downsideDeviation === 0 ? (avgReturn > 0 ? 999 : 0) : avgReturn / downsideDeviation;

  // Calcul du Profit Factor (Gains Bruts / Pertes Brutes)
  const grossProfit = simHistory.reduce((sum, h) => h.profit > 0 ? sum + h.profit : sum, 0);
  const grossLoss = Math.abs(simHistory.reduce((sum, h) => h.profit < 0 ? sum + h.profit : sum, 0));
  const profitFactor = grossLoss === 0 ? (grossProfit > 0 ? 999 : 0) : grossProfit / grossLoss;

  // Calcul du Recovery Factor (Profit Net / Max Drawdown Monétaire)
  const netProfit = balance - INITIAL_BANKROLL;
  const maxDrawdownMonetary = INITIAL_BANKROLL * maxDrawdown; // approximation
  const recoveryFactor = maxDrawdownMonetary === 0 ? (netProfit > 0 ? 999 : 0) : netProfit / maxDrawdownMonetary;

  return {
    totalDraws: depth,
    netProfit,
    roi: ((balance - INITIAL_BANKROLL) / INITIAL_BANKROLL) * 100,
    maxDrawdown: parseFloat((maxDrawdown * 100).toFixed(2)),
    winRate: parseFloat(((wins / depth) * 100).toFixed(2)),
    sharpeRatio: parseFloat(sharpeRatio.toFixed(4)),
    sortinoRatio: parseFloat(sortinoRatio.toFixed(4)),
    profitFactor: parseFloat(profitFactor.toFixed(4)),
    recoveryFactor: parseFloat(recoveryFactor.toFixed(4)),
    bankruptcyDraw: bankruptcyAt,
    strategy,
    history: simHistory,
  };
}
