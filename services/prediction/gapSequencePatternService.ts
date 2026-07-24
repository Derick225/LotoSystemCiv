import { DrawResult } from '../../types';
import { purifyHistoryForDraw } from '../../utils/arrayUtils';

export interface GapSequenceStats {
  number: number;
  currentGap: number;
  gaps: number[];          // All historical gaps in chronological order
  meanGap: number;
  stdGap: number;
  maxGap: number;
  autocorrelationLag1: number;
  autocorrelationLag2: number;
  expectedNextGap: number;
  empiricalCdf: number;   // Cumulative empirical probability of a draw having gap <= currentGap
  fatigueScore: number;   // Derived smoothly from Normal CDF of current gap vs history
  resonanceScore: number; // Gaussian radial basis function of current gap vs expected next gap
  signalScore: number;    // Fused score [0, 100] using autocorrelation weight
  compressionFactor: number; // Ratio of rolling short-term std / long-term std (continuous measure of variance tightening)
  kaplanMeierProb: number; // Kaplan-Meier cumulative probability of breakout before/at current gap [0..100]
  hazardRate: number;      // Current conditional breakout probability (hazard rate) under Kaplan-Meier
}

export interface GapSequenceAnalysisReport {
  drawName: string;
  totalDraws: number;
  stats: Record<number, GapSequenceStats>;
  topResonatingNumbers: number[];
  topFatigueNumbers: number[];
  generalDistribution: { gap: number; count: number }[];
}

/**
 * Standard Normal Cumulative Distribution Function (CDF)
 * Solves the integral smoothly using highly accurate continuous approximation (Zero Magic Numbers).
 */
function continuousNormalCdf(x: number, mean: number, std: number): number {
  if (std <= 0) return x >= mean ? 1.0 : 0.0;
  const z = (x - mean) / std;
  
  // Highly accurate polynomial approximation for the standard normal CDF
  const t = 1.0 / (1.0 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp(-z * z / 2.0); // 1 / sqrt(2*pi)
  const prob = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  
  return z > 0 ? 1.0 - prob : prob;
}

/**
 * Service providing continuous in-depth gap sequence patterns and statistical analysis.
 * Respects TIRAGE ISOLATION RULE and ZERO MAGIC NUMBER rule.
 */
export const gapSequencePatternService = {
  /**
   * Analyzes the sequence of gaps of each number (1-90) from history.
   */
  analyzePatterns(drawName: string, history: DrawResult[], maxNumber: number = 90): GapSequenceAnalysisReport {
    // 1. Isolate history per draw (TIRAGE ISOLATION RULE)
    const isolatedHistory = !drawName
      ? history.slice()
      : purifyHistoryForDraw(drawName, history);
      
    const totalDraws = isolatedHistory.length;
    
    // Reverse to process from oldest to newest (chronological order)
    const chronologicalHistory = [...isolatedHistory].reverse();
    
    const lastSeenIndex: Record<number, number> = {};
    const gapSequences: Record<number, number[]> = {};
    
    for (let i = 1; i <= maxNumber; i++) {
      lastSeenIndex[i] = -1;
      gapSequences[i] = [];
    }
    
    // Compute gap sequences chronologically
    chronologicalHistory.forEach((draw, index) => {
      const winningNumbers = draw.gagnants || [];
      winningNumbers.forEach((num: number) => {
        if (num >= 1 && num <= maxNumber) {
          const previousIndex = lastSeenIndex[num];
          if (previousIndex !== -1) {
            const gap = index - previousIndex - 1;
            gapSequences[num].push(gap);
          }
          lastSeenIndex[num] = index;
        }
      });
    });
    
    const stats: Record<number, GapSequenceStats> = {};
    const overallGapsMap: Record<number, number> = {};
    
    for (let num = 1; num <= maxNumber; num++) {
      const seq = gapSequences[num];
      // Current gap is draws since the last seen drawing to the end of the history
      const lastIndex = lastSeenIndex[num];
      const currentGap = lastIndex !== -1 ? (totalDraws - 1 - lastIndex) : totalDraws;
      
      // Accumulate gaps for overall distribution
      seq.forEach(g => {
        overallGapsMap[g] = (overallGapsMap[g] || 0) + 1;
      });
      
      // If sequence has too few draws, build fallback continuous statistics
      if (seq.length < 3) {
        // Average draw size expectation as prior distribution parameters
        const theoreticalMean = maxNumber / 5; // e.g. 18 for 90 numbers
        const theoreticalStd = Math.sqrt(theoreticalMean * (1 - 5 / maxNumber)) || 1.0;
        
        const fatigue = continuousNormalCdf(currentGap, theoreticalMean, theoreticalStd);
        
        stats[num] = {
          number: num,
          currentGap,
          gaps: seq,
          meanGap: parseFloat(theoreticalMean.toFixed(2)),
          stdGap: parseFloat(theoreticalStd.toFixed(2)),
          maxGap: currentGap > theoreticalMean ? currentGap : Math.round(theoreticalMean * 2.5),
          autocorrelationLag1: 0.0,
          autocorrelationLag2: 0.0,
          expectedNextGap: parseFloat(theoreticalMean.toFixed(2)),
          empiricalCdf: parseFloat(fatigue.toFixed(4)),
          fatigueScore: parseFloat(fatigue.toFixed(4)),
          resonanceScore: 0.5,
          signalScore: parseFloat((fatigue * 100).toFixed(2)),
          compressionFactor: 1.0,
          kaplanMeierProb: parseFloat((fatigue * 100).toFixed(2)),
          hazardRate: 1 / theoreticalMean
        };
        continue;
      }
      
      const n = seq.length;
      const sum = seq.reduce((acc, v) => acc + v, 0);
      const meanGap = sum / n;
      
      const variance = seq.reduce((acc, v) => acc + Math.pow(v - meanGap, 2), 0) / n;
      const stdGap = Math.sqrt(variance) || 1.0;
      const maxGap = Math.max(...seq);
      
      // --- Kaplan-Meier Survival Analysis & Hazard Rate Estimation ---
      // Calcule le produit-limite de survie S_t = S_{t-1} * (1 - h_t)
      // et dérive la probabilité cumulée de sortie et le taux de hasard instantané.
      let kaplanMeierProb = 0;
      let hazardRate = 0;
      
      const gapFreq = new Map<number, number>();
      seq.forEach(g => gapFreq.set(g, (gapFreq.get(g) || 0) + 1));
      
      const uniqueGaps = Array.from(gapFreq.keys()).sort((a, b) => a - b);
      
      let nRisk = n;
      let S_t = 1.0;
      
      for (const t of uniqueGaps) {
        if (t > currentGap) break;
        
        const d_t = gapFreq.get(t) || 0;
        if (nRisk > 0) {
          const hazard_t = d_t / nRisk;
          S_t = S_t * (1.0 - hazard_t);
          if (t === currentGap) {
            hazardRate = hazard_t;
          }
        }
        nRisk -= d_t; // Décrémentation stricte du risk set à chaque pas de temps
      }
      
      // La probabilité cumulée de rupture avant ou à l'écart actuel est 1 - S_current
      kaplanMeierProb = (1.0 - S_t) * 100.0;
      
      // Autocorrelation Lag-1 & Lag-2 (estimateurs mathématiques sans amortissement arbitraire)
      let numLag1 = 0, denLag = 0;
      let numLag2 = 0;
      
      for (let i = 0; i < n; i++) {
        const diff = seq[i] - meanGap;
        denLag += diff * diff;
        
        if (i >= 1) {
          numLag1 += diff * (seq[i - 1] - meanGap);
        }
        if (i >= 2) {
          numLag2 += diff * (seq[i - 2] - meanGap);
        }
      }
      
      const autocorrelationLag1 = denLag > 0 ? numLag1 / denLag : 0;
      const autocorrelationLag2 = denLag > 0 ? numLag2 / denLag : 0;
      
      // Expected Next Gap from Lag 1 AR(1) process:
      // E[G_t] = mu + rho_1 * (G_{t-1} - mu)
      const lastGap = seq[n - 1];
      let expectedNextGap = meanGap + autocorrelationLag1 * (lastGap - meanGap);
      expectedNextGap = Math.max(0, expectedNextGap);
      
      // Empirical Cumulative Probability of having gap <= currentGap
      const smallerOrEqualGaps = seq.filter(g => g <= currentGap).length;
      const empiricalCdf = smallerOrEqualGaps / n;
      
      // Continuous Fatigue Score: Sigmoid-like scaling via Gaussian distribution
      const fatigueScore = continuousNormalCdf(currentGap, meanGap, stdGap);
      
      // Continuous Resonance Score: Gaussian Radial Basis Function
      // Mesure l'écart entre le gap actuel et la projection d'autocorrélation attendue.
      // Le paramètre de dispersion (width) correspond exactement à l'écart-type stdGap
      // intrinsèque de la séquence pour bannir tout coefficient diviseur arbitraire.
      const width = stdGap;
      const resonanceScore = Math.exp(-0.5 * Math.pow((currentGap - expectedNextGap) / width, 2));
      
      // Combined continuous Signal:
      // Plus l'autocorrélation de premier ordre est forte, plus la résonance du modèle AR(1) domine.
      // Sinon, on s'appuie de façon continue sur le score de fatigue classique.
      const weight = Math.abs(autocorrelationLag1);
      const combinedSignal = (weight * resonanceScore) + ((1.0 - weight) * fatigueScore);
      const signalScore = Math.max(0.0, Math.min(100.0, combinedSignal * 100.0));
      
      // Short-term variance vs long-term variance (Compression Wave)
      // Mesure la contraction locale de la variance pour détecter les clusters de volatilité.
      const shortTermWindow = Math.min(5, Math.max(2, Math.floor(n / 4)));
      const recentGaps = seq.slice(-shortTermWindow);
      const recentMean = recentGaps.reduce((acc, v) => acc + v, 0) / recentGaps.length;
      const recentVariance = recentGaps.reduce((acc, v) => acc + Math.pow(v - recentMean, 2), 0) / recentGaps.length;
      const recentStd = Math.sqrt(recentVariance) || 0.5;
      const compressionFactor = stdGap > 0 ? recentStd / stdGap : 1.0;
      
      stats[num] = {
        number: num,
        currentGap,
        gaps: seq,
        meanGap: parseFloat(meanGap.toFixed(2)),
        stdGap: parseFloat(stdGap.toFixed(2)),
        maxGap,
        autocorrelationLag1: parseFloat(autocorrelationLag1.toFixed(4)),
        autocorrelationLag2: parseFloat(autocorrelationLag2.toFixed(4)),
        expectedNextGap: parseFloat(expectedNextGap.toFixed(2)),
        empiricalCdf: parseFloat(empiricalCdf.toFixed(4)),
        fatigueScore: parseFloat(fatigueScore.toFixed(4)),
        resonanceScore: parseFloat(resonanceScore.toFixed(4)),
        signalScore: parseFloat(signalScore.toFixed(2)),
        compressionFactor: parseFloat(compressionFactor.toFixed(4)),
        kaplanMeierProb: parseFloat(kaplanMeierProb.toFixed(4)),
        hazardRate: parseFloat(hazardRate.toFixed(6))
      };
    }
    
    // Top resonating & high fatigue indices
    const topResonatingNumbers = Object.values(stats)
      .sort((a, b) => {
        if (Math.abs(b.resonanceScore - a.resonanceScore) > 1e-6) return b.resonanceScore - a.resonanceScore;
        const hashA = (a.number * 2654435761) % 4294967296;
        const hashB = (b.number * 2654435761) % 4294967296;
        return hashB - hashA;
      })
      .slice(0, 10)
      .map(s => s.number);
      
    const topFatigueNumbers = Object.values(stats)
      .sort((a, b) => {
        if (Math.abs(b.fatigueScore - a.fatigueScore) > 1e-6) return b.fatigueScore - a.fatigueScore;
        const hashA = (a.number * 2654435761) % 4294967296;
        const hashB = (b.number * 2654435761) % 4294967296;
        return hashB - hashA;
      })
      .slice(0, 10)
      .map(s => s.number);
      
    // Sort overall gaps distribution for chart
    const generalDistribution = Object.entries(overallGapsMap)
      .map(([gapStr, count]) => ({ gap: parseInt(gapStr), count }))
      .sort((a, b) => a.gap - b.gap);
      
    return {
      drawName,
      totalDraws,
      stats,
      topResonatingNumbers,
      topFatigueNumbers,
      generalDistribution
    };
  }
};
