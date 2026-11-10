import { describe, it, expect } from 'vitest';
import {
  executeClosedLoopAutopsy,
  executeClosedLoopAutoAdjustment,
} from '../src/services/prediction/closedLoopAutopsyService';
import {
  getModelDnaHistory,
  getModelEvolutionLineage,
} from '../src/services/prediction/modelDnaKnowledgeBase';
import {
  getAlgoWeights,
  saveAlgoWeights,
  evaluateAlgoEmpiricalProof,
  getDefaultWeights,
  normalizeWeights,
} from '../src/services/prediction/weightsManager';
import { analyzeForManipulation } from '../src/services/forensic/integrityEngine';
import { AlgoKey } from '../src/shared/prediction.types';
import { DrawResult } from '../src/types';

/**
 * Générateur pseudo-aléatoire LCG déterministe (Zéro Hasard, 100% Reproductible)
 */
function createDeterministicLcg(seed: number = 123456789) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Génère un historique i.i.d. équitable sous H0
 */
function generateIidHistory(count: number, drawName: string = 'NATIONAL'): DrawResult[] {
  const rng = createDeterministicLcg(42);
  const history: DrawResult[] = [];
  
  for (let i = 0; i < count; i++) {
    const pool = Array.from({ length: 90 }, (_, idx) => idx + 1);
    const winners: number[] = [];
    for (let c = 0; c < 5; c++) {
      const idx = Math.floor(rng() * pool.length);
      winners.push(pool.splice(idx, 1)[0]);
    }
    winners.sort((a, b) => a - b);

    const machine: number[] = [];
    for (let c = 0; c < 5; c++) {
      const idx = Math.floor(rng() * pool.length);
      machine.push(pool.splice(idx, 1)[0]);
    }
    machine.sort((a, b) => a - b);

    const d = new Date(2026, 0, count - i);
    history.push({
      id: `iid_draw_${i}`,
      drawName,
      date: `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`,
      gagnants: winners,
      machine,
    });
  }
  return history;
}

describe('Invariants Mathématiques & Forensic du Closed-Loop Autopsy (Audit Post-Compaction)', () => {
  const drawName = 'NATIONAL';

  it('Invariant 1 : Stabilité sous bruit i.i.d. (Garde de Preuve & Shrinkage préviennent la dérive)', async () => {
    const history = generateIidHistory(35, drawName);
    const baseW = getDefaultWeights();

    // Exécution d'une autopsie sur données i.i.d.
    const autopsy = await executeClosedLoopAutopsy(drawName, 0, history, baseW);
    expect(autopsy).toBeDefined();

    // Évaluation empirique de la preuve sur l'échantillon i.i.d.
    const proof = evaluateAlgoEmpiricalProof(drawName, history.slice(1));
    
    // Sous H0, la vaste majorité des canaux n'a pas de preuve statistiquement certifiée
    const provenChannels = Object.values(AlgoKey).filter(k => proof[k]?.hasProof);
    expect(provenChannels.length).toBeLessThanOrEqual(2);

    // Ajustement closed loop
    const adjustment = await executeClosedLoopAutoAdjustment(
      drawName,
      0,
      history,
      baseW,
      { auditContext: 'test_invariants_iid' }
    );

    // Vérification que les poids n'explosent pas sous bruit
    Object.values(AlgoKey).forEach(k => {
      const w = adjustment.optimizedWeights[k] || 0;
      const base = baseW[k] || 0;
      // Aucun canal sans preuve ne doit dériver excessivement du simplexe
      if (!proof[k]?.hasProof) {
        expect(w).toBeLessThanOrEqual(base * 1.05 + 0.015);
      }
    });
  });

  it('Invariant 2 : Idempotence de l’autopsie (Rejouer le même tirage ne démultiplie pas la mise à jour)', async () => {
    const history = generateIidHistory(20, 'NATIONAL');
    const baseW = getDefaultWeights();

    const autopsy1 = await executeClosedLoopAutopsy('NATIONAL', 0, history, baseW);
    const autopsy2 = await executeClosedLoopAutopsy('NATIONAL', 0, history, baseW);

    // Métriques strictement identiques (100% déterministe)
    expect(autopsy1.brierScore).toBeCloseTo(autopsy2.brierScore, 6);
    expect(autopsy1.klDivergence).toBeCloseTo(autopsy2.klDivergence, 6);
    expect(autopsy1.correctedWeights).toEqual(autopsy2.correctedWeights);
  });

  it('Invariant 3 : Isolation rétroactive (targetDrawIndex > 0 n’écrase pas les poids de production)', async () => {
    const history = generateIidHistory(20, 'NATIONAL');
    const initialLiveWeights = normalizeWeights({
      ...getDefaultWeights(),
      [AlgoKey.FREQUENCY]: 0.15,
      [AlgoKey.GAPS]: 0.12,
    });
    
    await saveAlgoWeights('NATIONAL', initialLiveWeights);

    // Autopsie rétroactive sur le 5ème tirage dans le passé
    const retroAutopsy = await executeClosedLoopAutopsy(
      'NATIONAL',
      5,
      history,
      initialLiveWeights
    );

    expect(retroAutopsy.actualWinners).toEqual(history[5].gagnants);

    // Exécution de l'auto-ajustement rétroactif
    const retroResult = await executeClosedLoopAutoAdjustment(
      'NATIONAL',
      5,
      history,
      initialLiveWeights,
      { auditContext: 'test_retroactive_run' }
    );

    expect(retroResult).toBeDefined();

    // Les poids live de production ne doivent PAS avoir été modifiés par l'autopsie passée
    const currentLive = await getAlgoWeights('NATIONAL');
    expect(currentLive[AlgoKey.FREQUENCY]).toBeCloseTo(initialLiveWeights[AlgoKey.FREQUENCY], 4);
    expect(currentLive[AlgoKey.GAPS]).toBeCloseTo(initialLiveWeights[AlgoKey.GAPS], 4);
  });

  it('Invariant 4 : Calibration du détecteur d’intégrité sous H0 (Score de suspicion moyen <= 15)', () => {
    const history = generateIidHistory(60, 'NATIONAL');
    
    // Test sur plusieurs tirages honnêtes de l'échantillon
    const suspicionScores: number[] = [];
    for (let i = 0; i < 15; i++) {
      const draw = history[i];
      const priorHistory = history.slice(i + 1);
      if (priorHistory.length < 10) continue;

      const audit = analyzeForManipulation(draw.gagnants, priorHistory);
      suspicionScores.push(audit.suspicionScore);
      expect(audit.suspicionScore).toBeLessThan(50);
    }

    const meanSuspicion = suspicionScores.reduce((a, b) => a + b, 0) / suspicionScores.length;
    // Calibré sous H0 : moyenne d'anomalie faible (<= 15)
    expect(meanSuspicion).toBeLessThanOrEqual(15);
  });

  it('Invariant 5 : Sensibilité du détecteur d’intégrité sous anomalie sévère', () => {
    const history = generateIidHistory(40, 'NATIONAL');
    // Tirage sévèrement corrompu / dégénéré (clique de numéros identiques répétés et effondrement)
    const corruptedNumbers = [1, 2, 3, 4, 5];
    // Répétition artificielle de ces numéros dans les 5 derniers tirages pour forcer l'écho et l'effondrement
    const corruptedHistory = [
      { id: 'c1', date: '01/01/2026', drawName: 'NATIONAL', gagnants: [1, 2, 3, 4, 5], machine: [6, 7, 8, 9, 10] },
      { id: 'c2', date: '02/01/2026', drawName: 'NATIONAL', gagnants: [1, 2, 3, 4, 5], machine: [6, 7, 8, 9, 10] },
      { id: 'c3', date: '03/01/2026', drawName: 'NATIONAL', gagnants: [1, 2, 3, 4, 5], machine: [6, 7, 8, 9, 10] },
      ...history,
    ];

    const audit = analyzeForManipulation(corruptedNumbers, corruptedHistory);
    // Sous anomalie critique avérée, le score de suspicion doit s'activer nettement
    expect(audit.suspicionScore).toBeGreaterThanOrEqual(30);
  });

  it('Invariant 6 : Lignée ADN chronologique sans déduplication destructrice par empreinte', async () => {
    const lineageDraw = 'NATIONAL';
    const history = generateIidHistory(15, lineageDraw);
    const baseW = getDefaultWeights();

    // Premier ajustement sur le tirage antérieur (index 1)
    await executeClosedLoopAutoAdjustment(lineageDraw, 1, history, baseW, { auditContext: 'lineage_step_1' });
    // Deuxième ajustement sur le tirage le plus récent (index 0)
    await executeClosedLoopAutoAdjustment(lineageDraw, 0, history, baseW, { auditContext: 'lineage_step_2' });

    const dnaHistory = await getModelDnaHistory(lineageDraw);
    expect(dnaHistory.length).toBeGreaterThanOrEqual(2);

    // Vérification du tri chronologique décroissant strict
    for (let i = 0; i < dnaHistory.length - 1; i++) {
      const tCurrent = new Date(dnaHistory[i].timestamp).getTime();
      const tNext = new Date(dnaHistory[i + 1].timestamp).getTime();
      expect(tCurrent).toBeGreaterThanOrEqual(tNext);
    }

    const lineage = await getModelEvolutionLineage(lineageDraw);
    expect(lineage.totalGenerations).toBeGreaterThanOrEqual(2);
  });
});
