import { describe, it, expect } from 'vitest';
import {
  synthesizeDnaGeneSequenceAndWeights,
  runUnifiedDnaGeneSequencer,
  evaluateDnaGeneSequencerWalkForward,
  computeNormalizedKendallTauDistance,
  computeNormalizedSpearmanFootrule,
  getChromosomalArm,
} from '../src/services/prediction/dnaGeneSequenceService';
import {
  computeEpigenomeMatrixHpc,
  computeSequenceOrderMetricsHpc,
  scoreEpigenomeWalkForwardStepHpc,
} from '../src/services/wasm/lotoEngineBridge';
import {
  recordModelDnaVersion,
  getModelEvolutionLineage,
  computeSequenceKendallTauShift,
} from '../src/services/prediction/modelDnaKnowledgeBase';
import { synthesizePostMortemLearningSession } from '../src/services/forensicTrainingBridge';
import {
  getDefaultWeights,
  evaluateAlgoEmpiricalProof,
  type AlgoProofMetric,
} from '../src/services/prediction/weightsManager';
import { drawHasMachineNumbers } from '../src/constants';
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

  it('bloque l’application live sous parité Walk-Forward et propage sequenceProfile quand le verdict est OUTPERFORMS_BASELINE', async () => {
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

    // Sur historique synthétique sans surperformance prouvée, applyWeights: true bascule en simulation sèche
    const result = await runUnifiedDnaGeneSequencer(drawName, history, weights, {
      forensicReports: reports,
      applyWeights: true,
    });

    expect(result.sequenceFingerprint).toMatch(/^dna_/);
    expect(result.applied).toBe(false);
    expect(result.walkForwardVerdict).toBeDefined();
    expect(result.walkForwardVerdict).not.toBe('OUTPERFORMS_BASELINE');
    expect(result.applicationBlockedReason).toBeTruthy();

    const lineageBefore = await getModelEvolutionLineage(drawName);
    expect(lineageBefore.totalGenerations).toBe(1);

    // Vérification de la persistance complète de sequenceProfile et walkForwardVerdict lorsque le verdict est validé
    const { applyOptimizedWeights } = await import(
      '../src/services/prediction/optimizationController'
    );
    await applyOptimizedWeights({
      drawName,
      weights: result.optimizedWeights,
      origin: 'GENETIC_EVOLUTION',
      walkForwardVerdict: 'OUTPERFORMS_BASELINE',
      history,
      sequenceProfile: {
        orderedGenes: result.geneSequence.map((g) => g.key),
        sequenceSignature: result.sequenceMetrics.sequenceSignature,
        kendallTauShiftFromPrevious: result.sequenceMetrics.kendallTauShiftVsActive,
        epistaticCoherenceScore: result.sequenceMetrics.epistaticCoherenceScore,
        topCodons: result.codons.slice(0, 3).map((c) => ({
          id: c.id,
          genes: c.genes,
          cohesionScore: c.cohesionScore,
          synergyLift: c.synergyLift,
        })),
      },
      causalAuditTrail: result.auditTrail,
      reason: 'Validation Walk-Forward OUTPERFORMS_BASELINE',
    });

    const lineage = await getModelEvolutionLineage(drawName);
    expect(lineage.totalGenerations).toBe(2);
    const latest = lineage.history[0];
    expect(latest.origin).toBe('GENETIC_EVOLUTION');
    expect(latest.walkForwardVerdict).toBe('OUTPERFORMS_BASELINE');
    expect(latest.sequenceProfile).toBeDefined();
    expect(latest.sequenceProfile!.epistaticCoherenceScore).toBe(
      result.sequenceMetrics.epistaticCoherenceScore
    );
    expect(latest.sequenceProfile!.topCodons?.length).toBeGreaterThan(0);
    expect(lineage.latestSequenceSignature).toBe(latest.sequenceProfile!.sequenceSignature);
    expect(lineage.meanKendallTauShift).not.toBeNull();
    expect(lineage.sequenceStabilityIndex).not.toBeNull();
  });

  it('evaluateDnaGeneSequencerWalkForward respecte la coupure causale stricte, le déterminisme et H0', async () => {
    const drawName = 'MONDAY SPECIAL';
    const history = makeDeterministicHistory(drawName, 22);
    const weights = getDefaultWeights();

    // Historique insuffisant -> INSUFFICIENT_DATA honnête
    const shortRes = await evaluateDnaGeneSequencerWalkForward({
      drawName,
      history: history.slice(0, 8),
      currentWeights: weights,
    });
    expect(shortRes.status).toBe('INSUFFICIENT_DATA');
    expect(shortRes.verdict).toBe('INSUFFICIENT_DATA');
    expect(shortRes.evaluatedDrawsCount).toBe(0);

    // Exécution complète sur 4 pas hors-échantillon
    const reports = [
      makePostMortemReport(drawName, history[3].date), // date du 4e plus récent tirage -> ne doit affecter que les pas postérieurs à ce tirage
    ];
    const wf1 = await evaluateDnaGeneSequencerWalkForward({
      drawName,
      history,
      currentWeights: weights,
      forensicReports: reports,
      maxSteps: 4,
    });
    const wf2 = await evaluateDnaGeneSequencerWalkForward({
      drawName,
      history,
      currentWeights: weights,
      forensicReports: reports,
      maxSteps: 4,
    });

    expect(wf1.status).toBe('COMPLETED');
    expect(wf1.evaluatedDrawsCount).toBe(4);
    expect(wf1.h0MeanHitsTop5).toBeCloseTo(5 / 18, 4);
    expect(wf1.h0AtLeastOneHitRate).toBeCloseTo(
      1 - (85 * 84 * 83 * 82 * 81) / (90 * 89 * 88 * 87 * 86),
      4
    );
    expect(wf1.h0BrierScore).toBeCloseTo((5 / 90) * (85 / 90), 5);
    expect(wf1.steps).toEqual(wf2.steps);
    expect(wf1.meanBrierEpigenome).toBe(wf2.meanBrierEpigenome);

    // Anti-fuite : perturber les gagnants du tirage le plus récent (index 0) ne doit JAMAIS
    // modifier les prédictions Top-5 ni le Brier des pas antérieurs (steps 0..2).
    const alteredHistory = history.map((d, idx) =>
      idx === 0 ? { ...d, gagnants: [1, 2, 3, 4, 5] } : d
    );
    const wfAltered = await evaluateDnaGeneSequencerWalkForward({
      drawName,
      history: alteredHistory,
      currentWeights: weights,
      forensicReports: reports,
      maxSteps: 4,
    });

    for (let s = 0; s < 3; s++) {
      expect(wfAltered.steps[s].top5Epigenome).toEqual(wf1.steps[s].top5Epigenome);
      expect(wfAltered.steps[s].top5Baseline).toEqual(wf1.steps[s].top5Baseline);
      expect(wfAltered.steps[s].sequenceSignature).toBe(wf1.steps[s].sequenceSignature);
    }
  });

  it('evaluateAlgoEmpiricalProof et drawHasMachineNumbers maintiennent une isolation inter-réseaux stricte (AGENTS.md #2)', () => {
    const shortNational = makeDeterministicHistory('NATIONAL', 3); // Réseau Hebdomadaire, < 5 tirages
    const longEspoir = makeDeterministicHistory('ESPOIR', 25).map((d, idx) => ({
      ...d,
      id: `espoir_${idx}`,
      machine: [10, 20, 30, 40, 50],
    })); // Réseau Quotidien (autre réseau étanche)

    const mixedHistory = [...shortNational, ...longEspoir];
    const proof = evaluateAlgoEmpiricalProof('NATIONAL', mixedHistory);

    // Malgré 25 tirages ESPOIR présents, NATIONAL n'a que 3 tirages -> aucune preuve fabriquée par fuite
    for (const key of Object.values(AlgoKey)) {
      expect(proof[key].hasProof).toBe(false);
      expect(proof[key].proofScore).toBe(0);
      expect(proof[key].confidence).toBe(0);
    }

    // Fortune Thursday (sans machine) ne doit jamais hériter des numéros machine d'ESPOIR
    expect(drawHasMachineNumbers('FORTUNE THURSDAY', longEspoir)).toBe(false);
  });

  it('valide les noyaux HPC EpiGenome-SQ (matrice épistasique, distance Kendall-Tau/Spearman et pas Walk-Forward)', () => {
    const seqRes = computeSequenceOrderMetricsHpc([1, 2, 3, 4], [4, 3, 2, 1]);
    expect(seqRes.kendallTau).toBeCloseTo(1, 6);
    expect(seqRes.spearmanFootrule).toBeCloseTo(1, 6);

    const k = 4;
    const rawEp = new Float64Array(k * k);
    const sampEp = new Float64Array(k * k);
    rawEp[0 * k + 1] = 2.0;
    rawEp[1 * k + 0] = 2.0;
    sampEp[0 * k + 1] = 4.0;
    sampEp[1 * k + 0] = 4.0;

    const lineage = new Float64Array([
      0.4, 0.3, 0.2, 0.1,
      0.42, 0.31, 0.18, 0.09,
      0.44, 0.33, 0.15, 0.08,
    ]);

    const matRes = computeEpigenomeMatrixHpc({
      rawEpistasisFlat: rawEp,
      epistasisSamplesFlat: sampEp,
      lineageWeightsFlat: lineage,
      numLineage: 3,
      initialWeights: new Float64Array([0.35, 0.25, 0.25, 0.15]),
      armIds: new Uint8Array([0, 1, 2, 3]),
      proofFlags: new Uint8Array([1, 1, 0, 0]),
      proofScores: new Float64Array([2.5, 1.8, 0, 0]),
      baseAnalysisSignals: new Float64Array([0.5, -0.2, 0.1, 0.0]),
      forcedZeroFlags: new Uint8Array([0, 0, 0, 1]),
      numGenes: k,
      hurst: 0.56,
      entropyNorm: 0.92,
      totalEvidenceUnits: 5,
    });

    expect(matRes.numGenes).toBe(k);
    // Symétrie stricte de la matrice épistasique et rétrécissement borné [-1, 1]
    expect(matRes.epistaticMatrixFlat[0 * k + 1]).toBeCloseTo(matRes.epistaticMatrixFlat[1 * k + 0], 10);
    expect(matRes.epistaticMatrixFlat[0 * k + 1]).toBeGreaterThan(0);
    expect(matRes.epistaticMatrixFlat[0 * k + 1]).toBeLessThanOrEqual(1);
    // Gène forcedZero[3] strictement neutralisé
    expect(matRes.postMortemSignal[3]).toBe(0);
    expect(matRes.rawTargetWeights[3]).toBe(0);
    expect(matRes.rawTargetWeights[0]).toBeGreaterThan(0);

    // Pas Walk-Forward HPC : 2 gènes x 90 numéros
    const pluginScores = new Float64Array(2 * 90).fill(0.4);
    for (const num of [5, 12, 23, 44, 78]) {
      pluginScores[num - 1] = 0.95;
      pluginScores[90 + (num - 1)] = 0.92;
    }
    const wfStep = scoreEpigenomeWalkForwardStepHpc({
      pluginScoresFlat: pluginScores,
      epiWeights: new Float64Array([0.6, 0.4]),
      baseWeights: new Float64Array([0.5, 0.5]),
      numGenes: 2,
      actualWinners: new Uint8Array([5, 12, 23, 60, 88]),
    });

    expect(wfStep.top5Epi.length).toBe(5);
    expect(wfStep.hitsTop5Epi).toBe(3);
    expect(wfStep.brierEpi).toBeGreaterThanOrEqual(0);
    expect(wfStep.brierEpi).toBeLessThanOrEqual(1);
    expect(wfStep.epiIncProbs.length).toBe(90);
    expect(wfStep.expectedHitsTop5Epi).toBeGreaterThan(0);
  });

  it('produit une calibration conforme et des profils par régime valides et déterministes dans evaluateDnaGeneSequencerWalkForward', async () => {
    const drawName = 'NATIONAL';
    const history = makeDeterministicHistory(drawName, 22);
    const weights = getDefaultWeights();

    const shortRes = await evaluateDnaGeneSequencerWalkForward({
      drawName,
      history: history.slice(0, 7),
      currentWeights: weights,
    });
    expect(shortRes.status).toBe('INSUFFICIENT_DATA');
    expect(shortRes.conformalSummary.regimeProfiles).toHaveLength(0);
    expect(shortRes.conformalSummary.globalInterval.sampleSize).toBe(0);

    const wfRes = await evaluateDnaGeneSequencerWalkForward({
      drawName,
      history,
      currentWeights: weights,
      maxSteps: 4,
    });

    expect(wfRes.status).toBe('COMPLETED');
    const cs = wfRes.conformalSummary;
    expect(cs.globalInterval.sampleSize).toBe(wfRes.evaluatedDrawsCount);
    expect(cs.globalInterval.lower).toBeGreaterThanOrEqual(0);
    expect(cs.globalInterval.upper).toBeLessThanOrEqual(5);
    expect(cs.globalInterval.lower).toBeLessThanOrEqual(cs.globalInterval.center + 1e-6);
    expect(cs.globalInterval.center).toBeLessThanOrEqual(cs.globalInterval.upper + 1e-6);
    expect(cs.adaptiveCoverage).toBeGreaterThan(0);
    expect(cs.adaptiveCoverage).toBeLessThan(1);
    expect(Number.isFinite(cs.eceBeforeCalibration)).toBe(true);
    expect(Number.isFinite(cs.eceAfterLooCalibration)).toBe(true);

    expect(cs.regimeProfiles.length).toBeGreaterThan(0);
    const totalRegimeSteps = cs.regimeProfiles.reduce((acc, p) => acc + p.stepsCount, 0);
    expect(totalRegimeSteps).toBe(wfRes.evaluatedDrawsCount);
    for (const prof of cs.regimeProfiles) {
      expect(prof.conformalInterval.lower).toBeGreaterThanOrEqual(0);
      expect(prof.conformalInterval.upper).toBeLessThanOrEqual(5);
      expect(prof.meanBrierEpigenome).toBeGreaterThanOrEqual(0);
      expect(prof.meanBrierEpigenome).toBeLessThanOrEqual(1);
    }
  });

  it('expose ebCredibility continu sur chaque DnaGeneNode et aligne expressionState sans dépendre du verrou binaire hasProof', () => {
    const drawName = 'NATIONAL';
    const history = makeDeterministicHistory(drawName, 25);
    const weights = getDefaultWeights();
    const proofMap = buildProofMap([AlgoKey.BAYES]);
    // Preuve continue forte (ebCredibility >= 0.5) même si le drapeau binaire hérité hasProof est false
    proofMap[AlgoKey.SPECTRAL] = {
      hasProof: false,
      proofScore: 3.1,
      empiricalHitRate: 0.082,
      baselineRate: 5 / 90,
      confidence: 0.99,
      pValue: 0.001,
      qValue: 0.01,
    };

    const res = synthesizeDnaGeneSequenceAndWeights({
      drawName,
      history,
      currentWeights: weights,
      proofMapOverride: proofMap,
    });

    const bayesNode = res.geneSequence.find((g) => g.key === AlgoKey.BAYES);
    const spectralNode = res.geneSequence.find((g) => g.key === AlgoKey.SPECTRAL);
    const freqNode = res.geneSequence.find((g) => g.key === AlgoKey.FREQUENCY);

    expect(bayesNode).toBeDefined();
    expect(spectralNode).toBeDefined();
    expect(freqNode).toBeDefined();
    expect(bayesNode!.ebCredibility).toBeGreaterThan(0.5);
    expect(spectralNode!.ebCredibility).toBeGreaterThan(0.5);
    expect(freqNode!.ebCredibility).toBe(0);
    expect(spectralNode!.rationale).toContain('Crédibilité EB');
  });
});
