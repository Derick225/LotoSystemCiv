import { describe, it, expect } from 'vitest';
import { generateCombination } from '../services/prediction/combinationGenerator';
import { analyzeForManipulation } from '../services/forensicAuditService';
import { ConceptDriftDetector } from '../services/prediction/conceptDriftDetector';
import { FALLBACK_CALIBRATION } from '../shared/prediction.types';
import { DrawResult } from '../types';

describe('Intégration HPC Extensions (Annealing Combinatoire & Lyapunov Topologique)', () => {
  it('generateCombination : Génération avec seed HPC de recuit simulé', async () => {
    const sortedScores = Array.from({ length: 90 }, (_, i) => ({
      num: i + 1,
      score: 50.0 + 40.0 * Math.sin((i + 1) * 0.15),
      confidence: 0.75,
    })).sort((a, b) => b.score - a.score);

    const affinityMap: Float32Array[] = Array.from({ length: 91 }, (_, i) => {
      const row = new Float32Array(91);
      for (let j = 1; j <= 90; j++) {
        row[j] = 0.5 + 0.5 * Math.cos((i - j) * 0.2);
      }
      return row;
    });

    const combo = await generateCombination(
      sortedScores,
      affinityMap,
      FALLBACK_CALIBRATION,
      1,
      [12, 34, 56, 78, 90],
      0.0,
      0.58
    );

    expect(combo).toBeDefined();
    expect(combo.length).toBe(5);
    // Vérifier l'unicité stricte des 5 numéros
    const unique = new Set(combo);
    expect(unique.size).toBe(5);
    combo.forEach(n => {
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(90);
    });
  });

  it('analyzeForManipulation : Calcul et exposition des métriques de Lyapunov & Chaos Topologique', () => {
    const mockHistory: DrawResult[] = [];
    for (let i = 0; i < 25; i++) {
      mockHistory.push({
        id: `draw-${i}`,
        date: `2026-02-${(i + 1).toString().padStart(2, '0')}`,
        nom_tirage: 'Reveil',
        gagnants: [
          1 + (i % 15),
          20 + (i % 15),
          40 + (i % 15),
          60 + (i % 15),
          80 + (i % 10),
        ],
      });
    }

    const audit = analyzeForManipulation(mockHistory[0].gagnants, mockHistory);
    expect(audit).toBeDefined();
    expect(audit.lyapunovChaosExponent).toBeDefined();
    expect(typeof audit.lyapunovChaosExponent).toBe('number');
    expect(typeof audit.isChaoticRegime).toBe('boolean');
    expect(audit.divergenceForce).toBeDefined();
    expect(audit.topologicalEntropy).toBeDefined();
  });

  it('ConceptDriftDetector : evaluateStructuralDrift intègre Lyapunov', () => {
    const detector = new ConceptDriftDetector();
    const mockHistory: { gagnants: number[]; drawName?: string }[] = [];
    for (let i = 0; i < 25; i++) {
      mockHistory.push({
        drawName: 'Reveil',
        gagnants: [
          1 + (i % 15),
          20 + (i % 15),
          40 + (i % 15),
          60 + (i % 15),
          80 + (i % 10),
        ],
      });
    }

    const res = detector.evaluateStructuralDrift(mockHistory, 'Reveil');
    expect(res.lyapunovExponent).toBeDefined();
    expect(typeof res.lyapunovExponent).toBe('number');
    expect(typeof res.isChaotic).toBe('boolean');
  });
});
