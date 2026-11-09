import {
  DrawResult,
  ForensicReport,
  SeverityLevel,
  AlgorithmicAdjustment,
  ForensicFailureMode,
  ForensicActionableAdjustment,
} from "../../types";
import {
  AlgoKey,
  ScoreBreakdown,
  DEFAULT_ALGO_WEIGHTS,
  EmpiricalCalibration,
  FALLBACK_CALIBRATION,
} from "../../shared/prediction.types";
import { useNexusStore } from "../../store/useNexusStore";
import { analyzeForManipulation } from "./integrityEngine";
import { DOMAIN_SIZE } from "./detectors";
import {
  calculateShannonEntropy,
  calculateBenfordCompliance,
  calculateKolmogorovSmirnov,
  calculateLjungBoxTest,
  calculateACValue,
} from "../mathCore";

const normalCDF = (x: number, mean: number, std: number): number => {
  const z = (x - mean) / Math.max(Number.EPSILON, std);
  const t = 1.0 / (1.0 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2.0);
  const p =
    d *
    t *
    (0.3193815 +
      t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1.0 - p : p;
};

const poissonSurvivalFunction = (k: number, lambda: number): number => {
  if (k <= 0) return 1.0;
  let cdf = 0;
  for (let i = 0; i < k; i++) {
    cdf += (Math.pow(lambda, i) * Math.exp(-lambda)) / factorial(i);
  }
  return 1.0 - cdf;
};

const factorial = (n: number): number => {
  if (n === 0 || n === 1) return 1;
  let res = 1;
  for (let i = 2; i <= n; i++) res *= i;
  return res;
};

// ============================================================================
// FORENSIC REPORT GENERATION MOTOR (with KL & Cross-Entropy)
// ============================================================================

export const generateForensicReport = (
  combo: number[],
  history: DrawResult[],
  calibration: EmpiricalCalibration = FALLBACK_CALIBRATION,
  algoWeights: Record<AlgoKey, number> = DEFAULT_ALGO_WEIGHTS,
  predictionMatrix?: Record<number, ScoreBreakdown>,
): ForensicReport => {
  const storeWeights = typeof window !== 'undefined' ? useNexusStore.getState?.()?.globalWeights : null;
  const resolvedAlgoWeights = (algoWeights && Object.keys(algoWeights).length > 0 && algoWeights !== DEFAULT_ALGO_WEIGHTS)
    ? algoWeights
    : (storeWeights && Object.keys(storeWeights).length > 0 ? storeWeights : algoWeights || DEFAULT_ALGO_WEIGHTS);

  const sortedCombo = [...combo].sort((a, b) => a - b);
  const n = sortedCombo.length;

  const sum = sortedCombo.reduce((a, b) => a + b, 0);
  const amplitude = sortedCombo[n - 1] - sortedCombo[0];
  const ac = calculateACValue(sortedCombo);

  let consecutives = 0;
  for (let i = 0; i < n - 1; i++) {
    if (sortedCombo[i + 1] - sortedCombo[i] === 1) consecutives++;
  }

  const odds = sortedCombo.filter((x) => x % 2 !== 0).length;

  const sumZ =
    (sum - calibration.meanSum) / Math.max(Number.EPSILON, calibration.stdSum);

  const ampZ =
    (amplitude - calibration.meanAmplitude) /
    Math.max(Number.EPSILON, calibration.stdAmplitude);
  const ampProb = 2 * (1 - normalCDF(Math.abs(ampZ), 0, 1));

  const acZ =
    (ac - calibration.meanAC) / Math.max(Number.EPSILON, calibration.stdAC);
  const acProb = 2 * (1 - normalCDF(Math.abs(acZ), 0, 1));

  const consecProb = poissonSurvivalFunction(
    consecutives,
    calibration.lambdaConsecutives || 0.5,
  );

  const parityProbExact =
    (factorial(n) / (factorial(odds) * factorial(n - odds))) * Math.pow(0.5, n);
  const parityExtremeProb =
    parityProbExact + (odds === 0 || odds === 5 ? 0 : parityProbExact);

  // --- KL / CROSS-ENTROPY FORENSIC DECOMPOSITION ---
  const pPred = new Float64Array(DOMAIN_SIZE + 1);
  let sumExp = 0;

  const shannonResult = calculateShannonEntropy(history.slice(0, 50));
  const historyEntropy =
    shannonResult && typeof shannonResult.normalized === "number"
      ? shannonResult.normalized
      : 0.95;
  const temp = Math.max(0.1, historyEntropy * 1.5);

  for (let i = 1; i <= DOMAIN_SIZE; i++) {
    let score = 0;
    if (predictionMatrix && predictionMatrix[i]) {
      const bd = predictionMatrix[i];
      Object.keys(resolvedAlgoWeights).forEach((kKey) => {
        const k = kKey as AlgoKey;
        score += (resolvedAlgoWeights[k] || 0) * (bd[k] || 0);
      });
    }
    pPred[i] = Math.exp(score / temp);
    sumExp += pPred[i];
  }
  for (let i = 1; i <= DOMAIN_SIZE; i++) {
    pPred[i] = pPred[i] / (sumExp || Number.EPSILON);
  }

  const epsilonSmooth = 1e-4;
  const pActual = new Float64Array(DOMAIN_SIZE + 1);
  const actualWinners = new Set(combo);
  for (let i = 1; i <= DOMAIN_SIZE; i++) {
    pActual[i] = actualWinners.has(i)
      ? (1.0 - epsilonSmooth) / Math.max(1, actualWinners.size)
      : epsilonSmooth / Math.max(1, DOMAIN_SIZE - actualWinners.size);
  }

  let kl_divergence = 0;
  let crossEntropy = 0;
  for (let i = 1; i <= DOMAIN_SIZE; i++) {
    kl_divergence +=
      pActual[i] * Math.log(pActual[i] / (pPred[i] + Number.EPSILON));
    crossEntropy -= pActual[i] * Math.log(pPred[i] + Number.EPSILON);
  }

  const errorGradients: Record<AlgoKey, number> = {} as any;
  Object.keys(resolvedAlgoWeights).forEach((kKey) => {
    const k = kKey as AlgoKey;
    let grad = 0;
    for (let i = 1; i <= DOMAIN_SIZE; i++) {
      const score_i_k = predictionMatrix?.[i]?.[k] || 0;
      grad += (pPred[i] - pActual[i]) * score_i_k;
    }
    errorGradients[k] = grad;
  });

  const cvAmp = calibration.stdAmplitude / (calibration.meanAmplitude || 1.1);
  const cvAC = calibration.stdAC / (calibration.meanAC || 1.1);
  const parityStdError = Math.sqrt(0.25 / n);
  const lambda = calibration.lambdaConsecutives || 0.5;

  const logProbSum =
    Math.log(Math.max(Number.EPSILON, ampProb)) +
    Math.log(Math.max(Number.EPSILON, acProb)) +
    Math.log(Math.max(Number.EPSILON, consecProb)) +
    Math.log(Math.max(Number.EPSILON, parityExtremeProb));

  const maxExpectedLogDeviation =
    4.0 * Math.log(DOMAIN_SIZE) * (1.0 + historyEntropy);
  const rawAnomalyScore = Math.max(
    0,
    100 * (1.0 + logProbSum / maxExpectedLogDeviation),
  );
  const forensicScore = Math.min(100, Math.round(rawAnomalyScore));

  const proposedAdjustments: AlgorithmicAdjustment[] = [];
  const smoothGating = (val: number) =>
    val / (1.0 + Math.exp(-50.0 * (Math.abs(val) - 0.01)));

  // A. SPECTRAL Adjustments
  const sigma95 = 1.95996;
  const slopeAC = 2.0 / Math.max(0.1, historyEntropy);
  const acDivergenceFactor =
    1.0 / (1.0 + Math.exp(-slopeAC * (Math.abs(acZ) - sigma95)));
  const gradStructural = errorGradients[AlgoKey.SPECTRAL] || 0;
  const rawChangeAC = -cvAC * (0.7 * acDivergenceFactor + 0.3 * gradStructural);
  const proposedChangeAC = smoothGating(rawChangeAC);

  if (Math.abs(proposedChangeAC) > 0.001) {
    proposedAdjustments.push({
      algo: AlgoKey.SPECTRAL,
      proposedWeightChange: proposedChangeAC,
      reason: `Asservissement d'isomorphisme arithmétique continu : AC dévie de ${acZ.toFixed(2)}σ. Gradient d'erreur: ${gradStructural.toFixed(4)}. Ajustement de ${(proposedChangeAC * 100).toFixed(2)}%.`,
    });
  }

  // B. GAPS Adjustments
  const gradGaps = errorGradients[AlgoKey.GAPS] || 0;
  const rawChangeGaps =
    -cvAmp * (0.6 * (ampZ / (1.0 + Math.abs(ampZ))) + 0.4 * gradGaps);
  const proposedChangeGaps = smoothGating(rawChangeGaps);

  if (Math.abs(proposedChangeGaps) > 0.001) {
    proposedAdjustments.push({
      algo: AlgoKey.GAPS,
      proposedWeightChange: proposedChangeGaps,
      reason: `Régulateur continu d'amplitude spatiale (CV: ${cvAmp.toFixed(3)}) : déviance amplitude de ${ampZ.toFixed(2)}σ.Gradient: ${gradGaps.toFixed(4)}. Ajustement de ${(proposedChangeGaps * 100).toFixed(2)}%.`,
    });
  }

  // C. FREQUENCY Adjustments
  const consecDivergence = 1.0 - consecProb;
  const gradFreq = errorGradients[AlgoKey.FREQUENCY] || 0;
  const rawChangeFreq =
    -lambda * (0.6 * Math.pow(consecDivergence, 3) + 0.4 * gradFreq);
  const proposedChangeFreq = smoothGating(rawChangeFreq);

  if (Math.abs(proposedChangeFreq) > 0.001) {
    proposedAdjustments.push({
      algo: AlgoKey.FREQUENCY,
      proposedWeightChange: proposedChangeFreq,
      reason: `Filtre anti-grappes de Poisson : déviance séquentielle de ${(consecDivergence * 100).toFixed(1)}%. Gradient: ${gradFreq.toFixed(4)}. Ajustement de ${(proposedChangeFreq * 100).toFixed(2)}%.`,
    });
  }

  // E. SPATIAL Adjustments (Binomial Harmonization)
  const parityAnomaly = 1.0 - parityExtremeProb;
  const gradEquil = errorGradients[AlgoKey.SPATIAL] || 0;
  const rawChangeEquil =
    parityStdError * (0.7 * Math.pow(parityAnomaly, 2) - 0.3 * gradEquil);
  const proposedChangeEquil = smoothGating(rawChangeEquil);

  if (Math.abs(proposedChangeEquil) > 0.001) {
    proposedAdjustments.push({
      algo: AlgoKey.SPATIAL,
      proposedWeightChange: proposedChangeEquil,
      reason: `Stabilisateur harmonique binomial de parité : rareté de parité à ${(parityAnomaly * 100).toFixed(1)}%. Gradient: ${gradEquil.toFixed(4)}. Alignement de SPATIAL de ${(proposedChangeEquil * 100).toFixed(2)}%.`,
    });
  }

  // F. OTHER GENERAL ALGO DIRECT GRADIENTS
  Object.keys(algoWeights).forEach((kKey) => {
    const k = kKey as AlgoKey;
    if (
      k !== AlgoKey.SPECTRAL &&
      k !== AlgoKey.GAPS &&
      k !== AlgoKey.FREQUENCY &&
      k !== AlgoKey.SPATIAL
    ) {
      const grad = errorGradients[k] || 0;
      const lr_general =
        0.05 / Math.sqrt(history.length > 0 ? history.length : 1);
      const rawGeneralChange = -lr_general * grad;
      const proposedGeneralChange = smoothGating(rawGeneralChange);

      if (Math.abs(proposedGeneralChange) > 0.001) {
        proposedAdjustments.push({
          algo: k,
          proposedWeightChange: proposedGeneralChange,
          reason: `Rétroaction de gradient continu direct pour l'algo '${k}' : Gradient: ${grad.toFixed(4)}. Ajustement de ${(proposedGeneralChange * 100).toFixed(2)}%.`,
        });
      }
    }
  });

  // Black Swan & Thermal Noise Threshold
  const systemicThermalNoiseFloor =
    1.0 / Math.sqrt(history.length > 0 ? history.length : 1);
  let jointPredProbModel = 1.0;
  combo.forEach((nVal) => {
    if (nVal >= 1 && nVal <= DOMAIN_SIZE) {
      jointPredProbModel *= pPred[nVal];
    } else {
      jointPredProbModel *= 1.0 / DOMAIN_SIZE;
    }
  });
  const isBlackSwan = jointPredProbModel < systemicThermalNoiseFloor * 1e-12;

  const uniqueDecades = new Set(sortedCombo.map((x) => Math.floor(x / 10)))
    .size;
  const maxDecades = Math.min(n, 9);
  const decadeEntropy = uniqueDecades / maxDecades;
  const klDivergenceProxy = 1.0 - decadeEntropy;

  const comboHash = sortedCombo.reduce(
    (acc, val, idx) => acc + val * Math.pow(DOMAIN_SIZE, idx),
    0,
  );
  const id = `rep_${comboHash}_${history.length}`;

  // Run full forensic analysis of the actual draw (to compute drawAnomalyScore)
  const drawForensic = analyzeForManipulation(combo, history);
  const drawAnomalyScore = drawForensic.suspicionScore / 100.0;

  // Reconstruct predicted combo to evaluate modelMissScore
  const predictedScores: { num: number; score: number }[] = [];
  for (let i = 1; i <= DOMAIN_SIZE; i++) {
    let score = 0;
    if (predictionMatrix && predictionMatrix[i]) {
      const bd = predictionMatrix[i];
      Object.keys(algoWeights).forEach((kKey) => {
        const k = kKey as AlgoKey;
        score += (algoWeights[k] || 0) * (bd[k] || 0);
      });
    }
    predictedScores.push({ num: i, score });
  }
  predictedScores.sort((a, b) => b.score - a.score);
  const predictedCombo = predictedScores.slice(0, 5).map(s => s.num);

  const actualSet = new Set(combo);
  let hits = 0;
  predictedCombo.forEach(num => {
    if (actualSet.has(num)) hits++;
  });

  let nearMisses = 0;
  predictedCombo.forEach(num => {
    if (!actualSet.has(num)) {
      for (const act of combo) {
        if (Math.abs(num - act) === 1 || Math.abs(num - act) === 2) {
          nearMisses++;
          break;
        }
      }
    }
  });

  const modelMissScore = Math.max(0, 1.0 - (hits * 1.0 + nearMisses * 0.25) / 5.0);

  // Evaluate predicted combo structural alignment
  const predSorted = [...predictedCombo].sort((a, b) => a - b);
  const predAmp = predSorted[4] - predSorted[0];
  const predAC = calculateACValue(predSorted);
  const predUniqueDecades = new Set(predSorted.map(x => Math.floor(x / 10))).size;
  const predACZ = (predAC - calibration.meanAC) / Math.max(Number.EPSILON, calibration.stdAC);
  const predAmpZ = (predAmp - calibration.meanAmplitude) / Math.max(Number.EPSILON, calibration.stdAmplitude);
  const structuralQualityScore = Math.min(1.0, Math.max(0, (Math.abs(predACZ) + Math.abs(predAmpZ) + (5 - predUniqueDecades)) / 10.0));

  // Evaluate potential recent-overfit bias
  let repeats = 0;
  if (history.length > 0) {
    const lastWinnersSet = new Set(history[0].gagnants);
    combo.forEach(num => {
      if (lastWinnersSet.has(num)) repeats++;
    });
  }
  const recentOverfitScore = Math.min(1.0, repeats / 4.0);

  // Evaluate overconfidence level
  const predictionEntropy = shannonResult?.normalized || 0.95;
  const modelConfidence = 1.0 - predictionEntropy;
  const overconfidenceScore = Math.max(0, modelConfidence * (1.0 - (hits / 5.0)));

  // Evaluate regime break / instability
  const regimeBreakScore = Math.min(1.0, (1.0 - historyEntropy) + (drawForensic.topologicalTensionIndex || 0) / 100.0);

  // Failure Mode (Verdict) Classifier
  const candidateScores = {
    anomalousdraw: drawAnomalyScore,
    recentoverfit: recentOverfitScore,
    overconfidence: overconfidenceScore,
    structuralmisalignment: structuralQualityScore,
    regimebreak: regimeBreakScore,
    normalnoise: 0.15
  };

  let verdict: string = "normalnoise";
  let maxVal = -1;
  Object.entries(candidateScores).forEach(([key, val]) => {
    if (val > maxVal) {
      maxVal = val;
      verdict = key;
    }
  });

  // Severity Classification (Continuous mapping to discrete labels for UI representation)
  const severityScore = modelMissScore * 0.6 + drawAnomalyScore * 0.4;
  const severities: { threshold: number; label: SeverityLevel }[] = [
    { threshold: 0.75, label: "critical" },
    { threshold: 0.50, label: "high" },
    { threshold: 0.25, label: "medium" },
    { threshold: 0.00, label: "low" }
  ];
  let severity: SeverityLevel = severities.find(s => severityScore >= s.threshold)?.label || "low";

  // Forensic Confidence Calculation (Continuous Evaluation)
  // Base confidence grows asymptotically with history length
  const historyConfidence = 1.0 - Math.exp(-history.length / 30.0);
  // Entropy penalty: higher entropy smoothly reduces confidence
  const entropyPenalty = Math.exp(10.0 * (historyEntropy - 1.0)); // Close to 1.0 -> max penalty
  const continuousConfScore = Math.max(0.1, historyConfidence * (1.0 - 0.5 * entropyPenalty));
  
  let confLevel: 'low' | 'medium' | 'high' = continuousConfScore > 0.7 ? 'high' : continuousConfScore > 0.4 ? 'medium' : 'low';
  const confReasons: string[] = [];
  
  if (historyConfidence < 0.4) {
    confReasons.push("Historique d'apprentissage restreint, limitant la convergence statistique.");
  } else if (historyConfidence < 0.8) {
    confReasons.push("Historique d'apprentissage modéré. Bruit d'échantillonnage présent.");
  } else {
    confReasons.push("Profondeur historique robuste garantissant une convergence asymptotique.");
  }
  
  if (entropyPenalty > 0.8) {
    confReasons.push("Désordre entropique majeur compliquant la dissociation signal/bruit.");
  } else {
    confReasons.push("Régime de distribution stable avec un bruit entropique calibré.");
  }
  
  const forensicConfidence = { level: confLevel, reasons: confReasons };

  // Identify Dominant Causes (Max 3)
  const potentialCauses = [
    { key: "recent-bias excessif / inertie court terme surpondérée", score: recentOverfitScore },
    { key: "surconfiance du moteur vis-à-vis des tirages récents / calibration erronée", score: overconfidenceScore },
    { key: "faible diversité structurelle du ticket / asymétrie spatiale", score: structuralQualityScore },
    { key: "rupture de distribution du régime / transition de phase", score: regimeBreakScore },
    { key: "tirage atypique d'intégrité dégradée / anomalie de distribution", score: drawAnomalyScore }
  ];
  potentialCauses.sort((a, b) => b.score - a.score);
  const dominantCauses = potentialCauses.slice(0, 3).filter(c => c.score > 0.2).map(c => c.key);
  if (dominantCauses.length === 0) {
    dominantCauses.push("Variabilité stochastique naturelle (bruit blanc standard)");
  }

  // Construct Recommended Actionable Adjustments
  const recommendedAdjustments: ForensicActionableAdjustment[] = [];
  if (verdict === "recentoverfit") {
    recommendedAdjustments.push({
      target: "recentBiasPenalty",
      action: "increase",
      magnitude: 0.12,
      reason: "La prédiction était trop exposée aux signaux à court terme T-1/T-2."
    });
    recommendedAdjustments.push({
      target: "machineWeight",
      action: "decrease",
      magnitude: 0.08,
      reason: "Réduction de l'inertie du transfert machine court terme."
    });
  } else if (verdict === "overconfidence") {
    recommendedAdjustments.push({
      target: "confidenceCalibration",
      action: "decrease",
      magnitude: 0.10,
      reason: "La confiance interne affichée était trop élevée par rapport aux résultats réels."
    });
    recommendedAdjustments.push({
      target: "shrinkageFactor",
      action: "increase",
      magnitude: 0.05,
      reason: "Renforcement du rétrécissement (shrinkage) pour régulariser les scores."
    });
  } else if (verdict === "structuralmisalignment") {
    recommendedAdjustments.push({
      target: "diversityConstraint",
      action: "increase",
      magnitude: 0.15,
      reason: "Le ticket présente une faible dispersion spatiale ou parité déséquilibrée."
    });
    recommendedAdjustments.push({
      target: "combinationSelector",
      action: "stabilize",
      magnitude: 0.10,
      reason: "Correction du sélecteur glouton contraint pour restaurer la diversité spatiale."
    });
  } else if (verdict === "regimebreak") {
    recommendedAdjustments.push({
      target: "regimeDetectorSensitivity",
      action: "increase",
      magnitude: 0.08,
      reason: "Rupture de distribution statistique. Ajustement du filtre de régime."
    });
    recommendedAdjustments.push({
      target: "confidenceCalibration",
      action: "decrease",
      magnitude: 0.12,
      reason: "Réduction de la confiance affichée en contexte instable."
    });
  } else if (verdict === "anomalousdraw") {
    recommendedAdjustments.push({
      target: "globalLearningRate",
      action: "decrease",
      magnitude: 0.15,
      reason: "Le tirage présente des anomalies structurelles élevées. Réduction du taux d'apprentissage pour éviter d'ajuster sur du bruit."
    });
  } else {
    recommendedAdjustments.push({
      target: "weightsLearningRate",
      action: "stabilize",
      magnitude: 0.02,
      reason: "Bruit blanc normal. Taux d'apprentissage faible maintenu pour la stabilité globale."
    });
  }

  // Warnings Generation
  const warnings: string[] = [];
  if (drawAnomalyScore > 0.5) {
    warnings.push("Tirage réel atypique identifié : déviance statistique globale élevée.");
  } else {
    warnings.push("Aucune anomalie d'intégrité significative sur le tirage réel.");
  }
  if (overconfidenceScore > 0.5) {
    warnings.push("Calibration de confiance surévaluée par rapport aux probabilités réelles.");
  }

  const postMortemStabilityScore = Math.min(100, Math.round(100 * (1.0 - 0.2 * (1.0 / Math.sqrt(history.length)) - 0.1 * (drawAnomalyScore * (1.0 - drawAnomalyScore)))));

  // Structured Narrative Synthesis (Deterministic & Objective)
  const verdictLabels: Record<string, string> = {
    anomalousdraw: "Tirage réel atypique (Déviance de distribution observée)",
    recentoverfit: "Sur-ajustement d'inertie à court terme (Recent-bias dominant)",
    overconfidence: "Sur-calibration de confiance du modèle",
    structuralmisalignment: "Désalignement structurel / Faible dispersion spatiale",
    regimebreak: "Rupture de distribution statistique / Transition de phase",
    normalnoise: "Fluctuation stochastique standard (Bruit blanc régulier)"
  };

  const aiAnalysis = [
    `Mode d'Inférence : ${verdictLabels[verdict] || verdict}.`,
    `Tirage réel : Somme=${sum} (${sumZ > 0 ? '+' : ''}${sumZ.toFixed(2)}σ), Amplitude=${amplitude} (${ampZ > 0 ? '+' : ''}${ampZ.toFixed(2)}σ), Indice AC=${ac} (${acZ > 0 ? '+' : ''}${acZ.toFixed(2)}σ), Impairs=${odds}/5.`,
    `Divergence KL du consensus : ${kl_divergence.toFixed(4)} nats (Entropie historique : ${historyEntropy.toFixed(2)}).`,
    `Stabilité Post-Mortem : ${postMortemStabilityScore}/100 • Sévérité : ${severity.toUpperCase()}.`
  ].join(" ");

  const recommendations = recommendedAdjustments.map(adj => 
    `[${adj.action.toUpperCase()}] ${adj.target} (amplitude: ${(adj.magnitude * 100).toFixed(1)}%) : ${adj.reason}`
  );

  return {
    id,
    drawName: history[0]?.drawName || "Loto",
    date: history[0]?.date || new Date().toISOString(),
    matches: [],
    missedOpportunities: [],
    scoreDivergence: [],
    timestamp: new Date().toISOString(),
    combo,
    forensicScore,
    aiAnalysis,
    recommendations,
    metrics: {
      sum,
      amplitude,
      ac,
      consecutives,
      odds,
    },
    statisticalDeviations: {
      sumZScore: sumZ,
      amplitudeZScore: ampZ,
      acZScore: acZ,
      consecutivesPValue: consecProb,
      parityPValue: parityExtremeProb,
    },
    proposedAdjustments,
    kl_divergence,
    klDivergenceProxy,
    isBlackSwan,
    failureMode: verdict as ForensicFailureMode,
    verdict: verdict as ForensicFailureMode,
    severity,
    forensicConfidence,
    drawAnomalyScore: parseFloat(drawAnomalyScore.toFixed(4)),
    modelMissScore: parseFloat(modelMissScore.toFixed(4)),
    structuralQualityScore: parseFloat(structuralQualityScore.toFixed(4)),
    dominantCauses,
    recommendedAdjustments,
    warnings,
    postMortemStabilityScore,
    lyapunovChaosExponent: drawForensic.lyapunovChaosExponent,
    isChaoticRegime: drawForensic.isChaoticRegime,
    divergenceForce: drawForensic.divergenceForce,
    topologicalEntropy: drawForensic.topologicalEntropy,
  };
};

// ============================================================================
// CONTINUOUS DNA CO-CALIBRATION MOTOR
// ============================================================================

export const calibrateAlgorithmicDNA = (
  currentWeights: Record<AlgoKey, number>,
  forensicReport: ForensicReport,
  learningRate?: number,
): Record<AlgoKey, number> => {
  const adjusted = { ...currentWeights };
  const historySize = 50;

  const lr =
    learningRate !== undefined
      ? learningRate
      : (0.1 / Math.sqrt(historySize)) *
        (1.0 -
          (forensicReport.shannon_entropy
            ? (forensicReport.shannon_entropy / Math.log2(90)) * 0.5
            : 0.25));

  if (
    forensicReport.proposedAdjustments &&
    forensicReport.proposedAdjustments.length > 0
  ) {
    forensicReport.proposedAdjustments.forEach((adj) => {
      const key = adj.algo as AlgoKey;
      if (adjusted[key] !== undefined) {
        adjusted[key] = adjusted[key] + lr * adj.proposedWeightChange;
      }
    });
  }

  if (forensicReport.isBlackSwan) {
    const keysAll = Object.keys(adjusted) as AlgoKey[];
    keysAll.forEach((k) => {
      if (
        k === AlgoKey.GAPS ||
        k === AlgoKey.SPECTRAL ||
        k === AlgoKey.FRACTAL ||
        k === AlgoKey.SPATIAL ||
        k === AlgoKey.BAYES
      ) {
        adjusted[k] += 0.3;
      } else {
        adjusted[k] = Math.max(0.01, adjusted[k] * 0.4);
      }
    });
  }

  let total = 0;
  Object.keys(adjusted).forEach((k) => {
    adjusted[k as AlgoKey] = Math.max(0.01, adjusted[k as AlgoKey]);
    total += adjusted[k as AlgoKey];
  });
  if (total > 0) {
    Object.keys(adjusted).forEach((k) => {
      adjusted[k as AlgoKey] = adjusted[k as AlgoKey] / total;
    });
  }

  return adjusted;
};

export const aggregateForensicDrift = (
  reports: ForensicReport[],
): Record<string, { mean: number; std: number }> => {
  if (reports.length === 0) return {};

  const algoDeviations: Record<string, number[]> = {};

  reports.forEach((report) => {
    report.proposedAdjustments?.forEach((adj) => {
      if (!algoDeviations[adj.algo]) algoDeviations[adj.algo] = [];
      algoDeviations[adj.algo].push(adj.proposedWeightChange);
    });
  });

  const stats: Record<string, { mean: number; std: number }> = {};

  Object.keys(algoDeviations).forEach((algo) => {
    const vals = algoDeviations[algo];
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const variance =
      vals.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / vals.length;
    stats[algo] = { mean, std: Math.sqrt(variance) };
  });

  return stats;
};
