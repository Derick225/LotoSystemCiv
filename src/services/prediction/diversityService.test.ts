import { describe, it, expect } from 'vitest';
import {
    calculateGeneticDiversityIndex,
    computeWeightedJaccardIndex,
    computeContinuousJaccardGating,
    filterDiverseCombinations
} from './diversityService';
import { ScoreBreakdown } from '../../shared/prediction.types';

describe('Genetic Diversity & Synergy Optimization Service', () => {
    // Mock robust breakdowns list for 5 numbers (for a simple candidate ticket)
    const mockBreakdowns: Record<number, ScoreBreakdown> = {
        1: { frequency: 80, gaps: 20, markov: 10, poisson: 5 } as any,
        2: { frequency: 78, gaps: 22, markov: 12, poisson: 4 } as any,
        3: { frequency: 81, gaps: 19, markov: 11, poisson: 6 } as any,
        4: { frequency: 82, gaps: 18, markov: 9, poisson: 5 } as any,
        5: { frequency: 79, gaps: 21, markov: 13, poisson: 4 } as any,
        // Orthogonal items
        10: { frequency: 10, gaps: 85, markov: 5, poisson: 0 } as any,
        20: { frequency: 5, gaps: 5, markov: 80, poisson: 10 } as any,
        30: { frequency: 0, gaps: 10, markov: 10, poisson: 80 } as any,
    };

    it('should identify monoculture when candidate numbers share highly redundant profiles', () => {
        // Les numéros 1, 2, 3, 4, 5 ont tous le même profil dominé par frequency
        const result = calculateGeneticDiversityIndex([1, 2, 3, 4, 5], mockBreakdowns);

        expect(result.meanSimilarity).toBeGreaterThan(0.90);
        expect(result.isMonoculture).toBe(true);
        expect(result.penalty).toBeGreaterThan(15.0);
        expect(result.dominantAlgo).toBe('frequency');
    });

    it('should grant high diversity scores and low penalty to highly orthogonal combinations', () => {
        // Les numéros 1, 10, 20, 30 ont des profils d'activation orthogonaux
        const result = calculateGeneticDiversityIndex([1, 10, 20, 30], mockBreakdowns);

        expect(result.meanSimilarity).toBeLessThan(0.40);
        expect(result.isMonoculture).toBe(false);
        expect(result.penalty).toBeLessThan(10.0);
        expect(result.diversityScore).toBeGreaterThan(0.50);
    });

    it('should compute adaptive thresholds gracefully when large universe of breakdowns is available', () => {
        // Construire un univers de 90 breakdowns pour tester l'adaptation empirique
        const fullUniverse: Record<number, ScoreBreakdown> = {};
        for (let i = 1; i <= 90; i++) {
            fullUniverse[i] = {
                frequency: i % 2 === 0 ? 90 : 10,
                gaps: i % 3 === 0 ? 80 : 20,
                markov: i % 5 === 0 ? 70 : 15,
                poisson: i % 7 === 0 ? 60 : 5
            } as any;
        }

        const result = calculateGeneticDiversityIndex([2, 4, 6, 8, 10], fullUniverse);
        
        // S'assurer que les valeurs calculées sont des nombres finis stables
        expect(isFinite(result.meanSimilarity)).toBe(true);
        expect(isFinite(result.diversityScore)).toBe(true);
        expect(isFinite(result.penalty)).toBe(true);
        expect(result.pairwiseSimilarities.length).toBe(10); // 5 * 4 / 2 = 10 paires
    });
});

describe('Continuous Weighted Jaccard Index & Sigmoidal Gating', () => {
    it('should compute exact weighted Jaccard index between candidate combinations', () => {
        const t1 = [1, 2, 3, 4, 5];
        const t2 = [1, 2, 6, 7, 8];
        const ballWeights = { 1: 2.0, 2: 2.0, 3: 1.0, 4: 1.0, 5: 1.0, 6: 1.0, 7: 1.0, 8: 1.0 };

        const jaccardUnweighted = computeWeightedJaccardIndex(t1, t2);
        // Common: {1, 2} (2), Union: {1, 2, 3, 4, 5, 6, 7, 8} (8) => 2/8 = 0.25
        expect(jaccardUnweighted).toBe(0.25);

        const jaccardWeighted = computeWeightedJaccardIndex(t1, t2, ballWeights);
        // Inter weights: w(1) + w(2) = 4.0
        // Union weights: 2.0 + 2.0 + 1.0*6 = 10.0 => 4.0 / 10.0 = 0.40
        expect(jaccardWeighted).toBeCloseTo(0.40, 2);
    });

    it('should compute continuous C^infty sigmoidal gating attenuation', () => {
        const J0 = 0.35;
        // Low Jaccard similarity (J < J0) => Gating near 1.0 (no attenuation)
        const gLow = computeContinuousJaccardGating(0.10, J0);
        expect(gLow).toBeGreaterThan(0.90);

        // Transition point (J = J0) => Gating = 0.50
        const gMid = computeContinuousJaccardGating(0.35, J0);
        expect(gMid).toBeCloseTo(0.50, 2);

        // High Jaccard similarity (J > J0) => Gating near 0.0 (strong soft attenuation)
        const gHigh = computeContinuousJaccardGating(0.60, J0);
        expect(gHigh).toBeLessThan(0.10);
    });

    it('should filter combinations preserving orthogonality and smooth score gating', () => {
        const candidates = [
            { numbers: [1, 2, 3, 4, 5], nexusScore: 95.0 },
            { numbers: [1, 2, 3, 4, 6], nexusScore: 94.0 }, // High overlap with #1
            { numbers: [10, 20, 30, 40, 50], nexusScore: 88.0 }, // Orthogonal to #1
            { numbers: [11, 21, 31, 41, 51], nexusScore: 85.0 }  // Orthogonal to #1
        ];

        const selected = filterDiverseCombinations(candidates, 3, 2);
        expect(selected.length).toBe(3);
        // First selected must be top candidate
        expect(selected[0].numbers).toEqual([1, 2, 3, 4, 5]);
        // Second selected should be the orthogonal ticket [10, 20, 30, 40, 50] due to soft gating
        expect(selected[1].numbers).toEqual([10, 20, 30, 40, 50]);
    });
});
