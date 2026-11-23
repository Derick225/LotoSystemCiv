import type { DrawResult, PredictionHistoryItem } from "../../../types";
import type { XAPExplanation } from "../../../services/training/DNAOptimizer";
import type { DrawException } from "../../../services/drawScheduleExceptionService";

export interface BacktestResult {
  drawId: string;
  date: string;
  actualGagnants: number[];
  suggestedPredicted: number[];
  candidatesPredicted: number[];
  suggestedHits: number[];
  candidatesHits: number[];
  nearMisses: { num: number; type: "voisin" | "miroir"; match: number }[];
  confidence: number;
}

export interface BacktestStats {
  totalDraws: number;
  totalSuggestedHits: number;
  totalCandidatesHits: number;
  avgDirectHits: number;
  resonanceRate: number;
  nearMissRate: number;
  zScore: number;
  alphaGain: number;
}

export interface BacktestChartPoint {
  index: number;
  date: string;
  tirage: string;
  "Hits Directs": number;
  "Hits Candidats": number;
  "Near Misses": number;
  "Confiance %": number;
}

export interface InferenceHyperparameters {
  hawkesDecay: number;
  spatialSigma: number;
  gapVelocityWeight: number;
  sgdLearningRate: number;
}

export interface InferencePrediction {
  suggestedNumbers: number[];
  candidates: number[];
  confidence: number;
  analysis: string;
  mathModelSummary: string;
  xapExp?: XAPExplanation[];
  realityAlignment?: number;
  adversarialApplied?: boolean;
  challengedNumbers?: number[];
  stabilityScore?: number;
  diversityScore?: number;
  adversarialSurvivalScore?: number;
  adversarialRisks?: string[];
  hyperparameters?: InferenceHyperparameters;
  hyperTuningLog?: string[];
  hyperAccuracyGain?: number;
  aiWeights?: Record<string, number>;
  aiRationale?: string;
  aiStrategicAdvice?: string;
  isLocalFallback?: boolean;
  engineType?: "local" | "cloud";
  predictionStrategy?: import("../../../shared/prediction.types").PredictionStrategy;
}

export interface ForensicEntry {
  item: PredictionHistoryItem;
  res: DrawResult | null | undefined;
  hits: number[];
  nearMisses: number[];
  precisionPct: number;
  engineType: "local" | "cloud";
  scheduleException?: DrawException | null;
}

export interface EngineBucketStats {
  total: number;
  verified: number;
  avgPrecision: number;
  hits: number;
  nearMisses: number;
  avgConfidence: number;
}

export interface EngineComparisonStats {
  local: EngineBucketStats;
  cloud: EngineBucketStats;
}

export type ForensicFilter = "all" | "verified" | "pending" | "hits" | "high_precision";
export type ForensicEngineFilter = "all" | "local" | "cloud";
export type ForensicDateFilter = "all" | "today" | "7d" | "30d" | "custom";
export type ForensicSort = "recent" | "precision_desc" | "confidence_desc";

// Une métrique non produite par le moteur est affichée "n/d" : aucune valeur de repli inventée.
export const formatPercent = (value?: number | null): string =>
  typeof value === "number" && Number.isFinite(value) ? `${value}%` : "n/d";
