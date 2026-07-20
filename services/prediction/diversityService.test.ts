import { describe, it, expect } from 'vitest';
import { calculateGeneticDiversityIndex } from './diversityService';
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
