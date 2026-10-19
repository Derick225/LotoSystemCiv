import { describe, expect, test } from 'vitest';
import type { DrawResult } from '../types';
import {
  calculateAnomalyScores,
  calculateBayesianScore,
  calculateCoOccurrenceScores,
  calculateDigitalRootAnalysis,
  calculateFractalResonance,
  calculateGapVelocityScores,
  calculateLeaderSuccession,
  calculatePoissonScores,
  calculateResistanceScores,
  calculateSpatialHotSpots,
  calculateTemporalScores,
  calculateAiIntuition,
} from '../services/advancedMathService';
import { fnv1a64To53 } from '../utils/deterministicSeed';

const DOMAIN = 90;
const TICKET = 5;
const EVAL_DRAWS = 40;
const HISTORY_DRAWS = 200;
const PERMUTATIONS = 1000;

type ChannelScores = Record<number, number>;
type ChannelFn = (history: DrawResult[]) => ChannelScores;

class TestLcg {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0 || 1;
  }
  next(): number {
    this.state = (Math.imul(1664525, this.state) + 1013904223) >>> 0;
    return this.state / 0x1_0000_0000;
  }
}

const sampleWithoutReplacement = (lcg: TestLcg, count: number): number[] => {
  const pool = Array.from({ length: DOMAIN }, (_, i) => i + 1);
  const picked: number[] = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(lcg.next() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked.sort((a, b) => a - b);
};

const makeUniformHistory = (seed: number, draws: number): DrawResult[] => {
  const lcg = new TestLcg(seed);
  return Array.from({ length: draws }, (_, i) => ({
    id: `uniform-${i}`,
    drawName: 'PermutationTest',
    date: new Date(Date.UTC(2020, 0, 1) + (draws - i) * 86_400_000).toISOString(),
    gagnants: sampleWithoutReplacement(lcg, TICKET),
  }));
};

const makePlantedHistory = (seed: number, draws: number, hotNumbers: number[], exponent: number): DrawResult[] => {
  const lcg = new TestLcg(seed);
  const hot = new Set(hotNumbers);
  const weights = Array.from({ length: DOMAIN }, (_, i) => (hot.has(i + 1) ? Math.exp(exponent) : 1));
  return Array.from({ length: draws }, (_, i) => {
    const picked: number[] = [];
    const available = Array.from({ length: DOMAIN }, (_, k) => k);
    for (let k = 0; k < TICKET; k++) {
      const total = available.reduce((acc, idx) => acc + weights[idx], 0);
      let r = lcg.next() * total;
      let chosen = available[available.length - 1];
      for (const idx of available) {
        r -= weights[idx];
        if (r <= 0) { chosen = idx; break; }
      }
      picked.push(chosen + 1);
      available.splice(available.indexOf(chosen), 1);
    }
    return {
      id: `planted-${i}`,
      drawName: 'PermutationTest',
      date: new Date(Date.UTC(2020, 0, 1) + (draws - i) * 86_400_000).toISOString(),
      gagnants: picked.sort((a, b) => a - b),
    };
  });
};

const CHANNELS: Array<{ key: string; compute: ChannelFn }> = [
  { key: 'poisson', compute: (h) => calculatePoissonScores(h) },
  { key: 'bayes', compute: (h) => calculateBayesianScore(h) },
  { key: 'temporal', compute: (h) => calculateTemporalScores(h) },
  { key: 'digital_root', compute: (h) => calculateDigitalRootAnalysis(h) },
  { key: 'resistance', compute: (h) => calculateResistanceScores(h) },
  { key: 'gap_velocity', compute: (h) => calculateGapVelocityScores(h) },
  { key: 'leader_succession', compute: (h) => calculateLeaderSuccession(h) },
  { key: 'cooccurrence', compute: (h) => calculateCoOccurrenceScores(h) },
  { key: 'anomaly', compute: (h) => calculateAnomalyScores(h) },
  { key: 'fractal', compute: (h) => calculateFractalResonance(h) },
  { key: 'spatial', compute: (h) => calculateSpatialHotSpots(h) },
  { key: 'ai_intuition', compute: (h) => calculateAiIntuition(h, {}) },
];

const normalizeScores = (scores: ChannelScores): Float64Array => {
  const vector = new Float64Array(DOMAIN);
  let sum = 0;
  let count = 0;
  for (let n = 1; n <= DOMAIN; n++) {
    const value = Number.isFinite(scores[n]) ? scores[n] : 0;
    vector[n - 1] = value;
    sum += value;
    count++;
  }
  const mean = sum / count;
  let variance = 0;
  for (let i = 0; i < DOMAIN; i++) variance += (vector[i] - mean) ** 2;
  const std = Math.sqrt(variance / count);
  if (std <= Number.EPSILON) return new Float64Array(DOMAIN);
  for (let i = 0; i < DOMAIN; i++) vector[i] = (vector[i] - mean) / std;
  return vector;
};

/** Skill OOS continu : z-score moyen des numéros gagnants moins z-score moyen du domaine. */
const pointSkill = (scores: Float64Array, winners: number[]): number => {
  let winnerSum = 0;
  for (const n of winners) winnerSum += scores[n - 1];
  let allSum = 0;
  for (let i = 0; i < DOMAIN; i++) allSum += scores[i];
  return winnerSum / winners.length - allSum / DOMAIN;
};

interface PreparedChannel {
  key: string;
  scoreVectors: Float64Array[];
}

const prepareChannel = (history: DrawResult[], channel: { key: string; compute: ChannelFn }): PreparedChannel => {
  const scoreVectors: Float64Array[] = [];
  for (let t = 0; t < EVAL_DRAWS; t++) {
    scoreVectors.push(normalizeScores(channel.compute(history.slice(t + 1))));
  }
  return { key: channel.key, scoreVectors };
};

const mean = (values: number[]): number => values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);

/**
 * Permutation des étiquettes de numéros (bijection aléatoire 1..90 appliquée
 * aux gagnants observés) contre le hasard pur.
 *
 * Une permutation purement temporelle des cibles serait invalide ici : chaque
 * vecteur de scores est calculé sur `history.slice(t + 1)` et contient donc
 * d'autres tirages d'évaluation plus anciens, ce qui biaise la distribution
 * nulle (fuite walk-forward). En permutant les numéros à place temporelle fixe,
 * les scores restent figés et la cible devient un tirage uniforme indépendant :
 * le test mesure bien l'alignement avec les gagnants réels, pas la structure
 * temporelle partagée entre scores et cibles.
 */
const permutationPValue = (
  prepared: PreparedChannel,
  targets: number[][],
  seed: number
): number => {
  const observed = mean(prepared.scoreVectors.map((v, t) => pointSkill(v, targets[t])));
  const lcg = new TestLcg(seed);
  let atLeastAsExtreme = 0;
  const labels = Array.from({ length: DOMAIN }, (_, i) => i + 1);
  for (let b = 0; b < PERMUTATIONS; b++) {
    for (let i = labels.length - 1; i > 0; i--) {
      const j = Math.floor(lcg.next() * (i + 1));
      [labels[i], labels[j]] = [labels[j], labels[i]];
    }
    const permuted = mean(
      prepared.scoreVectors.map((v, t) => pointSkill(v, targets[t].map((n) => labels[n - 1])))
    );
    if (permuted >= observed) atLeastAsExtreme++;
  }
  return (1 + atLeastAsExtreme) / (PERMUTATIONS + 1);
};

/** Benjamini–Hochberg : renvoie les p-values ajustées dans l'ordre d'entrée. */
const benjaminiHochberg = (pValues: number[]): number[] => {
  const m = pValues.length;
  const indexed = pValues.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
  const adjusted = new Array<number>(m).fill(1);
  let running = 1;
  for (let rank = m - 1; rank >= 0; rank--) {
    const { p, i } = indexed[rank];
    running = Math.min(running, (p * m) / (rank + 1));
    adjusted[i] = Math.min(1, running);
  }
  return adjusted;
};

describe('Test de permutation par canal (audit OOS vs hasard pur)', () => {
  test('Procédure déterministe : mêmes données + même seed ⇒ mêmes p-values', () => {
    const history = makeUniformHistory(fnv1a64To53('permutation-determinism'), HISTORY_DRAWS);
    const channel = CHANNELS.find((c) => c.key === 'poisson')!;
    const prepared = prepareChannel(history, channel);
    const targets = history.slice(0, EVAL_DRAWS).map((d) => d.gagnants);
    const a = permutationPValue(prepared, targets, 0x5eed);
    const b = permutationPValue(prepared, targets, 0x5eed);
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThanOrEqual(1);
  });

  test('Puissance : un canal réellement informatif est détecté (p < 0.05 après BH)', () => {
    const history = makeUniformHistory(fnv1a64To53('permutation-power'), HISTORY_DRAWS);
    const targets = history.slice(0, EVAL_DRAWS).map((d) => d.gagnants);
    const oracle: PreparedChannel = {
      key: 'oracle',
      scoreVectors: targets.map((winners) => {
        const v = new Float64Array(DOMAIN);
        for (const n of winners) v[n - 1] = 1;
        return normalizeScores(Object.fromEntries(Array.from(v.entries()).map(([i, s]) => [i + 1, s])));
      }),
    };
    const noise: PreparedChannel = {
      key: 'noise',
      scoreVectors: Array.from({ length: EVAL_DRAWS }, (_, t) => {
        const lcg = new TestLcg(0x1234 + t);
        return normalizeScores(Object.fromEntries(Array.from({ length: DOMAIN }, (_, i) => [i + 1, lcg.next()])));
      }),
    };
    const adjusted = benjaminiHochberg([
      permutationPValue(oracle, targets, 0xa11ce),
      permutationPValue(noise, targets, 0xb0b),
    ]);
    expect(adjusted[0]).toBeLessThan(0.05);
    expect(adjusted[1]).toBeGreaterThan(0.05);
  });

  test('Taille : sur un historique uniforme, aucun canal ne revendique un skill significatif', () => {
    const history = makeUniformHistory(fnv1a64To53('permutation-null'), HISTORY_DRAWS);
    const targets = history.slice(0, EVAL_DRAWS).map((d) => d.gagnants);
    const raw = CHANNELS.map((channel, idx) => {
      const prepared = prepareChannel(history, channel);
      return permutationPValue(prepared, targets, 0xc0ffee + idx * 7919);
    });
    const adjusted = benjaminiHochberg(raw);
    const significant = CHANNELS.filter((_, i) => adjusted[i] < 0.05).map((c, i) => `${c.key}: ${adjusted[i]}`);
    expect(significant, `Canaux faussement significatifs après BH: ${significant.join(', ')}`).toEqual([]);
  });

  test('BH : les p-values ajustées dominent les p-values brutes et restent dans [0,1]', () => {
    const raw = [0.001, 0.01, 0.04, 0.2, 0.9];
    const adjusted = benjaminiHochberg(raw);
    adjusted.forEach((p, i) => {
      expect(p).toBeGreaterThanOrEqual(raw[i]);
      expect(p).toBeLessThanOrEqual(1);
    });
  });

  test('Signal planté : le canal de fréquence détecte un biais persistant', () => {
    const history = makePlantedHistory(fnv1a64To53('permutation-planted'), HISTORY_DRAWS, [7, 19, 33, 48, 61], 1.6);
    const targets = history.slice(0, EVAL_DRAWS).map((d) => d.gagnants);
    const prepared = prepareChannel(history, CHANNELS.find((c) => c.key === 'poisson')!);
    const p = permutationPValue(prepared, targets, 0xdead);
    expect(p).toBeLessThan(0.05);
  });
});
