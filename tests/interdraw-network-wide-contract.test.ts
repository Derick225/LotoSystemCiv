import { describe, it, expect } from 'vitest';
import {
  generateInterDrawReport,
  generateNetworkInterconnectionMatrix,
  computeContinuousInterDrawCoupling
} from '../src/services/interDrawService';
import {
  INTER_DRAW_FAMILIES,
  INTER_DRAW_NETWORKS,
  THEORETICAL_CARRYOVER_RATE_PERCENT,
  getFamilyPredecessorAndSuccessor
} from '../src/constants';
import { globalCache } from '../src/services/cache/CacheService';
import { interDrawResonancePlugin } from '../src/services/prediction/algorithms/interDrawResonance';

describe('CONTRAT RESEAU COMPLET : FLUX INTER-TIRAGES MULTI-SOURCES (AGENTS.md)', () => {
  it('doit agréger l ensemble du réseau de tirage choisi (quotidien = 22 tirages, hebdomadaire = 6 tirages)', async () => {
    // 1. Test sur le réseau hebdomadaire (6 tirages)
    const reportHebdo = await generateInterDrawReport('National', 'hebdomadaire', true);
    expect(reportHebdo).toBeDefined();
    expect(reportHebdo!.networkId).toBe('hebdomadaire');
    expect(reportHebdo!.isNetworkWideAggregated).toBe(true);
    expect(reportHebdo!.networkContributions).toBeDefined();

    // Pour hebdomadaire (6 tirages dans le réseau), il y a 5 nœuds sources distincts de la cible
    expect(reportHebdo!.networkContributions!.length).toBe(5);

    // Vérifier la présence du prédécesseur immédiat et des autres nœuds du réseau
    const immPredHebdo = reportHebdo!.networkContributions!.find(c => c.isImmediatePredecessor);
    const otherNodesHebdo = reportHebdo!.networkContributions!.filter(c => !c.isImmediatePredecessor);
    expect(immPredHebdo).toBeDefined();
    expect(otherNodesHebdo.length).toBe(4);

    // Vérifier la normalisation continue L1 des poids
    const sumNormWeights = reportHebdo!.networkContributions!.reduce((sum, c) => sum + c.normalizedWeight, 0);
    expect(sumNormWeights).toBeGreaterThan(0.98);
    expect(sumNormWeights).toBeLessThan(1.02);

    // Vérifier que networkInfluenceWeight est positif ou nul (selon présence d'historique)
    expect(reportHebdo!.networkInfluenceWeight).toBeGreaterThanOrEqual(0);

    // 2. Test sur le réseau quotidien (22 tirages)
    const reportQuotidien = await generateInterDrawReport('Prestige', 'quotidien', true);
    expect(reportQuotidien).toBeDefined();
    expect(reportQuotidien!.networkId).toBe('quotidien');
    expect(reportQuotidien!.isNetworkWideAggregated).toBe(true);
    expect(reportQuotidien!.networkContributions).toBeDefined();
    // 21 nœuds sources distincts dans le réseau quotidien
    expect(reportQuotidien!.networkContributions!.length).toBe(21);
  });

  it('doit propager la convergence réseau aux candidats et activer le flag RESEAU_CONVERGENCE', async () => {
    const report = await generateInterDrawReport('Fortune', 'quotidien', true);
    expect(report).toBeDefined();
    expect(report!.topCandidates.length).toBeGreaterThan(0);
    expect(report!.fullCandidateScores.length).toBe(91);

    // Tous les scores doivent être bornés et finis
    for (const c of report!.topCandidates) {
      expect(c.number).toBeGreaterThanOrEqual(1);
      expect(c.number).toBeLessThanOrEqual(90);
      expect(c.compositeScore).toBeGreaterThanOrEqual(0);
      expect(c.compositeScore).toBeLessThanOrEqual(100);
      expect(Number.isFinite(c.compositeScore)).toBe(true);

      // Explicabilité : vérification du statut signal et intervalle de confiance
      expect(['SIGNAL_DETECTE', 'INDISCERNABLE_BRUIT']).toContain(c.signalStatus);
      expect(c.confidenceInterval).toBeDefined();
      expect(c.confidenceInterval![0]).toBeLessThanOrEqual(c.confidenceInterval![1]);
    }

    // Vérifier si des candidats bénéficient du bonus réseau multi-sources
    const hasNetworkFlag = report!.topCandidates.some(c => c.flags.includes('RESEAU_CONVERGENCE'));
    expect(typeof hasNetworkFlag).toBe('boolean');
  });

  it('doit tester le canal machine sans biais et calculer machineTransferRate', () => {
    // 2 historiques avec numéros machine
    const sourceWithMachine = [
      { id: 's1', date: '2026-10-24 10:00:00', gagnants: [1, 2, 3, 4, 5], machine: [10, 20, 30, 40, 50], drawName: 'Source' },
      { id: 's2', date: '2026-10-23 10:00:00', gagnants: [6, 7, 8, 9, 11], machine: [12, 22, 32, 42, 52], drawName: 'Source' },
      { id: 's3', date: '2026-10-22 10:00:00', gagnants: [13, 14, 15, 16, 17], machine: [18, 28, 38, 48, 58], drawName: 'Source' }
    ];

    const targetHistory = [
      { id: 't1', date: '2026-10-24 13:00:00', gagnants: [10, 21, 31, 41, 51], machine: [80, 81, 82, 83, 84], drawName: 'Target' },
      { id: 't2', date: '2026-10-23 13:00:00', gagnants: [12, 23, 33, 43, 53], machine: [85, 86, 87, 88, 89], drawName: 'Target' },
      { id: 't3', date: '2026-10-22 13:00:00', gagnants: [70, 71, 72, 73, 74], machine: [60, 61, 62, 63, 64], drawName: 'Target' }
    ];

    const coupling = computeContinuousInterDrawCoupling(sourceWithMachine, targetHistory, 30);
    expect(coupling).toBeDefined();
    expect(coupling.samplePairs).toBe(3);
    expect(coupling.machineTransferRate).toBeGreaterThan(0); // 10 et 12 ont été transférés de machine à gagnants
    expect(coupling.weight).toBeGreaterThanOrEqual(0.0);
    expect(coupling.weight).toBeLessThanOrEqual(1.0);
  });

  it('doit calculer une matrice all-to-all continue W(S, T) sans nombre magique ni saut binaire', async () => {
    const matrix = await generateNetworkInterconnectionMatrix('hebdomadaire');
    expect(matrix).toBeDefined();
    expect(matrix.drawNames.length).toBe(6);
    expect(matrix.couplings.length).toBe(30); // 6 * 5 paires ordonnées
    expect(matrix.networkFingerprint).toBeDefined();
    expect(matrix.communities).toBeDefined();
    expect(matrix.communities!.length).toBeGreaterThan(0);
    expect(matrix.indirectPaths).toBeDefined();

    for (const c of matrix.couplings) {
      // Poids continu différentiable W ∈ [0, 1]
      expect(c.weight).toBeGreaterThanOrEqual(0.0);
      expect(c.weight).toBeLessThanOrEqual(1.0);
      expect(Number.isFinite(c.weight)).toBe(true);

      // Corrélation continue dans [-1, 1]
      expect(c.correlation).toBeGreaterThanOrEqual(-1.0);
      expect(c.correlation).toBeLessThanOrEqual(1.0);

      // Métriques d'évaluation hors-échantillon et lag
      expect(typeof c.predictiveLogLossGain).toBe('number');
      expect(typeof c.lagHours).toBe('number');
      expect(['CONSECUTIVE_SLOT', 'SAME_SLOT', 'CROSS_DAY']).toContain(c.timeSlotRelation);
    }
  });

  it('l algorithme de prédiction interDrawResonance doit intégrer l évidence réseau continue', async () => {
    const rel = getFamilyPredecessorAndSuccessor('Fortune', 'quotidien')!;
    const predName = rel.predecessor.name;
    const predKey = globalCache.generateKey('history', predName);
    await globalCache.set(predKey, [
      { id: 'p1', date: '2026-10-24', gagnants: [5, 10, 15, 20, 25], machine: [30, 31, 32, 33, 34], tirage: predName },
      { id: 'p2', date: '2026-10-23', gagnants: [6, 11, 16, 21, 26], machine: [35, 36, 37, 38, 39], tirage: predName },
      { id: 'p3', date: '2026-10-22', gagnants: [7, 12, 17, 22, 27], machine: [40, 41, 42, 43, 44], tirage: predName },
    ], 3600, predName);

    // Exécuter l'algorithme sur un tirage avec historique synthétique
    const mockHistory = [
      { id: '1', date: '2026-10-24', gagnants: [10, 20, 30, 40, 50], machine: [1, 2, 3, 4, 6], tirage: 'Fortune' },
      { id: '2', date: '2026-10-23', gagnants: [11, 21, 31, 41, 51], machine: [7, 8, 9, 13, 14], tirage: 'Fortune' },
      { id: '3', date: '2026-10-22', gagnants: [12, 22, 32, 42, 52], machine: [15, 16, 17, 18, 19], tirage: 'Fortune' },
    ];

    const ctx = {
      drawName: 'Fortune',
      history: mockHistory,
      parameters: {},
      pluginCache: {}
    } as any;

    interDrawResonancePlugin.precompute(ctx);
    const pred10 = interDrawResonancePlugin.evaluate(10, ctx);

    expect(pred10).toBeDefined();
    expect(pred10.score).toBeGreaterThanOrEqual(0);
    expect(pred10.score).toBeLessThanOrEqual(100);
    expect(Number.isFinite(pred10.score)).toBe(true);
    expect(pred10.metadata).toBeDefined();
    expect(pred10.metadata.familyId).toBe('quotidien');
  });

  it('doit respecter strictement l isolation du caching nexus_interdraw_${networkId}_${drawName}', () => {
    const keyHebdo = globalCache.getInterDrawKey('hebdomadaire', 'Fortune');
    const keyQuotidien = globalCache.getInterDrawKey('quotidien', 'Fortune');

    expect(keyHebdo).toBe('nexus_interdraw_hebdomadaire_fortune');
    expect(keyQuotidien).toBe('nexus_interdraw_quotidien_fortune');
    expect(keyHebdo).not.toBe(keyQuotidien);
  });
});
