import { describe, it, expect } from 'vitest';
import { 
    mean, 
    stdDev, 
    computeDFT, 
    computeHaarWaveletEnergy, 
    matMul, 
    transpose, 
    matAdd, 
    matSub, 
    scalarMul, 
    vecNorm 
} from './mathCore';

describe('MathCore Utility Functions', () => {
    describe('mean', () => {
        it('should calculate the mean of an array of numbers', () => {
            expect(mean([1, 2, 3, 4, 5])).toBe(3);
            expect(mean([-1, 0, 1])).toBe(0);
            expect(mean([10])).toBe(10);
        });

        it('should return 0 or handle empty arrays gracefully', () => {
            // Expected behavior might be 0 per existing implementation which divides by (data.length || 1)
            expect(mean([])).toBe(0); 
        });
    });

    describe('stdDev', () => {
        it('should calculate the standard deviation', () => {
            const data = [2, 4, 4, 4, 5, 5, 7, 9];
            const std = stdDev(data);
            expect(std).toBeCloseTo(2.0, 1);
        });

        it('should return 0 for identical elements', () => {
            expect(stdDev([3, 3, 3, 3])).toBe(0);
        });

        it('should return 0 for empty arrays', () => {
            expect(stdDev([])).toBe(0);
        });
    });

    describe('Matrix Operations', () => {
        const A = [
            [1, 2],
            [3, 4]
        ];
        const B = [
            [5, 6],
            [7, 8]
        ];

        it('transpose should invert rows and columns', () => {
            expect(transpose(A)).toEqual([
                [1, 3],
                [2, 4]
            ]);
        });

        it('matMul should multiply two matrices', () => {
            expect(matMul(A, B)).toEqual([
                [19, 22],
                [43, 50]
            ]);
        });

        it('matAdd should add two matrices', () => {
            expect(matAdd(A, B)).toEqual([
                [6, 8],
                [10, 12]
            ]);
        });

        it('matSub should subtract matrices', () => {
            expect(matSub(A, B)).toEqual([
                [-4, -4],
                [-4, -4]
            ]);
        });

        it('scalarMul should multiply by scalar', () => {
            expect(scalarMul(A, 2)).toEqual([
                [2, 4],
                [6, 8]
            ]);
        });

        it('vecNorm should calculate Frobenius norm of a column vector', () => {
            // Norm of [3, 4]^T is sqrt(3^2 + 4^2) = 5
            const vec = [[3], [4]];
            expect(vecNorm(vec)).toBeCloseTo(5);
        });
    });

    describe('Signal Processing', () => {
        it('computeHaarWaveletEnergy should compute energy of signal', () => {
            const energy = computeHaarWaveletEnergy([1, 2, 3, 4]);
            expect(energy).toBeGreaterThanOrEqual(0);
            expect(typeof energy).toBe('number');
            // If length < 2, should be 0
            expect(computeHaarWaveletEnergy([1])).toBe(0);
        });

        it('computeDFT should return frequencies', () => {
            const dft = computeDFT([1, 0, -1, 0]);
            expect(Array.isArray(dft)).toBe(true);
            if (dft.length > 0) {
                expect(dft[0]).toHaveProperty('frequency');
                expect(dft[0]).toHaveProperty('power');
                expect(dft[0]).toHaveProperty('period');
            }
        });
    });
});
