import { describe, it, expect, vi } from 'vitest';
import { resolveSnapshotRealtimeTransition } from '../src/hooks/useRealtimeSync';
import { useNexusStore } from '../src/store/useNexusStore';
import {
  generateLearningSession,
  applyForensicAdjustments,
} from '../src/services/forensicTrainingBridge';
import { applyOnlineLearningCore } from '../src/services/training/trainingLoop';
import { getDefaultWeights } from '../src/services/prediction/weightsManager';
import { savePredictionToHistory } from '../src/services/predictionHistoryService';
import { getPredictionDnaLogs } from '../src/services/prediction/dnaAuditLogService';
import { AlgoKey, RETIRED_ALGO_WEIGHT_KEYS } from '../src/shared/prediction.types';
import { DrawResult, ForensicReport, Prediction } from '../src/types';

const buildDrawHistory = (drawName: string, count: number, withMachine: boolean): DrawResult[] => {
  return Array.from({ length: count }, (_, idx) => {
    const offset = (idx * 11) % 85;
    const nums = new Set<number>();
    let cursor = offset;
    while (nums.size < 5) {
      nums.add(((cursor % 90) + 1));
      cursor += 17;
    }
    const day = String(((idx % 28) + 1)).padStart(2, '0');
    const month = String((Math.floor(idx / 28) % 12) + 1).padStart(2, '0');
    return {
      id: `${drawName}-${idx}`,
      drawName,
      date: `${day}/${month}/2025`,
      gagnants: Array.from(nums),
      machine: withMachine ? [2, 14, 29, 44, 71] : [],
      version: 1,
    };
  });
};

describe('Cross-Module Linkages & Pipeline Reinforcements', () => {
  it('resolveSnapshotRealtimeTransition recognizes COMPLETED and CANCELLED transitions and ignores ANALYZED/duplicates', () => {
    expect(
      resolveSnapshotRealtimeTransition(
        { status: 'PENDING', draw_name: 'National' },
        { status: 'COMPLETED', draw_name: 'National' }
      )
    ).toEqual({ kind: 'completed', drawName: 'National' });

    expect(
      resolveSnapshotRealtimeTransition(
        { status: 'PENDING', draw_name: 'Reveil' },
        { status: 'CANCELLED', draw_name: 'Reveil' }
      )
    ).toEqual({ kind: 'cancelled', drawName: 'Reveil' });

    expect(
      resolveSnapshotRealtimeTransition(
        { status: 'COMPLETED', draw_name: 'National' },
        { status: 'COMPLETED', draw_name: 'National' }
      )
    ).toEqual({ kind: 'ignored', drawName: 'National' });

    expect(
      resolveSnapshotRealtimeTransition(
        { status: 'PENDING', draw_name: 'National' },
        { status: 'ANALYZED', draw_name: 'National' }
      )
    ).toEqual({ kind: 'ignored', drawName: 'National' });
  });

  it('useNexusStore.navigateToModule maps Prediction, Combinations, Kernel, Genomique, and Admin sub-targets accurately', () => {
    const store = useNexusStore.getState();

    store.navigateToModule('Prediction');
    expect(useNexusStore.getState().activeMainTab).toBe('Oracle');
    expect(useNexusStore.getState().activeSubTab).toBe('prediction');

    store.navigateToModule('Inference');
    expect(useNexusStore.getState().activeMainTab).toBe('Oracle');
    expect(useNexusStore.getState().activeSubTab).toBe('prediction');

    store.navigateToModule('Combinations');
    expect(useNexusStore.getState().activeMainTab).toBe('Topologie');
    expect(useNexusStore.getState().activeSubTab).toBe('combinations');

    store.navigateToModule('Kernel');
    expect(useNexusStore.getState().activeMainTab).toBe('Topologie');
    expect(useNexusStore.getState().activeSubTab).toBe('python');

    store.navigateToModule('Genomique', 'GENE_SEQUENCER');
    expect(useNexusStore.getState().activeMainTab).toBe('Forensic');
    expect(useNexusStore.getState().activeSubTab).toBe('GENE_SEQUENCER');

    store.navigateToModule('admin', 'tuning');
    expect(useNexusStore.getState().activeMainTab).toBe('admin');
    expect(useNexusStore.getState().activeSubTab).toBe('fusion');
  });

  it('generateLearningSession & applyForensicAdjustments strictly lock retired channels and zero MACHINE_TRANSFER for no-machine draws', async () => {
    const noMachineHistory = buildDrawHistory('Fortune Thursday', 24, false);
    const machineHistory = buildDrawHistory('National', 24, true);

    const reportThursday: ForensicReport = {
      id: 'rep-thursday',
      predictionId: 'pred-thursday',
      drawName: 'Fortune Thursday',
      date: '15/05/2025',
      timestamp: new Date('2025-05-15T18:00:00Z').toISOString(),
      matches: [
        {
          predicted: noMachineHistory[0].gagnants[0],
          actual: noMachineHistory[0].gagnants[0],
          errorType: 'Hit',
          delta: 'Exact',
        },
      ],
      missedOpportunities: [
        { number: noMachineHistory[0].gagnants[1], reason: 'Gap lag', continuousWeight: 0.72 },
      ],
      scoreDivergence: [],
      proposedAdjustments: [
        { algo: AlgoKey.MACHINE_TRANSFER, proposedWeightChange: 0.25, reason: 'Synthetic shift test' },
        { algo: AlgoKey.MARKOV, proposedWeightChange: 0.04, reason: 'Markov boost' },
      ],
      isBlackSwan: false,
      suspicionScore: 10,
      combo: noMachineHistory[0].gagnants,
    };

    const sessionThursday = await generateLearningSession(reportThursday, noMachineHistory);
    const machineAdj = sessionThursday.adjustments?.find((a) => a.algo === AlgoKey.MACHINE_TRANSFER);
    expect(machineAdj?.newWeight).toBe(0);

    for (const rk of RETIRED_ALGO_WEIGHT_KEYS) {
      const retiredAdj = sessionThursday.adjustments?.find((a) => a.algo === rk);
      expect(retiredAdj?.newWeight).toBe(0);
    }

    const updatedThursday = await applyForensicAdjustments(
      sessionThursday,
      getDefaultWeights(),
      true,
      undefined,
      noMachineHistory
    );
    expect(updatedThursday[AlgoKey.MACHINE_TRANSFER]).toBe(0);
    for (const rk of RETIRED_ALGO_WEIGHT_KEYS) {
      expect(updatedThursday[rk]).toBe(0);
    }
    const sumThursday = Object.values(updatedThursday).reduce((s, v) => s + v, 0);
    expect(sumThursday).toBeCloseTo(1.0, 5);

    // Sur un tirage à machine (National), MACHINE_TRANSFER reste actif
    const reportNational: ForensicReport = {
      ...reportThursday,
      id: 'rep-national',
      predictionId: 'pred-national',
      drawName: 'National',
      combo: machineHistory[0].gagnants,
    };
    const sessionNational = await generateLearningSession(reportNational, machineHistory);
    const machineAdjNational = sessionNational.adjustments?.find((a) => a.algo === AlgoKey.MACHINE_TRANSFER);
    expect(machineAdjNational?.newWeight).toBeGreaterThan(0);

    const updatedNational = await applyForensicAdjustments(
      sessionNational,
      getDefaultWeights(),
      true,
      undefined,
      machineHistory
    );
    expect(updatedNational[AlgoKey.MACHINE_TRANSFER]).toBeGreaterThan(0);
  });

  it('applyOnlineLearningCore enforces zero weight on retired & no-machine MACHINE_TRANSFER channels while remaining normalized', async () => {
    const noMachineHistory = buildDrawHistory('Fortune Thursday', 30, false);
    const baseWeights = getDefaultWeights();

    const learned = await applyOnlineLearningCore(
      'Fortune Thursday',
      noMachineHistory,
      baseWeights,
      60,
      0.5
    );

    expect(learned[AlgoKey.MACHINE_TRANSFER]).toBe(0);
    for (const rk of RETIRED_ALGO_WEIGHT_KEYS) {
      expect(learned[rk]).toBe(0);
    }
    const sum = Object.values(learned).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 4);
  });

  it('savePredictionToHistory forwards historyContext to DNA audit log recording', async () => {
    const drawName = 'National';
    const history = buildDrawHistory(drawName, 20, true);
    const pred: Prediction = {
      suggestedNumbers: [7, 19, 31, 48, 72],
      candidates: [7, 19, 31, 48, 72],
      confidence: 68,
      breakdown: {},
      analysis: 'Cross-module history context test',
      timestamp: Date.now(),
      drawName,
    };

    const saved = await savePredictionToHistory(drawName, pred, undefined, undefined, history);
    await vi.waitFor(async () => {
      const logs = await getPredictionDnaLogs(drawName);
      const found = logs.find((l) => l.predictionId === saved.id);
      expect(found).toBeDefined();
      expect(found?.status).toBe('LOGGED_PRE_DRAW');
      expect(found?.suggestedNumbers).toEqual([7, 19, 31, 48, 72]);
      expect(Object.keys(found?.numbersMicroDna || {})).toHaveLength(5);
    }, { timeout: 3000 });
  });
});
