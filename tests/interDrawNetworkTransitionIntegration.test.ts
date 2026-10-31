import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { generateInterDrawReport } from '../src/services/interDrawService';
import { lotteryService } from '../src/services/lotteryService';
import { INTER_DRAW_NETWORKS } from '../src/config/networks';
import { rankTransitionRow, isTransitionRowInformative } from '../src/services/interDrawTransitionMatrix';
import type { DrawResult } from '../src/types';

const WEEKS = 40;
const NAMES = INTER_DRAW_NETWORKS.hebdomadaire.drawNames; // Lun → Sam, 19h55

// LCG déterministe (aucun Math.random : cf. AGENTS.md)
const lcg = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

const fmt = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

function buildHistories(): Map<string, DrawResult[]> {
  const base = new Date(2025, 0, 6); // lundi
  const out = new Map<string, DrawResult[]>();
  NAMES.forEach((name, dayIdx) => {
    const list: DrawResult[] = [];
    for (let w = 0; w < WEEKS; w++) {
      const rnd = lcg(1000 * (dayIdx + 1) + w + 7);
      const set = new Set<number>();
      while (set.size < 5) set.add(1 + Math.floor(rnd() * 90));
      const date = new Date(base.getFullYear(), base.getMonth(), base.getDate() + w * 7 + dayIdx);
      list.push({
        id: `${name}-${w}`,
        drawName: name,
        date: fmt(date),
        gagnants: [...set].sort((a, b) => a - b),
        machine: [],
      });
    }
    out.set(name, list.reverse()); // plus récent en premier
  });
  return out;
}

describe('Matrice de transition inter-tirages : prédécesseur immédiat vs réseau complet', () => {
  const histories = buildHistories();
  let spy: ReturnType<typeof vi.spyOn>;

  beforeAll(() => {
    spy = vi
      .spyOn(lotteryService, 'fetchHistory')
      .mockImplementation(async (name: string) => histories.get(name) ?? []);
  });
  afterAll(() => spy.mockRestore());

  it('le rapport expose les deux portées et le réseau utilise plus de sources que le prédécesseur', async () => {
    const report = await generateInterDrawReport('Fortune Thursday', 'hebdomadaire', true);
    expect(report).toBeDefined();
    const nt = report!.networkTransition;
    expect(nt).toBeDefined();

    // Portée « prédécesseur immédiat » : une seule source
    expect(nt!.immediate.scope).toBe('IMMEDIATE');
    expect(nt!.immediate.sourcesUsed).toBe(1);
    expect(nt!.immediate.pairsUsed).toBeGreaterThanOrEqual(2);

    // Portée « réseau complet » : tous les autres tirages du réseau (5 sur 6), jamais la cible elle-même
    expect(nt!.network.scope).toBe('NETWORK');
    expect(nt!.network.sourcesUsed).toBeGreaterThan(1);
    expect(nt!.network.pairsUsed).toBeGreaterThan(nt!.immediate.pairsUsed);
    const names = nt!.network.bySource.map(s => s.name);
    expect(names).not.toContain('Fortune Thursday');
    expect(names).toContain(report!.predecessor.name);
  });

  it('les poids réseau sont continus (aucun tirage exclu par seuil) et normalisés à moyenne 1', async () => {
    const report = await generateInterDrawReport('Fortune Thursday', 'hebdomadaire', true);
    const bySource = report!.networkTransition!.network.bySource;
    expect(bySource.every(s => s.appliedWeight >= 0 && Number.isFinite(s.appliedWeight))).toBe(true);
    const mean = bySource.reduce((a, s) => a + s.appliedWeight, 0) / bySource.length;
    expect(mean).toBeCloseTo(1, 9);
  });

  it('le classement d’une ligne observée est monotone et non dégénéré (plus de 1, 2, 3, 4…)', async () => {
    const report = await generateInterDrawReport('Fortune Thursday', 'hebdomadaire', true);
    for (const matrix of [report!.networkTransition!.immediate, report!.networkTransition!.network]) {
      const source = report!.predecessorResult!.gagnants[0];
      expect(isTransitionRowInformative(matrix, source)).toBe(true);
      const ranked = rankTransitionRow(matrix, source);
      expect(ranked).toHaveLength(90);
      for (let i = 1; i < ranked.length; i++) {
        expect(ranked[i - 1].prob).toBeGreaterThanOrEqual(ranked[i].prob);
      }
      // la tête du classement correspond à de vraies cooccurrences observées
      expect(ranked[0].count).toBeGreaterThan(0);
      const top30 = ranked.slice(0, 30).map(c => c.targetNumber);
      expect(top30).not.toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    }
  });
});
