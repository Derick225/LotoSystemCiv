
export interface DrawResult {
    id: string;
    drawName: string;
    date: string;
    gagnants: number[];
    machine?: number[];
    version: number;
}

export interface AlgoWeights {
    frequency: number;
    gap: number;
    spectral: number;
    fractal: number;
    markov: number;
    spatial: number;
    momentum: number;
    equilibrium: number;
    bayes: number;
    orchestration: number;
    transformer: number;
    temporal: number;
    ai_intuition: number;
    digital_root: number;
    gap_velocity: number;
    poisson: number;
    leader_succession: number;
}

export interface ScoreBreakdown extends AlgoWeights {}

export interface SpectralMetric {
    number: number;
    energy: number;
    resonance: boolean;
    dominantPeriod?: number;
}

export interface FractalMetric {
    number: number;
    hurst: number;
    regime: 'PERSISTANT' | 'ANTI-PERSISTANT' | 'RANDOM';
}

export interface Prediction {
    suggestedNumbers: number[];
    candidates: number[];
    confidence: number;
    analysis: string;
    breakdown?: Record<number, ScoreBreakdown>;
    usedWeights?: AlgoWeights;
}

export interface SmartInsight {
    id: string;
    type: 'opportunity' | 'risk' | 'info';
    title: string;
    description: string;
    score: number;
    icon: string;
}

export interface NumberRegularity {
    number: number;
    avgGap: number;
    stdDev: number;
    currentGap: number;
    lastGaps: number[];
    nextExpectedIn: number;
}

export interface BrierCalibration {
    overallScore: number;
    reliability: number;
    bias: 'OPTIMIST' | 'PESSIMIST' | 'NEUTRAL';
    sampleSize: number;
}

export interface OracleVocalContext {
    targets: number[];
}

export interface NexusContextType {
    drawName: string;
    setDrawName: (n: string) => void;
    currentDrawName: string;
    history: DrawResult[];
    spectral: SpectralMetric[];
    fractal: FractalMetric[];
    stats: { number: number; count: number }[];
    gaps: { number: number; gap: number }[];
    volatility: { score: number; status: string; trend: string } | null;
    regime: { hurst: number; regime: string } | null;
    lastPrediction: Prediction | null;
    setLastPrediction: (p: Prediction | null) => void;
    inspectingNumber: number | null;
    setInspectingNumber: (n: number | null) => void;
    smartInsights: SmartInsight[];
    globalWeights: AlgoWeights;
    updateGlobalWeights: (w: AlgoWeights) => void;
    loading: boolean;
    refresh: () => Promise<void>;
    refreshData: (name: string, force?: boolean) => Promise<void>;
    correlationMatrix: any;
    regularity: NumberRegularity[];
    calibration: BrierCalibration | null;
    velocity: Record<number, number>;
    cliques: any[];
    vocalContext: any;
}

// Forensic and history types
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

export interface PredictionHistoryItem {
    id: string;
    timestamp: number;
    drawName: string;
    prediction: Prediction;
    drawResultId: string | null;
    feedback?: PredictionFeedback;
}

export interface PredictionFeedback {
    keyLearning: string;
    userRating: 'Visionnaire' | 'Standard' | 'Incohérente';
    userComment?: string;
}

export interface TopFollowerAnalysis {
    leader: number;
    followers: { number: number; count: number; probability: number }[];
}

export interface ProjectionItem {
    number: number;
    probability: number;
}

export interface LearningSession {
    id: string;
    timestamp: number;
    improvement: number;
}

export type PatternType = 'Miroir' | 'Voisin' | 'Transfert Machine' | 'Répétition' | 'Leurre Machine' | 'Suite' | 'Finale' | 'Dizaine';

export interface OrchestrationPattern {
    type: PatternType;
    count: number;
    intensity: number;
}

export interface MathAnalysisReport {
    parity: { odd: number; even: number };
    lowHigh: { low: number; high: number };
    sumHistory: { date: string, sum: number, avg: number }[];
    finales: { digit: number, count: number }[];
    consecutiveStats: { count: number, percentage: number };
    runsTest: { runs: number; zScore: number; isRandom: boolean };
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

export interface BarycenterPoint {
    x: number;
    y: number;
    drawIndex?: number;
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

export interface TrainingReport {
    totalTests: number;
    totalHits: number;
    averageHits: number;
    successRate: number;
    stabilityScore: number;
    stabilityLabel: string;
    winDistribution: { zero: number, one: number, two: number, three: number, four: number, five: number };
    history: TrainingResult[];
    score: number;
    learnedPatternsSummary: any;
    regimeInfo: { regime: string, hurst: number };
}

export interface SavedTicket {
    id: string;
    drawName: string;
    numbers: number[];
    strategy: string;
    createdAt: number;
    status: 'active' | 'archived';
}

export interface SpatialCluster {
    id: string;
    center: { x: number; y: number };
    numbers: number[];
    density: number;
    potential: number;
    color: string;
}

export interface SpatialMetrics {
    gridDensity: number[];
    detectedPatterns: any[];
    barycenter: BarycenterPoint;
    advancedClusters: SpatialCluster[];
    gravityWells: any[];
}

export interface DecisionNode {
    id: string;
    type: 'condition' | 'leaf';
    label: string;
    children: DecisionNode[];
}

export interface ForestVote {
    candidate: number;
    score: number;
    votes: { temporal: number; spatial: number; structural: number };
    decisionPath: DecisionNode;
    features: { isConsensusTrap: boolean };
}

export interface PlatinumCombo {
    numbers: number[];
    score: number;
    tags: string[];
    breakdown: { stability: number, chaos: number, harmony: number, pattern: number };
}

export interface PlatinumResult {
    kingNumbers: { number: number, count: number }[];
    targetSumRange: { min: number, max: number, reason: string };
    hotZonesSpectro: number[];
    combinations: PlatinumCombo[];
    confidence: number;
    analysis: string;
    drawName: string;
    timestamp: number;
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

export interface Draw {
    day: string;
    time: string;
    name: string;
}

export interface DetectedPattern {
    type: string;
    count: number;
    impact: number;
}

export interface OrchestrationMetrics {
    globalScore: number;
    activePatterns: DetectedPattern[];
    topCandidates: { number: number; score: number; reasons: string[] }[];
    backtestAccuracy: number;
    narrativeLesson: string;
}

export interface AdaptiveRules {
    criticalZoneMin: number;
    criticalZoneMax: number;
}

export interface OptimizationResult {
    bestChromosome: { weights: AlgoWeights; rules: AdaptiveRules; fitness: number };
    timeElapsed: number;
    totalEvaluations: number;
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

export interface AntColonyPath {
    numbers: number[];
    pheromoneDensity: number;
    confidence: number;
    isOracleBiased?: boolean;
}

export interface TicketAnalysisResult {
    score: number;
    verdict: string;
    warnings: string[];
}

export interface PythonAnalysisResult {
    script: string;
    stdout: string[];
    findings: {
        method: string;
        result_vector: number[];
        confidence_score: number;
        p_value: number;
    };
    insight: string;
}

// FIX: Added missing exported interfaces used across services and components
export interface NumberGap {
    number: number;
    gap: number;
}

export interface EntropyMetric {
    normalized: number;
}

export interface ChiSquareMetric {
    score: number;
}

export interface MonthStats {
    monthIndex: number;
    topNumbers: { number: number; count: number }[];
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
