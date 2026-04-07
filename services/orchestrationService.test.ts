import { describe, it, expect } from 'vitest';
import { calculateOrchestrationScores, analyzeImmediateTrend } from './orchestrationService';
import type { DrawResult } from '../types';

const mockHistory: DrawResult[] = [
    { id: '1', date: '02/01/2025', drawName: 'TEST_DRAW', gagnants: [5, 12, 23, 45, 89], machine: [10, 20, 30, 40, 50], version: 1 },
    { id: '2', date: '01/01/2025', drawName: 'TEST_DRAW', gagnants: [5, 11, 67, 44, 80], machine: [1, 2, 3, 4, 5], version: 1 },
    { id: '3', date: '01/01/2025', drawName: 'TEST_DRAW', gagnants: [1, 2, 3, 4, 5], machine: [1, 2, 3, 4, 5], version: 1 },
    { id: '4', date: '01/01/2025', drawName: 'TEST_DRAW', gagnants: [1, 2, 3, 4, 5], machine: [1, 2, 3, 4, 5], version: 1 },
    { id: '5', date: '01/01/2025', drawName: 'TEST_DRAW', gagnants: [1, 2, 3, 4, 5], machine: [1, 2, 3, 4, 5], version: 1 }
];

describe('Orchestration Service', () => {
    it('should detect machine transfer patterns', () => {
        const trend = analyzeImmediateTrend(mockHistory);
        const machinePattern = trend.lessons.find(l => l.pattern === 'Transfert Machine');
        expect(machinePattern).toBeDefined();
        if(machinePattern) expect(machinePattern.impactScore).toBeGreaterThan(0);
    });

    it('should detect neighbor patterns', () => {
        const trend = analyzeImmediateTrend(mockHistory);
        const neighborPattern = trend.lessons.find(l => l.pattern === 'Voisin');
        expect(neighborPattern).toBeDefined();
        if(neighborPattern) expect(neighborPattern.impactScore).toBeGreaterThan(0);
    });

    it('should calculate base orchestration scores based on machine and mirrors', () => {
        const scores = calculateOrchestrationScores(mockHistory);
        expect(scores[10]).toBeGreaterThan(0);
        expect(Object.keys(scores).length).toBeGreaterThan(0);
    });

    it('should handle empty history gracefully', () => {
        const scores = calculateOrchestrationScores([]);
        expect(scores).toEqual({});
        const trend = analyzeImmediateTrend([]);
        expect(trend.lessons).toHaveLength(0);
    });
});