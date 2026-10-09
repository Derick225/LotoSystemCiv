import { describe, it, expect } from 'vitest';
import {
  executeClosedLoopAutopsy,
  executeClosedLoopAutoAdjustment,
} from '../services/prediction/closedLoopAutopsyService';
import {
  getModelEvolutionLineage,
  getModelDnaKnowledgeBase,
} from '../services/prediction/modelDnaKnowledgeBase';
import { getAlgoWeights } from '../services/prediction/weightsManager';
import { autoTuneModelDnaFromAutopsyReport, runForensicAutopsy } from '../services/postPredictionAnalysisService';
import { DEFAULT_ALGO_WEIGHTS } from '../shared/prediction.types';
import { DrawResult } from '../types';

describe('Option 1 : Câblage de l’Apprentissage Fermé (Post-Mortem ➔ Micro-SGD ➔ Version ADN)', () => {
  const drawName = 'NATIONAL_TEST';
  const mockHistory: DrawResult[] = [
    { id: '1', date: '22/01/2026', tirage: drawName, gagnants: [12, 24, 36, 48, 60], machine: [1, 2, 3, 4, 5] },
    { id: '2', date: '15/01/2026', tirage: drawName, gagnants: [11, 23, 35, 47, 59], machine: [6, 7, 8, 9, 10] },
    { id: '3', date: '08/01/2026', tirage: drawName, gagnants: [10, 22, 34, 46, 58], machine: [15, 16, 17, 18, 19] },
    { id: '4', date: '01/01/2026', tirage: drawName, gagnants: [12, 25, 36, 49, 70], machine: [20, 21, 22, 23, 24] },
    { id: '5', date: '25/12/2025', tirage: drawName, gagnants: [5, 15, 25, 35, 45], machine: [30, 31, 32, 33, 34] },
  ];

  it('exécute l’autopsie rétrospective en boucle fermée et produit les métriques déterministes', async () => {
    const report = await executeClosedLoopAutopsy(drawName, 0, mockHistory, DEFAULT_ALGO_WEIGHTS);

    expect(report).toBeDefined();
    expect(report.drawName).toBe(drawName);
    expect(report.targetDrawDate).toBe('22/01/2026');
    expect(report.actualWinners).toEqual([12, 24, 36, 48, 60]);
    expect(report.top5Predicted).toHaveLength(5);
    expect(report.top10Predicted).toHaveLength(10);
    expect(report.top20Predicted).toHaveLength(20);
    expect(report.brierScore).toBeGreaterThanOrEqual(0);
    expect(report.klDivergence).toBeGreaterThanOrEqual(0);
    expect(report.calibrationAccuracy).toBeGreaterThanOrEqual(0);
    expect(report.calibrationAccuracy).toBeLessThanOrEqual(100);
    expect(report.algoGradients.length).toBeGreaterThan(0);
    expect(report.correctedWeights).toBeDefined();
    expect(report.learningRate).toBeGreaterThan(0);
    expect(report.temporalDriftMetrics).toBeDefined();
    expect(report.cyclicPhaseProfile).toBeDefined();
  });

  it('orchestre le pipeline complet (Post-Mortem ➔ Micro-SGD ➔ Enregistrement ADN)', async () => {
    const autoTuneResult = await executeClosedLoopAutoAdjustment(
      drawName,
      0,
      mockHistory,
      DEFAULT_ALGO_WEIGHTS,
      { dryRun: false }
    );

    expect(autoTuneResult).toBeDefined();
    expect(autoTuneResult.drawName).toBe(drawName);
    expect(autoTuneResult.targetDrawDate).toBe('22/01/2026');
    expect(autoTuneResult.dnaRecord).toBeDefined();
    expect(autoTuneResult.dnaRecord.origin).toBe('FORENSIC_AUTOPSY');
    expect(autoTuneResult.dnaRecord.version).toContain('v_autopsy_');
    expect(autoTuneResult.dnaRecord.dnaFingerprint).toBeDefined();
    expect(autoTuneResult.dnaRecord.weights).toBeDefined();
    expect(autoTuneResult.causalAuditTrail.length).toBeGreaterThan(0);

    // Vérifier la contrainte de simplexe topologique : somme des poids normalisés = 1.0 (±0.001)
    const weightSum = Object.values(autoTuneResult.optimizedWeights).reduce((a, b) => a + b, 0);
    expect(weightSum).toBeCloseTo(1.0, 2);

    // Vérifier que la version a bien été enregistrée dans la base de connaissances ADN
    const lineage = await getModelEvolutionLineage(drawName);
    const recordedInLineage = lineage.history.find((v) => v.version === autoTuneResult.dnaRecord.version);
    expect(recordedInLineage).toBeDefined();
    expect(recordedInLineage?.origin).toBe('FORENSIC_AUTOPSY');
  });

  it('garantit le déterminisme strict : mêmes données = même ADN et mêmes poids', async () => {
    const res1 = await executeClosedLoopAutoAdjustment(
      drawName,
      0,
      mockHistory,
      DEFAULT_ALGO_WEIGHTS,
      { dryRun: true }
    );

    const res2 = await executeClosedLoopAutoAdjustment(
      drawName,
      0,
      mockHistory,
      DEFAULT_ALGO_WEIGHTS,
      { dryRun: true }
    );

    expect(res1.dnaRecord.dnaFingerprint).toBe(res2.dnaRecord.dnaFingerprint);
    expect(res1.optimizedWeights).toEqual(res2.optimizedWeights);
    expect(res1.autopsyReport.brierScore).toBe(res2.autopsyReport.brierScore);
    expect(res1.autopsyReport.klDivergence).toBe(res2.autopsyReport.klDivergence);
  });

  it('permet le déclenchement de la boucle fermée depuis un rapport Forensic (autoTuneModelDnaFromAutopsyReport)', async () => {
    const forensicReport = await runForensicAutopsy(
      drawName,
      '22/01/2026',
      [12, 24, 35, 48, 61], // prédictions
      [12, 24, 36, 48, 60], // réels
      undefined,
      'pred_test_1',
      '1',
      true,
      mockHistory
    );

    expect(forensicReport).toBeDefined();

    const tuneResult = await autoTuneModelDnaFromAutopsyReport(
      forensicReport,
      mockHistory,
      { dryRun: false }
    );

    expect(tuneResult).toBeDefined();
    expect(tuneResult.dnaRecord).toBeDefined();
    expect(tuneResult.dnaRecord.origin).toBe('FORENSIC_AUTOPSY');
    expect(tuneResult.causalAuditTrail.some((c) => c.includes('Déclenché depuis le rapport Forensic'))).toBe(true);
  });

  it('préserve strictement les poids nuls (canaux retirés et MACHINE_TRANSFER sans machine) et garantit la garde de preuve', async () => {
    const { AlgoKey, RETIRED_ALGO_WEIGHT_KEYS } = await import('../shared/prediction.types');
    const { projectWeightsWithProofGuard } = await import('../services/prediction/closedLoopAutopsyService');

    const noMachineHistory: DrawResult[] = mockHistory.map((d) => ({
      ...d,
      tirage: 'NO_MACHINE_DRAW',
      machine: [],
    }));

    const report = await executeClosedLoopAutopsy(
      'NO_MACHINE_DRAW',
      0,
      noMachineHistory,
      DEFAULT_ALGO_WEIGHTS
    );

    for (const retiredKey of RETIRED_ALGO_WEIGHT_KEYS) {
      const gradInfo = report.algoGradients.find((g) => g.algoKey === retiredKey);
      expect(gradInfo?.oldWeight ?? 0).toBe(0);
      expect(report.correctedWeights[retiredKey]).toBe(0);
    }
    expect(report.correctedWeights[AlgoKey.MACHINE_TRANSFER]).toBe(0);

    // Vérification directe de projectWeightsWithProofGuard : aucun poids verrouillé ne monte même si les autres baissent
    const lockedKeys = new Set<AlgoKey>([AlgoKey.FREQUENCY, AlgoKey.GAPS]);
    const forcedZero = new Set<AlgoKey>([AlgoKey.MACHINE_TRANSFER]);
    const shrunkCandidates: Record<string, number> = {};
    for (const k of Object.values(AlgoKey)) {
      shrunkCandidates[k] = lockedKeys.has(k)
        ? (DEFAULT_ALGO_WEIGHTS[k] || 0) * 1.5 // tentative de hausse sur un canal sans preuve
        : (DEFAULT_ALGO_WEIGHTS[k] || 0) * 0.4; // baisse des autres canaux
    }

    const projected = projectWeightsWithProofGuard(
      shrunkCandidates,
      DEFAULT_ALGO_WEIGHTS,
      lockedKeys,
      forcedZero
    );

    expect(projected[AlgoKey.FREQUENCY]).toBeLessThanOrEqual(
      (DEFAULT_ALGO_WEIGHTS[AlgoKey.FREQUENCY] || 0) + 1e-6
    );
    expect(projected[AlgoKey.GAPS]).toBeLessThanOrEqual(
      (DEFAULT_ALGO_WEIGHTS[AlgoKey.GAPS] || 0) + 1e-6
    );
    expect(projected[AlgoKey.MACHINE_TRANSFER]).toBe(0);
  });

  it('garantit que dryRun=true est sans effet de bord sur la lignée ADN et enregistre les vraies métriques Hurst/Entropie', async () => {
    const isolatedDraw = 'DRY_RUN_ISOLATED_TEST';
    const isolatedHistory: DrawResult[] = mockHistory.map((d) => ({
      ...d,
      tirage: isolatedDraw,
    }));

    const beforeLineage = await getModelEvolutionLineage(isolatedDraw);
    const beforeCount = beforeLineage.history.length;

    const dryResult = await executeClosedLoopAutoAdjustment(
      isolatedDraw,
      0,
      isolatedHistory,
      DEFAULT_ALGO_WEIGHTS,
      { dryRun: true }
    );

    const afterDryLineage = await getModelEvolutionLineage(isolatedDraw);
    expect(afterDryLineage.history.length).toBe(beforeCount);

    // Hurst et Entropie ne doivent pas être confondus avec driftResistanceFactor et crossEntropy
    expect(dryResult.dnaRecord.regimeContext?.hurst).not.toBe(
      dryResult.autopsyReport.temporalDriftMetrics.driftResistanceFactor
    );
    expect(dryResult.dnaRecord.regimeContext?.entropy).not.toBe(
      dryResult.autopsyReport.crossEntropy
    );
  });

  it('n’invente jamais d’historique synthétique lors de l’audit inter-tirages si le prédécesseur est absent', async () => {
    const { auditInterDrawPatternsPostMortem } = await import(
      '../services/prediction/interDrawPostMortemService'
    );

    const singleDrawOnlyHistory: DrawResult[] = mockHistory.map((d) => ({
      ...d,
      tirage: 'NATIONAL',
    }));

    const audit = auditInterDrawPatternsPostMortem(
      'NATIONAL',
      0,
      singleDrawOnlyHistory
    );

    expect(audit).toBeNull();

    const report = await executeClosedLoopAutopsy(
      'NATIONAL',
      0,
      singleDrawOnlyHistory,
      DEFAULT_ALGO_WEIGHTS
    );
    expect(report.interDrawPostMortem).toBeUndefined();
  });

  it('extrait des features distinctes dans l’optimiseur neural avec séparation Walk-Forward et cohérence des biais experts', async () => {
    const {
      computeFastHistoricalFeatures,
      runNeuralSelfOptimization,
    } = await import('../services/prediction/neuralSelfOptimizationService');
    const {
      applyExpertBiasesToWeights,
      analyzeUnderperformingSubAlgos,
    } = await import('../services/prediction/expertBiasService');
    const { AlgoKey } = await import('../shared/prediction.types');

    const longHistory: DrawResult[] = Array.from({ length: 18 }, (_, idx) => ({
      id: `${idx + 1}`,
      date: `${String((idx % 28) + 1).padStart(2, '0')}/01/2026`,
      tirage: drawName,
      gagnants: [
        ((idx * 3) % 90) + 1,
        ((idx * 7 + 11) % 90) + 1,
        ((idx * 13 + 23) % 90) + 1,
        ((idx * 17 + 37) % 90) + 1,
        ((idx * 29 + 53) % 90) + 1,
      ],
      machine: [1, 2, 3, 4, 5],
    }));

    const feats = computeFastHistoricalFeatures(longHistory, Object.values(AlgoKey));
    const spectralVec = Array.from({ length: 90 }, (_, i) => feats[i + 1][AlgoKey.SPECTRAL]);
    const temporalVec = Array.from({ length: 90 }, (_, i) => feats[i + 1][AlgoKey.TEMPORAL]);
    expect(spectralVec).not.toEqual(temporalVec);

    const neuralRes = runNeuralSelfOptimization(drawName, longHistory, DEFAULT_ALGO_WEIGHTS, {
      epochs: 8,
      batchDepth: 12,
    });
    expect(neuralRes.trainingSampleCount).toBeGreaterThan(0);
    expect(neuralRes.validationSampleCount).toBeGreaterThan(0);

    // Vérification de l'échelle relative du biais expert : un delta négatif (-0.20) amortit sans tuer le poids à 0
    const dampenedWeights = applyExpertBiasesToWeights(
      DEFAULT_ALGO_WEIGHTS,
      {
        [AlgoKey.FREQUENCY]: {
          algoKey: AlgoKey.FREQUENCY,
          biasDelta: -0.20,
          biasMultiplier: 1.0,
          decayHorizon: 5,
          appliedAtDrawIndex: 10,
          appliedAtTimestamp: Date.now(),
          isActive: true,
        },
      } as any,
      10
    );
    expect(dampenedWeights[AlgoKey.FREQUENCY]).toBeGreaterThan(0);
    expect(dampenedWeights[AlgoKey.FREQUENCY]).toBeLessThan(
      DEFAULT_ALGO_WEIGHTS[AlgoKey.FREQUENCY]
    );

    const underperf = analyzeUnderperformingSubAlgos(drawName, longHistory, DEFAULT_ALGO_WEIGHTS);
    for (const m of underperf) {
      if (m.isUnderperforming && !m.hasEmpiricalProof) {
        expect(m.suggestedExpertNudge).toBeLessThanOrEqual(0);
      }
    }
  });
});
