import { describe, it, expect } from 'vitest';
import {
  computeEmpiricalBayesProofCredibility,
  enforceStrictWeightsProof,
  computeChronologicalAlgoReinforcement,
  getDefaultWeights,
  normalizeWeights,
  type AlgoProofMetric,
} from '../src/services/prediction/weightsManager';
import { computeEmpiricalBayesProofCredibility as reExportedCred } from '../src/services/prediction/closedLoopAutopsyService';
import { computeEpigenomeMatrixHpc } from '../src/services/wasm/epigenomeBridge';
import { analyzeUnderperformingSubAlgos } from '../src/services/prediction/expertBiasService';
import { calculateCyclicPhaseProfileMatrix } from '../src/services/prediction/dynamicProfileMatrix';
import { synthesizeDnaGeneSequenceAndWeights } from '../src/services/prediction/dnaGeneSequenceService';
import { AlgoKey, RETIRED_ALGO_WEIGHT_KEYS } from '../src/shared/prediction.types';
import type { DrawResult } from '../src/types';
import { LCG } from '../src/utils/mathUtils';

function makeDeterministicDraws(drawName: string, count: number, seed: number): DrawResult[] {
  const rng = new LCG(seed);
  const draws: DrawResult[] = [];
  const baseMs = Date.UTC(2026, 0, 1);
  for (let i = 0; i < count; i++) {
    const picked = new Set<number>();
    while (picked.size < 5) {
      picked.add(1 + Math.floor(rng.next() * 90));
    }
    const ts = new Date(baseMs + (count - i) * 7 * 86400_000);
    const dd = String(ts.getUTCDate()).padStart(2, '0');
    const mm = String(ts.getUTCMonth() + 1).padStart(2, '0');
    draws.push({
      id: `${drawName}_${i}`,
      drawName,
      date: `${dd}/${mm}/${ts.getUTCFullYear()}`,
      gagnants: Array.from(picked).sort((a, b) => a - b),
    });
  }
  return draws;
}

describe('Point 1 & Point 2 : Continuité C^∞ Empirical-Bayes & Noyau Épistasique', () => {
  it('partage la même fonction canonique computeEmpiricalBayesProofCredibility sans discontinuité à q = 5/90', () => {
    expect(computeEmpiricalBayesProofCredibility).toBe(reExportedCred);

    const makeProof = (qValue: number, z: number): AlgoProofMetric => ({
      hasProof: qValue <= 5 / 90 && z > 0,
      proofScore: z * 0.9,
      empiricalHitRate: 0.08,
      baselineRate: 5 / 90,
      confidence: 0.95,
      pValue: qValue * 0.5,
      qValue,
      rankZScore: z,
      ebShrinkageFactor: 0.65,
    });

    // Pas de saut brutal entre q = 0.06 (hasProof=false) et q = 0.05 (hasProof=true)
    const justBelowGate = computeEmpiricalBayesProofCredibility(makeProof(0.06, 2.2));
    const justAboveGate = computeEmpiricalBayesProofCredibility(makeProof(0.05, 2.2));
    expect(justBelowGate).toBeGreaterThan(0);
    expect(justAboveGate).toBeGreaterThan(justBelowGate);
    expect(justAboveGate - justBelowGate).toBeLessThan(0.15);

    // Sous H0 (z <= 0) => strictement 0
    expect(computeEmpiricalBayesProofCredibility(makeProof(0.5, 0))).toBe(0);
    expect(computeEmpiricalBayesProofCredibility(makeProof(0.8, -1.2))).toBe(0);
  });

  it('module continûment rawTargetWeights dans computeEpigenomeMatrixHpc selon proofCredibilities [0, 1]', () => {
    const k = 4;
    const rawEp = new Float64Array(k * k);
    const sampEp = new Float64Array(k * k);
    const lineage = new Float64Array(k * 2).fill(0.25);
    const initW = new Float64Array([0.25, 0.25, 0.25, 0.25]);
    const armIds = new Uint8Array([0, 1, 2, 3]);
    const proofScores = new Float64Array([2.4, 0.9, 0.2, 0.0]);
    const baseSignals = new Float64Array([0.15, 0.15, 0.05, 0.0]);
    const forcedZero = new Uint8Array([0, 0, 0, 1]);

    const runWithCred = (c0: number) =>
      computeEpigenomeMatrixHpc({
        rawEpistasisFlat: rawEp,
        epistasisSamplesFlat: sampEp,
        lineageWeightsFlat: lineage,
        numLineage: 2,
        initialWeights: initW,
        armIds,
        proofCredibilities: new Float64Array([c0, 0.1, 0.05, 0.0]),
        proofScores,
        baseAnalysisSignals: baseSignals,
        forcedZeroFlags: forcedZero,
        numGenes: k,
        hurst: 0.55,
        entropyNorm: 0.9,
        totalEvidenceUnits: 12,
      });

    const outZero = runWithCred(0.0);
    const outLow = runWithCred(0.25);
    const outMid = runWithCred(0.6);
    const outHigh = runWithCred(0.95);

    // Gène neutralisé (index 3) toujours à 0
    expect(outZero.rawTargetWeights[3]).toBe(0);
    expect(outHigh.rawTargetWeights[3]).toBe(0);

    // Monotonie stricte et absence de saut binaire
    expect(outZero.rawTargetWeights[0]).toBeLessThan(outLow.rawTargetWeights[0]);
    expect(outLow.rawTargetWeights[0]).toBeLessThan(outMid.rawTargetWeights[0]);
    expect(outMid.rawTargetWeights[0]).toBeLessThan(outHigh.rawTargetWeights[0]);
  });

  it('préserve le simplexe, zéro machine et zéro retraité dans enforceStrictWeightsProof, computeChronologicalAlgoReinforcement, expertBiasService et dynamicProfileMatrix', () => {
    const drawName = 'AKWABA'; // Tirage sans machine dans l'historique généré
    const history = makeDeterministicDraws(drawName, 25, 7777);
    const baseW = normalizeWeights(getDefaultWeights());

    const strictW = enforceStrictWeightsProof(drawName, history, baseW);
    const sumStrict = Object.values(strictW).reduce((a, b) => a + b, 0);
    expect(sumStrict).toBeCloseTo(1.0, 5);
    expect(strictW[AlgoKey.MACHINE_TRANSFER]).toBe(0);
    for (const r of RETIRED_ALGO_WEIGHT_KEYS) {
      expect(strictW[r]).toBe(0);
    }

    const chronW = computeChronologicalAlgoReinforcement(drawName, history, baseW);
    const sumChron = Object.values(chronW).reduce((a, b) => a + b, 0);
    expect(sumChron).toBeCloseTo(1.0, 5);
    expect(chronW[AlgoKey.MACHINE_TRANSFER]).toBe(0);
    for (const r of RETIRED_ALGO_WEIGHT_KEYS) {
      expect(chronW[r]).toBe(0);
    }

    const underperf = analyzeUnderperformingSubAlgos(drawName, history, baseW);
    const machineMetric = underperf.find((m) => m.algoKey === AlgoKey.MACHINE_TRANSFER);
    expect(machineMetric?.activeWeight).toBe(0);
    expect(machineMetric?.suggestedExpertNudge).toBe(0);
    for (const m of underperf) {
      expect(Number.isFinite(m.suggestedExpertNudge)).toBe(true);
      if (m.isUnderperforming && !m.hasEmpiricalProof) {
        expect(m.suggestedExpertNudge).toBeLessThanOrEqual(0);
      }
    }

    const cyclic = calculateCyclicPhaseProfileMatrix(history);
    for (const k of Object.values(AlgoKey)) {
      const mod = cyclic.algoWeightModifiers[k];
      if (mod !== undefined) {
        expect(Number.isFinite(mod)).toBe(true);
      }
    }

    // Contrôle déterministe complet sur synthesizeDnaGeneSequenceAndWeights
    const seq1 = synthesizeDnaGeneSequenceAndWeights({
      drawName,
      history,
      currentWeights: baseW,
      forensicReports: [],
    });
    const seq2 = synthesizeDnaGeneSequenceAndWeights({
      drawName,
      history,
      currentWeights: baseW,
      forensicReports: [],
    });
    expect(seq1.optimizedWeights).toEqual(seq2.optimizedWeights);
    expect(seq1.optimizedWeights[AlgoKey.MACHINE_TRANSFER]).toBe(0);
  });

  it('expose ebCredibility, qValue et meanEbCredibility dans validateAlgoWeightsByProof et supprime projectWeightsWithProofGuard', async () => {
    const { validateAlgoWeightsByProof } = await import('../src/services/prediction/weightsManager');
    const closedLoopMod = await import('../src/services/prediction/closedLoopAutopsyService');
    const { computeHybridRegimeWeightsHpc } = await import('../src/services/wasm/lotoEngineBridge');

    expect((closedLoopMod as Record<string, unknown>).projectWeightsWithProofGuard).toBeUndefined();

    const drawName = 'AKWABA';
    const history = makeDeterministicDraws(drawName, 25, 8888);
    const baseW = normalizeWeights(getDefaultWeights());
    const report = validateAlgoWeightsByProof(drawName, history, baseW);

    expect(typeof report.meanEbCredibility).toBe('number');
    expect(report.meanEbCredibility).toBeGreaterThanOrEqual(0);
    expect(report.meanEbCredibility).toBeLessThanOrEqual(1);
    expect(report.items.length).toBe(Object.values(AlgoKey).length);
    for (const item of report.items) {
      expect(typeof item.ebCredibility).toBe('number');
      expect(item.ebCredibility).toBeGreaterThanOrEqual(0);
      expect(item.ebCredibility).toBeLessThanOrEqual(1);
      expect(typeof item.qValue).toBe('number');
      expect(item.qValue).toBeGreaterThanOrEqual(0);
      expect(item.qValue).toBeLessThanOrEqual(1);
    }

    const regimeRes = computeHybridRegimeWeightsHpc({
      baseWeights: [0.25, 0.25, 0.25, 0.25],
      channelTypes: [0, 1, 2, 3],
      hurst: 0.78,
      entropyNorm: 0.72,
      volatilityNorm: 0.25,
      historyDepth: 120,
    });
    const sumW = regimeRes.optimizedWeights.reduce((a, b) => a + b, 0);
    expect(sumW).toBeCloseTo(1.0, 6);
    expect(regimeRes.optimizedWeights[0]).toBeGreaterThan(regimeRes.optimizedWeights[1]);
    expect(regimeRes.confidence).toBeGreaterThan(0);
    expect(regimeRes.stabilityIndex).toBeGreaterThan(0);
  });
});
