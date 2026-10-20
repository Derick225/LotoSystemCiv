import { describe, it, expect } from 'vitest';
import {
  patternDiscoveryService,
  computeExactCycleUnionProbability,
  computeExactSameDrawCycleProbability,
} from '../src/services/prediction/patternDiscoveryService';
import { DrawResult } from '../src/types';

describe('Optimisation Sous-Onglet Motifs Répétitifs (Détection, Raisonnement & Sélection)', () => {
  it('1. calcule exactement la probabilité d’inclusion-exclusion d’union de cycle sans inflation artificielle', () => {
    const pUnionPair10 = computeExactCycleUnionProbability(2, 10);
    const pSameDrawPair10 = computeExactSameDrawCycleProbability(2, 10);

    // Formule analytique exacte : 1 - 2*(85/90)^10 + ((85*84)/(90*89))^10 ≈ 0.1879308
    const expectedAnalytical =
      1 - 2 * Math.pow(85 / 90, 10) + Math.pow((85 * 84) / (90 * 89), 10);

    expect(pUnionPair10).toBeCloseTo(expectedAnalytical, 6);
    expect(pUnionPair10).toBeGreaterThan(pSameDrawPair10 * 6);
  });

  it('2. détecte sans biais les triplets de numéros élevés (> 55) grâce à l’élagage Apriori exact sur 1..90', () => {
    const draws: DrawResult[] = [];
    const totalDraws = 85; // 8 cycles complets de 10 + 5 tirages dans le cycle actif

    for (let i = 0; i < totalDraws; i++) {
      // Chronological index from oldest (0) to newest (totalDraws - 1)
      let gagnants = [
        ((i * 7) % 60) + 1,
        ((i * 11 + 5) % 60) + 1,
        ((i * 13 + 17) % 60) + 1,
        ((i * 19 + 29) % 60) + 1,
        ((i * 23 + 41) % 60) + 1,
      ];

      // Inject high-number triplet [68, 77, 89] in draw #1 of every completed 10-draw cycle
      if (i % 10 === 1 && i < 80) {
        gagnants = [((i * 7) % 50) + 1, ((i * 13 + 9) % 50) + 1, 68, 77, 89];
      }
      // In the active cycle (i >= 80), inject precursors [68, 77] so 89 is PRIMED for completion!
      if (i === 82) {
        gagnants = [5, 19, 41, 68, 77];
      }

      // Deduplicate and ensure 5 valid numbers
      const uniq = Array.from(new Set(gagnants));
      let fill = 1;
      while (uniq.length < 5) {
        if (!uniq.includes(fill)) uniq.push(fill);
        fill++;
      }

      draws.push({
        id: `d_${i}`,
        draw_name: 'NATIONAL',
        drawName: 'NATIONAL',
        date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
        gagnants: uniq.slice(0, 5),
      });
    }

    // History is stored newest-first
    const historyNewestFirst = [...draws].reverse();
    const summary = patternDiscoveryService.discoverPatterns('NATIONAL', historyNewestFirst, {
      cycleLength: 10,
      maxPatternsPerCategory: 30,
    });

    // Verify high-ball triplet [68, 77, 89] is detected!
    const highTriplet = summary.topRecurringTriplets.find(
      (t) =>
        t.sequence.includes(68) &&
        t.sequence.includes(77) &&
        t.sequence.includes(89)
    );
    expect(highTriplet).toBeDefined();
    expect(highTriplet?.activeAlertStatus).toBe('PRIMED');
    expect(highTriplet?.completionCandidates).toEqual([89]);
    expect(highTriplet?.reasoning?.sameDrawOccurrences).toBeGreaterThanOrEqual(6);
    expect(highTriplet?.reasoning?.pmi).toBeGreaterThan(0);

    // Verify candidate #89 is surfaced in the synthesized selection rankings
    const cand89 = summary.candidateRankings?.find((c) => c.number === 89);
    expect(cand89).toBeDefined();
    expect(cand89?.primedMotifsCount).toBeGreaterThanOrEqual(1);
    expect(summary.recommendedSelection?.optimalFive.length).toBe(5);
    expect(summary.recommendedSelection?.optimalFive).toContain(89);
  });

  it('3. renseigne les occurrences réelles, la phase cible et le raisonnement des chaînes de transition inter-cycles', () => {
    const draws: DrawResult[] = [];
    const totalDraws = 75;

    for (let i = 0; i < totalDraws; i++) {
      const cIdx = Math.floor(i / 10);
      const posInCycle = i % 10;
      let gagnants = [
        ((i * 3) % 60) + 1,
        ((i * 5 + 7) % 60) + 1,
        ((i * 9 + 13) % 60) + 1,
        ((i * 11 + 19) % 60) + 1,
        ((i * 17 + 23) % 60) + 1,
      ];

      // Even cycles have source ball 64; odd cycles respond in early phase with target ball 83
      if (cIdx % 2 === 0 && posInCycle === 4) {
        gagnants[0] = 64;
      }
      if (cIdx % 2 === 1 && posInCycle === 0 && i < 70) {
        gagnants[0] = 83;
      }

      const uniq = Array.from(new Set(gagnants));
      let fill = 61;
      while (uniq.length < 5) {
        if (!uniq.includes(fill)) uniq.push(fill);
        fill++;
      }

      draws.push({
        id: `tr_${i}`,
        draw_name: 'NATIONAL',
        drawName: 'NATIONAL',
        date: `2026-02-${String((i % 28) + 1).padStart(2, '0')}`,
        gagnants: uniq.slice(0, 5),
      });
    }

    const historyNewestFirst = [...draws].reverse();
    const res1 = patternDiscoveryService.discoverPatterns('NATIONAL', historyNewestFirst, {
      cycleLength: 10,
    });
    const res2 = patternDiscoveryService.discoverPatterns('NATIONAL', historyNewestFirst, {
      cycleLength: 10,
    });

    // 100% Determinism check
    expect(res1.recommendedSelection).toEqual(res2.recommendedSelection);
    expect(res1.overallCycleEntropy).toBeGreaterThan(0.5);
    expect(res1.overallCycleEntropy).toBeLessThanOrEqual(1.0);

    // Every transition chain must have non-empty cycleOccurrences and valid reasoning
    res1.topCrossCycleTransitions.forEach((tr) => {
      expect(tr.cycleOccurrences.length).toBe(tr.cycleSupport);
      expect(tr.reasoning).toBeDefined();
      expect(tr.reasoning?.dominantDriver).toBe('MARKOV_TRANSITION');
    });
  });
});
