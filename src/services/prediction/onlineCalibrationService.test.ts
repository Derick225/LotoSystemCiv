import { describe, it, expect } from 'vitest';
import {
  fitMonotoneCalibrator,
  computeEce,
  deriveEceBinCount,
  coverageFromSampleSize,
  conformalInterval,
  looEceAfterCalibration,
  CalibrationPairs,
} from './onlineCalibrationService';

/** Vérité en plateau : p bas → jamais sorti, p haut → toujours sorti,
 *  zone médiane alternée (violateurs légers → plusieurs blocs PAVA). */
const plateauPairs = (): CalibrationPairs => {
  const p: number[] = [];
  const y: number[] = [];
  for (let i = 0; i < 10; i++) {
    p.push(0.1); y.push(0);
    p.push(0.5); y.push(i % 2);
    p.push(0.9); y.push(1);
  }
  return { p, y };
};

describe('Calibration en Ligne — Calibrateur Monotone Fritsch–Carlson', () => {
  it('est strictement déterministe : mêmes couples → mêmes nœuds et mêmes valeurs', () => {
    const pairs = plateauPairs();
    const c1 = fitMonotoneCalibrator(pairs);
    const c2 = fitMonotoneCalibrator(JSON.parse(JSON.stringify(pairs)));
    expect(JSON.stringify(c1.knots)).toEqual(JSON.stringify(c2.knots));
    for (let g = 0; g <= 100; g++) {
      expect(c1.apply(g / 100)).toBe(c2.apply(g / 100));
    }
  });

  it('interpole exactement les nœuds isotoniques', () => {
    const c = fitMonotoneCalibrator(plateauPairs());
    expect(c.blockCount).toBe(3);
    for (const knot of c.knots) {
      expect(c.apply(knot.x)).toBeCloseTo(knot.y, 10);
    }
  });

  it('est monotone non décroissante et C⁰ sur une grille dense', () => {
    const c = fitMonotoneCalibrator(plateauPairs());
    let prev = c.apply(0);
    for (let g = 1; g <= 1000; g++) {
      const v = c.apply(g / 1000);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = v;
    }
    // Continuité : pas de saut brutal autour du nœud médian
    const a = c.apply(0.4999);
    const b = c.apply(0.5001);
    expect(Math.abs(b - a)).toBeLessThan(0.02);
  });

  it('correction de la sur-confiance : comprime les extrêmes vers la fréquence empirique', () => {
    const p: number[] = [];
    const y: number[] = [];
    for (let i = 0; i < 10; i++) {
      p.push(0.9); y.push(i < 8 ? 1 : 0);
      p.push(0.1); y.push(i < 8 ? 0 : 1);
    }
    const c = fitMonotoneCalibrator({ p, y });
    // Fréquences empiriques 0.8 et 0.2 : la carte isotonique compresse 0.9 → 0.8, 0.1 → 0.2
    expect(c.apply(0.9)).toBeCloseTo(0.8, 10);
    expect(c.apply(0.1)).toBeCloseTo(0.2, 10);
    expect(c.apply(0.9)).toBeLessThan(0.9);
    expect(c.apply(0.1)).toBeGreaterThan(0.1);
  });

  it('réduit l\'ECE en échantillon (map globale vers la fréquence empirique)', () => {
    const pairs = plateauPairs();
    const c = fitMonotoneCalibrator(pairs);
    const calibrated: CalibrationPairs = {
      p: pairs.p.map((v) => c.apply(v)),
      y: pairs.y,
    };
    expect(computeEce(calibrated)).toBeLessThan(computeEce(pairs));
  });

  it('borne la sortie dans [0, 1] et replie les extrémités sur les constantes de bloc', () => {
    const c = fitMonotoneCalibrator(plateauPairs());
    for (let g = 0; g <= 100; g++) {
      const v = c.apply(g / 100);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(c.apply(0.0001)).toBeCloseTo(c.apply(0.1), 10);
    expect(c.apply(0.9999)).toBeCloseTo(c.apply(0.9), 10);
  });

  it('cas dégénérés : vide → identité bornée ; valeur unique → constante', () => {
    const empty = fitMonotoneCalibrator({ p: [], y: [] });
    expect(empty.apply(0.3)).toBeCloseTo(0.3, 12);
    expect(empty.blockCount).toBe(0);

    const single = fitMonotoneCalibrator({ p: [0.5, 0.5, 0.5], y: [1, 0, 1] });
    expect(single.blockCount).toBe(1);
    expect(single.apply(0.2)).toBeCloseTo(2 / 3, 10);
    expect(single.apply(0.8)).toBeCloseTo(2 / 3, 10);
  });
});

describe('Calibration en Ligne — ECE et nombre de bins', () => {
  it('dérive le nombre de bins de la taille d\'échantillon (√n borné [3, 10])', () => {
    expect(deriveEceBinCount(0)).toBe(3);
    expect(deriveEceBinCount(9)).toBe(3);
    expect(deriveEceBinCount(16)).toBe(4);
    expect(deriveEceBinCount(100)).toBe(10);
    expect(deriveEceBinCount(10000)).toBe(10);
  });

  it('ECE quasi nul pour des clusters de fréquence exactement calibrés', () => {
    const p: number[] = [];
    const y: number[] = [];
    // 20 tirages à p=0.3 avec exactement 6 succès (fréquence 0.3), 20 à p=0.7 avec 14 succès
    for (let i = 0; i < 20; i++) {
      p.push(0.3); y.push(i < 6 ? 1 : 0);
      p.push(0.7); y.push(i < 14 ? 1 : 0);
    }
    const ece = computeEce({ p, y }, 10);
    expect(ece).toBeLessThan(0.02);
  });
});

describe('Calibration en Ligne — Intervalle Conforme', () => {
  it('couverture dérivée de l\'échantillon : 1 − 1/√(n+1)', () => {
    expect(coverageFromSampleSize(0)).toBe(0);
    expect(coverageFromSampleSize(3)).toBeCloseTo(0.5, 12);
    expect(coverageFromSampleSize(8)).toBeCloseTo(2 / 3, 12);
  });

  it('quantile conforme d\'ordre k = ceil((n+1)·couverture) sur résidus triés', () => {
    const residuals = [4, 1, 3, 0, 2];
    const explicit = conformalInterval(residuals, 2.5, 5, 0.5);
    // n=5, cov=0.5 → k = ceil(6×0.5) = 3 → 3e résidu trié = 2
    expect(explicit.quantile).toBe(2);
    expect(explicit.lower).toBe(0.5);
    expect(explicit.upper).toBe(4.5);

    const derived = conformalInterval(residuals, 2.5, 5);
    // cov = 1 − 1/√6 ≈ 0.5918 → k = ceil(6×0.5918) = 4 → q = 3
    expect(derived.quantile).toBe(3);
    expect(derived.coverage).toBeCloseTo(1 - 1 / Math.sqrt(6), 12);
  });

  it('replie les bornes sur le domaine structurel [0, maxHits]', () => {
    const wide = conformalInterval([10, 12], 2.0, 5, 0.9);
    expect(wide.lower).toBe(0);
    expect(wide.upper).toBe(5);
    const narrow = conformalInterval([0.1, 0.2], 2.5, 5, 0.5);
    expect(narrow.lower).toBeGreaterThanOrEqual(0);
    expect(narrow.upper).toBeLessThanOrEqual(5);
    expect(narrow.upper).toBeGreaterThan(narrow.lower);
  });

  it('échantillon vide → intervalle maximal, couverture nulle', () => {
    const iv = conformalInterval([], 2.0, 5);
    expect(iv.lower).toBe(0);
    expect(iv.upper).toBe(5);
    expect(iv.coverage).toBe(0);
    expect(iv.sampleSize).toBe(0);
  });
});

describe('Calibration en Ligne — Évaluation Leave-One-Out honnête', () => {
  it('LOO : ECE post-calibration inférieur à ECE brute sur plis désalignés', () => {
    const fold = (offset: number): CalibrationPairs => {
      const p: number[] = [];
      const y: number[] = [];
      for (let i = 0; i < 30; i++) {
        const raw = ((i * 7 + offset) % 90) / 100 + 0.05;
        p.push(raw);
        // Issue décalée : sur-confiance aux deux extrêmes
        y.push(raw > 0.55 ? 0 : raw < 0.35 ? 1 : (i + offset) % 2);
      }
      return { p, y };
    };
    const folds = [fold(0), fold(11), fold(23)];
    const all: CalibrationPairs = {
      p: folds.flatMap((f) => f.p),
      y: folds.flatMap((f) => f.y),
    };
    const eceBefore = computeEce(all);
    const eceAfter = looEceAfterCalibration(folds);
    expect(eceAfter).toBeLessThan(eceBefore);
  });

  it('LOO déterministe et nul pour moins de 2 plis', () => {
    expect(looEceAfterCalibration([])).toBe(0);
    const single: CalibrationPairs = { p: [0.5], y: [1] };
    expect(looEceAfterCalibration([single])).toBe(0);
    const folds = [
      { p: [0.1, 0.9], y: [0, 1] },
      { p: [0.2, 0.8], y: [0, 1] },
    ];
    expect(looEceAfterCalibration(folds)).toBe(looEceAfterCalibration(folds));
  });
});
