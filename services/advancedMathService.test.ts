import { describe, it, expect } from 'vitest';
import { 
    calculateSpatialHotSpots, 
    calculateDigitalRootAnalysis 
} from './advancedMathService';
import { DrawResult } from '../types';

describe('AdvancedMathService', () => {

    const generateMockHistory = (): DrawResult[] => {
        return [
            { id: '1', date: '2024-01-01', drawName: 'test', gagnants: [1, 2, 3, 4, 11], machine: [] },
            { id: '2', date: '2024-01-02', drawName: 'test', gagnants: [2, 12, 22, 32, 42], machine: [] },
        ];
    };

    describe('calculateSpatialHotSpots', () => {
        it('should return an array of spatial scores', () => {
            const history = generateMockHistory();
            const scores = calculateSpatialHotSpots(history);
            
            expect(typeof scores).toBe('object');
            expect(Object.keys(scores).length).toBeGreaterThan(0);
        });
    });

    describe('calculateDigitalRootAnalysis', () => {
        it('should return a record mapping number to score', () => {
            const history = generateMockHistory();
            const scores = calculateDigitalRootAnalysis(history);
            
            expect(typeof scores).toBe('object');
        });
    });
});
