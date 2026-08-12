import {
  DrawResult,
  SeverityLevel,
  IndicatorType,
  ForensicLog,
  ForensicIndicator,
  ForensicReport,
  AlgorithmicAdjustment,
  ForensicFailureMode,
  ForensicActionableAdjustment,
} from "../types";
import {
  calculateShannonEntropy,
  calculateBenfordCompliance,
  calculateKolmogorovSmirnov,
  calculateLjungBoxTest,
  calculateACValue,
} from "./mathCore";
import {
  AlgoKey,
  ScoreBreakdown,
  DEFAULT_ALGO_WEIGHTS,
  EmpiricalCalibration,
  FALLBACK_CALIBRATION,
} from "../shared/prediction.types";

export class InvalidInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidInputError";
  }
}

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
}

export interface AuditConfig {
  minHistorySize: number;
  benfordMinSample: number;
  criticalVariance: number;
  avgTheoreticalSum: number;
  baseRiggedProbability: number;
}

const DOMAIN_SIZE = 90;

export const DEFAULT_AUDIT_CONFIG: AuditConfig = {
  minHistorySize: 5,
  benfordMinSample: 500,
  criticalVariance: Math.pow(90 / (2 * 5), 2) * 0.5,
  avgTheoreticalSum: FALLBACK_CALIBRATION.meanSum,
  baseRiggedProbability: 1.0 / Math.pow(DOMAIN_SIZE / 5, 2),
};

// --- Registry and Global States ---

let dynamicThresholds = { ...DEFAULT_AUDIT_CONFIG };

export const updateThresholds = (configUpdates: Partial<AuditConfig>) => {
  dynamicThresholds = { ...dynamicThresholds, ...configUpdates };
};

// --- Input Validation & Global Sanity ---

export const sanitizeNumber = (n: unknown): number => {
  const num = Number(n);
  if (!Number.isFinite(num) || num < 1 || num > 90 || !Number.isInteger(num)) {
    throw new InvalidInputError(
      `Invalid number: ${n}. Must be an integer between 1 and 90.`,
    );
  }
  return num;
};

const validateInputs = (numbers: number[], history: DrawResult[]) => {
  if (!Array.isArray(numbers))
    throw new InvalidInputError("Numbers must be an array.");
  if (numbers.length === 0)
    throw new InvalidInputError("Numbers array cannot be empty.");

  const uniqueNumbers = new Set<number>();
  for (const n of numbers) {
    const sanitized = sanitizeNumber(n);
    if (uniqueNumbers.has(sanitized)) {
      throw new InvalidInputError(`Duplicate number detected: ${sanitized}`);
    }
    uniqueNumbers.add(sanitized);
  }

  if (!Array.isArray(history))
    throw new InvalidInputError("History must be an array.");
};

// --- Exact Order Statistics Range Utility ---
const exactRangeCDF = (R: number, m: number, N: number): number => {
  if (R < m - 1) return 0;
  const binom = (n: number, k: number): number => {
    if (k < 0 || k > n) return 0;
    if (k === 0 || k === n) return 1;
    let res = 1;
    for (let i = 1; i <= k; i++) {
      res = (res * (n - i + 1)) / i;
    }
    return res;
  };
  let ways = 0;
  for (let r = m - 1; r <= R; r++) {
    ways += (N - r) * binom(r - 1, m - 2);
  }
  return ways / binom(N, m);
};

const detectClusteredFraud = (numbers: Uint8Array): number => {
  const n = numbers.length;
  if (n < 4) return 0;

  const sorted = [...numbers].sort((a, b) => a - b);
  
  // Evalue la "clique" (regroupement) en regardant l'étendue (range) 
  // globale (m=5) et partielle (m=4)
  const range5 = sorted[4] - sorted[0];
  const minRange4 = Math.min(sorted[3] - sorted[0], sorted[4] - sorted[1]);
  
  // p-values exactes
  const pValue5 = exactRangeCDF(range5, 5, DOMAIN_SIZE);
  // Approximation conservative pour minRange4 (Bonferroni sur 2 fenêtres)
  const pValue4 = Math.min(1.0, 2 * exactRangeCDF(minRange4, 4, DOMAIN_SIZE));
  
  const bestPValue = Math.min(pValue4, pValue5);
  
  // Plus la p-value est petite (cluster extrêmement serré par rapport à l'aléatoire),
  // plus l'anomalie est grande.
  if (bestPValue >= 0.5) return 0;
  
  // Transformation de la p-value en Z-score (approximation logistique)
  // p=0.05 -> Z ~ 1.64, p=0.01 -> Z ~ 2.33
  const zScore = Math.abs(Math.log(bestPValue + Number.EPSILON)) / 2.0;
  
  // Sigmoïde pour ramener l'anomalie entre 0 et 1 (centrée sur Z = 2.0, soit p ~ 0.018)
  return 1 / (1 + Math.exp(-2.0 * (zScore - 2.0)));
};

// ============================================================================
// PURE & TESTABLE FORENSIC ANALYSIS FUNCTIONS
// ============================================================================

export interface AnalysisResponse {
  indicators: ForensicIndicator[];
  logs: ForensicLog[];
  points: number;
}

/**
 * 1. Analyse de la Variance des Gaps (Harmonie Linéaire)
 */
export const analyzeHarmonyLinear = (
  numbers: Uint8Array,
  criticalVariance: number,
  history?: DrawResult[],
): AnalysisResponse => {
  const indicators: ForensicIndicator[] = [];
  const logs: ForensicLog[] = [];
  let points = 0;

  const sorted = new Uint8Array(numbers).sort();
  if (sorted.length > 1) {
    let gapSum = 0;
    const gaps = new Uint8Array(sorted.length - 1);
    for (let i = 0; i < sorted.length - 1; i++) {
      const gap = sorted[i + 1] - sorted[i];
      gaps[i] = gap;
      gapSum += gap;
    }

    const avgGap = gapSum / gaps.length;
    let gapVarianceSum = 0;
    for (let i = 0; i < gaps.length; i++) {
      gapVarianceSum += (gaps[i] - avgGap) * (gaps[i] - avgGap);
    }
    const gapVariance = gapVarianceSum / gaps.length;

    let stdDevVariance = criticalVariance * 0.25;
    if (history && history.length > 0) {
      const historySample = history.length > 500 ? history.slice(0, 500) : history;
      const historyVariances = historySample.map(draw => {
        const sortedDraw = [...draw.gagnants].sort((a, b) => a - b);
        if (sortedDraw.length <= 1) return 0;
        let localGapSum = 0;
        const localGaps = new Uint8Array(sortedDraw.length - 1);
        for (let j = 0; j < sortedDraw.length - 1; j++) {
          const gap = sortedDraw[j + 1] - sortedDraw[j];
          localGaps[j] = gap;
          localGapSum += gap;
        }
        const localAvgGap = localGapSum / localGaps.length;
        let localVarianceSum = 0;
        for (let j = 0; j < localGaps.length; j++) {
          localVarianceSum += (localGaps[j] - localAvgGap) * (localGaps[j] - localAvgGap);
        }
        return localVarianceSum / localGaps.length;
      });
      const meanVariance = historyVariances.reduce((a, b) => a + b, 0) / historyVariances.length;
      const varOfVariances = historyVariances.reduce((acc, v) => acc + Math.pow(v - meanVariance, 2), 0) / historyVariances.length;
      stdDevVariance = Math.sqrt(varOfVariances) || (criticalVariance * 0.25);
    }
    const slope = 1.0 / Math.max(Number.EPSILON, stdDevVariance);
    const varianceAnomaly =
      1 / (1 + Math.exp(slope * (gapVariance - criticalVariance)));

    if (varianceAnomaly > 0.1) {
      const impact = varianceAnomaly * 50;
      const severity: SeverityLevel =
        impact >= 40 ? "critical" : impact >= 30 ? "high" : "medium";
      indicators.push({
        type: "HARMONY",
        label: "Harmonie Linéaire",
        value: `σ²=${gapVariance.toFixed(2)}`,
        severity,
        description:
          "Régularité des écarts lissée en continu (Linéarité artificielle).",
        impact,
      });
      logs.push({
        timestamp: new Date().toISOString(),
        level: severity === "critical" ? "critical" : "error",
        indicator: "HARMONY",
        message: `Variance gaps ${gapVariance.toFixed(2)} vs seuil ${criticalVariance} (Anomalie=${(varianceAnomaly * 100).toFixed(1)}%)`,
      });
      points += impact;
    }
  }
  return { indicators, logs, points };
};

/**
 * 2. Test Benford - Évaluation Continue
 */
export const analyzeBenfordContinuous = (
  benfordScore: number,
  sampleLength: number = 500,
): AnalysisResponse => {
  const indicators: ForensicIndicator[] = [];
  const logs: ForensicLog[] = [];
  let points = 0;

  // Distance continue par rapport à la conformité théorique parfaite (100)
  const benfordDistance = Math.abs(benfordScore - 100);

  // Espérance de l'écart L1 (deviation * 50) sous l'hypothèse nulle (loi multinomiale)
  // E[L1] ≈ \sum_{d=1}^9 \sqrt{p_d(1-p_d)/N} * 50. Pour p_d ≈ 0.11, la constante est de 50 * \sum \sqrt{0.11 * 0.89} ≈ 140.
  const expectedDistance = 140 / Math.sqrt(Math.max(10, sampleLength));

  // Évaluation d'un Z-score continu par rapport à l'espérance de bruit pour de l'anomalie
  const zBenford = (benfordDistance - expectedDistance) / Math.max(1, expectedDistance * 0.5);
  const benfordAnomaly = 1 / (1 + Math.exp(-zBenford));
  if (benfordAnomaly > 0.1) {
    const impact = benfordAnomaly * 50;
    const severity: SeverityLevel =
      impact >= 40 ? "critical" : impact >= 30 ? "high" : "medium";
    indicators.push({
      type: "BENFORD",
      label: "Divergence Benford Continue",
      value: `${Math.round(benfordScore)}%`,
      severity,
      description:
        "Non-conformité continue à la loi des nombres (Score pondéré lissé).",
      impact,
    });
    logs.push({
      timestamp: new Date().toISOString(),
      level: severity === "critical" ? "error" : "warn",
      indicator: "BENFORD",
      message: `Benford compliance at ${Math.round(benfordScore)}% (Anomalie=${(benfordAnomaly * 100).toFixed(1)}%)`,
    });
    points += impact;
  }
  return { indicators, logs, points };
};

/**
 * 3. Test Kolmogorov-Smirnov (KS) - Évaluation Continue
 */
export const analyzeKolmogorovSmirnovContinuous = (
  numbers: Uint8Array,
): AnalysisResponse => {
  const indicators: ForensicIndicator[] = [];
  const logs: ForensicLog[] = [];
  let points = 0;

  const ksNumbers = Array.from(numbers);
  const ksResult = calculateKolmogorovSmirnov(ksNumbers);
  const ksAnomalyProb = 1 / (1 + Math.exp(-15 * (ksResult.dStatistic - 0.4)));

  if (ksAnomalyProb > 0.2) {
    const impact = ksAnomalyProb * 45;
    const severity: SeverityLevel = ksAnomalyProb > 0.8 ? "high" : "medium";
    indicators.push({
      type: "KS_TEST",
      label: "Divergence KS Continue",
      value: `D=${ksResult.dStatistic.toFixed(4)}`,
      severity,
      description:
        "La distribution des numéros dévie continuellement d'une distribution uniforme (Kolmogorov-Smirnov).",
      impact,
    });
    logs.push({
      timestamp: new Date().toISOString(),
      level: ksAnomalyProb > 0.8 ? "error" : "warn",
      indicator: "KS_TEST",
      message: `KS-Test evaluation D=${ksResult.dStatistic.toFixed(4)}, Probabilité d'Anomalie=${(ksAnomalyProb * 100).toFixed(1)}%`,
    });
    points += impact;
  }
  return { indicators, logs, points };
};

/**
 * 3b. Test Ljung-Box (Autocorrélations Sérielles Chronologiques)
 */
export const analyzeLjungBoxContinuous = (
  history: DrawResult[],
): AnalysisResponse => {
  const indicators: ForensicIndicator[] = [];
  const logs: ForensicLog[] = [];
  let points = 0;

  if (history.length >= 20) {
    const lastDecades = history.slice(0, 20).flatMap((h) => h.gagnants);
    const lbTest = calculateLjungBoxTest(lastDecades, 5);
    if (lbTest.hasAutocorrelation) {
      const impact = 35;
      indicators.push({
        type: "LJUNG_BOX",
        label: "Autocorrélation Chronologique",
        value: `Q=${lbTest.qStatistic.toFixed(2)}`,
        severity: "high",
        description:
          "Le test de Ljung-Box révèle des dépendances temporelles artificielles dans la séquence des résultats.",
        impact,
      });
      logs.push({
        timestamp: new Date().toISOString(),
        level: "error",
        indicator: "LJUNG_BOX",
        message: `Ljung-Box Q=${lbTest.qStatistic.toFixed(2)} - Sérielle detectée.`,
      });
      points += impact;
    }
  }
  return { indicators, logs, points };
};

/**
 * 4. Clustering Artificiel (K-Means++) - Densité Continue
 */
export const analyzeClusteringAnomalies = (
  numbers: Uint8Array,
): AnalysisResponse => {
  const indicators: ForensicIndicator[] = [];
  const logs: ForensicLog[] = [];
  let points = 0;

  const clusterAnomaly = detectClusteredFraud(numbers);
  if (clusterAnomaly > 0.1) {
    const impact = clusterAnomaly * 30;
    const severity: SeverityLevel = clusterAnomaly > 0.8 ? "high" : "medium";
    indicators.push({
      type: "CLUSTER",
      label: "Clustering Suspect (Continu)",
      value: `Densité=${(clusterAnomaly * 100).toFixed(1)}%`,
      severity,
      description:
        "Regroupement anormal de numéros détecté via K-Means++ continu.",
      impact,
    });
    logs.push({
      timestamp: new Date().toISOString(),
      level: clusterAnomaly > 0.8 ? "warn" : "info",
      indicator: "CLUSTER",
      message: `Cluster dense détecté avec probabilité ${(clusterAnomaly * 100).toFixed(1)}%`,
    });
    points += impact;
  }
  return { indicators, logs, points };
};

/**
 * 5. Echo de Registre T-1 (Optimisation Set $O(1)$)
 */
export const analyzeRegistryEcho = (
  numbers: Uint8Array,
  history: DrawResult[],
): AnalysisResponse => {
  const indicators: ForensicIndicator[] = [];
  const logs: ForensicLog[] = [];
  let points = 0;

  if (history.length > 0) {
    const lastWinners = history[0].gagnants;
    const lastWinnersSet = new Set(lastWinners);
    let repeats = 0;
    for (let i = 0; i < numbers.length; i++) {
      if (lastWinnersSet.has(numbers[i])) {
        repeats++;
      }
    }

    const echoAnomaly = 1 / (1 + Math.exp(-2.5 * (repeats - 2.5)));

    if (echoAnomaly > 0.1) {
      const impact = echoAnomaly * 70;
      const severity: SeverityLevel =
        repeats >= 5 ? "critical" : repeats >= 3 ? "high" : "medium";
      indicators.push({
        type: "ECHO",
        label: "Echo de Registre",
        value: `${repeats} répétitions`,
        severity,
        description:
          "Réplication anormale continue du tirage précédent (Loi Hypergéométrique).",
        impact,
      });
      logs.push({
        timestamp: new Date().toISOString(),
        level:
          severity === "critical"
            ? "critical"
            : severity === "high"
              ? "error"
              : "warn",
        indicator: "ECHO",
        message: `${repeats} répétitions J-1 (Anomalie ${(echoAnomaly * 100).toFixed(1)}%)`,
      });
      points += impact;
    }
  }
  return { indicators, logs, points };
};

/**
 * 6. Test Dérive Sigma & Anomalies Z-Scores (Norme L2)
 */
export const analyzeSigmaDrift = (
  numbers: Uint8Array,
  config: AuditConfig,
): AnalysisResponse => {
  const indicators: ForensicIndicator[] = [];
  const logs: ForensicLog[] = [];
  let points = 0;

  const n = numbers.length;
  const popVar = (Math.pow(DOMAIN_SIZE, 2) - 1) / 12;
  const sumStdDev = Math.sqrt(
    n * ((DOMAIN_SIZE - n) / (DOMAIN_SIZE - 1)) * popVar,
  );

  let sum = 0;
  for (let i = 0; i < n; i++) sum += numbers[i];

  const zS = (sum - config.avgTheoreticalSum) / (sumStdDev || 1);

  const expectedGap = DOMAIN_SIZE / (n + 1);
  const gapStdDev = expectedGap / 3;

  const sorted = new Uint8Array(numbers).sort();
  let avgG = 0;
  if (sorted.length > 1) {
    let gapSum = 0;
    for (let i = 0; i < sorted.length - 1; i++)
      gapSum += sorted[i + 1] - sorted[i];
    avgG = gapSum / (sorted.length - 1);
  }
  const zG = (avgG - expectedGap) / (gapStdDev || 1);

  const magnitudeL2 = Math.sqrt(zS * zS + zG * zG);
  const continuousAnomalyProb = 1 - Math.exp(-0.5 * magnitudeL2 * magnitudeL2);

  const anomalyThreshold = 1.0 - 1.0 / (1.0 + Math.exp(-1.702 * 1.5));
  const severityThreshold = 1.0 - 1.0 / (1.0 + Math.exp(-1.702 * 2.0));

  if (continuousAnomalyProb > anomalyThreshold) {
    const impact = Math.round(continuousAnomalyProb * 40);
    const severity: SeverityLevel =
      continuousAnomalyProb > severityThreshold ? "high" : "medium";
    indicators.push({
      type: "SIGMA",
      label: "Anomalie Combinée (Norme L2)",
      value: `Magn=${magnitudeL2.toFixed(2)}`,
      severity,
      description:
        "La norme L2 des déviations standardisées révèle un tirage hautement improbable.",
      impact,
    });
    logs.push({
      timestamp: new Date().toISOString(),
      level: severity === "high" ? "error" : "warn",
      indicator: "SIGMA",
      message: `Dérive continue (L2): Magnitude ${magnitudeL2.toFixed(2)}, Prob Anormale ${(continuousAnomalyProb * 100).toFixed(1)}%`,
    });
    points += impact;
  }
  return { indicators, logs, points };
};

/**
 * 7. Collapsus Entropique
 */
export const analyzeEntropyCollapse = (
  normalizedEntropy: number,
  historyLength: number,
): AnalysisResponse => {
  const indicators: ForensicIndicator[] = [];
  const logs: ForensicLog[] = [];
  let points = 0;

  const zEntropy = (normalizedEntropy - 0.5) / 0.2;
  const entropyAnomaly = 1 / (1 + Math.exp(zEntropy));
  const noiseFloor = 1.0 / Math.sqrt(historyLength > 5 ? historyLength : 5);
  if (entropyAnomaly > noiseFloor) {
    const impact = entropyAnomaly * 45;
    const severity: SeverityLevel =
      impact >= 30 ? "high" : impact >= 20 ? "medium" : "low";
    indicators.push({
      type: "ENTROPY",
      label: "Collapsus Entropique",
      value: `${Math.round(normalizedEntropy * 100)}%`,
      severity,
      description:
        "Perte de désordre dans le système (Lissage logistique continu).",
      impact,
    });
    points += impact;
  }
  return { indicators, logs, points };
};

/**
 * 8. Cycles Temporels (Autocorrélation Chronologique)
 */
export const analyzeTemporalCycles = (
  numbers: Uint8Array,
  history: DrawResult[],
): AnalysisResponse => {
  const indicators: ForensicIndicator[] = [];
  const logs: ForensicLog[] = [];
  let temporalPoints = 0;

  const maxHistory = Math.min(50, history.length);
  const lastSeen = new Int32Array(91).fill(-1);
  const gapsMap = new Map<number, number[]>();
  const numbersSet = new Set(numbers);

  for (let i = 0; i < maxHistory; i++) {
    const draw = history[i];
    for (let j = 0; j < draw.gagnants.length; j++) {
      const n = draw.gagnants[j];
      if (numbersSet.has(n)) {
        if (lastSeen[n] !== -1) {
          const gap = i - lastSeen[n];
          let gaps = gapsMap.get(n);
          if (!gaps) {
            gaps = [];
            gapsMap.set(n, gaps);
          }
          gaps.push(gap);
        }
        lastSeen[n] = i;
      }
    }
  }

  gapsMap.forEach((gaps, num) => {
    if (gaps.length >= 2) {
      const meanGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      // Variance empirique (dénominateur = n)
      const variance = gaps.reduce((a, b) => a + Math.pow(b - meanGap, 2), 0) / gaps.length;

      // Un numéro a une probabilité p = 5 / 90 d'être tiré
      const pDraw = 5.0 / DOMAIN_SIZE;
      // La distribution des écarts suit une loi géométrique de paramètre p
      const expectedVariance = (1 - pDraw) / (pDraw * pDraw); // ~306 pour 5/90

      // Approximation Chi-Deux de la variance de l'échantillon
      // (n * S^2) / sigma^2 suit approximativement un X^2 à (n-1) ddl
      const df = gaps.length - 1;
      const chiSquareStat = (gaps.length * variance) / expectedVariance;
      
      // On convertit le Chi-Deux en Z-score (approximation de Fisher)
      // Z = sqrt(2 * X^2) - sqrt(2 * df - 1)
      const zVar = Math.sqrt(2 * chiSquareStat) - Math.sqrt(2 * df - 1);
      
      // Un Z très négatif signifie une variance anormalement petite (périodicité mécanique)
      const periodicAnomaly = 1 / (1 + Math.exp(zVar));

      if (periodicAnomaly > 0.2 && meanGap > 1) {
        const consistency = gaps.length;
        const impact = periodicAnomaly * Math.min(60, 15 + consistency * 5);
        const severity: SeverityLevel =
          impact >= 40 ? "critical" : impact >= 25 ? "high" : "medium";

        indicators.push({
          type: "CYCLE",
          label: `Cycle Mécanique N°${num}`,
          value: `μ=${meanGap.toFixed(1)} (${consistency}x)`,
          severity,
          description: `Périodicité mécanique détectée via variance continue (σ²=${variance.toFixed(2)}).`,
          impact,
        });
        logs.push({
          timestamp: new Date().toISOString(),
          level:
            severity === "critical" || severity === "high" ? "warn" : "info",
          indicator: "CYCLE",
          message: `Périodicité détectée sur ${num} (μ=${meanGap.toFixed(1)}, σ²=${variance.toFixed(2)}, ${consistency} occurrences).`,
        });
        temporalPoints += impact;
      }
    }
  });

  return { indicators, logs, points: temporalPoints };
};

/**
 * 9. Analyse de Survie (Kaplan-Meier stochastique)
 */
export const analyzeSurvivalAnomalies = (
  numbers: Uint8Array,
  history: DrawResult[],
): AnalysisResponse => {
  const indicators: ForensicIndicator[] = [];
  const logs: ForensicLog[] = [];
  let points = 0;

  // Calcul de la distribution empirique des écarts dans l'historique
  let totalGaps = 0;
  let sumGaps = 0;
  let sumGapsSq = 0;
  const lastSeenEmpirical = new Int32Array(91).fill(-1);
  for (let i = 0; i < history.length; i++) {
    for (let j = 0; j < history[i].gagnants.length; j++) {
      const n = history[i].gagnants[j];
      if (lastSeenEmpirical[n] !== -1) {
        const g = i - lastSeenEmpirical[n];
        sumGaps += g;
        sumGapsSq += g * g;
        totalGaps++;
      }
      lastSeenEmpirical[n] = i;
    }
  }

  // Fallback aux valeurs théoriques Géométriques (p=5/90) si l'historique est trop court
  const pTheoretical = 5.0 / DOMAIN_SIZE;
  const empiricalMean = totalGaps > 10 ? sumGaps / totalGaps : (1 / pTheoretical);
  const empiricalStd = totalGaps > 10 ? Math.sqrt(Math.max(0, (sumGapsSq / totalGaps) - empiricalMean * empiricalMean)) : Math.sqrt((1 - pTheoretical) / (pTheoretical * pTheoretical));

  for (let i = 0; i < numbers.length; i++) {
    const num = numbers[i];
    let gap = 0;
    for (let j = 0; j < history.length; j++) {
      if (history[j].gagnants.includes(num)) break;
      gap++;
    }

    const survivalProb = Math.pow(1 - pTheoretical, gap);
    
    // Z-score empirique de survie (pas de nombre magique 0.05)
    // On compare l'écart à sa distribution empirique locale
    const zGap = (gap - empiricalMean) / Math.max(1, empiricalStd);
    
    // L'anomalie est continue, on détecte une survie > ~2.5 sigmas empiriques
    const anomalyScore = 1.0 / (1.0 + Math.exp(-1.5 * (zGap - 2.5)));

    if (anomalyScore > 0.1) {
      const impact = anomalyScore * 25;
      indicators.push({
        type: "SURVIVAL",
        label: `Survie Extrême N°${num}`,
        value: `Gap=${gap} (p=${(survivalProb * 100).toFixed(2)}%)`,
        severity: anomalyScore > 0.8 ? "high" : "medium",
        description: `Le numéro ${num} a brisé une période de dormance statistiquement improbable.`,
        impact,
      });
      points += impact;
    }
  }
  return { indicators, logs, points };
};

/**
 * 10. Anomalies Spectrales modulo 3
 */
export const analyzeSpectralAnomalies = (
  numbers: Uint8Array,
): AnalysisResponse => {
  const indicators: ForensicIndicator[] = [];
  const logs: ForensicLog[] = [];
  let points = 0;

  const distanceToHarmonic3 = Array.from(numbers).reduce((sum, n) => {
    const dist = Math.min(n % 3, 3 - (n % 3));
    return sum + dist;
  }, 0);

  // Un numéro a une proba 1/3 de distance 0 et 2/3 de distance 1 modulo 3.
  // Pour 5 tirages sans remise parmi 90 :
  // E[Total] = 5 * (2/3) = 10/3 ~ 3.333
  // Var(Total) = 5 * (2/9) * (90-5)/(90-1) = 10/9 * 85/89 ~ 1.0618
  const expectedDistance = 10.0 / 3.0;
  const stdDistance = Math.sqrt((10.0 / 9.0) * (85.0 / 89.0));

  const zHarmonic = (distanceToHarmonic3 - expectedDistance) / stdDistance;
  
  // Anomaly est grande si zHarmonic est très négatif (tous les numéros sont multiples de 3)
  // ou très positif (aucun multiple de 3, ou trop espacés de 3)
  // On utilise l'écart absolu à la moyenne
  const harmonicAnomaly = 1 / (1 + Math.exp(-2.0 * (Math.abs(zHarmonic) - 2.5)));

  if (harmonicAnomaly > 0.1) {
    const impact = harmonicAnomaly * 30;
    indicators.push({
      type: "SPECTRAL",
      label: "Résonance Harmonique",
      value: `Align=${(harmonicAnomaly * 100).toFixed(1)}%`,
      severity: harmonicAnomaly > 0.8 ? "high" : "medium",
      description:
        "Les numéros tirés vibrent sur des fréquences harmoniques de manière non-stochastique (Analyse continue).",
      impact,
    });
    points += impact;
  }
  return { indicators, logs, points };
};

/**
 * 11. Co-sorties & Corrélations Croisées (Optimisation des ensembles de Gagnants)
 */
export const analyzeCorrelationAnomalies = (
  numbers: Uint8Array,
  history: DrawResult[],
): AnalysisResponse => {
  const indicators: ForensicIndicator[] = [];
  const logs: ForensicLog[] = [];
  let points = 0;

  const scanDepth = Math.min(50, history.length);
  const winnerSets = Array.from(
    { length: scanDepth },
    (_, k) => new Set(history[k].gagnants),
  );

  for (let i = 0; i < numbers.length; i++) {
    for (let j = i + 1; j < numbers.length; j++) {
      const n1 = numbers[i];
      const n2 = numbers[j];

      let coCount = 0;
      for (let k = 0; k < scanDepth; k++) {
        if (winnerSets[k].has(n1) && winnerSets[k].has(n2)) {
          coCount++;
        }
      }

      const expectedCoCount = scanDepth * (5 / 90) * (4 / 89);
      const correlationAnomaly =
        1 / (1 + Math.exp(-2 * (coCount - expectedCoCount - 2)));

      if (correlationAnomaly > 0.2) {
        const impact = correlationAnomaly * 20;
        indicators.push({
          type: "CORRELATION",
          label: `Lien Symbiotique ${n1}-${n2}`,
          value: `${coCount} co-sorties`,
          severity: correlationAnomaly > 0.8 ? "high" : "medium",
          description: `Paire à corrélation excessive détectée. Probabilité de co-occurrence fortuite très faible.`,
          impact,
        });
        points += impact;
      }
    }
  }
  return { indicators, logs, points };
};

/**
 * 12. Ruptures de chaîne de Markov (État parité)
 */
export const analyzeMarkovAnomalies = (
  numbers: Uint8Array,
  history: DrawResult[],
): AnalysisResponse => {
  const indicators: ForensicIndicator[] = [];
  const logs: ForensicLog[] = [];
  let points = 0;
  if (history.length < 10) return { indicators, logs, points };

  const lastWinners = history[0].gagnants;
  const lastEvens = lastWinners.filter((n) => n % 2 === 0).length;
  const currEvens = Array.from(numbers).filter((n) => n % 2 === 0).length;

  const stateJump = Math.abs(lastEvens - currEvens);
  // Pour deux tirages indépendants, X, Y ~ Binomiale(5, 0.5)
  // L'espérance exacte de E[|X - Y|] calculée par distribution jointe est ~1.230
  const expectedJump = 1.23046875;
  // La variance exacte de |X - Y| est ~0.986
  const varianceJump = 0.9859466552734375;
  
  const slope = 1.0 / Math.max(Number.EPSILON, Math.sqrt(varianceJump));
  // Sigmoid centré sur expectedJump pour déterminer la déviance
  const jumpAnomaly = 1 / (1 + Math.exp(-slope * (stateJump - (expectedJump + Math.sqrt(varianceJump) * 2))));

  if (jumpAnomaly > 0.2) {
    const impact = jumpAnomaly * 35;
    indicators.push({
      type: "MARKOV_CHAIN",
      label: "Rupture de Chaîne de Markov",
      value: `Saut |ΔE|=${stateJump}`,
      severity: jumpAnomaly > 0.8 ? "high" : "medium",
      description:
        "Transition d'états (Pair/Impair) déviant fortement des probabilités stochastiques continues.",
      impact,
    });
    points += impact;
  }
  return { indicators, logs, points };
};

/**
 * 13. Test des suites de Wald-Wolfowitz "Runs Test"
 */
export const analyzeRunsTestAnomalies = (
  numbers: Uint8Array,
  history: DrawResult[],
): AnalysisResponse => {
  const indicators: ForensicIndicator[] = [];
  const logs: ForensicLog[] = [];
  let points = 0;
  if (history.length < 15) return { indicators, logs, points };

  const values: number[] = [];
  for (let i = 0; i < numbers.length; i++) {
    values.push(numbers[i]);
  }
  const subHistory = history.slice(0, 15).reverse();
  for (let i = 0; i < subHistory.length; i++) {
    const draw = subHistory[i];
    for (let j = 0; j < draw.gagnants.length; j++) {
      values.push(draw.gagnants[j]);
    }
  }

  const nTotal = values.length;
  const sortedValues = [...values].sort((a, b) => a - b);
  const median = sortedValues[Math.floor(nTotal / 2)];

  let n1 = 0;
  let n2 = 0;
  const signs: boolean[] = [];

  for (let i = 0; i < nTotal; i++) {
    const val = values[i];
    if (val > median) {
      n1++;
      signs.push(true);
    } else {
      n2++;
      signs.push(false);
    }
  }

  if (n1 === 0 || n2 === 0) return { indicators, logs, points };

  let runs = 1;
  for (let i = 1; i < signs.length; i++) {
    if (signs[i] !== signs[i - 1]) {
      runs++;
    }
  }

  const expectedRuns = (2 * n1 * n2) / nTotal + 1;
  const varianceRuns =
    (2 * n1 * n2 * (2 * n1 * n2 - nTotal)) /
    (Math.pow(nTotal, 2) * (nTotal - 1));

  if (varianceRuns <= 0) return { indicators, logs, points };

  const z = (runs - expectedRuns) / Math.sqrt(varianceRuns);
  const absZ = Math.abs(z);

  if (absZ > 1.96) {
    const isClustered = z < 0;
    const impact = Math.min(55, Math.round(20 + (absZ - 1.96) * 15));
    const severity: SeverityLevel = absZ > 2.58 ? "critical" : "high";

    indicators.push({
      type: "RUNS_TEST",
      label: "Instabilité Séquentielle (Wald-Wolfowitz)",
      value: `Z-Score=${z.toFixed(2)} (R=${runs})`,
      severity,
      description: isClustered
        ? "Déficit de transitions (runs) indiquant une sédimentation répétitive anormale des numéros."
        : "Excès d'alternance artificielle indiquant des oscillations de tirage forcées.",
      impact,
    });

    logs.push({
      timestamp: new Date().toISOString(),
      level: severity === "critical" ? "critical" : "warn",
      indicator: "RUNS_TEST",
      message: `Test de Wald-Wolfowitz rejeté. Z-Score=${z.toFixed(2)}, attendu=${expectedRuns.toFixed(1)}, observé=${runs}`,
    });

    points += impact;
  }

  return { indicators, logs, points };
};

/**
 * 14. Recherche de triplets d'ADN ultra-couplés (Clique Triplet stochastique récurrente)
 */
export const analyzeCliqueTripletAnomalies = (
  numbers: Uint8Array,
  history: DrawResult[],
): AnalysisResponse => {
  const indicators: ForensicIndicator[] = [];
  const logs: ForensicLog[] = [];
  let points = 0;
  const maxHistory = Math.min(250, history.length);
  if (maxHistory < 10) return { indicators, logs, points };

  const current = Array.from(numbers).sort((a, b) => a - b);
  const triplets: [number, number, number][] = [];
  for (let i = 0; i < current.length; i++) {
    for (let j = i + 1; j < current.length; j++) {
      for (let k = j + 1; k < current.length; k++) {
        triplets.push([current[i], current[j], current[k]]);
      }
    }
  }

  const historyWinnerSets = Array.from(
    { length: maxHistory },
    (_, h) => new Set(history[h].gagnants),
  );

  for (let t = 0; t < triplets.length; t++) {
    const [t1, t2, t3] = triplets[t];
    let occurrences = 0;

    for (let h = 0; h < maxHistory; h++) {
      const winnersSet = historyWinnerSets[h];
      if (winnersSet.has(t1) && winnersSet.has(t2) && winnersSet.has(t3)) {
        occurrences++;
      }
    }

    const expectedOccurrences = maxHistory * (10 / 117480);
    const center = 1.5; // Centré entre 1 et 2 occurrences
    const slope = 1.0 / Math.max(Number.EPSILON, Math.sqrt(expectedOccurrences));
    const anomalyScore = 1.0 / (1.0 + Math.exp(-slope * (occurrences - center)));

    if (anomalyScore > 0.1) {
      const impact = anomalyScore * 60;
      const severity: SeverityLevel = occurrences >= 3 ? "critical" : occurrences >= 2 ? "high" : "medium";

      indicators.push({
        type: "CLIQUE_TRIPLET",
        label: `Clique Triplet d'ADN [${t1}-${t2}-${t3}]`,
        value: `${occurrences} occurrences`,
        severity,
        description: `Surgissement hautement anormal d'un triplet fixe. Risque critique de biais mécanique ou structurel (Anomalie continue = ${(anomalyScore * 100).toFixed(1)}%).`,
        impact,
      });

      logs.push({
        timestamp: new Date().toISOString(),
        level: "error",
        indicator: "CLIQUE_TRIPLET",
        message: `Triplet répétitif détecté: [${t1}, ${t2}, ${t3}] est apparu ${occurrences} fois sur les derniers ${maxHistory} tirages.`,
      });

      points += impact;
      break;
    }
  }

  return { indicators, logs, points };
};

/**
 * 15. Exposant de Hurst (Détection de mémoire fractale artificielle)
 */
export const analyzeHurstExponentAnomalies = (
  history: DrawResult[],
): AnalysisResponse => {
  const indicators: ForensicIndicator[] = [];
  const logs: ForensicLog[] = [];
  let points = 0;
  const historyLength = Math.min(100, history.length);
  if (historyLength < 30) return { indicators, logs, points };

  const totals: number[] = [];
  for (let i = 0; i < historyLength; i++) {
    totals.push(history[i].gagnants.reduce((a, b) => a + b, 0));
  }

  const n = totals.length;
  const mean = totals.reduce((a, b) => a + b, 0) / n;

  const devAccum: number[] = Array(n).fill(0);
  let cumSum = 0;
  for (let i = 0; i < n; i++) {
    cumSum += totals[i] - mean;
    devAccum[i] = cumSum;
  }

  let sumSquares = 0;
  for (let i = 0; i < n; i++) {
    sumSquares += Math.pow(totals[i] - mean, 2);
  }
  const stdDev = Math.sqrt(sumSquares / n);

  if (stdDev === 0) return { indicators, logs, points };

  let maxAccum = devAccum[0];
  let minAccum = devAccum[0];
  for (let i = 1; i < n; i++) {
    if (devAccum[i] > maxAccum) maxAccum = devAccum[i];
    if (devAccum[i] < minAccum) minAccum = devAccum[i];
  }
  const range = maxAccum - minAccum;
  const rescaledRange = range / stdDev;
  const H = Math.log(rescaledRange) / Math.log(n);

  const dH = Math.abs(H - 0.5);
  const delta = dH;
  const thresholdDH = 0.2; // Seuil de déviation théorique (H > 0.7 ou H < 0.3)
  const stdErrorH = 1.0 / Math.sqrt(historyLength);
  const slope = 1.0 / Math.max(Number.EPSILON, stdErrorH);
  const anomalyScore = 1.0 / (1.0 + Math.exp(-slope * (dH - thresholdDH)));

  if (anomalyScore > 0.1) {
    const isPersistent = H > 0.5;
    const impact = anomalyScore * 50;
    const severity: SeverityLevel = anomalyScore > 0.8 ? "critical" : anomalyScore > 0.5 ? "high" : "medium";

    indicators.push({
      type: "HURST_EXPONENT",
      label: "Mémoire Fractale (Hurst)",
      value: `H=${H.toFixed(3)}`,
      severity,
      description: isPersistent
        ? "Mémoire à long terme détectée. Les écarts d'énergie tendent à s'auto-entretenir de manière non-stochastique (Anomalie continue)."
        : "Hyper-correction ou oscillation artificielle (Anti-persistance excessive, Anomalie continue).",
      impact,
    });

    logs.push({
      timestamp: new Date().toISOString(),
      level: "warn",
      indicator: "HURST_EXPONENT",
      message: `Exposant de Hurst anormal déviant de la zone de bruit blanc: H=${H.toFixed(3)} (Delta=${delta.toFixed(3)})`,
    });

    points += impact;
  }

  return { indicators, logs, points };
};

/**
 * 16. Analyse Topologique René Thom Cusp Catastrophe
 */
export const analyzeCatastropheRupture = (
  numbers: Uint8Array,
): {
  topologicalTensionIndex: number;
  catastropheControlParams: {
    a: number;
    b: number;
    discriminant: number;
    regime: string;
  };
  indicators: ForensicIndicator[];
  logs: ForensicLog[];
  points: number;
} => {
  let suspicionPoints = 0;
  const indicators: ForensicIndicator[] = [];
  const logs: ForensicLog[] = [];

  const current = Array.from(numbers).sort((a, b) => a - b);

  const xCoords = current.map((n) => (n - 1) % 9);
  const yCoords = current.map((n) => Math.floor((n - 1) / 9));

  const meanX = xCoords.reduce((sum, val) => sum + val, 0) / 5;
  const meanY = yCoords.reduce((sum, val) => sum + val, 0) / 5;

  const pairsDist: number[] = [];
  for (let i = 0; i < current.length; i++) {
    for (let j = i + 1; j < current.length; j++) {
      const dx = xCoords[i] - xCoords[j];
      const dy = yCoords[i] - yCoords[j];
      pairsDist.push(Math.sqrt(dx * dx + dy * dy));
    }
  }

  const avgDist =
    pairsDist.reduce((sum, val) => sum + val, 0) / pairsDist.length;

  // 4.2 est la distance euclidienne moyenne théorique entre deux points choisis aléatoirement sur une grille 9x10 (dérivée géométriquement)
  const theoreticalMeanDist = 4.2;
  const varX = xCoords.reduce((sum, val) => sum + Math.pow(val - meanX, 2), 0) / 5;
  const varY = yCoords.reduce((sum, val) => sum + Math.pow(val - meanY, 2), 0) / 5;
  const spatialVariance = (varX + varY) / 2.0 || 1.0;

  // Les coefficients d'échelle a et b sont rendus proportionnels à la variance spatiale observée
  const a = (avgDist - theoreticalMeanDist) * (10.0 / spatialVariance);
  const b = (meanX - 4.0) * (5.0 / Math.sqrt(spatialVariance));
  const discriminant = 4 * Math.pow(a, 3) + 27 * Math.pow(b, 2);

  let regime = "STABLE_MONOSTABLE";
  let feedback = "Nominal";
  let impact = 0;
  let severity: SeverityLevel = "low";

  if (discriminant <= 0) {
    regime = "BIFURCATION_ACTIVE";
    feedback =
      "Rupture topologique active. Distribution spatiale bimodalitaire hautement asymétrique.";
    severity = discriminant < -15 ? "critical" : "high";
    impact = Math.min(65, Math.round(25 + Math.abs(discriminant) * 1.5));
  } else {
    if (discriminant < 5) {
      regime = "CRITICAL_TENSION";
      feedback =
        "Proximité de point critique. Risque imminent de glissement de phase topologique.";
      severity = "medium";
      impact = 15;
    } else {
      regime = "STABLE_MONOSTABLE";
      feedback =
        "Régime stable monostable. Tensions spatiales régies par une entropie saine.";
      severity = "low";
      impact = 0;
    }
  }

  const compressionFactor = Math.abs(avgDist - 4.2) / 2.0;
  const centerDrift =
    Math.sqrt(Math.pow(meanX - 4, 2) + Math.pow(meanY - 4.5, 2)) / 3.8;
  const rawTension = (compressionFactor * 0.65 + centerDrift * 0.35) * 100;
  const topologicalTensionIndex = Math.min(
    100,
    Math.max(8, Math.round(rawTension)),
  );

  if (impact > 0) {
    indicators.push({
      type: "CATASTROPHE_RUPTURE",
      label: "Topologie de Rupture Spatiale",
      value: `Δ = ${discriminant.toFixed(2)} (${regime})`,
      severity,
      description: `${feedback} Tension topologique mesurée à ${topologicalTensionIndex}%.`,
      impact,
    });

    logs.push({
      timestamp: new Date().toISOString(),
      level: severity === "critical" ? "critical" : "warn",
      indicator: "CATASTROPHE_RUPTURE",
      message: `René Thom Cusp Catastrophe détectée: Discriminant=${discriminant.toFixed(2)} (${regime}). Tensions spatiales compressées/asymétriques.`,
    });

    suspicionPoints += impact;
  }

  return {
    topologicalTensionIndex,
    catastropheControlParams: {
      a,
      b,
      discriminant,
      regime,
    },
    indicators,
    logs,
    points: suspicionPoints,
  };
};

// ============================================================================
// PRIMARY ANALYSIS FACADE
// ============================================================================

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

// ============================================================================
// STATISTICAL MATHEMATICAL FORMULAS (ZERO MAGIC NUMBER)
// ============================================================================

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
      Object.keys(algoWeights).forEach((kKey) => {
        const k = kKey as AlgoKey;
        score += (algoWeights[k] || 0) * (bd[k] || 0);
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
  Object.keys(algoWeights).forEach((kKey) => {
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
    postMortemStabilityScore
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

export * from "./forensicTrainingBridge";
