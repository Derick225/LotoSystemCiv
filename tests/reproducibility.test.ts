import { expect, test, describe } from 'vitest';
import { lcgGlobalRandom, initializeLcgForDraw } from '../utils/mathUtils';

describe('MathCore Determinism & Continuity', () => {
    test('LCG Random is 100% Deterministic', () => {
        initializeLcgForDraw('EuroMillions_1704067200000');
        const seqA = Array.from({ length: 5 }, () => lcgGlobalRandom());
        
        initializeLcgForDraw('EuroMillions_1704067200000');
        const seqB = Array.from({ length: 5 }, () => lcgGlobalRandom());
        
        expect(seqA).toEqual(seqB);
    });

    test('Isolation : Different drawNames yield different sequences', () => {
        initializeLcgForDraw('Loto_1704067200000');
        const seqA = Array.from({ length: 5 }, () => lcgGlobalRandom());
        
        initializeLcgForDraw('EuroMillions_1704067200000');
        const seqB = Array.from({ length: 5 }, () => lcgGlobalRandom());
        
        expect(seqA).not.toEqual(seqB);
    });

    test('Continuity: Sigmoid squashing function bounds are [0, 1]', () => {
        const scores = [-1000, -10, 0, 10, 1000];
        const sigmoid = (z: number) => 1.0 / (1.0 + Math.exp(-z));
        
        scores.forEach(s => {
            const val = sigmoid(s);
            expect(val).toBeGreaterThanOrEqual(0);
            expect(val).toBeLessThanOrEqual(1);
        });
        
        expect(sigmoid(-1000)).toBeCloseTo(0);
        expect(sigmoid(1000)).toBeCloseTo(1);
        expect(sigmoid(0)).toBe(0.5);
    });
});
