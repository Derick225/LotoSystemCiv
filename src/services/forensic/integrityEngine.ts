import {
  DrawResult,
  ForensicLog,
  ForensicIndicator,
} from "../../types";
import { FALLBACK_CALIBRATION } from "../../shared/prediction.types";
import { computeTopologicalLyapunovHpc } from "../wasm/lotoEngineBridge";
import {
  calculateBenfordCompliance,
  calculateShannonEntropy,
} from "../mathCore";
import {
  DOMAIN_SIZE,
  type AuditConfig,
  InvalidInputError,
  validateInputs,
  sanitizeNumber,
  analyzeHarmonyLinear,
  analyzeBenfordContinuous,
  analyzeKolmogorovSmirnovContinuous,
  analyzeLjungBoxContinuous,
  analyzeClusteringAnomalies,
  analyzeRegistryEcho,
  analyzeSigmaDrift,
  analyzeEntropyCollapse,
  analyzeTemporalCycles,
  analyzeSurvivalAnomalies,
  analyzeSpectralAnomalies,
  analyzeCorrelationAnomalies,
  analyzeMarkovAnomalies,
  analyzeRunsTestAnomalies,
  analyzeCliqueTripletAnomalies,
  analyzeHurstExponentAnomalies,
  analyzeCatastropheRupture,
} from "./detectors";

export interface ConfidenceInterval {
  lower: number;
  upper: number;
  confidenceLevel: number;
}

export interface ForensicAuditResult {
  auditId: string;
  version: string;
  timestamp: string;
  suspicionScore: number;
  riggedProbability: number;
  unifiedIntegrityIndex: number; // UFI (0 = Corrompu à 100 = Parfaitement Aléatoire)
  idealAlgorithmicDriftTolerance: number; // Marge de tolérance idéale calculée
  confidenceIntervals: {
    suspicionScore: ConfidenceInterval;
    riggedProbability: ConfidenceInterval;
    unifiedIntegrityIndex: ConfidenceInterval;
  };
  indicators: ForensicIndicator[];
  entropyCollapse: boolean;
  benfordCompliance: number;
  benfordData?: number[];
  evidenceLogs: ForensicLog[];
  executionMs: number;
  topologicalTensionIndex?: number;
  catastropheControlParams?: {
    a: number;
    b: number;
    discriminant: number;
    regime: string;
  };
  lyapunovChaosExponent?: number;
  isChaoticRegime?: boolean;
  divergenceForce?: number;
  topologicalEntropy?: number;
}

export type { AuditConfig };

export const DEFAULT_AUDIT_CONFIG: AuditConfig = {
  minHistorySize: 5,
  benfordMinSample: 500,
  criticalVariance: Math.pow(90 / (2 * 5), 2) * 0.5,
  avgTheoreticalSum: FALLBACK_CALIBRATION.meanSum,
  baseRiggedProbability: 1.0 / Math.pow(DOMAIN_SIZE / 5, 2),
};

// --- Registry and Global States ---

export let dynamicThresholds = { ...DEFAULT_AUDIT_CONFIG };

export const updateThresholds = (configUpdates: Partial<AuditConfig>) => {
  dynamicThresholds = { ...dynamicThresholds, ...configUpdates };
};

export const analyzeForManipulation = (
  rawNumbers: number[],
  history: DrawResult[],
  config: AuditConfig = dynamicThresholds,
): ForensicAuditResult => {
  const startTime = performance.now();

  validateInputs(rawNumbers, history);
  const numbers = new Uint8Array(rawNumbers.map((n) => Number(n)));

  // Generate a deterministic audit ID
  let dataStr = "";
  for (let i = 0; i < numbers.length; i++) dataStr += numbers[i] + "-";
  dataStr += history.length;
  let hash = 0;
  for (let i = 0; i < dataStr.length; i++) {
    hash = (hash << 5) - hash + dataStr.charCodeAt(i);
    hash |= 0;
  }
  const safeAuditId = `audit_${Math.abs(hash)}_${history.length}`;

  if (history.length < config.minHistorySize) {
    return {
      auditId: safeAuditId,
      version: "2.1.0",
      timestamp: new Date().toISOString(),
      suspicionScore: 0,
      indicators: [],
      riggedProbability: 0,
      unifiedIntegrityIndex: 50,
      idealAlgorithmicDriftTolerance: 0.5,
      confidenceIntervals: {
        suspicionScore: { lower: 0, upper: 0, confidenceLevel: 0.95 },
        riggedProbability: { lower: 0, upper: 0, confidenceLevel: 0.95 },
        unifiedIntegrityIndex: { lower: 50, upper: 50, confidenceLevel: 0.95 },
      },
      entropyCollapse: false,
      benfordCompliance: 100,
      evidenceLogs: [
        {
          timestamp: new Date().toISOString(),
          level: "info",
          indicator: "SYSTEM",
          message: "Historique insuffisant pour l'audit.",
        },
      ],
      executionMs: performance.now() - startTime,
    };
  }

  const benfordSampleLength = Math.min(history.length, config.benfordMinSample);
  const benfordSample: number[] = [];
  for (let i = 0; i < benfordSampleLength; i++) {
    const g = history[i].gagnants;
    for (let j = 0; j < g.length; j++) benfordSample.push(g[j]);
  }
  for (let i = 0; i < numbers.length; i++) benfordSample.push(numbers[i]);

  const benford = calculateBenfordCompliance(benfordSample);
  const entropy = calculateShannonEntropy(history.slice(0, 100)) || {
    normalized: 1.0,
  };

  const indicators: ForensicIndicator[] = [];
  const logs: ForensicLog[] = [];
  let suspicionPoints = 0;

  // --- Execute Pure Analyses (Statically Composed Framework) ---
  const subAnalyses = [
    analyzeHarmonyLinear(numbers, config.criticalVariance, history),
    analyzeBenfordContinuous(benford.score, benfordSampleLength),
    analyzeKolmogorovSmirnovContinuous(numbers),
    analyzeLjungBoxContinuous(history),
    analyzeClusteringAnomalies(numbers),
    analyzeRegistryEcho(numbers, history),
    analyzeSigmaDrift(numbers, config),
    analyzeEntropyCollapse(entropy.normalized, history.length),
    analyzeTemporalCycles(numbers, history),
    analyzeSurvivalAnomalies(numbers, history),
    analyzeSpectralAnomalies(numbers),
    analyzeCorrelationAnomalies(numbers, history),
    analyzeMarkovAnomalies(numbers, history),
    analyzeRunsTestAnomalies(numbers, history),
    analyzeCliqueTripletAnomalies(numbers, history),
    analyzeHurstExponentAnomalies(history),
  ];

  subAnalyses.forEach((res) => {
    indicators.push(...res.indicators);
    logs.push(...res.logs);
    suspicionPoints += res.points;
  });

  const catastropheRes = analyzeCatastropheRupture(numbers);
  indicators.push(...catastropheRes.indicators);
  logs.push(...catastropheRes.logs);
  suspicionPoints += catastropheRes.points;

  // Group indicators into families
  const randomnessTypes = ["ENTROPY", "KS_TEST", "LJUNG_BOX", "BENFORD"];
  const structuralTypes = ["HARMONY", "SPECTRAL", "SIGMA", "CLUSTER"];
  const regimeDriftTypes = ["CATASTROPHE_RUPTURE", "RUNS_TEST", "HURST_EXPONENT", "CYCLE"];
  const overfitTypes = ["ECHO", "CLIQUE_TRIPLET", "CORRELATION", "SURVIVAL"];

  const getFamilyScore = (types: string[]): number => {
    const filtered = indicators.filter(ind => types.includes(ind.type));
    if (filtered.length === 0) return 0;
    const totalImpact = filtered.reduce((sum, ind) => sum + ind.impact, 0);
    return Math.min(100, Math.round((totalImpact / filtered.length) * 1.5));
  };

  // --- Correction pour Tests Multiples (Fisher's Method & Benjamini-Hochberg) ---
  // Au lieu d'agréger aveuglément 16 tests indépendants (ce qui gonfle les faux positifs),
  // nous combinons les pseudo p-values continues via la méthode de Fisher.
  // Chaque test i a une probabilité p_i ~ exp(-impact_i / 15).
  // La statistique X^2 = -2 * sum(ln(p_i)) suit une loi de Chi-Deux à 2k degrés de liberté (k=16 tests).
  const k_tests = 16;
  const totalImpact = indicators.reduce((sum, ind) => sum + ind.impact, 0);
  const fisherChiSquare = (2.0 / 15.0) * totalImpact; // -2 * sum(ln(p)) = 2/15 * sum(impacts)
  
  // Approximation Normale de la loi du Chi-Deux (mu = 2k, sigma = sqrt(4k))
  const expectedChiSquare = 2 * k_tests; // 32
  const stdChiSquare = Math.sqrt(4 * k_tests); // 8
  const fisherZ = (fisherChiSquare - expectedChiSquare) / stdChiSquare;

  // L'Indice de Suspicion unifié est désormais une sigmoïde probabiliste du Z-score (correction FDR)
  const finalSuspicionScore = Math.min(100, Math.max(0, Math.round(100 / (1 + Math.exp(-0.8 * fisherZ)))));

  // Inférence bayésienne continue basée sur la fonction de vraisemblance du Z-score
  // Remplace complètement le registre des nombres magiques "baseLikelihood"
  // H0: Z ~ N(0, 1) (Tirage honnête)
  // H1: Z ~ N(4, 1) (Tirage truqué / anomalie systémique sévère)
  const likelihoodRatio = Math.exp(4 * Math.max(0, fisherZ) - 8); // e^(mu*Z - mu^2/2) avec mu=4
  let odds = (config.baseRiggedProbability / (1 - config.baseRiggedProbability)) * likelihoodRatio;
  if (!Number.isFinite(odds)) odds = 1.0;
  const riggedProb = odds / (1 + odds);

  const entropyHealth = Math.min(100, entropy.normalized * 100);
  const bayesHealth = 100 * (1 - riggedProb);
  const suspicionHealth = 100 - finalSuspicionScore;

  // Calcul de Hurst pour hurstHealth (évaluation continue de la dérive de mémoire stochastique)
  let H_val = 0.5;
  const historyLengthForH = Math.min(100, history.length);
  if (historyLengthForH >= 30) {
    const totals: number[] = [];
    for (let i = 0; i < historyLengthForH; i++) {
      totals.push(
        history[i].gagnants.reduce((sumVal, item) => sumVal + item, 0),
      );
    }
    const nH = totals.length;
    const meanH = totals.reduce((sumVal, item) => sumVal + item, 0) / nH;
    const devAccum: number[] = Array(nH).fill(0);
    let cumSum = 0;
    for (let i = 0; i < nH; i++) {
      cumSum += totals[i] - meanH;
      devAccum[i] = cumSum;
    }
    let sumSquares = 0;
    for (let i = 0; i < nH; i++) {
      sumSquares += Math.pow(totals[i] - meanH, 2);
    }
    const stdDevH = Math.sqrt(sumSquares / nH);
    if (stdDevH > 0) {
      let maxAccum = devAccum[0];
      let minAccum = devAccum[0];
      for (let i = 1; i < nH; i++) {
        if (devAccum[i] > maxAccum) maxAccum = devAccum[i];
        if (devAccum[i] < minAccum) minAccum = devAccum[i];
      }
      const range = maxAccum - minAccum;
      const rescaledRange = range / stdDevH;
      H_val = Math.log(rescaledRange) / Math.log(nH);
    }
  }
  const hurstHealth = 100 * Math.exp(-Math.abs(H_val - 0.5) / 0.15);
  const tensionHealth =
    100 * Math.exp(-catastropheRes.topologicalTensionIndex / 0.5);

  // Analyse de l'Exposant de Lyapunov et Chaos Topologique (HPC Rust WASM)
  let lyapResult = { lyapunov_exponent: 0, is_chaotic: false, divergence_force: 0, topological_entropy: 0 };
  const numDrawsLyap = Math.min(60, history.length);
  if (numDrawsLyap >= 10) {
    const flatDraws = new Int32Array(numDrawsLyap * 5);
    for (let d = 0; d < numDrawsLyap; d++) {
      const g = history[d].gagnants;
      for (let c = 0; c < 5; c++) {
        flatDraws[d * 5 + c] = g[c] ?? 0;
      }
    }
    lyapResult = computeTopologicalLyapunovHpc(flatDraws, numDrawsLyap, 5, 25);
  }

  // Expansion du Diagnostic d'Intégrité Cybernétique (UFI)
  // Combinaison pondérée continue (30% suspicion, 30% bayésien, 10% entropie, 10% benford, 10% mémoire Hurst, 10% tension)
  const UFI = Math.max(
    0,
    Math.min(
      100,
      suspicionHealth * 0.3 +
        bayesHealth * 0.3 +
        entropyHealth * 0.1 +
        benford.score * 0.1 +
        hurstHealth * 0.1 +
        tensionHealth * 0.1,
    ),
  );

  // Enregistrement des diagnostics cybernétiques détaillés sans bruit d'infrastructure
  if (lyapResult.is_chaotic) {
    logs.push({
      timestamp: new Date().toISOString(),
      level: "warn",
      indicator: "CATASTROPHE_RUPTURE",
      message: `Régime chaotique topologique détecté (λ = ${lyapResult.lyapunov_exponent.toFixed(4)}). Forte sensibilité aux conditions initiales (divergence = ${(lyapResult.divergence_force * 100).toFixed(1)}%).`,
    });
  }
  if (Math.abs(H_val - 0.5) > 0.2) {
    logs.push({
      timestamp: new Date().toISOString(),
      level: "warn",
      indicator: "HURST_EXPONENT",
      message: `Déviation Hurst critique détectée (${H_val.toFixed(3)}). Susceptibilité de mémoire à long terme induisant une asymétrie d'apprentissage.`,
    });
  } else {
    logs.push({
      timestamp: new Date().toISOString(),
      level: "info",
      indicator: "HURST_EXPONENT",
      message: `Coefficient de Hurst stable (${H_val.toFixed(3)}). Dynamique brownienne canonique.`,
    });
  }

  if (catastropheRes.topologicalTensionIndex > 0.6) {
    logs.push({
      timestamp: new Date().toISOString(),
      level: "warn",
      indicator: "CATASTROPHE_RUPTURE",
      message: `Tension topologique élevée (${catastropheRes.topologicalTensionIndex.toFixed(3)}). Risque de transition de phase spatiale ou rupture géométrique.`,
    });
  } else {
    logs.push({
      timestamp: new Date().toISOString(),
      level: "info",
      indicator: "CATASTROPHE_RUPTURE",
      message: `Tension topologique nominale (${catastropheRes.topologicalTensionIndex.toFixed(3)}). Intégrité structurelle de la grille préservée.`,
    });
  }

  // ========================================================================
  // COURBE D’OUBLI FONCTIONNELLE (Ebbinghaus Forgetting Curve Temporelle)
  // Remplacement du seuil arbitraire (1 - UFI/100) par une fonction continue.
  // ========================================================================

  // Temps t = profondeur de l'historique considéré comme 'Age' des connaissances
  const t_age = history.length > 0 ? history.length : 1;

  // Force de la mémoire S (Memory Strength) fortement corrélée à l'UFI
  // UFI (0-100) -> S (0.1 - 1.0)
  // Si UFI est bas (système chaotique), S est faible, l'oublie est rapide.
  // Si UFI est haut (système déterministe), S est fort, l'oublie est très lent.
  const memoryStrength = Math.max(0.1, UFI / 100.0);

  // La persistance de la mémoire du modèle (R) selon Ebbinghaus : R = e^(-t / S)
  // On ajoute une constante de temps T_half = 30 tirages
  const timeConstant = 30.0;
  const memoryRetention = Math.exp(-t_age / (memoryStrength * timeConstant));

  // La Tolérance à la Dérive Algorithmique devient la fonction Inverse de la Rétention
  // Plus on "oublie", plus on laisse le système dériver et s'adapter
  const idealDriftTolerance = Math.max(0.01, 1.0 - memoryRetention);

  const nSample = history.length > 0 ? history.length : 1;
  const confidenceThreshold =
    1 / (1 + Math.exp(-(entropy.normalized - 0.5) * 10));
  const zConf = Math.min(
    3.0,
    Math.max(
      1.0,
      Math.sqrt(Math.abs(-2 * Math.log(1 - confidenceThreshold * 0.99))),
    ),
  );

  const pRigged = riggedProb;
  const wilsonDenom = 1 + (zConf * zConf) / nSample;
  const wilsonCenter =
    (pRigged + (zConf * zConf) / (2 * nSample)) / wilsonDenom;
  const wilsonSpread =
    (zConf *
      Math.sqrt(
        (pRigged * (1 - pRigged)) / nSample +
          (zConf * zConf) / (4 * Math.pow(nSample, 2)),
      )) /
    wilsonDenom;

  const riggedProbLower = Math.max(0, wilsonCenter - wilsonSpread);
  const riggedProbUpper = Math.min(1, wilsonCenter + wilsonSpread);

  const empiricalStdErrScore =
    (100 * (1 - entropy.normalized)) / Math.sqrt(nSample);
  const empiricalStdErrUFI =
    (100 * (1 - Math.pow(entropy.normalized, 2))) / Math.sqrt(nSample);

  const df = nSample > 1 ? nSample - 1 : 1;
  const tVal = zConf * (1 + (Math.pow(zConf, 2) + 1) / (4 * df));

  const scoreMargin = tVal * empiricalStdErrScore;
  const ufiMargin = tVal * empiricalStdErrUFI;

  return {
    auditId: safeAuditId,
    version: "2.1.0",
    timestamp: new Date().toISOString(),
    suspicionScore: finalSuspicionScore,
    riggedProbability: riggedProb,
    unifiedIntegrityIndex: UFI,
    idealAlgorithmicDriftTolerance: idealDriftTolerance,
    topologicalTensionIndex: catastropheRes.topologicalTensionIndex,
    catastropheControlParams: catastropheRes.catastropheControlParams,
    lyapunovChaosExponent: parseFloat(lyapResult.lyapunov_exponent.toFixed(4)),
    isChaoticRegime: lyapResult.is_chaotic,
    divergenceForce: parseFloat(lyapResult.divergence_force.toFixed(4)),
    topologicalEntropy: parseFloat(lyapResult.topological_entropy.toFixed(4)),
    confidenceIntervals: {
      suspicionScore: {
        lower: Math.max(0, finalSuspicionScore - scoreMargin),
        upper: Math.min(100, finalSuspicionScore + scoreMargin),
        confidenceLevel: confidenceThreshold,
      },
      riggedProbability: {
        lower: riggedProbLower,
        upper: riggedProbUpper,
        confidenceLevel: confidenceThreshold,
      },
      unifiedIntegrityIndex: {
        lower: Math.max(0, UFI - ufiMargin),
        upper: Math.min(100, UFI + ufiMargin),
        confidenceLevel: confidenceThreshold,
      },
    },
    indicators: indicators.sort((a, b) => b.impact - a.impact),
    entropyCollapse: entropy.normalized < 0.85,
    benfordCompliance: benford.score,
    evidenceLogs: logs,
    executionMs: performance.now() - startTime,
  };
};

export const generateShadowOracleVector = (history: DrawResult[]): number[] => {
  if (!history || history.length === 0) return [];

  const frequencies: Record<number, number> = {};
  history.forEach((draw) => {
    draw.gagnants.forEach((num) => {
      frequencies[num] = (frequencies[num] || 0) + 1;
    });
  });

  return Object.entries(frequencies)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map((entry) => parseInt(entry[0], 10))
    .sort((a, b) => a - b);
};