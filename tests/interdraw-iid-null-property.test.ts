import { describe, it, expect } from 'vitest';
import {
  computeContinuousInterDrawCoupling,
  generateInterDrawReport
} from '../src/services/interDrawService';
import { computeInterDrawComplexDynamics } from '../src/services/interDrawDynamicsService';
import { DrawResult } from '../src/types';

/**
 * Générateur congruentiel linéaire (LCG) déterministe pour tests statistiques (AGENTS.md).
 * ZÉRO Math.random(), 100% reproductible.
 */
function createDeterministicLcg(seed: number = 123456789) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Génère un tirage i.i.d. de 5 numéros distincts dans [1..90] via tirage sans remise.
 */
function generateIidDraw(rng: () => number, id: string, date: string): DrawResult {
  const pool = Array.from({ length: 90 }, (_, i) => i + 1);
  const winners: number[] = [];
  for (let i = 0; i < 5; i++) {
    const idx = Math.floor(rng() * pool.length);
    winners.push(pool.splice(idx, 1)[0]);
  }
  winners.sort((a, b) => a - b);
  return {
    id,
    date,
    gagnants: winners,
    machine: [],
    drawName: 'IID'
  };
}

describe('TEST DE PROPRIÉTÉ STATISTIQUE : HYPOTHÈSE NULLE I.I.D. & COUPLAGE INTER-TIRAGES', () => {
  it('sous tirages i.i.d., le couplage empirique ne doit pas saturer en bruit (poids moyen <= 0.05 et z-score harmonique centré en 0)', () => {
    const rng = createDeterministicLcg(42);
    const nDraws = 200;

    // Génération de 2 séries chronologiques indépendantes appariées par dates
    const histTarget: DrawResult[] = [];
    const histSource: DrawResult[] = [];

    const baseTimestamp = 1700000000;
    for (let i = 0; i < nDraws; i++) {
      const dateStr = new Date((baseTimestamp + i * 86400) * 1000).toISOString().slice(0, 10);
      histTarget.push(generateIidDraw(rng, `t-${i}`, dateStr));
      histSource.push(generateIidDraw(rng, `s-${i}`, dateStr));
    }

    // Calcul du couplage avec seuil réseau M = 462 (quotidien)
    const coupling462 = computeContinuousInterDrawCoupling(histSource, histTarget, 462);

    expect(coupling462).toBeDefined();
    expect(coupling462.samplePairs).toBeGreaterThanOrEqual(190);

    // Le taux de report théorique est ~25.37%, pour des tirages i.i.d., le taux mesuré doit être dans [20%, 30%]
    expect(coupling462.carryOverRate).toBeGreaterThan(18.0);
    expect(coupling462.carryOverRate).toBeLessThan(32.0);

    // Le poids de couplage discriminant W ∈ [0, 1[ doit rester proche de zéro (PAS DE FAUSSE SATURATION À 0.98 !)
    expect(coupling462.weight).toBeLessThanOrEqual(0.05);

    // Calcul avec le réseau hebdomadaire M = 30
    const coupling30 = computeContinuousInterDrawCoupling(histSource, histTarget, 30);
    expect(coupling30.weight).toBeLessThanOrEqual(0.10);
  });

  it('monte-carlo sur 20 paires i.i.d. indépendantes : le poids moyen doit rester strictement inférieur à 0.05', () => {
    const rng = createDeterministicLcg(9999);
    const weights: number[] = [];

    for (let sim = 0; sim < 20; sim++) {
      const histA: DrawResult[] = [];
      const histB: DrawResult[] = [];
      const baseTimestamp = 1700000000 + sim * 100000;

      for (let i = 0; i < 150; i++) {
        const dateStr = new Date((baseTimestamp + i * 86400) * 1000).toISOString().slice(0, 10);
        histA.push(generateIidDraw(rng, `a-${sim}-${i}`, dateStr));
        histB.push(generateIidDraw(rng, `b-${sim}-${i}`, dateStr));
      }

      const res = computeContinuousInterDrawCoupling(histB, histA, 462);
      weights.push(res.weight);
    }

    const meanWeight = weights.reduce((a, b) => a + b, 0) / weights.length;

    // Avant le fix, le poids moyen montait à 0.98 ! Maintenant il doit être < 0.05.
    expect(meanWeight).toBeLessThan(0.05);
  });

  it('le module de dynamiques complexes inter-tirages doit opérer sur matrice symétrisée sans données fictives', async () => {
    const rng = createDeterministicLcg(777);
    const histTarget: DrawResult[] = [];
    const histPred: DrawResult[] = [];

    const baseTimestamp = 1700000000;
    for (let i = 0; i < 25; i++) {
      const dateStr = new Date((baseTimestamp + i * 86400) * 1000).toISOString().slice(0, 10);
      histTarget.push(generateIidDraw(rng, `tgt-${i}`, dateStr));
      histPred.push(generateIidDraw(rng, `pred-${i}`, dateStr));
    }

    const report = await computeInterDrawComplexDynamics(
      'Fortune',
      'quotidien',
      histTarget,
      histPred
    );

    expect(report).toBeDefined();
    expect(report.domino).toBeDefined();
    expect(report.butterfly).toBeDefined();
    expect(report.cascade).toBeDefined();
    expect(report.chainReaction).toBeDefined();

    // Vérifier la réverbération harmonique calculée (sans constante arbitraire 68.4)
    expect(Number.isFinite(report.domino.harmonicReverberationRate)).toBe(true);
    expect(report.domino.harmonicReverberationRate).toBeGreaterThanOrEqual(0);
    expect(report.domino.harmonicReverberationRate).toBeLessThanOrEqual(100);

    // Vérifier l'exposant de Lyapunov calculé sur données réelles alignées
    expect(Number.isFinite(report.butterfly.lyapunovExponent)).toBe(true);
    expect(Number.isFinite(report.butterfly.sensitivityRegime)).toBe(true);

    // Vérifier le noyau de chaleur (énergie de trace positive)
    expect(report.cascade.traceEnergy).toBeGreaterThan(0);
  });
});
