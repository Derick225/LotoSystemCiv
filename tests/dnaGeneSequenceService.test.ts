import { describe, it, expect } from 'vitest';
import {
  synthesizeDnaGeneSequenceAndWeights,
  runUnifiedDnaGeneSequencer,
  computeNormalizedKendallTauDistance,
  computeNormalizedSpearmanFootrule,
  getChromosomalArm,
} from '../src/services/prediction/dnaGeneSequenceService';
import {
  recordModelDnaVersion,
  getModelEvolutionLineage,
  computeSequenceKendallTauShift,
} from '../src/services/prediction/modelDnaKnowledgeBase';
import { synthesizePostMortemLearningSession } from '../src/services/forensicTrainingBridge';
import { getDefaultWeights, type AlgoProofMetric } from '../src/services/prediction/weightsManager';
import { AlgoKey } from '../src/shared/prediction.types';
import type { DrawResult, ForensicReport } from '../src/types';

function makeDeterministicHistory(drawName: string, count: number): DrawResult[] {
  const draws: DrawResult[] = [];
  for (let i = 0; i < count; i++) {
    const day = 28 - (i % 28);
    const month = 1 + (Math.floor(i / 28) % 12);
    const year = 2025 - Math.floor(i / 336);
    const dd = String(day).padStart(2, '0');
    const mm = String(month).padStart(2, '0');
    const base = (i * 7 + 3) % 90;
    const nums = [0, 1, 2, 3, 4].map((k) => ((base + k * 13) % 90) + 1);
    draws.push({
      id: `draw_${i}`,
      drawName,
      date: `${dd}/${mm}/${year}`,
      gagnants: nums,
    });
  }
  return draws;
}

function buildProofMap(provenKeys: AlgoKey[]): Record<AlgoKey, AlgoProofMetric> {
  const map = {} as Record<AlgoKey, AlgoProofMetric>;
  for (const key of Object.values(AlgoKey)) {
    const isProven = provenKeys.includes(key);
    map[key] = {
      hasProof: isProven,
      proofScore: isProven ? 3.2 : 0,
      empiricalHitRate: isProven ? 0.08 : 0.055,
      baselineRate: 5 / 90,
      confidence: isProven ? 0.99 : 0.5,
      pValue: isProven ? 0.0007 : 0.46,
      qValue: isProven ? 0.008 : 0.85,
    };
  }
  return map;
}

function makeShapleyVector(overrides: Partial<Record<AlgoKey, number>>): Record<AlgoKey, number> {
  const vec = {} as Record<AlgoKey, number>;
  for (const key of Object.values(AlgoKey)) {
    vec[key] = overrides[key] ?? 0.02;
  }
  return vec;
}

function makePostMortemReport(
  drawName: string,
  date: string,
  overrides?: Partial<ForensicReport>
): ForensicReport {
  return {
    id: `rep_${date}`,
    predictionId: `pred_${date}`,
    drawName,
    date,
    combo: [5, 18, 31, 44, 72],
    matches: [],
    missedOpportunities: [],
    scoreDivergence: [],
    aiAnalysis: 'Post-mortem synthesis test',
    suspicionScore: 15,
    proposedAdjustments: [
      {
        algo: AlgoKey.BAYES,
        proposedWeightChange: 0.06,
        reason: 'Brier gain confirmé',
      },
      {
        algo: AlgoKey.FREQUENCY,
        proposedWeightChange: -0.04,
        reason: 'Sur-concentration',
      },
    ],
    counterfactuals: [
      {
        algo: `${AlgoKey.BAYES}+${AlgoKey.SPECTRAL}`,
        originalWeight: 0.04,
        optimalWeight: 0.09,
        potentialHits: 2,
        potentialNumbers: [5, 18],
        improvement: 18,
        action: 'SYNERGY',
        rankImprovement: 6,
        description: 'Synergie Bayesienne + Spectrale observée',
      },
    ],
    winningXAP: [
      {
        number: 5,
        dominantAlgo: AlgoKey.BAYES,
        contributionPercentage: 35,
        dnaVector: makeShapleyVector({
          [AlgoKey.BAYES]: 0.25,
          [AlgoKey.SPECTRAL]: 0.22,
          [AlgoKey.GAPS]: 0.15,
        }),
        shapleyValues: makeShapleyVector({
          [AlgoKey.BAYES]: 0.25,
          [AlgoKey.SPECTRAL]: 0.22,
          [AlgoKey.GAPS]: 0.15,
        }),
      },
      {
        number: 18,
        dominantAlgo: AlgoKey.BAYES,
        contributionPercentage: 38,
        dnaVector: makeShapleyVector({
          [AlgoKey.BAYES]: 0.28,
          [AlgoKey.SPECTRAL]: 0.24,
          [AlgoKey.MARKOV]: 0.14,
        }),
        shapleyValues: makeShapleyVector({
          [AlgoKey.BAYES]: 0.28,
          [AlgoKey.SPECTRAL]: 0.24,
          [AlgoKey.MARKOV]: 0.14,
        }),
      },
    ],
    ...overrides,
  };
}

describe('dnaGeneSequenceService (EpiGenome-SQ)', () => {
  it('est 100% déterministe et conserve strictement la somme simplexe = 1', () => {
    const drawName = 'MONDAY SPECIAL';
    const history = makeDeterministicHistory(drawName, 30);
    const weights = getDefaultWeights();
    const reports = [makePostMortemReport(drawName, '20/01/2025')];

    const res1 = synthesizeDnaGeneSequenceAndWeights({
      drawName,
      history,
      currentWeights: weights,
      forensicReports: reports,
      proofMapOverride: buildProofMap([AlgoKey.BAYES, AlgoKey.SPECTRAL]),
    });

    const res2 = synthesizeDnaGeneSequenceAndWeights({
      drawName,
      history,
      currentWeights: weights,
      forensicReports: reports,
      proofMapOverride: buildProofMap([AlgoKey.BAYES, AlgoKey.SPECTRAL]),
    });

    expect(res1.geneSequence.map((g) => g.key)).toEqual(res2.geneSequence.map((g) => g.key));
    expect(res1.optimizedWeights).toEqual(res2.optimizedWeights);
    expect(res1.sequenceMetrics.sequenceSignature).toBe(res2.sequenceMetrics.sequenceSignature);
    expect(res1.epistaticCouplings).toEqual(res2.epistaticCouplings);

    const sumWeights = Object.values(res1.optimizedWeights).reduce((s, w) => s + w, 0);
    expect(sumWeights).toBeCloseTo(1.0, 5);

    for (const w of Object.values(res1.optimizedWeights)) {
      expect(w).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(w)).toBe(true);
    }

    // Aucun numéro machine dans l'historique -> MACHINE_TRANSFER neutralisé à 0
    expect(res1.optimizedWeights[AlgoKey.MACHINE_TRANSFER]).toBe(0);
    const machineNode = res1.geneSequence.find((g) => g.key === AlgoKey.MACHINE_TRANSFER);
    expect(machineNode?.expressionState).toBe('SILENCED');
  });

  it('applique la garde empirique Benjamini-Hochberg : aucun gène non prouvé ne dépasse son poids initial', () => {
    const drawName = 'LUCKY TUESDAY';
    const history = makeDeterministicHistory(drawName, 25);
    const weights = getDefaultWeights();

    // Seul BAYES possède une preuve empirique ; FREQUENCY et GAPS n'en ont pas
    // même si le rapport post-mortem propose un boost sur GAPS.
    const report = makePostMortemReport(drawName, '15/01/2025', {
      proposedAdjustments: [
        { algo: AlgoKey.BAYES, proposedWeightChange: 0.08, reason: 'Proven' },
        { algo: AlgoKey.GAPS, proposedWeightChange: 0.12, reason: 'Unproven boost attempt' },
      ],
    });

    const res = synthesizeDnaGeneSequenceAndWeights({
      drawName,
      history,
      currentWeights: weights,
      forensicReports: [report],
      proofMapOverride: buildProofMap([AlgoKey.BAYES]),
    });

    expect(res.optimizedWeights[AlgoKey.GAPS]).toBeLessThanOrEqual(
      res.initialWeights[AlgoKey.GAPS] + 1e-6
    );
    expect(res.optimizedWeights[AlgoKey.BAYES]).toBeGreaterThan(
      res.initialWeights[AlgoKey.BAYES]
    );
  });

  it('détecte les couplages épistasiques symétriques et découvre des codons synergiques depuis XAP et SYNERGY', () => {
    const drawName = 'NATIONAL';
    const history = makeDeterministicHistory(drawName, 30);
    const weights = getDefaultWeights();
    const reports = [
      makePostMortemReport(drawName, '21/01/2025'),
      makePostMortemReport(drawName, '14/01/2025'),
    ];

    const res = synthesizeDnaGeneSequenceAndWeights({
      drawName,
      history,
      currentWeights: weights,
      forensicReports: reports,
      proofMapOverride: buildProofMap([AlgoKey.BAYES, AlgoKey.SPECTRAL, AlgoKey.GAPS]),
    });

    const pair = res.epistaticCouplings.find(
      (c) =>
        (c.geneA === AlgoKey.BAYES && c.geneB === AlgoKey.SPECTRAL) ||
        (c.geneA === AlgoKey.SPECTRAL && c.geneB === AlgoKey.BAYES)
    );
    expect(pair).toBeDefined();
    expect(pair!.couplingStrength).toBeGreaterThan(0);
    expect(pair!.couplingStrength).toBeLessThanOrEqual(1);
    expect(res.codons.length).toBeGreaterThan(0);
    expect(res.codons.some((c) => c.genes.includes(AlgoKey.BAYES))).toBe(true);
  });

  it('filtre strictement les rapports d autres tirages et respecte la coupure causale anti-fuite', () => {
    const drawName = 'MIDWEEK';
    const history = makeDeterministicHistory(drawName, 20); // dates <= 2025
    const weights = getDefaultWeights();

    const otherDrawReport = makePostMortemReport('ESPOIR', '10/01/2025');
    const futureReport = makePostMortemReport(drawName, '28/12/2026');
    const validReport = makePostMortemReport(drawName, '10/01/2025');

    const res = synthesizeDnaGeneSequenceAndWeights({
      drawName,
      history,
      currentWeights: weights,
      forensicReports: [otherDrawReport, futureReport, validReport],
      proofMapOverride: buildProofMap([AlgoKey.BAYES]),
    });

    expect(res.sourcesUsed.forensicReports).toBe(1);
  });

  it('calcule correctement les métriques d ordre de séquence Kendall-Tau, Spearman et les bras chromosomiques', () => {
    const seqA = [AlgoKey.BAYES, AlgoKey.SPECTRAL, AlgoKey.GAPS, AlgoKey.MARKOV];
    const seqReversed = [...seqA].reverse();

    expect(computeNormalizedKendallTauDistance(seqA, seqA)).toBe(0);
    expect(computeNormalizedKendallTauDistance(seqA, seqReversed)).toBeCloseTo(1, 6);
    expect(computeNormalizedSpearmanFootrule(seqA, seqA)).toBe(0);
    expect(computeNormalizedSpearmanFootrule(seqA, seqReversed)).toBeCloseTo(1, 6);

    expect(getChromosomalArm(AlgoKey.BAYES)).toBe('STOCHASTIC_INFERENCE');
    expect(getChromosomalArm(AlgoKey.GAPS)).toBe('TEMPORAL_CADENCE');
    expect(getChromosomalArm(AlgoKey.SPECTRAL)).toBe('SPECTRAL_FRACTAL');
    expect(getChromosomalArm(AlgoKey.SPATIAL)).toBe('TOPOLOGICAL_TRANSFER');
  });

  it('intègre la synthèse post-mortem dans forensicTrainingBridge', async () => {
    const drawName = 'FRIDAY BONANZA';
    const history = makeDeterministicHistory(drawName, 25);
    const weights = getDefaultWeights();
    const reports = [makePostMortemReport(drawName, '12/01/2025')];

    const session = await synthesizePostMortemLearningSession(reports, history, weights);

    expect(session.drawName).toBe(drawName);
    expect(session.sequenceSignature).toContain('SEQ-[');
    expect(session.adjustments?.length).toBe(Object.values(AlgoKey).length);
    expect(session.epistaticCoherenceScore).toBeGreaterThanOrEqual(0);
    expect(session.epistaticCoherenceScore).toBeLessThanOrEqual(100);
  });

  it('archive le profil de séquence génique dans ModelDnaRecord et calcule les métriques longitudinales de dérive', async () => {
    const drawName = 'TEST_SEQ_LINEAGE_ISO';
    const w1 = getDefaultWeights();
    const w2 = {
      ...w1,
      [AlgoKey.BAYES]: (w1[AlgoKey.BAYES] || 0) + 0.12,
      [AlgoKey.SPECTRAL]: (w1[AlgoKey.SPECTRAL] || 0) + 0.08,
      [AlgoKey.FREQUENCY]: 0.001,
    };

    const rec1 = await recordModelDnaVersion({
      drawName,
      version: 'v_seq_1',
      timestamp: '2025-01-10T10:00:00.000Z',
      origin: 'INITIAL',
      weights: w1,
      performance: { score: 0.42 },
      causalAuditTrail: ['Baseline initiale'],
    });

    expect(rec1.sequenceProfile).toBeDefined();
    expect(rec1.sequenceProfile!.sequenceSignature).toContain('SEQ-[');
    expect(rec1.sequenceProfile!.orderedGenes.length).toBeGreaterThan(5);
    expect(rec1.sequenceProfile!.kendallTauShiftFromPrevious).toBe(0);

    const rec2 = await recordModelDnaVersion({
      drawName,
      version: 'v_seq_2',
      timestamp: '2025-01-11T10:00:00.000Z',
      origin: 'GENETIC_EVOLUTION',
      weights: w2,
      performance: { score: 0.48 },
      causalAuditTrail: ['Mutation de séquence'],
    });

    const expectedShift = computeSequenceKendallTauShift(
      rec1.sequenceProfile!.orderedGenes,
      rec2.sequenceProfile!.orderedGenes
    );
    expect(rec2.sequenceProfile!.kendallTauShiftFromPrevious).toBeCloseTo(expectedShift, 4);
    expect(expectedShift).toBeGreaterThan(0);

    const lineage = await getModelEvolutionLineage(drawName);
    expect(lineage.totalGenerations).toBe(2);
    expect(lineage.latestSequenceSignature).toBe(rec2.sequenceProfile!.sequenceSignature);
    expect(lineage.meanKendallTauShift).toBeCloseTo(expectedShift, 4);
    expect(lineage.sequenceStabilityIndex).toBe(
      Math.max(0, Math.min(100, Math.round(100 * (1 - expectedShift))))
    );
  });

  it('propage sequenceProfile, codons et cohérence épistasique via runUnifiedDnaGeneSequencer(applyWeights: true)', async () => {
    const drawName = 'TEST_UNIFIED_SEQ_APPLY';
    const history = makeDeterministicHistory(drawName, 30);
    const weights = getDefaultWeights();
    const reports = [makePostMortemReport(drawName, '20/01/2025')];

    // Enregistrer d'abord une génération de référence
    await recordModelDnaVersion({
      drawName,
      version: 'v_base_ref',
      timestamp: '2025-01-19T08:00:00.000Z',
      origin: 'INITIAL',
      weights,
      performance: {},
      causalAuditTrail: ['Génération de référence'],
    });

    const result = await runUnifiedDnaGeneSequencer(drawName, history, weights, {
      forensicReports: reports,
      applyWeights: true,
    });

    expect(result.sequenceFingerprint).toMatch(/^dna_/);
    const lineage = await getModelEvolutionLineage(drawName);
    expect(lineage.totalGenerations).toBe(2);
    const latest = lineage.history[0];
    expect(latest.origin).toBe('GENETIC_EVOLUTION');
    expect(latest.sequenceProfile).toBeDefined();
    expect(latest.sequenceProfile!.epistaticCoherenceScore).toBe(
      result.sequenceMetrics.epistaticCoherenceScore
    );
    expect(latest.sequenceProfile!.topCodons?.length).toBeGreaterThan(0);
    expect(lineage.latestSequenceSignature).toBe(latest.sequenceProfile!.sequenceSignature);
    expect(lineage.meanKendallTauShift).not.toBeNull();
    expect(lineage.sequenceStabilityIndex).not.toBeNull();
  });
});
