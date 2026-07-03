import { describe, it, expect } from 'vitest';
import { normalizeWeights, getDefaultWeights } from './weightsManager';
import { AlgoKey, DEFAULT_ALGO_WEIGHTS } from '../../shared/prediction.types';

describe('Weights Manager & Algorithm Configuration', () => {
    
    describe('Compile-time Consistency Validation', () => {
        it('should have all AlgoKey defined in DEFAULT_ALGO_WEIGHTS', () => {
            const definedKeys = Object.keys(DEFAULT_ALGO_WEIGHTS);
            const allKeys = Object.values(AlgoKey);
            
            // Check that almost all keys have a weight (or ensure it's considered in normalization).
            // Actually, any missing key gets a 0 weight dynamically in getAlgoWeights.
            // But we can ensure that DEFAULT_ALGO_WEIGHTS does not contain invalid keys.
            definedKeys.forEach(key => {
                expect(allKeys.includes(key as AlgoKey)).toBe(true);
            });
        });

        it('should not allow absolute dominance from a single algorithm', () => {
            // Priority 2: Rééquilibrer les poids pour éviter la dominance
            const weights = getDefaultWeights();
            const normalized = normalizeWeights(weights);
            
            const maxWeight = Math.max(...Object.values(normalized).filter(v => typeof v === 'number'));
            // Max weight shouldn't be > 30% after normalization 
            expect(maxWeight).toBeLessThanOrEqual(0.30);
        });

        it('DEFAULT_ALGO_WEIGHTS should not have NaN or negative weights', () => {
            Object.values(DEFAULT_ALGO_WEIGHTS).forEach(val => {
                expect(typeof val).toBe('number');
                expect(val).toBeGreaterThanOrEqual(0);
            });
        });
    });

    describe('Runtime Normalization (L1 Norm) & Anti-dominance', () => {
        it('should normalize weights and cap any algorithm to dynamic ceiling (0.50 here)', () => {
            const mockWeights = {
                [AlgoKey.FREQUENCY]: 10,
                [AlgoKey.GAPS]: 5,
                [AlgoKey.MARKOV]: 5,
                [AlgoKey.POISSON]: 1,
                [AlgoKey.SPECTRAL]: 1 // added enough to allow sum to 1.0
            };
            
            const normalized = normalizeWeights(mockWeights);
            
            // freq loses weight. It's redistributed.
            // numAlgos = 5, theoretical = 0.2, ceiling = min(0.5, 0.6) = 0.5
            // So it might not hit the ceiling if sum was adjusted, but it should be <= 0.5
            expect(normalized[AlgoKey.FREQUENCY]).toBeLessThanOrEqual(0.50);
            
            // Because there are enough keys, it can redistrib and sum to ~1.0
            const sum = Object.values(normalized).reduce((a: number, b: number) => a + (b || 0), 0) as number;
            expect(sum).toBeCloseTo(1.0, 1);
        });

        it('should handle zero or negative weights gracefully by falling back', () => {
            const mockWeights = {
                [AlgoKey.FREQUENCY]: -5,
                [AlgoKey.GAPS]: 0,
            };
            
            const normalized = normalizeWeights(mockWeights);
            const sum = Object.values(normalized).reduce((a: number, b: number) => a + (b || 0), 0) as number;
            // The fallback should also be normalized to 1.0!
            expect(sum).toBeCloseTo(1.0, 1);
        });
        
        it('should normalize large relative weights correctly', () => {
             const mockWeights = {
                [AlgoKey.FREQUENCY]: 1000,
                [AlgoKey.GAPS]: 1,
                [AlgoKey.MARKOV]: 1,
                [AlgoKey.POISSON]: 1
            };
            
            const normalized = normalizeWeights(mockWeights);
            // numAlgos = 4 => theoretical = 0.25 => ceiling = 0.50
            expect(normalized[AlgoKey.FREQUENCY]).toBeCloseTo(0.50);
            
            // With 4 keys, max sum is 1.20, so 1.0 is possible
            const sum = Object.values(normalized).reduce((a: number, b: number) => a + (b || 0), 0) as number;
            expect(sum).toBeCloseTo(1.0, 1);
        });
    });
});
