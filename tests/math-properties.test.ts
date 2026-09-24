import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { mean } from '../services/mathCore';
import { variance, binomialUpperTail, benjaminiHochberg } from '../utils/mathUtils';

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

    describe('binomialUpperTail', () => {
        it('should always be a probability within [0, 1]', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 0, max: 40 }),
                    fc.integer({ min: 1, max: 40 }),
                    fc.double({ min: 0.001, max: 0.999, noNaN: true, noDefaultInfinity: true }),
                    (k, n, p0) => {
                        const tail = binomialUpperTail(k, n, p0);
                        expect(tail).toBeGreaterThanOrEqual(0);
                        expect(tail).toBeLessThanOrEqual(1);
                    }
                )
            );
        });

        it('should be exactly 1 when no success is required', () => {
            expect(binomialUpperTail(0, 8, 0.0233)).toBe(1);
        });

        it('should match the closed form for a single trial', () => {
            // P(X >= 1) = p0 et P(X >= 0) = 1 pour n = 1.
            expect(binomialUpperTail(1, 1, 0.25)).toBeCloseTo(0.25, 10);
            expect(binomialUpperTail(0, 1, 0.25)).toBe(1);
        });

        it('should be monotone non-increasing in k and in the success count', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 1, max: 30 }),
                    fc.double({ min: 0.01, max: 0.9, noNaN: true, noDefaultInfinity: true }),
                    (n, p0) => {
                        let previous = Infinity;
                        for (let k = 0; k <= n; k++) {
                            const tail = binomialUpperTail(k, n, p0);
                            expect(tail).toBeLessThanOrEqual(previous + 1e-12);
                            previous = tail;
                        }
                    }
                )
            );
        });

        it('should reject the impossible outcome (k > n) with 0', () => {
            expect(binomialUpperTail(9, 8, 0.5)).toBe(0);
        });
    });

    describe('benjaminiHochberg', () => {
        it('should bound every q-value by 1', () => {
            const q = benjaminiHochberg({ a: 0.5, b: 0.02, c: 0.9 });
            Object.values(q).forEach((value) => {
                expect(value).toBeGreaterThanOrEqual(0);
                expect(value).toBeLessThanOrEqual(1);
            });
        });

        it('should never flag a p-value under H0 as more significant than the raw p-value', () => {
            const pValues = { a: 0.9, b: 0.4, c: 0.05, d: 0.01 };
            const q = benjaminiHochberg(pValues);
            Object.keys(pValues).forEach((key) => {
                expect(q[key]).toBeGreaterThanOrEqual(pValues[key] - 1e-12);
            });
        });

        it('should return q = 1 for every test when no p-value is finite', () => {
            const q = benjaminiHochberg({ a: NaN, b: NaN });
            expect(q.a).toBe(1);
            expect(q.b).toBe(1);
        });

        it('should preserve the step-up ordering across the family', () => {
            const pValues = { a: 0.01, b: 0.04, c: 0.03 };
            const q = benjaminiHochberg(pValues);
            // Famille de 3, p croissants (a, c, b) : q_(3) = 0.04, puis monotonicité descendante
            // q_(2) = min(0.04, 1.5·0.03) = 0.04 et q_(1) = min(0.04, 3·0.01) = 0.03.
            expect(q.a).toBeCloseTo(0.03, 10);
            expect(q.c).toBeCloseTo(0.04, 10);
            expect(q.b).toBeCloseTo(0.04, 10);
        });
    });
});
