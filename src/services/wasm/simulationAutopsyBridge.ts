/**
 * SIMULATIONS MONTE CARLO, KL-DIVERGENCE, FINANCE BACKTEST & AUTOPSIE BOUCLE FERMÉE (RUST / WASM + FALLBACK C^∞)
 */
import {
  getWasmModuleInstance,
  isLotoEngineWasmReady,
  recordWasmFallback,
} from './wasmRuntime';

export interface MonteCarloBallStatHpc {
  ball: number;
  meanScore: number;
  stdDev: number;
  p5: number;
  p95: number;
  stabilityIndex: number;
}

/**
 * Test de Stress Monte Carlo What-If en Rust/WASM (zéro GC, mémoire contiguë)
 */
export function runMonteCarloWhatIfHpc(params: {
  baseMatrix: Float64Array | number[];
  kAlgos: number;
  baseWeights: Float64Array | number[];
  iterations?: number;
  noiseStdDev?: number;
  seed?: number | bigint;
}): MonteCarloBallStatHpc[] {
  const kAlgos = Math.max(1, params.kAlgos);
  const iterations = Math.max(10, params.iterations ?? 100);
  const noiseStdDev = Math.max(0.0001, params.noiseStdDev ?? 0.05);
  const seedBigInt =
    typeof params.seed === 'bigint'
      ? params.seed
      : BigInt(Math.max(1, Math.floor(Number(params.seed) || 123456789)));

  const baseMatrixF64 =
    params.baseMatrix instanceof Float64Array ? params.baseMatrix : new Float64Array(params.baseMatrix);
  const baseWeightsF64 =
    params.baseWeights instanceof Float64Array ? params.baseWeights : new Float64Array(params.baseWeights);

  if (isLotoEngineWasmReady() && getWasmModuleInstance()?.run_monte_carlo_whatif_hpc) {
    try {
      const report = getWasmModuleInstance().run_monte_carlo_whatif_hpc(
        baseMatrixF64,
        kAlgos,
        baseWeightsF64,
        iterations,
        noiseStdDev,
        seedBigInt
      );
      const count = report.count;
      const stats: MonteCarloBallStatHpc[] = [];
      for (let i = 0; i < count; i++) {
        stats.push({
          ball: report.get_ball(i),
          meanScore: parseFloat(report.get_mean(i).toFixed(2)),
          stdDev: parseFloat(report.get_std_dev(i).toFixed(2)),
          p5: parseFloat(report.get_p5(i).toFixed(2)),
          p95: parseFloat(report.get_p95(i).toFixed(2)),
          stabilityIndex: parseFloat(report.get_stability_index(i).toFixed(1)),
        });
      }
      if (typeof report.free === 'function') {
        report.free();
      }
      return stats;
    } catch (e) {
      recordWasmFallback('run_what_if_monte_carlo_hpc', e);
    }
  }

  // Fallback vectorisé continu Float64Array (Zero allocation intermédiaire en boucle serrée)
  const linearScores = new Float64Array(iterations * 90);
  let lcg = seedBigInt;
  const nextGaussian = (): number => {
    lcg = (lcg * 6364136223846793005n + 1442695040888963407n) & 0xffffffffffffffffn;
    const u1 = Math.max(1e-12, Number(lcg >> 11n) / 9007199254740992);
    lcg = (lcg * 6364136223846793005n + 1442695040888963407n) & 0xffffffffffffffffn;
    const u2 = Math.max(1e-12, Number(lcg >> 11n) / 9007199254740992);
    return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  };

  const noisyWeights = new Float64Array(kAlgos);

  for (let r = 0; r < iterations; r++) {
    let sumW = 0.0;
    for (let j = 0; j < kAlgos; j++) {
      const g = nextGaussian();
      const w = Math.max(0.0001, (baseWeightsF64[j] || 0) + g * noiseStdDev);
      noisyWeights[j] = w;
      sumW += w;
    }
    const invSum = 1.0 / (sumW || 1e-9);
    for (let j = 0; j < kAlgos; j++) {
      noisyWeights[j] *= invSum;
    }

    const offset = r * 90;
    for (let b = 0; b < 90; b++) {
      let score = 0.0;
      const rowOffset = b * kAlgos;
      for (let j = 0; j < kAlgos; j++) {
        score += (baseMatrixF64[rowOffset + j] || 0) * noisyWeights[j];
      }
      linearScores[offset + b] = score;
    }
  }

  const results: MonteCarloBallStatHpc[] = [];
  const singleBall = new Float64Array(iterations);

  for (let b = 0; b < 90; b++) {
    let sum = 0.0;
    for (let r = 0; r < iterations; r++) {
      const val = linearScores[r * 90 + b];
      singleBall[r] = val;
      sum += val;
    }
    const mean = sum / iterations;

    let varSum = 0.0;
    for (let r = 0; r < iterations; r++) {
      const diff = singleBall[r] - mean;
      varSum += diff * diff;
    }
    const stdDev = Math.sqrt(varSum / iterations);

    singleBall.sort();
    const p5Idx = Math.floor(iterations * 0.05);
    const p95Idx = Math.min(iterations - 1, Math.floor(iterations * 0.95));
    const stability = Math.max(0, 1.0 - stdDev / Math.max(1.0, mean));

    results.push({
      ball: b + 1,
      meanScore: parseFloat(mean.toFixed(2)),
      stdDev: parseFloat(stdDev.toFixed(2)),
      p5: parseFloat(singleBall[p5Idx].toFixed(2)),
      p95: parseFloat(singleBall[p95Idx].toFixed(2)),
      stabilityIndex: parseFloat((stability * 100.0).toFixed(1)),
    });
  }

  results.sort((a, b) => b.meanScore - a.meanScore || a.ball - b.ball);
  return results;
}

/**
 * Divergence de Kullback-Leibler continue sur Simplex 90D en Rust/WASM
 */
export function computeKlDivergenceHpc(
  pBase: Float64Array | number[],
  pSim: Float64Array | number[]
): number {
  const pBaseF64 = pBase instanceof Float64Array ? pBase : new Float64Array(pBase);
  const pSimF64 = pSim instanceof Float64Array ? pSim : new Float64Array(pSim);

  if (pBaseF64.length < 90 || pSimF64.length < 90) return 0;

  if (isLotoEngineWasmReady() && getWasmModuleInstance()?.compute_kl_divergence_hpc) {
    try {
      const kl = getWasmModuleInstance().compute_kl_divergence_hpc(pBaseF64, pSimF64);
      return parseFloat(Math.max(0, kl).toFixed(5));
    } catch (e) {
      recordWasmFallback('compute_kl_divergence_hpc', e);
    }
  }

  let kl = 0.0;
  for (let i = 0; i < 90; i++) {
    const p = Math.max(1e-12, pBaseF64[i] || 0);
    const q = Math.max(1e-12, pSimF64[i] || 0);
    kl += p * Math.log(p / q);
  }
  return parseFloat(Math.max(0, kl).toFixed(5));
}

export interface FinancialSimulationHpcResult {
  netProfit: number;
  roi: number;
  maxDrawdown: number;
  winRate: number;
  sharpeRatio: number;
  sortinoRatio: number;
  profitFactor: number;
  recoveryFactor: number;
  bankruptcyDraw: number | null;
  balances: number[];
  drawdowns: number[];
}

/**
 * Simulation Financière & Backtest en Rust/WASM (O(N) déterministe)
 */
export function runFinancialSimulationHpc(params: {
  hitsHistory: Int32Array | number[];
  confidences: Float64Array | number[];
  multipliers: Float64Array | number[];
  strategyCode: number; // 0=Flat, 1=Martingale, 2=Kelly, 3=ConfidenceSmart
  initialBankroll: number;
  unitBet: number;
}): FinancialSimulationHpcResult {
  const hits = params.hitsHistory instanceof Int32Array ? params.hitsHistory : new Int32Array(params.hitsHistory);
  const confs = params.confidences instanceof Float64Array ? params.confidences : new Float64Array(params.confidences);
  const mults = params.multipliers instanceof Float64Array ? params.multipliers : new Float64Array(params.multipliers);

  if (isLotoEngineWasmReady() && getWasmModuleInstance()?.run_simulation_hpc) {
    try {
      const res = getWasmModuleInstance().run_simulation_hpc(
        hits,
        confs,
        mults,
        params.strategyCode,
        params.initialBankroll,
        params.unitBet
      );
      const output: FinancialSimulationHpcResult = {
        netProfit: res.net_profit,
        roi: res.roi,
        maxDrawdown: res.max_drawdown,
        winRate: res.win_rate,
        sharpeRatio: res.sharpe_ratio,
        sortinoRatio: res.sortino_ratio,
        profitFactor: res.profit_factor,
        recoveryFactor: res.recovery_factor,
        bankruptcyDraw: res.bankruptcy_draw >= 0 ? res.bankruptcy_draw : null,
        balances: Array.from(res.balances),
        drawdowns: Array.from(res.drawdowns),
      };
      if (typeof res.free === 'function') {
        res.free();
      }
      return output;
    } catch (e) {
      recordWasmFallback('run_simulation_hpc', e);
    }
  }

  let balance = params.initialBankroll;
  let peakBalance = params.initialBankroll;
  let maxDd = 0.0;
  let wins = 0;
  let bankruptcy: number | null = null;
  const balances: number[] = [];
  const drawdowns: number[] = [];
  const returns: number[] = [];
  let grossWins = 0.0;
  let grossLosses = 0.0;
  let consecutiveLosses = 0;

  for (let i = 0; i < hits.length; i++) {
    if (balance < params.unitBet) {
      if (bankruptcy === null) bankruptcy = i;
      balances.push(0);
      drawdowns.push(1.0);
      continue;
    }

    let bet = params.unitBet;
    if (params.strategyCode === 1) {
      bet = params.unitBet * Math.exp(consecutiveLosses * Math.log(2));
      const cap = balance * Math.exp(-maxDd * 5.0);
      if (bet > cap) bet = Math.floor(cap);
    } else if (params.strategyCode === 2) {
      const conf = (confs[i] || 50.0) / 100.0;
      const mult = mults[i] || 1.0;
      const b = Math.max(0.1, mult - 1.0);
      const p = conf;
      const q = 1.0 - p;
      let f = Math.max(0, (b * p - q) / b);
      f = f * Math.exp(-maxDd * 3.0);
      bet = Math.floor(balance * f);
    } else if (params.strategyCode === 3) {
      const conf = (confs[i] || 50.0) / 100.0;
      bet = params.unitBet * (0.5 + conf);
    }
    bet = Math.max(params.unitBet, Math.min(balance, Math.floor(bet)));

    const hit = hits[i];
    const isWin = hit >= 2;
    let profit = -bet;
    if (isWin) {
      wins++;
      consecutiveLosses = 0;
      const mult = mults[i] || 2.0;
      profit = bet * (mult - 1.0);
      grossWins += profit;
    } else {
      consecutiveLosses++;
      grossLosses += bet;
    }

    const prevBal = balance;
    balance += profit;
    returns.push(prevBal > 0 ? profit / prevBal : 0);
    balances.push(balance);

    if (balance > peakBalance) peakBalance = balance;
    const currentDd = peakBalance > 0 ? (peakBalance - balance) / peakBalance : 0;
    if (currentDd > maxDd) maxDd = currentDd;
    drawdowns.push(currentDd);
  }

  const n = hits.length;
  const netProfit = balance - params.initialBankroll;
  const roi = (netProfit / params.initialBankroll) * 100.0;
  const winRate = n > 0 ? (wins / n) * 100.0 : 0;
  const meanReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const varReturn =
    returns.length > 1
      ? returns.reduce((acc, r) => acc + (r - meanReturn) ** 2, 0) / (returns.length - 1)
      : 0;
  const stdReturn = Math.sqrt(varReturn);
  const sharpe = stdReturn > 0 ? (meanReturn / stdReturn) * Math.sqrt(252) : 0;
  const downsideReturns = returns.filter((r) => r < 0);
  const downsideVar =
    downsideReturns.length > 0
      ? downsideReturns.reduce((acc, r) => acc + r ** 2, 0) / downsideReturns.length
      : 0;
  const sortino = Math.sqrt(downsideVar) > 0 ? (meanReturn / Math.sqrt(downsideVar)) * Math.sqrt(252) : 0;
  const profitFactor = grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? 10.0 : 0.0;
  const recoveryFactor = maxDd > 0 ? netProfit / (params.initialBankroll * maxDd) : 0.0;

  return {
    netProfit: parseFloat(netProfit.toFixed(2)),
    roi: parseFloat(roi.toFixed(2)),
    maxDrawdown: parseFloat((maxDd * 100).toFixed(2)),
    winRate: parseFloat(winRate.toFixed(2)),
    sharpeRatio: parseFloat(sharpe.toFixed(3)),
    sortinoRatio: parseFloat(sortino.toFixed(3)),
    profitFactor: parseFloat(profitFactor.toFixed(3)),
    recoveryFactor: parseFloat(recoveryFactor.toFixed(3)),
    bankruptcyDraw: bankruptcy,
    balances,
    drawdowns,
  };
}

export interface ClosedLoopAutopsyHpcResult {
  updatedWeights: Float64Array;
  brierScore: number;
  divergenceMetric: number;
  exactHits: number;
  nearMisses: number;
  rmse: number;
  wassersteinDistance: number;
}

/**
 * Autopsie Médico-Légale en Boucle Fermée en Rust/WASM
 */
export function computeClosedLoopAutopsyHpc(params: {
  predictedNumbers: Int32Array | number[];
  actualWinners: Int32Array | number[];
  currentWeights: Float64Array | number[];
  algoContributionsFlat: Float64Array | number[];
  numAlgos: number;
  historyDepth: number;
}): ClosedLoopAutopsyHpcResult {
  const preds =
    params.predictedNumbers instanceof Int32Array ? params.predictedNumbers : new Int32Array(params.predictedNumbers);
  const winners =
    params.actualWinners instanceof Int32Array ? params.actualWinners : new Int32Array(params.actualWinners);
  const weights =
    params.currentWeights instanceof Float64Array ? params.currentWeights : new Float64Array(params.currentWeights);
  const contribs =
    params.algoContributionsFlat instanceof Float64Array
      ? params.algoContributionsFlat
      : new Float64Array(params.algoContributionsFlat);

  if (isLotoEngineWasmReady() && getWasmModuleInstance()?.compute_closed_loop_autopsy_wasm) {
    try {
      const res = getWasmModuleInstance().compute_closed_loop_autopsy_wasm(
        preds,
        winners,
        weights,
        contribs,
        params.numAlgos,
        params.historyDepth
      );
      const out: ClosedLoopAutopsyHpcResult = {
        updatedWeights: new Float64Array(res.updated_weights),
        brierScore: res.brier_score,
        divergenceMetric: res.divergence_metric,
        exactHits: res.exact_hits,
        nearMisses: res.near_misses,
        rmse: res.rmse,
        wassersteinDistance: res.wasserstein_distance,
      };
      if (typeof res.free === 'function') {
        res.free();
      }
      return out;
    } catch (e) {
      recordWasmFallback('compute_closed_loop_autopsy_wasm', e);
    }
  }

  const winnersSet = new Set(Array.from(winners));
  let exactHits = 0;
  let nearMisses = 0;
  for (let i = 0; i < preds.length; i++) {
    const p = preds[i];
    if (winnersSet.has(p)) {
      exactHits++;
    } else if (winnersSet.has(p > 1 ? p - 1 : 90) || winnersSet.has(p < 90 ? p + 1 : 1)) {
      nearMisses++;
    }
  }

  const kAlgos = Math.max(1, params.numAlgos);
  const updated = new Float64Array(kAlgos);
  const cochranFloor = 10;
  const depthF = Math.max(cochranFloor, params.historyDepth);
  const dampingMin = 1.0 / kAlgos;
  const dampingMax = 1.0 / Math.sqrt(kAlgos);
  const learningRate = Math.max(dampingMin, Math.min(dampingMax, 1.0 / Math.sqrt(depthF)));
  const domainEps = 1.0 / (90.0 * 90.0);
  const expectedHitRatio = 5.0 / 90.0;

  let sumW = 0;
  for (let a = 0; a < kAlgos; a++) {
    const rawW = Number.isFinite(weights[a]) ? weights[a] : 0;
    const baseW = Math.max(domainEps, rawW);
    let gradSignal = 0;
    if (contribs.length >= 90 * kAlgos) {
      let hitScore = 0;
      let totalScore = 0;
      for (let n = 1; n <= 90; n++) {
        const cVal = contribs[(n - 1) * kAlgos + a];
        if (Number.isFinite(cVal)) {
          totalScore += cVal;
          if (winnersSet.has(n)) hitScore += cVal;
        }
      }
      const expected = totalScore * expectedHitRatio;
      gradSignal = Math.tanh((hitScore - expected) / (Math.abs(totalScore) + domainEps));
    } else if (a < contribs.length && Number.isFinite(contribs[a])) {
      gradSignal = Math.tanh(contribs[a]);
    }
    const cauchyGate = 1.0 / (1.0 + gradSignal * gradSignal);
    const multiplier = Math.exp(learningRate * gradSignal * cauchyGate);
    const newW = Math.max(domainEps, baseW * multiplier);
    updated[a] = newW;
    sumW += newW;
  }

  if (sumW > 0) {
    for (let a = 0; a < kAlgos; a++) updated[a] /= sumW;
  }

  // Brier marginal propre sur [1..90] (baseline 5/90 sous H0, sans biais near-miss)
  const predsSet = new Set(Array.from(preds));
  const hitCountForBrier = predsSet.size > 0 ? exactHits : 0;
  const uniformBrier = expectedHitRatio * (1.0 - expectedHitRatio);
  const exactMissRatio = 1.0 - hitCountForBrier / 5.0;
  const brier = Math.max(0, uniformBrier * (0.5 + exactMissRatio));
  const rmse = Math.sqrt(brier);

  return {
    updatedWeights: updated,
    brierScore: parseFloat(brier.toFixed(6)),
    divergenceMetric: parseFloat((exactMissRatio * 100.0).toFixed(4)),
    exactHits,
    nearMisses,
    rmse: parseFloat(rmse.toFixed(6)),
    wassersteinDistance: parseFloat(exactMissRatio.toFixed(4)),
  };
}
