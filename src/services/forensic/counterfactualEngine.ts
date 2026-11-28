import type {
  ScoreBreakdown,
  CounterfactualResult,
  AlgoWeights,
  ForensicReport,
  DrawResult,
} from "../../types";
import { normalizeWeights } from "../prediction/predictionFacade";

// ============================================================================
// MOTEUR CONTREFACTUEL DÉTERMINISTE (ZÉRO NOMBRE MAGIQUE)
// ============================================================================

export const runCounterfactualSimulation = (
  currentWeights: AlgoWeights,
  breakdown: Record<number, ScoreBreakdown>,
  actualWinners: number[],
  driftTolerance: number = 0.3,
): { counterfactuals: CounterfactualResult[]; baselineLoss: number; baselineWassersteinLoss?: number } => {
  const results: CounterfactualResult[] = [];
  const defaultBaselineLoss = 1.0;
  const defaultWassersteinLoss = 1.0;

  if (!breakdown || Object.keys(breakdown).length === 0) {
    return { counterfactuals: [], baselineLoss: defaultBaselineLoss, baselineWassersteinLoss: defaultWassersteinLoss };
  }

  const sampleBreakdown = Object.values(breakdown).find(
    (b) => b && Object.keys(b).length > 0,
  );
  if (!sampleBreakdown) {
    return { counterfactuals: [], baselineLoss: defaultBaselineLoss, baselineWassersteinLoss: defaultWassersteinLoss };
  }

  const algos = Object.keys(sampleBreakdown).filter(
    (k) => typeof (sampleBreakdown as Record<string, number>)[k] === "number",
  );
  if (algos.length === 0) {
    return { counterfactuals: [], baselineLoss: defaultBaselineLoss, baselineWassersteinLoss: defaultWassersteinLoss };
  }

  // CALCUL DYNAMIQUE DE LA VARIANCE PAR ALGORITHME
  const algoStats: Record<string, { std: number; mean: number }> = {};
  algos.forEach((algo) => {
    const scores: number[] = [];
    for (let i = 1; i <= 90; i++) {
      const bd = breakdown[i] as Record<string, number> | undefined;
      if (bd && bd[algo] !== undefined) scores.push(bd[algo]);
    }
    if (scores.length > 0) {
      const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
      const variance =
        scores.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / scores.length;
      algoStats[algo] = {
        mean,
        std: Math.max(Number.EPSILON, Math.sqrt(variance)),
      };
    } else {
      const expectedUniformMean = 50.0;
      const expectedUniformStd = 100.0 / Math.sqrt(12.0);
      algoStats[algo] = { mean: expectedUniformMean, std: expectedUniformStd }; // Fallback empirique
    }
  });

  const evaluateWeights = (weights: Record<string, number>) => {
    const scores: { n: number; s: number }[] = [];
    for (let i = 1; i <= 90; i++) {
      const bd = breakdown[i];
      let totalScore = 0;
      if (bd) {
        for (const algo of algos) {
          const w = (weights as Record<string, number>)[algo] || 0;
          const s = (bd as Record<string, number>)[algo] || 0;

          const algoMean = algoStats[algo]?.mean || 50;
          const algoStd = algoStats[algo]?.std || 15;
          const zScore = (s - algoMean) / (algoStd + Number.EPSILON);

          const squashed = 1.0 / (1.0 + Math.exp(-zScore)); // CDF Logistique exacte
          totalScore += squashed * 100.0 * w;
        }
      }
      scores.push({ n: i, s: totalScore });
    }
    scores.sort((a, b) => b.s - a.s);

    const top5 = scores.slice(0, 5).map((x) => x.n);
    const hits = top5.filter((n) => actualWinners.includes(n));
    const missedNumbers = actualWinners.filter((n) => !top5.includes(n));

    // ========================================================================
    // ÉVALUATION PROPRE INVARIANTE PAR PERMUTATION DES ÉTIQUETTES [1..90]
    // Marginales cohérentes Σ q_n = 5 (water-filling), Log-Loss et Brier propres
    // ZÉRO HASARD, ZÉRO BIAIS D'ORDRE NUMÉRIQUE (pas de W1 sur 1..90)
    // ========================================================================
    const DOMAIN_SIZE = 90;
    const DRAW_SIZE = 5;
    const UNIFORM_P = DRAW_SIZE / DOMAIN_SIZE;
    const UNIFORM_BRIER = UNIFORM_P * (1.0 - UNIFORM_P);
    const UNIFORM_LOG_LOSS = -(
      UNIFORM_P * Math.log(UNIFORM_P) +
      (1.0 - UNIFORM_P) * Math.log(1.0 - UNIFORM_P)
    );
    const PROB_EPS = 1e-6;

    const scoreVals = scores.map((x) => x.s);
    const scoreMean = scoreVals.reduce((a, b) => a + b, 0) / scoreVals.length;
    const scoreStdDev =
      Math.sqrt(
        scoreVals.reduce((a, b) => a + Math.pow(b - scoreMean, 2), 0) / scoreVals.length
      ) || Number.EPSILON;

    const temperature = Math.max(scoreStdDev, 1.0);
    const maxS = Math.max(...scoreVals);

    const expScores = scores.map((x) => ({
      n: x.n,
      p: Math.exp((x.s - maxS) / temperature),
    }));
    const sumExp = expScores.reduce((sum, x) => sum + x.p, 0) || 1;

    // Projection exacte par bisection sur le simplexe marginal Σ q_n = DRAW_SIZE, q_n ∈ [ε, 1-ε]
    let lo = -12.0;
    let hi = 12.0;
    const rawRel = new Float64Array(DOMAIN_SIZE);
    for (const item of expScores) {
      if (item.n >= 1 && item.n <= DOMAIN_SIZE) {
        rawRel[item.n - 1] = (item.p / sumExp) * DRAW_SIZE;
      }
    }
    const clampProb = (v: number) => Math.max(PROB_EPS, Math.min(1.0 - PROB_EPS, v));
    for (let iter = 0; iter < 36; iter++) {
      const mid = 0.5 * (lo + hi);
      const scale = Math.exp(mid);
      let s = 0;
      for (let i = 0; i < DOMAIN_SIZE; i++) {
        s += clampProb(rawRel[i] * scale);
      }
      if (s < DRAW_SIZE) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    const finalScale = Math.exp(0.5 * (lo + hi));
    const marginals = new Float64Array(DOMAIN_SIZE);
    for (let i = 0; i < DOMAIN_SIZE; i++) {
      marginals[i] = clampProb(rawRel[i] * finalScale);
    }

    const winnerSet = new Set(actualWinners.filter((w) => w >= 1 && w <= DOMAIN_SIZE));
    let logLossSum = 0;
    let brierSum = 0;
    for (let i = 0; i < DOMAIN_SIZE; i++) {
      const q = marginals[i];
      const y = winnerSet.has(i + 1) ? 1.0 : 0.0;
      logLossSum += -(y * Math.log(q) + (1.0 - y) * Math.log(1.0 - q));
      brierSum += Math.pow(q - y, 2);
    }

    const meanLogLoss = logLossSum / DOMAIN_SIZE;
    const meanBrier = brierSum / DOMAIN_SIZE;

    // Ratios adimensionnels centrés à 1.0 sous bruit uniforme (invariants à toute permutation de 1..90)
    const continuousTopologicalLoss = meanLogLoss / UNIFORM_LOG_LOSS;
    const marginalBrierRatio = meanBrier / UNIFORM_BRIER;

    let winnerAlignment = 0;
    if (winnerSet.size > 0) {
      winnerSet.forEach((w) => {
        winnerAlignment += marginals[w - 1] / UNIFORM_P;
      });
      winnerAlignment /= winnerSet.size;
    }
    const topologicalScore = winnerAlignment;

    let rankSum = 0;
    actualWinners.forEach((winner) => {
      const rank = scores.findIndex((x) => x.n === winner) + 1;
      rankSum += rank > 0 ? rank : 90;
    });
    const avgRank =
      actualWinners.length > 0 ? rankSum / actualWinners.length : 90;

    return {
      top5,
      hits,
      missedNumbers,
      avgRank,
      scores,
      topologicalScore,
      continuousTopologicalLoss,
      wassersteinLoss: marginalBrierRatio,
    };
  };

  const baseline = evaluateWeights(currentWeights);
  const missedByCurrent = actualWinners.filter(
    (n) => !baseline.top5.includes(n),
  );
  const predictedByCurrent = baseline.top5;
  const falsePositives = predictedByCurrent.filter(
    (n) => !actualWinners.includes(n),
  );

  const missedResponsibleAlgos = new Set<string>();
  missedByCurrent.forEach((win) => {
    const bd = breakdown[win];
    if (bd) {
      const best = Object.entries(bd)
        .filter(([k, v]) => typeof v === "number" && k !== "total")
        .sort((a: [string, number], b: [string, number]) => b[1] - a[1])[0];
      if (best) missedResponsibleAlgos.add(best[0]);
    }
  });

  const falsePositiveResponsibleAlgos = new Set<string>();
  falsePositives.forEach((fp) => {
    const bd = breakdown[fp];
    if (bd) {
      const mostResponsible = Object.entries(bd)
        .filter(([k, v]) => typeof v === "number" && k !== "total")
        .sort((a: [string, number], b: [string, number]) => b[1] - a[1])[0];
      if (mostResponsible)
        falsePositiveResponsibleAlgos.add(mostResponsible[0]);
    }
  });

  algos.forEach((algo) => {
    const originalWeight =
      (currentWeights as Record<string, number>)[algo] || 0;
    const isResponsibleForMiss = missedResponsibleAlgos.has(algo);
    const isResponsibleForFP = falsePositiveResponsibleAlgos.has(algo);

    // ========================================================================
    // ANALYSE DE GRADIENT CONTINU (REMPLACEMENT DES TESTS BINAIRES)
    // Différentiation numérique pour la Descent de Gradient Continue
    // ========================================================================

    // Étape de différenciation (Taux d'apprentissage dynamique basé sur la variance)
    const deltaW = Number.EPSILON + (algoStats[algo].std / 100.0) * Math.tanh(driftTolerance);

    const wUp = { ...currentWeights };
    (wUp as Record<string, number>)[algo] = originalWeight + deltaW;
    const evalUp = evaluateWeights(normalizeWeights(wUp as AlgoWeights));

    const wDown = { ...currentWeights };
    (wDown as Record<string, number>)[algo] = Math.max(Number.EPSILON, originalWeight - deltaW);
    const evalDown = evaluateWeights(normalizeWeights(wDown as AlgoWeights));

    // Calcul de la Dérivée Partielle (Gradient) de la fonction de Perte Topologique Continue
    const dLoss_dw = (evalUp.continuousTopologicalLoss - evalDown.continuousTopologicalLoss) / (2 * deltaW);

    // Taux d'apprentissage dynamique (Learning Rate d'Adam simplifié, basé sur l'incertitude)
    const learningRate = 0.5 * Math.tanh(driftTolerance);
    const gradientStep = -learningRate * dLoss_dw;

    // Calcul du nouveau poids projeté
    const projectedWeight = Math.max(Number.EPSILON, originalWeight + gradientStep);

    // Méta-Évaluation du pas de gradient
    const wProjected = { ...currentWeights };
    (wProjected as Record<string, number>)[algo] = projectedWeight;
    const evalProjected = evaluateWeights(normalizeWeights(wProjected as AlgoWeights));

    // Si on a descendu la pente de la fonction de perte continue Topologique
    if (evalProjected.continuousTopologicalLoss < baseline.continuousTopologicalLoss || isResponsibleForMiss || isResponsibleForFP) {

      let actionMsg = "ADJUST";
      let descMsg = `Adaptation du Gradient Continu. Ajustement de ${(gradientStep > 0 ? '+' : '')}${(gradientStep * 100).toFixed(2)}% optimise la Perte Topologique Minimale.`;

      if (isResponsibleForMiss) {
        actionMsg = "BOOST";
        descMsg = `ANOMALIE COMPENSÉE (Faux Négatif) : Descente de gradient forte de +${(gradientStep * 100).toFixed(2)}% sur '${algo}' (signal vital étouffé).`;
      } else if (isResponsibleForFP) {
        actionMsg = "REDUCE";
        descMsg = `NETTOYAGE TOPOLOGIQUE (Faux Positif) : Rétractation de gradient de ${(gradientStep * 100).toFixed(2)}% sur '${algo}' réduit la variance du bruit.`;
      } else if (gradientStep > 0) {
        actionMsg = "BOOST";
      } else if (gradientStep < 0) {
        actionMsg = "REDUCE";
      }

      results.push({
        algo,
        originalWeight,
        optimalWeight: (normalizeWeights(wProjected as AlgoWeights) as Record<string, number>)[algo],
        potentialHits: evalProjected.hits.length,
        potentialNumbers: evalProjected.hits,
        missedNumbers: evalProjected.missedNumbers,
        improvement: Math.max(0, baseline.continuousTopologicalLoss - evalProjected.continuousTopologicalLoss),
        action: (actionMsg === "BOOST" || actionMsg === "REDUCE" ? actionMsg : "GRADIENT_STEP") as CounterfactualResult["action"],
        description: descMsg,
        rankImprovement: baseline.avgRank - evalProjected.avgRank,
        proposedWeightChange: gradientStep
      });
    }

    // Scenario Exclusion
    const uniformWeight = 1.0 / algos.length;
    const weightSignificanceThreshold = uniformWeight * 0.5;

    if (originalWeight > weightSignificanceThreshold) {
      const reducedWeights = { ...currentWeights };
      (reducedWeights as Record<string, number>)[algo] = 0;
      const normalizedReduced = normalizeWeights(reducedWeights as AlgoWeights);
      const reduced = evaluateWeights(normalizedReduced);

      const dynamicRankImprovementThreshold = 90.0 / algos.length;

      if (
        reduced.hits.length > baseline.hits.length ||
        reduced.avgRank < baseline.avgRank - dynamicRankImprovementThreshold
      ) {
        results.push({
          algo,
          originalWeight,
          optimalWeight: 0,
          potentialHits: reduced.hits.length,
          potentialNumbers: reduced.hits,
          missedNumbers: reduced.missedNumbers,
          improvement: Math.max(0, baseline.avgRank - reduced.avgRank),
          action: "REDUCE",
          description: `L'algorithme '${algo}' induit le système en erreur. Son exclusion totale améliore le classement des gagnants.`,
          rankImprovement: baseline.avgRank - reduced.avgRank,
        });
      }
    }
  });

  // Test Synergy (Combinations of top 5 isolated algos)
  const isolationRanks = algos
    .map((algo) => {
      const w: Record<string, number> = {};
      algos.forEach((a) => (w[a] = a === algo ? 1.0 : 0.0));
      return { algo, rank: evaluateWeights(w).avgRank };
    })
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 5);

  const determineFamily = (a: string) => {
    const l = a.toLowerCase();
    if (l.includes("freq") || l.includes("gap") || l.includes("maturit"))
      return "Statistique";
    if (l.includes("markov") || l.includes("spatial") || l.includes("spectr"))
      return "Topologique";
    if (
      l.includes("neur") ||
      l.includes("bayes") ||
      l.includes("intuit") ||
      l.includes("ensemble")
    )
      return "IA";
    if (
      l.includes("harmon") ||
      l.includes("quant") ||
      l.includes("chaos") ||
      l.includes("symbios")
    )
      return "Quantique";
    if (l.includes("pattern") || l.includes("suit")) return "Pattern";
    return "Standard";
  };

  if (isolationRanks.length >= 2) {
    for (let i = 0; i < isolationRanks.length; i++) {
      for (let j = i + 1; j < isolationRanks.length; j++) {
        const algo1 = isolationRanks[i].algo;
        const algo2 = isolationRanks[j].algo;
        const synergyWeights: Record<string, number> = {};
        algos.forEach((a) => {
          synergyWeights[a] = a === algo1 || a === algo2 ? 0.5 : 0.0;
        });

        const synergy = evaluateWeights(synergyWeights);
        const fam1 = determineFamily(algo1);
        const fam2 = determineFamily(algo2);
        const isOrthogonal = fam1 !== fam2;

        const rankGainFloor = 90.0 / Math.max(1, algos.length);
        if (
          synergy.hits.length >= 2 ||
          synergy.avgRank < baseline.avgRank - rankGainFloor
        ) {
          results.push({
            algo: `${algo1} + ${algo2}`,
            originalWeight:
              ((currentWeights as Record<string, number>)[algo1] || 0) +
              ((currentWeights as Record<string, number>)[algo2] || 0),
            optimalWeight: 1.0,
            potentialHits: synergy.hits.length,
            potentialNumbers: synergy.hits,
            missedNumbers: synergy.missedNumbers,
            improvement: Math.max(0, baseline.avgRank - synergy.avgRank),
            action: isOrthogonal ? "SYNERGY (Orthogonal)" : "SYNERGY",
            description: isOrthogonal
              ? `Symbiose Forte (Axes Croisés: ${fam1} + ${fam2}): Créer un pont entre '${algo1}' et '${algo2}' produit ${synergy.hits.length} gagnants.`
              : `Fusion de signaux similaires : La combinaison de '${algo1}' et '${algo2}' limite les faux positifs (${synergy.hits.length} gagnants).`,
            rankImprovement: baseline.avgRank - synergy.avgRank,
          });
        }
      }
    }
  }

  // ADN Optimal (Perfect "What If")
  let sumContributions = 0;
  const optimalWeights: Record<string, number> = {};
  algos.forEach((algo) => {
    let scoreOnWinners = 0;
    actualWinners.forEach((win) => {
      const bd = breakdown[win];
      if (bd && typeof (bd as Record<string, number>)[algo] === "number") {
        scoreOnWinners += (bd as Record<string, number>)[algo];
      }
    });
    optimalWeights[algo] = scoreOnWinners;
    sumContributions += scoreOnWinners;
  });

  if (sumContributions > 0) {
    algos.forEach((algo) => {
      optimalWeights[algo] = optimalWeights[algo] / sumContributions;
    });
    const optimalEval = evaluateWeights(optimalWeights);

    results.unshift({
      algo: "ADN Optimal",
      originalWeight: 1.0,
      optimalWeight: 1.0,
      potentialHits: optimalEval.hits.length,
      potentialNumbers: optimalEval.hits,
      missedNumbers: optimalEval.missedNumbers,
      improvement: Math.max(0, baseline.avgRank - optimalEval.avgRank),
      action: "OPTIMAL_DNA",
      description: `Simulation Parfaite : En ajustant le système avec l'ADN théorique optimal, nous aurions capturé ${optimalEval.hits.length} numéros gagnants.`,
      rankImprovement: baseline.avgRank - optimalEval.avgRank,
      optimalWeightsDistribution: optimalWeights,
      originalWeightsDistribution: currentWeights as Record<string, number>,
    });
  }

  const sortedResults = results.sort((a, b) => {
    if (a.action === "OPTIMAL_DNA") return -1;
    if (b.action === "OPTIMAL_DNA") return 1;
    const aIsAnomaly = a.description?.includes("ANOMALIE") ? 1 : 0;
    const bIsAnomaly = b.description?.includes("ANOMALIE") ? 1 : 0;
    if (bIsAnomaly !== aIsAnomaly) return bIsAnomaly - aIsAnomaly;
    if (b.potentialHits !== a.potentialHits)
      return b.potentialHits - a.potentialHits;
    return (b.rankImprovement || 0) - (a.rankImprovement || 0);
  });

  return {
    counterfactuals: sortedResults,
    baselineLoss: baseline.continuousTopologicalLoss,
    baselineWassersteinLoss: baseline.wassersteinLoss,
  };
};

/**
 * Déclenche l'auto-ajustement en boucle fermée à partir d'un rapport Forensic
 * Post-Mortem ➔ Micro-SGD ➔ Création automatique de Version ADN
 */
export const autoTuneModelDnaFromAutopsyReport = async (
  report: ForensicReport,
  history: DrawResult[],
  options?: { dryRun?: boolean; learningRateOverride?: number }
) => {
  const { executeClosedLoopAutoAdjustment } = await import('../prediction/closedLoopAutopsyService');
  const { getAlgoWeights } = await import('../prediction/weightsManager');
  const currentWeights = await getAlgoWeights(report.drawName);

  // Identifier l'index du tirage dans l'historique
  const drawIndex = history.findIndex((d) => d.date === report.date || d.id === report.drawResultId);
  const targetIndex = drawIndex >= 0 ? drawIndex : 0;

  return executeClosedLoopAutoAdjustment(
    report.drawName,
    targetIndex,
    history,
    currentWeights,
    {
      dryRun: options?.dryRun,
      learningRateOverride: options?.learningRateOverride,
      auditContext: `Déclenché depuis le rapport Forensic ${report.id} (Verdict: ${report.verdict || report.failureMode})`,
    }
  );
};
