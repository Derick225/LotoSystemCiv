
import { describe, it, expect } from 'vitest';
import { calculateACValue, calculateMean, calculateStandardDeviation } from '../services/mathService';
import { calculateSpatialHotSpots } from '../services/advancedMathService';

describe('Math Service', () => {
    it('AC Value - Simple Sequence', () => {
        const ac = calculateACValue([1, 2, 3, 4, 5]);
        expect(ac).toBe(0);
    });

    it('AC Value - Spread Sequence', () => {
        const ac = calculateACValue([1, 3, 5, 7, 9]);
        expect(ac).toBe(0);
    });

    it('Mean Calculation', () => {
        const mean = calculateMean([1, 2, 3, 4, 5]);
        expect(mean).toBe(3);
    });

    it('Standard Deviation', () => {
        const std = calculateStandardDeviation([2, 4, 4, 4, 5, 5, 7, 9]);
        expect(Math.abs(std - 2)).toBeLessThan(0.01);
    });
});

describe('Advanced Math Service', () => {
    it('Spatial HotSpots - Basic Grid', () => {
        const mockDraw = { id: '1', date: '2023-01-01', gagnants: [1, 2, 3, 4, 5], machine: 1, draw_name: 'TEST' };
        const history: DrawResult[] = Array(20).fill(mockDraw);
        
        const hotSpots = calculateSpatialHotSpots(history);
        expect(hotSpots[1]).toBeGreaterThan(0);
    });
});
