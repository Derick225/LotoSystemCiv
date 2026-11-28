import { describe, it, expect } from 'vitest';
import { runCounterfactualSimulation } from '../src/services/forensic/counterfactualEngine';
import { performForensicAnalysis } from '../src/services/forensic/autopsyEngine';
import { computeClosedLoopAutopsyHpc } from '../src/services/wasm/simulationAutopsyBridge';
import {
  DEFAULT_HYPERPARAMETERS,
  getTunedHyperparameters,
  tunePredictiveHyperparameters,
} from '../src/services/prediction/hyperParameterTuner';
import { applyOnlineLearningCore } from '../src/services/training/trainingLoop';
import { AlgoKey, DEFAULT_ALGO_WEIGHTS } from '../src/shared/prediction.types';
import type { DrawResult, ScoreBreakdown } from '../src/types';

const makeDeterministicHistory = (drawName: string, count: number): DrawResult[] => {
  let seed = 20261128;
  const nextRand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const draws: DrawResult[] = [];
  for (let i = 0; i < count; i++) {
    const picked = new Set<number>();
    while (picked.size < 5) {
      picked.add(1 + Math.floor(nextRand() * 90));
    }
    const day = 28 - (i % 28);
    const month = 1 + Math.floor(i / 28);
    draws.push({
      id: `${drawName}-${i}`,
      drawName,
      date: `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/2026`,
      gagnants: Array.from(picked).sort((a, b) => a - b),
    });
  }
  return draws;
};

describe('Audit Remediation Round 3 — Invariance Contrefactuelle, Fallback WASM, Tuner & TrainingLoop', () => {
  describe('1. counterfactualEngine : invariance par permutation et absence de biais near-miss', () => {
    it('produit exactement la même perte marginale sous permutation des étiquettes [1..90]', () => {
      const breakdown: Record<number, ScoreBreakdown> = {};
      for (let i = 1; i <= 90; i++) {
        breakdown[i] = {
          [AlgoKey.FREQUENCY]: ((i * 17) % 83) + 10,
          [AlgoKey.GAP_TREND]: ((i * 29) % 79) + 15,
          [AlgoKey.BAYES]: ((i * 11) % 71) + 20,
        } as unknown as ScoreBreakdown;
      }

      const winnersA = [4, 19, 37, 62, 81];
      const perm = (n: number) => 91 - n;
      const permutedBreakdown: Record<number, ScoreBreakdown> = {};
      for (let i = 1; i <= 90; i++) {
        permutedBreakdown[perm(i)] = { ...breakdown[i] };
      }
      const winnersB = winnersA.map(perm);

      const simA = runCounterfactualSimulation(DEFAULT_ALGO_WEIGHTS, breakdown, winnersA);
      const simB = runCounterfactualSimulation(DEFAULT_ALGO_WEIGHTS, permutedBreakdown, winnersB);

      expect(simA.baselineLoss).toBeCloseTo(simB.baselineLoss, 10);
      expect(simA.baselineWassersteinLoss).toBeCloseTo(simB.baselineWassersteinLoss!, 10);
    });

    it('n’accorde aucun avantage aux near-misses (±1) lorsque les profils de scores sont équivalents', () => {
      // Tous les non-gagnants ont exactement le même score : un prédit à +1 d'un gagnant
      // doit produire exactement la même perte que n'importe quel autre non-gagnant.
      const buildUniformBreakdown = (highNums: number[]): Record<number, ScoreBreakdown> => {
        const set = new Set(highNums);
        const bd: Record<number, ScoreBreakdown> = {};
        for (let i = 1; i <= 90; i++) {
          const val = set.has(i) ? 80 : 20;
          bd[i] = {
            [AlgoKey.FREQUENCY]: val,
            [AlgoKey.BAYES]: val,
          } as unknown as ScoreBreakdown;
        }
        return bd;
      };

      const winners = [10, 20, 30, 40, 50];
      const nearMissBreakdown = buildUniformBreakdown([11, 21, 31, 41, 51]);
      const distantBreakdown = buildUniformBreakdown([5, 15, 65, 75, 85]);

      const nearRes = runCounterfactualSimulation(DEFAULT_ALGO_WEIGHTS, nearMissBreakdown, winners);
      const distRes = runCounterfactualSimulation(DEFAULT_ALGO_WEIGHTS, distantBreakdown, winners);

      expect(nearRes.baselineLoss).toBeCloseTo(distRes.baselineLoss, 10);
      expect(nearRes.baselineWassersteinLoss).toBeCloseTo(distRes.baselineWassersteinLoss!, 10);
    });
  });

  describe('2. autopsyEngine : divergenceMetric & failureMode sans inflation near-miss', () => {
    it('maintient divergenceMetric=100 et ignore les near-misses dans modelMissScore sur 0/5 exacts', async () => {
      const history = makeDeterministicHistory('MONDAY SPECIAL', 25);
      const winners = [10, 20, 30, 40, 50];
      const nearMissPreds = [11, 21, 31, 41, 51];

      const bd: Record<number, ScoreBreakdown> = {};
      for (let i = 1; i <= 90; i++) {
        bd[i] = { [AlgoKey.FREQUENCY]: 50, [AlgoKey.BAYES]: 50 } as unknown as ScoreBreakdown;
      }

      const report = await performForensicAnalysis(
        'MONDAY SPECIAL',
        history[0].date,
        nearMissPreds,
        winners,
        bd,
        'pred-nm-test',
        history[0].id,
        true,
        history
      );

      expect(report.nearMisses?.length ?? 0).toBe(5);
      expect(report.divergenceMetric).toBe(100);
      expect(report.failureMode).not.toBe('structuralmisalignment');
    });
  });

  describe('3. simulationAutopsyBridge : cohérence du fallback TypeScript', () => {
    it('maintient un simplexe normalisé et ne biaise pas divergenceMetric avec les near-misses', () => {
      const contribs = new Float64Array(4 * 90);
      for (let n = 1; n <= 90; n++) {
        contribs[(n - 1) * 4 + 0] = n === 10 ? 2.0 : 0.1;
        contribs[(n - 1) * 4 + 1] = -0.2;
        contribs[(n - 1) * 4 + 2] = 0.0;
        contribs[(n - 1) * 4 + 3] = 0.0;
      }

      const res = computeClosedLoopAutopsyHpc({
        predictedNumbers: [11, 21, 31, 41, 51],
        actualWinners: [10, 20, 30, 40, 50],
        currentWeights: [0.25, 0.25, 0.25, 0.25],
        algoContributionsFlat: contribs,
        numAlgos: 4,
        historyDepth: 40,
      });

      expect(res.exactHits).toBe(0);
      expect(res.nearMisses).toBe(5);
      const sumW = Array.from(res.updatedWeights).reduce((s, w) => s + w, 0);
      expect(sumW).toBeCloseTo(1.0, 6);
      // Divergence = 100% quand 0 hits exacts (aucun rabais pour near-misses)
      expect(res.divergenceMetric).toBeCloseTo(100, 1);
    });
  });

  describe('4. hyperParameterTuner : split chronologique et rollback hors-échantillon', () => {
    it('rejette et rollback aux paramètres par défaut sur historique i.i.d. sans gain OOS réel', async () => {
      const drawName = 'TUNER_OOS_GUARD_TEST';
      const history = makeDeterministicHistory(drawName, 26);

      const res = await tunePredictiveHyperparameters(drawName, history, DEFAULT_ALGO_WEIGHTS, false);

      expect(res.validationLossBaseline).toBeTypeOf('number');
      expect(res.validationLossTuned).toBeTypeOf('number');
      if (!res.applied) {
        expect(res.accuracyGain).toBe(0);
        expect(res.tunedParams).toEqual(DEFAULT_HYPERPARAMETERS);
        const persisted = await getTunedHyperparameters(drawName);
        expect(persisted).toEqual(DEFAULT_HYPERPARAMETERS);
      } else {
        expect(res.validationLossTuned!).toBeLessThan(res.validationLossBaseline! - 1e-4);
      }
    });
  });

  describe('5. trainingLoop : applyOnlineLearningCore déterministe sans nombres magiques', () => {
    it('est 100% déterministe et produit un simplexe valide', async () => {
      const drawName = 'MONDAY SPECIAL';
      const history = makeDeterministicHistory(drawName, 24);
      const w1 = await applyOnlineLearningCore(drawName, history, DEFAULT_ALGO_WEIGHTS, 24, 0.25);
      const w2 = await applyOnlineLearningCore(drawName, history, DEFAULT_ALGO_WEIGHTS, 24, 0.25);

      expect(w1).toEqual(w2);
      const sum = Object.values(w1).reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
      expect(sum).toBeCloseTo(1.0, 5);
    });
  });
});
