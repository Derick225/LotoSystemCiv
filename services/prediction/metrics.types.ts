import { SpectralMetric, FractalMetric, VolatilityMetric, SymbioticContext, NumberRegularity } from '../../types';

export interface StatisticalBounds {
  median: number;
  q1: number;
  q3: number;
  variance: number;
  kurtosis: number;
  skewness: number;
  shannonEntropy: number;
  hurstExponent: number;
}

export interface EnhancedMetrics {
  frequencies?: Record<number, number>;
  poisson?: Record<number, number>;
  bayes?: Record<number, number>;
  temporal?: Record<number, number>;
  digitalRoot?: Record<number, number>;
  resistance?: Record<number, number>;
  gapVelocity?: Record<number, number>;
  leaderSuccession?: Record<number, number>;
  aiIntuition?: Record<number, number>;
  fractalResonance?: Record<number, number>;
  spatial?: Record<number, number> | number[];
  proximityDiagnostic?: Record<number, number>;
  missedModulator?: Record<number, number>;
  driftCorrection?: Record<number, number>;
  symbioticClusters?: Record<number, number>;
  entropyRegime?: Record<number, number>;
  topologicalTension?: Record<number, number>;
  anomalyDetection?: Record<number, number>;
  hawkesExcitation?: Record<number, number>;
  topologicalLyapunov?: Record<number, number>;
  symbioticContext?: SymbioticContext | null;
  dynamicWeightModifiers?: Record<number, Partial<Record<string, number>>>;
  spectral?: SpectralMetric[];
  fractal?: FractalMetric[];
  volatility?: VolatilityMetric | number | null;
  structural?: Record<number, number>;
  trend?: Record<number, number>;
  network?: Record<number, number>;
  affinity?: Record<number, number>;
  acceleration?: Record<number, number>;
  sumControl?: Record<number, number>;
  correlationMatrix?: Record<number, { affinities: Record<number, number> }>;
  regularity?: NumberRegularity[];
  
  // NOUVEAU : Bornes statistiques dynamiques pour remplacer les nombres magiques
  statisticalBounds?: StatisticalBounds;
  
  // Couplage Déterministe ADN & Tamisage (DnaSieve)
  dnaSieve?: {
    multipliers: Record<number, number>;
    affinityPercent: Record<number, number>;
    dominantAlgos: string[];
    compositeDna?: Float32Array;
    dnaConcordanceMean?: number;
    entropyBits?: number;
    sieveIntensitySNR?: number;
  };

  // Certificat de Validation du Filtre Algorithmique d'ADN
  algorithmicFilterCertificate?: import('../../types').FilterValidationCertificate;
  
  [key: string]: unknown;
}
