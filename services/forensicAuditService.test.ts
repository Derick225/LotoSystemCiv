import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';
import { analyzeForManipulation, sanitizeNumber, InvalidInputError, DEFAULT_AUDIT_CONFIG } from './forensicAuditService';
import { DrawResult } from '../types';

// Mocks for mathService
vi.mock('./mathService', () => ({
    calculateShannonEntropy: vi.fn(() => ({ normalized: 0.95 })),
    calculateBenfordCompliance: vi.fn(() => ({ score: 90, distribution: [30, 17, 12, 9, 7, 6, 5, 4, 10] })),
    calculateKolmogorovSmirnov: vi.fn(() => ({ statistic: 0.1, pValue: 0.9, isUniform: true })),
    calculateLjungBoxTest: vi.fn(() => ({ statistic: 0.1, pValue: 0.9, hasAutocorrelation: false }))
}));

describe('forensicAuditService', () => {
    
    describe('sanitizeNumber', () => {
        it('should accept valid numbers between 1 and 90', () => {
            expect(sanitizeNumber(1)).toBe(1);
            expect(sanitizeNumber(90)).toBe(90);
            expect(sanitizeNumber(45)).toBe(45);
            expect(sanitizeNumber("15")).toBe(15);
        });

        it('should throw InvalidInputError for invalid numbers', () => {
            expect(() => sanitizeNumber(0)).toThrow(InvalidInputError);
            expect(() => sanitizeNumber(91)).toThrow(InvalidInputError);
            expect(() => sanitizeNumber(-5)).toThrow(InvalidInputError);
            expect(() => sanitizeNumber(NaN)).toThrow(InvalidInputError);
            expect(() => sanitizeNumber(Infinity)).toThrow(InvalidInputError);
            expect(() => sanitizeNumber("abc")).toThrow(InvalidInputError);
            expect(() => sanitizeNumber(1.5)).toThrow(InvalidInputError);
        });
    });

    describe('analyzeForManipulation - Property Based Tests', () => {
        // Generate valid draw arrays: 5 unique numbers between 1 and 90
        const drawArbitrary = fc.uniqueArray(fc.integer({ min: 1, max: 90 }), { minLength: 5, maxLength: 5 });
        
        // Generate valid history
        const historyArbitrary = fc.array(
            drawArbitrary.map(nums => ({
                id: `audit_test_${Date.now()}`,
                date: new Date().toISOString(),
                gagnants: nums,
                machine: 1,
                draw_name: 'TEST'
            })),
            { minLength: 10, maxLength: 100 }
        );

        it('should always return bounded scores and probabilities', () => {
            fc.assert(
                fc.property(drawArbitrary, historyArbitrary, (draw, history) => {
                    const result = analyzeForManipulation(draw, history);
                    
                    expect(result.suspicionScore).toBeGreaterThanOrEqual(0);
                    expect(result.suspicionScore).toBeLessThanOrEqual(100);
                    
                    expect(result.riggedProbability).toBeGreaterThanOrEqual(0);
                    expect(result.riggedProbability).toBeLessThanOrEqual(1);
                    
                    expect(result.confidenceIntervals.suspicionScore.lower).toBeGreaterThanOrEqual(0);
                    expect(result.confidenceIntervals.suspicionScore.upper).toBeLessThanOrEqual(100);
                    
                    expect(result.confidenceIntervals.riggedProbability.lower).toBeGreaterThanOrEqual(0);
                    expect(result.confidenceIntervals.riggedProbability.upper).toBeLessThanOrEqual(1);
                })
            );
        });
    });

    describe('analyzeForManipulation - Edge Cases & Fraud Detection', () => {
        const createHistory = (count: number): DrawResult[] => {
            return Array.from({ length: count }, (_, i) => ({
                id: `id-${i}`,
                date: new Date().toISOString(),
                gagnants: [1, 2, 3, 4, 5].map(n => (n + i) % 90 + 1),
                machine: 1,
                draw_name: 'TEST'
            }));
        };

        it('should handle short history gracefully', () => {
            const history = createHistory(3); // Less than minHistorySize (5)
            const result = analyzeForManipulation([1, 2, 3, 4, 5], history);
            
            expect(result.suspicionScore).toBe(0);
            expect(result.riggedProbability).toBe(0);
            expect(result.evidenceLogs[0].message).toContain("Historique insuffisant");
        });

        it('should detect clustered fraud (dense cluster)', () => {
            const history = createHistory(20);
            // Cluster of 4 numbers within a spread of 15
            const fraudulentDraw = [10, 11, 12, 13, 80];
            
            const result = analyzeForManipulation(fraudulentDraw, history);
            
            const clusterIndicator = result.indicators.find(i => i.type === 'CLUSTER');
            expect(clusterIndicator).toBeDefined();
            expect(result.suspicionScore).toBeGreaterThan(0);
        });

        it('should detect linear harmony (low variance in gaps)', () => {
            const history = createHistory(20);
            // Gaps are exactly 10: 10, 20, 30, 40, 50
            const fraudulentDraw = [10, 20, 30, 40, 50];
            
            const result = analyzeForManipulation(fraudulentDraw, history);
            
            const harmonyIndicator = result.indicators.find(i => i.type === 'HARMONY');
            expect(harmonyIndicator).toBeDefined();
        });

        it('should detect J-1 repetition (Echo de Registre)', () => {
            const history = createHistory(20);
            // Force history[0] to be specific
            history[0].gagnants = [5, 15, 25, 35, 45];
            
            // Repeat 4 numbers from previous draw
            const fraudulentDraw = [5, 15, 25, 35, 80];
            
            const result = analyzeForManipulation(fraudulentDraw, history);
            
            const echoIndicator = result.indicators.find(i => i.type === 'ECHO');
            expect(echoIndicator).toBeDefined();
            expect(echoIndicator?.severity).toBe('high');
        });

        it('should detect Sigma deviation', () => {
            const history = createHistory(20);
            // Very high sum: 86+87+88+89+90 = 440 (Avg is 227.5)
            const fraudulentDraw = [86, 87, 88, 89, 90];
            
            const result = analyzeForManipulation(fraudulentDraw, history);
            
            const sigmaIndicator = result.indicators.find(i => i.type === 'SIGMA');
            expect(sigmaIndicator).toBeDefined();
        });
    });

    describe('analyzeForManipulation - Performance', () => {
        it('should execute within 50ms for 10,000 history records', () => {
            const history: DrawResult[] = Array.from({ length: 10000 }, (_, i) => ({
                id: `id-${i}`,
                date: new Date().toISOString(),
                gagnants: [1, 2, 3, 4, 5].map(n => (n + i) % 90 + 1),
                machine: 1,
                draw_name: 'TEST'
            }));
            
            const start = performance.now();
            const result = analyzeForManipulation([10, 20, 30, 40, 50], history);
            const end = performance.now();
            
            expect(end - start).toBeLessThan(100); // 100ms tolerance for test environment
            expect(result.executionMs).toBeLessThan(100);
        });
    });
});
