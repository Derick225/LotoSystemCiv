import { DrawResult } from '../types';
import { globalCache, CACHE_TTL } from './cache/CacheService';
import { purifyHistoryForDraw } from '../utils/arrayUtils';

export interface NumberFrequencyStat {
  number: number;
  count: number;
  percentage: number;
  expectedCount: number;
  zScore: number;
  regime: 'Chaud' | 'Froid' | 'Neutre';
}

export interface PairStat {
  pair: [number, number];
  count: number;
  expectedCount: number;
  zScore: number;
}

export interface TripletStat {
  triplet: [number, number, number];
  count: number;
  expectedCount: number;
  zScore: number;
}

export interface TransitionStat {
  number: number;
  nextNumbers: { number: number; count: number; percentage: number }[];
}

export interface AdvancedStatsReport {
  drawName: string;
  totalDraws: number;
  frequencies: NumberFrequencyStat[];
  topPairs: PairStat[];
  topTriplets: TripletStat[];
  transitions: TransitionStat[];
  averageRepeats: number;
  repeatsDistribution: Record<number, number>; // distribution of 0, 1, 2... repeat numbers
  consecutiveDrawsRate: number; // percentage of draws with at least one consecutive pair (e.g. 14 & 15)
}

const CACHE_PREFIX = 'nexus_advanced_stats_';

export const advancedStatsService = {
  /**
   * Calculates advanced statistics for a single isolated draw type.
   * Adheres strictly to the TIRAGE ISOLATION RULE.
   */
  async computeAdvancedStats(drawName: string, history: DrawResult[], forceRefresh = false): Promise<AdvancedStatsReport> {
    const activeDraw = drawName || "Reveil";
    const cacheKey = globalCache.generateKey('advanced_stats', activeDraw, `${history.length}`);

    if (!forceRefresh) {
      const cached = await globalCache.get<AdvancedStatsReport>(cacheKey, activeDraw);
      if (cached && cached.totalDraws === history.length) {
        return cached;
      }
    }

    return globalCache.getOrCompute<AdvancedStatsReport>(cacheKey, async () => {
      // Filter history to handle isolation and ensure order is chronological for transitions (oldest to newest)
      const filteredHistory = purifyHistoryForDraw(activeDraw, history);
      const n = filteredHistory.length;
      if (n === 0) {
        return this.emptyReport(activeDraw);
      }

      // Chronological order (oldest to newest)
      const chronological = [...filteredHistory].reverse();

      // 1. FREQUENCIES AND HYPERGEOMETRIC/BINOMIAL Z-SCORES
      const pSingle = 5 / 90;
      const expectedSingle = n * pSingle;
      const stdDevSingle = Math.max(Number.EPSILON, Math.sqrt(n * pSingle * (1 - pSingle)));

      const singleCounts = new Int32Array(91);
      for (let d = 0; d < n; d++) {
        const g = filteredHistory[d].gagnants;
        for (let i = 0; i < g.length; i++) {
          const num = g[i];
          if (num >= 1 && num <= 90) singleCounts[num]++;
        }
      }

      const frequencies: NumberFrequencyStat[] = [];
      for (let num = 1; num <= 90; num++) {
        const count = singleCounts[num];
        const percentage = n > 0 ? (count / n) * 100 : 0;
        const zScore = stdDevSingle > 0 ? (count - expectedSingle) / stdDevSingle : 0;
        let regime: 'Chaud' | 'Froid' | 'Neutre' = 'Neutre';
        if (zScore > 1.0) regime = 'Chaud';
        else if (zScore < -1.0) regime = 'Froid';

        frequencies.push({
          number: num,
          count,
          percentage: Number(percentage.toFixed(2)),
          expectedCount: Number(expectedSingle.toFixed(2)),
          zScore: Number(zScore.toFixed(3)),
          regime
        });
      }
      frequencies.sort((a, b) => b.count - a.count);

      // 2. PAIRS ANALYSIS - Clés numériques rapides (a * 100 + b) sans allocation de chaînes
      const pPair = 10 / 4005;
      const expectedPair = n * pPair;
      const stdDevPair = Math.max(Number.EPSILON, Math.sqrt(n * pPair * (1 - pPair)));

      const pairCounts = new Map<number, number>();
      for (let d = 0; d < n; d++) {
        const g = filteredHistory[d].gagnants;
        const len = g.length;
        for (let i = 0; i < len; i++) {
          const n1 = g[i];
          if (n1 < 1 || n1 > 90) continue;
          for (let j = i + 1; j < len; j++) {
            const n2 = g[j];
            if (n2 < 1 || n2 > 90) continue;
            const a = n1 < n2 ? n1 : n2;
            const b = n1 < n2 ? n2 : n1;
            const pairCode = a * 100 + b;
            pairCounts.set(pairCode, (pairCounts.get(pairCode) || 0) + 1);
          }
        }
      }

      const allPairs: PairStat[] = [];
      pairCounts.forEach((count, pairCode) => {
        const n1 = Math.floor(pairCode / 100);
        const n2 = pairCode % 100;
        const zScore = stdDevPair > 0 ? (count - expectedPair) / stdDevPair : 0;
        allPairs.push({
          pair: [n1, n2],
          count,
          expectedCount: Number(expectedPair.toFixed(2)),
          zScore: Number(zScore.toFixed(3))
        });
      });
      const topPairs = allPairs.sort((a, b) => b.count - a.count).slice(0, 30);

      // 3. TRIPLETS ANALYSIS - Clés numériques compactes (a * 10000 + b * 100 + c)
      const pTriplet = 10 / 117480;
      const expectedTriplet = n * pTriplet;
      const stdDevTriplet = Math.max(Number.EPSILON, Math.sqrt(n * pTriplet * (1 - pTriplet)));

      const tripletCounts = new Map<number, number>();
      for (let d = 0; d < n; d++) {
        const g = filteredHistory[d].gagnants;
        const len = g.length;
        for (let i = 0; i < len; i++) {
          const n1 = g[i];
          if (n1 < 1 || n1 > 90) continue;
          for (let j = i + 1; j < len; j++) {
            const n2 = g[j];
            if (n2 < 1 || n2 > 90) continue;
            for (let k = j + 1; k < len; k++) {
              const n3 = g[k];
              if (n3 < 1 || n3 > 90) continue;
              let a = n1, b = n2, c = n3;
              if (a > b) { const t = a; a = b; b = t; }
              if (b > c) { const t = b; b = c; c = t; }
              if (a > b) { const t = a; a = b; b = t; }
              const tripletCode = a * 10000 + b * 100 + c;
              tripletCounts.set(tripletCode, (tripletCounts.get(tripletCode) || 0) + 1);
            }
          }
        }
      }

      const allTriplets: TripletStat[] = [];
      tripletCounts.forEach((count, tripletCode) => {
        const c = tripletCode % 100;
        const rem = Math.floor(tripletCode / 100);
        const b = rem % 100;
        const a = Math.floor(rem / 100);
        const zScore = stdDevTriplet > 0 ? (count - expectedTriplet) / stdDevTriplet : 0;
        allTriplets.push({
          triplet: [a, b, c],
          count,
          expectedCount: Number(expectedTriplet.toFixed(4)),
          zScore: Number(zScore.toFixed(3))
        });
      });
      const topTriplets = allTriplets.sort((a, b) => b.count - a.count).slice(0, 30);

      // 4. TRANSITIONAL ANALYSIS / SEQUENCES ACROSS DRAWS (Markov transitions)
      // Pré-calcul O(N) des occurrences de source pour éliminer 16 millions d'itérations imbriquées
      const sourceOccurrences = new Int32Array(91);
      const transitionMatrix: Map<number, Record<number, number>> = new Map();
      for (let i = 1; i <= 90; i++) {
        transitionMatrix.set(i, {});
      }

      for (let k = 0; k < chronological.length - 1; k++) {
        const currentDraw = chronological[k].gagnants;
        const nextDraw = chronological[k + 1].gagnants;

        for (let ci = 0; ci < currentDraw.length; ci++) {
          const cNum = currentDraw[ci];
          if (cNum >= 1 && cNum <= 90) {
            sourceOccurrences[cNum]++;
            const row = transitionMatrix.get(cNum);
            if (row) {
              for (let ni = 0; ni < nextDraw.length; ni++) {
                const nNum = nextDraw[ni];
                row[nNum] = (row[nNum] || 0) + 1;
              }
            }
          }
        }
      }

      const transitions: TransitionStat[] = [];
      transitionMatrix.forEach((nextCounts, number) => {
        const totalOccurrencesWithFollower = sourceOccurrences[number];
        const sortedNext = Object.entries(nextCounts)
          .map(([numStr, count]) => {
            const next = Number(numStr);
            const percentage = totalOccurrencesWithFollower > 0 ? (count / totalOccurrencesWithFollower) * 100 : 0;
            return { number: next, count, percentage: Number(percentage.toFixed(2)) };
          })
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);

        transitions.push({
          number,
          nextNumbers: sortedNext
        });
      });

      // 5. DRAW-TO-DRAW REPEATS & CONSECUTIVELY DRAWN RUNS WITHIN SINGLE DRAW
      let totalRepeats = 0;
      const repeatsDistribution: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      
      for (let k = 1; k < chronological.length; k++) {
        const prev = chronological[k - 1].gagnants;
        const curr = chronological[k].gagnants;
        let repeatCount = 0;
        for (let i = 0; i < curr.length; i++) {
          if (prev.includes(curr[i])) repeatCount++;
        }
        totalRepeats += repeatCount;
        const clampedRepeat = Math.min(5, repeatCount);
        repeatsDistribution[clampedRepeat] = (repeatsDistribution[clampedRepeat] || 0) + 1;
      }
      const averageRepeats = chronological.length > 1 ? totalRepeats / (chronological.length - 1) : 0;

      // Inside same draw, consecutive numbers (e.g. 14 and 15 in same draw)
      let drawsWithConsecutiveSameDraw = 0;
      for (let d = 0; d < n; d++) {
        const g = filteredHistory[d].gagnants;
        let hasConsecutive = false;
        // Test d'adjacence O(1) avec Set pour éviter tout tri
        const setG = new Set(g);
        for (let i = 0; i < g.length; i++) {
          if (setG.has(g[i] + 1)) {
            hasConsecutive = true;
            break;
          }
        }
        if (hasConsecutive) {
          drawsWithConsecutiveSameDraw++;
        }
      }
      const consecutiveDrawsRate = n > 0 ? (drawsWithConsecutiveSameDraw / n) * 100 : 0;

      return {
        drawName,
        totalDraws: n,
        frequencies,
        topPairs,
        topTriplets,
        transitions,
        averageRepeats: Number(averageRepeats.toFixed(3)),
        repeatsDistribution,
        consecutiveDrawsRate: Number(consecutiveDrawsRate.toFixed(2))
      };
    }, CACHE_TTL.LONG, activeDraw);
  },

  emptyReport(drawName: string): AdvancedStatsReport {
    return {
      drawName,
      totalDraws: 0,
      frequencies: [],
      topPairs: [],
      topTriplets: [],
      transitions: [],
      averageRepeats: 0,
      repeatsDistribution: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      consecutiveDrawsRate: 0
    };
  }
};
