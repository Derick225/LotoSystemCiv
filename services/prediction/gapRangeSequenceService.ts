import { DrawResult } from '../../types';
import { purifyHistoryForDraw } from '../../utils/arrayUtils';

export type GapRangeStep = 5 | 10;

export interface GapRangeBinInfo {
  binIndex: number;
  label: string;
  minGap: number;
  maxGap: number; // Infinity for the last bin
  probability: number; // Conditional transition probability [0, 1]
  matchingNumbers: number[]; // Numbers (1-90) whose current gap falls in this bin
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
  scoresByNumber: Record<number, number>;
  transitionMatrix: number[][]; // [sourceBin][targetBin] transition counts
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
  return step === 10 ? 7 : 11;
}

/**
  * Advanced Service for analyzing gap range sequence patterns and Markov transitions.
  * Strictly respects TIRAGE ISOLATION RULE and ZERO MAGIC NUMBERS rule.
  */
export const gapRangeSequenceService = {
  /**
    * Analyzes the historical sequence of gap ranges and computes transition probabilities.
    */
  analyzeGapRangePatterns(
    drawName: string,
    history: DrawResult[],
    step: GapRangeStep = 10,
    maxNumber: number = 90
  ): GapRangeSequenceReport {
    // 1. Isolate history for this draw (TIRAGE ISOLATION RULE)
    const isolatedHistory = !drawName
      ? history.slice()
      : purifyHistoryForDraw(drawName, history);

    const totalDraws = isolatedHistory.length;
    const totalBins = getTotalBins(step);

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
          const binIndex = getGapBinIndex(gap, step);

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
    const currentGaps: Record<number, { gap: number; binIndex: number }> = {};
    for (let num = 1; num <= maxNumber; num++) {
      const lastIdx = lastSeenIndex[num];
      const gap = lastIdx !== -1 ? totalDraws - 1 - lastIdx : totalDraws;
      const binIndex = getGapBinIndex(gap, step);
      currentGaps[num] = { gap, binIndex };
    }

    // 2. Build Markov Transition Matrix between bin occurrences:
    // transitionMatrix[sourceBin][targetBin] counts transitions from draw T-1 to draw T
    const transitionMatrix: number[][] = Array.from({ length: totalBins }, () => new Float64Array(totalBins) as unknown as number[]);

    for (let t = 1; t < drawBinSignatures.length; t++) {
      const prevBins = drawBinSignatures[t - 1].gaps.map(g => g.binIndex);
      const currBins = drawBinSignatures[t].gaps.map(g => g.binIndex);

      // Add transition weight for each pair of (prevBin, currBin)
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
      binLabel: getGapBinLabel(g.binIndex, step)
    }));

    const lastDrawBinSignature = lastDrawWinningGaps.map(g => g.binIndex);
    const lastDrawBinLabels = lastDrawWinningGaps.map(g => g.binLabel);

    // 4. Compute Conditional Probability Distribution P(targetBin | lastDrawSignature)
    // Using Bayesian Laplace smoothing alpha = 1 / totalBins
    const laplaceAlpha = 1.0 / totalBins;
    const rawTargetCounts = new Float64Array(totalBins);
    let totalTargetWeight = 0;

    for (let b = 0; b < totalBins; b++) {
      let binCount = 0;
      lastDrawBinSignature.forEach(sourceBin => {
        binCount += transitionMatrix[sourceBin][b];
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
      const b = currentGaps[num].binIndex;
      matchingNumbersByBin[b].push(num);
    }

    // 5. Build Bins Report Array
    const bins: GapRangeBinInfo[] = [];
    for (let b = 0; b < totalBins; b++) {
      const bounds = getGapBinBounds(b, step);
      bins.push({
        binIndex: b,
        label: getGapBinLabel(b, step),
        minGap: bounds.minGap,
        maxGap: bounds.maxGap,
        probability: parseFloat(binProbabilities[b].toFixed(4)),
        matchingNumbers: matchingNumbersByBin[b] || []
      });
    }

    // Sort bins by descending conditional probability to identify top predicted gap ranges
    const topPredictedBins = [...bins].sort((a, b) => b.probability - a.probability);

    // 6. Compute scores for each number (1-90) based on its current gap range probability
    // Normalization via Z-score -> Sigmoid mapped smoothly to [0, 100]
    const probs = bins.map(b => b.probability);
    const meanProb = probs.reduce((acc, p) => acc + p, 0) / totalBins;
    const varianceProb = probs.reduce((acc, p) => acc + Math.pow(p - meanProb, 2), 0) / totalBins;
    const stdProb = Math.sqrt(varianceProb) || Number.EPSILON;

    const scoresByNumber: Record<number, number> = {};
    for (let num = 1; num <= maxNumber; num++) {
      const binIdx = currentGaps[num].binIndex;
      const prob = binProbabilities[binIdx];

      // Normalized Z-score
      const z = (prob - meanProb) / stdProb;

      // Continuous sigmoid smoothing
      const score = 100.0 / (1.0 + Math.exp(-3.0 * z));
      scoresByNumber[num] = parseFloat(Math.max(0.0, Math.min(100.0, score)).toFixed(2));
    }

    return {
      drawName,
      totalDraws,
      step,
      lastDrawWinningGaps,
      lastDrawBinSignature,
      lastDrawBinLabels,
      bins,
      topPredictedBins,
      scoresByNumber,
      transitionMatrix
    };
  }
};
