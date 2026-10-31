import { describe, it, expect } from 'vitest';
import {
  buildWeightedTransitionMatrix,
  rankTransitionRow,
  isTransitionRowInformative,
  TRANSITION_BASELINE,
  TransitionPairSource,
} from '../src/services/interDrawTransitionMatrix';

const pair = (pred: number[], target: number[]) => ({ predWinners: pred, targetWinners: target });

describe('interDrawTransitionMatrix', () => {
  it('chaque ligne somme à NUMBERS_PER_DRAW (5) : P(t ∈ cible | s) sur 90 cibles', () => {
    const sources: TransitionPairSource[] = [
      {
        name: 'A',
        weight: 1,
        pairs: [
          pair([1, 2, 3, 4, 5], [10, 20, 30, 40, 50]),
          pair([1, 7, 8, 9, 11], [10, 21, 31, 41, 51]),
          pair([2, 3, 5, 12, 13], [10, 22, 32, 42, 52]),
        ],
      },
    ];
    const m = buildWeightedTransitionMatrix(sources, 'IMMEDIATE');
    for (const s of [1, 2, 3, 40, 90]) {
      const row = m.probs.slice((s - 1) * 90, s * 90);
      expect(row.reduce((a, b) => a + b, 0)).toBeCloseTo(5, 9);
    }
  });

  it('la ligne observée est classée par vraie probabilité, pas par ordre numérique', () => {
    const m = buildWeightedTransitionMatrix(
      [
        {
          name: 'A',
          weight: 1,
          pairs: [
            pair([5, 6, 7, 8, 9], [80, 81, 82, 83, 84]),
            pair([5, 6, 7, 8, 9], [80, 81, 85, 86, 87]),
            pair([5, 6, 7, 8, 9], [80, 88, 89, 90, 1]),
          ],
        },
      ],
      'IMMEDIATE'
    );
    const ranked = rankTransitionRow(m, 5);
    expect(ranked[0].targetNumber).toBe(80); // 3 occurrences
    expect(ranked[1].targetNumber).toBe(81); // 2 occurrences
    // 1 a été vu une fois ; il doit passer avant les cibles jamais vues (ex. 2, 3, 4)
    const pos1 = ranked.findIndex(c => c.targetNumber === 1);
    const pos2 = ranked.findIndex(c => c.targetNumber === 2);
    expect(pos1).toBeLessThan(pos2);
  });

  it('départage les égalités par cooccurrences puis par numéro, de façon déterministe', () => {
    const m = buildWeightedTransitionMatrix(
      [{ name: 'A', weight: 1, pairs: [pair([1, 2, 3, 4, 5], [10, 20, 30, 40, 50]), pair([1, 2, 3, 4, 5], [10, 20, 30, 40, 50])] }],
      'IMMEDIATE'
    );
    const a = rankTransitionRow(m, 1).map(c => c.targetNumber);
    const b = rankTransitionRow(m, 1).map(c => c.targetNumber);
    expect(a).toEqual(b);
    expect(a.slice(0, 5)).toEqual([10, 20, 30, 40, 50]);
  });

  it('sans paires : matrice a priori uniforme, ligne non informative (plus de faux classement)', () => {
    const m = buildWeightedTransitionMatrix([], 'NETWORK');
    expect(m.pairsUsed).toBe(0);
    expect(isTransitionRowInformative(m, 1)).toBe(false);
    const row = rankTransitionRow(m, 1);
    expect(new Set(row.map(c => c.prob)).size).toBe(1);
    expect(row[0].prob).toBeCloseTo(TRANSITION_BASELINE, 12);
  });

  it('numéro source jamais observé : ligne non informative', () => {
    const m = buildWeightedTransitionMatrix(
      [{ name: 'A', weight: 1, pairs: [pair([1, 2, 3, 4, 5], [6, 7, 8, 9, 10]), pair([1, 2, 3, 4, 5], [6, 7, 8, 9, 10])] }],
      'IMMEDIATE'
    );
    expect(isTransitionRowInformative(m, 1)).toBe(true);
    expect(isTransitionRowInformative(m, 90)).toBe(false);
  });

  it('NETWORK agrège toutes les sources et pondère par le couplage continu', () => {
    const strong = Array.from({ length: 6 }, () => pair([1, 2, 3, 4, 5], [10, 11, 12, 13, 14]));
    const weak = Array.from({ length: 6 }, () => pair([1, 2, 3, 4, 5], [20, 21, 22, 23, 24]));
    const m = buildWeightedTransitionMatrix(
      [
        { name: 'FORT', weight: 0.9, pairs: strong },
        { name: 'FAIBLE', weight: 0.1, pairs: weak },
      ],
      'NETWORK'
    );
    expect(m.sourcesUsed).toBe(2);
    expect(m.pairsUsed).toBe(12);
    const top = rankTransitionRow(m, 1).slice(0, 5).map(c => c.targetNumber).sort((a, b) => a - b);
    expect(top).toEqual([10, 11, 12, 13, 14]); // la source forte domine
    // la source faible n'est jamais supprimée (pas de seuil binaire) : 20 > cible jamais vue
    const p20 = rankTransitionRow(m, 1, 20)[0].prob;
    const p90 = rankTransitionRow(m, 1, 90)[0].prob;
    expect(p20).toBeGreaterThan(p90);
    // poids appliqués normalisés à moyenne 1
    const mean = m.bySource.reduce((a, s) => a + s.appliedWeight, 0) / m.bySource.length;
    expect(mean).toBeCloseTo(1, 12);
  });

  it('NETWORK avec poids tous nuls ou invalides retombe sur un poids uniforme', () => {
    const p = [pair([1, 2, 3, 4, 5], [6, 7, 8, 9, 10]), pair([1, 2, 3, 4, 5], [6, 7, 8, 9, 10])];
    const m = buildWeightedTransitionMatrix(
      [
        { name: 'A', weight: 0, pairs: p },
        { name: 'B', weight: Number.NaN, pairs: p },
      ],
      'NETWORK'
    );
    expect(m.bySource.every(s => s.appliedWeight === 1)).toBe(true);
    expect(m.probs.every(Number.isFinite)).toBe(true);
  });

  it('ignore les numéros hors [1, 90]', () => {
    const m = buildWeightedTransitionMatrix(
      [{ name: 'A', weight: 1, pairs: [pair([0, 91, 1, 2, 3], [100, -1, 4, 5, 6]), pair([1, 2, 3, 4, 5], [4, 5, 6, 7, 8])] }],
      'IMMEDIATE'
    );
    expect(m.probs.every(Number.isFinite)).toBe(true);
    expect(m.probs.length).toBe(8100);
  });
});
