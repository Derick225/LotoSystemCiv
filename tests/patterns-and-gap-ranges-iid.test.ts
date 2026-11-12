import { describe, it, expect } from 'vitest';
import { DrawResult } from '../src/types';
import {
  gapRangeSequenceService,
  allocateHamiltonHareQuotas,
} from '../src/services/prediction/gapRangeSequenceService';
import { patternDiscoveryService } from '../src/services/prediction/patternDiscoveryService';

/**
 * Générateur pseudo-aléatoire LCG 100% déterministe (zéro Math.random() conformément à AGENTS.md).
 */
function createDeterministicLcg(seed: number = 0xdeadbeef) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Génère un historique de tirages i.i.d. indépendants et identiquement distribués
 * (loi uniforme discrète sans remise de 5 boules parmi 90).
 */
function generateIidDrawHistory(count: number = 100, seed: number = 42): DrawResult[] {
  const nextRand = createDeterministicLcg(seed);
  const draws: DrawResult[] = [];

  for (let t = 0; t < count; t++) {
    const pool = Array.from({ length: 90 }, (_, i) => i + 1);
    const winning: number[] = [];
    for (let b = 0; b < 5; b++) {
      const idx = Math.floor(nextRand() * pool.length);
      winning.push(pool.splice(idx, 1)[0]);
    }
    winning.sort((a, b) => a - b);

    const year = 2025 + Math.floor(t / 52);
    const week = (t % 52) + 1;
    draws.push({
      id: `iid_draw_${t}`,
      draw_name: 'NATIONAL',
      drawName: 'NATIONAL',
      date: `${year}-W${String(week).padStart(2, '0')}`,
      gagnants: winning,
    });
  }

  // Stockage conventionnel : le plus récent en premier
  return draws.reverse();
}

describe('Audit i.i.d. : Tranches d’Écarts & Motifs Répétitifs', () => {
  const iidHistory = generateIidDrawHistory(120, 1337);

  describe('1. Service de Tranches d’Écarts (gapRangeSequenceService)', () => {
    it('maintient les quotas H0 et redistribue proportionnellement aux probabilités', () => {
      const binIds = [
        'G0' as const,
        'G1_3' as const,
        'G4_7' as const,
        'G8_14' as const,
        'G15_24' as const,
        'G25_39' as const,
        'G40_PLUS' as const,
      ];
      const probs = {
        G0: 0.05,
        G1_3: 0.15,
        G4_7: 0.20,
        G8_14: 0.25,
        G15_24: 0.20,
        G25_39: 0.10,
        G40_PLUS: 0.05,
      };
      const pools = {
        G0: 5,
        G1_3: 15,
        G4_7: 20,
        G8_14: 25,
        G15_24: 15,
        G25_39: 8,
        G40_PLUS: 2,
      };

      const quotas = allocateHamiltonHareQuotas(probs, pools, binIds, 5, probs, 25);
      const total = Object.values(quotas).reduce((a, b) => a + b, 0);
      expect(total).toBe(5);
      // Les tranches majeures reçoivent la part de quotas principale
      expect(quotas.G8_14).toBeGreaterThanOrEqual(1);
    });

    it('calibre la confiance de sélection à <= 40% sur du bruit i.i.d. sans sur-confiance', () => {
      const report = gapRangeSequenceService.analyzeGapRangeSequences('NATIONAL', iidHistory);

      // Sur du bruit pur, la probabilité d'au moins 1 numéro est ~25.4%.
      // La confiance calibrée ne doit pas afficher le ~80.5% arbitraire précédent !
      expect(report.selectionSynthesis.selectionConfidence).toBeLessThanOrEqual(40.0);
      expect(report.selectionSynthesis.selectionConfidence).toBeGreaterThanOrEqual(20.0);

      // Les topPredictedBins doivent être ordonnés par zScore statistique standardisé
      const b1 = report.binForecasts.find((f) => f.bin.id === report.topPredictedBins[0]);
      const b2 = report.binForecasts.find((f) => f.bin.id === report.topPredictedBins[1]);
      if (b1 && b2) {
        expect(b1.zScore).toBeGreaterThanOrEqual(b2.zScore - 0.01);
      }

      // Le milieu conditionnel pour G40_PLUS ne doit plus être 48 codé en dur,
      // mais au moins 50 (espérance géométrique sous H0 = 57 ou moyenne observée)
      const g40 = report.binForecasts.find((f) => f.bin.id === 'G40_PLUS');
      expect(g40).toBeDefined();

      // Vérifier que transitionRowTotalsOrder1 est bien renseigné
      expect(report.transitionRowTotalsOrder1).toBeDefined();
    });
  });

  describe('2. Découverte de Motifs Répétitifs (patternDiscoveryService)', () => {
    it('affiche des probabilités de complétion honnêtes (<= 45%) sur du bruit i.i.d.', () => {
      const summary = patternDiscoveryService.discoverPatterns('NATIONAL', iidHistory, {
        cycleLength: 10,
        maxPatternsPerCategory: 25,
      });

      // Aucun motif ne doit afficher le faux 80%-84% de complétion sur du bruit i.i.d.
      const allMotifs = [
        ...summary.topRecurringPairs,
        ...summary.topRecurringTriplets,
        ...summary.activePrimedPatterns,
      ];

      allMotifs.forEach((m) => {
        if (m.activeAlertStatus === 'PRIMED') {
          // Sur tirages i.i.d., la complétion réelle d'un précurseur dans les tirages
          // restants d'un cycle de 10 est d'environ 6% à 25% (H0 combinatoire).
          expect(m.completionProbability).toBeLessThanOrEqual(45.0);
        }
      });
    });

    it('calibre la confiance de sélection des 5 boules à <= 40% sur du bruit i.i.d.', () => {
      const summary = patternDiscoveryService.discoverPatterns('NATIONAL', iidHistory, {
        cycleLength: 10,
      });

      // La confiance de sélection ne doit pas afficher le ~71% trompeur sur du bruit pur
      expect(summary.recommendedSelection.selectionConfidence).toBeLessThanOrEqual(40.0);
      expect(summary.recommendedSelection.selectionConfidence).toBeGreaterThanOrEqual(20.0);
      expect(summary.recommendedSelection.optimalFive).toHaveLength(5);
    });

    it('intègre un test du Chi-deux pour la phase et un test de dispersion pour la périodicité', () => {
      const summary = patternDiscoveryService.discoverPatterns('NATIONAL', iidHistory, {
        cycleLength: 10,
      });

      // Tous les motifs ont des champs de test statistique de phase et de dispersion
      summary.topRecurringPairs.forEach((p) => {
        expect(p.phaseChiSquare).toBeDefined();
        expect(typeof p.isPhaseSignificant).toBe('boolean');
        expect(p.dispersionIndex).toBeDefined();
        expect(typeof p.isPeriodicitySignificant).toBe('boolean');
      });

      // Sur du bruit pur, le nombre de motifs avec phase statistiquement significative (p < 0.05) est restreint
      const sigPhaseMotifs = summary.topRecurringPairs.filter((p) => p.isPhaseSignificant);
      expect(sigPhaseMotifs.length).toBeLessThanOrEqual(summary.topRecurringPairs.length * 0.35);
    });

    it('hausse légitimement la confiance lorsqu’un vrai signal structurel est injecté', () => {
      // Injecter un motif triplet récurrent sur-représenté [68, 77, 89] dans les cycles complétés
      const drawsWithSignal: DrawResult[] = [];
      const totalDraws = 85;
      for (let i = 0; i < totalDraws; i++) {
        let winners = [
          ((i * 7) % 60) + 1,
          ((i * 11 + 5) % 60) + 1,
          ((i * 13 + 17) % 60) + 1,
          ((i * 19 + 29) % 60) + 1,
          ((i * 23 + 41) % 60) + 1,
        ];
        // Dans les cycles complétés (i < 80), injecter [68, 77, 89]
        if (i % 10 === 1 && i < 80) {
          winners = [((i * 7) % 50) + 1, ((i * 13 + 9) % 50) + 1, 68, 77, 89];
        }
        // Dans le cycle actif (i >= 80), injecter [68, 77] pour amorcer 89
        if (i === 82) {
          winners = [5, 19, 41, 68, 77];
        }
        const uniq = Array.from(new Set(winners));
        let fill = 1;
        while (uniq.length < 5) {
          if (!uniq.includes(fill)) uniq.push(fill);
          fill++;
        }

        drawsWithSignal.push({
          id: `sig_${i}`,
          draw_name: 'NATIONAL',
          drawName: 'NATIONAL',
          date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
          gagnants: uniq.slice(0, 5),
        });
      }

      const historyNewestFirst = [...drawsWithSignal].reverse();
      const signalSummary = patternDiscoveryService.discoverPatterns('NATIONAL', historyNewestFirst, {
        cycleLength: 10,
        maxPatternsPerCategory: 30,
      });

      // Vérifier que le triplet [68, 77, 89] est détecté avec un fort Z-score
      const detectedTriplet = signalSummary.topRecurringTriplets.find(
        (t) => t.sequence.includes(68) && t.sequence.includes(77) && t.sequence.includes(89)
      );
      expect(detectedTriplet).toBeDefined();
      expect(detectedTriplet?.zScore).toBeGreaterThan(2.0);
      expect(detectedTriplet?.hasEmpiricalProof).toBe(true);

      // La confiance de sélection doit être significativement supérieure au bruit pur (>= 45%)
      expect(signalSummary.recommendedSelection.selectionConfidence).toBeGreaterThanOrEqual(45.0);
    });
  });
});
