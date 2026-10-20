import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fnv1a64To53 } from '../src/utils/deterministicSeed';

interface Fixture {
  epsilon: number;
  binomial: Record<string, number>;
  hypergeometric: {
    poolSize: number;
    poolWinners: number;
    ticketSize: number;
    cases: Array<{ minHits: number; p: number }>;
  };
  lcg: { seed: number; values: number[] };
  fnv: { input: string; hash53: number };
  stacking: { numSamples: number; numChannels: number; channelWeights: number[] };
}

const fixture: Fixture = JSON.parse(
  readFileSync(new URL('./fixtures/golden-engine.json', import.meta.url), 'utf8')
);

const binomial = (n: number, k: number): number => {
  let result = 1;
  for (let i = 0; i < k; i++) result = (result * (n - i)) / (i + 1);
  return Math.round(result);
};

const hypergeometricTail = (minHits: number, ticketSize: number, poolWinners: number, poolSize: number): number => {
  const total = binomial(poolSize, ticketSize);
  let favorable = 0;
  for (let i = minHits; i <= Math.min(ticketSize, poolWinners); i++) {
    favorable += binomial(poolWinners, i) * binomial(poolSize - poolWinners, ticketSize - i);
  }
  return favorable / total;
};

/** Même LCG 64-bit que loto-core (constantes Numerical Recipes), sortie 53 bits. */
const lcgValues = (seed: number, count: number): number[] => {
  const mask = (1n << 64n) - 1n;
  let state = BigInt(seed);
  if (state === 0n) state = 0x9e3779b97f4a7c15n;
  const values: number[] = [];
  for (let i = 0; i < count; i++) {
    state = (state * 6364136223846793005n + 1442695040888963407n) & mask;
    values.push(Number(state >> 11n) / Number(1n << 53n));
  }
  return values;
};

describe('Golden fixtures cross-platform (ε = 1e-10)', () => {
  test('binomiaux exacts identiques Rust/TS', () => {
    expect(binomial(90, 5)).toBe(fixture.binomial['90,5']);
    expect(binomial(85, 5)).toBe(fixture.binomial['85,5']);
    expect(binomial(85, 3)).toBe(fixture.binomial['85,3']);
  });

  test('hypergéométrie identique Rust/TS', () => {
    const { poolSize, poolWinners, ticketSize, cases } = fixture.hypergeometric;
    for (const { minHits, p } of cases) {
      expect(Math.abs(hypergeometricTail(minHits, ticketSize, poolWinners, poolSize) - p)).toBeLessThanOrEqual(fixture.epsilon);
    }
  });

  test('LCG identique Rust/TS', () => {
    const values = lcgValues(fixture.lcg.seed, fixture.lcg.values.length);
    values.forEach((value, i) => {
      expect(Math.abs(value - fixture.lcg.values[i])).toBeLessThanOrEqual(fixture.epsilon);
    });
  });

  test('FNV-1a 53 bits identique Rust/TS', () => {
    const bytes = Array.from(Buffer.from(fixture.fnv.input, 'utf8'));
    expect(fnv1a64To53(bytes)).toBe(fixture.fnv.hash53);
  });
});
