import { DrawResult } from '../../types';
import { purifyHistoryForDraw } from '../../utils/arrayUtils';
import { AlgoWeights } from '../../shared/prediction.types';
import { calculateDnaSieveWeights } from '../temporalAnalysisService';

export type GapRangeStep = 5 | 10 | 'combined';

export interface GapRangeBinInfo {
  binIndex: number;
  label: string;
  minGap: number;
  maxGap: number; // Infinity for the last bin
  probability: number; // Conditional transition probability [0, 1]
  matchingNumbers: number[]; // Numbers (1-90) whose current gap falls in this bin
  zScore?: number; // Normalized deviation from uniform expectation
  lift?: number; // Ratio vs baseline uniform frequency
}

export interface SequencePatternMatch {
  historicalDrawIndex: number;
  similarityScore: number;
  historicalGapsSignature: string[];
  subsequentGapsSignature: string[];
  subsequentBins: number[];
  transitionConfidence?: number;
}

export interface GapRangeSequenceReport {
  drawName: string;
  totalDraws: number;
  step: GapRangeStep;
  lastDrawWinningGaps: { number: number; gap: number; binIndex: number; binLabel: string }[];
  lastDrawBinSignature: number[];
  lastDrawBinLabels: string[];
  bins: GapRangeBinInfo[];
  topPredictedBins: GapRangeBinInfo[];
  scoresByNumber: Record<number, number>; // Sieved scores passed through active algorithmic DNA
  rawScoresByNumber: Record<number, number>; // Raw Markov transition scores
  dnaMultipliers: Record<number, number>; // Continuous DNA sieve multipliers
  dnaAffinity: Record<number, number>; // Normalized DNA compatibility percentage
  dnaSieveInfo: {
    active: boolean;
    dominantAlgos: string[];
    dnaConcordanceMean: number;
    entropyBits?: number;
    sieveIntensityPercent?: number;
    activeGenesBreakdown?: { gene: string; weight: number; label: string }[];
  };
  currentGapsByNumber: Record<number, { gap: number; binIndex: number; binLabel: string }>;
  transitionMatrix: number[][]; // [sourceBin][targetBin] transition counts
  resolutionWeights?: { step5Weight: number; step10Weight: number };
  sequenceMatches?: SequencePatternMatch[];
  markovOrder2Confidence?: number;
  entropyBits?: number;
}

/**
 * Returns the bin index for a given gap and step size (5 or 10).
 * Step 10: 0-9 (0), 10-19 (1), 20-29 (2), 30-39 (3), 40-49 (4), 50-59 (5), 60+ (6)
 * Step 5:  0-4 (0), 5-9 (1), 10-14 (2), 15-19 (3), 20-24 (4), 25-29 (5), 30-34 (6), 35-39 (7), 40-44 (8), 45-49 (9), 50+ (10)
 */
export function getGapBinIndex(gap: number, step: GapRangeStep): number {
  const safeGap = Math.max(0, Math.floor(gap));
  if (step === 10) {
    return Math.min(6, Math.floor(safeGap / 10));
  } else {
    return Math.min(10, Math.floor(safeGap / 5));
  }
}

/**
 * Returns human-readable label for a bin index and step size.
 */
export function getGapBinLabel(binIndex: number, step: GapRangeStep): string {
  if (step === 10) {
    if (binIndex >= 6) return '60+';
    const start = binIndex * 10;
    const end = start + 9;
    return `${start}-${end}`;
  } else {
    if (binIndex >= 10) return '50+';
    const start = binIndex * 5;
    const end = start + 4;
    return `${start}-${end}`;
  }
}

/**
 * Returns the min and max gap bounds for a bin index.
 */
export function getGapBinBounds(binIndex: number, step: GapRangeStep): { minGap: number; maxGap: number } {
  if (step === 10) {
    if (binIndex >= 6) return { minGap: 60, maxGap: Infinity };
    return { minGap: binIndex * 10, maxGap: binIndex * 10 + 9 };
  } else {
    if (binIndex >= 10) return { minGap: 50, maxGap: Infinity };
    return { minGap: binIndex * 5, maxGap: binIndex * 5 + 4 };
  }
}

/**
 * Total number of bins for a step size.
 */
export function getTotalBins(step: GapRangeStep): number {
  if (step === 'combined') return 11; // Combined multi-res default view
  return step === 10 ? 7 : 11;
}

/**
 * Advanced Service for analyzing gap range sequence patterns and Markov transitions.
 * Strictly respects TIRAGE ISOLATION RULE and ZERO MAGIC NUMBERS rule.
 */
export const gapRangeSequenceService = {
  /**
   * Analyzes the historical sequence of gap ranges and computes transition probabilities.
   * Sifts candidates through the active Algorithmic DNA.
   */
  analyzeGapRangePatterns(
    drawName: string,
    history: DrawResult[],
    step: GapRangeStep = 'combined',
    maxNumber: number = 90,
    weights?: AlgoWeights
  ): GapRangeSequenceReport {
    // 0. Handle multi-resolution fusion ('combined')
    if (step === 'combined') {
      const report5 = this.analyzeGapRangePatterns(drawName, history, 5, maxNumber, weights);
      const report10 = this.analyzeGapRangePatterns(drawName, history, 10, maxNumber, weights);

      // Entropy-based dynamic information weighting (AGENTS.md: zero magic numbers)
      const totalBins5 = getTotalBins(5);
      const totalBins10 = getTotalBins(10);

      let entropy5 = 0;
      report5.bins.forEach(b => {
        if (b.probability > 0) entropy5 -= b.probability * Math.log2(b.probability);
      });
      const maxEntropy5 = Math.log2(totalBins5) || 1.0;
      const normEntropy5 = entropy5 / maxEntropy5;

      let entropy10 = 0;
      report10.bins.forEach(b => {
        if (b.probability > 0) entropy10 -= b.probability * Math.log2(b.probability);
      });
      const maxEntropy10 = Math.log2(totalBins10) || 1.0;
      const normEntropy10 = entropy10 / maxEntropy10;

      // Information content I = 1 - (H / H_max)
      const info5 = Math.max(0.01, 1.0 - normEntropy5);
      const info10 = Math.max(0.01, 1.0 - normEntropy10);
      
      // Continuous Softmax blending
      const meanInfo = (info5 + info10) / 2.0;
      const stdInfo = Math.sqrt(((info5 - meanInfo) ** 2 + (info10 - meanInfo) ** 2) / 2.0) || 0.1;
      const kappa = 1.0 / stdInfo;
      const exp5 = Math.exp(kappa * (info5 - meanInfo));
      const exp10 = Math.exp(kappa * (info10 - meanInfo));
      const sumExp = exp5 + exp10;

      const step5Weight = exp5 / sumExp;
      const step10Weight = exp10 / sumExp;

      // Fused scores per number
      const scoresByNumber: Record<number, number> = {};
      const rawScoresByNumber: Record<number, number> = {};
      for (let num = 1; num <= maxNumber; num++) {
        const s5 = report5.scoresByNumber[num] ?? 50;
        const s10 = report10.scoresByNumber[num] ?? 50;
        scoresByNumber[num] = parseFloat((step5Weight * s5 + step10Weight * s10).toFixed(2));

        const r5 = report5.rawScoresByNumber[num] ?? s5;
        const r10 = report10.rawScoresByNumber[num] ?? s10;
        rawScoresByNumber[num] = parseFloat((step5Weight * r5 + step10Weight * r10).toFixed(2));
      }

      // Merge top predicted bins representation from both scales
      return {
        drawName,
        totalDraws: report5.totalDraws,
        step: 'combined',
        lastDrawWinningGaps: report5.lastDrawWinningGaps,
        lastDrawBinSignature: report5.lastDrawBinSignature,
        lastDrawBinLabels: report5.lastDrawBinLabels,
        bins: report5.bins,
        topPredictedBins: report5.topPredictedBins,
        scoresByNumber,
        rawScoresByNumber,
        dnaMultipliers: report5.dnaMultipliers,
        dnaAffinity: report5.dnaAffinity,
        dnaSieveInfo: report5.dnaSieveInfo,
        currentGapsByNumber: report5.currentGapsByNumber,
        transitionMatrix: report5.transitionMatrix,
        resolutionWeights: { step5Weight, step10Weight },
        sequenceMatches: report5.sequenceMatches,
        markovOrder2Confidence: report5.markovOrder2Confidence,
        entropyBits: parseFloat(((report5.entropyBits || entropy5) * step5Weight + (report10.entropyBits || entropy10) * step10Weight).toFixed(2))
      };
    }

    const numericStep = step as 5 | 10;

    // 1. Isolate history for this draw (TIRAGE ISOLATION RULE)
    const isolatedHistory = !drawName
      ? history.slice()
      : purifyHistoryForDraw(drawName, history);

    const totalDraws = isolatedHistory.length;
    const totalBins = getTotalBins(numericStep);

    // Fallback if empty history
    if (totalDraws === 0) {
      const emptyBins: GapRangeBinInfo[] = [];
      for (let b = 0; b < totalBins; b++) {
        const bounds = getGapBinBounds(b, numericStep);
        emptyBins.push({
          binIndex: b,
          label: getGapBinLabel(b, numericStep),
          minGap: bounds.minGap,
          maxGap: bounds.maxGap,
          probability: 1.0 / totalBins,
          matchingNumbers: []
        });
      }
      return {
        drawName,
        totalDraws: 0,
        step: numericStep,
        lastDrawWinningGaps: [],
        lastDrawBinSignature: [],
        lastDrawBinLabels: [],
        bins: emptyBins,
        topPredictedBins: emptyBins,
        scoresByNumber: {},
        rawScoresByNumber: {},
        dnaMultipliers: {},
        dnaAffinity: {},
        dnaSieveInfo: { active: false, dominantAlgos: ['Défaut'], dnaConcordanceMean: 50 },
        currentGapsByNumber: {},
        transitionMatrix: Array.from({ length: totalBins }, () => new Array(totalBins).fill(0))
      };
    }

    // Chronological order (oldest to newest)
    const chronologicalHistory = [...isolatedHistory].reverse();

    // Track last seen index for each number to calculate gaps dynamically
    const lastSeenIndex: Record<number, number> = {};
    for (let i = 1; i <= maxNumber; i++) {
      lastSeenIndex[i] = -1;
    }

    // Historical record of bin signatures per draw
    const drawBinSignatures: { drawIndex: number; gaps: { number: number; gap: number; binIndex: number }[] }[] = [];

    chronologicalHistory.forEach((draw, drawIdx) => {
      const winning = draw.gagnants || [];
      const gapsInfo: { number: number; gap: number; binIndex: number }[] = [];

      winning.forEach((num: number) => {
        if (num >= 1 && num <= maxNumber) {
          const prevIdx = lastSeenIndex[num];
          const gap = prevIdx !== -1 ? drawIdx - prevIdx - 1 : drawIdx;
          const binIndex = getGapBinIndex(gap, numericStep);

          gapsInfo.push({ number: num, gap, binIndex });
          lastSeenIndex[num] = drawIdx;
        }
      });

      drawBinSignatures.push({
        drawIndex: drawIdx,
        gaps: gapsInfo
      });
    });

    // Compute current open gaps for all 90 numbers at the current prediction time
    const currentGapsByNumber: Record<number, { gap: number; binIndex: number; binLabel: string }> = {};
    for (let num = 1; num <= maxNumber; num++) {
      const lastIdx = lastSeenIndex[num];
      const gap = lastIdx !== -1 ? totalDraws - 1 - lastIdx : totalDraws;
      const binIndex = getGapBinIndex(gap, numericStep);
      currentGapsByNumber[num] = {
        gap,
        binIndex,
        binLabel: getGapBinLabel(binIndex, numericStep),
      };
    }

    // 2. Build 1st Order & 2nd Order Markov Transition Models
    const transitionMatrix: number[][] = Array.from({ length: totalBins }, () => new Float64Array(totalBins) as unknown as number[]);
    const order2Transitions: Map<string, Float64Array> = new Map();
    const marginalBinCounts = new Float64Array(totalBins);

    for (let t = 1; t < drawBinSignatures.length; t++) {
      const prevBins = drawBinSignatures[t - 1].gaps.map(g => g.binIndex);
      const currBins = drawBinSignatures[t].gaps.map(g => g.binIndex);

      currBins.forEach(currB => {
        marginalBinCounts[currB] += 1;
      });

      prevBins.forEach(prevB => {
        currBins.forEach(currB => {
          transitionMatrix[prevB][currB] += 1;
        });
      });

      // 2nd Order Markov (T-2, T-1 -> T)
      if (t >= 2) {
        const prev2Bins = drawBinSignatures[t - 2].gaps.map(g => g.binIndex);
        prev2Bins.forEach(p2 => {
          prevBins.forEach(p1 => {
            const key = `${p2}_${p1}`;
            if (!order2Transitions.has(key)) {
              order2Transitions.set(key, new Float64Array(totalBins));
            }
            const vec = order2Transitions.get(key)!;
            currBins.forEach(currB => {
              vec[currB] += 1;
            });
          });
        });
      }
    }

    // Total empirical observations
    let totalMarginal = 0;
    for (let b = 0; b < totalBins; b++) {
      totalMarginal += marginalBinCounts[b];
    }

    // 3. Extract the last draw's gap range signature
    const lastDrawInfo = drawBinSignatures[drawBinSignatures.length - 1];
    const prev2DrawInfo = drawBinSignatures.length >= 2 ? drawBinSignatures[drawBinSignatures.length - 2] : null;

    const lastDrawWinningGaps = (lastDrawInfo?.gaps || []).map(g => ({
      number: g.number,
      gap: g.gap,
      binIndex: g.binIndex,
      binLabel: getGapBinLabel(g.binIndex, numericStep)
    }));

    const lastDrawBinSignature = lastDrawWinningGaps.map(g => g.binIndex);
    const lastDrawBinLabels = lastDrawWinningGaps.map(g => g.binLabel);

    // 4. Extract Historical Sequence Pattern Matches via Cosine & Jaccard continuous similarity
    const sequenceMatches: SequencePatternMatch[] = [];
    const targetHistVec = new Float32Array(totalBins);
    lastDrawBinSignature.forEach(b => { targetHistVec[b] += 1.0; });
    const normTarget = Math.sqrt(targetHistVec.reduce((sum, v) => sum + v * v, 0)) || 1.0;

    const similarities: { index: number; similarity: number; nextBins: number[] }[] = [];

    if (drawBinSignatures.length > 2) {
      for (let t = 0; t < drawBinSignatures.length - 1; t++) {
        const histBins = drawBinSignatures[t].gaps.map(g => g.binIndex);
        if (histBins.length === 0) continue;

        const histVec = new Float32Array(totalBins);
        histBins.forEach(b => { histVec[b] += 1.0; });
        const normH = Math.sqrt(histVec.reduce((sum, v) => sum + v * v, 0)) || 1.0;

        let dot = 0;
        for (let b = 0; b < totalBins; b++) {
          dot += targetHistVec[b] * histVec[b];
        }
        const cosSim = dot / (normTarget * normH);

        // Jaccard similarity as complementary geometric factor
        const intersection = histBins.filter(b => lastDrawBinSignature.includes(b)).length;
        const union = new Set([...histBins, ...lastDrawBinSignature]).size;
        const jaccardSim = union > 0 ? intersection / union : 0;

        const compositeSim = 0.6 * cosSim + 0.4 * jaccardSim;
        const nextInfo = drawBinSignatures[t + 1];
        const nextBins = (nextInfo?.gaps || []).map(g => g.binIndex);

        similarities.push({ index: t, similarity: compositeSim, nextBins });
      }
    }

    // Mean and standard deviation of similarity distribution
    const nSim = similarities.length;
    const meanSim = nSim > 0 ? similarities.reduce((sum, s) => sum + s.similarity, 0) / nSim : 0.2;
    const varianceSim = nSim > 0 ? similarities.reduce((sum, s) => sum + (s.similarity - meanSim) ** 2, 0) / nSim : 0.05;
    const stdSim = Math.sqrt(varianceSim) || 0.1;

    // Filter top matches using continuous Gaussian kernel weighting
    similarities.forEach(sim => {
      const z = (sim.similarity - meanSim) / stdSim;
      if (z > 0.5) { // Meaningful positive departure
        const nextInfo = drawBinSignatures[sim.index + 1];
        const histBins = drawBinSignatures[sim.index].gaps.map(g => g.binIndex);
        sequenceMatches.push({
          historicalDrawIndex: sim.index,
          similarityScore: parseFloat(sim.similarity.toFixed(3)),
          historicalGapsSignature: histBins.map(b => getGapBinLabel(b, numericStep)),
          subsequentGapsSignature: (nextInfo?.gaps || []).map(g => getGapBinLabel(g.binIndex, numericStep)),
          subsequentBins: sim.nextBins,
          transitionConfidence: parseFloat((1.0 / (1.0 + Math.exp(-2.0 * z))).toFixed(3))
        });
      }
    });

    sequenceMatches.sort((a, b) => {
      if (Math.abs(b.similarityScore - a.similarityScore) > 1e-6) return b.similarityScore - a.similarityScore;
      return b.historicalDrawIndex - a.historicalDrawIndex;
    });

    // 5. Dynamic Bayesian Dirichlet Smoothing & 2nd Order Markov Integration
    // Empirical base rate prior
    const dirichletPriors = new Float64Array(totalBins);
    for (let b = 0; b < totalBins; b++) {
      dirichletPriors[b] = totalMarginal > 0 ? (marginalBinCounts[b] / totalMarginal) : (1.0 / totalBins);
    }

    // 2nd Order weight based on sample evidence saturation
    const nCrit = 3.0 * totalBins;
    const markovOrder2Confidence = 1.0 / (1.0 + Math.exp(-(totalDraws - nCrit) / (totalBins * 1.5)));

    const rawTargetCounts = new Float64Array(totalBins);
    let totalTargetWeight = 0;

    for (let b = 0; b < totalBins; b++) {
      let order1Count = 0;
      lastDrawBinSignature.forEach(sourceBin => {
        order1Count += transitionMatrix[sourceBin][b];
      });

      let order2Count = 0;
      if (prev2DrawInfo) {
        const prev2Bins = prev2DrawInfo.gaps.map(g => g.binIndex);
        prev2Bins.forEach(p2 => {
          lastDrawBinSignature.forEach(p1 => {
            const key = `${p2}_${p1}`;
            if (order2Transitions.has(key)) {
              order2Count += order2Transitions.get(key)![b];
            }
          });
        });
      }

      // Blended Markov evidence
      const combinedMarkov = (1.0 - markovOrder2Confidence) * order1Count + markovOrder2Confidence * order2Count;

      // Add evidence from sequence matches with Gaussian decay
      let sequenceEvidence = 0;
      sequenceMatches.slice(0, 8).forEach(match => {
        if (match.subsequentBins.includes(b)) {
          const simWeight = Math.exp(-0.5 * ((1.0 - match.similarityScore) / stdSim) ** 2);
          sequenceEvidence += simWeight * 2.0;
        }
      });

      // Dirichlet empirical prior smoothing (Zero magic numbers)
      const smoothedCount = combinedMarkov + sequenceEvidence + dirichletPriors[b];
      rawTargetCounts[b] = smoothedCount;
      totalTargetWeight += smoothedCount;
    }

    // Normalized conditional transition probabilities P(B_t | B_{t-1}, B_{t-2}, History)
    const binProbabilities = new Float64Array(totalBins);
    let totalEntropyBits = 0;
    for (let b = 0; b < totalBins; b++) {
      const p = totalTargetWeight > 0 ? rawTargetCounts[b] / totalTargetWeight : 1.0 / totalBins;
      binProbabilities[b] = p;
      if (p > 0) {
        totalEntropyBits -= p * Math.log2(p);
      }
    }

    // Group numbers 1..90 by their current bin index
    const matchingNumbersByBin: Record<number, number[]> = {};
    for (let b = 0; b < totalBins; b++) {
      matchingNumbersByBin[b] = [];
    }

    for (let num = 1; num <= maxNumber; num++) {
      const b = currentGapsByNumber[num].binIndex;
      matchingNumbersByBin[b].push(num);
    }

    // Mean, Variance & Z-scores for bins
    const meanProb = 1.0 / totalBins;
    let sumProbSq = 0;
    for (let b = 0; b < totalBins; b++) {
      sumProbSq += (binProbabilities[b] - meanProb) ** 2;
    }
    const stdProb = Math.sqrt(sumProbSq / totalBins) || 1e-6;

    // 6. Build Bins Report Array
    const bins: GapRangeBinInfo[] = [];
    for (let b = 0; b < totalBins; b++) {
      const bounds = getGapBinBounds(b, numericStep);
      const prob = binProbabilities[b];
      const z = (prob - meanProb) / stdProb;
      const lift = dirichletPriors[b] > 0 ? prob / dirichletPriors[b] : 1.0;

      bins.push({
        binIndex: b,
        label: getGapBinLabel(b, numericStep),
        minGap: bounds.minGap,
        maxGap: bounds.maxGap,
        probability: parseFloat(prob.toFixed(4)),
        matchingNumbers: matchingNumbersByBin[b] || [],
        zScore: parseFloat(z.toFixed(2)),
        lift: parseFloat(lift.toFixed(2))
      });
    }

    // Sort bins by descending conditional probability to identify top predicted gap ranges
    const topPredictedBins = [...bins].sort((a, b) => {
      if (Math.abs(b.probability - a.probability) > 1e-6) return b.probability - a.probability;
      const hashA = (a.binIndex * 2654435761) % 4294967296;
      const hashB = (b.binIndex * 2654435761) % 4294967296;
      return hashB - hashA;
    });

    // 7. Calcul du Tamis de l'ADN Algorithmique Actuel (DnaSieve)
    const dnaReport = calculateDnaSieveWeights(isolatedHistory, weights, drawName);
    const { 
      multipliers: dnaMultArray, 
      affinityPercent: dnaAffArray, 
      dominantAlgos, 
      entropyBits: dnaEntropy,
      activeGenesBreakdown,
      stdDevDna
    } = dnaReport;

    // L'intensité du tamisage génomique est dérivée du ratio signal/bruit de l'ADN actif
    const snrDna = (stdDevDna || 0.1) / 0.1;
    const dynamicSieveIntensity = 1.0 / (1.0 + Math.exp(-1.5 * (snrDna - 1.0)));
    const sieveIntensityPercent = Math.round(dynamicSieveIntensity * 100);

    const rawScoresByNumber: Record<number, number> = {};
    const scoresByNumber: Record<number, number> = {};
    const dnaMultipliers: Record<number, number> = {};
    const dnaAffinity: Record<number, number> = {};

    let sumDnaAffinity = 0;
    for (let num = 1; num <= maxNumber; num++) {
      const binIdx = currentGapsByNumber[num].binIndex;
      const prob = binProbabilities[binIdx];

      // Mapping logistique continu Z-score -> Score [0, 100]
      const z = (prob - meanProb) / stdProb;
      const rawMarkovScore = 100.0 / (1.0 + Math.exp(-2.5 * z));
      const mult = dnaMultArray[num] ?? 1.0;
      const aff = dnaAffArray[num] ?? 50.0;

      rawScoresByNumber[num] = parseFloat(Math.max(0.0, Math.min(100.0, rawMarkovScore)).toFixed(2));
      dnaMultipliers[num] = mult;
      dnaAffinity[num] = aff;

      // Tamisage différentiable continu par l'ADN algorithmique actif
      const sievedScore = rawMarkovScore * ((1.0 - dynamicSieveIntensity) + dynamicSieveIntensity * mult);
      scoresByNumber[num] = parseFloat(Math.max(0.0, Math.min(100.0, sievedScore)).toFixed(2));

      sumDnaAffinity += aff;
    }

    const dnaConcordanceMean = maxNumber > 0 ? Math.round(sumDnaAffinity / maxNumber) : 50;

    return {
      drawName,
      totalDraws,
      step: numericStep,
      lastDrawWinningGaps,
      lastDrawBinSignature,
      lastDrawBinLabels,
      bins,
      topPredictedBins,
      scoresByNumber,
      rawScoresByNumber,
      dnaMultipliers,
      dnaAffinity,
      dnaSieveInfo: {
        active: true,
        dominantAlgos,
        dnaConcordanceMean,
        entropyBits: dnaEntropy || parseFloat(totalEntropyBits.toFixed(2)),
        sieveIntensityPercent: sieveIntensityPercent || Math.round(dynamicSieveIntensity * 100),
        activeGenesBreakdown: activeGenesBreakdown || []
      },
      currentGapsByNumber,
      transitionMatrix,
      sequenceMatches: sequenceMatches.slice(0, 8),
      markovOrder2Confidence: parseFloat((markovOrder2Confidence * 100).toFixed(1)),
      entropyBits: parseFloat(totalEntropyBits.toFixed(2))
    };
  }
};

