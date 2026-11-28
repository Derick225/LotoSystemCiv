import { describe, it, expect } from 'vitest';
import {
  computeContinuousKellyAllocation,
  computeHypergeometricNullProbability,
} from '../src/components/KellyCalculator';
import { computeMarkowitzKellyPortfolio } from '../src/services/prediction/markowitzKellyPortfolioService';
import { projectWeightsWithContinuousProofShrinkage } from '../src/services/prediction/closedLoopAutopsyService';
import { DNAOptimizer, type XAPExplanation } from '../src/services/training/DNAOptimizer';
import {
  runNeuralSelfOptimization,
  runNeuralSelfOptimizationAsync,
} from '../src/services/prediction/neuralSelfOptimizationService';
import { AlgoKey, DEFAULT_ALGO_WEIGHTS } from '../src/shared/prediction.types';
import type { DrawResult, PlatinumScenario } from '../src/types';
import type { AlgoProofMetric } from '../src/services/prediction/weightsManager';

const makeDraw = (idx: number, gagnants: number[]): DrawResult => ({
  id: `d-${idx}`,
  drawName: 'MONDAY SPECIAL',
  date: `${String((idx % 28) + 1).padStart(2, '0')}/01/2026`,
  gagnants,
});

describe('Audit Remediation Round 2 — Garde-fous Statistiques & Optimiseurs', () => {
  describe('1. Kelly & Markowitz-Kelly calibration strictes', () => {
    it('ne recommande jamais de mise sans preuve OOS calibrée (fallback confiance supprimé)', () => {
      const regimes = [
        { regime: 'trend', hurst: 0.78, entropy: 0.25, volatility: 0.1 },
        { regime: 'chaotic', hurst: 0.25, entropy: 0.9, volatility: 0.8 },
      ];

      for (const regime of regimes) {
        const res = computeContinuousKellyAllocation({
          confidence: 99,
          bankroll: 100000,
          gameMode: 'STANDARD',
          selectedBetType: '1N',
          portfolioMode: false,
          regime,
        });
        expect(res.hasProvenEdge).toBe(false);
        expect(res.betAmount).toBe(0);
        expect(res.kellyFraction).toBe(0);
        expect(res.winProbability).toBeCloseTo(
          computeHypergeometricNullProbability(1) * 100,
          3
        );
      }
    });

    it('applique la cote officielle 2N, l’échelle Sharpe cohérente, le simplexe MVP exact et le plafond strict <= 10%', () => {
      const scenarios: PlatinumScenario[] = [
        { id: 's1', name: 'S1', description: 'Scénario 1', numbers: [1, 2, 3, 4, 5], relativeIndex: 0, risk: 'LOW', color: '#10b981' },
        { id: 's2', name: 'S2', description: 'Scénario 2', numbers: [6, 7, 8, 9, 10], relativeIndex: 50, risk: 'MEDIUM', color: '#6366f1' },
        { id: 's3', name: 'S3', description: 'Scénario 3', numbers: [11, 12, 13, 14, 15], relativeIndex: 100, risk: 'HIGH', color: '#06b6d4' },
        { id: 's4', name: 'S4', description: 'Scénario 4', numbers: [16, 17, 18, 19, 20], relativeIndex: 80, risk: 'HIGH', color: '#f59e0b' },
      ];

      // H0 sans preuve -> budget 0 FCFA
      const h0Report = computeMarkowitzKellyPortfolio({
        scenarios,
        totalBankroll: 10000,
        unitBet: 200,
      });
      expect(h0Report.hasProvenEdge).toBe(false);
      expect(h0Report.totalBudgetDistributed).toBe(0);
      expect(h0Report.portfolioExpectedReturn).toBeCloseTo(240 * (10 / 4005) - 1, 3);

      // Avec preuve calibrée et petite bankroll (4 scénarios, bankroll 1500 => cap 150 FCFA < 4*200)
      const edgeReport = computeMarkowitzKellyPortfolio({
        scenarios,
        totalBankroll: 1500,
        unitBet: 50,
        empiricalSkillShrinkage: 0.85,
        empiricalLift: 2.5,
      });
      expect(edgeReport.hasProvenEdge).toBe(true);
      expect(edgeReport.totalBudgetDistributed).toBeLessThanOrEqual(1500 * 0.1 + 1e-9);
      const sumW = edgeReport.allocations.reduce((s, a) => s + a.markowitzWeight, 0);
      expect(sumW).toBeCloseTo(1.0, 6);
      expect(Number.isFinite(edgeReport.portfolioSharpeRatio)).toBe(true);
      // Sharpe doit être d'ordre réaliste (pas gonflé x240)
      expect(Math.abs(edgeReport.portfolioSharpeRatio)).toBeLessThan(1.0);
    });
  });

  describe('2. Shrinkage de preuve continu (closedLoopAutopsyService)', () => {
    it('plafonne la hausse d’un gène crédible sans contournement +0.5*cred et freine les baisses', () => {
      const algoKeys = [AlgoKey.FREQUENCY, AlgoKey.GAPS, AlgoKey.SPECTRAL, AlgoKey.BAYES];
      const base: Record<string, number> = {};
      algoKeys.forEach((k) => {
        base[k] = 0.25;
      });

      const proofMap = {
        [AlgoKey.FREQUENCY]: { hasProof: true, proofScore: 4.5, qValue: 0.001, shrinkageFactor: 0.9 },
        [AlgoKey.GAPS]: { hasProof: true, proofScore: 0.5, qValue: 0.5, shrinkageFactor: 0.2 },
        [AlgoKey.SPECTRAL]: { hasProof: false, proofScore: 0, qValue: 1, shrinkageFactor: 0 },
        [AlgoKey.BAYES]: { hasProof: true, proofScore: 4.0, qValue: 0.002, shrinkageFactor: 0.85 },
      } as unknown as Record<AlgoKey, AlgoProofMetric>;

      // Tenter une hausse massive sur FREQUENCY (crédible) et une coupe sévère sur BAYES (crédible)
      const candidate: Record<string, number> = {
        [AlgoKey.FREQUENCY]: 0.95,
        [AlgoKey.GAPS]: 0.25,
        [AlgoKey.SPECTRAL]: 0.25,
        [AlgoKey.BAYES]: 0.01,
      };

      const projected = projectWeightsWithContinuousProofShrinkage(
        candidate,
        base as any,
        proofMap
      );

      // Le plafond sans +0.5*cred vaut ~ base + cred*(2*meanBase - base) + span -> bien inférieur à 0.95
      expect(projected[AlgoKey.FREQUENCY]).toBeLessThan(0.55);
      // Un gène crédible fortement attaqué subit un freinage (reste au-dessus de son plancher brut)
      expect(projected[AlgoKey.BAYES]).toBeGreaterThan(0.05);
      const sum = Object.values(projected).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 5);
    });
  });

  describe('3. DNAOptimizer sans biais d’ordre 1..90 ni Shapley inventé', () => {
    const keys = [AlgoKey.FREQUENCY, AlgoKey.SPECTRAL, AlgoKey.BAYES, AlgoKey.MARKOV];
    const optimizer = new DNAOptimizer(keys);

    it('reste invariant aux permutations des étiquettes 1..90 (aucun bonus near-miss 41 vs 42)', () => {
      const drawsNear: { gagnants: number[] }[] = [];
      const drawsFar: { gagnants: number[] }[] = [];
      const bdNear: Record<number, Record<number, Record<AlgoKey, number>>> = {};
      const bdFar: Record<number, Record<number, Record<AlgoKey, number>>> = {};

      for (let d = 0; d < 6; d++) {
        // Pour drawsNear: le gagnant est 42, FREQUENCY met 1.0 sur 41 (voisin), BAYES met 1.0 sur 42
        drawsNear.push({ gagnants: [42] });
        // Pour drawsFar: permutation exacte des vecteurs de score entre 41 et 87
        drawsFar.push({ gagnants: [42] });

        bdNear[d] = {};
        bdFar[d] = {};
        for (let n = 1; n <= 90; n++) {
          bdNear[d][n] = {
            [AlgoKey.FREQUENCY]: n === 41 ? 1.0 : 0.1,
            [AlgoKey.SPECTRAL]: 0.1,
            [AlgoKey.BAYES]: n === 42 ? 1.0 : 0.1,
            [AlgoKey.MARKOV]: 0.1,
          } as Record<AlgoKey, number>;

          bdFar[d][n] = {
            [AlgoKey.FREQUENCY]: n === 87 ? 1.0 : 0.1,
            [AlgoKey.SPECTRAL]: 0.1,
            [AlgoKey.BAYES]: n === 42 ? 1.0 : 0.1,
            [AlgoKey.MARKOV]: 0.1,
          } as Record<AlgoKey, number>;
        }
      }

      const init = {
        [AlgoKey.FREQUENCY]: 0.25,
        [AlgoKey.SPECTRAL]: 0.25,
        [AlgoKey.BAYES]: 0.25,
        [AlgoKey.MARKOV]: 0.25,
      } as any;

      const optNear = optimizer.optimizeWeightsCoordinateDescent(init, drawsNear, bdNear, 2);
      const optFar = optimizer.optimizeWeightsCoordinateDescent(init, drawsFar, bdFar, 2);

      for (const k of keys) {
        expect(optNear[k]).toBeCloseTo(optFar[k], 6);
      }
      // BAYES prédit 42 (gagnant) et doit dominer
      expect(optNear[AlgoKey.BAYES]).toBeGreaterThan(optNear[AlgoKey.FREQUENCY]);
    });

    it('calcule des valeurs de Shapley linéaires exactes (proportionnelles à dna[a])', () => {
      const dna = new Float32Array([0.4, 0.3, 0.2, 0.1]);
      const xaps = optimizer.generateXAP(
        {
          numbers: [12],
          dnaMatrix: [dna],
          synergyVector: dna,
          distance: 0,
          diversityScore: 0,
        },
        [12]
      );

      expect(xaps[0].shapleyValues![AlgoKey.FREQUENCY]).toBeCloseTo(40, 5);
      expect(xaps[0].shapleyValues![AlgoKey.SPECTRAL]).toBeCloseTo(30, 5);
      expect(xaps[0].shapleyValues![AlgoKey.BAYES]).toBeCloseTo(20, 5);
      expect(xaps[0].shapleyValues![AlgoKey.MARKOV]).toBeCloseTo(10, 5);
    });

    it('compare gagnants vs non-gagnants dans calibrateDNAFromWinningComposition (neutre sous hasard pur)', () => {
      const weights = {
        [AlgoKey.FREQUENCY]: 0.25,
        [AlgoKey.SPECTRAL]: 0.25,
        [AlgoKey.BAYES]: 0.25,
        [AlgoKey.MARKOV]: 0.25,
      } as any;

      // Même vecteur haute amplitude sur gagnants et non-gagnants -> contraste nul -> 0 ajustement
      const commonVec = {
        [AlgoKey.FREQUENCY]: 100,
        [AlgoKey.SPECTRAL]: 10,
        [AlgoKey.BAYES]: 10,
        [AlgoKey.MARKOV]: 10,
      } as Record<AlgoKey, number>;

      const xapEqual: XAPExplanation[] = [
        {
          number: 5,
          dominantAlgo: AlgoKey.FREQUENCY,
          contributionPercentage: 76.9,
          dnaVector: commonVec,
        },
      ];

      expect(optimizer.calibrateDNAFromWinningComposition(weights, xapEqual)).toEqual([]);
      expect(
        optimizer.calibrateDNAFromWinningComposition(weights, xapEqual, [commonVec, commonVec])
      ).toEqual([]);

      // Enrichissement réel de BAYES chez les gagnants vs non-gagnants
      const xapEnriched: XAPExplanation[] = [
        {
          number: 5,
          dominantAlgo: AlgoKey.BAYES,
          contributionPercentage: 60,
          dnaVector: {
            [AlgoKey.FREQUENCY]: 0.2,
            [AlgoKey.SPECTRAL]: 0.1,
            [AlgoKey.BAYES]: 0.6,
            [AlgoKey.MARKOV]: 0.1,
          } as Record<AlgoKey, number>,
        },
      ];
      const nonWinEnriched = [
        new Float32Array([0.4, 0.2, 0.1, 0.3]),
        new Float32Array([0.4, 0.2, 0.1, 0.3]),
      ];

      const adj = optimizer.calibrateDNAFromWinningComposition(
        weights,
        xapEnriched,
        nonWinEnriched
      );
      const bayesAdj = adj.find((a) => a.algo === AlgoKey.BAYES);
      const freqAdj = adj.find((a) => a.algo === AlgoKey.FREQUENCY);
      expect(bayesAdj?.proposedWeightChange).toBeGreaterThan(0);
      expect(freqAdj?.proposedWeightChange).toBeLessThan(0);
    });

    it('borne l’ajustement de Kalman indépendamment de l’échelle des scores', () => {
      const weights = {
        [AlgoKey.FREQUENCY]: 0.25,
        [AlgoKey.SPECTRAL]: 0.25,
        [AlgoKey.BAYES]: 0.25,
        [AlgoKey.MARKOV]: 0.25,
      } as any;

      const vectors = [
        new Float32Array([100, 100, 100, 100]),
        new Float32Array([120, 80, 100, 100]),
        new Float32Array([180, 50, 100, 100]),
        new Float32Array([250, 30, 100, 100]),
      ];
      const profile = optimizer.extractTargetDNAProfile(vectors, 4);
      const corrected = optimizer.applyKalmanDriftCorrection(weights, profile, vectors);
      const sum = Object.values(corrected).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 5);
      // Aucun poids ne s'effondre ni n'explose malgré des vecteurs d'amplitude ~100
      for (const k of keys) {
        expect(corrected[k]).toBeGreaterThan(0.05);
        expect(corrected[k]).toBeLessThan(0.5);
      }
    });
  });

  describe('4. neuralSelfOptimizationService — validation honnête & early stopping', () => {
    it('refuse d’aliaser train en validation quand moins de 4 tenseurs existent (< 4)', async () => {
      const smallHistory: DrawResult[] = Array.from({ length: 6 }, (_, i) =>
        makeDraw(i + 1, [(i * 5 + 1) % 90 + 1, 10, 20, 30, 40])
      );

      // 6 tirages et pastSubset >= 3 => 3 tenseurs (< 4)
      const res = runNeuralSelfOptimization(
        'MONDAY SPECIAL',
        smallHistory,
        DEFAULT_ALGO_WEIGHTS,
        { epochs: 5, batchDepth: 10 }
      );

      expect(res.batchSize).toBeLessThan(4);
      expect(res.isValidationAvailable).toBe(false);
      expect(res.validationSampleCount).toBe(0);
      expect(res.validationLossInitial).toBeUndefined();
      expect(res.validationLossFinal).toBeUndefined();
      expect(res.convergenceStatus).toBe('INSUFFICIENT_VALIDATION');
    });

    it('exécute runNeuralSelfOptimizationAsync avec progression réelle par époque et rollback au meilleur epoch', async () => {
      const longHistory: DrawResult[] = Array.from({ length: 18 }, (_, i) =>
        makeDraw(i + 1, [
          ((i * 3) % 90) + 1,
          ((i * 7 + 12) % 90) + 1,
          ((i * 11 + 25) % 90) + 1,
          ((i * 17 + 41) % 90) + 1,
          ((i * 23 + 67) % 90) + 1,
        ])
      );

      const seenEpochs: number[] = [];
      const asyncRes = await runNeuralSelfOptimizationAsync(
        'MONDAY SPECIAL',
        longHistory,
        DEFAULT_ALGO_WEIGHTS,
        { epochs: 10, batchDepth: 12 },
        (ep) => {
          seenEpochs.push(ep);
        }
      );

      expect(asyncRes.isValidationAvailable).toBe(true);
      expect(asyncRes.validationSampleCount).toBeGreaterThan(0);
      expect(asyncRes.bestEpoch).toBeGreaterThanOrEqual(0);
      expect(asyncRes.bestEpoch).toBeLessThanOrEqual(asyncRes.epochsCompleted);
      expect(seenEpochs.length).toBe(asyncRes.epochsCompleted);
      if (asyncRes.validationLossInitial !== undefined && asyncRes.validationLossFinal !== undefined) {
        // Avec rollback au meilleur epoch (0 = poids initiaux), la perte de validation finale ne doit jamais dépasser l'initiale
        expect(asyncRes.validationLossFinal).toBeLessThanOrEqual(
          asyncRes.validationLossInitial + 1e-5
        );
      }
    });
  });
});
