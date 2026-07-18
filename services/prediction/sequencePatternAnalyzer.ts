import { DrawResult } from '../../types';
import { purifyHistoryForDraw } from '../../utils/arrayUtils';

export interface PatternMatch {
  pattern: number[];
  nextExpectedGap: number;
  frequency: number;
  confidence: number;
}

export interface SequencePatternScore {
  number: number;
  currentGap: number;
  recentSequence: number[];
  bestMatch: PatternMatch | null;
  stochasticScore: number;
}

export interface SequencePatternAnalyzerConfig {
  slidingWindowSize?: number;
  minRecurrenceThreshold?: number;
  maxNumber?: number;
  maxLookbackWindows?: number;
}

interface HistoricalMatch {
  similarity: number;
  nextGap: number;
  window: number[];
  trendSimilarity: number;
}

const clamp = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, v));

const logistic = (x: number): number =>
  1 / (1 + Math.exp(-x));

const mean = (arr: number[]): number =>
  arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;

const variance = (arr: number[], avg?: number): number => {
  if (arr.length === 0) return 0;
  const m = avg ?? mean(arr);
  return arr.reduce((acc, v) => acc + Math.pow(v - m, 2), 0) / arr.length;
};

const stdDev = (arr: number[], avg?: number): number =>
  Math.sqrt(variance(arr, avg));

const median = (arr: number[]): number => {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
};

const safeGagnants = (draw: DrawResult): number[] =>
  Array.isArray(draw.gagnants) ? draw.gagnants.filter(Number.isFinite) : [];

const computeTrendVector = (seq: number[]): number[] => {
  if (seq.length < 2) return [];
  const deltas: number[] = [];
  for (let i = 1; i < seq.length; i++) {
    deltas.push(seq[i] - seq[i - 1]);
  }
  return deltas;
};

const computeSquaredDistance = (a: number[], b: number[]): number => {
  let d = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    d += Math.pow(a[i] - b[i], 2);
  }
  return d;
};

const robustBandwidth = (seq: number[]): number => {
  if (seq.length <= 1) return 1.0;

  const med = median(seq);
  const absDev = seq.map(v => Math.abs(v - med));
  const mad = median(absDev);

  const sigma = stdDev(seq);
  const robustScale = Math.max(1.0, mad * 1.4826, sigma * 0.5);

  return robustScale;
};

class SequencePatternAnalyzer {
  public analyze(
    drawName: string,
    history: DrawResult[],
    config?: SequencePatternAnalyzerConfig
  ): SequencePatternScore[] {
    const windowSize = Math.max(2, config?.slidingWindowSize ?? 3);
    const minRecurrenceThreshold = Math.max(0.1, config?.minRecurrenceThreshold ?? 0.5);
    const maxNumber = Math.max(1, config?.maxNumber ?? 90);
    const maxLookbackWindows = Math.max(10, config?.maxLookbackWindows ?? 250);

    const isolatedHistory = !drawName ? history.slice() : purifyHistoryForDraw(drawName, history);
    const chronologicalHistory = [...isolatedHistory].reverse();
    const totalDraws = chronologicalHistory.length;

    const gapSequences: Record<number, number[]> = {};
    const lastSeenIndex: Record<number, number> = {};

    for (let i = 1; i <= maxNumber; i++) {
      gapSequences[i] = [];
      lastSeenIndex[i] = -1;
    }

    for (let index = 0; index < chronologicalHistory.length; index++) {
      const draw = chronologicalHistory[index];
      const gagnants = safeGagnants(draw);

      for (const num of gagnants) {
        if (num < 1 || num > maxNumber) continue;

        const previousIndex = lastSeenIndex[num];
        if (previousIndex !== -1) {
          const gap = index - previousIndex - 1;
          gapSequences[num].push(gap);
        }
        lastSeenIndex[num] = index;
      }
    }

    const results: SequencePatternScore[] = [];

    for (let num = 1; num <= maxNumber; num++) {
      const seq = gapSequences[num];
      const lastIndex = lastSeenIndex[num];
      const currentGap = lastIndex !== -1 ? totalDraws - 1 - lastIndex : totalDraws;

      if (seq.length < windowSize + 1) {
        results.push({
          number: num,
          currentGap,
          recentSequence: seq.slice(-windowSize),
          bestMatch: null,
          stochasticScore: 0,
        });
        continue;
      }

      const recentSequence = seq.slice(-windowSize);
      const recentTrend = computeTrendVector(recentSequence);

      const gapMean = mean(seq);
      const gapStd = stdDev(seq, gapMean);
      const bwLevel = robustBandwidth(seq);
      const bwTrend = Math.max(1.0, robustBandwidth(recentTrend.length > 0 ? recentTrend : [0]));

      const matches: HistoricalMatch[] = [];
      const upperBound = Math.min(seq.length - windowSize - 1, maxLookbackWindows);

      for (let i = 0; i <= upperBound; i++) {
        const historicalWindow = seq.slice(i, i + windowSize);
        const historicalNextGap = seq[i + windowSize];
        const historicalTrend = computeTrendVector(historicalWindow);

        const levelDistance = computeSquaredDistance(recentSequence, historicalWindow);
        const trendDistance = computeSquaredDistance(recentTrend, historicalTrend);

        const levelSimilarity = Math.exp(-levelDistance / (2 * Math.pow(bwLevel, 2)));
        const trendSimilarity = recentTrend.length > 0
          ? Math.exp(-trendDistance / (2 * Math.pow(bwTrend, 2)))
          : 1.0;

        // Mélange niveau + forme
        const similarity = 0.7 * levelSimilarity + 0.3 * trendSimilarity;

        // seuil très faible pour garder la continuité, mais pas le bruit pur
        if (similarity > Math.exp(-4.0)) {
          matches.push({
            similarity,
            nextGap: historicalNextGap,
            window: historicalWindow,
            trendSimilarity,
          });
        }
      }

      if (matches.length === 0) {
        results.push({
          number: num,
          currentGap,
          recentSequence,
          bestMatch: null,
          stochasticScore: 0,
        });
        continue;
      }

      const totalWeight = matches.reduce((acc, m) => acc + m.similarity, 0);
      const weightedNextGap =
        matches.reduce((acc, m) => acc + m.nextGap * m.similarity, 0) /
        Math.max(totalWeight, 1e-9);

      const nextGapValues = matches.map(m => m.nextGap);
      const nextGapMean = mean(nextGapValues);
      const nextGapStd = stdDev(nextGapValues, nextGapMean);
      const nextGapDispersionPenalty = 1 / (1 + nextGapStd / Math.max(1.0, gapStd));

      const bestHistoricalMatch = matches.reduce((best, cur) =>
        cur.similarity > best.similarity ? cur : best
      );

      const bestResonance = bestHistoricalMatch.similarity;

      const supportStrength = logistic((totalWeight - minRecurrenceThreshold) * 1.5);
      const matchCountStrength = logistic((matches.length - 2.0) * 0.8);

      const signalSpread = Math.max(1.0, gapStd, nextGapStd * 0.75);
      const gapAlignment = Math.exp(
        -Math.pow(currentGap - weightedNextGap, 2) / (2 * Math.pow(signalSpread, 2))
      );

      const patternConsistency =
        0.6 * bestResonance +
        0.4 * nextGapDispersionPenalty;

      // score brut = adéquation au gap attendu x qualité du motif x force de preuve
      let score =
        100 *
        gapAlignment *
        patternConsistency *
        (0.55 + 0.45 * supportStrength) *
        (0.55 + 0.45 * matchCountStrength);

      // pénalisation anti faux positif si très peu de matches
      if (matches.length === 1) {
        score *= 0.6;
      } else if (matches.length === 2) {
        score *= 0.8;
      }

      score = clamp(score, 0, 100);

      let bestMatch: PatternMatch | null = null;

      if (totalWeight >= minRecurrenceThreshold) {
        const confidence =
          100 *
          clamp(
            0.35 * supportStrength +
              0.20 * matchCountStrength +
              0.25 * gapAlignment +
              0.20 * patternConsistency,
            0,
            1
          );

        bestMatch = {
          pattern: recentSequence,
          nextExpectedGap: Number(weightedNextGap.toFixed(2)),
          frequency: Number(totalWeight.toFixed(2)),
          confidence: Number(confidence.toFixed(2)),
        };
      } else {
        score *= 0.5;
      }

      results.push({
        number: num,
        currentGap,
        recentSequence,
        bestMatch,
        stochasticScore: Number(score.toFixed(2)),
      });
    }

    return results;
  }
}

export const sequencePatternAnalyzer = new SequencePatternAnalyzer();
