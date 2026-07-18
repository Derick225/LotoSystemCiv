import { AlgoKey } from '../../../shared/prediction.types';
import { AlgorithmPlugin, AlgorithmContext } from '../algorithmRegistry';
import { LOTTERY_CONSTANTS } from '../../lotteryService';

type HistoryDraw = {
  date: string;
  gagnants?: number[];
  machine?: number[];
};

type TwinCandidate = {
  draw: HistoryDraw;
  index: number;
  dayDistance: number;
  quality: number;
};

type InterMonthlyResonanceCache = {
  scores: Record<number, number>;
  median: number;
  iqr: number;
  twinDrawDate: string;
  twinIndex: number;
  twinQuality: number;
  periodsAnalyzed: number;
  matchedSourcePeriods: number;
  totalProjectedOccurrences: number;
  distinctProjectedNumbers: number;
  totalSignalMass: number;
  concentrationTop5: number;
  signalDetected: boolean;
};

const DEFAULT_CACHE: InterMonthlyResonanceCache = {
  scores: {},
  median: 0,
  iqr: 1,
  twinDrawDate: 'N/A',
  twinIndex: -1,
  twinQuality: 0,
  periodsAnalyzed: 0,
  matchedSourcePeriods: 0,
  totalProjectedOccurrences: 0,
  distinctProjectedNumbers: 0,
  totalSignalMass: 0,
  concentrationTop5: 0,
  signalDetected: false,
};

const clamp = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, v));

const logistic = (x: number): number => 1 / (1 + Math.exp(-x));

const safeArray = (arr: unknown): number[] =>
  Array.isArray(arr) ? arr.filter((n): n is number => Number.isInteger(n)) : [];

const uniqueValidNumbers = (arr: unknown): number[] => {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const n of safeArray(arr)) {
    if (n >= 1 && n <= LOTTERY_CONSTANTS.TOTAL_NUMBERS && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
};

const parseDateStrict = (dateStr: string): Date | null => {
  if (!dateStr || typeof dateStr !== 'string') return null;

  const trimmed = dateStr.trim();

  // DD/MM/YYYY
  const fr = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (fr) {
    const day = Number(fr[1]);
    const month = Number(fr[2]);
    const year = Number(fr[3]);
    const d = new Date(year, month - 1, day);
    if (
      d.getFullYear() === year &&
      d.getMonth() === month - 1 &&
      d.getDate() === day
    ) {
      return d;
    }
    return null;
  }

  // YYYY-MM-DD or full ISO
  const iso = new Date(trimmed);
  return Number.isNaN(iso.getTime()) ? null : iso;
};

const dayDistanceInMonth = (a: Date, b: Date): number =>
  Math.abs(a.getDate() - b.getDate());

const buildDrawNumberSet = (draw: HistoryDraw): Set<number> =>
  new Set([
    ...uniqueValidNumbers(draw.gagnants),
    ...uniqueValidNumbers(draw.machine),
  ]);

const findBestTwinDraw = (
  history: HistoryDraw[],
  currentDate: Date,
  yearsAgo: number,
  toleranceDays = 3
): TwinCandidate | null => {
  const targetMonth = currentDate.getMonth();
  const targetYear = currentDate.getFullYear() - yearsAgo;
  const candidates: TwinCandidate[] = [];

  for (let i = 1; i < history.length; i++) {
    const draw = history[i];
    const drawDate = parseDateStrict(draw.date);
    if (!drawDate) continue;

    if (
      drawDate.getFullYear() === targetYear &&
      drawDate.getMonth() === targetMonth
    ) {
      const dd = dayDistanceInMonth(drawDate, currentDate);
      if (dd <= toleranceDays) {
        const temporalQuality = 1 - dd / (toleranceDays + 1);
        const richness =
          (uniqueValidNumbers(draw.gagnants).length / 5) * 0.7 +
          (uniqueValidNumbers(draw.machine).length / 5) * 0.3;

        candidates.push({
          draw,
          index: i,
          dayDistance: dd,
          quality: clamp(0.6 * temporalQuality + 0.4 * richness, 0, 1),
        });
      }
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (b.quality !== a.quality) return b.quality - a.quality;
    if (a.dayDistance !== b.dayDistance) return a.dayDistance - b.dayDistance;
    return a.index - b.index;
  });

  return candidates[0];
};

const computeRobustStats = (scores: Record<number, number>) => {
  const values = Object.values(scores).sort((a, b) => a - b);
  if (values.length === 0) {
    return { median: 0, iqr: 1 };
  }

  const median = values[Math.floor(values.length / 2)] ?? 0;
  const q1 = values[Math.floor(values.length * 0.25)] ?? 0;
  const q3 = values[Math.floor(values.length * 0.75)] ?? 0;
  const iqr = Math.max(1e-6, q3 - q1);

  return { median, iqr };
};

const computeTop5Concentration = (scores: Record<number, number>): number => {
  const vals = Object.values(scores).filter((v) => v > 0).sort((a, b) => b - a);
  if (vals.length === 0) return 0;

  const total = vals.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;

  const top5 = vals.slice(0, 5).reduce((a, b) => a + b, 0);
  return top5 / total;
};

export const interMonthlyResonancePlugin: AlgorithmPlugin = {
  key: AlgoKey.INTER_MONTHLY_RESONANCE,
  category: 'advanced',
  stability: 'stable',
  mathematicalBasis:
    'Rétro-ingénierie temporelle et projection symétrique de périodes de couplage',
  description:
    "Analyse les périodes sources des couplets/triplets du tirage jumeau d'une année passée, puis projette ces distances sur l'historique actuel.",
  isStrictlyDeterministic: true,

  precompute(ctx: AlgorithmContext) {
    const history = (ctx.history || []) as HistoryDraw[];
    ctx.pluginCache = ctx.pluginCache || {};

    const cacheKey = AlgoKey.INTER_MONTHLY_RESONANCE;

    const emptyScores: Record<number, number> = {};
    for (let i = 1; i <= LOTTERY_CONSTANTS.TOTAL_NUMBERS; i++) {
      emptyScores[i] = 0;
    }

    const defaultCache: InterMonthlyResonanceCache = {
      ...DEFAULT_CACHE,
      scores: emptyScores,
    };

    if (history.length < 30) {
      ctx.pluginCache[cacheKey] = defaultCache;
      return;
    }

    const currentDraw = history[0];
    const currentDate = parseDateStrict(currentDraw?.date || '');
    if (!currentDate) {
      ctx.pluginCache[cacheKey] = defaultCache;
      return;
    }

    let twinRes =
      findBestTwinDraw(history, currentDate, 1) ||
      findBestTwinDraw(history, currentDate, 2);

    if (!twinRes) {
      ctx.pluginCache[cacheKey] = defaultCache;
      return;
    }

    const twinNumbers = buildDrawNumberSet(twinRes.draw);
    if (twinNumbers.size < 3) {
      ctx.pluginCache[cacheKey] = defaultCache;
      return;
    }

    let hurst = Number(ctx.statisticalBounds?.hurstExponent);
    if (!Number.isFinite(hurst)) hurst = 0.5;
    hurst = clamp(hurst, 0.1, 0.9);

    const decayGamma = 0.05 / (hurst * 2);
    const rawScores: Record<number, number> = {};
    for (let i = 1; i <= LOTTERY_CONSTANTS.TOTAL_NUMBERS; i++) {
      rawScores[i] = 0;
    }

    let periodsAnalyzed = 0;
    let matchedSourcePeriods = 0;
    let totalProjectedOccurrences = 0;
    let totalSignalMass = 0;
    const distinctProjected = new Set<number>();

    const maxLookback = Math.min(150, history.length - twinRes.index - 1);

    for (let k = 1; k <= maxLookback; k++) {
      const historicalSource = history[twinRes.index + k];
      const projectedCurrent = history[k];
      if (!historicalSource || !projectedCurrent) continue;

      periodsAnalyzed++;

      const sourceNumbers = [
        ...uniqueValidNumbers(historicalSource.gagnants),
        ...uniqueValidNumbers(historicalSource.machine),
      ];

      const overlapCount = sourceNumbers.filter((n) => twinNumbers.has(n)).length;
      if (overlapCount < 2) continue;

      matchedSourcePeriods++;

      const sourceStrength = overlapCount / Math.max(1, twinNumbers.size);
      const combinationWeight = Math.pow(overlapCount, 1.8);
      const timeAmortization = Math.exp(-decayGamma * k);

      const twinQualityBoost = 0.75 + twinRes.quality * 0.5;
      const periodWeight =
        combinationWeight * timeAmortization * twinQualityBoost * (0.5 + sourceStrength);

      const projectedWinners = uniqueValidNumbers(projectedCurrent.gagnants);
      const projectedMachine = uniqueValidNumbers(projectedCurrent.machine);

      for (const num of projectedWinners) {
        rawScores[num] += periodWeight;
        totalProjectedOccurrences++;
        totalSignalMass += periodWeight;
        distinctProjected.add(num);
      }

      for (const num of projectedMachine) {
        rawScores[num] += periodWeight * 0.45;
        totalProjectedOccurrences++;
        totalSignalMass += periodWeight * 0.45;
        distinctProjected.add(num);
      }
    }

    const { median, iqr } = computeRobustStats(rawScores);
    const concentrationTop5 = computeTop5Concentration(rawScores);
    const signalDetected = matchedSourcePeriods > 0 && totalSignalMass > 0;

    ctx.pluginCache[cacheKey] = {
      scores: rawScores,
      median,
      iqr,
      twinDrawDate: twinRes.draw.date,
      twinIndex: twinRes.index,
      twinQuality: twinRes.quality,
      periodsAnalyzed,
      matchedSourcePeriods,
      totalProjectedOccurrences,
      distinctProjectedNumbers: distinctProjected.size,
      totalSignalMass,
      concentrationTop5,
      signalDetected,
    };
  },

  evaluate(num: number, ctx: AlgorithmContext) {
    const cacheKey = AlgoKey.INTER_MONTHLY_RESONANCE;

    if (!ctx.pluginCache?.[cacheKey]) {
      this.precompute(ctx);
    }

    const cache = ctx.pluginCache?.[cacheKey] as InterMonthlyResonanceCache | undefined;
    if (!cache) {
      return {
        score: 0,
        confidence: 0.5,
        metadata: {
          rawVal: 0,
          twinDrawDate: 'N/A',
          periodsAnalyzed: 0,
          matchedSourcePeriods: 0,
          totalProjectedNumbers: 0,
          signalDetected: false,
        },
      };
    }

    const rawVal = Number.isFinite(cache.scores[num]) ? cache.scores[num] : 0;
    const median = Number.isFinite(cache.median) ? cache.median : 0;
    const iqr = Number.isFinite(cache.iqr) && cache.iqr > 1e-9 ? cache.iqr : 1;

    let score = 0;

    if (cache.signalDetected) {
      const zRobust = (rawVal - median) / iqr;
      const centered = logistic(zRobust * 1.35);
      score = clamp(centered * 100, 0, 100);

      // Si le score brut est quasi nul, éviter un faux neutre à 50
      if (rawVal <= 1e-9) {
        score *= 0.35;
      }
    }

    const evidenceFactor = logistic((cache.matchedSourcePeriods - 3) * 0.8);
    const twinFactor = clamp(cache.twinQuality, 0, 1);
    const massFactor = logistic((cache.totalSignalMass - 8) / 4);
    const concentrationPenalty = clamp(
      1 - Math.max(0, cache.concentrationTop5 - 0.72) * 1.4,
      0.45,
      1
    );

    const confidenceRaw =
      0.15 +
      0.35 * evidenceFactor +
      0.20 * twinFactor +
      0.20 * massFactor +
      0.10 * concentrationPenalty;

    const confidence = clamp(confidenceRaw, 0.2, 0.95);

    return {
      score: Number.isFinite(score) ? score : 0,
      confidence: Number.isFinite(confidence) ? confidence : 0.5,
      metadata: {
        rawVal,
        twinDrawDate: cache.twinDrawDate,
        twinIndex: cache.twinIndex,
        twinQuality: cache.twinQuality,
        periodsAnalyzed: cache.periodsAnalyzed,
        matchedSourcePeriods: cache.matchedSourcePeriods,
        totalProjectedNumbers: cache.totalProjectedOccurrences,
        distinctProjectedNumbers: cache.distinctProjectedNumbers,
        totalSignalMass: cache.totalSignalMass,
        concentrationTop5: cache.concentrationTop5,
        signalDetected: cache.signalDetected,
      },
    };
  },
};
