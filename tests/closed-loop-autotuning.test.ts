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
});
