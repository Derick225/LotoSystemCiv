import { describe, it, expect } from 'vitest';
import { generateXAPNarratives } from '../src/services/prediction/xapExplainabilityService';
import { AlgoKey } from '../src/shared/prediction.types';

const generate = (
  shap: Record<string, number>,
  skillContext?: { shrinkage: number; brierSkillScore: number }
) =>
  generateXAPNarratives(
    [7],
    { 7: 42 },
    { 7: shap },
    undefined,
    skillContext
  )[7];

describe('XAP — archétypes continus dérivés des parts SHAP', () => {
  it('choisit Transfert Machine uniquement si sa masse SHAP domine', () => {
    const explanation = generate({ [AlgoKey.MACHINE_TRANSFER]: 3, [AlgoKey.SPECTRAL]: 1 });
    expect(explanation.physicsArchetype).toBe('Transfert Machine');
    expect(explanation.dominantFamilyShare).toBeCloseTo(0.75, 12);
  });

  it('ne privilégie plus la machine via un seuil arbitraire', () => {
    const explanation = generate({ [AlgoKey.MACHINE_TRANSFER]: 1, [AlgoKey.SPECTRAL]: 3 });
    expect(explanation.physicsArchetype).toBe('Cycle Harmonique');
    expect(explanation.dominantFamilyShare).toBeCloseTo(0.75, 12);
  });

  it('répartit continûment entre familles sans branche binaire', () => {
    const explanation = generate({
      [AlgoKey.SPECTRAL]: 0.4,
      [AlgoKey.MARKOV]: 0.6,
    });
    expect(explanation.physicsArchetype).toBe('Attracteur Chaotique');
    expect(explanation.dominantFamilyShare).toBeCloseTo(0.6, 12);
  });

  it('retombe sur la convergence probabiliste sans signal SHAP positif', () => {
    const explanation = generate({});
    expect(explanation.physicsArchetype).toBe('Convergence Probabiliste');
    expect(explanation.dominantFamilyShare).toBe(0);
    expect(explanation.narrativeText).toContain('socle uniforme');
  });

  it('trie les drivers et normalise leurs pourcentages à 100', () => {
    const explanation = generate({
      [AlgoKey.FREQUENCY]: 1,
      [AlgoKey.BAYES]: 2,
      [AlgoKey.MARKOV]: 3,
    });
    expect(explanation.topDrivers.map((d) => d.algoKey)).toEqual([
      AlgoKey.MARKOV,
      AlgoKey.BAYES,
      AlgoKey.FREQUENCY,
    ]);
    const total = explanation.topDrivers.reduce((s, d) => s + d.percentageOfScore, 0);
    expect(total).toBeCloseTo(100, 12);
  });

  it('est déterministe pour les mêmes entrées', () => {
    const shap = { [AlgoKey.SPECTRAL]: 1.2, [AlgoKey.FRACTAL]: 0.8 };
    expect(generate(shap)).toEqual(generate(shap));
  });
});

describe('XAP — honnêteté du contexte de skill', () => {
  it('annonce explicitement l’absence d’edge mesuré quand λ = 0', () => {
    const explanation = generate(
      { [AlgoKey.SPECTRAL]: 1 },
      { shrinkage: 0, brierSkillScore: -0.02 }
    );
    expect(explanation.narrativeText).toContain('Aucun edge out-of-fold mesuré');
    expect(explanation.narrativeText).toContain('ramenées à 5/90');
  });

  it('nuance l’attribution quand un edge partiel est retenu', () => {
    const explanation = generate(
      { [AlgoKey.SPECTRAL]: 1 },
      { shrinkage: 0.4, brierSkillScore: 0.03 }
    );
    expect(explanation.narrativeText).toContain('Edge out-of-fold partiel retenu');
    expect(explanation.narrativeText).not.toContain('Aucun edge');
  });
});
