
export interface GapEfficiency {
    number: number;
    currentGap: number;
    maxGap: number;
    avgGap: number;
    probabilityAtCurrentGap: number;
    maturityScore: number;
    zone: 'COLD' | 'WARMING' | 'HOT' | 'CRITICAL';
    // New Stochastic Metrics
    zScore: number;       // Écart type par rapport à la moyenne
    fatigueIndex: number; // Résistance du numéro à sortir
    breakoutProb: number; // Probabilité gaussienne de rupture
}

export interface DigitalRootMetric {
    root: number;
    count: number;
    lastSeen: number;
    trend: 'UP' | 'DOWN' | 'FLAT';
}

export interface Draw {
    day: string;
    time: string;
    name: string;
}

export interface SubscriptionState {
    status: 'active' | 'trial' | 'expired' | 'paid';
    daysLeft: number;
    expiresAt: string;
    plan: 'premium' | 'free';
}

export interface DrawResult {
    id: string;
    drawName: string;
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
}

export interface Prediction {
    suggestedNumbers: number[];
    candidates: number[];
    confidence: number;
    analysis: string;
    breakdown: Record<number, ScoreBreakdown>;
    timestamp: number;
    symbiosisFactor?: number;
    riskProfile?: RiskProfile;
    realityAlignment?: number;
}

export interface PredictionFeedback {
    keyLearning: string;
    userRating: 'Visionnaire' | 'Standard' | 'Incohérente';
    userComment: string;
}

export interface ForensicReport {
    drawName: string;
    date: string;
    predictionId?: string;
    matches: ForensicEvidence[];
    missedOpportunities: { number: number; reason: string }[];
    scoreDivergence: { algo: string; impact: number }[];
    suspicionScore?: number;
    indicators?: any[];
    riggedProbability?: number;
    entropyCollapse?: boolean;
    benfordCompliance?: number;
    evidenceLogs?: string[];
}

export interface ForensicEvidence {
    predicted: number;
    actual: number | null;
    errorType: 'Hit' | 'Voisin' | 'Miroir' | 'Shadow' | 'None';
    delta: string;
}

export interface SpectralMetric {
    number: number;
    energy: number;
    resonance?: boolean;
    dominantPeriod?: number;
}

export type RiskProfile = 'PRUDENT' | 'BALANCED' | 'AUDACIOUS' | 'CHAOS';

export interface LearningSession {
    id?: string;
}

export interface OrchestrationPattern {
    type: PatternType;
    count: number;
}

export type PatternType = 'Miroir' | 'Voisin' | 'Transfert Machine' | 'Répétition' | 'Leurre Machine' | 'Suite' | 'Finale' | 'Dizaine';

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
    regime?: 'PERSISTANT' | 'ANTI-PERSISTANT' | 'RANDOM';
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

export interface AlgoWeights {
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

export interface ScoreBreakdown {
    frequency?: number;
    gap?: number;
    poisson?: number;
    markov?: number;
    spectral?: number;
    decision_forest?: number;
    momentum?: number;
    equilibrium?: number;
    ai_intuition?: number;
    fractal?: number;
    orchestration?: number;
    spatial?: number;
    wavelet?: number;
    bayes?: number;
    gap_velocity?: number;
    day_echo?: number; // Nouveau score d'écho journalier
}

export interface DayFlowMetrics {
    dayMomentum: number;
    echoNumbers: number[];
    hotDecades: number[];
    morningToEveningBias: number;
}

export interface InterGameHeat {
    sourceGame: string;
    targetGame: string;
    correlationFactor: number;
    migratingNumbers: number[];
}

export interface SymbioticContext {
    spatialHotZones: number[];
    orchestrationBoosts: Record<number, number>;
    forestVotes: Record<number, number>;
    dayMetrics?: DayFlowMetrics | null; // Intégration du flux journalier
    spatialDeadZones?: number[];
    spectralVeto?: number[];
    temporalTarget?: any;
}

export interface AdaptiveRules {
    criticalZoneMin: number;
    criticalZoneMax: number;
    dayEchoBoost?: number;
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
    breakdown: Record<number, ScoreBreakdown>;
}

export interface SavedTicket {
    id: string;
    createdAt: number;
    status: 'active' | 'archived';
    numbers: number[];
    drawName: string;
    strategy?: string;
}

export interface SpatialMetrics {
    gridDensity: number[];
    detectedPatterns: any[];
    barycenter: { x: number; y: number };
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
    children?: DecisionNode[];
}

export interface PlatinumResult {
    id: string;
    kingNumbers: { number: number; count: number }[];
    timelines: PlatinumTimeline[];
    combinations: any[];
    confidence: number;
    analysis: string;
    drawName: string;
    timestamp: number;
}

export interface PlatinumTimeline {
    type: string;
    title: string;
    numbers: number[];
    score: number;
    intuitionScore: number;
    remark: string;
    keyMetric: string;
    colorTheme: string;
    divergence?: number; // Distance par rapport au consensus
    radarStats?: { label: string, value: number }[]; // Pour le graphique
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
}

export interface AntColonyPath {
    numbers: number[];
    pheromoneDensity: number;
    confidence: number;
    isOracleBiased?: boolean;
}

export interface OracleVocalContext {
    targets: number[];
}

export interface MonthStats {
    monthIndex: number;
    topNumbers: { number: number; count: number }[];
}

export interface SmartInsight {
    id: string;
    type: 'opportunity' | 'risk' | 'info';
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

export interface RLState {
    lastCalibration: number;
    learningRate: number;
    streak: number;
    totalCorrection: number;
}

export interface FusionResult {
    sources: {
        python: number[];
        quantum: number[];
        oracle: number[];
    };
    convergedNumbers: { number: number; score: number; sources: string[] }[];
    finalTicket: number[];
    confidence: number;
    entropy: number;
}

export interface NexusContextType {
    drawName: string;
    currentDrawName: string;
    history: DrawResult[];
    stats: { number: number; count: number }[];
    gaps: NumberGap[];
    spectral: SpectralMetric[];
    wavelet: SpectralMetric[];
    fractal: FractalMetric[];
    volatility: any;
    regime: any;
    correlationMatrix: any;
    regularity: NumberRegularity[];
    symbioticContext: SymbioticContext | null;
    lastPrediction: Prediction | null;
    inspectingNumber: number | null;
    smartInsights: SmartInsight[];
    globalWeights: AlgoWeights;
    loading: boolean;
    calibration: any;
    hoveredNumber: number | null;
    rlState: RLState | null;
    vocalContext: OracleVocalContext | null;
    
    setDrawName: (name: string) => void;
    setLastPrediction: (p: Prediction | null) => void;
    setInspectingNumber: (n: number | null) => void;
    setHoveredNumber: (n: number | null) => void;
    updateGlobalWeights: (w: AlgoWeights) => void;
    refresh: () => Promise<void>;
    refreshData: (name: string, force?: boolean) => Promise<void>;
}

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
}
