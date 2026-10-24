import { describe, it, expect } from 'vitest';
import {
  deriveSkillShrinkage,
  shrinkProbabilityVector,
  summarizePredictionEdge,
} from '../src/services/prediction/empiricalSkillCalibration';
import {
  DRAW_DOMAIN_SIZE,
  DRAW_PICK_SIZE,
  UNIFORM_BRIER_REFERENCE,
} from '../src/shared/drawTheory';

const uniformVector = (): number[] =>
  Array.from({ length: DRAW_DOMAIN_SIZE }, () => DRAW_PICK_SIZE / DRAW_DOMAIN_SIZE);

describe('deriveSkillShrinkage — empirique Bayes sans seuil binaire', () => {
  it('retourne λ = 0 sans aucune preuve out-of-fold', () => {
    const estimate = deriveSkillShrinkage({});
    expect(estimate.shrinkage).toBe(0);
    expect(estimate.source).toBe('none');
    expect(estimate.evidenceDraws).toBe(0);
    expect(estimate.brierReference).toBeCloseTo(UNIFORM_BRIER_REFERENCE, 12);
  });

  it('retourne λ = 0 quand le BSS mesuré est nul ou négatif', () => {
    expect(deriveSkillShrinkage({ holdoutBrierSkillScore: 0, holdoutDraws: 500 }).shrinkage).toBe(0);
    expect(deriveSkillShrinkage({ holdoutBrierSkillScore: -0.3, holdoutDraws: 500 }).shrinkage).toBe(0);
    expect(
      deriveSkillShrinkage({ brierSkillScore: -0.2, evaluatedWindows: 200 }).shrinkage
    ).toBe(0);
  });

  it('applique la formule λ = μ₊²/(μ₊²+σ²) sur le bootstrap mesuré', () => {
    const estimate = deriveSkillShrinkage({
      evaluatedWindows: 100,
      blockBootstrapBssMean: 0.04,
      blockBootstrapBssStd: 0.02,
    });
    expect(estimate.source).toBe('block_bootstrap');
    expect(estimate.pointEstimate).toBeCloseTo(0.04, 12);
    expect(estimate.uncertainty).toBeCloseTo(0.02, 12);
    expect(estimate.shrinkage).toBeCloseTo(0.8, 12);
  });

  it('priorise la holdout sur le bootstrap et le walk-forward', () => {
    const estimate = deriveSkillShrinkage({
      holdoutBrierSkillScore: 0.1,
      holdoutDraws: 120,
      evaluatedWindows: 900,
      blockBootstrapBssMean: 0.6,
      blockBootstrapBssStd: 0.01,
      brierSkillScore: 0.5,
    });
    expect(estimate.source).toBe('holdout');
    expect(estimate.pointEstimate).toBeCloseTo(0.1, 12);
    expect(estimate.evidenceDraws).toBe(120);
  });

  it('est monotone croissante en BSS et décroissante en incertitude', () => {
    const low = deriveSkillShrinkage({
      evaluatedWindows: 100,
      blockBootstrapBssMean: 0.02,
      blockBootstrapBssStd: 0.02,
    });
    const high = deriveSkillShrinkage({
      evaluatedWindows: 100,
      blockBootstrapBssMean: 0.08,
      blockBootstrapBssStd: 0.02,
    });
    expect(high.shrinkage).toBeGreaterThan(low.shrinkage);

    const noisy = deriveSkillShrinkage({
      evaluatedWindows: 100,
      blockBootstrapBssMean: 0.04,
      blockBootstrapBssStd: 0.08,
    });
    expect(noisy.shrinkage).toBeLessThan(high.shrinkage);
  });

  it('converge vers λ → 1 quand la preuve est abondante et précise', () => {
    const estimate = deriveSkillShrinkage({
      holdoutBrierSkillScore: 0.5,
      holdoutDraws: 1_000_000,
      blockBootstrapBssStd: 1e-4,
    });
    expect(estimate.shrinkage).toBeGreaterThan(0.999);
  });

  it('borne le BSS au domaine du moteur [−1, 1]', () => {
    const estimate = deriveSkillShrinkage({
      holdoutBrierSkillScore: 12,
      holdoutDraws: 100,
      blockBootstrapBssStd: 0.1,
    });
    expect(estimate.pointEstimate).toBe(1);
    expect(estimate.shrinkage).toBeLessThanOrEqual(1);
  });
});

describe('shrinkProbabilityVector — shrinkage log-softmax continu', () => {
  it('produit exactement l’uniforme de même masse à λ = 0', () => {
    const vector = uniformVector();
    vector[0] = 2.0;
    vector[1] = 0.0;
    const mass = vector.reduce((a, b) => a + b, 0);
    const shrunk = shrinkProbabilityVector(vector, 0);
    for (const p of shrunk) {
      expect(p).toBeCloseTo(mass / DRAW_DOMAIN_SIZE, 12);
    }
    expect(shrunk.reduce((a, b) => a + b, 0)).toBeCloseTo(mass, 12);
  });

  it('conserve le vecteur à λ = 1', () => {
    const vector = uniformVector();
    vector[3] = 1.2;
    vector[4] = 0.01;
    const mass = vector.reduce((a, b) => a + b, 0);
    const shrunk = shrinkProbabilityVector(vector, 1);
    for (let i = 0; i < vector.length; i++) {
      expect(shrunk[i]).toBeCloseTo(vector[i], 12);
    }
    expect(shrunk.reduce((a, b) => a + b, 0)).toBeCloseTo(mass, 12);
  });

  it('préserve la masse totale et l’ordre relatif pour 0 < λ < 1', () => {
    const vector = uniformVector();
    vector[10] = 0.9;
    vector[20] = 0.2;
    vector[30] = 0.05;
    const mass = vector.reduce((a, b) => a + b, 0);
    const shrunk = shrinkProbabilityVector(vector, 0.4);

    expect(shrunk.reduce((a, b) => a + b, 0)).toBeCloseTo(mass, 12);
    expect(shrunk[10]).toBeGreaterThan(shrunk[20]);
    expect(shrunk[20]).toBeGreaterThan(shrunk[30]);
    expect(shrunk[10]).toBeLessThan(vector[10]);
    expect(shrunk[30]).toBeGreaterThan(vector[30]);
  });

  it('est déterministe et idempotent à λ = 0', () => {
    const vector = uniformVector();
    vector[7] = 1.5;
    const a = shrinkProbabilityVector(vector, 0.3);
    const b = shrinkProbabilityVector(vector, 0.3);
    expect(a).toEqual(b);

    const first = shrinkProbabilityVector(vector, 0);
    const second = shrinkProbabilityVector(first, 0);
    for (let i = 0; i < first.length; i++) {
      expect(second[i]).toBeCloseTo(first[i], 15);
    }
  });

  it('gère un vecteur dégénéré sans produire NaN', () => {
    const shrunk = shrinkProbabilityVector([0, 0, 0], 0.5);
    expect(shrunk.every((p) => Number.isFinite(p) && p >= 0)).toBe(true);
  });
});

describe('summarizePredictionEdge — métriques honnêtes', () => {
  it('rapporte un lift de 1 pour une distribution uniforme', () => {
    const summary = summarizePredictionEdge(uniformVector(), [1, 2, 3, 4, 5]);
    expect(summary.expectedHitsTopK).toBeCloseTo(25 / 90, 12);
    expect(summary.uniformExpectedHitsTopK).toBeCloseTo(25 / 90, 12);
    expect(summary.liftVsUniform).toBeCloseTo(1, 12);
    expect(summary.maxLiftVsUniform).toBeCloseTo(1, 12);
  });

  it('mesure le lift du top-K quand la distribution est concentrée', () => {
    const vector = uniformVector();
    vector[0] = 1.5;
    const summary = summarizePredictionEdge(vector, [1, 2, 3, 4, 5]);
    expect(summary.liftVsUniform).toBeGreaterThan(1);
    expect(summary.maxLiftVsUniform).toBeGreaterThan(1);
  });

  it('ignore les numéros hors domaine et les doublons', () => {
    const summary = summarizePredictionEdge(uniformVector(), [0, 91, 1, 1]);
    expect(summary.topK).toBe(1);
    expect(summary.expectedHitsTopK).toBeCloseTo(DRAW_PICK_SIZE / DRAW_DOMAIN_SIZE, 12);
  });
});
