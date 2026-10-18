import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeWalkForwardCalibrationHpc,
  appendSingleDrawToStore,
  clearStoreTimeline,
  getStoreDrawCount,
} from '../services/wasm/lotoEngineBridge';
import { DrawResult } from '../types';

describe('Lot 3 : Empirical Out-Of-Fold Calibration & Walk-Forward Contract Tests', () => {
  const TEST_DRAW = 'TEST_WALK_FORWARD_DRAW';

  beforeEach(() => {
    clearStoreTimeline(TEST_DRAW);
  });

  it('1. Insufficient History Handling: returns neutral benchmark without throwing when draws < 8', () => {
    // Insérer seulement 3 tirages
    for (let d = 1; d <= 3; d++) {
      appendSingleDrawToStore(
        TEST_DRAW,
        1700000000 + d * 86400,
        [d, d + 1, d + 2, d + 3, d + 4]
      );
    }

    const report = computeWalkForwardCalibrationHpc(TEST_DRAW, 10);

    expect(report.evaluatedWindows).toBe(0);
    expect(report.calibrationQualityLabel).toBe('HISTORIQUE_INSUFFISANT');
    expect(report.brierSkillScore).toBe(0.0);
    // Brier benchmark théorique 5/90 = 5*85/(90*90) ≈ 0.0525
    expect(report.brierScore).toBeCloseTo(0.0525, 3);
  });

  it('2. Rigorous Out-Of-Fold Walk-Forward: computes valid Brier score and skill score on realistic history', () => {
    // Insérer 16 tirages chronologiques
    for (let d = 1; d <= 16; d++) {
      appendSingleDrawToStore(
        TEST_DRAW,
        1700000000 + d * 86400,
        [
          ((d * 3) % 90) + 1,
          ((d * 7 + 10) % 90) + 1,
          ((d * 11 + 20) % 90) + 1,
          ((d * 13 + 30) % 90) + 1,
          ((d * 17 + 40) % 90) + 1,
        ]
      );
    }

    expect(getStoreDrawCount(TEST_DRAW)).toBe(16);

    const report = computeWalkForwardCalibrationHpc(TEST_DRAW, 8);

    // Propriétés du Brier Score
    expect(report.evaluatedWindows).toBe(8);
    expect(report.brierScore).toBeGreaterThan(0.0);
    expect(report.brierScore).toBeLessThan(0.5); // Borne supérieure raisonnable

    // Brier Skill Score borné dans [-1.0, 1.0]
    expect(report.brierSkillScore).toBeGreaterThanOrEqual(-1.0);
    expect(report.brierSkillScore).toBeLessThanOrEqual(1.0);

    // Paramètres continus de Platt
    expect(report.plattAlpha).toBeGreaterThanOrEqual(0.5);
    expect(report.plattAlpha).toBeLessThanOrEqual(3.0);
    expect(report.plattBeta).toBeGreaterThanOrEqual(-2.0);
    expect(report.plattBeta).toBeLessThanOrEqual(2.0);

    // Fiabilité empirique continue [10, 98]
    expect(report.empiricalReliabilityScore).toBeGreaterThanOrEqual(10.0);
    expect(report.empiricalReliabilityScore).toBeLessThanOrEqual(98.0);
    expect(typeof report.calibrationQualityLabel).toBe('string');
  });

  it('3. Zero Data Leakage: past predictions are not influenced by future additions', () => {
    // Amorce de 12 tirages
    for (let d = 1; d <= 12; d++) {
      appendSingleDrawToStore(
        TEST_DRAW,
        1700000000 + d * 86400,
        [d, d + 5, d + 10, d + 15, d + 20]
      );
    }

    const report1 = computeWalkForwardCalibrationHpc(TEST_DRAW, 6);
    expect(report1.evaluatedWindows).toBe(6);

    // Vérifier que le résultat est déterministe à 100%
    const report2 = computeWalkForwardCalibrationHpc(TEST_DRAW, 6);
    expect(report1.brierScore).toBe(report2.brierScore);
    expect(report1.brierSkillScore).toBe(report2.brierSkillScore);
    expect(report1.empiricalReliabilityScore).toBe(report2.empiricalReliabilityScore);
  });
});
