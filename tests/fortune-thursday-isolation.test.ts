import { describe, it, expect } from 'vitest';
import { isDrawWithoutMachine, drawHasMachineNumbers } from '../src/constants';
import { AlgoKey } from '../src/shared/prediction.types';
import { purifyHistoryForDraw } from '../src/utils/arrayUtils';
import { generateDeterministicFallbackHistory } from '../src/services/lotteryService';
import { calculateMachineTransferReport } from '../src/services/prediction/machineTransferService';
import { getAlgorithmsForDraw } from '../src/services/prediction/algorithmRegistry';
import {
  getDefaultWeights,
  getApplicableAlgoKeys,
  applyForensicCalibration,
  getAlgoWeights,
  saveAlgoWeights,
} from '../src/services/prediction/weightsManager';
import { updateWeightsWithKalmanFilter } from '../src/services/prediction/kalmanWeightsFilter';
import {
  applyExpertBiasesToWeights,
  ExpertBiasConfig,
} from '../src/services/prediction/expertBiasService';
import { extractFeatures } from '../src/services/prediction/featureExtractor';
import { calculateScores } from '../src/services/prediction/scoringEngine';
import { computeAdvancedMetrics } from '../src/services/prediction/predictionOrchestrator';
import { computeFastHistoricalFeatures } from '../src/services/prediction/neuralSelfOptimizationService';
import { executeClosedLoopAutopsy } from '../src/services/prediction/closedLoopAutopsyService';
import { DrawResult } from '../src/types';

const buildNoMachineHistory = (drawName: string, count: number): DrawResult[] => {
  return Array.from({ length: count }, (_, idx) => {
    const base = (idx * 7) % 80;
    const gagnants = [
      ((base + 1) % 90) + 1,
      ((base + 12) % 90) + 1,
      ((base + 25) % 90) + 1,
      ((base + 43) % 90) + 1,
      ((base + 67) % 90) + 1,
    ];
    const day = String(((count - idx) % 28) + 1).padStart(2, '0');
    const month = String((Math.floor((count - idx) / 28) % 12) + 1).padStart(2, '0');
    return {
      id: `${drawName}-${idx}`,
      drawName,
      date: `${day}/${month}/2025`,
      gagnants,
      machine: [],
    };
  });
};

describe('Fortune Thursday vs Fortune Strict Isolation', () => {
  it('distinguishes between Fortune and Fortune Thursday regarding machine numbers support', () => {
    expect(isDrawWithoutMachine('Fortune Thursday')).toBe(true);
    expect(isDrawWithoutMachine('fortune thursday')).toBe(true);
    expect(isDrawWithoutMachine('Loto Fortune Thursday')).toBe(true);
    expect(isDrawWithoutMachine('Tirage Fortune Thursday')).toBe(true);

    expect(isDrawWithoutMachine('Fortune')).toBe(false);
    expect(isDrawWithoutMachine('fortune')).toBe(false);
    expect(isDrawWithoutMachine('Loto Fortune')).toBe(false);
    expect(isDrawWithoutMachine('Tirage Fortune')).toBe(false);
  });

  it('purifyHistoryForDraw strictly isolates Fortune and Fortune Thursday with zero cross-pollution', () => {
    const mixedHistory: DrawResult[] = [
      {
        id: 'f1',
        drawName: 'Fortune',
        date: '01/01/2025',
        gagnants: [10, 20, 30, 40, 50],
        machine: [11, 21, 31, 41, 51],
      },
      {
        id: 'f2',
        drawName: 'Fortune Thursday',
        date: '02/01/2025',
        gagnants: [1, 2, 3, 4, 5],
        machine: [],
      },
      {
        id: 'f3',
        drawName: 'Fortune',
        date: '08/01/2025',
        gagnants: [15, 25, 35, 45, 55],
        machine: [16, 26, 36, 46, 56],
      },
    ];

    const purifiedFortune = purifyHistoryForDraw('Fortune', mixedHistory);
    expect(purifiedFortune).toHaveLength(2);
    expect(purifiedFortune.every(d => d.drawName === 'Fortune')).toBe(true);

    const purifiedThursday = purifyHistoryForDraw('Fortune Thursday', mixedHistory);
    expect(purifiedThursday).toHaveLength(1);
    expect(purifiedThursday[0].drawName === 'Fortune Thursday').toBe(true);
  });

  it('generateDeterministicFallbackHistory produces 0 machine numbers for Fortune Thursday and 5 for Fortune', () => {
    const thursdayFallback = generateDeterministicFallbackHistory('Fortune Thursday');
    expect(thursdayFallback.length).toBeGreaterThan(0);
    thursdayFallback.forEach(draw => {
      expect(draw.machine).toEqual([]);
      expect(draw.gagnants).toHaveLength(5);
    });

    const fortuneFallback = generateDeterministicFallbackHistory('Fortune');
    expect(fortuneFallback.length).toBeGreaterThan(0);
    fortuneFallback.forEach(draw => {
      expect(draw.machine).toHaveLength(5);
      expect(draw.gagnants).toHaveLength(5);
    });
  });

  it('calculateMachineTransferReport returns hasMachineData: false for Fortune Thursday', () => {
    const history: DrawResult[] = [
      {
        id: '1',
        drawName: 'Fortune Thursday',
        date: '01/01/2025',
        gagnants: [5, 12, 23, 45, 67],
        machine: [],
      },
    ];

    const report = calculateMachineTransferReport('Fortune Thursday', history);
    expect(report.hasMachineData).toBe(false);
    expect(report.totalDrawsWithMachine).toBe(0);
  });
});

describe('Automatic MACHINE_TRANSFER Deactivation for Draws Without Machine Numbers', () => {
  it('excludes MACHINE_TRANSFER statically and dynamically when draw history lacks machine numbers', () => {
    const noMachineReveil = buildNoMachineHistory('Reveil', 10);
    const mixedWithFortune: DrawResult[] = [
      ...noMachineReveil,
      {
        id: 'foreign-fortune',
        drawName: 'Fortune',
        date: '20/01/2025',
        gagnants: [3, 14, 27, 58, 72],
        machine: [9, 19, 29, 39, 49],
      },
    ];

    // Isolated check ensures foreign machine rows do not pollute Reveil
    expect(drawHasMachineNumbers('Fortune Thursday')).toBe(false);
    expect(drawHasMachineNumbers('Reveil', mixedWithFortune)).toBe(false);
    expect(drawHasMachineNumbers('Fortune', mixedWithFortune)).toBe(true);

    const thursdayAlgos = getAlgorithmsForDraw('Fortune Thursday', []);
    expect(thursdayAlgos.some(a => a.key === AlgoKey.MACHINE_TRANSFER)).toBe(false);

    const reveilAlgos = getAlgorithmsForDraw('Reveil', noMachineReveil);
    expect(reveilAlgos.some(a => a.key === AlgoKey.MACHINE_TRANSFER)).toBe(false);

    const applicableKeys = getApplicableAlgoKeys('Reveil', noMachineReveil);
    expect(applicableKeys.includes(AlgoKey.MACHINE_TRANSFER)).toBe(false);
  });

  it('forces MACHINE_TRANSFER weight to 0 across weightsManager, forensic calibration, Kalman filter, and expert bias', async () => {
    const baseWeights = getDefaultWeights();
    const boostedMachineWeights = {
      ...baseWeights,
      [AlgoKey.MACHINE_TRANSFER]: 0.25,
    };

    // Forensic calibration on Fortune Thursday must keep MACHINE_TRANSFER strictly 0
    const calibrated = applyForensicCalibration(
      boostedMachineWeights,
      [
        { algo: AlgoKey.MACHINE_TRANSFER, action: 'BOOST', improvement: 50 },
        { algo: `${AlgoKey.MACHINE_TRANSFER}+${AlgoKey.MARKOV}`, action: 'SYNERGY', improvement: 40 },
      ],
      30,
      'Fortune Thursday'
    );
    expect(calibrated[AlgoKey.MACHINE_TRANSFER]).toBe(0);
    const calSum = Object.values(calibrated).reduce((a, b) => a + b, 0);
    expect(calSum).toBeCloseTo(1.0, 4);

    // Kalman filter must clamp MACHINE_TRANSFER gain & weight to 0 when draw has no machine numbers
    const noMachineHistory = buildNoMachineHistory('Reveil', 20);
    const kalmanRes = updateWeightsWithKalmanFilter({
      drawName: 'Reveil',
      measuredWeights: boostedMachineWeights,
      history: noMachineHistory,
      predictionError: 0.4,
    });
    expect(kalmanRes.updatedWeights[AlgoKey.MACHINE_TRANSFER]).toBe(0);
    expect(kalmanRes.kalmanState.kalmanGains?.[AlgoKey.MACHINE_TRANSFER]).toBe(0);

    // Expert bias service must ignore biases targeting MACHINE_TRANSFER when no machine data exists
    const fakeBiases = {
      [AlgoKey.MACHINE_TRANSFER]: {
        algoKey: AlgoKey.MACHINE_TRANSFER,
        isActive: true,
        biasMultiplier: 2.5,
        biasDelta: 0.4,
        halfLifeDraws: 10,
        activatedAtHistoryLength: noMachineHistory.length,
        reason: 'Test boost',
      },
    } as unknown as Record<AlgoKey, ExpertBiasConfig>;

    const biasedWeights = applyExpertBiasesToWeights(
      boostedMachineWeights,
      fakeBiases,
      noMachineHistory.length,
      'Reveil',
      noMachineHistory
    );
    expect(biasedWeights[AlgoKey.MACHINE_TRANSFER]).toBe(0);

    // getAlgoWeights must return 0 for Fortune Thursday even if previously cached/saved with non-zero weight
    await saveAlgoWeights('Fortune Thursday', boostedMachineWeights);
    const fetchedThursday = await getAlgoWeights('Fortune Thursday');
    expect(fetchedThursday[AlgoKey.MACHINE_TRANSFER]).toBe(0);
  });

  it('produces zero machineTransferMap, zero scoring breakdown, and zero fast feature for no-machine draws', async () => {
    const thursdayHistory = buildNoMachineHistory('Fortune Thursday', 25);
    const customNoMachineHistory = buildNoMachineHistory('Etoile', 25);

    const features = await extractFeatures('Fortune Thursday', thursdayHistory);
    expect(Array.from(features.machineTransferMap).every(v => v === 0)).toBe(true);

    const dynFeatures = await extractFeatures('Etoile', customNoMachineHistory);
    expect(Array.from(dynFeatures.machineTransferMap).every(v => v === 0)).toBe(true);

    const metrics = await computeAdvancedMetrics(customNoMachineHistory, 'Etoile');
    const corruptedWeights = {
      ...getDefaultWeights(),
      [AlgoKey.MACHINE_TRANSFER]: 0.35,
    };
    const scored = calculateScores(dynFeatures, corruptedWeights, metrics, customNoMachineHistory, 0.9, 'Etoile');
    expect(scored).toHaveLength(90);
    scored.forEach(item => {
      expect(item.breakdown[AlgoKey.MACHINE_TRANSFER] ?? 0).toBe(0);
      expect(item.explainability?.shapValues?.[AlgoKey.MACHINE_TRANSFER] ?? 0).toBe(0);
    });

    const validKeys = Object.values(AlgoKey);
    const fastFeats = computeFastHistoricalFeatures(customNoMachineHistory, validKeys, 'Etoile');
    for (let num = 1; num <= 90; num++) {
      expect(fastFeats[num][AlgoKey.MACHINE_TRANSFER]).toBe(0);
    }

    const autopsyReport = await executeClosedLoopAutopsy(
      'Fortune Thursday',
      0,
      thursdayHistory,
      corruptedWeights
    );
    expect(autopsyReport.initialWeights[AlgoKey.MACHINE_TRANSFER]).toBe(0);
    expect(autopsyReport.correctedWeights[AlgoKey.MACHINE_TRANSFER]).toBe(0);
  });
});

