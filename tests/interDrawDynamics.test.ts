import { describe, it, expect } from 'vitest';
import {
  computeGraphHeatKernelHpc,
  computeDominoAdvectionHpc,
  computeButterflyLyapunovHpc,
  computeChainReactionResonanceHpc
} from '../services/wasm/lotoEngineBridge';
import {
  computeInterDrawComplexDynamics,
  InterDrawComplexDynamicsReport
} from '../services/interDrawDynamicsService';
import {
  generateInterDrawReport,
  generateNetworkInterconnectionMatrix
} from '../services/interDrawService';
import { generateDeterministicFallbackHistory } from '../services/lotteryService';
import { INTER_DRAW_NETWORKS } from '../constants';

describe('DYNAMIQUES COMPLEXES INTER-TIRAGES SELON AGENTS.md', () => {
  const mockHistTarget = generateDeterministicFallbackHistory('Fortune', 30);
  const mockHistPred = generateDeterministicFallbackHistory('Premiere Heure', 30);

  describe('1. Invariants Mathématiques & Déterminisme Absolu (AGENTS.md)', () => {
    it('doit être 100% déterministe et reproductible au bit près', async () => {
      const netMatrix = await generateNetworkInterconnectionMatrix('quotidien');

      const rep1 = await computeInterDrawComplexDynamics(
        'Fortune',
        'quotidien',
        mockHistTarget,
        mockHistPred,
        netMatrix
      );

      const rep2 = await computeInterDrawComplexDynamics(
        'Fortune',
        'quotidien',
        mockHistTarget,
        mockHistPred,
        netMatrix
      );

      // Reproductibilité stricte
      expect(rep1.domino.leadTriggerNumbers).toEqual(rep2.domino.leadTriggerNumbers);
      expect(rep1.butterfly.lyapunovExponent).toBe(rep2.butterfly.lyapunovExponent);
      expect(rep1.butterfly.sensitivityRegime).toBe(rep2.butterfly.sensitivityRegime);
      expect(rep1.cascade.diffusionTimeT).toBe(rep2.cascade.diffusionTimeT);
      expect(rep1.chainReaction.avalancheCriticalNumbers).toEqual(rep2.chainReaction.avalancheCriticalNumbers);
      expect(rep1.compositeDynamicScore).toEqual(rep2.compositeDynamicScore);
    });

    it('zéro nombres magiques : les paramètres sont dérivés de fonctions continues différentiables', async () => {
      const netMatrix = await generateNetworkInterconnectionMatrix('quotidien');
      const rep = await computeInterDrawComplexDynamics(
        'Fortune',
        'quotidien',
        mockHistTarget,
        mockHistPred,
        netMatrix
      );

      // Damping gamma dérivé de la variance temporelle
      expect(rep.domino.dampingGamma).toBeGreaterThan(0.05);
      expect(rep.domino.dampingGamma).toBeLessThan(2.0);

      // Temps de diffusion dérivé de la sensibilité
      expect(rep.cascade.diffusionTimeT).toBeGreaterThan(0.1);
      expect(rep.cascade.diffusionTimeT).toBeLessThan(3.0);

      // Sensibilité continue sur [0, 1]
      expect(rep.butterfly.sensitivityRegime).toBeGreaterThanOrEqual(0.0);
      expect(rep.butterfly.sensitivityRegime).toBeLessThanOrEqual(1.0);
    });

    it('isolation hermétique des 2 réseaux : Hebdomadaire (6) vs Quotidien (22)', async () => {
      const matrixHebdo = await generateNetworkInterconnectionMatrix('hebdomadaire');
      const matrixQuotidien = await generateNetworkInterconnectionMatrix('quotidien');

      expect(matrixHebdo.drawNames.length).toBe(6);
      expect(matrixQuotidien.drawNames.length).toBe(22);

      // Les nœuds d'un réseau ne sont jamais dans l'autre
      for (const name of matrixHebdo.drawNames) {
        expect(matrixQuotidien.drawNames).not.toContain(name);
      }
    });
  });

  describe('2. Effet Domino (Advection Cinétique & Ondes de Réverbération)', () => {
    it('calcule correctement la propagation séquentielle et la réverbération', () => {
      const flatHistory = new Int32Array([
        10, 20, 30, 40, 50,
        12, 22, 32, 42, 52,
        15, 25, 35, 45, 55,
      ]);

      const res = computeDominoAdvectionHpc(flatHistory, 3, 0.4);

      expect(res.leadTriggerNumbers.length).toBe(5);
      expect(res.dominoEnergies.length).toBe(91);

      // Tous les numéros leaders doivent être valides dans [1, 90]
      for (const n of res.leadTriggerNumbers) {
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(90);
      }

      // Les numéros récemment sortis doivent avoir une énergie cinétique supérieure aux numéros inactifs
      expect(res.dominoEnergies[10]).toBeGreaterThan(res.dominoEnergies[89]);
    });
  });

  describe('3. Effet Papillon (Exposant de Lyapunov & Attracteur Espace des Phases)', () => {
    it('calcule la divergence logarithmique et le régime chaotique de façon continue', () => {
      const lagSeries = new Float64Array([2.1, -1.4, 3.2, 0.5, -2.8, 1.9, -0.4, 2.7]);
      const res = computeButterflyLyapunovHpc(lagSeries, 0.58);

      expect(typeof res.lyapunovExponent).toBe('number');
      expect(res.sensitivityRegime).toBeGreaterThan(0);
      expect(res.sensitivityRegime).toBeLessThan(1);
      expect(res.phaseAttractorZ).toBe(0.58); // Hurst
      expect(typeof res.isChaotic).toBe('boolean');
    });
  });

  describe('4. Effet de Cascade (Graph Heat Kernel exp(-tL))', () => {
    it('génère une matrice de diffusion stochastique valide (somme des lignes = 1)', () => {
      const n = 6;
      const weights = new Float64Array(n * n);
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          weights[i * n + j] = i === j ? 1.0 : 0.2 + (i + j) * 0.05;
        }
      }

      const res = computeGraphHeatKernelHpc(weights, n, 0.5);

      expect(res.diffusionMatrix.length).toBe(n * n);
      expect(res.harmonicCentralities.length).toBe(n);
      expect(res.traceEnergy).toBeGreaterThan(0);

      // Vérification de la normalisation stochastique par ligne
      for (let i = 0; i < n; i++) {
        let rowSum = 0;
        for (let j = 0; j < n; j++) {
          rowSum += res.diffusionMatrix[i * n + j];
        }
        expect(rowSum).toBeCloseTo(1.0, 4);
      }
    });
  });

  describe('5. Réaction en Chaîne (SOC & Résonance d\'Interférence d\'Ondes)', () => {
    it('identifie les pics de synchronisation critique et la densité de percolation', () => {
      const recentFlat = new Int32Array([
        5, 12, 33, 44, 78,
        5, 14, 22, 59, 81,
        12, 33, 49, 60, 77
      ]);
      const couplings = new Float64Array([0.45, 0.32, 0.67]);

      const res = computeChainReactionResonanceHpc(recentFlat, 3, couplings, 3);

      expect(res.avalancheCriticalNumbers.length).toBe(5);
      expect(res.resonanceSpectrum.length).toBe(91);
      expect(res.percolationDensity).toBeGreaterThan(0);
      expect(res.maxConstructiveAmplitude).toBeGreaterThan(0);
    });
  });

  describe('6. Intégration de Bout en Bout dans le Rapport Inter-Tirages', () => {
    it('generateInterDrawReport intègre automatiquement complexDynamics pour le Réseau Hebdomadaire', async () => {
      const report = await generateInterDrawReport('National', 'hebdomadaire', true);

      expect(report).toBeDefined();
      expect(report?.complexDynamics).toBeDefined();
      if (report?.complexDynamics) {
        expect(report.complexDynamics.domino.leadTriggerNumbers.length).toBe(5);
        expect(report.complexDynamics.cascade.primaryConductors.length).toBeGreaterThan(0);
        expect(report.complexDynamics.topDynamicCandidates.length).toBe(10);
      }
    });

    it('generateInterDrawReport intègre automatiquement complexDynamics pour le Réseau Quotidien', async () => {
      const report = await generateInterDrawReport('Fortune', 'quotidien', true);

      expect(report).toBeDefined();
      expect(report?.complexDynamics).toBeDefined();
      if (report?.complexDynamics) {
        expect(report.complexDynamics.butterfly.sensitivityRegime).toBeGreaterThanOrEqual(0);
        expect(report.complexDynamics.chainReaction.avalancheCriticalNumbers.length).toBe(5);
        expect(report.complexDynamics.topDynamicCandidates.length).toBe(10);
      }
    });
  });
});
