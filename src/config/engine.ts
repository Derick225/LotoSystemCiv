export const THEORETICAL_CARRYOVER_PROB =
  1.0 - (85 * 84 * 83 * 82 * 81) / (90 * 89 * 88 * 87 * 86);
export const THEORETICAL_CARRYOVER_RATE_PERCENT = Number(
  (THEORETICAL_CARRYOVER_PROB * 100).toFixed(2)
);

export const LOTO_PAYOUTS = {
  STANDARD: {
    SIMPLE: {
      '1N': { label: '1 Numéro', odds: 15, gain: 1500 },
      '2N': { label: '2 Numéros', odds: 240, gain: 24000 },
      '3N': { label: '3 Numéros', odds: 2100, gain: 210000 },
      '4N': { label: '4 Numéros', odds: 15000, gain: 1500000 },
      '5N': { label: '5 Numéros', odds: 40000, gain: 4000000 },
    },
    TURBO: {
      T2: { label: 'Turbo 2', odds: 120, gain: 12000 },
      T3: { label: 'Turbo 3', odds: 600, gain: 60000 },
    },
  },
  DOUBLE_CHANCE: {
    SIMPLE: {
      '1N': { label: '1 Numéro (DC)', odds: 10, gain: 1000 },
      '2N': { label: '2 Numéros (DC)', odds: 100, gain: 10000 },
      '3N': { label: '3 Numéros (DC)', odds: 1000, gain: 100000 },
      '4N': { label: '4 Numéros (DC)', odds: 5000, gain: 500000 },
      '5N': { label: '5 Numéros (DC)', odds: 20000, gain: 2000000 },
    },
    TURBO: {
      T2: { label: 'Turbo 2 (DC)', odds: 50, gain: 5000 },
      T3: { label: 'Turbo 3 (DC)', odds: 250, gain: 25000 },
    },
  },
  DOUBLE_CHANCE_MACHINE: {
    SIMPLE: {
      '1N': { label: '1 Numéro (DCM)', odds: 8, gain: 800 },
      '2N': { label: '2 Numéros (DCM)', odds: 80, gain: 8000 },
      '3N': { label: '3 Numéros (DCM)', odds: 800, gain: 80000 },
      '4N': { label: '4 Numéros (DCM)', odds: 4000, gain: 400000 },
      '5N': { label: '5 Numéros (DCM)', odds: 15000, gain: 1500000 },
    },
    TURBO: {
      T2: { label: 'Turbo 2 (DCM)', odds: 40, gain: 4000 },
      T3: { label: 'Turbo 3 (DCM)', odds: 200, gain: 20000 },
    },
  },
};

export function getPayoutMultiplier(model: string, hits: number): number {
  if (model === 'LEGACY' || !model) {
    if (hits === 2) return 15;
    if (hits === 3) return 100;
    if (hits === 4) return 1500;
    if (hits === 5) return 15000;
    return 0;
  }

  if (model === 'STANDARD') {
    if (hits === 1) return 15;
    if (hits === 2) return 240;
    if (hits === 3) return 2100;
    if (hits === 4) return 15000;
    if (hits === 5) return 40000;
    return 0;
  }

  if (model === 'DOUBLE_CHANCE') {
    if (hits === 1) return 10;
    if (hits === 2) return 100;
    if (hits === 3) return 1000;
    if (hits === 4) return 5000;
    if (hits === 5) return 20000;
    return 0;
  }

  if (model === 'DOUBLE_CHANCE_MACHINE') {
    if (hits === 1) return 8;
    if (hits === 2) return 80;
    if (hits === 3) return 800;
    if (hits === 4) return 4000;
    if (hits === 5) return 15000;
    return 0;
  }

  return 0;
}
