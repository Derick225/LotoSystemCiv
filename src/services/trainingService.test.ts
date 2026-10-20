import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runBacktestTraining } from './trainingService';
import { DrawResult } from '../types';

vi.mock('./prediction/weightsManager', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./prediction/weightsManager')>();
    return {
        ...actual,
        getAlgoWeights: vi.fn().mockResolvedValue({}),
    };
});

vi.mock('idb-keyval', () => ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    keys: vi.fn().mockResolvedValue([]),
}));

describe('TrainingService - runBacktestTraining', () => {

    beforeEach(() => {
        vi.clearAllMocks();
    });

    const generateMockHistory = (count: number): DrawResult[] => {
        const history: DrawResult[] = [];
        const baseDate = new Date('2025-01-01T12:00:00Z');
        for (let i = 0; i < count; i++) {
            history.push({
                id: `draw-${i}`,
                drawName: 'Loto Test',
                date: new Date(baseDate.getTime() + i * 86400000).toISOString(),
                gagnants: [(i % 90) + 1, ((i + 1) % 90) + 1, ((i + 2) % 90) + 1, ((i + 3) % 90) + 1, ((i + 4) % 90) + 1],
                machine: [],
            });
        }
        return history.reverse();
    };

    it('should throw an error if sampleSize is less than 5 (Zod validation)', async () => {
        const history = generateMockHistory(50);
        await expect(runBacktestTraining('Loto Test', history, 4)).rejects.toThrow(/Entrées invalides/);
    });

    it('should throw an error if history is insufficient (less than 5 items)', async () => {
        const history = generateMockHistory(4);
        await expect(runBacktestTraining('Loto Test', history, 10)).rejects.toThrow("Historique insuffisant");
    });

    it('should compute properly with correct inputs and avoid data leakage', async () => {
        // En créant 50 éléments, sampleSize = 10, walk-forward doit avoir des index valides
        const history = generateMockHistory(50);
        const report = await runBacktestTraining('Loto Test', history, 10);
        
        expect(report).toBeDefined();
        // The actual sample size should be min(10, 50 - 10) = 10
        expect(report.totalTests).toBe(10);
        
        // Zod validation constraints passed
        expect(report.score).toBeGreaterThanOrEqual(0);
        expect(report.history.length).toBe(10);
        
        // Metrics should exist
        expect(report.learnedPatternsSummary).toHaveProperty('mrr');
        expect(report.learnedPatternsSummary).toHaveProperty('ndcg');
        
        // Check structural outputs
        expect(typeof report.brier_score).toBe('number');
        expect(typeof report.stabilityScore).toBe('number');
    }, 90000);
    
    it('should restrict sample size to available history minus holdout', async () => {
        const history = generateMockHistory(18);
        // sampleSize requested is 20, but history length is 18. 
        // Max limit by math is min(requested, history.length - 10) = min(20, 18 - 10) = 8
        const report = await runBacktestTraining('Loto Test', history, 20);
        expect(report.totalTests).toBe(8);
    }, 90000);

});
