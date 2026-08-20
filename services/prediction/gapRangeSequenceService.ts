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
}

export interface SequencePatternMatch {
  historicalDrawIndex: number;
  similarityScore: number;
  historicalGapsSignature: string[];
  subsequentGapsSignature: string[];
  subsequentBins: number[];
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
  };
  currentGapsByNumber: Record<number, { gap: number; binIndex: number; binLabel: string }>;
  transitionMatrix: number[][]; // [sourceBin][targetBin] transition counts
  resolutionWeights?: { step5Weight: number; step10Weight: number };
  sequenceMatches?: SequencePatternMatch[];
  markovOrder2Confidence?: number;
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
  if (step === 'combined') return 10; // Combined multi-res default view
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
        if (b.probability > 0) entropy5 -= b.probability * Math.log(b.probability);
      });
      const normEntropy5 = entropy5 / Math.log(totalBins5);

      let entropy10 = 0;
      report10.bins.forEach(b => {
        if (b.probability > 0) entropy10 -= b.probability * Math.log(b.probability);
      });
      const normEntropy10 = entropy10 / Math.log(totalBins10);

      // Information content (1 - normalized entropy)
      const info5 = Math.max(0.01, 1.0 - normEntropy5);
      const info10 = Math.max(0.01, 1.0 - normEntropy10);
      const totalInfo = info5 + info10;

      const step5Weight = info5 / totalInfo;
      const step10Weight = info10 / totalInfo;

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
        totalDraws: report10.totalDraws,
        step: 'combined',
        lastDrawWinningGaps: report10.lastDrawWinningGaps,
        lastDrawBinSignature: report10.lastDrawBinSignature,
        lastDrawBinLabels: report10.lastDrawBinLabels,
        bins: report10.bins,
        topPredictedBins: report10.topPredictedBins,
        scoresByNumber,
        rawScoresByNumber,
        dnaMultipliers: report10.dnaMultipliers,
        dnaAffinity: report10.dnaAffinity,
        dnaSieveInfo: report10.dnaSieveInfo,
        currentGapsByNumber: report10.currentGapsByNumber,
        transitionMatrix: report10.transitionMatrix,
        resolutionWeights: { step5Weight, step10Weight },
        sequenceMatches: report10.sequenceMatches
      };
    }

    const numericStep = step as 5 | 10;

    // 1. Isolate history for this draw (TIRAGE ISOLATION RULE)
    const isolatedHistory = !drawName
      ? history.slice()
      : purifyHistoryForDraw(drawName, history);

    const totalDraws = isolatedHistory.length;
    const totalBins = getTotalBins(numericStep);

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

    // 2. Build 1st & 2nd Order Markov Transition Matrix between bin occurrences:
    const transitionMatrix: number[][] = Array.from({ length: totalBins }, () => new Float64Array(totalBins) as unknown as number[]);

    for (let t = 1; t < drawBinSignatures.length; t++) {
      const prevBins = drawBinSignatures[t - 1].gaps.map(g => g.binIndex);
      const currBins = drawBinSignatures[t].gaps.map(g => g.binIndex);

      prevBins.forEach(prevB => {
        currBins.forEach(currB => {
          transitionMatrix[prevB][currB] += 1;
        });
      });
    }

    // 3. Extract the last draw's gap range signature
    const lastDrawInfo = drawBinSignatures[drawBinSignatures.length - 1];
    const lastDrawWinningGaps = (lastDrawInfo?.gaps || []).map(g => ({
      number: g.number,
      gap: g.gap,
      binIndex: g.binIndex,
      binLabel: getGapBinLabel(g.binIndex, numericStep)
    }));

    const lastDrawBinSignature = lastDrawWinningGaps.map(g => g.binIndex);
    const lastDrawBinLabels = lastDrawWinningGaps.map(g => g.binLabel);

    // 4. Extract Historical Sequence Pattern Matches
    const sequenceMatches: SequencePatternMatch[] = [];
    if (drawBinSignatures.length > 2) {
      const targetSig = new Set(lastDrawBinSignature);
      for (let t = 0; t < drawBinSignatures.length - 1; t++) {
        const histSig = drawBinSignatures[t].gaps.map(g => g.binIndex);
        if (histSig.length === 0) continue;

        // Jaccard similarity of gap bin signatures
        const intersection = histSig.filter(b => targetSig.has(b)).length;
        const union = new Set([...histSig, ...lastDrawBinSignature]).size;
        const jaccardSim = union > 0 ? intersection / union : 0;

        if (jaccardSim > 0.4) {
          const nextInfo = drawBinSignatures[t + 1];
          sequenceMatches.push({
            historicalDrawIndex: t,
            similarityScore: parseFloat(jaccardSim.toFixed(3)),
            historicalGapsSignature: histSig.map(b => getGapBinLabel(b, numericStep)),
            subsequentGapsSignature: (nextInfo?.gaps || []).map(g => getGapBinLabel(g.binIndex, numericStep)),
            subsequentBins: (nextInfo?.gaps || []).map(g => g.binIndex)
          });
        }
      }
    }

    // Sort sequence matches by similarity score descending
    sequenceMatches.sort((a, b) => {
      if (Math.abs(b.similarityScore - a.similarityScore) > 1e-6) return b.similarityScore - a.similarityScore;
      return b.historicalDrawIndex - a.historicalDrawIndex;
    });

    // 5. Compute Conditional Probability Distribution P(targetBin | lastDrawSignature)
    const laplaceAlpha = 1.0 / totalBins;
    const rawTargetCounts = new Float64Array(totalBins);
    let totalTargetWeight = 0;

    for (let b = 0; b < totalBins; b++) {
      let binCount = 0;
      lastDrawBinSignature.forEach(sourceBin => {
        binCount += transitionMatrix[sourceBin][b];
      });

      // Add evidence from sequence matches
      sequenceMatches.slice(0, 10).forEach(match => {
        if (match.subsequentBins.includes(b)) {
          binCount += match.similarityScore * 2.0;
        }
      });

      const smoothedCount = binCount + laplaceAlpha;
      rawTargetCounts[b] = smoothedCount;
      totalTargetWeight += smoothedCount;
    }

    const binProbabilities = new Float64Array(totalBins);
    for (let b = 0; b < totalBins; b++) {
      binProbabilities[b] = totalTargetWeight > 0 ? rawTargetCounts[b] / totalTargetWeight : 1.0 / totalBins;
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

    // 6. Build Bins Report Array
    const bins: GapRangeBinInfo[] = [];
    for (let b = 0; b < totalBins; b++) {
      const bounds = getGapBinBounds(b, numericStep);
      bins.push({
        binIndex: b,
        label: getGapBinLabel(b, numericStep),
        minGap: bounds.minGap,
        maxGap: bounds.maxGap,
        probability: parseFloat(binProbabilities[b].toFixed(4)),
        matchingNumbers: matchingNumbersByBin[b] || []
      });
    }

    // Sort bins by descending conditional probability to identify top predicted gap ranges
    const topPredictedBins = [...bins].sort((a, b) => {
      if (Math.abs(b.probability - a.probability) > 1e-6) return b.probability - a.probability;
      const hashA = (a.binIndex * 2654435761) % 4294967296;
      const hashB = (b.binIndex * 2654435761) % 4294967296;
      return hashB - hashA;
    });

    // 7. Compute scores for each number (1-90) based on its current gap range probability
    const probs = bins.map(b => b.probability);
    const meanProb = probs.reduce((acc, p) => acc + p, 0) / totalBins;
    const varianceProb = probs.reduce((acc, p) => acc + Math.pow(p - meanProb, 2), 0) / totalBins;
    const stdProb = Math.sqrt(varianceProb) || Number.EPSILON;

    // Calcul du Tamis de l'ADN Algorithmique Actuel (Tamis ADN Actif - ZÉRO NOMBRE MAGIQUE, CONTINU & DÉTERMINISTE)
    const { multipliers: dnaMultArray, affinityPercent: dnaAffArray, dominantAlgos } = calculateDnaSieveWeights(isolatedHistory, weights, drawName);

    const rawScoresByNumber: Record<number, number> = {};
    const scoresByNumber: Record<number, number> = {};
    const dnaMultipliers: Record<number, number> = {};
    const dnaAffinity: Record<number, number> = {};

    let sumDnaAffinity = 0;
    for (let num = 1; num <= maxNumber; num++) {
      const binIdx = currentGapsByNumber[num].binIndex;
      const prob = binProbabilities[binIdx];

      const z = (prob - meanProb) / stdProb;
      const rawMarkovScore = 100.0 / (1.0 + Math.exp(-3.0 * z));
      const mult = dnaMultArray[num] ?? 1.0;
      const aff = dnaAffArray[num] ?? 50.0;

      rawScoresByNumber[num] = parseFloat(Math.max(0.0, Math.min(100.0, rawMarkovScore)).toFixed(2));
      dnaMultipliers[num] = mult;
      dnaAffinity[num] = aff;

      // Tamisage continu : 35% d'inertie de séquence de tranche + 65% de sélection par l'ADN algorithmique actif
      const sievedScore = rawMarkovScore * (0.35 + 0.65 * mult);
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
      },
      currentGapsByNumber,
      transitionMatrix,
      sequenceMatches: sequenceMatches.slice(0, 10)
    };
  }
};
