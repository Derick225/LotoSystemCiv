import { describe, it, expect } from 'vitest';
import {
  synthesizeDnaGeneSequenceAndWeights,
  evaluateDnaGeneSequencerWalkForward,
  evaluateNetworkWalkForward,
  runPairedSignFlipPermutationTest,
} from '../src/services/prediction/dnaGeneSequenceService';
import {
  evaluateAlgoEmpiricalProof,
  getDefaultWeights,
  normalizeWeights,
  type AlgoProofMetric,
} from '../src/services/prediction/weightsManager';
import {
  computeEmpiricalBayesProofCredibility,
  projectWeightsWithContinuousProofShrinkage,
} from '../src/services/prediction/closedLoopAutopsyService';
import { computeJointChannelAblationMatrix } from '../src/services/prediction/channelAttributionService';
import {
  calibrateScoresSoftmaxMarginals,
  computeHedgeFixedShareStepHpc,
  computeRankAuc,
} from '../src/services/wasm/epigenomeBridge';
import { LCG } from '../src/utils/mathUtils';
import { AlgoKey, RETIRED_ALGO_WEIGHT_KEYS } from '../src/shared/prediction.types';
import type { DrawResult, ForensicReport } from '../src/types';

function makeIidNullDraws(drawName: string, count: number, seed: number): DrawResult[] {
  const prng = new LCG(seed);
  const draws: DrawResult[] = [];
  const baseMs = Date.UTC(2025, 0, 1);

  for (let i = 0; i < count; i++) {
    const picked = new Set<number>();
    while (picked.size < 5) {
      picked.add(1 + Math.floor(prng.next() * 90));
    }
    const ts = new Date(baseMs + (count - i) * 7 * 86400_000);
    const dd = String(ts.getUTCDate()).padStart(2, '0');
    const mm = String(ts.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = ts.getUTCFullYear();
    draws.push({
      id: `${drawName}_${seed}_${i}`,
      drawName,
      date: `${dd}/${mm}/${yyyy}`,
      gagnants: Array.from(picked).sort((a, b) => a - b),
    });
  }
  return draws;
}

describe('EpiGenome-SQ IID Null & Causal Integrity Property Tests', () => {
  it('contrôle le taux de faux OUTPERFORMS sous H0 5/90 pur et détecte un vrai signal positif (P0 permutation test)', () => {
    const prng = new LCG(424242);
    const numSimulations = 160;
    let falseOutperforms = 0;

    for (let s = 0; s < numSimulations; s++) {
      // Deux sélections Top-5 indépendantes sur N=12 pas tirés sous H0 5/90 pur
      const diffs: number[] = [];
      for (let t = 0; t < 12; t++) {
        const winners = new Set<number>();
        const topA = new Set<number>();
        const topB = new Set<number>();
        while (winners.size < 5) winners.add(1 + Math.floor(prng.next() * 90));
        while (topA.size < 5) topA.add(1 + Math.floor(prng.next() * 90));
        while (topB.size < 5) topB.add(1 + Math.floor(prng.next() * 90));
        let hA = 0;
        let hB = 0;
        for (const w of winners) {
          if (topA.has(w)) hA++;
          if (topB.has(w)) hB++;
        }
        diffs.push(hA - hB);
      }
      const res = runPairedSignFlipPermutationTest(diffs, s + 1);
      if (res.ciLower95 > 0) {
        falseOutperforms++;
      }
      // Cohérence duale stricte entre borne basse CI95 et p-value
      if (res.ciLower95 > 0) {
        expect(res.pValueTwoSided).toBeLessThanOrEqual(0.05);
      }
    }

    const falseRate = falseOutperforms / numSimulations;
    expect(falseRate).toBeLessThanOrEqual(0.06);

    // Véritable signal positif constant sur N=8 pas -> OUTPERFORMS
    const posRes = runPairedSignFlipPermutationTest([1, 1, 1, 1, 1, 1, 1, 1], 777);
    expect(posRes.exactEnumeration).toBe(true);
    expect(posRes.permutationsCount).toBe(256);
    expect(posRes.pValueTwoSided).toBeLessThan(0.05);
    expect(posRes.ciLower95).toBeGreaterThan(0);

    // N > 20 -> bascule vers Monte-Carlo seedé déterministe
    const largeDiffs = Array.from({ length: 24 }, (_, idx) => (idx % 2 === 0 ? 1 : 0));
    const mc1 = runPairedSignFlipPermutationTest(largeDiffs, 999);
    const mc2 = runPairedSignFlipPermutationTest(largeDiffs, 999);
    expect(mc1.exactEnumeration).toBe(false);
    expect(mc1).toEqual(mc2);
    expect(mc1.ciLower95).toBeGreaterThan(0);
  });

  it('contrôle le taux de fausses preuves empiriques <= 5/90 sous H0 pur (P0 Mann-Whitney + Westfall-Young)', () => {
    const trials = 12;
    let totalProven = 0;
    let totalChannelsTested = 0;

    for (let s = 0; s < trials; s++) {
      const history = makeIidNullDraws('NATIONAL', 32, 10000 + s * 97);
      const proofMap = evaluateAlgoEmpiricalProof('NATIONAL', history);
      for (const k of Object.values(AlgoKey)) {
        const m = proofMap[k];
        expect(m.pValue).toBeGreaterThanOrEqual(0);
        expect(m.pValue).toBeLessThanOrEqual(1);
        expect(m.qValue).toBeGreaterThanOrEqual(0);
        expect(m.qValue).toBeLessThanOrEqual(1);
        expect(m.aucMean).toBeGreaterThanOrEqual(0);
        expect(m.aucMean).toBeLessThanOrEqual(1);
        expect(m.ebShrinkageFactor).toBeGreaterThanOrEqual(0);
        expect(m.ebShrinkageFactor).toBeLessThanOrEqual(1);

        // En file unilatérale, une pValue haute (> 0.5) correspond à rankZScore <= 0
        if ((m.rankZScore ?? 0) <= 0) {
          expect(m.hasProof).toBe(false);
        }
        totalChannelsTested++;
        if (m.hasProof) totalProven++;
      }
    }

    const empiricalFalseProofRate = totalProven / Math.max(1, totalChannelsTested);
    expect(empiricalFalseProofRate).toBeLessThanOrEqual(5.0 / 90.0);
  });

  it('élimine l artéfact de clôture simplex sur winningXAP via CLR + ablation conjointe (P1)', () => {
    const drawName = 'MONDAY SPECIAL';
    const history = makeIidNullDraws(drawName, 24, 54321);
    const weights = normalizeWeights({
      ...getDefaultWeights(),
      [AlgoKey.MACHINE_TRANSFER]: 0,
    });

    // Deux gènes co-varient faiblement de manière symétrique et neutre autour d'un vecteur quasi uniforme
    const activeKeys = Object.values(AlgoKey).filter(
      (k) => !RETIRED_ALGO_WEIGHT_KEYS.has(k) && k !== AlgoKey.MACHINE_TRANSFER
    );
    const neutralVec: Record<string, number> = {};
    activeKeys.forEach((k) => {
      neutralVec[k] = 1.0 / activeKeys.length;
    });

    const neutralReport: ForensicReport = {
      id: 'clr_neutral',
      predictionId: 'pred_clr',
      drawName,
      date: history[2].date,
      combo: [1, 2, 3, 4, 5],
      matches: [],
      missedOpportunities: [],
      scoreDivergence: [],
      aiAnalysis: 'Neutral CLR test',
      suspicionScore: 0,
      winningXAP: [
        {
          number: history[2].gagnants[0],
          dominantAlgo: AlgoKey.BAYES,
          contributionPercentage: 10,
          dnaVector: { ...neutralVec } as Record<AlgoKey, number>,
          shapleyValues: { ...neutralVec } as Record<AlgoKey, number>,
        },
      ],
    };

    const resNeutral = synthesizeDnaGeneSequenceAndWeights({
      drawName,
      history,
      currentWeights: weights,
      forensicReports: [neutralReport],
    });

    // Vecteur parfaitement équilibré => aucune paire REDUNDANT_ANTAGONIST fabriquée par clôture
    const antagonists = resNeutral.epistaticCouplings.filter(
      (c) => c.classification === 'REDUNDANT_ANTAGONIST'
    );
    expect(antagonists.length).toBe(0);

    // Vérification symétrie de computeJointChannelAblationMatrix
    const algoScores: Record<string, Float32Array> = {};
    for (const k of [AlgoKey.BAYES, AlgoKey.SPECTRAL, AlgoKey.GAPS]) {
      algoScores[k] = new Float32Array(91).fill(0.5);
    }
    algoScores[AlgoKey.BAYES][10] = 0.95;
    algoScores[AlgoKey.SPECTRAL][10] = 0.9;
    const joint = computeJointChannelAblationMatrix({
      channelKeys: [AlgoKey.BAYES, AlgoKey.SPECTRAL, AlgoKey.GAPS],
      algoScores,
      weights: { [AlgoKey.BAYES]: 0.4, [AlgoKey.SPECTRAL]: 0.4, [AlgoKey.GAPS]: 0.2 },
      actualWinners: [10, 20, 30, 40, 50],
    });
    expect(joint.interactionFlat[0 * 3 + 1]).toBeCloseTo(joint.interactionFlat[1 * 3 + 0], 10);
    expect(Number.isFinite(joint.interactionFlat[0 * 3 + 1])).toBe(true);
  });

  it('garantit la continuité C^inf Empirical-Bayes, le rétrécissement simplexe et la calibration softmax somme=5 (P1/P2)', () => {
    const baseW = normalizeWeights({
      ...getDefaultWeights(),
      [AlgoKey.MACHINE_TRANSFER]: 0,
    });
    const zeroCred = computeEmpiricalBayesProofCredibility({
      hasProof: false,
      proofScore: 0,
      empiricalHitRate: 5 / 90,
      baselineRate: 5 / 90,
      confidence: 0.9,
      pValue: 0.5,
      qValue: 0.95,
      rankZScore: 0,
      ebShrinkageFactor: 0,
    });
    const lowCred = computeEmpiricalBayesProofCredibility({
      hasProof: false,
      proofScore: 1.4,
      empiricalHitRate: 0.07,
      baselineRate: 5 / 90,
      confidence: 0.9,
      pValue: 0.08,
      qValue: 0.12,
      rankZScore: 1.4,
      ebShrinkageFactor: 0.25,
    });
    const highCred = computeEmpiricalBayesProofCredibility({
      hasProof: true,
      proofScore: 3.1,
      empiricalHitRate: 0.09,
      baselineRate: 5 / 90,
      confidence: 0.98,
      pValue: 0.001,
      qValue: 0.01,
      rankZScore: 3.1,
      ebShrinkageFactor: 0.8,
    });

    expect(zeroCred).toBe(0);
    expect(lowCred).toBeGreaterThan(0);
    expect(lowCred).toBeLessThan(highCred);
    expect(highCred).toBeLessThanOrEqual(1);

    const candidate = { ...baseW, [AlgoKey.BAYES]: baseW[AlgoKey.BAYES] + 0.12, [AlgoKey.GAPS]: baseW[AlgoKey.GAPS] + 0.08 };
    const proofMap: Partial<Record<AlgoKey, AlgoProofMetric>> = {};
    for (const k of Object.values(AlgoKey)) {
      proofMap[k] = {
        hasProof: k === AlgoKey.BAYES,
        proofScore: k === AlgoKey.BAYES ? 3.2 : 0,
        empiricalHitRate: k === AlgoKey.BAYES ? 0.09 : 5 / 90,
        baselineRate: 5 / 90,
        confidence: 0.98,
        qValue: k === AlgoKey.BAYES ? 0.01 : 0.95,
        rankZScore: k === AlgoKey.BAYES ? 3.2 : 0,
        ebShrinkageFactor: 0.7,
      };
    }

    const proj = projectWeightsWithContinuousProofShrinkage(
      candidate,
      baseW,
      proofMap,
      new Set([AlgoKey.MACHINE_TRANSFER])
    );
    const sumProj = Object.values(proj).reduce((a, b) => a + b, 0);
    expect(sumProj).toBeCloseTo(1.0, 5);
    expect(proj[AlgoKey.MACHINE_TRANSFER]).toBe(0);
    expect(proj[AlgoKey.GAPS]).toBeLessThanOrEqual(baseW[AlgoKey.GAPS] + 1e-6);

    // Probabilités marginales 5/90 cohérentes : somme = 5 et q_n ∈ [1e-6, 1 - 1e-6]
    const raw90 = Float64Array.from({ length: 90 }, (_, idx) => Math.sin(idx + 1) + 2.0);
    const marg = calibrateScoresSoftmaxMarginals(raw90, 1.25);
    let mSum = 0;
    for (let i = 0; i < 90; i++) {
      expect(marg[i]).toBeGreaterThanOrEqual(1e-6 - 1e-12);
      expect(marg[i]).toBeLessThanOrEqual(1 - 1e-6 + 1e-12);
      mSum += marg[i];
    }
    expect(mSum).toBeCloseTo(5.0, 4);

    // AUC de rang exact (masque binaire 90 numéros attendu par computeRankAuc)
    const perfectScores = Float64Array.from({ length: 90 }, (_, i) => i + 1);
    const maskTop5 = Uint8Array.from({ length: 90 }, (_, i) => (i >= 85 ? 1 : 0));
    const maskBot5 = Uint8Array.from({ length: 90 }, (_, i) => (i < 5 ? 1 : 0));
    expect(computeRankAuc(perfectScores, maskTop5)).toBeCloseTo(1.0, 6);
    expect(computeRankAuc(perfectScores, maskBot5)).toBeCloseTo(0.0, 6);

    // Hedge + Fixed-Share step conserve le simplexe et neutralise forcedZero
    const hedgeOut = computeHedgeFixedShareStepHpc({
      currentWeights: new Float64Array([0.4, 0.3, 0.2, 0.1]),
      channelLosses: new Float64Array([0.1, 0.5, 0.8, 0.2]),
      priorWeights: new Float64Array([0.25, 0.25, 0.25, 0.25]),
      forcedZeroFlags: new Uint8Array([0, 0, 0, 1]),
      horizonT: 20,
    });
    expect(hedgeOut.weights[3]).toBe(0);
    const hSum = hedgeOut.weights.reduce((a, b) => a + b, 0);
    expect(hSum).toBeCloseTo(1.0, 6);
  });

  it('bloque les fuites dataCutoff / computedAt / currentWeights post-OOS dans le walk-forward (P0)', async () => {
    const drawName = 'MIDWEEK';
    const history = makeIidNullDraws(drawName, 22, 88888);

    // Rapport daté dans le passé mais recalculé plus tard (`computedAt` futur) -> DOIT être bloqué
    const leakedReport: ForensicReport = {
      id: 'leak_rep',
      predictionId: 'pred_leak',
      drawName,
      date: history[history.length - 1].date,
      dataCutoff: history[0].date,
      computedAt: '2099-01-01T00:00:00.000Z',
      combo: [1, 2, 3, 4, 5],
      matches: [],
      missedOpportunities: [],
      scoreDivergence: [],
      aiAnalysis: 'Leaked report',
      suspicionScore: 10,
      proposedAdjustments: [{ algo: AlgoKey.BAYES, proposedWeightChange: 0.1, reason: 'Leak' }],
    };

    const synth = synthesizeDnaGeneSequenceAndWeights({
      drawName,
      history: history.slice(2),
      currentWeights: getDefaultWeights(),
      forensicReports: [leakedReport],
    });
    expect(synth.sourcesUsed.forensicReports).toBe(0);

    // Même en passant des poids fortement biaisés post-OOS en `currentWeights`, le walk-forward
    // démarre sur poids neutres canoniques sans fuite (les prédictions restent identiques)
    const biasedWeights = {
      ...getDefaultWeights(),
      [AlgoKey.SPECTRAL]: 0.9,
    };
    const wfClean = await evaluateDnaGeneSequencerWalkForward({
      drawName,
      history,
      forensicReports: [leakedReport],
      maxSteps: 4,
    });
    const wfBiased = await evaluateDnaGeneSequencerWalkForward({
      drawName,
      history,
      currentWeights: biasedWeights,
      forensicReports: [leakedReport],
      maxSteps: 4,
    });

    expect(wfClean.status).toBe('COMPLETED');
    expect(wfClean.steps.map((s) => s.top5Epigenome)).toEqual(
      wfBiased.steps.map((s) => s.top5Epigenome)
    );
    expect(wfClean.meanLogLossEpigenome).toBeGreaterThan(0);
    expect(wfClean.meanAucEpigenome).toBeGreaterThanOrEqual(0);
    expect(wfClean.meanAucEpigenome).toBeLessThanOrEqual(1);
    expect(wfClean.permutationTest.sampleSize).toBe(wfClean.evaluatedDrawsCount);
  });

  it('agrège en évaluation seule les pas OOS intra-réseau sans fuite inter-réseaux (AGENTS.md #2)', async () => {
    const hNational = makeIidNullDraws('NATIONAL', 18, 1111);
    const hMonday = makeIidNullDraws('MONDAY SPECIAL', 18, 2222);
    const hEspoir = makeIidNullDraws('ESPOIR', 25, 3333); // Réseau Quotidien (exclu du hebdomadaire)

    const netRes = await evaluateNetworkWalkForward({
      networkId: 'hebdomadaire',
      history: [...hNational, ...hMonday, ...hEspoir],
      maxStepsPerDraw: 3,
    });

    expect(netRes.networkId).toBe('hebdomadaire');
    expect(netRes.drawsEvaluated).toContain('National');
    expect(netRes.drawsEvaluated).toContain('Monday Special');
    expect(netRes.drawsEvaluated).not.toContain('Espoir');
    expect(netRes.totalOosDrawsCount).toBe(6);
    expect(netRes.permutationTest.sampleSize).toBe(6);
  });
});
