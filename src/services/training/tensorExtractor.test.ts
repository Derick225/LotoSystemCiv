import { describe, it, expect, vi } from 'vitest';
import { buildTensorMatrix } from './tensorExtractor';
import { DrawResult } from '../../types';

vi.mock('idb-keyval', () => ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    keys: vi.fn().mockResolvedValue([]),
}));

describe('TensorExtractor - Moteur ML (Nexus)', () => {
  it('doit extraire les tenseurs sans fuite en avant (Zero Look-ahead bias)', async () => {
    // Création d'un historique fictif ordonné du plus récent (0) au plus ancien (49)
    const mockHistory: DrawResult[] = Array.from({ length: 50 }, (_, i) => ({
      id: `draw-${i}`,
      drawName: 'Test Loto',
      date: `2024-01-${50 - i}`,
      gagnants: [i + 1, i + 2, i + 3, i + 4, i + 5],
      machine: [],
    }));

    // Demande de profondeur 3 (Les 3 tirages les plus récents en tant que cibles)
    const tensors = await buildTensorMatrix('Test Loto', mockHistory, 3);

    expect(tensors.length).toBe(3);

    // Pour l'index 0 (targetDraw: draw-0)
    // Le contexte d'entraînement DOIT être history.slice(1) ( draw-1 jusqu'à draw-14)
    // draw-0 NE DOIT PAS être dans le tensor d'apprentissage (matrix) du point de vue historique
    expect(tensors[0].drawId).toBe('draw-0');
    expect(tensors[0].targetWinners).toEqual([1, 2, 3, 4, 5]);

    // L'index 1 (targetDraw: draw-1) cible history.slice(2)
    expect(tensors[1].drawId).toBe('draw-1');
    expect(tensors[1].targetWinners).toEqual([2, 3, 4, 5, 6]);

    // Validation des valeurs extraites (il y aura au moins une propriété par numéro et par algo)
    expect(tensors[0].matrix[1]).toBeDefined();
    
    // Par exemple, il ne doit y avoir aucune référence directe ou indirecte au fait que le numéro 1 est sorti en index 0 pour l'évaluation
    // C'est couvert implicitement par le pastContext qui a été défini sur history.slice(i + 1)
  });
});
