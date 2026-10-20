import { describe, it, expect } from 'vitest';
import {
  generateProbabilisticScenarioMatrix,
  interpolatePredictionScenarios,
  plattCoherenceFromAverageScore,
  type ScenarioCoherenceCalibration,
} from './predictionScenarios';
import { ScoredNumber } from './scoringEngine';

/**
 * Univers de test : 90 numéros scorés dont l'ORDRE DU TABLEAU est volontairement mélangé
 * (le débruitage PCA et le tamis ADN préservent l'ordre du registre, donc le vecteur reçu
 * n'est jamais trié par score).
 */
const buildScoredUniverse = (): ScoredNumber[] => {
  const items: ScoredNumber[] = [];
  for (let n = 1; n <= 90; n++) {
    items.push({
      num: n,
      score: n, // score croissant avec le numéro : le classement attendu est connu exactement
      breakdown: { frequency: 50, temporal: n } as any,
    });
  }
  return items.reverse();
};

const CALIBRATION: ScenarioCoherenceCalibration = {
  plattSlope: 1.5,
  plattIntercept: -0.4,
  boostingMultiplier: 1.1,
  cyclicModulator: 0.95,
  shrinkageMultiplier: 1.0,
};

const scorerOf = (universe: ScoredNumber[], ticket: number[]): number | null => {
  const map = new Map(universe.map((s) => [s.num, s.score]));
  const measured = ticket.map((n) => map.get(n)).filter((v): v is number => typeof v === 'number');
  const avg = measured.reduce((a, b) => a + b, 0) / measured.length;
  return plattCoherenceFromAverageScore(avg, CALIBRATION);
};

describe('Scenario matrix — sémantique honnête et déterminisme', () => {
  const universe = buildScoredUniverse();
  const selection = [86, 87, 88, 89, 90];
  const explainability: Record<number, any> = {};

  const build = (primary: number | null, calibration?: ScenarioCoherenceCalibration) =>
    generateProbabilisticScenarioMatrix({
      selection,
      denoisedScores: universe,
      explainabilityRecord: explainability,
      primaryCoherence: primary,
      drawName: 'LONACI_10H',
      calibration,
      dnaSieveMetrics: { dominantAlgos: ['frequency', 'markov'], dnaConcordanceMean: 72 },
    });

  it('produit 5 profils aux identifiants déterministes (aucun horodatage)', () => {
    const first = build(64, CALIBRATION);
    const second = build(64, CALIBRATION);

    expect(first.map((s) => s.scenarioId)).toEqual([
      'sim_balanced',
      'sim_defensive',
      'sim_aggressive',
      'sim_recurrent',
      'sim_adversarial',
    ]);
    expect(first.map((s) => s.scenarioId)).toEqual(second.map((s) => s.scenarioId));
    expect(first.map((s) => s.ticket)).toEqual(second.map((s) => s.ticket));
  });

  it('expose la cohérence primaire telle quelle pour le scénario Consensus', () => {
    const scenarios = build(64, CALIBRATION);
    expect(scenarios[0].coherenceScore).toBe(64);
  });

  it('recalcule la cohérence de chaque scénario dérivé depuis ses PROPRES membres (aucun multiplicateur)', () => {
    const scenarios = build(64, CALIBRATION);

    scenarios.slice(1).forEach((sc) => {
      const expected = scorerOf(universe, sc.ticket);
      expect(sc.coherenceScore).toBe(expected);
      // Garde-fou anti-régression : l'ancien comportement dérivait un pourcentage arbitraire
      // de la cohérence primaire (x1.05, x0.95, x0.92, x0.85).
      expect(sc.coherenceScore).not.toBe(Math.min(99, Math.round(64 * 1.05)));
      expect(sc.coherenceScore).not.toBe(Math.round(64 * 0.95));
      expect(sc.coherenceScore).not.toBe(Math.round(64 * 0.92));
      expect(sc.coherenceScore).not.toBe(Math.max(1, Math.round(64 * 0.85)));
    });
  });

  it("n'invente aucun indicateur lorsque le calibrage est indisponible", () => {
    const scenarios = build(null, undefined);
    expect(scenarios[0].coherenceScore).toBeNull();
    scenarios.slice(1).forEach((sc) => {
      expect(sc.coherenceScore).toBeNull();
    });
  });

  it('sélectionne le Top 3 réel du vecteur de scores, même lorsque le tableau reçu est désordonné', () => {
    const scenarios = build(64, CALIBRATION);
    const aggressive = scenarios.find((s) => s.riskProfile === 'AGGRESSIVE')!;
    const top3 = [...universe].sort((a, b) => b.score - a.score).slice(0, 3).map((s) => s.num);

    top3.forEach((num) => {
      expect(aggressive.ticket).toContain(num);
    });
    expect(aggressive.ticket).toHaveLength(5);
    expect(new Set(aggressive.ticket).size).toBe(5);
  });

  it('atténue continûment les leurres machine sans seuil dur (constante => atténuation neutre)', () => {
    const flat = build(64, CALIBRATION).find((s) => s.riskProfile === 'ADVERSARIAL')!;
    const top5 = [...universe].sort((a, b) => b.score - a.score).slice(0, 5).map((s) => s.num);
    // Leurres constants (absents) : l'atténuation est neutralisée, le classement reste le score brut.
    expect(flat.ticket).toEqual(top5.sort((a, b) => a - b));

    const withDecoys: Record<number, any> = {};
    withDecoys[90] = { shapValues: { machineDecoy: 0.9 } };
    withDecoys[89] = { shapValues: { machineDecoy: 0.8 } };
    const attenuated = generateProbabilisticScenarioMatrix({
      selection,
      denoisedScores: universe,
      explainabilityRecord: withDecoys,
      primaryCoherence: 64,
      drawName: 'LONACI_10H',
      calibration: CALIBRATION,
    }).find((s) => s.riskProfile === 'ADVERSARIAL')!;

    expect(attenuated.ticket).not.toContain(90);
    expect(attenuated.ticket).not.toContain(89);
    expect(attenuated.ticket).toHaveLength(5);
  });

  it('interpole avec un indicateur null dès qu’un pôle n’est pas mesuré', () => {
    const scenarios = build(64, CALIBRATION);
    const merged = interpolatePredictionScenarios(scenarios[0], scenarios[1], 0.5);

    expect(merged.ticket).toHaveLength(5);
    expect(new Set(merged.ticket).size).toBe(5);
    expect(merged.interpolatedProbability).toBe(
      Math.round(0.5 * scenarios[0].coherenceScore! + 0.5 * scenarios[1].coherenceScore!)
    );

    const unmeasured = build(null, undefined);
    const mergedNull = interpolatePredictionScenarios(unmeasured[0], unmeasured[1], 0.5);
    expect(mergedNull.interpolatedProbability).toBeNull();
    expect(mergedNull.dominantScenario).toContain('Hybride');
  });

  it('ne nomme un pôle que sur ses bornes exactes', () => {
    const scenarios = build(64, CALIBRATION);
    expect(interpolatePredictionScenarios(scenarios[0], scenarios[1], 0).dominantScenario).toBe(
      scenarios[0].scenarioName
    );
    expect(interpolatePredictionScenarios(scenarios[0], scenarios[1], 1).dominantScenario).toBe(
      scenarios[1].scenarioName
    );
    expect(interpolatePredictionScenarios(scenarios[0], scenarios[1], 0.4).dominantScenario).toContain(
      'Hybride'
    );
  });
});
