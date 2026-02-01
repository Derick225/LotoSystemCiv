
export interface DrawResult {
    id: string;
    drawName: string;
    date: string;
    gagnants: number[];
    machine?: number[];
    version: number;
}

export interface SymbioticContext {
    spatialHotZones: number[];
    spatialDeadZones: number[];
    orchestrationBoosts: Record<number, number>; // Numéro -> Multiplicateur (ex: 1.5)
    spectralVeto: number[]; // Numéros à exclure car énergie trop basse
    temporalTarget: { min: number, max: number } | null; // Cible temporelle (Gap)
    forestVotes: Record<number, number>; // Numéro -> Score Forest (0-100)
}

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
    metadata?: {
        suggestedNumbers?: number[];
        confidence?: number;
    };
}

export interface AlgoWeights {
    frequency: number;
    gap: number;
    spectral: number;
    fractal: number;
    wavelet: number;
    resistance: number;
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
    anti_consensus: number;
    monte_carlo: number; 
    lstm_pattern: number; 
    isolation_anomaly: number; 
    decision_forest: number; // NOUVEAU
}

export interface PositionalRegime {
    position: number;
    regime: 'CHAOTIC' | 'PERSISTENT' | 'BIMODAL' | 'STABLE';
    hurst: number;
}

export interface RLState {
    lastCalibration: number;
    learningRate: number;
    streak: number;
    totalCorrection: number;
}

export interface StrategyBias {
    stability: number;
    chaos: number;
    harmony: number;
    wavelet: number;
    orchestration: number;
}

export interface SubscriptionState {
    status: 'trial' | 'active' | 'expired';
    daysLeft: number;
    expiresAt: string;
    start_date?: string;
    plan: 'free' | 'premium';
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
    timestamp?: number;
    symbiosisFactor?: number; // Indicateur de cohérence inter-services
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

export interface NexusContextType {
    drawName: string;
    setDrawName: (n: string) => void;
    currentDrawName: string;
    history: DrawResult[];
    spectral: SpectralMetric[];
    fractal: FractalMetric[];
    wavelet: {number: number, energy: number}[];
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
    hoveredNumber: number | null;
    setHoveredNumber: (n: number | null) => void;
    rlState: RLState | null;
    vocalContext: OracleVocalContext | null;
    symbioticContext: SymbioticContext | null;
}

export interface ForensicReport {
    drawName: string;
    date: string;
    predictionId?: string;
    matches: ForensicEvidence[];
    missedOpportunities: { number: number; reason: string }[];
    scoreDivergence: { algo: string; impact: number }[];
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

// --- NOUVELLES STRUCTURES PLATINUM V18 ---

export interface PlatinumTimeline {
    type: 'ALPHA' | 'SIGMA' | 'OMEGA';
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
    kingNumbers: { number: number, count: number }[];
    timelines: PlatinumTimeline[]; 
    combinations?: any[]; 
    confidence: number;
    analysis: string;
    drawName: string;
    timestamp: number;
    ghostMap?: number[]; 
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

export interface OrchestrationMetrics {
    globalScore: number;
    topCandidates: { number: number; score: number; reasons: string[] }[];
    backtestAccuracy: number;
    activePatterns: any[];
    narrativeLesson?: string;
}

export interface MimicryMetric {
    number: number;
    score: number;
    type: string;
    sourceDraw: string;
}

export interface ProjectionItem {
    number: number;
    probability: number;
}

export interface TopFollowerAnalysis {
    leader: number;
    followers: { number: number; count: number; probability: number }[];
}

export interface PredictionHistoryItem {
    id: string;
    timestamp: number;
    drawName: string;
    prediction: Prediction;
    drawResultId: string | null;
    feedback?: PredictionFeedback;
}

export interface LearningSession {
    timestamp: number;
    metrics: any;
}

export interface OrchestrationPattern {
    type: PatternType;
    count: number;
}

export interface PredictionFeedback {
    keyLearning: string;
    userRating: 'Visionnaire' | 'Standard' | 'Incohérente';
    userComment: string;
}

export type PatternType = 'Miroir' | 'Voisin' | 'Transfert Machine' | 'Répétition' | 'Leurre Machine' | 'Suite' | 'Finale' | 'Dizaine';

export interface MathAnalysisReport {
    parity: { odd: number; even: number };
    lowHigh: { low: number; high: number };
    sumHistory: { date: string; sum: number; avg: number }[];
    finales: { digit: number; count: number }[];
    consecutiveStats: { count: number; percentage: number };
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

export interface AdaptiveRules {
    criticalZoneMin: number;
    criticalZoneMax: number;
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
    breakdown: any;
}

export interface SavedTicket {
    id: string;
    createdAt: number;
    numbers: number[];
    drawName: string;
    strategy: string;
    status: 'active' | 'archived';
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
    center: BarycenterPoint;
    numbers: number[];
    density: number;
    potential: number;
    color: string;
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

export interface DetectedPattern {
    type: PatternType;
    count: number;
    impact: number;
}

export interface OptimizationResult {
    bestChromosome: {
        weights: AlgoWeights;
        rules: AdaptiveRules;
    };
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

export interface ForensicEvidence {
    predicted: number;
    actual: number | null;
    errorType: 'Hit' | 'Voisin' | 'Miroir' | 'Shadow' | 'None';
    delta: string;
}

export interface AntColonyPath {
    numbers: number[];
    pheromoneDensity: number;
    confidence: number;
    isOracleBiased?: boolean;
}

export interface MonthStats {
    monthIndex: number;
    topNumbers: { number: number; count: number }[];
}

export interface NumberGap {
    number: number;
    gap: number;
}

export interface ClusterSummary {
    type: string;
    count: number;
    description: string;
    color: string;
    icon: string;
}

export interface EntropyMetric {
    normalized: number;
}

export interface ChiSquareMetric {
    score: number;
    pValue: number;
}

export interface OracleVocalContext {
    targets: number[];
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
}

export interface NotebookCell {
    id: string;
    type: 'markdown' | 'code' | 'output';
    content: string;
}
