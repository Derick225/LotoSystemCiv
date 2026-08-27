import { describe, it, expect } from 'vitest';
import { isDrawWithoutMachine } from '../constants';
import { purifyHistoryForDraw } from '../utils/arrayUtils';
import { generateDeterministicFallbackHistory } from '../services/lotteryService';
import { calculateMachineTransferReport } from '../services/prediction/machineTransferService';
import { DrawResult } from '../types';

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
