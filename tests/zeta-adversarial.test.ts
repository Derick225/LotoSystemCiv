import { describe, it, expect } from 'vitest';
import { evaluateAdversarialSurvival } from '../services/prediction/adversarialProxy';
import { generatePlatinumPredictionCore } from '../services/metaAnalystService';
import { DrawResult } from '../types';
import { DEFAULT_ALGO_WEIGHTS, AlgoKey } from '../shared/prediction.types';

describe('Zeta Adversarial & Adversarial Survival Logic', () => {
    const mockHistory: DrawResult[] = [
        { id: '1', date: '2026-08-01', gagnants: [7, 14, 28, 42, 89], machine: 1, draw_name: 'TEST_ZETA' },
        { id: '2', date: '2026-08-02', gagnants: [3, 19, 34, 55, 78], machine: 1, draw_name: 'TEST_ZETA' },
        { id: '3', date: '2026-08-03', gagnants: [12, 23, 45, 67, 88], machine: 1, draw_name: 'TEST_ZETA' },
        { id: '4', date: '2026-08-04', gagnants: [5, 18, 29, 61, 80], machine: 1, draw_name: 'TEST_ZETA' },
        { id: '5', date: '2026-08-05', gagnants: [9, 21, 33, 50, 71], machine: 1, draw_name: 'TEST_ZETA' },
        { id: '6', date: '2026-08-06', gagnants: [1, 24, 38, 59, 82], machine: 1, draw_name: 'TEST_ZETA' },
        { id: '7', date: '2026-08-07', gagnants: [15, 30, 48, 64, 77], machine: 1, draw_name: 'TEST_ZETA' },
        { id: '8', date: '2026-08-08', gagnants: [2, 17, 36, 52, 90], machine: 1, draw_name: 'TEST_ZETA' },
        { id: '9', date: '2026-08-09', gagnants: [8, 26, 40, 68, 85], machine: 1, draw_name: 'TEST_ZETA' },
        { id: '10', date: '2026-08-10', gagnants: [10, 22, 44, 63, 81], machine: 1, draw_name: 'TEST_ZETA' },
    ];

    it('evaluateAdversarialSurvival returns bounded scores and continuous risks', () => {
        const selection = [7, 14, 28, 42, 89];
        const breakdown = {
            7: { [AlgoKey.FREQUENCY]: 10, [AlgoKey.SPECTRAL]: 8, [AlgoKey.MARKOV]: 5 },
            14: { [AlgoKey.FREQUENCY]: 9, [AlgoKey.SPECTRAL]: 7, [AlgoKey.MARKOV]: 6 },
            28: { [AlgoKey.FREQUENCY]: 8, [AlgoKey.SPECTRAL]: 9, [AlgoKey.MARKOV]: 7 },
            42: { [AlgoKey.FREQUENCY]: 11, [AlgoKey.SPECTRAL]: 6, [AlgoKey.MARKOV]: 4 },
            89: { [AlgoKey.FREQUENCY]: 7, [AlgoKey.SPECTRAL]: 8, [AlgoKey.MARKOV]: 9 }
        };

        const result = evaluateAdversarialSurvival(selection, breakdown, mockHistory, {});
        
        expect(result.survivalScore).toBeGreaterThanOrEqual(10);
        expect(result.survivalScore).toBeLessThanOrEqual(99);
        expect(Array.isArray(result.risks)).toBe(true);
    });

    it('Zeta Adversarial scenario is generated deterministically in Platinum Scenarios', async () => {
        const resultA = await generatePlatinumPredictionCore('TEST_ZETA', mockHistory, DEFAULT_ALGO_WEIGHTS);
        const resultB = await generatePlatinumPredictionCore('TEST_ZETA', mockHistory, DEFAULT_ALGO_WEIGHTS);

        const zetaA = resultA.scenarios.find(s => s.id === 'zeta');
        const zetaB = resultB.scenarios.find(s => s.id === 'zeta');

        expect(zetaA).toBeDefined();
        expect(zetaB).toBeDefined();
        expect(zetaA?.name).toBe('Zeta Adversarial');
        expect(zetaA?.numbers.length).toBe(5);
        expect(zetaA?.numbers).toEqual(zetaB?.numbers);
        expect(zetaA?.probability).toBeGreaterThanOrEqual(45);
        expect(zetaA?.probability).toBeLessThanOrEqual(96);
    });
});
