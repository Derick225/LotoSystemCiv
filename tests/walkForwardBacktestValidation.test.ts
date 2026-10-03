import { describe, it, expect } from 'vitest';
import { runBacktestTraining } from '../services/backtestService';
import { denoiseFeaturesKernelPCA } from '../services/mathCore';
import { applyPCADenoising, ScoredNumber } from '../services/prediction/scoringEngine';
import { computeContinuousKellyAllocation } from '../components/KellyCalculator';
import { AlgoKey, AlgoWeights } from '../shared/prediction.types';
import { DrawResult } from '../types';

/**
 * Générateur déterministe d'historique réaliste avec structure de co-occurrence et persistance
 * Conforme AGENTS.md (Zéro hasard, 100% reproductible par LCG canonique).
 */
const buildStructuredDeterministicHistory = (
  drawName: string,
  count: number,
  seedInit: number,
  includeMachine: boolean = true
): DrawResult[] => {
  let state = seedInit >>> 0;
  const nextLcg = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };

  // Noyau récurrent d'attracteurs périodiques pour simuler un signal réel exploitable par Walk-Forward
  const coreAttractors = [7, 14, 23, 37, 42, 56, 68, 74, 81, 89];
  const history: DrawResult[] = [];

  for (let i = count; i >= 1; i--) {
    const winners = new Set<number>();
    // 2 à 3 numéros issus du bassin d'attracteurs cycliques + transitions harmoniques
    const phase = i % coreAttractors.length;
    winners.add(coreAttractors[phase]);
    winners.add(coreAttractors[(phase + 3) % coreAttractors.length]);

    while (winners.size < 5) {
      const candidate = Math.floor(nextLcg() * 90) + 1;
      winners.add(candidate);
    }

    const machine = new Set<number>();
    if (includeMachine) {
      while (machine.size < 5) {
        const m = Math.floor(nextLcg() * 90) + 1;
        if (!winners.has(m)) machine.add(m);
      }
    }

    const d = new Date(Date.UTC(2025, 0, 1 + (count - i)));
    const dateStr = `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;

    history.push({
      id: `${drawName}-${i}`,
      drawName,
      date: dateStr,
      gagnants: Array.from(winners).sort((a, b) => a - b),
      machine: includeMachine ? Array.from(machine).sort((a, b) => a - b) : [],
      version: 1,
    });
  }

  return history.reverse();
};

describe('Campagne Walk-Forward, Filtrage Kernel PCA (Huber-Wiener) & Allocation Kelly Continue', () => {
  describe('1. Validation par Backtesting Walk-Forward (Réseaux Hebdomadaire & Quotidien)', () => {
    it('exécute une campagne Walk-Forward causale sur Fortune Thursday (Hebdomadaire) et quantifie le Lift statistique', async () => {
      const history = buildStructuredDeterministicHistory('Fortune Thursday', 42, 77713, true);
      const report = await runBacktestTraining('Fortune Thursday', history, 8, undefined, undefined, true);

      expect(report).toBeDefined();
      expect(report.totalTests).toBeGreaterThanOrEqual(5);
      expect(report.averageHits).toBeGreaterThanOrEqual(0);
      expect(report.successRate).toBeGreaterThanOrEqual(0);
      expect(report.successRate).toBeLessThanOrEqual(100);
      expect(report.brier_score).toBeGreaterThanOrEqual(0);
      expect(report.brier_score).toBeLessThanOrEqual(1);
      expect(report.mrr).toBeGreaterThanOrEqual(0);
      expect(report.ndcg).toBeGreaterThanOrEqual(0);
      expect(report.stabilityScore).toBeGreaterThan(0);
      expect(report.confidence_intervals.avgHits).toHaveLength(2);

      // Espérance hypergéométrique théorique du hasard pur : E = 5 * 5 / 90 = 0.2778
      const randomExpectation = 25 / 90;
      const informationLift = report.averageHits / randomExpectation;
      console.info(
        `[WALK-FORWARD HEBDO - Fortune Thursday] Tests=${report.totalTests} | AvgHits=${report.averageHits} (Lift=${informationLift.toFixed(2)}x vs hasard) | SuccessRate=${report.successRate}% | Brier=${report.brier_score} | MRR=${report.mrr} | NDCG=${report.ndcg} | Score=${report.score.toFixed(2)}`
      );

      // Le moteur doit capter le signal récurrent avec un Lift > 1.0
      expect(informationLift).toBeGreaterThan(1.0);
    }, 45000);

    it('exécute une campagne Walk-Forward causale sur Reveil (Quotidien) et valide la reproductibilité déterministe', async () => {
      const history = buildStructuredDeterministicHistory('Reveil', 40, 42091, true);
      const reportA = await runBacktestTraining('Reveil', history, 6, undefined, undefined, true);
      const reportB = await runBacktestTraining('Reveil', history, 6, undefined, undefined, true);

      expect(reportA.totalHits).toBe(reportB.totalHits);
      expect(reportA.averageHits).toBe(reportB.averageHits);
      expect(reportA.brier_score).toBe(reportB.brier_score);
      expect(reportA.score).toBeCloseTo(reportB.score, 6);

      const randomExpectation = 25 / 90;
      const lift = reportA.averageHits / randomExpectation;
      console.info(
        `[WALK-FORWARD QUOTIDIEN - Reveil] Tests=${reportA.totalTests} | AvgHits=${reportA.averageHits} (Lift=${lift.toFixed(2)}x vs hasard) | SuccessRate=${reportA.successRate}% | Brier=${reportA.brier_score} | MRR=${reportA.mrr} | NDCG=${reportA.ndcg}`
      );
      expect(lift).toBeGreaterThan(1.0);
    }, 45000);
  });

  describe('2. Filtrage Kernel PCA & Porte de Préservation des Outsiders (Huber-Wiener)', () => {
    it('préserve strictement les colonnes constantes (ex: 0.0 pour machine_transfer inactif) sans distorsion', () => {
      const matrix: number[][] = [];
      for (let i = 0; i < 30; i++) {
        matrix.push([
          50 + 10 * Math.sin(i * 0.5),
          50 + 10 * Math.cos(i * 0.5),
          0, // Colonne inactive constante à 0
        ]);
      }

      const denoised = denoiseFeaturesKernelPCA(matrix);
      expect(denoised).toHaveLength(30);
      for (let i = 0; i < 30; i++) {
        // La colonne constante à 0 doit rester exactement à 0 (et non 1.839 comme avec l'ancien smoothClip)
        expect(denoised[i][2]).toBe(0);
        expect(denoised[i][0]).toBeGreaterThanOrEqual(0);
        expect(denoised[i][0]).toBeLessThanOrEqual(100);
      }
    });

    it('préserve les signaux rares à fort Z-score (outsiders) tout en lissant le bruit central dans applyPCADenoising', async () => {
      const weights: AlgoWeights = {
        [AlgoKey.FREQUENCY]: 0.35,
        [AlgoKey.GAPS]: 0.35,
        [AlgoKey.SPECTRAL]: 0.30,
      } as AlgoWeights;

      const masterScores: ScoredNumber[] = Array.from({ length: 90 }, (_, idx) => {
        const num = idx + 1;
        // Bruit central autour de 45 ± 2, et le numéro 77 présente un pic outsider fort (score 98.5 sur SPECTRAL)
        const baseFreq = num === 77 ? 47 : 45 + ((num * 7) % 5) - 2;
        const baseGaps = num === 77 ? 47 : 45 + ((num * 11) % 5) - 2;
        const spectralVal = num === 77 ? 98.5 : 45 + ((num * 3) % 5) - 2;

        return {
          num,
          score: (baseFreq + baseGaps + spectralVal) / 3,
          breakdown: {
            [AlgoKey.FREQUENCY]: baseFreq,
            [AlgoKey.GAPS]: baseGaps,
            [AlgoKey.SPECTRAL]: spectralVal,
          } as any,
          explainability: {
            shapValues: {},
            topologicalTension: 0,
            dnaOrbitingIndex: 0,
            effectiveWeights: {
              [AlgoKey.FREQUENCY]: 0.35,
              [AlgoKey.GAPS]: 0.35,
              [AlgoKey.SPECTRAL]: 0.30,
            },
          },
        };
      });

      const denoised = await applyPCADenoising(masterScores, weights, undefined, 0.90);
      const outsider77 = denoised.find((s) => s.num === 77)!;

      expect(outsider77).toBeDefined();
      // Grâce à la porte de Huber-Wiener, le pic spectral de l'outsider 77 (98.5, Z >> zCrit) est préservé à > 97
      expect(outsider77.breakdown[AlgoKey.SPECTRAL]).toBeGreaterThan(97.0);
      // Et le numéro 77 est hissé en tête du classement final
      expect(denoised[0].num).toBe(77);
    });
  });

  describe('3. Dimensionnement Financier de Kelly Continu (KellyCalculator)', () => {
    it('ajuste continûment la mise selon le régime thermodynamique (Hurst, Entropie, Volatilité) et la complexité combinatoire', () => {
      const persistentRegime = { regime: 'trend', hurst: 0.72, entropy: 0.35, volatility: 0.15 };
      const chaoticRegime = { regime: 'chaotic', hurst: 0.28, entropy: 0.88, volatility: 0.75 };

      const allocPersistent = computeContinuousKellyAllocation({
        confidence: 78,
        bankroll: 50000,
        gameMode: 'STANDARD',
        selectedBetType: '2N',
        portfolioMode: false,
        regime: persistentRegime,
      });

      const allocChaotic = computeContinuousKellyAllocation({
        confidence: 78,
        bankroll: 50000,
        gameMode: 'STANDARD',
        selectedBetType: '2N',
        portfolioMode: false,
        regime: chaoticRegime,
      });

      // En régime persistant à faible entropie, le modulateur et l'allocation sont strictement supérieurs au régime chaotique
      expect(allocPersistent.regimeModulator).toBeGreaterThan(allocChaotic.regimeModulator);
      expect(allocPersistent.edge).toBeGreaterThan(allocChaotic.edge);
      expect(allocPersistent.percentage).toBeGreaterThanOrEqual(allocChaotic.percentage);

      // Ordre combinatoire : à confiance modérée (68%), un pari 1N ou 2N a un meilleur Edge qu'un pari 5N (5 numéros)
      const alloc1N = computeContinuousKellyAllocation({
        confidence: 68,
        bankroll: 50000,
        gameMode: 'STANDARD',
        selectedBetType: '1N',
        portfolioMode: false,
        regime: persistentRegime,
      });
      const alloc5N = computeContinuousKellyAllocation({
        confidence: 68,
        bankroll: 50000,
        gameMode: 'STANDARD',
        selectedBetType: '5N',
        portfolioMode: false,
        regime: persistentRegime,
      });

      expect(alloc1N.edge).toBeGreaterThan(alloc5N.edge);
      expect(alloc5N.betAmount).toBe(0); // Protection du capital sur 5N lorsque la confiance n'atteint pas le seuil critique
    });
  });
});
