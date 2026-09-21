import { describe, it, expect } from 'vitest';
import { runOrchestrationPipeline } from '../services/orchestrationService';
import type { DrawResult } from '../types';

/**
 * GOLDEN MASTER (recommandation #1)
 * ---------------------------------------------------------------------------
 * Objectif : figer la sortie NUMÉRIQUE réelle du pipeline d'orchestration sur un
 * historique synthétique 100% déterministe, afin de (a) prouver le déterminisme de
 * bout en bout (AGENTS.md règle #2) et (b) détecter toute dérive de comportement
 * lors des refactorisations de continuité (règles #1 & #3).
 *
 * L'historique est construit ici avec des DATES FIXES (et non via
 * generateDeterministicFallbackHistory qui dépend de `new Date()`), garantissant un
 * snapshot stable quel que soit le jour ou la machine d'exécution.
 */

// LCG canonique déterministe (100% déterministe — conforme règle #2).
const makeLcg = (seedPrime: number) => {
  let seed = seedPrime >>> 0;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
};

const DATE_FORMAT = (index: number): string => {
  // Base fixe en UTC → indépendant du fuseau horaire de la machine.
  const d = new Date(Date.UTC(2024, 0, 1 + index));
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
};

const DRAW_NAME = 'Loto Golden Master';
const HISTORY_DEPTH = 60;
const SEED_PRIME = 99991;

const buildDeterministicHistory = (): DrawResult[] => {
  const lcg = makeLcg(SEED_PRIME);
  const draw = (): number[] => {
    const pool = new Set<number>();
    while (pool.size < 5) {
      pool.add(Math.floor(lcg() * 90) + 1);
    }
    return Array.from(pool).sort((a, b) => a - b);
  };

  const results: DrawResult[] = [];
  for (let i = HISTORY_DEPTH; i >= 1; i--) {
    const gagnants = draw();
    const gagnantSet = new Set(gagnants);
    const machinePool = new Set<number>();
    while (machinePool.size < 5) {
      const v = Math.floor(lcg() * 90) + 1;
      if (!gagnantSet.has(v)) machinePool.add(v);
    }
    results.push({
      id: `gm-${i}`,
      drawName: DRAW_NAME,
      date: DATE_FORMAT(HISTORY_DEPTH - i),
      gagnants,
      machine: Array.from(machinePool).sort((a, b) => a - b),
      version: 1
    });
  }
  // Ordre antéchronologique (index 0 = tirage le plus récent), comme le moteur réel.
  return results.reverse();
};

const round6 = (v: number): number => Number(v.toFixed(6));

const snapshotShape = (pipeline: NonNullable<ReturnType<typeof runOrchestrationPipeline>>) => ({
  top5: pipeline.top5,
  top18: pipeline.top18,
  stabilityScore: round6(pipeline.stabilityScore),
  regime: pipeline.regimeDiagnostic.regime,
  confidenceInRegime: round6(pipeline.regimeDiagnostic.confidenceInRegime),
  scores: Object.fromEntries(
    Object.entries(pipeline.scores).map(([k, v]) => [k, round6(v as number)])
  )
});

describe('Golden Master — Pipeline d\'orchestration (déterminisme & non-régression)', () => {
  it('produit une structure de sélection valide et bornée', () => {
    const history = buildDeterministicHistory();
    const pipeline = runOrchestrationPipeline(history);
    expect(pipeline).not.toBeNull();
    if (!pipeline) return;

    expect(pipeline.top5).toHaveLength(5);
    expect(new Set(pipeline.top5).size).toBe(5);
    pipeline.top5.forEach(n => {
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(90);
    });

    expect(pipeline.top18).toHaveLength(18);
    expect(new Set(pipeline.top18).size).toBe(18);
    expect(Number.isFinite(pipeline.stabilityScore)).toBe(true);
    expect(Object.keys(pipeline.scores).length).toBeGreaterThan(0);
  });

  it('est 100% reproductible : deux histoires identiques → sortie identique (règle #2)', () => {
    const pipelineA = runOrchestrationPipeline(buildDeterministicHistory());
    const pipelineB = runOrchestrationPipeline(buildDeterministicHistory());
    expect(pipelineA).not.toBeNull();
    expect(snapshotShape(pipelineA!)).toEqual(snapshotShape(pipelineB!));
  });

  it('est stable pour un même historique traité deux fois', () => {
    const history = buildDeterministicHistory();
    const first = runOrchestrationPipeline(history);
    const second = runOrchestrationPipeline(history);
    expect(snapshotShape(first!)).toEqual(snapshotShape(second!));
  });

  it('correspond au golden master figé (mettre à jour via `vitest -u` après un changement VOLONTAIRE)', () => {
    const pipeline = runOrchestrationPipeline(buildDeterministicHistory());
    expect(snapshotShape(pipeline!)).toMatchSnapshot();
  });
});
