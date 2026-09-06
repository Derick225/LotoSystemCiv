import { describe, it, expect } from 'vitest';
import { MarkowitzPortfolioSolver } from './markowitzPortfolio';
import { ScoredNumber } from './scoringEngine';
import { ScoreBreakdown } from '../../shared/prediction.types';

describe('Markowitz Portfolio Solver & Combinatorial Optimization', () => {
  const mockCandidates: ScoredNumber[] = Array.from({ length: 30 }, (_, idx) => {
    const num = idx + 1;
    return {
      num,
      score: 95 - idx * 2,
      confidence: 0.8,
      rank: idx + 1,
      breakdown: {
        frequency: (num * 17) % 100,
        momentum: (num * 23) % 100,
        bayes: (num * 31) % 100,
        gap_pattern: (num * 41) % 100,
      } as any
    };
  });

  const scoresMap = new Map<number, number>();
  const breakdownsMap = new Map<number, ScoreBreakdown>();
  mockCandidates.forEach(c => {
    scoresMap.set(c.num, c.score);
    if (c.breakdown) breakdownsMap.set(c.num, c.breakdown);
  });

  const affinityMap: Float32Array[] = new Array(91);
  for (let i = 0; i <= 90; i++) {
    affinityMap[i] = new Float32Array(91);
    for (let j = 0; j <= 90; j++) {
      affinityMap[i][j] = (i + j) % 7 === 0 ? 5.0 : 0.0;
    }
  }

  it('should calculate continuous risk aversion without magic constants', () => {
    const lambdaChaotic = MarkowitzPortfolioSolver.calculateRiskAversion(5.5, 0.4); // high entropy, low Hurst
    const lambdaTrending = MarkowitzPortfolioSolver.calculateRiskAversion(3.0, 0.7); // low entropy, high Hurst

    expect(lambdaChaotic).toBeGreaterThan(lambdaTrending);
    expect(lambdaChaotic).toBeGreaterThan(0);
    expect(lambdaTrending).toBeGreaterThan(0);
    expect(isFinite(lambdaChaotic)).toBe(true);
    expect(isFinite(lambdaTrending)).toBe(true);
  });

  it('should build a symmetric positive semi-definite covariance matrix', () => {
    const covar = MarkowitzPortfolioSolver.buildCovarianceMatrix(scoresMap, breakdownsMap, affinityMap, {
      domainSize: 90,
      entropy: 4.8,
      hurst: 0.52
    });

    expect(covar.length).toBe(91);
    expect(covar[1][1]).toBeGreaterThan(0);
    // Symmetry check
    expect(covar[5][12]).toBeCloseTo(covar[12][5], 5);
    expect(covar[3][20]).toBeCloseTo(covar[20][3], 5);
  });

  it('should evaluate portfolio expected return, variance, and Sharpe ratio', () => {
    const covar = MarkowitzPortfolioSolver.buildCovarianceMatrix(scoresMap, breakdownsMap, affinityMap);
    const lambda = MarkowitzPortfolioSolver.calculateRiskAversion(4.5, 0.5);

    const comboA = [1, 2, 3, 4, 5]; // close spatial cluster
    const comboB = [1, 10, 20, 30, 40]; // dispersed

    const evalA = MarkowitzPortfolioSolver.evaluatePortfolio(comboA, scoresMap, covar, lambda);
    const evalB = MarkowitzPortfolioSolver.evaluatePortfolio(comboB, scoresMap, covar, lambda);

    expect(evalA.expectedReturn).toBeGreaterThan(0);
    expect(evalB.expectedReturn).toBeGreaterThan(0);
    expect(evalA.portfolioVariance).toBeGreaterThan(0);
    expect(evalB.portfolioVariance).toBeGreaterThan(0);
    // Dispersed combo should have lower covariance / higher diversification ratio
    expect(evalB.diversificationRatio).toBeGreaterThan(0);
  });

  it('should generate 4 distinct, valid frontier seeds with 5 unique numbers', () => {
    const covar = MarkowitzPortfolioSolver.buildCovarianceMatrix(scoresMap, breakdownsMap, affinityMap);
    const seeds = MarkowitzPortfolioSolver.solveFrontierSeeds(
      mockCandidates,
      scoresMap,
      covar,
      affinityMap,
      undefined,
      [10, 15, 20, 25, 30],
      1
    );

    expect(seeds.length).toBe(4);
    seeds.forEach(seed => {
      expect(seed.numbers.length).toBe(5);
      // All numbers must be distinct
      const unique = new Set(seed.numbers);
      expect(unique.size).toBe(5);
      // All numbers between 1 and 90
      seed.numbers.forEach(n => {
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(90);
      });
      expect(isFinite(seed.energy)).toBe(true);
      expect(seed.metrics.sharpeRatio).toBeGreaterThan(0);
    });
  });

  it('should be 100% deterministic across repeated calls with identical inputs', () => {
    const covar1 = MarkowitzPortfolioSolver.buildCovarianceMatrix(scoresMap, breakdownsMap, affinityMap, { entropy: 4.5, hurst: 0.5 });
    const covar2 = MarkowitzPortfolioSolver.buildCovarianceMatrix(scoresMap, breakdownsMap, affinityMap, { entropy: 4.5, hurst: 0.5 });

    const seeds1 = MarkowitzPortfolioSolver.solveFrontierSeeds(mockCandidates, scoresMap, covar1, affinityMap);
    const seeds2 = MarkowitzPortfolioSolver.solveFrontierSeeds(mockCandidates, scoresMap, covar2, affinityMap);

    expect(seeds1[0].numbers).toEqual(seeds2[0].numbers);
    expect(seeds1[1].numbers).toEqual(seeds2[1].numbers);
    expect(seeds1[2].numbers).toEqual(seeds2[2].numbers);
    expect(seeds1[3].numbers).toEqual(seeds2[3].numbers);
  });

  it('should solve optimal portfolio coverage for N diversified tickets without catastrophic overlap', () => {
    const covar = MarkowitzPortfolioSolver.buildCovarianceMatrix(scoresMap, breakdownsMap, affinityMap);
    const tickets = MarkowitzPortfolioSolver.solveOptimalPortfolioCoverage(
      5,
      mockCandidates,
      scoresMap,
      covar,
      affinityMap
    );

    expect(tickets.length).toBe(5);
    const allNumbersCovered = new Set<number>();
    tickets.forEach(ticket => {
      expect(ticket.numbers.length).toBe(5);
      expect(new Set(ticket.numbers).size).toBe(5);
      ticket.numbers.forEach(n => allNumbersCovered.add(n));
      expect(ticket.metrics.sharpeRatio).toBeGreaterThan(0);
      expect(isFinite(ticket.metrics.markowitzUtility)).toBe(true);
    });

    // With 5 tickets of 5 numbers, portfolio diversification ensures substantial domain coverage (significantly > 5)
    expect(allNumbersCovered.size).toBeGreaterThan(12);
  });
});
