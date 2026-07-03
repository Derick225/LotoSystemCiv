import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { mean } from '../services/mathCore';
import { variance } from '../utils/mathUtils';

// Simple pearson correlation implementation for tests
const pearsonCorrelation = (x: number[], y: number[]) => {
    const xMean = mean(x);
    const yMean = mean(y);
    let num = 0;
    let den1 = 0;
    let den2 = 0;
    for (let i = 0; i < x.length; i++) {
        const xDiff = x[i] - xMean;
        const yDiff = y[i] - yMean;
        num += xDiff * yDiff;
        den1 += xDiff * xDiff;
        den2 += yDiff * yDiff;
    }
    return den1 === 0 || den2 === 0 ? 0 : num / Math.sqrt(den1 * den2);
};

describe('Math Properties & Invariants', () => {
    describe('mean', () => {
        it('should be bounded by min and max of the array', () => {
            fc.assert(
                fc.property(fc.array(fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }), { minLength: 1 }), (arr) => {
                    const m = mean(arr);
                    const min = Math.min(...arr);
                    const max = Math.max(...arr);
                    expect(m).toBeGreaterThanOrEqual(min);
                    expect(m).toBeLessThanOrEqual(max);
                })
            );
        });

        it('should return 0 for empty array', () => {
            expect(mean([])).toBe(0);
        });
    });

    describe('variance', () => {
        it('should always be non-negative', () => {
            fc.assert(
                fc.property(fc.array(fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true })), (arr) => {
                    const v = variance(arr);
                    expect(v).toBeGreaterThanOrEqual(-1e-10); // account for floating point errors
                })
            );
        });

        it('should be exactly 0 if all elements are identical', () => {
            fc.assert(
                fc.property(fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }), fc.integer({ min: 2, max: 100 }), (val, len) => {
                    const arr = Array(len).fill(val);
                    const v = variance(arr);
                    expect(v).toBeCloseTo(0, 5);
                })
            );
        });
    });

    describe('pearsonCorrelation', () => {
        it('should return a value between -1 and 1', () => {
            fc.assert(
                fc.property(
                    fc.array(fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }), { minLength: 2, maxLength: 100 }),
                    fc.array(fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }), { minLength: 2, maxLength: 100 }),
                    (x, y) => {
                        const len = Math.min(x.length, y.length);
                        const xTrim = x.slice(0, len);
                        const yTrim = y.slice(0, len);
                        fc.pre(variance(xTrim) > 1e-5 && variance(yTrim) > 1e-5);
                        
                        const corr = pearsonCorrelation(xTrim, yTrim);
                        expect(corr).toBeGreaterThanOrEqual(-1.0001);
                        expect(corr).toBeLessThanOrEqual(1.0001);
                    }
                )
            );
        });

        it('should be 1 for identical arrays', () => {
            fc.assert(
                fc.property(
                    fc.array(fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true }), { minLength: 2, maxLength: 100 }),
                    (arr) => {
                        fc.pre(variance(arr) > 1e-5);
                        const corr = pearsonCorrelation(arr, arr);
                        expect(corr).toBeCloseTo(1, 4);
                    }
                )
            );
        });
    });
});
