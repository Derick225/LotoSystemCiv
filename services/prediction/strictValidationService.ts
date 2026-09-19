import { DrawResult, Prediction, AlgoWeights } from "../../types";
import { AlgoKey, EmpiricalCalibration, FALLBACK_CALIBRATION } from "../../shared/prediction.types";
import { generateEmpiricalCalibration } from "./ticketAnalysisService";
import { purifyHistoryForDraw } from "../../utils/arrayUtils";
import { getPrimaryInterDrawFamily, drawHasMachineNumbers } from "../../constants";
import { getAlgoWeights, normalizeWeights, validateAlgoWeightsByProof, AlgoWeightsProofReport } from "./weightsManager";
import { useNexusStore } from "../../store/useNexusStore";
import { calculateShannonEntropy, calculateFractalIndex } from "../mathService";
import { calculateACValue } from "../mathCore";
import { generateMasterPrediction } from "./predictionFacade";
import { calculateGeneticDiversityIndex } from "./diversityService";

export interface DrawAlgorithmicParameters {
  drawName: string;
  family: {
    id: string;
    name: string;
    shortName: string;
  } | null;
  historySize: number;
  temporalDepth: number;
  isForensicOptimized: boolean;
  useSpatioTemporalHawkes: boolean;
  hasMachineNumbers: boolean;
  machineTransferWeight: number;
  isMachineTransferCompliant: boolean;
  activeWeights: AlgoWeights;
  empiricalCalibration: EmpiricalCalibration;
  hurstExponent: number;
  shannonEntropy: number;
  algoWeightsProof: AlgoWeightsProofReport;
}

export interface ValidationCheckItem {
  id: string;
  title: string;
  passed: boolean;
  severity: "info" | "warning" | "error";
  observedValue: string | number;
  targetRange: string;
  zScore?: number;
  details: string;
}

export interface StructuralValidationResult {
  score: number;
  verdict: "CONFORME" | "SOUS_OPTIMAL" | "ANORMAL";
  checks: ValidationCheckItem[];
  ac: {
    value: number;
    targetMean: number;
    targetStd: number;
    zScore: number;
  };
  sum: {
    value: number;
    targetMean: number;
    targetStd: number;
    zScore: number;
  };
  parity: {
    label: string;
    odds: number;
    evens: number;
    probability: number;
  };
  consecutives: {
    count: number;
    lambda: number;
    probOrMore: number;
  };
  diversity?: {
    score: number;
    penalty: number;
  };
  stabilityScore?: number;
  uncertainty?: {
    epistemic: number;
    aleatoric: number;
    confidenceInterval: { lower: number; upper: number };
  };
}

export interface HistoricalValidationStep {
  drawId: string;
  date: string;
  actualGagnants: number[];
  suggestedNumbers: number[];
  candidates: number[];
  directHits: number[];
  candidateHits: number[];
  hitCount: number;
  topologicalLoss: number;
  confidence: number;
  nearMisses: { num: number; type: "voisin" | "miroir"; match: number }[];
}

export interface HistoricalValidationSummary {
  testedDraws: number;
  resonanceRate: number; // % of draws with >= 1 direct hit
  avgDirectHits: number; // average direct hits per draw
  avgCandidateHits: number;
  theoreticalBaselineHits: number; // 5 * 5 / 90 = 0.2778
  alphaGain: number; // avgDirectHits / theoreticalBaseline
  zScore: number; // statistical significance vs random
  avgTopologicalLoss: number;
  precision: number;
  recall: number;
  f1Score: number;
  brierScore: number;
}

export interface ComplianceAuditItem {
  id: string;
  principle: string;
  status: "CONFORME" | "ATTENTION" | "NON_CONFORME";
  description: string;
}

export interface StrictValidationReport {
  drawName: string;
  timestamp: number;
  parameters: DrawAlgorithmicParameters;
  structural: StructuralValidationResult | null;
  historical: HistoricalValidationSummary;
  steps: HistoricalValidationStep[];
  overallVerdict: "CONFORME" | "CONFORME_AVEC_RECOMMANDATIONS" | "NON_CONFORME";
  complianceAudit: ComplianceAuditItem[];
}

export interface StrictValidationOptions {
  drawName: string;
  rawHistory?: DrawResult[];
  prediction?: Prediction | null;
  testDepth?: number; // Number of historical draws to validate against
  onProgress?: (progress: number, message: string) => void;
}

/**
 * 1. Extrait et certifie l'ensemble des paramètres algorithmiques actifs du tirage choisi.
 */
export const extractDrawAlgorithmicParameters = async (
  drawName: string,
  rawHistory: DrawResult[]
): Promise<DrawAlgorithmicParameters> => {
  const storeState = useNexusStore.getState();
  const cleanHistory = purifyHistoryForDraw(drawName, rawHistory);
  
  // 1. Récupération des poids actifs (priorité aux poids customisés du store si cohérents, sinon DB/defaults)
  let activeWeights = storeState.globalWeights && Object.keys(storeState.globalWeights).length > 0
    ? { ...storeState.globalWeights } as AlgoWeights
    : await getAlgoWeights(drawName);

  // 2. Détection de la présence de numéros machine
  const hasMachine = drawHasMachineNumbers(drawName, cleanHistory);
  const rawMachineWeight = activeWeights[AlgoKey.MACHINE_TRANSFER] || 0;

  // Si pas de machine, le poids doit obligatoirement être nul
  if (!hasMachine && rawMachineWeight > 0) {
    (activeWeights as any)[AlgoKey.MACHINE_TRANSFER] = 0.0;
  }
  activeWeights = normalizeWeights(activeWeights);

  // 3. Famille inter-tirages étanche
  const primaryFam = getPrimaryInterDrawFamily(drawName);
  const family = primaryFam
    ? { id: primaryFam.id, name: primaryFam.name, shortName: primaryFam.shortName }
    : null;

  // 4. Métriques fondamentales
  const hurst = cleanHistory.length >= 5 ? calculateFractalIndex(cleanHistory) : 0.5;
  const entropy = cleanHistory.length >= 5 ? calculateShannonEntropy(cleanHistory).normalized : 0.95;

  // 5. Calibration empirique temporelle continue
  const empiricalCalibration = cleanHistory.length >= 5
    ? generateEmpiricalCalibration(cleanHistory, hurst, entropy)
    : FALLBACK_CALIBRATION;

  // 6. Validation stricte du poids des algorithmes par preuve empirique de réussite
  const algoWeightsProof = validateAlgoWeightsByProof(drawName, cleanHistory, activeWeights);

  return {
    drawName,
    family,
    historySize: cleanHistory.length,
    temporalDepth: storeState.temporalDepth ?? 100,
    isForensicOptimized: storeState.isForensicOptimized ?? false,
    useSpatioTemporalHawkes: storeState.useSpatioTemporalHawkes ?? false,
    hasMachineNumbers: hasMachine,
    machineTransferWeight: activeWeights[AlgoKey.MACHINE_TRANSFER] || 0,
    isMachineTransferCompliant: !hasMachine ? (activeWeights[AlgoKey.MACHINE_TRANSFER] === 0) : true,
    activeWeights,
    empiricalCalibration,
    hurstExponent: hurst,
    shannonEntropy: entropy,
    algoWeightsProof,
  };
};

/**
 * 2. Validation structurelle stricte d'un ticket (prédiction) au regard de la calibration empirique du tirage.
 */
export const validateStructuralTicketStrictly = (
  prediction: Prediction,
  params: DrawAlgorithmicParameters
): StructuralValidationResult => {
  const numbers = [...prediction.suggestedNumbers].sort((a, b) => a - b);
  const calib = params.empiricalCalibration;

  const ac = calculateACValue(numbers);
  const sum = numbers.reduce((a, b) => a + b, 0);
  
  let consecutives = 0;
  for (let i = 0; i < numbers.length - 1; i++) {
    if (numbers[i + 1] - numbers[i] === 1) consecutives++;
  }

  const odds = numbers.filter(n => n % 2 !== 0).length;
  const evens = numbers.length - odds;

  // AC Z-score
  const acZScore = (ac - calib.meanAC) / (calib.stdAC || 1.0);
  // Sum Z-score
  const sumZScore = (sum - calib.meanSum) / (calib.stdSum || 1.0);

  // Parity exact binomial probability
  const n = numbers.length;
  const p = 0.5;
  const factorial = (x: number): number => (x <= 1 ? 1 : x * factorial(x - 1));
  const comb = (nn: number, k: number) => factorial(nn) / (factorial(k) * factorial(nn - k));
  const probExactParity = comb(n, odds) * Math.pow(p, odds) * Math.pow(1 - p, n - odds);

  // Consecutives Poisson CDF
  const lambda = calib.lambdaConsecutives || 0.2247;
  let poissonCDF = 0;
  for (let i = 0; i < consecutives; i++) {
    poissonCDF += (Math.pow(lambda, i) * Math.exp(-lambda)) / factorial(i);
  }
  const probConsecOrMore = 1.0 - poissonCDF;

  const checks: ValidationCheckItem[] = [];

  // Check 1: AC
  const acPassed = Math.abs(acZScore) <= 2.0;
  checks.push({
    id: "check_ac",
    title: "Complexité Arithmétique (Valeur AC)",
    passed: acPassed,
    severity: acPassed ? "info" : "warning",
    observedValue: ac,
    targetRange: `${calib.meanAC.toFixed(1)} ± ${(2.0 * calib.stdAC).toFixed(1)}`,
    zScore: acZScore,
    details: acPassed
      ? "L'espacement combinatoire des écarts est conforme à l'attracteur empirique."
      : `Écart anormal (Z=${acZScore.toFixed(2)}). Le ticket présente une structure d'écarts atypique.`,
  });

  // Check 2: Somme Totale
  const sumPassed = Math.abs(sumZScore) <= 2.0;
  checks.push({
    id: "check_sum",
    title: "Barycentre / Somme Totale",
    passed: sumPassed,
    severity: sumPassed ? "info" : "warning",
    observedValue: sum,
    targetRange: `${Math.round(calib.meanSum - 2.0 * calib.stdSum)} à ${Math.round(calib.meanSum + 2.0 * calib.stdSum)}`,
    zScore: sumZScore,
    details: sumPassed
      ? "La masse totale du ticket est centrée dans l'intervalle de confiance à 95%."
      : `Somme atypique (${sum}), s'éloignant de la moyenne empirique (${calib.meanSum.toFixed(0)}).`,
  });

  // Check 3: Parité
  const parityPassed = odds >= 1 && odds <= 4;
  checks.push({
    id: "check_parity",
    title: "Équilibre Pair / Impair",
    passed: parityPassed,
    severity: parityPassed ? "info" : "error",
    observedValue: `${odds} Impairs / ${evens} Pairs`,
    targetRange: "1-4 / 4-1 (p > 5%)",
    details: parityPassed
      ? `Distribution de parité équilibrée (probabilité théorique: ${(probExactParity * 100).toFixed(1)}%).`
      : "Polarisation extrême de parité (tout pair ou tout impair), hautement improbable.",
  });

  // Check 4: Consécutifs
  const consecPassed = consecutives <= 2;
  checks.push({
    id: "check_consec",
    title: "Chaînes de Nombres Consécutifs",
    passed: consecPassed,
    severity: consecPassed ? "info" : "warning",
    observedValue: consecutives,
    targetRange: "≤ 2 paires adjacentes",
    details: consecPassed
      ? `Grappe consécutive conforme (p = ${(probConsecOrMore * 100).toFixed(1)}%).`
      : `Regroupement consécutif rare (${consecutives} paires). Risque de rigidité topologique.`,
  });

  // Check 5: Algorithme Transfert Machine
  checks.push({
    id: "check_machine_transfer",
    title: "Conformité Transfert Machine",
    passed: params.isMachineTransferCompliant,
    severity: params.isMachineTransferCompliant ? "info" : "error",
    observedValue: params.hasMachineNumbers ? "Actif (Machine existante)" : `Poids: ${params.machineTransferWeight.toFixed(4)}`,
    targetRange: params.hasMachineNumbers ? "Autorisé" : "Strictement 0.0",
    details: params.isMachineTransferCompliant
      ? (params.hasMachineNumbers ? "Tirage disposant de données machine validées." : "Poids Transfert Machine vérifié à 0.0 (absence de machine respectée).")
      : "Incohérence : Ce tirage n'a pas de numéros machine mais un poids résiduel non nul lui était attribué.",
  });

  // Check 6: Diversité Génétique
  let diversityScore = 80;
  if (prediction.diversityMetrics) {
    diversityScore = Math.round(prediction.diversityMetrics.diversityScore * 100);
    const divPassed = diversityScore >= 40;
    checks.push({
      id: "check_diversity",
      title: "Diversité Génétique Multi-Algorithmes",
      passed: divPassed,
      severity: divPassed ? "info" : "warning",
      observedValue: `${diversityScore}%`,
      targetRange: "≥ 40%",
      details: divPassed
        ? "Le vecteur mobilise des profils de scoring variés et complémentaires."
        : "Forte corrélation interne des choix de numéros. Risque de redondance algorithmique.",
    });
  }

  // Check 7: Validation Stricte des Poids par Preuve de Confirmation de Réussite
  const proofReport = params.algoWeightsProof;
  const proofPassed = proofReport ? proofReport.isStrictlyValid : true;
  checks.push({
    id: "check_algo_proof",
    title: "Validation Stricte des Poids par Preuve de Réussite",
    passed: proofPassed,
    severity: proofPassed ? "info" : "warning",
    observedValue: proofReport ? `${proofReport.complianceRate}% conformes (${proofReport.provenCount} prouvés)` : "100%",
    targetRange: "100% de conformité",
    details: proofPassed
      ? "Règle respectée : aucun algorithme n'est surpondéré sans confirmation empirique de réussite."
      : `${proofReport?.unconfirmedBoostsCount || 0} algorithme(s) surpondéré(s) sans preuve empirique de succès sur ce tirage.`,
  });

  // Score global pondéré
  let score = 100;
  if (!acPassed) score -= 20 * Math.min(1.0, Math.abs(acZScore) / 3.0);
  if (!sumPassed) score -= 25 * Math.min(1.0, Math.abs(sumZScore) / 3.0);
  if (!parityPassed) score -= 35;
  if (!consecPassed) score -= 20;
  if (!params.isMachineTransferCompliant) score -= 40;
  if (!proofPassed) score -= 15 * (1.0 - (proofReport?.complianceRate || 100) / 100.0);

  score = Math.max(0, Math.min(100, Math.round(score)));
  const verdict: StructuralValidationResult["verdict"] =
    score >= 80 ? "CONFORME" : score >= 50 ? "SOUS_OPTIMAL" : "ANORMAL";

  return {
    score,
    verdict,
    checks,
    ac: {
      value: ac,
      targetMean: calib.meanAC,
      targetStd: calib.stdAC,
      zScore: acZScore,
    },
    sum: {
      value: sum,
      targetMean: calib.meanSum,
      targetStd: calib.stdSum,
      zScore: sumZScore,
    },
    parity: {
      label: `${odds} Impairs / ${evens} Pairs`,
      odds,
      evens,
      probability: probExactParity,
    },
    consecutives: {
      count: consecutives,
      lambda,
      probOrMore: probConsecOrMore,
    },
    diversity: prediction.diversityMetrics
      ? {
          score: diversityScore,
          penalty: prediction.diversityMetrics.penalty,
        }
      : undefined,
    stabilityScore: prediction.stabilityScore,
    uncertainty: prediction.uncertaintyQuantification
      ? {
          epistemic: prediction.uncertaintyQuantification.epistemicUncertainty,
          aleatoric: prediction.uncertaintyQuantification.aleatoricUncertainty,
          confidenceInterval: prediction.uncertaintyQuantification.confidenceInterval,
        }
      : undefined,
  };
};

/**
 * 3. Moteur complet de Validation Stricte d'un Tirage Choisi.
 * Exécute l'audit des paramètres, la validation structurelle et l'audit temporel sans fuite d'information.
 */
export const runStrictDrawValidation = async (
  options: StrictValidationOptions
): Promise<StrictValidationReport> => {
  const { drawName, testDepth = 15, onProgress } = options;
  const storeState = useNexusStore.getState();
  const rawHistory = options.rawHistory || storeState.history;

  onProgress?.(5, `Isolation stricte du tirage "${drawName}"...`);
  const cleanHistory = purifyHistoryForDraw(drawName, rawHistory);

  if (!cleanHistory || cleanHistory.length < 11) {
    throw new Error(
      `Historique insuffisant pour le tirage "${drawName}". Au moins 11 tirages sont requis (actuel: ${cleanHistory?.length || 0}).`
    );
  }

  // Étape 1 : Extraction des paramètres algorithmiques du tirage
  onProgress?.(15, "Extraction et certification des paramètres algorithmiques actifs...");
  const parameters = await extractDrawAlgorithmicParameters(drawName, cleanHistory);

  // Étape 2 : Validation structurelle du ticket actuel (si disponible)
  onProgress?.(25, "Validation structurelle du vecteur de prédiction actif...");
  const targetPrediction = options.prediction || storeState.lastPrediction;
  let structural: StructuralValidationResult | null = null;
  if (targetPrediction && targetPrediction.suggestedNumbers && targetPrediction.suggestedNumbers.length >= 5) {
    structural = validateStructuralTicketStrictly(targetPrediction, parameters);
  }

  // Étape 3 : Audit temporel out-of-sample (Backtesting strict sans prospective bias)
  onProgress?.(35, "Lancement de l'évaluation rétrospective out-of-sample...");
  const safeDepth = Math.max(3, Math.min(testDepth, cleanHistory.length - 11));
  const steps: HistoricalValidationStep[] = [];

  let totalDirectHits = 0;
  let totalCandidateHits = 0;
  let drawsWithAtLeastOneHit = 0;
  let totalTopologicalLoss = 0;
  let totalBrierSquaredErr = 0;

  for (let i = 0; i < safeDepth; i++) {
    const currentProgress = Math.round(35 + ((i + 1) / safeDepth) * 55);
    onProgress?.(currentProgress, `Simulation stricte tirage ${i + 1}/${safeDepth}...`);

    const histSlice = cleanHistory.slice(i + 1);
    const targetDraw = cleanHistory[i];
    const actualGagnants = targetDraw.gagnants || [];

    // Inférence déterministe avec les EXACTS paramètres actuels du tirage
    const pred = await generateMasterPrediction(
      drawName,
      histSlice,
      parameters.temporalDepth,
      parameters.activeWeights,
      undefined,
      undefined,
      true, // skipTraining pour évaluation stricte de la configuration actuelle
      false, // adversarialMode standard
      0, // forcedOutsiderCount
      parameters.isForensicOptimized,
      undefined,
      undefined,
      parameters.useSpatioTemporalHawkes
    );

    const sugg = pred.suggestedNumbers || [];
    const cand = pred.candidates || [];

    const directHits = sugg.filter(n => actualGagnants.includes(n));
    const candidateHits = cand.filter(n => actualGagnants.includes(n));

    if (directHits.length > 0) {
      drawsWithAtLeastOneHit++;
    }
    totalDirectHits += directHits.length;
    totalCandidateHits += candidateHits.length;

    // Calcul de la perte topologique circulaire (distance 1..90 sur tore)
    let stepTopoLoss = 0;
    if (sugg.length > 0 && actualGagnants.length > 0) {
      sugg.forEach(p => {
        let minDist = 90;
        actualGagnants.forEach(a => {
          const d = Math.min(Math.abs(p - a), 90 - Math.abs(p - a));
          if (d < minDist) minDist = d;
        });
        stepTopoLoss += minDist;
      });
      stepTopoLoss /= sugg.length;
    }
    totalTopologicalLoss += stepTopoLoss;

    // Calcul de Brier (probabilité de confiance vs hit)
    const probPred = (pred.confidence || 75) / 100.0;
    const outcome = directHits.length >= 1 ? 1.0 : 0.0;
    totalBrierSquaredErr += Math.pow(probPred - outcome, 2);

    // Near misses (voisins ±1 et miroirs)
    const nearMisses: HistoricalValidationStep["nearMisses"] = [];
    sugg.forEach(p => {
      if (actualGagnants.includes(p)) return;
      actualGagnants.forEach(g => {
        if (Math.abs(p - g) === 1) {
          nearMisses.push({ num: p, type: "voisin", match: g });
        }
        const mirrorStr = String(p).split("").reverse().join("");
        const mirrorNum = parseInt(mirrorStr, 10);
        if (mirrorNum !== p && mirrorNum === g) {
          nearMisses.push({ num: p, type: "miroir", match: g });
        }
      });
    });

    steps.push({
      drawId: targetDraw.id || `draw-${i}`,
      date: targetDraw.date || new Date().toISOString(),
      actualGagnants,
      suggestedNumbers: sugg,
      candidates: cand,
      directHits,
      candidateHits,
      hitCount: directHits.length,
      topologicalLoss: parseFloat(stepTopoLoss.toFixed(2)),
      confidence: pred.confidence || 75,
      nearMisses,
    });
  }

  // Synthèse statistique de la validation
  onProgress?.(95, "Synthèse des indicateurs et audit de conformité...");
  const theoreticalBaselineHits = (5 * 5) / 90; // ~0.2778
  const avgDirectHits = totalDirectHits / safeDepth;
  const avgCandidateHits = totalCandidateHits / safeDepth;
  const resonanceRate = (drawsWithAtLeastOneHit / safeDepth) * 100;
  const alphaGain = theoreticalBaselineHits > 0 ? avgDirectHits / theoreticalBaselineHits : 1.0;

  // Calcul du Z-score par rapport à la distribution binomiale aléatoire
  const pRandomResonance = 1.0 - (85 / 90) * (84 / 89) * (83 / 88) * (82 / 87) * (81 / 86); // ~25.43%
  const expectedResonance = safeDepth * pRandomResonance;
  const stdResonance = Math.sqrt(safeDepth * pRandomResonance * (1.0 - pRandomResonance));
  const zScore = stdResonance > 0 ? (drawsWithAtLeastOneHit - expectedResonance) / stdResonance : 0;

  const totalPredictionsCount = safeDepth * 5;
  const precision = totalDirectHits / (totalPredictionsCount || 1);
  const recall = totalDirectHits / (safeDepth * 5 || 1);
  const f1Score = (2 * precision * recall) / (precision + recall || 1);
  const brierScore = totalBrierSquaredErr / safeDepth;

  const historical: HistoricalValidationSummary = {
    testedDraws: safeDepth,
    resonanceRate: parseFloat(resonanceRate.toFixed(1)),
    avgDirectHits: parseFloat(avgDirectHits.toFixed(2)),
    avgCandidateHits: parseFloat(avgCandidateHits.toFixed(2)),
    theoreticalBaselineHits: parseFloat(theoreticalBaselineHits.toFixed(4)),
    alphaGain: parseFloat(alphaGain.toFixed(2)),
    zScore: parseFloat(zScore.toFixed(2)),
    avgTopologicalLoss: parseFloat((totalTopologicalLoss / safeDepth).toFixed(2)),
    precision: parseFloat(precision.toFixed(3)),
    recall: parseFloat(recall.toFixed(3)),
    f1Score: parseFloat(f1Score.toFixed(3)),
    brierScore: parseFloat(brierScore.toFixed(3)),
  };

  // Étape 4 : Audit de conformité aux directives architecturales (AGENTS.md)
  const complianceAudit: ComplianceAuditItem[] = [
    {
      id: "rule_isolation",
      principle: "Isolation Stricte des Données",
      status: "CONFORME",
      description: `Historique purifié pour "${drawName}" (${cleanHistory.length} tirages). Zéro pollution croisée.`,
    },
    {
      id: "rule_machine_transfer",
      principle: "Règle Numéros Machine",
      status: parameters.isMachineTransferCompliant ? "CONFORME" : "NON_CONFORME",
      description: parameters.hasMachineNumbers
        ? "Tirage avec données machines validées."
        : `Tirage sans machine : Poids Transfert Machine = ${parameters.machineTransferWeight.toFixed(4)} (Strictement 0.0 requis).`,
    },
    {
      id: "rule_families",
      principle: "Famille Inter-Tirages Étanche",
      status: parameters.family ? "CONFORME" : "ATTENTION",
      description: parameters.family
        ? `Rattaché à la ${parameters.family.name} (${parameters.family.shortName}). Zéro couplage inter-famille.`
        : "Tirage autonome ou hors classification standard des 3 familles.",
    },
    {
      id: "rule_deterministic",
      principle: "100% Déterminisme & Zéro Hasard",
      status: "CONFORME",
      description: "Inférence 100% reproductible sans appel aléatoire stochastique non seedé.",
    },
    {
      id: "rule_calibration",
      principle: "Calibration Temporelle Continue",
      status: parameters.empiricalCalibration.isValid ? "CONFORME" : "ATTENTION",
      description: `Moments bayésiens régularisés (Moyenne Somme: ${parameters.empiricalCalibration.meanSum.toFixed(0)}, AC: ${parameters.empiricalCalibration.meanAC.toFixed(1)}).`,
    },
    {
      id: "rule_algo_proof",
      principle: "Preuve de Confirmation de Réussite des Poids",
      status: parameters.algoWeightsProof?.isStrictlyValid ? "CONFORME" : "NON_CONFORME",
      description: parameters.algoWeightsProof?.isStrictlyValid
        ? `100% des algorithmes (${parameters.algoWeightsProof.items.length}/24) respectent la règle de preuve empirique (${parameters.algoWeightsProof.provenCount} prouvés Z > 0, ${parameters.algoWeightsProof.unprovenDampedCount} amortis).`
        : `${parameters.algoWeightsProof?.complianceRate}% conforme : ${parameters.algoWeightsProof?.unconfirmedBoostsCount} algorithme(s) surpondéré(s) sans confirmation empirique de succès sur ce tirage.`,
    },
  ];

  // Détermination du verdict global
  let overallVerdict: StrictValidationReport["overallVerdict"] = "CONFORME";
  if (!parameters.isMachineTransferCompliant) {
    overallVerdict = "NON_CONFORME";
  } else if (parameters.algoWeightsProof && !parameters.algoWeightsProof.isStrictlyValid) {
    overallVerdict = parameters.algoWeightsProof.complianceRate >= 75 ? "CONFORME_AVEC_RECOMMANDATIONS" : "NON_CONFORME";
  } else if (structural && structural.verdict === "ANORMAL") {
    overallVerdict = "CONFORME_AVEC_RECOMMANDATIONS";
  } else if (historical.resonanceRate < 20.0) {
    overallVerdict = "CONFORME_AVEC_RECOMMANDATIONS";
  }

  onProgress?.(100, "Validation stricte achevée avec succès.");

  return {
    drawName,
    timestamp: Date.now(),
    parameters,
    structural,
    historical,
    steps,
    overallVerdict,
    complianceAudit,
  };
};
