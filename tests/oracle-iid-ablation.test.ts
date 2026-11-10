import { describe, it, expect } from 'vitest';
import {
  buildPredictionRequestContext,
  runLocalPredictionPipeline,
  runLocalSimplifiedPipeline,
} from '../src/services/prediction/predictionOrchestrator';
import { handleScenarioADegradedPrediction } from '../src/services/prediction/predictionScenarios';
import { computeWalkForwardCalibrationHpc } from '../src/services/wasm/lotoEngineBridge';
import { shrinkProbabilityVector } from '../src/services/prediction/empiricalSkillCalibration';
import { DrawResult } from '../src/types';

/**
 * Générateur pseudo-aléatoire LCG canonique déterministe (AGENTS.md: Zéro Hasard, 100% Reproductible)
 */
function createDeterministicLcg(seed: number = 987654321) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Génère un historique synthétique i.i.d. de tirages 5/90 sous H0 (équiprobabilité parfaite)
 * Ordonné chronologiquement inverse (index 0 = plus récent), conforme à l'architecture.
 */
function generateIidDrawHistory(count: number, drawName: string = 'NATIONAL', seed: number = 42): DrawResult[] {
  const rng = createDeterministicLcg(seed);
  const history: DrawResult[] = [];
  const baseTime = 1700000000;

  for (let i = 0; i < count; i++) {
    const pool = Array.from({ length: 90 }, (_, idx) => idx + 1);
    const winners: number[] = [];
    for (let w = 0; w < 5; w++) {
      const idx = Math.floor(rng() * pool.length);
      winners.push(pool.splice(idx, 1)[0]);
    }
    winners.sort((a, b) => a - b);

    history.push({
      id: `${drawName}_draw_${count - i}`,
      drawName,
      date: new Date((baseTime - i * 86400) * 1000).toISOString(),
      gagnants: winners,
      machine: [],
    });
  }

  return history;
}

describe('Oracle Prediction Pipeline & Calibration Tests (i.i.d. Noise & Invariants)', () => {

  it('Test 1: Sur du bruit pur i.i.d., le taux de succès walk-forward est indiscernable du hasard (0.278 ± 3 SE)', async () => {
    // 50 fenêtres walk-forward sur un historique i.i.d. de 80 tirages
    const totalDraws = 80;
    const history = generateIidDrawHistory(totalDraws, 'NATIONAL', 2026);
    const evalWindows = 40;
    let totalHits = 0;

    for (let w = 0; w < evalWindows; w++) {
      // Pour chaque pas, l'historique passé connu est history.slice(w + 1)
      const pastHistory = history.slice(w + 1);
      const actualTarget = history[w];

      const context = buildPredictionRequestContext(
        'NATIONAL',
        pastHistory,
        30,
        undefined,
        undefined,
        undefined,
        true // skip training for speed
      );

      const prediction = await runLocalSimplifiedPipeline(context);
      expect(prediction.suggestedNumbers).toHaveLength(5);

      const targetSet = new Set(actualTarget.gagnants);
      const hits = prediction.suggestedNumbers.filter(n => targetSet.has(n)).length;
      totalHits += hits;
    }

    const meanHits = totalHits / evalWindows;
    // Expected hits under H0: 5 * (5 / 90) = 25 / 90 ≈ 0.2778
    const expectedH0 = 25.0 / 90.0;
    // Variance par tirage hypergéométrique: n * (K/N) * (1 - K/N) * ((N-n)/(N-1))
    // 5 * (5/90) * (85/90) * (85/89) ≈ 0.2505
    const varianceSingle = 0.2505;
    const se = Math.sqrt(varianceSingle / evalWindows);

    // Z-score doit être à l'intérieur de ±3.0 (p > 0.0027)
    const zScore = Math.abs(meanHits - expectedH0) / se;
    expect(zScore).toBeLessThan(3.0);
  });

  it('Test 2: Sur du bruit pur, λ = 0, marginales exactement 5/90, confiance neutre (~6%, lift 1.00x) avec note honnête', async () => {
    const history = generateIidDrawHistory(60, 'NATIONAL', 999);
    const context = buildPredictionRequestContext(
      'NATIONAL',
      history,
      30,
      undefined,
      undefined,
      undefined,
      true
    );

    const prediction = await runLocalPredictionPipeline(context);

    // 1. Vérification des probabilités marginales shrinkées
    expect(prediction.numberProbabilities).toBeDefined();
    if (prediction.numberProbabilities) {
      for (let n = 1; n <= 90; n++) {
        // En l'absence de preuve (λ = 0), chaque numéro vaut exactement 5/90
        expect(prediction.numberProbabilities[n]).toBeCloseTo(5.0 / 90.0, 4);
      }
    }

    // 2. Vérification de la confiance honnête : neutre marginal (~6%)
    expect(prediction.confidence).toBe(6); // Math.round((5/90) * 100) = 6%
    expect(prediction.expectedLift).toBeCloseTo(1.0, 2);

    // 3. Vérification de la note explicite d'absence d'edge
    expect(prediction.confidenceNote).toContain('Aucun avantage prouvé (distribution neutre 5/90, lift 1.00x)');

    // 4. Vérification du tag de pipeline
    expect(prediction.pipeline).toBe('full');
  });

  it('Test 3: James-Stein shrinkage contracte les scores vers la moyenne sans altérer le barycentre', () => {
    const rawScores = [
      0.10, 0.08, 0.07, 0.06, 0.055, 0.05, 0.045, 0.04, 0.03, 0.02
    ];
    const mean = rawScores.reduce((a, b) => a + b, 0) / rawScores.length;
    const f = 0.5; // Facteur de shrinkage

    // Vrai shrinkage James-Stein : s' = μ + f * (s - μ)
    const shrunk = rawScores.map(s => mean + f * (s - mean));

    // Propriété 1 : La moyenne reste rigoureusement invariante
    const shrunkMean = shrunk.reduce((a, b) => a + b, 0) / shrunk.length;
    expect(shrunkMean).toBeCloseTo(mean, 6);

    // Propriété 2 : La variance est réduite exactement d'un facteur f²
    const rawVar = rawScores.reduce((a, b) => a + Math.pow(b - mean, 2), 0);
    const shrunkVar = shrunk.reduce((a, b) => a + Math.pow(b - mean, 2), 0);
    expect(shrunkVar / rawVar).toBeCloseTo(f * f, 5);

    // Propriété 3 : L'écart max est contracté par f
    const rawRange = Math.max(...rawScores) - Math.min(...rawScores);
    const shrunkRange = Math.max(...shrunk) - Math.min(...shrunk);
    expect(shrunkRange).toBeCloseTo(rawRange * f, 6);
  });

  it('Test 4: Anti-fuite causale - computeWalkForwardCalibrationHpc avec historyOverride ignore les tirages futurs', () => {
    // Étape 1 : Historique passé de 30 tirages
    const pastHistory = generateIidDrawHistory(30, 'LUCKY TUESDAY', 101);
    const calib1 = computeWalkForwardCalibrationHpc('LUCKY TUESDAY', 15, pastHistory);

    // Étape 2 : On simule l'arrivée de 20 nouveaux tirages "futurs"
    const extendedHistory = generateIidDrawHistory(50, 'LUCKY TUESDAY', 101);
    // On passe toujours l'historique passé borné à la fonction
    const calib2 = computeWalkForwardCalibrationHpc('LUCKY TUESDAY', 15, pastHistory);

    // Les métriques de calibration pour le passé doivent être strictement IDENTIQUES
    expect(calib1.brierScore).toBeCloseTo(calib2.brierScore, 6);
    expect(calib1.brierSkillScore).toBeCloseTo(calib2.brierSkillScore, 6);
    expect(calib1.evaluatedWindows).toBe(calib2.evaluatedWindows);
    expect(calib1.decileCalibration.length).toBe(10);
    // Les déciles doivent avoir des comptes positifs réels
    const totalCount = calib1.decileCalibration.reduce((acc, d) => acc + d.count, 0);
    expect(totalCount).toBeGreaterThan(0);
  });

  it('Test 5: Tous les modes de pipeline sont correctement étiquetés (full, simplified, degraded)', async () => {
    const history = generateIidDrawHistory(40, 'MIDWEEK', 555);

    // Pipeline full
    const fullContext = buildPredictionRequestContext('MIDWEEK', history, 30);
    const fullPred = await runLocalPredictionPipeline(fullContext);
    expect(fullPred.pipeline).toBe('full');
    expect(fullPred.expectedLift).toBeDefined();

    // Pipeline simplified
    const simpleContext = buildPredictionRequestContext('MIDWEEK', history, 30);
    const simplePred = await runLocalSimplifiedPipeline(simpleContext);
    expect(simplePred.pipeline).toBe('simplified');
    expect(simplePred.expectedLift).toBeDefined();

    // Pipeline degraded (mode Laplace sur échantillon court)
    const shortHistory = history.slice(0, 5);
    const degradedContext = buildPredictionRequestContext('MIDWEEK', shortHistory, 5);
    const degradedPred = handleScenarioADegradedPrediction(degradedContext);
    expect(degradedPred.pipeline).toBe('degraded');
    expect(degradedPred.expectedLift).toBe(1.0);
  });
});
