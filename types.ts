
export interface Draw {
  name: string;
  time: string;
  day: string;
}

export interface DrawResult {
  id: string;
  drawName: string;
  date: string;
  gagnants: number[];
  machine?: number[];
  version?: number;
}

export interface SubscriptionState {
  status: 'active' | 'trial' | 'expired';
  daysLeft: number;
  expiresAt: string;
  plan: 'free' | 'premium';
}

export interface AlgoWeights {
  [key: string]: number | undefined;
  frequency?: number;
  gap?: number;
  spectral?: number;
  fractal?: number;
  markov?: number;
  poisson?: number;
  momentum?: number;
  equilibrium?: number;
  ai_intuition?: number;
  decision_forest?: number;
  wavelet?: number;
  resistance?: number;
  spatial?: number;
  orchestration?: number;
  digital_root?: number;
  gap_velocity?: number;
  isolation_anomaly?: number;
  leader_succession?: number;
  anti_consensus?: number;
  monte_carlo?: number;
  lstm_pattern?: number;
  bayes?: number;
  temporal?: number;
  transformer?: number;
}

export interface AdaptiveRules {
  criticalZoneMin: number;
  criticalZoneMax: number;
}

export interface ScoreBreakdown {
  [key: string]: number | undefined;
  frequency?: number;
  gap?: number;
  spectral?: number;
  markov?: number;
  momentum?: number;
  equilibrium?: number;
  poisson?: number;
  wavelet?: number;
  bayes?: number;
  gap_velocity?: number;
  orchestration?: number;
}

export interface Prediction {
  suggestedNumbers: number[];
  candidates: number[];
  confidence: number;
  analysis: string;
  breakdown?: Record<number, ScoreBreakdown>;
  timestamp: number;
  symbiosisFactor?: number;
}

export interface PredictionHistoryItem {
  id: string;
  timestamp: number;
  drawName: string;
  prediction: Prediction;
  drawResultId?: string | null;
  feedback?: PredictionFeedback;
}

export interface PredictionFeedback {
  keyLearning: string;
  userRating: 'Visionnaire' | 'Standard' | 'Incohérente';
  userComment: string;
}

export interface ForensicEvidence {
  predicted: number;
  actual: number | null;
  errorType: 'Hit' | 'Voisin' | 'Miroir' | 'Shadow' | 'None';
  delta: string;
}

export interface ForensicReport {
  drawName: string;
  date: string;
  predictionId?: string;
  matches: ForensicEvidence[];
  missedOpportunities: { number: number; reason: string }[];
  scoreDivergence: { algo: string; impact: number }[];
}

export interface PlatinumTimeline {
  type: 'NEON' | 'TERRA' | 'CHRONOS' | 'AETHER' | 'NOVA';
  title: string;
  numbers: number[];
  score: number;
  intuitionScore: number;
  remark: string;
  keyMetric: string;
  colorTheme: string;
}

export interface PlatinumResult {
  id: string;
  kingNumbers: { number: number; count: number }[];
  timelines: PlatinumTimeline[];
  combinations?: any[];
  confidence: number;
  analysis: string;
  drawName: string;
  timestamp: number;
  ghostMap?: number[];
}

export interface PlatinumAudit {
  predictionId: string;
  date: string;
  actualDraw: number[];
  bestTimeline: string;
  bestScore: number;
  syncScore: number;
  timelinePerformance: { type: string; hits: number; numbers: number[] }[];
  verdict: string;
}

export interface SymbioticContext {
  spatialDeadZones: number[];
  spatialHotZones: number[];
  orchestrationBoosts: Record<number, number>;
  spectralVeto: number[];
  temporalTarget: any;
  forestVotes: Record<number, number>;
}

export interface NexusContextType {
  drawName: string;
  currentDrawName: string;
  history: DrawResult[];
  stats: { number: number; count: number }[];
  gaps: { number: number; gap: number }[];
  spectral: SpectralMetric[];
  wavelet: { number: number; energy: number }[];
  fractal: FractalMetric[];
  volatility: { score: number; status: string } | null;
  regime: { regime: string; hurst: number } | null;
  correlationMatrix: any;
  regularity: NumberRegularity[];
  symbioticContext: SymbioticContext | null;
  lastPrediction: Prediction | null;
  inspectingNumber: number | null;
  smartInsights: SmartInsight[];
  globalWeights: AlgoWeights;
  loading: boolean;
  calibration: BrierCalibration | null;
  hoveredNumber: number | null;
  rlState: RLState | null;
  vocalContext: OracleVocalContext | null;
  setDrawName: (name: string) => void;
  setLastPrediction: (pred: Prediction) => void;
  setInspectingNumber: (n: number | null) => void;
  setHoveredNumber: (n: number | null) => void;
  updateGlobalWeights: (w: AlgoWeights) => Promise<void>;
  refresh: () => Promise<void>;
  refreshData: (name: string, force?: boolean) => Promise<void>;
}

export interface SpectralMetric {
  number: number;
  energy: number;
  resonance: boolean;
  dominantPeriod?: number;
}

export interface FractalMetric {
  number: number;
  hurst: number;
  regime?: string;
  gapEntropy?: number;
}

export interface NumberRegularity {
  number: number;
  avgGap: number;
  stdDev: number;
  currentGap: number;
  lastGaps: number[];
  nextExpectedIn: number;
}

export interface TopFollowerAnalysis {
  number: number;
  count: number;
}

export interface ProjectionItem {
  number: number;
  probability: number;
}

export interface DetailedNumberMetrics {
  temperature: number;
  hurst: number;
  lastGap: number;
  avgGap: number;
  nextProb: number;
  spectralEnergy: number;
  stdDev: number;
  historyGraph: number[];
  affinity: number[];
  nemesis: number[];
}

export interface ShadowNumbers {
  sumModulo: number;
  firstCompliment: number;
  lastCompliment: number;
  gapLink: number;
  goldenNumber: number;
}

export interface TrendOscillatorPoint {
  drawIndex: number;
  momentum: number;
  signal: number;
}

export interface ChiSquareMetric {
  score: number;
  pValue: number;
}

export interface ClusterPoint {
  number: number;
  x: number;
  y: number;
  cluster: string;
}

export interface BarycenterPoint {
  x: number;
  y: number;
  drawIndex?: number;
}

export interface SpatialMetrics {
  gridDensity: number[];
  detectedPatterns: any[];
  barycenter: BarycenterPoint;
  advancedClusters: SpatialCluster[];
  gravityWells: any[];
}

export interface SpatialCluster {
  id: string;
  center: { x: number; y: number };
  numbers: number[];
  density: number;
  potential: number;
  color: string;
}

export interface ClusterSummary {
  type: string;
  count: number;
  description: string;
  color: string;
  icon: string;
}

export interface ForestVote {
  candidate: number;
  score: number;
  votes: { temporal: number; spatial: number; structural: number };
  decisionPath: DecisionNode;
  features: { isConsensusTrap: boolean };
}

export interface DecisionNode {
  id: string;
  type: 'condition' | 'leaf';
  label: string;
  children: DecisionNode[];
}

export interface GeminiReasoning {
  logicalAnalysis: string;
  patternType: string;
  nextSequence: string;
  anomalies: string[];
  strategicAdvice: string;
  suggestedFocus: number[];
  intuitionScore: number;
}

export interface NarrativeReport {
  summary: string;
  technicalVerdict: string;
  riskAssessment: string;
  confidence: number;
}

export interface TicketAnalysisResult {
  score: number;
  verdict: string;
  warnings: string[];
}

export interface TrainingReport {
  totalTests: number;
  totalHits: number;
  averageHits: number;
  successRate: number;
  stabilityScore: number;
  stabilityLabel: string;
  winDistribution: { zero: number; one: number; two: number; three: number; four: number; five: number };
  history: TrainingResult[];
  score: number;
  learnedPatternsSummary: any;
  regimeInfo: { regime: string; hurst: number };
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
  breakdown?: Record<number, ScoreBreakdown>;
}

export interface GeneticConfig {
  populationSize: number;
  eliteSize: number;
  mutationRate: number;
  crossoverRate: number;
  maxGenerations: number;
  historyDepth: number;
  earlyStopGenerations: number;
}

export interface OptimizationResult {
  bestChromosome: { weights: AlgoWeights; rules: AdaptiveRules };
  timeElapsed: number;
  totalEvaluations: number;
}

export interface SavedTicket {
  id: string;
  numbers: number[];
  drawName: string;
  strategy: string;
  createdAt: number;
  status: 'active' | 'archived';
}

export interface RLState {
  lastCalibration: number;
  learningRate: number;
  streak: number;
  totalCorrection: number;
}

export interface OracleVocalContext {
  targets: number[];
}

export interface AntColonyPath {
  numbers: number[];
  pheromoneDensity: number;
  confidence: number;
  isOracleBiased?: boolean;
}

export interface MathAnalysisReport {
  parity: { odd: number; even: number };
  lowHigh: { low: number; high: number };
  sumHistory: { date: string; sum: number; avg: number }[];
  finales: { digit: number; count: number }[];
  consecutiveStats: { count: number; percentage: number };
  runsTest: { runs: number; zScore: number; isRandom: boolean };
}

export interface LearningSession {
  // Placeholder
}

export interface OrchestrationPattern {
  type: PatternType;
  count: number;
}

export type PatternType = 'Miroir' | 'Voisin' | 'Transfert Machine' | 'Répétition' | 'Leurre Machine' | 'Suite' | 'Finale' | 'Dizaine';

export interface OrchestrationMetrics {
  globalScore: number;
  activePatterns: DetectedPattern[];
  topCandidates: { number: number; score: number; reasons: string[] }[];
  backtestAccuracy: number;
  narrativeLesson: string;
  candidatesDetails?: Record<number, { markov: number; structural: number; machine: number; trend: number }>;
}

export interface DetectedPattern {
  type: PatternType;
  count: number;
  impact: number;
}

export interface MimicryMetric {
  number: number;
  score: number;
  type: string;
  sourceDraw: string;
}

export interface SmartInsight {
  id: string;
  type: 'risk' | 'info' | 'opportunity';
  title: string;
  description: string;
  score: number;
  icon: string;
}

export interface BrierCalibration {
  overallScore: number;
  reliability: number;
  bias: 'OPTIMIST' | 'PESSIMIST' | 'NEUTRAL';
  sampleSize: number;
}

export interface PythonAnalysisResult {
  id: string;
  timestamp: number;
  drawName: string;
  modelType: string;
  stdout: string[];
  script: string;
  findings: any;
  insight: string;
  cells: NotebookCell[];
}

export interface NotebookCell {
  id: string;
  type: 'markdown' | 'code' | 'output';
  content: string;
}

export interface EntropyMetric {
  normalized: number;
}

export interface NumberGap {
  number: number;
  gap: number;
}

export interface MonthStats {
  monthIndex: number;
  topNumbers: { number: number; count: number }[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}
