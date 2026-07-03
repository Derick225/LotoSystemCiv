import { DrawResult } from '../types';
import { get, set } from 'idb-keyval';

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
    const cacheKey = `${CACHE_PREFIX}${drawName}`;

    if (!forceRefresh) {
      try {
        const cached = await get(cacheKey);
        if (cached) {
          const parsed = typeof cached === 'string' ? JSON.parse(cached) : cached;
          if (parsed && parsed.totalDraws === history.length) {
            return parsed;
          }
        }
      } catch (e) {
        console.warn('[AdvancedStats] Cache read error, recalculating...', e);
      }
    }

    // Filter history to handle isolation and ensure order is chronological for transitions (oldest to newest)
    const filteredHistory = history
      .filter(d => !drawName || drawName === 'ALL' || d.drawName === drawName)
      // Sort oldest to newest (index history.length - 1 down to 0, or check dates)
      // Let's assume the input history is sorted newest to oldest. We reverse a copy for sequential transitions.
      .slice();
    
    // Total draws for this specific game
    const n = filteredHistory.length;
    if (n === 0) {
      return this.emptyReport(drawName);
    }

    // CHRONOLOGICAL order makes sequential transitions much easier to calculate
    // We reverse the copy of the history (original is newest to oldest)
    const chronological = [...filteredHistory].reverse();

    // 1. FREQUENCIES AND HYPERGEOMETRIC/BINOMIAL Z-SCORES
    const pSingle = 5 / 90; // Probability of any specific number being in a 5/90 draw
    const expectedSingle = n * pSingle;
    const stdDevSingle = Math.sqrt(n * pSingle * (1 - pSingle));

    const singleCounts: Record<number, number> = {};
    for (let i = 1; i <= 90; i++) {
      singleCounts[i] = 0;
    }

    filteredHistory.forEach(draw => {
      draw.gagnants.forEach(num => {
        if (num >= 1 && num <= 90) {
          singleCounts[num] = (singleCounts[num] || 0) + 1;
        }
      });
    });

    const frequencies: NumberFrequencyStat[] = Object.entries(singleCounts).map(([numStr, count]) => {
      const number = Number(numStr);
      const percentage = n > 0 ? (count / n) * 100 : 0;
      const zScore = stdDevSingle > 0 ? (count - expectedSingle) / stdDevSingle : 0;
      let regime: 'Chaud' | 'Froid' | 'Neutre' = 'Neutre';
      if (zScore > 1.0) regime = 'Chaud';
      else if (zScore < -1.0) regime = 'Froid';

      return {
        number,
        count,
        percentage: Number(percentage.toFixed(2)),
        expectedCount: Number(expectedSingle.toFixed(2)),
        zScore: Number(zScore.toFixed(3)),
        regime
      };
    }).sort((a, b) => b.count - a.count);

    // 2. PAIRS ANALYSIS (Combinations of 2 numbers)
    // There are 90 * 89 / 2 = 4005 possible pairs.
    // Probability of a specific pair appearing in a 5/90 draw:
    // P = C(5, 2) / C(90, 2) = 10 / 4005 = 0.0024968789
    const pPair = 10 / 4005;
    const expectedPair = n * pPair;
    const stdDevPair = Math.sqrt(n * pPair * (1 - pPair));

    const pairCounts: Map<string, number> = new Map();

    filteredHistory.forEach(draw => {
      const nums = [...draw.gagnants].sort((a, b) => a - b);
      for (let i = 0; i < nums.length; i++) {
        for (let j = i + 1; j < nums.length; j++) {
          const key = `${nums[i]}-${nums[j]}`;
          pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
        }
      }
    });

    const allPairs: PairStat[] = [];
    pairCounts.forEach((count, key) => {
      const [n1, n2] = key.split('-').map(Number);
      const zScore = stdDevPair > 0 ? (count - expectedPair) / stdDevPair : 0;
      allPairs.push({
        pair: [n1, n2],
        count,
        expectedCount: Number(expectedPair.toFixed(2)),
        zScore: Number(zScore.toFixed(3))
      });
    });
    const topPairs = allPairs.sort((a, b) => b.count - a.count).slice(0, 30);

    // 3. TRIPLETS ANALYSIS (Combinations of 3 numbers)
    // There are 90 * 89 * 88 / 6 = 117,480 possible triplets.
    // Probability of a specific triplet appearing in a 5/90 draw:
    // P = C(5, 3) / C(90, 3) = 10 / 117480 = 0.0000851208
    const pTriplet = 10 / 117480;
    const expectedTriplet = n * pTriplet;
    const stdDevTriplet = Math.sqrt(n * pTriplet * (1 - pTriplet));

    const tripletCounts: Map<string, number> = new Map();

    filteredHistory.forEach(draw => {
      const nums = [...draw.gagnants].sort((a, b) => a - b);
      for (let i = 0; i < nums.length; i++) {
        for (let j = i + 1; j < nums.length; j++) {
          for (let k = j + 1; k < nums.length; k++) {
            const key = `${nums[i]}-${nums[j]}-${nums[k]}`;
            tripletCounts.set(key, (tripletCounts.get(key) || 0) + 1);
          }
        }
      }
    });

    const allTriplets: TripletStat[] = [];
    tripletCounts.forEach((count, key) => {
      const [n1, n2, n3] = key.split('-').map(Number);
      const zScore = stdDevTriplet > 0 ? (count - expectedTriplet) / stdDevTriplet : 0;
      allTriplets.push({
        triplet: [n1, n2, n3],
        count,
        expectedCount: Number(expectedTriplet.toFixed(4)),
        zScore: Number(zScore.toFixed(3))
      });
    });
    const topTriplets = allTriplets.sort((a, b) => b.count - a.count).slice(0, 30);

    // 4. TRANSITIONAL ANALYSIS / SEQUENCES ACROSS DRAWS (Markov transitions)
    // How often is number X in draw t followed by numbers in draw t+1?
    const transitionMatrix: Map<number, Record<number, number>> = new Map();
    for (let i = 1; i <= 90; i++) {
      transitionMatrix.set(i, {});
    }

    for (let k = 0; k < chronological.length - 1; k++) {
      const currentDraw = chronological[k].gagnants;
      const nextDraw = chronological[k + 1].gagnants;

      currentDraw.forEach(cNum => {
        const row = transitionMatrix.get(cNum);
        if (row) {
          nextDraw.forEach(nNum => {
            row[nNum] = (row[nNum] || 0) + 1;
          });
        }
      });
    }

    const transitions: TransitionStat[] = [];
    transitionMatrix.forEach((nextCounts, number) => {
      const sortedNext = Object.entries(nextCounts)
        .map(([numStr, count]) => {
          const next = Number(numStr);
          // Total appearances of 'number' in transitions (which is count * 5 in general, but specifically matches times 'number' was a source)
          const totalOccurrencesWithFollower = chronological.filter((d, idx) => idx < chronological.length - 1 && d.gagnants.includes(number)).length;
          const percentage = totalOccurrencesWithFollower > 0 ? (count / totalOccurrencesWithFollower) * 100 : 0;
          return { number: next, count, percentage: Number(percentage.toFixed(2)) };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 5); // Keep top 5 transition targets

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
      const intersection = curr.filter(x => prev.includes(x));
      const repeatCount = intersection.length;
      totalRepeats += repeatCount;
      repeatsDistribution[repeatCount] = (repeatsDistribution[repeatCount] || 0) + 1;
    }
    const averageRepeats = chronological.length > 1 ? totalRepeats / (chronological.length - 1) : 0;

    // Inside same draw, consecutive numbers (e.g. 14 and 15 in same draw)
    let drawsWithConsecutiveSameDraw = 0;
    filteredHistory.forEach(draw => {
      const sorted = [...draw.gagnants].sort((a, b) => a - b);
      let hasConsecutive = false;
      for (let i = 0; i < sorted.length - 1; i++) {
        if (sorted[i + 1] - sorted[i] === 1) {
          hasConsecutive = true;
          break;
        }
      }
      if (hasConsecutive) {
        drawsWithConsecutiveSameDraw++;
      }
    });
    const consecutiveDrawsRate = n > 0 ? (drawsWithConsecutiveSameDraw / n) * 100 : 0;

    const report: AdvancedStatsReport = {
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

    try {
      await set(cacheKey, JSON.stringify(report));
    } catch (e) {
      console.warn('[AdvancedStats] Cache write error', e);
    }

    return report;
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
