import { AlgoKey, DEFAULT_ALGO_WEIGHTS, AlgoWeights, ScoreBreakdown } from "./shared/prediction.types";
export { AlgoKey, DEFAULT_ALGO_WEIGHTS, type AlgoWeights, type ScoreBreakdown };

export interface GapEfficiency {
  number: number;
  currentGap: number;
  maxGap: number;
  avgGap: number;
  probabilityAtCurrentGap: number;
  maturityScore: number;
  zone: "COLD" | "WARMING" | "HOT" | "CRITICAL";
  // New Stochastic Metrics
  zScore: number; // Écart type par rapport à la moyenne
  fatigueIndex: number; // Résistance du numéro à sortir
  breakoutProb: number; // Probabilité gaussienne de rupture
  // Survival Analysis Metrics
  kaplanMeierProb?: number; // Probabilité de rupture avant l'écart actuel S(t)
  hazardRate?: number; // Probabilité de rupture immédiate h(t)
}

export interface DigitalRootMetric {
  root: number;
  count: number;
  lastSeen: number;
  trend: "UP" | "DOWN" | "FLAT";
}

export interface Draw {
  day: string;
  time: string;
  name: string;
}

export interface SubscriptionState {
  status: "active" | "trial" | "expired" | "paid";
  daysLeft: number;
  expiresAt: string;
  plan: "premium" | "free";
}

export interface DrawResult {
  id: string;
  drawName: string;
  draw_name?: string;
  date: string;
  gagnants: number[];
  machine?: number[];
  version?: number;
}

export interface ProjectionItem {
  number: number;
  probability: number;
}

export interface TopFollowerAnalysis {
  number: number;
  count: number;
  lastSeen?: string;
}

export interface PredictionHistoryItem {
  id: string;
  timestamp: number;
  drawName: string;
  prediction: Prediction;
  drawResultId: string | null;
  feedback?: PredictionFeedback;
  engineType?: "local" | "cloud";
  isSimulation?: boolean;
  isExploratory?: boolean;
  simulationCategory?: 'WHAT_IF' | 'SCENARIO' | 'EXPLORATORY' | 'BACKTEST' | 'BENCHMARK';
  scenarioName?: string;
}

export interface Prediction {
  drawName?: string;
  suggestedNumbers: number[];
  candidates: number[];
  confidence: number;
  analysis: string;
  breakdown: Record<number, ScoreBreakdown>;
  timestamp: number;
  engineType?: "local" | "cloud";
  isSimulation?: boolean;
  isExploratory?: boolean;
  simulationCategory?: 'WHAT_IF' | 'SCENARIO' | 'EXPLORATORY' | 'BACKTEST' | 'BENCHMARK';
  scenarioName?: string;
  mathModelSummary?: string;
  symbiosisFactor?: number;
  realityAlignment?: number;
  adversarialApplied?: boolean;
  challengedNumbers?: number[];
  stabilityScore?: number;
  diversityMetrics?: {
    meanSimilarity: number;
    diversityScore: number;
    penalty: number;
    isMonoculture: boolean;
    pairwiseSimilarities: number[];
    dominantAlgo: string | null;
  };
  xapExp?: import('./services/training/DNAOptimizer').XAPExplanation[];
  adversarialSurvivalScore?: number;
  adversarialRisks?: string[];
  explainabilityData?: Record<number, any>;
  shrinkageApplied?: boolean;
  shrinkageFactor?: number;
  shrinkageFactorMap?: Record<number, number>;
  shrinkageVerification?: any;
  hyperparameters?: any;
  hyperTuningLog?: string[];
  hyperAccuracyGain?: number;
  aiWeights?: Record<string, number>;
  aiRationale?: string;
  aiStrategicAdvice?: string;
  isLocalFallback?: boolean;
  cyclicPhaseProfile?: {
    phase: 'PERIODIC_ATTRACTOR' | 'STOCHASTIC_DISPERSION' | 'TRANSITIONAL_ORBIT';
    phaseLabel: string;
    lyapunovExponent: number;
    isChaotic: boolean;
    stochasticDispersionIndex: number;
    attractorTension: number;
    confidenceModulator: number;
    dominantMacroFamily: string;
    macroFamilyWeights: {
      attractorResonance: number;
      stochasticDiffusion: number;
      topologicalAffinity: number;
    };
    algoWeightModifiers: Partial<Record<string, number>>;
    narrativeInterpretation: string;
  };
  temporalDriftLearning?: {
    learningRate: number;
    klDivergence: number;
    entropyVariance: number;
    lambda: number;
    driftResistanceFactor: number;
  };
  dnaSieve?: {
    dominantAlgos: string[];
    dnaConcordanceMean: number;
    affinityPercent?: Record<number, number>;
    multipliers?: Record<number, number>;
    entropyBits?: number;
    sieveIntensitySNR?: number;
    elitesCount?: number;
    shadowsCount?: number;
    retentionRatePct?: number;
    macroFamilies?: {
      familyKey: string;
      familyName: string;
      currentWeightPct: number;
      sieveEnergyPct: number;
    }[];
  };
}

export interface PredictionFeedback {
  keyLearning: string;
  userRating: "Visionnaire" | "Standard" | "Incohérente";
  userComment: string;
}

/**
 * Interface générique unifiée pour les instantanés de prédictions et les logs d'apprentissage.
 * Garantit la cohérence des types et élimine la dette technique des casts untyped.
 */
export interface PredictionSnapshot<
  TWeightMap = Record<string, number>,
  TForensicData = Record<string, any>
> {
  id: string;
  userId?: string | null;
  drawName: string;
  targetDate?: string;
  suggestedNumbers: number[];
  candidates: number[];
  confidence: number;
  weights: TWeightMap;
  metrics?: TForensicData;
  createdAt?: string;
}

// --- NOUVEAUX TYPES FORENSIC ---

export interface CounterfactualResult {
  algo: string;
  originalWeight: number;
  optimalWeight: number;
  potentialHits: number;
  potentialNumbers: number[];
  missedNumbers?: number[];
  improvement: number; // % d'amélioration
  action?: "BOOST" | "REDUCE" | "ISOLATE" | "SYNERGY" | "SYNERGY (Orthogonal)" | "OPTIMAL_DNA" | "GRADIENT_STEP";
  description?: string;
  rankImprovement?: number;
  optimalWeightsDistribution?: Record<string, number>;
  originalWeightsDistribution?: Record<string, number>;
  proposedWeightChange?: number; // Delta exact dérivé de la descente de gradient continue
}

export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical';
export type IndicatorType = 'BENFORD' | 'SIGMA' | 'ENTROPY' | 'HARMONY' | 'CYCLE' | 'CLUSTER' | 'KS_TEST' | 'LJUNG_BOX' | 'ECHO' | 'SURVIVAL' | 'SPECTRAL' | 'CORRELATION' | 'MARKOV_CHAIN' | 'RUNS_TEST' | 'HURST_EXPONENT' | 'CLIQUE_TRIPLET' | 'CATASTROPHE_RUPTURE';

export type ForensicFailureMode =
  | "normalnoise"
  | "overconfidence"
  | "recentoverfit"
  | "structuralmisalignment"
  | "regimebreak"
  | "anomalousdraw";

export interface ForensicActionableAdjustment {
  target: string;
  action: 'increase' | 'decrease' | 'stabilize';
  magnitude: number;
  reason?: string;
}

export interface ForensicLog {
    timestamp: string;
    level: 'info' | 'warn' | 'error' | 'critical';
    indicator: IndicatorType | 'SYSTEM';
    message: string;
    metadata?: Record<string, unknown>;
}

export interface ForensicIndicator {
    type: IndicatorType;
    label: string;
    value: string;
    severity: SeverityLevel;
    description: string;
    impact: number;
}

export interface SpectralDeviation {
  number: number;
  predictedEnergy: number;
  actualEnergy: number; // 100 si sorti, 0 sinon (ou une valeur dérivée des stats)
  delta: number;
}

export interface MissedOpportunity {
  number: number;
  reason: string;
  zScore?: number;
  continuousWeight?: number;
  bestAlgo?: string;
}

export interface ScoreDivergence {
  algo: string;
  impact: number;
}

export interface AlgorithmicDrift {
  algo: string;
  driftScore: number;
  direction: 'overestimating' | 'underestimating';
}

export interface NearMiss {
  predicted: number;
  actual: number;
  distance: number;
  algo?: string;
  errorType?: string;
}

export interface MissedSignal {
  pattern: string;
  type: string;
  significance: number;
}

export interface ZScoreItem {
  number: number;
  z: number;
}

export interface ForensicConfidence {
  level: 'low' | 'medium' | 'high';
  reasons: string[];
}

export interface CatastropheControlParams {
  a: number;
  b: number;
  discriminant: number;
  regime: string;
}

export interface ForensicMetrics {
  sum: number;
  amplitude: number;
  ac: number;
  consecutives: number;
  odds: number;
}

export interface StatisticalDeviations {
  sumZScore: number;
  amplitudeZScore: number;
  acZScore: number;
  consecutivesPValue: number;
  parityPValue: number;
}

export interface ForensicReport {
  id: string;
  drawName: string;
  date: string;
  predictionId?: string;
  drawResultId?: string;
  matches: ForensicEvidence[];
  missedOpportunities: MissedOpportunity[];
  scoreDivergence: ScoreDivergence[];
  suspicionScore?: number;
  indicators?: ForensicIndicator[];
  riggedProbability?: number;
  unifiedIntegrityIndex?: number;
  idealAlgorithmicDriftTolerance?: number;
  entropyCollapse?: boolean;
  benfordCompliance?: number;
  evidenceLogs?: ForensicLog[];
  // New Data
  counterfactuals?: CounterfactualResult[];
  spectralDeviations?: SpectralDeviation[];
  rmse?: number; // Root Mean Square Error du modèle
  continuousTopologicalLoss?: number; // Nouvelle perte continue topologique
  wassersteinLoss?: number; // Distance de Wasserstein (Earth Mover's Distance)
  kl_divergence?: number; // Kullback-Leibler Divergence
  brier_score?: number; // Probabilistic accuracy
  winningXAP?: import('./services/training/DNAOptimizer').XAPExplanation[];
  // Forensic exact calculations
  timestamp?: string;
  combo?: number[];
  forensicScore?: number;
  metrics?: ForensicMetrics;
  statisticalDeviations?: StatisticalDeviations;
  klDivergenceProxy?: number;
  // Injection Oraculaire (DNA)
  algorithmicDrift?: AlgorithmicDrift[];
  nearMisses?: NearMiss[];
  missedSignals?: MissedSignal[];
  shannon_entropy?: number; // Incertitude de la prédiction
  z_scores?: ZScoreItem[]; // Anomalie statistique des gagnants
  divergenceMetric?: number; // Divergence par rapport aux prévisions (0=parfait, 100=chaos total)
  // AI Analysis
  aiAnalysis?: string;
  recommendations?: string[];
  modelUsed?: string;
  isBlackSwan?: boolean; // Indicateur de tirage chaotique imprévisible
  proposedAdjustments?: AlgorithmicAdjustment[]; // New field for anomaly detection
  dnaOrbitingIndex?: number; // Taux de circularité / d'orbitage de l'ADN
  consensusStrength?: number; // Force du consensus des algorithmes
  antiConsensusActive?: boolean; // Si l'Oracle Adversarial était actif pour corriger ce tirage
  challengedTargets?: number[]; // Cibles restreintes par l'Oracle Adversarial avant le tirage
  topologicalTensionIndex?: number; // Tension topologique globale sur la grille de jeu
  catastropheControlParams?: CatastropheControlParams; // Paramètres d'écart catastrophe de René Thom
  gravitationalDriftVelocity?: number; // Vitesse de dérive gravitationnelle
  // New action-oriented forensic fields
  failureMode?: ForensicFailureMode;
  verdict?: ForensicFailureMode;
  severity?: SeverityLevel;
  forensicConfidence?: ForensicConfidence;
  drawAnomalyScore?: number;
  modelMissScore?: number;
  structuralQualityScore?: number;
  dominantCauses?: string[];
  recommendedAdjustments?: ForensicActionableAdjustment[];
  warnings?: string[];
  postMortemStabilityScore?: number;
  dnaPostMortem?: DnaPostMortemMetrics;
}

export type DnaAnomalyCategory =
  | 'BIAIS_TOPOLOGIQUE_SPATIAL'
  | 'SURCONCENTRATION_ADN'
  | 'ANOMALIE_PHASE_TEMPORELLE'
  | 'DECONNEXION_MARKOV_AFFINITE'
  | 'FUITE_MACHINE_STOCHASTIQUE'
  | 'EFFONDREMENT_ENTROPIQUE';

export interface DnaAnomalyReport {
  id: string;
  category: DnaAnomalyCategory;
  severity: SeverityLevel;
  description: string;
  impactScore: number; // Impact en % sur la fiabilité de l'ADN
  degradationFactors: string[];
  correctiveAction: {
    targetParameter: string;
    adjustmentFormula: string;
    dampingFactor: number;
    recommendedValueChange: number;
    explanation: string;
  };
}

export interface DnaReliabilityDegradationFactor {
  factor: string;
  degradationLevel: number; // 0 à 1
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  continuousRemediation: string;
}

export interface DnaPostMortemMetrics {
  dnaErrorRate: number; // 0 - 100%
  dnaWassersteinDistance: number;
  dnaCosineSimilarity: number;
  genomicProfileDivergence: number; // Divergence KL entre profil prédit et composition gagnante
  recurrentBiases: {
    paritySkewZScore: number;
    decadeConcentrationGini: number;
    dominantGeneBiases: { gene: string; biasPercent: number; direction: 'SUR' | 'SOUS' }[];
    hawkesExcitationExcess: number;
    temporalPhaseDrift: number;
  };
  reliabilityDegradationMap: DnaReliabilityDegradationFactor[];
  classifiedAnomalies: DnaAnomalyReport[];
  feedbackAdjustments: {
    targetGene: string;
    sieveDamping: number;
    phaseCorrection: number;
    entropyRegularization: number;
  }[];
}

export interface FilterRuleEvaluation {
  ruleId: string;
  ruleName: string;
  description: string;
  appliedThreshold: string;
  measuredValue: number;
  isPassed: boolean;
  penaltyWeight: number;
}

export interface FilterValidationCertificate {
  isCompliant: boolean;
  complianceScore: number; // 0 - 100%
  totalEnergy: number;
  ruleEvaluations: FilterRuleEvaluation[];
  dnaIntegrityPreserved: boolean;
  eliminatedCombinationsCount: number;
  retainedCombinationRank: number;
  timestamp: string;
}

export interface CondensedForensicReport {
  id: string;
  drawName: string;
  date: string;
  predictionId?: string;
  drawResultId?: string;
  timestamp?: string;
  matchesSummary: {
    predicted: number;
    actual: number | null;
    errorType: "Hit" | "Voisin" | "Miroir" | "Shadow" | "Machine" | "None";
    delta: string;
  }[];
  exactHitsCount: number;
  nearMissesCount: number;
  totalPredicted: number;
  unifiedIntegrityIndex?: number; // UFI (0-100)
  rmse?: number;
  brier_score?: number;
  kl_divergence?: number;
  shannon_entropy?: number;
  forensicScore?: number;
  suspicionScore?: number;
  failureMode?: ForensicFailureMode;
  verdict?: ForensicFailureMode;
  severity?: SeverityLevel;
  aiAnalysisSummary?: string;
  isCondensed: boolean;
  hasFullPayload?: boolean;
}

export interface StorageAuditReport {
  drawName?: string;
  timestamp: number;
  totalPredictionsCount: number;
  realPredictionsCount: number;
  exploratorySimulationsCount: number;
  totalForensicReportsCount: number;
  compressedReportsCount: number;
  uncompressedReportsCount: number;
  orphanSnapshotsCount: number;
  orphanForensicCount: number;
  estimatedTotalSizeKb: number;
  estimatedSimulationsSizeKb: number;
  estimatedReclaimableKb: number;
  storageHealthScore: 'OPTIMAL' | 'MODERATE' | 'ATTENTION_REQUIRED';
  compressionRatioPct: number;
  exploratorySimulationIds: string[];
  orphanSnapshotKeys: string[];
  orphanForensicIds: string[];
}

export interface StorageOptimizationResult {
  purgedSimulationsCount: number;
  purgedSnapshotsCount: number;
  purgedOrphanForensicCount: number;
  compressedReportsCount: number;
  bytesFreedKb: number;
  auditBefore: StorageAuditReport;
  auditAfter: StorageAuditReport;
}

export interface AlgorithmicAdjustment {
  algo: string;
  proposedWeightChange: number;
  reason: string;
}

export interface ForensicEvidence {
  predicted: number;
  actual: number | null;
  errorType: "Hit" | "Voisin" | "Miroir" | "Shadow" | "Machine" | "None";
  delta: string;
  suggestedCorrection?: string;
}

export interface SpectralMetric {
  number: number;
  energy: number;
  resonance?: boolean;
  dominantPeriod?: number;
}

export interface LearningSession {
  id: string;
  drawName: string;
  timestamp: number;
  adjustments?: {
    algo: string;
    oldWeight: number;
    newWeight: number;
    reason: string;
  }[];
  missedNumber?: number;
}

export interface NeuralFeedbackLog {
  id: string;
  timestamp: number;
  drawName: string;
  algo: string;
  oldWeight: number;
  newWeight: number;
  direction: 'BOOST' | 'REDUCE' | 'STABILIZE';
  impactPercentage: number;
  reason: string;
}

export interface OrchestrationPattern {
  type: PatternType;
  count: number;
}

export type PatternType =
  | "Miroir"
  | "Voisin"
  | "Transfert Machine"
  | "Répétition"
  | "Leurre Machine"
  | "Suite"
  | "Finale"
  | "Dizaine";

export interface MathAnalysisReport {
  parity: { odd: number; even: number };
  lowHigh: { low: number; high: number };
  sumHistory: { date: string; sum: number; avg: number }[];
  finales: { digit: number; count: number }[];
  consecutiveStats: { count: number; percentage: number };
  runsTest: { zScore: number; isRandom: boolean };
}

export interface ShadowNumbers {
  sumModulo: number;
  goldenNumber: number;
  firstCompliment: number;
  gapLink: number;
}

export interface TrendOscillatorPoint {
  momentum: number;
}

export interface FractalMetric {
  number: number;
  hurst: number;
  gapEntropy?: number;
  regime?: "PERSISTANT" | "ANTI-PERSISTANT" | "RANDOM";
}

export interface NumberRegularity {
  number: number;
  currentGap: number;
  avgGap: number;
  stdDev: number;
  lastGaps: number[];
}

export interface ClusterPoint {
  number: number;
  x: number;
  y: number;
  cluster: string;
}

export interface ClusterSummary {
  type: string;
  count: number;
  description: string;
  color: string;
  icon: string;
}

export interface BarycenterPoint {
  x: number;
  y: number;
  drawIndex: number;
}

export interface DetailedNumberMetrics {
  temperature: number;
  hurst: number;
  lastGap: number;
  nextProb: number;
  historyGraph: number[];
  affinity: number[];
  nemesis: number[];
}

export interface ChiSquareMetric {
  score: number;
}

export * from "./shared/prediction.types";

export interface ScoreComposition {
  structural: number;
  markov: number;
  machine: number;
  trend: number;
}

export interface FeatureVector {
  repeatShort: number;      // 0..1
  machineTransfer: number;  // 0..1
  mirror: number;           // 0..1
  neighbor: number;         // 0..1
  markov: number;           // 0..1
  trend: number;            // 0..1
  seasonal: number;         // 0..1
  structuralCoherence: number; // 0..1
}

export interface SymbioticContext {
  spatialHotZones: number[];
  orchestrationBoosts: Record<number, number>;
  forestVotes: Record<number, number>;
  spatialDeadZones?: number[];
  spectralVeto?: number[];
  temporalTarget?: unknown;
}

export interface AdaptiveRules {
  criticalZoneMin: number;
  criticalZoneMax: number;
}

export interface TicketAnalysisResult {
  score: number;
  verdict: string;
  warnings: string[];
  ac: number;
  sum: number;
  parity: string;
  amplitude: number;
  consecutives: number;
  diversityMetrics?: {
    meanSimilarity: number;
    diversityScore: number;
    penalty: number;
    isMonoculture: boolean;
    pairwiseSimilarities: number[];
    dominantAlgo: string | null;
  };
}

export interface TrainingReport {
  totalTests: number;
  totalHits: number;
  averageHits: number;
  successRate: number;
  stabilityScore: number;
  stabilityLabel: string;
  winDistribution: {
    zero: number;
    one: number;
    two: number;
    three: number;
    four: number;
    five: number;
  };
  history: TrainingResult[];
  score: number;
  learnedPatternsSummary: unknown;
  regimeInfo: { regime: string; hurst: number };
  calibration_curve?: { expected: number; actual: number }[];
  brier_score?: number;
  calibration_flag?: boolean;
  confidence_intervals?: {
    avgHits: [number, number];
    successRate: [number, number];
    score: [number, number];
  };
  score_drift?: number;
  mrr?: number;
  ndcg?: number;
  topologicalLoss?: number;
}

export interface TrainingResult {
  date: string;
  drawName: string;
  predictedNumbers: number[];
  actualWinningNumbers: number[];
  hits: number[];
  hitCount: number;
  isJackpot: boolean;
  confidence: number;
  breakdown: Record<number, ScoreBreakdown>;
  topologicalLoss?: number;
}

export interface SavedTicket {
  id: string;
  createdAt: number;
  status: "active" | "archived";
  numbers: number[];
  drawName: string;
  strategy?: string;
}

export interface SpatialMetrics {
  gridDensity: number[];
  detectedPatterns: unknown[];
  barycenter: { x: number; y: number };
  advancedClusters: SpatialCluster[];
  gravityWells: unknown[];
}

export interface SpatialCluster {
  id: string;
  center: { x: number; y: number };
  numbers: number[];
  density: number;
  potential: number;
  color: string;
}

export interface ForestVote {
  candidate: number;
  score: number;
  rawScore?: number;
  dnaAffinity?: number;
  dnaMultiplier?: number;
  isDnaBoosted?: boolean;
  votes: { temporal: number; spatial: number; structural: number };
  decisionPath: DecisionNode;
  features: { isConsensusTrap: boolean; values?: number[] };
}

export interface DecisionNode {
  id: string;
  type: "condition" | "leaf" | "outcome";
  label: string;
  prob?: number;
  children?: DecisionNode[];
}

// --- HYPER-CONVERGENCE TYPES ---

export interface PlatinumResult {
  id: string;
  drawName: string;
  timestamp: number;
  confidence: number;

  // Core Data
  consensusVector: number[]; // Tableau de 90 scores (0-100)
  scenarios: PlatinumScenario[];

  // Metrics
  coherence: number; // 0-100 (Entropie inversée)
  regime: "STABLE" | "CHAOTIC" | "TRANSITION";
  entropy: number;
  dnaSieveInfo?: {
    active: boolean;
    dominantAlgos: string[];
    dnaConcordanceMean: number;
    sieveIntensityPercent?: number;
    entropyBits?: number;
  };
  regimeProbabilities?: {
    stable: number;
    transition: number;
    chaotic: number;
  };
  jaccardMetrics?: {
    meanJaccard: number;           // Indice Jaccard temporel moyen inter-tirages
    stdDevJaccard: number;        // Écart-type d'inertie Jaccard
    theoreticalJaccard: number;   // Jaccard théorique stationnaire
    jaccardInertiaRatio: number;  // Ratio d'inertie Jaccard R_J
    ballJaccardIndices?: Record<number, number>; // Tenseur Jaccard individuel
  };
}

export interface PlatinumScenario {
  id: string;
  name: string;
  description: string;
  numbers: number[];
  probability: number;
  risk: "LOW" | "MEDIUM" | "HIGH";
  color: string;
  jaccardScore?: number;
  genomicProfile?: {
    focus: string;
    mrrBoost?: number;
    sieveAccelerationDelta?: number;
    entropyRegimeAdaptive?: boolean;
    jaccardCouplingPct?: number;
    macroFingerprint?: {
      familyKey: string;
      familyName: string;
      energyPct: number;
    }[];
  };
}

export interface PlatinumAudit {
  predictionId: string;
  date: string;
  actualDraw: number[];
  bestTimeline: string;
  bestScore: number;
  syncScore: number;
  timelinePerformance: {
    type: string;
    hits: number;
    numbers: number[];
    klDivergence?: number;
  }[];
  verdict: string;
}

export interface PlatinumUserOptions {
  regimePivot: number;     // Pivot of the regime transition (default: 0.80)
  forensicGain: number;    // Multiplier for the forensic adjustments (default: 1.0)
  phaseFrequency: number;  // Multiplier for the phase shifts (default: 1.0)
  shannonEntropyFilter: boolean; // Filter numbers below historical entropy average
  jaccardGain?: number;    // Multiplier for Jaccard transition persistence & coupling (default: 1.0)
}

export interface GeminiReasoning {
  logicalAnalysis: string;
  patternType: string;
  nextSequence: string;
  anomalies: string[];
  strategicAdvice: string;
  suggestedFocus: number[];
  intuitionScore: number;
  counterfactualExplanation?: string;
  bayesianRecurrenceScore?: number;
}

export interface NarrativeReport {
  summary: string;
  technicalVerdict: string;
  riskAssessment: string;
  confidence: number;
}

export interface DetectedPattern {
  type: PatternType;
  count: number;
  impact: number;
}

export interface OrchestrationMetrics {
  globalScore: number;
  activePatterns: DetectedPattern[];
  topCandidates: { number: number; score: number; reasons: string[] }[];
  backtestAccuracy: number;
  narrativeLesson: string;
  stabilityScore?: number;
  regimeDiagnostic?: {
    regime: "stable" | "volatile" | "chaotic" | "cryo";
    confidenceInRegime: number;
  };
}

export interface MimicryMetric {
  number: number;
  score: number;
  type: string;
  sourceDraw: string;
}

export interface OptimizationResult {
  bestWeights: AlgoWeights;
  improvement: number;
  report: TrainingReport;
  bestChromosome?: { weights: AlgoWeights; rules: AdaptiveRules };
  message?: string;
  weights?: AlgoWeights;
}

export interface GeneticConfig {
  populationSize: number;
  eliteSize: number;
  mutationRate: number;
  crossoverRate: number;
  maxGenerations: number;
  historyDepth: number;
  earlyStopGenerations: number;
  regimeMetrics?: { hurst: number; entropy: number };
}

export interface AntColonyPath {
  numbers: number[];
  pheromoneDensity: number;
  confidence: number;
  isOracleBiased?: boolean;
}

export interface OracleVocalContext {
  targets: number[];
  drawName?: string;
  lastDrawDate?: string;
  regime?: string;
  hurst?: number;
  spectralEntropy?: number;
  volatility?: number;
  affinityTop3?: { num1: number; num2: number; affinity: number }[];
  conceptDrift?: number;
  brierScore?: number;
  bayesianRecurrenceScore?: number;
}

export interface MonthStats {
  monthIndex: number;
  topNumbers: { number: number; count: number }[];
}

export interface GameRegime {
  regime: string;
  hurst: number;
  entropy: number;
  volatility: number;
  weylDiscrepancy?: number;
  chaosDimension?: number;
}

export interface VolatilityMetric {
  score: number;
  status: string;
}

export interface AnalyticsData {
  spectral: SpectralMetric[];
  wavelet: SpectralMetric[];
  fractal: FractalMetric[];
  volatility: VolatilityMetric | null;
  regime: GameRegime | null;
  correlationMatrix: Record<number, { affinities: Record<number, number> }>;
  regularity: NumberRegularity[];
  symbioticContext: SymbioticContext | null;
  forestRes?: { votes: { candidate: number; score: number }[]; dataset: { features: number[]; class: number; weight: number }[]; };
}

export interface CalibrationData extends BrierCalibration {
  baseline: number;
  variance: number;
  trend: number;
  confidence: number;
}

export interface SmartInsight {
  id: string;
  type: "opportunity" | "risk" | "info";
  title: string;
  description: string;
  score: number;
  icon: string;
}

export interface NumberGap {
  number: number;
  gap: number;
}

export interface EntropyMetric {
  normalized: number;
}

export interface BrierCalibration {
  overallScore: number;
  reliability: number;
  bias: "OPTIMIST" | "PESSIMIST" | "NEUTRAL";
  sampleSize: number;
}

export interface PythonAnalysisResult {
  id: string;
  timestamp: number;
  drawName: string;
  modelType: string;
  stdout: string[];
  script: string;
  findings: {
    result_vector: number[];
    confidence_score: number;
    p_value: number;
  };
  insight: string;
  cells: NotebookCell[];
  distribution?: Record<number, number>;
  featureImportances?: { feature: string; importance: number }[];
  featureInteractions?: { f1: string; f2: string; strength: number }[];
  kernelDiagnostics?: {
    rkhsEnergy: number;
    spectralRadius: number;
    rbfBandwidth: number;
    maternLength: number;
    hawkesBeta: number;
    kernelMatrixHeatmap?: number[][];
  };
}

export interface NotebookCell {
  id: string;
  type: "markdown" | "code" | "output";
  content: string;
}

export interface FusionResult {
  sources: {
    python: number[];
    quantum: number[];
    oracle: number[];
  };
  convergedNumbers: { number: number; score: number; sources: string[]; details?: unknown }[];
  finalTicket: number[];
  confidence: number;
  entropy: number;
  biasWeightsUsed?: { logic: number; physics: number; intuition: number };
  kalmanGains?: { logic: number; physics: number; intuition: number };
  variances?: { logic: number; physics: number; intuition: number };
  crossCovariance?: {
    covLP: number;
    covLI: number;
    covPI: number;
    fisherGain: number;
  };
  method?: string;
}

export interface NexusContextType {
  drawName: string;
  currentDrawName: string;
  history: DrawResult[];
  stats: { number: number; count: number }[];
  gaps: NumberGap[];
  spectral: SpectralMetric[];
  fractal: FractalMetric[];
  volatility: VolatilityMetric | null;
  regime: GameRegime | null;
  correlationMatrix: Record<number, { affinities: Record<number, number> }>;
  regularity: NumberRegularity[];
  symbioticContext: SymbioticContext | null;
  lastPrediction: Prediction | null;
  inspectingNumber: number | null;
  smartInsights: SmartInsight[];
  globalWeights: AlgoWeights;
  loading: boolean;
  calibration: unknown;
  hoveredNumber: number | null;
  vocalContext: OracleVocalContext | null;

  setDrawName: (name: string) => void;
  setLastPrediction: (p: Prediction | null) => void;
  setInspectingNumber: (n: number | null) => void;
  setHoveredNumber: (n: number | null) => void;
  updateGlobalWeights: (w: AlgoWeights) => void;
  refresh: () => Promise<void>;
  refreshData: (name: string, force?: boolean) => Promise<void>;

  // GOD MODE
  isGodMode: boolean;
  toggleGodMode: () => void;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}
