import fs from 'fs';
import path from 'path';
import { DrawResult } from '../types';
import { algorithmRegistry, AlgorithmContext } from '../services/prediction/algorithmRegistry';
import '../services/prediction/algorithms/index'; // Initialize all algorithms
import { extractFeatures } from '../services/prediction/featureExtractor';
import { computeAdvancedMetrics } from '../services/prediction/advancedMetricsCalculator';
import { calculateScores } from '../services/prediction/scoringEngine';
import { getAlgoWeights } from '../services/prediction/weightsManager';
import { parseDateSafely } from '../utils/dateUtils';
import { AlgoKey } from '../shared/prediction.types';

interface DatasetInfo {
  name: string;
  file: string;
  hasMachine: boolean;
}

const DATASETS: DatasetInfo[] = [
  { name: 'Baraka', file: 'data/backups/baraka.json', hasMachine: true },
  { name: 'Emergence', file: 'data/backups/emergence.json', hasMachine: true },
  { name: 'Lucky Tuesday', file: 'data/backups/lucky_tuesday.json', hasMachine: false },
];

const MIN_TRAIN = 80;
const DOMAIN_SIZE = 90;
const TICKET_SIZE = 5;

// Uniform baseline
const BASELINE_HIT5 = 5 * (5 / DOMAIN_SIZE); // 0.27778
const BASELINE_HIT10 = 10 * (5 / DOMAIN_SIZE); // 0.55556

interface StepResult {
  step: number;
  date: string;
  actualWinners: number[];
  actualMachine: number[];
  ensembleTop5: number[];
  ensembleTop10: number[];
  ensembleHits5: number;
  ensembleHits10: number;
  ensembleMachineHits5: number;
  ensembleMachineHits10: number;
  algoHits5: Record<string, number>;
  algoHits10: Record<string, number>;
  algoMachineHits5: Record<string, number>;
  algoMachineHits10: Record<string, number>;
}

async function runWalkForwardForDataset(info: DatasetInfo) {
  console.log(`\n======================================================`);
  console.log(`WALK-FORWARD ANALYSIS (NO LEAKAGE): ${info.name}`);
  console.log(`======================================================`);

  const rawJson = JSON.parse(fs.readFileSync(path.resolve(info.file), 'utf-8'));
  // The JSON array has index 0 as MOST RECENT, index N-1 as OLDEST.
  // We reverse to get chronological order: C[0] is oldest, C[N-1] is newest.
  const chronological: DrawResult[] = [...rawJson].reverse();
  const N = chronological.length;

  console.log(`Total draws: ${N}. Training window: >= ${MIN_TRAIN} draws.`);
  console.log(`Evaluation steps: ${N - MIN_TRAIN} out-of-sample predictions.`);

  const stepResults: StepResult[] = [];
  const registeredKeys = algorithmRegistry.map(p => p.key);

  for (let t = MIN_TRAIN; t < N; t++) {
    // Strictly history BEFORE draw t (history < t)
    const trainHistoryChronological = chronological.slice(0, t);
    // The engine expects history[0] to be the latest draw in the slice
    const trainHistoryForEngine = [...trainHistoryChronological].reverse();

    const targetDraw = chronological[t];
    const actualWinners = Array.isArray(targetDraw.gagnants) ? targetDraw.gagnants : [];
    const actualMachine = Array.isArray(targetDraw.machine) ? targetDraw.machine : [];

    // Extract features & metrics strictly on trainHistoryForEngine
    const features = await extractFeatures(info.name, trainHistoryForEngine);
    const advancedMetrics = await computeAdvancedMetrics(trainHistoryForEngine, info.name);
    const weights = await getAlgoWeights(info.name);

    // 1. Full Ensemble scoring
    const scoredNumbers = calculateScores(features, weights, advancedMetrics, trainHistoryForEngine);
    const sortedEnsemble = [...scoredNumbers].sort((a, b) => b.score - a.score);
    const ensembleTop5 = sortedEnsemble.slice(0, 5).map(s => s.num);
    const ensembleTop10 = sortedEnsemble.slice(0, 10).map(s => s.num);

    const ensembleHits5 = ensembleTop5.filter(n => actualWinners.includes(n)).length;
    const ensembleHits10 = ensembleTop10.filter(n => actualWinners.includes(n)).length;
    const ensembleMachineHits5 = ensembleTop5.filter(n => actualMachine.includes(n)).length;
    const ensembleMachineHits10 = ensembleTop10.filter(n => actualMachine.includes(n)).length;

    // 2. Standalone scoring for each algorithm
    const algoHits5: Record<string, number> = {};
    const algoHits10: Record<string, number> = {};
    const algoMachineHits5: Record<string, number> = {};
    const algoMachineHits10: Record<string, number> = {};

    // Context for individual evaluations
    const context: AlgorithmContext = {
      features,
      advancedMetrics,
      history: trainHistoryForEngine,
      drawName: info.name,
      weights: { ...weights },
      algoWeights: { ...weights },
      statisticalBounds: advancedMetrics.statisticalBounds || {
        median: 0, q1: 0, q3: 0, variance: 0, kurtosis: 0, skewness: 0, shannonEntropy: 0, hurstExponent: 0.5
      },
      deterministicSeed: parseDateSafely(trainHistoryForEngine[0]?.date).getTime() || 123456,
      maxFreq: Math.max(1, ...Array.from(features.freqMap || [])),
      maxMarkov: Math.max(0.001, ...Array.from(features.markovMap || [])),
      maxMachineTransfer: Math.max(0.001, ...Array.from(features.machineTransferMap || []))
    };

    // Precompute for all plugins
    context.pluginCache = {};
    algorithmRegistry.forEach(p => {
      try {
        if (typeof p.precompute === 'function') p.precompute(context);
      } catch (e) {}
    });

    for (const plugin of algorithmRegistry) {
      const scores: { num: number; score: number }[] = [];
      for (let num = 1; num <= DOMAIN_SIZE; num++) {
        try {
          const res = plugin.evaluate(num, context);
          scores.push({ num, score: res.score });
        } catch {
          scores.push({ num, score: 0 });
        }
      }
      scores.sort((a, b) => b.score - a.score);
      const top5 = scores.slice(0, 5).map(s => s.num);
      const top10 = scores.slice(0, 10).map(s => s.num);

      algoHits5[plugin.key] = top5.filter(n => actualWinners.includes(n)).length;
      algoHits10[plugin.key] = top10.filter(n => actualWinners.includes(n)).length;
      algoMachineHits5[plugin.key] = top5.filter(n => actualMachine.includes(n)).length;
      algoMachineHits10[plugin.key] = top10.filter(n => actualMachine.includes(n)).length;
    }

    stepResults.push({
      step: t,
      date: targetDraw.date,
      actualWinners,
      actualMachine,
      ensembleTop5,
      ensembleTop10,
      ensembleHits5,
      ensembleHits10,
      ensembleMachineHits5,
      ensembleMachineHits10,
      algoHits5,
      algoHits10,
      algoMachineHits5,
      algoMachineHits10,
    });

    if ((t - MIN_TRAIN + 1) % 40 === 0 || t === N - 1) {
      process.stdout.write(`  Processed ${t - MIN_TRAIN + 1}/${N - MIN_TRAIN} steps...\r`);
    }
  }

  console.log(`\nCompleted walk-forward evaluation for ${info.name}.`);
  return { info, stepResults, registeredKeys };
}

async function run() {
  const allResults = [];
  for (const ds of DATASETS) {
    const res = await runWalkForwardForDataset(ds);
    allResults.push(res);
  }

  console.log(`\n\n======================================================`);
  console.log(`SYNTHÈSE GLOBALE DES PERFORMANCES WALK-FORWARD`);
  console.log(`======================================================`);

  for (const { info, stepResults, registeredKeys } of allResults) {
    const numSteps = stepResults.length;
    const avgEnsembleHit5 = stepResults.reduce((acc, r) => acc + r.ensembleHits5, 0) / numSteps;
    const avgEnsembleHit10 = stepResults.reduce((acc, r) => acc + r.ensembleHits10, 0) / numSteps;
    const lift5 = ((avgEnsembleHit5 - BASELINE_HIT5) / BASELINE_HIT5) * 100;
    const lift10 = ((avgEnsembleHit10 - BASELINE_HIT10) / BASELINE_HIT10) * 100;

    const rateAtLeast1Hit5 = (stepResults.filter(r => r.ensembleHits5 >= 1).length / numSteps) * 100;
    const rateAtLeast2Hit5 = (stepResults.filter(r => r.ensembleHits5 >= 2).length / numSteps) * 100;
    const rateAtLeast1Hit10 = (stepResults.filter(r => r.ensembleHits10 >= 1).length / numSteps) * 100;
    const rateAtLeast2Hit10 = (stepResults.filter(r => r.ensembleHits10 >= 2).length / numSteps) * 100;

    console.log(`\n------------------------------------------------------`);
    console.log(`Dataset: ${info.name} (${numSteps} tirages évalués)`);
    console.log(`------------------------------------------------------`);
    console.log(`Ensemble Hit@5  : ${avgEnsembleHit5.toFixed(4)} (Baseline: ${BASELINE_HIT5.toFixed(4)}) -> Lift: ${lift5 > 0 ? '+' : ''}${lift5.toFixed(2)}%`);
    console.log(`Ensemble Hit@10 : ${avgEnsembleHit10.toFixed(4)} (Baseline: ${BASELINE_HIT10.toFixed(4)}) -> Lift: ${lift10 > 0 ? '+' : ''}${lift10.toFixed(2)}%`);
    console.log(`Taux >= 1 hit in Top 5  : ${rateAtLeast1Hit5.toFixed(1)}%`);
    console.log(`Taux >= 2 hits in Top 5 : ${rateAtLeast2Hit5.toFixed(1)}%`);
    console.log(`Taux >= 1 hit in Top 10 : ${rateAtLeast1Hit10.toFixed(1)}%`);
    console.log(`Taux >= 2 hits in Top 10: ${rateAtLeast2Hit10.toFixed(1)}%`);

    if (info.hasMachine) {
      const avgEnsembleMachine5 = stepResults.reduce((acc, r) => acc + r.ensembleMachineHits5, 0) / numSteps;
      const avgEnsembleMachine10 = stepResults.reduce((acc, r) => acc + r.ensembleMachineHits10, 0) / numSteps;
      console.log(`Ensemble Machine Hit@5 : ${avgEnsembleMachine5.toFixed(4)} (Baseline: ${BASELINE_HIT5.toFixed(4)})`);
      console.log(`Ensemble Machine Hit@10: ${avgEnsembleMachine10.toFixed(4)} (Baseline: ${BASELINE_HIT10.toFixed(4)})`);
    }

    console.log(`\nABLATION & PERFORMANCES PAR ALGORITHME (Hit@5, Hit@10 vs Baseline):`);
    console.log(`-----------------------------------------------------------------------------------------`);
    console.log(`Algo Key`.padEnd(25) + `Hit@5`.padStart(10) + `Lift@5`.padStart(12) + `Hit@10`.padStart(10) + `Lift@10`.padStart(12) + `Mach@5`.padStart(10));
    console.log(`-----------------------------------------------------------------------------------------`);

    const algoStats: {
      key: string;
      hit5: number;
      lift5: number;
      hit10: number;
      lift10: number;
      mach5: number;
    }[] = [];

    for (const key of registeredKeys) {
      const avgHit5 = stepResults.reduce((acc, r) => acc + (r.algoHits5[key] || 0), 0) / numSteps;
      const avgHit10 = stepResults.reduce((acc, r) => acc + (r.algoHits10[key] || 0), 0) / numSteps;
      const l5 = ((avgHit5 - BASELINE_HIT5) / BASELINE_HIT5) * 100;
      const l10 = ((avgHit10 - BASELINE_HIT10) / BASELINE_HIT10) * 100;
      const avgMach5 = info.hasMachine ? (stepResults.reduce((acc, r) => acc + (r.algoMachineHits5[key] || 0), 0) / numSteps) : 0;

      algoStats.push({ key, hit5: avgHit5, lift5: l5, hit10: avgHit10, lift10: l10, mach5: avgMach5 });
    }

    // Sort by Hit@10 descending
    algoStats.sort((a, b) => b.hit10 - a.hit10);

    for (const stat of algoStats) {
      console.log(
        stat.key.padEnd(25) +
        stat.hit5.toFixed(4).padStart(10) +
        `${stat.lift5 > 0 ? '+' : ''}${stat.lift5.toFixed(1)}%`.padStart(12) +
        stat.hit10.toFixed(4).padStart(10) +
        `${stat.lift10 > 0 ? '+' : ''}${stat.lift10.toFixed(1)}%`.padStart(12) +
        (info.hasMachine ? stat.mach5.toFixed(4).padStart(10) : 'N/A'.padStart(10))
      );
    }
  }

  // Cross-dataset aggregation
  console.log(`\n\n======================================================`);
  console.log(`SYNTHÈSE MULTI-TIRAGES CONSOLIDÉE (BARAKA + EMERGENCE + LUCKY TUESDAY)`);
  console.log(`======================================================`);

  const totalStepsAcross = allResults.reduce((acc, r) => acc + r.stepResults.length, 0);
  const registeredKeys = allResults[0].registeredKeys;

  const consolidatedAlgoStats: {
    key: string;
    totalHits5: number;
    totalHits10: number;
    avgHit5: number;
    avgHit10: number;
    lift5: number;
    lift10: number;
    machHit5WithMachine: number;
  }[] = [];

  const datasetsWithMachine = allResults.filter(r => r.info.hasMachine);
  const totalStepsWithMachine = datasetsWithMachine.reduce((acc, r) => acc + r.stepResults.length, 0);

  for (const key of registeredKeys) {
    let sum5 = 0;
    let sum10 = 0;
    let sumMach5 = 0;

    for (const res of allResults) {
      for (const step of res.stepResults) {
        sum5 += (step.algoHits5[key] || 0);
        sum10 += (step.algoHits10[key] || 0);
        if (res.info.hasMachine) {
          sumMach5 += (step.algoMachineHits5[key] || 0);
        }
      }
    }

    const avgHit5 = sum5 / totalStepsAcross;
    const avgHit10 = sum10 / totalStepsAcross;
    const lift5 = ((avgHit5 - BASELINE_HIT5) / BASELINE_HIT5) * 100;
    const lift10 = ((avgHit10 - BASELINE_HIT10) / BASELINE_HIT10) * 100;
    const machHit5WithMachine = totalStepsWithMachine > 0 ? sumMach5 / totalStepsWithMachine : 0;

    consolidatedAlgoStats.push({
      key,
      totalHits5: sum5,
      totalHits10: sum10,
      avgHit5,
      avgHit10,
      lift5,
      lift10,
      machHit5WithMachine
    });
  }

  consolidatedAlgoStats.sort((a, b) => b.avgHit10 - a.avgHit10);

  console.log(`Total tirages out-of-sample évalués : ${totalStepsAcross}`);
  console.log(`Baseline Uniforme 5/90 : Hit@5 = ${BASELINE_HIT5.toFixed(4)} | Hit@10 = ${BASELINE_HIT10.toFixed(4)}\n`);
  console.log(`-------------------------------------------------------------------------------------------------`);
  console.log(`Rang`.padEnd(5) + `Algorithme`.padEnd(25) + `Hit@5`.padStart(10) + `Lift@5`.padStart(12) + `Hit@10`.padStart(10) + `Lift@10`.padStart(12) + `MachHit@5`.padStart(12));
  console.log(`-------------------------------------------------------------------------------------------------`);

  consolidatedAlgoStats.forEach((st, idx) => {
    console.log(
      `#${idx + 1}`.padEnd(5) +
      st.key.padEnd(25) +
      st.avgHit5.toFixed(4).padStart(10) +
      `${st.lift5 > 0 ? '+' : ''}${st.lift5.toFixed(1)}%`.padStart(12) +
      st.avgHit10.toFixed(4).padStart(10) +
      `${st.lift10 > 0 ? '+' : ''}${st.lift10.toFixed(1)}%`.padStart(12) +
      st.machHit5WithMachine.toFixed(4).padStart(12)
    );
  });

  // Save report to JSON
  fs.writeFileSync('data/backups/walk_forward_report.json', JSON.stringify({
    summary: consolidatedAlgoStats,
    totalSteps: totalStepsAcross,
    baselineHit5: BASELINE_HIT5,
    baselineHit10: BASELINE_HIT10,
    datasets: allResults.map(r => ({
      name: r.info.name,
      steps: r.stepResults.length,
      sampleResults: r.stepResults.slice(-5)
    }))
  }, null, 2));

  console.log(`\nRapport complet sauvegardé dans 'data/backups/walk_forward_report.json'.`);
}

run().catch(err => {
  console.error('Erreur exécution walk-forward:', err);
  process.exit(1);
});
