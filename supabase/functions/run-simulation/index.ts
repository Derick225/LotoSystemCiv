import { z } from "zod";
import { corsHeaders } from "../_shared/cors.ts";
import { DrawResult } from "../_shared/types.ts";

// --- VALIDATION SCHEMA ---
const SimulationRequestSchema = z.object({
  drawName: z.string(),
  history: z.array(z.record(z.unknown())),
  weights: z.record(z.number()),
  depth: z.number().max(500),
  strategy: z.enum(["FLAT", "MARTINGALE", "KELLY", "CONFIDENCE_SMART"]).default("FLAT"),
});

const executeSimulation = (
  drawName: string,
  history: DrawResult[],
  weights: Record<string, number>,
  depth: number,
  strategy: "FLAT" | "MARTINGALE" | "KELLY",
) => {
  let balance = 50000;
  const initialBalance = 50000;
  const ticketCost = 100;

  let hitsCount = 0;
  let totalSpent = 0;
  let totalWon = 0;
  let maxDrawdown = 0;
  let maxBalance = balance;
  let consecutiveLosses = 0;
  let maxConsecutiveLosses = 0;

  const reportHistory = [];
  const simulatedDepth = Math.min(depth, history.length - 10);

  const simulationWindow = history.slice(0, simulatedDepth + 10).reverse();

  for (let i = 10; i < simulationWindow.length; i++) {
    const actualDraw = simulationWindow[i];

    let wager = ticketCost;
    if (strategy === "MARTINGALE") {
      wager = ticketCost * Math.pow(2, Math.min(consecutiveLosses, 10));
      if (wager > balance) wager = balance;
    } else if (strategy === "KELLY") {
      // Dynamic edge based on normalized confidence derived from previous hits instead of hardcoded 0.05
      const empiricalWinRate = hitsCount / Math.max(1, i - 10);
      const edge = Math.max(Math.exp(-4.0), empiricalWinRate * 0.5); 
      const odds = 10;
      const f = (edge * odds - (1 - edge)) / odds;
      wager = Math.max(ticketCost, balance * Math.max(Math.exp(-6.0), Math.min(f, Math.exp(-2.0))));
    }

    if (wager > balance) break;

    balance -= wager;
    totalSpent += wager;

    // --- REALISTIC PREDICTION (Ported from predict-elite) ---
    const recentHistory = simulationWindow.slice(0, i).reverse().slice(0, 50); // Up to 50 recent draws
    // Derive maxNum correctly
    let discoveredMaxNum = 0;
    recentHistory.forEach((d) => {
        (d.gagnants || []).forEach((n: number) => {
            if (n > discoveredMaxNum) discoveredMaxNum = n;
        });
    });
    const maxNum = discoveredMaxNum > 0 ? discoveredMaxNum : 49;
    
    // Feature Extraction inline
    const freq = new Map<number, number>();
    const lastSeen = new Map<number, number>();
    const markovMatrix = new Map<number, Map<number, number>>();

    recentHistory.forEach((draw, drawIndex) => {
        const nums = draw.gagnants || [];
        nums.forEach((n: number) => {
            freq.set(n, (freq.get(n) || 0) + 1);
            if (!lastSeen.has(n)) lastSeen.set(n, drawIndex);

            if (!markovMatrix.has(n)) markovMatrix.set(n, new Map());
            const transitions = markovMatrix.get(n)!;
            nums.forEach((nextN: number) => {
                if (n !== nextN) transitions.set(nextN, (transitions.get(nextN) || 0) + 1);
            });
        });
    });

    const masterScores: Array<{ num: number, score: number }> = [];

    for (let num = 1; num <= maxNum; num++) {
        let finalScore = 0;
        
        // POISSON
        const expectedLambda = (freq.get(num) || 0) / recentHistory.length; 
        const currentGap = lastSeen.get(num) || recentHistory.length;
        const poissonScore = expectedLambda * currentGap * 10;

        // MARKOV
        let markovScore = 0;
        if (recentHistory[0] && recentHistory[0].gagnants) {
            recentHistory[0].gagnants.forEach((lastWinner: number) => {
                const transitions = markovMatrix.get(lastWinner);
                if (transitions && transitions.has(num)) markovScore += (transitions.get(num) || 0);
            });
        }
        
        // GAP VELOCITY
        const fGet = freq.get(num);
        const avgGap = fGet && fGet > 0 ? (recentHistory.length / fGet) : recentHistory.length;
        const gapVelocity = currentGap / avgGap; 

        const uniformWeight = 1.0 / 3.0;
        const wPoisson = weights?.poisson || uniformWeight;
        const wMarkov = weights?.markov || uniformWeight;
        const wGap = weights?.gap_velocity || uniformWeight;

        finalScore = (poissonScore * wPoisson) + (markovScore * wMarkov) + (gapVelocity * wGap);
        masterScores.push({ num, score: finalScore });
    }

    const topPredictions = masterScores
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map(s => s.num);

    let hitsInDraw = 0;
    if (actualDraw && actualDraw.gagnants) {
        hitsInDraw = topPredictions.filter(p => actualDraw.gagnants.includes(p)).length;
    }

    const isHit = hitsInDraw >= 2; 
    
    let won = 0;
    if (isHit) {
      hitsCount++;
      won = wager * (hitsInDraw * 7.5);
      balance += won;
      totalWon += won;
      consecutiveLosses = 0;
    } else {
      consecutiveLosses++;
      if (consecutiveLosses > maxConsecutiveLosses) maxConsecutiveLosses = consecutiveLosses;
    }

    if (balance > maxBalance) maxBalance = balance;
    const drawdown = ((maxBalance - balance) / maxBalance) * 100;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;

    reportHistory.push({
      date: actualDraw.date,
      balance,
      wager,
      won,
      isHit,
    });

    if (balance <= 0) break;
  }

  const netProfit = balance - initialBalance;
  const roi = totalSpent > 0 ? (netProfit / totalSpent) * 100 : 0;
  const winRate = simulatedDepth > 0 ? (hitsCount / simulatedDepth) * 100 : 0;

  return {
    strategy,
    finalBalance: balance,
    netProfit,
    roi,
    maxDrawdown,
    maxConsecutiveLosses,
    winRate,
    history: reportHistory,
    status: balance <= 0 ? "BANKRUPT" : "ALIVE",
  };
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const validation = SimulationRequestSchema.safeParse(body);

    if (!validation.success) {
      return new Response(
        JSON.stringify({ error: "Invalid Request payload", details: validation.error.format() }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const { history, weights, depth, strategy, drawName } = validation.data;

    const report = executeSimulation(
      drawName,
      history as unknown as DrawResult[],
      weights,
      depth,
      strategy,
    );

    return new Response(JSON.stringify(report), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
  } catch (error) {
    const err = error as Error;
    return new Response(JSON.stringify({ error: err.message || "Unknown Error" }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
  }
});
