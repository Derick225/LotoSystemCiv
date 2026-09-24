import { describe, it, expect } from 'vitest';
import {
  runDeterministicInertiaBacktest,
  INERTIA_DAMPING_DOMAIN,
  DEFAULT_INERTIA_CALIBRATION,
} from '../services/prediction/systemInertiaEngine';

/**
 * GARDE-FOU DU BALAYAGE ζ (Rétro-Audit d'Inertie)
 *
 * Verrouille les propriétés qui interdisent le retour de l'ancien `bestDamping` fabriqué :
 * l'optimum rapporté doit être MESURÉ sur la fenêtre causale, appartenir au domaine réellement
 * offert à l'opérateur, et ne jamais être une reformulation de la valeur courante du curseur.
 */

// Historique synthétique 100 % déterministe (aucun générateur pseudo-aléatoire) : 20 tirages
// de 5 numéros distincts dans [1, 90], suffisant pour la fenêtre rétro-active (min. 12).
const buildDeterministicHistory = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: `d${i}`,
    date: `2026-01-${String(i + 1).padStart(2, '0')}`,
    machine: 1,
    draw_name: 'TEST_INERTIA',
    gagnants: Array.from({ length: 5 }, (_, k) => ((i * 7 + k * 17 + 3) % 90) + 1),
  }));

const HISTORY = buildDeterministicHistory(20);
const DRAW_NAME = 'TEST_INERTIA';

describe('Balayage déterministe du rétro-audit d\'inertie', () => {
  it('produit exactement les mêmes résultats à chaque exécution (ZÉRO HASARD)', async () => {
    const a = await runDeterministicInertiaBacktest(HISTORY, DRAW_NAME, DEFAULT_INERTIA_CALIBRATION, 0.5);
    const b = await runDeterministicInertiaBacktest(HISTORY, DRAW_NAME, DEFAULT_INERTIA_CALIBRATION, 0.5);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('rapporte un ζ mesuré appartenant au domaine évalué (jamais une valeur hors grille)', async () => {
    const result = await runDeterministicInertiaBacktest(HISTORY, DRAW_NAME, DEFAULT_INERTIA_CALIBRATION, 0.5);
    const { min, max, step } = INERTIA_DAMPING_DOMAIN;
    expect(result.bestDamping).toBeGreaterThanOrEqual(min);
    expect(result.bestDamping).toBeLessThanOrEqual(max);
    const stepsFromMin = (result.bestDamping - min) / step;
    expect(Math.abs(stepsFromMin - Math.round(stepsFromMin))).toBeLessThan(1e-9);
  });

  it('évalue la grille complète du curseur plus la calibration en vigueur', async () => {
    const { min, max, step } = INERTIA_DAMPING_DOMAIN;
    const gridCount = Math.round((max - min) / step) + 1;

    const onGrid = await runDeterministicInertiaBacktest(
      HISTORY,
      DRAW_NAME,
      { ...DEFAULT_INERTIA_CALIBRATION, dampingRatio: 0.5 },
      0.5
    );
    expect(onGrid.dampingCandidatesEvaluated).toBe(gridCount);

    // Une valeur persistée hors grille est ajoutée à l'espace de recherche, pour que le statu quo
    // soit comparé à armes égales avec les candidats de la grille.
    const offGrid = await runDeterministicInertiaBacktest(
      HISTORY,
      DRAW_NAME,
      { ...DEFAULT_INERTIA_CALIBRATION, dampingRatio: 0.53 },
      0.5
    );
    expect(offGrid.dampingCandidatesEvaluated).toBe(gridCount + 1);
  });

  it('ne peut jamais faire moins bien que la calibration en vigueur lorsqu\'elle est sur la grille', async () => {
    const result = await runDeterministicInertiaBacktest(
      HISTORY,
      DRAW_NAME,
      { ...DEFAULT_INERTIA_CALIBRATION, dampingRatio: 0.5 },
      0.5
    );
    expect(result.bestDampingHits).toBeGreaterThanOrEqual(result.currentDampingHits);
  });

  it('expose une référence de hasard pur dérivée de l\'hypergéométrique exacte (5/90)', async () => {
    const result = await runDeterministicInertiaBacktest(HISTORY, DRAW_NAME, DEFAULT_INERTIA_CALIBRATION, 0.5);
    // 1 − C(85,5)/C(90,5) = 25.37 % : probabilité qu'un ensemble fixe de 5 numéros croise un tirage
    // équitable de 5 numéros sur 90. Aucune constante de jeu n'est codée en dur dans le moteur.
    expect(result.nullSuccessRate).toBeCloseTo(25.37, 1);
    expect(result.successPValue === null || (result.successPValue >= 0 && result.successPValue <= 1)).toBe(true);
  });

  it('conserve la structure causale de la fenêtre rétro-active', async () => {
    const result = await runDeterministicInertiaBacktest(HISTORY, DRAW_NAME, DEFAULT_INERTIA_CALIBRATION, 0.5);
    expect(result.trials).toBe(Math.min(10, HISTORY.length - 8));
    expect(result.details.length).toBe(result.trials);
    // Chaque évaluation porte sur un tirage réel de l'historique, dans l'ordre chronologique inverse.
    expect(result.details[0].winners).toEqual(HISTORY[result.trials - 1].gagnants);
    expect(result.details[result.trials - 1].winners).toEqual(HISTORY[0].gagnants);
  });

  it('refuse un historique trop court pour rétropoler', async () => {
    await expect(
      runDeterministicInertiaBacktest(buildDeterministicHistory(11), DRAW_NAME, DEFAULT_INERTIA_CALIBRATION, 0.5)
    ).rejects.toThrow(/Historique insuffisant/);
  });
});
