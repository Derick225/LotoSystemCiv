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
  stochasticScore: number; // Continuous score [0-100] based on pattern resonance
}

export interface SequencePatternAnalyzerConfig {
  slidingWindowSize?: number;
  minRecurrenceThreshold?: number;
  maxNumber?: number;
}

/**
 * SequencePatternAnalyzer
 * Scans the history of results to identify recurrences in the sequences of gaps.
 * Uses a configurable sliding window to detect deterministic stochastic patterns.
 * 
 * Complies with ZÉRO NOMBRES MAGIQUES and TIRAGE ISOLATION RULE.
 */
class SequencePatternAnalyzer {
  public analyze(
    drawName: string, 
    history: DrawResult[], 
    config?: SequencePatternAnalyzerConfig
  ): SequencePatternScore[] {
    const windowSize = config?.slidingWindowSize ?? 3;
    const minRecurrenceThreshold = config?.minRecurrenceThreshold ?? 0.5; // continuous
    const maxNumber = config?.maxNumber ?? 90;

    // 1. Isolate history strictly for this draw type (TIRAGE ISOLATION RULE)
    const isolatedHistory = !drawName ? history.slice() : purifyHistoryForDraw(drawName, history);
    const chronologicalHistory = [...isolatedHistory].reverse();
    const totalDraws = chronologicalHistory.length;

    const gapSequences: Record<number, number[]> = {};
    const lastSeenIndex: Record<number, number> = {};

    for (let i = 1; i <= maxNumber; i++) {
      gapSequences[i] = [];
      lastSeenIndex[i] = -1;
    }

    // 2. Extract gap sequences chronologically
    chronologicalHistory.forEach((draw, index) => {
      const gagnants = draw.gagnants || [];
      gagnants.forEach((num: number) => {
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

    const results: SequencePatternScore[] = [];

    // 3. Analyze patterns for each number
    for (let num = 1; num <= maxNumber; num++) {
      const seq = gapSequences[num];
      const lastIndex = lastSeenIndex[num];
      const currentGap = lastIndex !== -1 ? (totalDraws - 1 - lastIndex) : totalDraws;
      
      if (seq.length < windowSize) {
        // Not enough data for sliding window pattern detection
        results.push({
          number: num,
          currentGap,
          recentSequence: seq,
          bestMatch: null,
          stochasticScore: 0
        });
        continue;
      }

      const recentSequence = seq.slice(-windowSize);
      
      let bestResonance = 0;
      let matchedFrequency = 0;
      let expectedNextGap = currentGap;
      
      let totalWeights = 0;
      let weightedNextGap = 0;

      for (let i = 0; i <= seq.length - windowSize - 1; i++) {
        const historicalWindow = seq.slice(i, i + windowSize);
        const historicalNextGap = seq[i + windowSize];
        
        let squaredDistance = 0;
        for (let j = 0; j < windowSize; j++) {
          squaredDistance += Math.pow(recentSequence[j] - historicalWindow[j], 2);
        }
        
        const meanGap = seq.reduce((a, b) => a + b, 0) / seq.length;
        const bandwidth = Math.max(1.0, meanGap / 2.0);
        const similarity = Math.exp(-squaredDistance / (2 * Math.pow(bandwidth, 2)));
        
        if (similarity > 0.05) {
          matchedFrequency += similarity;
          totalWeights += similarity;
          weightedNextGap += historicalNextGap * similarity;
        }
        
        if (similarity > bestResonance) {
          bestResonance = similarity;
        }
      }

      let bestMatch: PatternMatch | null = null;
      let score = 0;

      if (totalWeights >= minRecurrenceThreshold) {
        expectedNextGap = weightedNextGap / totalWeights;
        
        const gapVariance = seq.reduce((acc, val) => acc + Math.pow(val - (seq.reduce((a, b) => a + b, 0) / seq.length), 2), 0) / seq.length;
        const gapStd = Math.sqrt(gapVariance) || 1.0;
        
        const signalSpread = Math.max(1.0, gapStd);
        const continuousResonance = Math.exp(-Math.pow(currentGap - expectedNextGap, 2) / (2 * Math.pow(signalSpread, 2)));
        
        score = continuousResonance * 100.0;
        
        bestMatch = {
          pattern: recentSequence,
          nextExpectedGap: parseFloat(expectedNextGap.toFixed(2)),
          frequency: parseFloat(matchedFrequency.toFixed(2)),
          confidence: parseFloat((continuousResonance * 100.0).toFixed(2))
        };
      }

      results.push({
        number: num,
        currentGap,
        recentSequence,
        bestMatch,
        stochasticScore: parseFloat(score.toFixed(2))
      });
    }

    return results;
  }
}

export const sequencePatternAnalyzer = new SequencePatternAnalyzer();
