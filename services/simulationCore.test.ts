import { describe, it, expect, vi } from 'vitest';
import { runSimulationCore } from './simulationCore';
import * as predictionEngine from './predictionEngine';
import { DrawResult } from '../types';
import { AlgoWeights } from '../types';

describe('SimulationCore - Zéro Interférence & Stabilité', () => {
  it('doit garantir une isolation stricte (Zéro Interférence) en ne passant que l\'historique passé à l\'oracle', async () => {
    // Espionner l'oracle pour vérifier l'exactitude des slices d'historique
    const mockGenerateMaster = vi.spyOn(predictionEngine, 'generateMasterPrediction')
      .mockResolvedValue({
        suggestedNumbers: [1, 2, 3, 4, 5],
        candidates: [1, 2, 3, 4, 5, 6, 7],
        breakdown: {},
        confidence: 80,
      });

    // Création d'un historique fictif ordonné du plus récent (0) au plus ancien (9)
    const mockHistory: DrawResult[] = Array.from({ length: 10 }, (_, i) => ({
      id: `draw-${i}`,
      drawName: 'Test Loto',
      date: `2024-01-${20 - i}`,
      gagnants: [i + 1, i + 2, i + 3, i + 4, i + 5],
      machine: [],
    }));

    const mockWeights: AlgoWeights = {};

    // Exécuter la simulation avec une profondeur de 3 (évaluant les index 0, 1, 2 = les 3 plus récents)
    await runSimulationCore({
      drawName: 'Test Loto',
      history: mockHistory,
      weights: mockWeights,
      depth: 3,
      strategy: 'FLAT',
    });

    // La simulation doit iterer sur la fenêtre inversée : index 2, puis index 1, puis index 0.
    // Index 2 est ciblé -> L'oracle ne doit voir que les index 3 à 9 (length 7). Aucun accès à 0, 1, ou 2.
    // Index 1 est ciblé -> L'oracle ne doit voir que les index 2 à 9 (length 8). Aucun accès à 0 ou 1.
    // Index 0 est ciblé -> L'oracle ne doit voir que les index 1 à 9 (length 9). Aucun accès à 0.
    
    expect(mockGenerateMaster).toHaveBeenCalledTimes(3);

    // Vérification du premier appel (ciblant le tirage originalIndex = 2)
    const contextCall1 = mockGenerateMaster.mock.calls[0][1];
    expect(contextCall1.length).toBe(7);
    expect(contextCall1[0].id).toBe('draw-3'); // Le plus récent fourni doit être draw-3
    expect(contextCall1.find(d => d.id === 'draw-2')).toBeUndefined(); // Strictement aucune fuite du présent
    expect(contextCall1.find(d => d.id === 'draw-1')).toBeUndefined(); // Strictement aucune fuite du futur
    expect(contextCall1.find(d => d.id === 'draw-0')).toBeUndefined();

    // Vérification du deuxième appel (ciblant le tirage originalIndex = 1)
    const contextCall2 = mockGenerateMaster.mock.calls[1][1];
    expect(contextCall2.length).toBe(8);
    expect(contextCall2[0].id).toBe('draw-2');

    // Vérification du troisième appel (ciblant le tirage originalIndex = 0)
    const contextCall3 = mockGenerateMaster.mock.calls[2][1];
    expect(contextCall3.length).toBe(9);
    expect(contextCall3[0].id).toBe('draw-1');

    mockGenerateMaster.mockRestore();
  });
});
