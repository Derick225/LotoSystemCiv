import { describe, it, expect } from 'vitest';
import { computeOrthogonalUniquenessWeights, ScoredNumber } from '../services/prediction/scoringEngine';
import { computeSubAlgorithmDivergenceCorrelations } from '../services/prediction/algorithmDivergenceCorrelationService';
import { initializeKalmanState, updateWeightsWithKalmanFilter } from '../services/prediction/kalmanWeightsFilter';
import { driftDetector } from '../services/prediction/conceptDriftDetector';
import {
  computeAdaptiveOutsiderQuota,
  computeConformalCandidateSet,
} from '../services/prediction/combinationGenerator';
import { AlgoKey } from '../shared/prediction.types';
import { DrawResult, AlgoWeights } from '../types';
import { getDefaultWeights } from '../services/prediction/weightsManager';

function buildDeterministicHistory(drawName: string, count: number): DrawResult[] {
  const results: DrawResult[] = [];
  const baseMs = Date.UTC(2026, 7, 1);

  for (let i = 0; i < count; i++) {
    const chronoIdx = count - 1 - i;
    const date = new Date(baseMs + chronoIdx * 86400000).toISOString().slice(0, 10);
    const b1 = ((chronoIdx * 3) % 90) + 1;
    const b2 = ((b1 + 13 - 1) % 90) + 1;
    const b3 = ((b2 + 19 - 1) % 90) + 1;
    const b4 = ((b3 + 23 - 1) % 90) + 1;
    const b5 = ((b4 + 17 - 1) % 90) + 1;
    const used = new Set<number>([b1, b2, b3, b4, b5]);
    let fill = 1;
    while (used.size < 5) {
      used.add(fill++);
    }
    const gagnants = Array.from(used).slice(0, 5);
    const machine = gagnants.map((n) => ((n + 31 - 1) % 90) + 1);

    results.push({
      id: `${drawName}_${chronoIdx}`,
      drawName,
      date,
      gagnants,
      machine,
    });
  }
  return results;
}

describe('Améliorations Avancées de Détection & Intelligence Décisionnelle (Axes 1 à 5)', () => {
  describe('1. Décorrélation Mahalanobis / Anti-Colinéarité (computeOrthogonalUniquenessWeights)', () => {
    it('réduit la sur-pondération des algorithmes colinéaires et valorise un détecteur orthogonal unique', () => {
      const N = 90;
      const baseSignal: number[] = [];
      const twinSignal: number[] = [];
      const orthogonalSignal: number[] = [];

      for (let i = 1; i <= N; i++) {
        const s1 = 50 + 40 * Math.sin((2 * Math.PI * i) / N);
        // Signal jumeau parfaitement colinéaire avec s1 (r = +1.0)
        const s2 = 50 + 40 * Math.sin((2 * Math.PI * i) / N);
        // Signal orthogonal en quadrature de phase (cos vs sin => produit scalaire nul sur une période complète, r = 0.0)
        const sOrth = 50 + 40 * Math.cos((2 * Math.PI * i) / N);

        baseSignal.push(s1);
        twinSignal.push(s2);
        orthogonalSignal.push(sOrth);
      }

      const algoValues: Record<string, number[]> = {
        [AlgoKey.FREQUENCY]: baseSignal,
        [AlgoKey.MARKOV]: twinSignal,
        [AlgoKey.SPECTRAL]: orthogonalSignal,
      };

      const initialWeights: AlgoWeights = {
        [AlgoKey.FREQUENCY]: 1 / 3,
        [AlgoKey.MARKOV]: 1 / 3,
        [AlgoKey.SPECTRAL]: 1 / 3,
      } as AlgoWeights;

      const adjusted = computeOrthogonalUniquenessWeights(algoValues, initialWeights);

      const sumInitial = initialWeights[AlgoKey.FREQUENCY]! + initialWeights[AlgoKey.MARKOV]! + initialWeights[AlgoKey.SPECTRAL]!;
      const sumAdjusted = adjusted[AlgoKey.FREQUENCY]! + adjusted[AlgoKey.MARKOV]! + adjusted[AlgoKey.SPECTRAL]!;

      // Conservation exacte de la masse totale
      expect(sumAdjusted).toBeCloseTo(sumInitial, 6);

      // Le détecteur orthogonal (SPECTRAL) obtient un poids effectif supérieur aux deux jumeaux colinéaires
      expect(adjusted[AlgoKey.SPECTRAL]).toBeGreaterThan(adjusted[AlgoKey.FREQUENCY]!);
      expect(adjusted[AlgoKey.SPECTRAL]).toBeGreaterThan(adjusted[AlgoKey.MARKOV]!);
      expect(adjusted[AlgoKey.FREQUENCY]).toBeCloseTo(adjusted[AlgoKey.MARKOV]!, 6);
    });
  });

  describe('2. Audit de Divergence par Évaluation Causale Réelle (computeSubAlgorithmDivergenceCorrelations)', () => {
    it('évalue causalement les 24 plugins sur les sous-historiques et mesure les erreurs et near-misses sur Z_90', async () => {
      const history = buildDeterministicHistory('Fortune Thursday', 22);
      const weights = getDefaultWeights();

      const heatmap = await computeSubAlgorithmDivergenceCorrelations('Fortune Thursday', history, weights);

      expect(heatmap.drawName).toBe('Fortune Thursday');
      expect(heatmap.correlationMetrics.length).toBeGreaterThanOrEqual(20);
      expect(heatmap.crossCorrelations.length).toBeGreaterThan(100);

      for (const m of heatmap.correlationMetrics) {
        expect(m.wassersteinLoss).toBeGreaterThanOrEqual(0);
        expect(m.wassersteinLoss).toBeLessThanOrEqual(1);
        expect(m.falsePositiveRate).toBeGreaterThanOrEqual(0);
        expect(m.falsePositiveRate).toBeLessThanOrEqual(1);
        expect(m.missedSignalRate).toBeGreaterThanOrEqual(0);
        expect(m.missedSignalRate).toBeLessThanOrEqual(1);
        expect(m.nearMissSensitivity).toBeGreaterThanOrEqual(0);
        expect(m.nearMissSensitivity).toBeLessThanOrEqual(1);
        expect(m.toxicityIndex).toBeGreaterThanOrEqual(0);
        expect(m.toxicityIndex).toBeLessThanOrEqual(100);
        expect(m.drawDivergences.length).toBe(10);
      }
    });
  });

  describe('3. Filtre de Kalman Complet sous Forme de Joseph (Covariance Croisée K x K)', () => {
    it('maintient une matrice de covariance K x K symétrique définie positive avec termes hors-diagonale actifs', () => {
      const baseWeights = getDefaultWeights();
      initializeKalmanState('Reveil_Kalman_Joseph', baseWeights);

      // Simulation de 3 pas de mise à jour où FREQUENCY et MARKOV co-varient à la hausse
      const step1Weights = { ...baseWeights, [AlgoKey.FREQUENCY]: 0.14, [AlgoKey.MARKOV]: 0.13 };
      const res1 = updateWeightsWithKalmanFilter({
        drawName: 'Reveil_Kalman_Joseph',
        measuredWeights: step1Weights,
        predictionError: 0.25,
      });

      const step2Weights = { ...baseWeights, [AlgoKey.FREQUENCY]: 0.18, [AlgoKey.MARKOV]: 0.16, [AlgoKey.GAPS]: 0.01 };
      const res2 = updateWeightsWithKalmanFilter({
        drawName: 'Reveil_Kalman_Joseph',
        measuredWeights: step2Weights,
        predictionError: 0.18,
      });

      expect(res1.traceCovariance).toBeGreaterThan(0);
      expect(res2.traceCovariance).toBeGreaterThan(0);
      // Les termes croisés hors-diagonale P_{i,j} (i != j) sont activés par le produit extérieur d'innovation de Sage-Husa
      expect(res2.offDiagonalNorm).toBeGreaterThan(0);

      const cov = res2.kalmanState.covarianceMatrix;
      const K = cov.length;
      for (let i = 0; i < K; i++) {
        expect(cov[i][i]).toBeGreaterThan(0);
        for (let j = i + 1; j < K; j++) {
          expect(cov[i][j]).toBeCloseTo(cov[j][i], 10);
        }
      }
    });
  });

  describe('4. Détection de Dérive par Divergence de Jensen-Shannon Lissée & Wasserstein Circulaire Z_90', () => {
    it('garantit la symétrie, la bornitude [0, 1] de Jensen-Shannon et la périodicité circulaire Z_90 de Wasserstein', () => {
      const distA = new Float64Array(91);
      const distB = new Float64Array(91);
      const distC = new Float64Array(91);

      // distA concentrée en 1, distB concentrée en 90 (voisins immédiats sur le cercle Z_90 !), distC concentrée en 45 (antipode)
      distA[1] = 1.0;
      distB[90] = 1.0;
      distC[45] = 1.0;

      const jsAB = driftDetector.computeJensenShannonDivergence(distA, distB);
      const jsBA = driftDetector.computeJensenShannonDivergence(distB, distA);
      const jsAA = driftDetector.computeJensenShannonDivergence(distA, distA);

      expect(jsAA).toBeCloseTo(0, 8);
      expect(jsAB).toBeCloseTo(jsBA, 10);
      expect(jsAB).toBeGreaterThan(0);
      expect(jsAB).toBeLessThanOrEqual(1.0);

      // Sur le tore circulaire Z_90, la distance de Wasserstein entre 1 et 90 (écart 1) est minuscule devant 1 et 45 (écart 44)
      const wCircularNeighbor = driftDetector.computeCircularWassersteinDistance(distA, distB);
      const wCircularAntipode = driftDetector.computeCircularWassersteinDistance(distA, distC);

      expect(wCircularNeighbor).toBeLessThan(0.05);
      expect(wCircularAntipode).toBeGreaterThan(0.90);
      expect(wCircularNeighbor).toBeLessThan(wCircularAntipode);
    });
  });

  describe('5. Calibration Conforme (Conformal Prediction) & Quota Dynamique d’Outsiders', () => {
    it('augmente continûment le quota d’outsiders et l’enveloppe conforme en régime d’entropie/drift élevé', () => {
      const quotaStable = computeAdaptiveOutsiderQuota(1.0, 0.25, 0.72, 5);
      const quotaChaoticDrift = computeAdaptiveOutsiderQuota(1.0, 0.88, 0.35, 85);

      expect(quotaChaoticDrift).toBeGreaterThan(quotaStable);
      expect(quotaStable).toBeGreaterThanOrEqual(0.25);
      expect(quotaChaoticDrift).toBeLessThanOrEqual(2.5);

      const mockScores: ScoredNumber[] = Array.from({ length: 90 }, (_, idx) => ({
        num: idx + 1,
        score: 100 - idx * 0.9,
        breakdown: {} as any,
      }));
      const ticket = [1, 2, 3, 4, 5];

      const conformalStable = computeConformalCandidateSet(mockScores, ticket, 0.20, 0.75, 5);
      const conformalTurbulent = computeConformalCandidateSet(mockScores, ticket, 0.90, 0.32, 90);

      // Les candidats SONT l'enveloppe conforme : taille = pool conforme du régime, borné [8, 15]
      expect(conformalStable.candidates).toHaveLength(conformalStable.conformalPoolSize);
      expect(conformalTurbulent.candidates).toHaveLength(conformalTurbulent.conformalPoolSize);
      expect(conformalStable.candidates.length).toBeGreaterThanOrEqual(8);
      expect(conformalTurbulent.candidates.length).toBeLessThanOrEqual(15);
      // En régime turbulent/drifté, le risque alpha est abaissé (couverture 1 - alpha plus large)
      expect(conformalTurbulent.coverageAlpha).toBeLessThan(conformalStable.coverageAlpha);
      expect(conformalTurbulent.conformalPoolSize).toBeGreaterThanOrEqual(conformalStable.conformalPoolSize);
    });
  });
});
