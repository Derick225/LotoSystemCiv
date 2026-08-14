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
  yearsAgo: number;
  dayDistance: number;
  quality: number;
};

type InterMonthlyResonanceCache = {
  scores: Record<number, number>; // Sieved scores passed through active algorithmic DNA
  rawScores: Record<number, number>; // Unsieved raw temporal projections
  dnaMultipliers: Record<number, number>; // DNA sieve continuous multipliers
  dnaAffinity: Record<number, number>; // Normalized DNA compatibility percentage
  median: number;
  mad: number;
  iqr: number;
  topTwinDate: string;
  topTwinIndex: number;
  topTwinQuality: number;
  activeTwinsCount: number;
  periodsAnalyzed: number;
  matchedSourcePeriods: number;
  totalProjectedOccurrences: number;
  distinctProjectedNumbers: number;
  totalSignalMass: number;
  concentrationTop5: number;
  signalDetected: boolean;
  dnaSieveActive: boolean;
};

const DEFAULT_CACHE: InterMonthlyResonanceCache = {
  scores: {},
  rawScores: {},
  dnaMultipliers: {},
  dnaAffinity: {},
  median: 0,
  mad: 1,
  iqr: 1,
  topTwinDate: 'N/A',
  topTwinIndex: -1,
  topTwinQuality: 0,
  activeTwinsCount: 0,
  periodsAnalyzed: 0,
  matchedSourcePeriods: 0,
  totalProjectedOccurrences: 0,
  distinctProjectedNumbers: 0,
  totalSignalMass: 0,
  concentrationTop5: 0,
  signalDetected: false,
  dnaSieveActive: false,
};

const clamp = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, v));

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

/**
 * Calculates continuous DNA compatibility signal for each candidate number.
 * Sifts numbers through the active algorithmic DNA (current weights & feature matrices).
 */
const computeDnaSieveSignal = (ctx: AlgorithmContext): { rawDna: Float64Array; multipliers: Float64Array; affinityPercent: Float64Array } => {
  const rawDna = new Float64Array(LOTTERY_CONSTANTS.TOTAL_NUMBERS + 1);
  const multipliers = new Float64Array(LOTTERY_CONSTANTS.TOTAL_NUMBERS + 1);
  const affinityPercent = new Float64Array(LOTTERY_CONSTANTS.TOTAL_NUMBERS + 1);
  const weights = (ctx.weights || ctx.algoWeights || {}) as Record<string, number>;
  const features = ctx.features;

  if (!features) {
    multipliers.fill(1.0);
    affinityPercent.fill(50.0);
    return { rawDna, multipliers, affinityPercent };
  }

  const maxFreq = Math.max(1, ctx.maxFreq || 1);
  const maxMarkov = Math.max(0.001, ctx.maxMarkov || 0.001);
  const maxMachine = Math.max(0.001, ctx.maxMachineTransfer || 0.001);

  // Active genome weights with uniform minimum
  const wFreq = Math.max(0.001, weights[AlgoKey.FREQUENCY] ?? 1.0);
  const wMarkov = Math.max(0.001, weights[AlgoKey.MARKOV] ?? 1.0);
  const wMomentum = Math.max(0.001, weights[AlgoKey.MOMENTUM] ?? 1.0);
  const wMachine = Math.max(0.001, (weights as Record<string, number>).machine_bias ?? weights[AlgoKey.BAYES] ?? 1.0);
  const wGaps = Math.max(0.001, weights[AlgoKey.GAPS] ?? 1.0);
  const wAffinity = Math.max(0.001, weights[AlgoKey.AFFINITY] ?? 1.0);
  const wSpectral = Math.max(0.001, weights[AlgoKey.SPECTRAL] ?? 1.0);

  const totalW = wFreq + wMarkov + wMomentum + wMachine + wGaps + wAffinity + wSpectral;

  let sumDna = 0;
  for (let n = 1; n <= LOTTERY_CONSTANTS.TOTAL_NUMBERS; n++) {
    const sFreq = (features.freqMap?.[n] ?? 0) / maxFreq;
    const sMarkov = (features.markovMap?.[n] ?? 0) / maxMarkov;
    const sMachine = (features.machineTransferMap?.[n] ?? 0) / maxMachine;
    const rawMom = features.momentumMap?.[n] ?? 0;
    const sMomentum = 1.0 / (1.0 + Math.exp(-rawMom));
    const gapVal = features.gapsMap?.[n] ?? 0;
    const sGap = Math.exp(-gapVal / 18.0);
    const sAffinity = features.shadowProbabilityMap?.[n] ?? 0;
    const sSpectral = features.networkCorrelationMap?.[n] ?? 0;

    const weightedComposite =
      (wFreq * sFreq +
        wMarkov * sMarkov +
        wMomentum * sMomentum +
        wMachine * sMachine +
        wGaps * sGap +
        wAffinity * sAffinity +
        wSpectral * sSpectral) /
      totalW;

    rawDna[n] = weightedComposite;
    sumDna += weightedComposite;
  }

  const meanDna = sumDna / LOTTERY_CONSTANTS.TOTAL_NUMBERS;
  let varDna = 0;
  for (let n = 1; n <= LOTTERY_CONSTANTS.TOTAL_NUMBERS; n++) {
    varDna += Math.pow(rawDna[n] - meanDna, 2);
  }
  const stdDevDna = Math.sqrt(varDna / LOTTERY_CONSTANTS.TOTAL_NUMBERS) || 1e-6;

  for (let n = 1; n <= LOTTERY_CONSTANTS.TOTAL_NUMBERS; n++) {
    const zDna = (rawDna[n] - meanDna) / stdDevDna;
    // Continuous differential sieve function centered at 1.0 in range [0.1, 1.9]
    const sieveMultiplier = 2.0 / (1.0 + Math.exp(-1.1 * zDna));
    multipliers[n] = clamp(sieveMultiplier, 0.1, 1.9);
    // Continuous compatibility percentage in [0, 100]
    affinityPercent[n] = clamp((1.0 / (1.0 + Math.exp(-1.5 * zDna))) * 100, 0, 100);
  }

  return { rawDna, multipliers, affinityPercent };
};

const parseDateStrict = (dateStr: string): Date | null => {
  if (!dateStr || typeof dateStr !== 'string') return null;

  const trimmed = dateStr.trim();

  // DD/MM/YYYY format
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

/**
 * Computes day of year (1-366).
 */
const getDayOfYear = (d: Date): number => {
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = d.getTime() - start.getTime() + (start.getTimezoneOffset() - d.getTimezoneOffset()) * 60 * 1000;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};

/**
 * Converts date to circular seasonal phase angle theta in [0, 2*pi).
 */
const getSeasonalAngle = (d: Date): number => {
  const doy = getDayOfYear(d);
  return (2.0 * Math.PI * doy) / 365.25;
};

/**
 * Calculates circular distance between two angles in [0, 2*pi).
 */
const getCircularAngleDistance = (a1: number, a2: number): number => {
  const diff = Math.abs(a1 - a2) % (2.0 * Math.PI);
  return Math.min(diff, 2.0 * Math.PI - diff);
};

// Continuous Gaussian circular seasonal resonance (sigma = ~14 days in radians)
const SIGMA_SEASONAL_RAD = (2.0 * Math.PI * 14.0) / 365.25;

/**
 * Calculates continuous seasonal resonance combining circular phase & day-of-week harmonic alignment.
 */
const calculateSeasonalResonance = (targetDate: Date, drawDate: Date): number => {
  const a1 = getSeasonalAngle(targetDate);
  const a2 = getSeasonalAngle(drawDate);
  const distAngle = getCircularAngleDistance(a1, a2);
  const seasonalWeight = Math.exp(-0.5 * Math.pow(distAngle / SIGMA_SEASONAL_RAD, 2));

  // Day of week harmonic alignment (0..6)
  const dowDiff = Math.abs(targetDate.getDay() - drawDate.getDay());
  const dowWeight = Math.pow(Math.cos((Math.PI * dowDiff) / 7.0), 2);

  return seasonalWeight * (0.7 + 0.3 * dowWeight);
};

const buildDrawNumberSet = (draw: HistoryDraw): Set<number> =>
  new Set([
    ...uniqueValidNumbers(draw.gagnants),
    ...uniqueValidNumbers(draw.machine),
  ]);

/**
 * Finds all historical twin draws corresponding to the same calendar period in prior years.
 * Uses continuous Gaussian spatio-temporal resonance scoring (zero magic binary cutoffs).
 */
const findTwinDrawCandidates = (
  history: HistoryDraw[],
  currentDate: Date,
  maxYearsToScan: number,
  hurst: number
): TwinCandidate[] => {
  const currentYear = currentDate.getFullYear();
  const candidates: TwinCandidate[] = [];

  // Half-life scale derived dynamically from Hurst persistence
  const lambdaYear = 3.0 + 4.0 * clamp(hurst, 0.1, 0.9);

  for (let i = 1; i < history.length; i++) {
    const draw = history[i];
    const drawDate = parseDateStrict(draw.date);
    if (!drawDate) continue;

    const yearDiff = currentYear - drawDate.getFullYear();
    if (yearDiff < 1 || yearDiff > maxYearsToScan) continue;

    // Continuous seasonal resonance (no hard binary cuts)
    const seasonalRes = calculateSeasonalResonance(currentDate, drawDate);
    const yearDecay = Math.exp(-yearDiff / lambdaYear);

    // Number richness (density of complete draw records)
    const gagnantsCount = uniqueValidNumbers(draw.gagnants).length;
    const machineCount = uniqueValidNumbers(draw.machine).length;
    const richness = (gagnantsCount / 5.0) * 0.7 + (machineCount / 5.0) * 0.3;

    const quality = clamp(seasonalRes * yearDecay * (0.5 + 0.5 * richness), 0.0, 1.0);

    if (quality > 0.01) {
      const dayDistance = Math.abs(currentDate.getDate() - drawDate.getDate());
      candidates.push({
        draw,
        index: i,
        yearsAgo: yearDiff,
        dayDistance,
        quality,
      });
    }
  }

  // Sort candidates by descending quality
  candidates.sort((a, b) => b.quality - a.quality);

  return candidates;
};

/**
 * Computes robust statistics (Median, IQR, and MAD) for score normalization.
 */
const computeRobustStats = (scores: Record<number, number>) => {
  const values = Object.values(scores).sort((a, b) => a - b);
  const n = values.length;
  if (n === 0) {
    return { median: 0, iqr: 1, mad: 1 };
  }

  const median = values[Math.floor(n / 2)] ?? 0;
  const q1 = values[Math.floor(n * 0.25)] ?? 0;
  const q3 = values[Math.floor(n * 0.75)] ?? 0;
  const iqr = Math.max(1e-6, q3 - q1);

  const absDeviations = values.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
  const mad = Math.max(1e-6, absDeviations[Math.floor(n / 2)] ?? 0);

  return { median, iqr, mad };
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
    'Rétro-ingénierie temporelle multi-annuelle et projection symétrique de résonance gaussienne',
  description:
    "Détecte les tirages jumeaux des années passées (même période calendaire), analyse la dynamique de leurs sous-ensembles de numéros, puis projette la résonance inter-mensuelle sur l'historique récent.",
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

    if (history.length < 20) {
      ctx.pluginCache[cacheKey] = defaultCache;
      return;
    }

    const currentDraw = history[0];
    const currentDate = parseDateStrict(currentDraw?.date || '');
    if (!currentDate) {
      ctx.pluginCache[cacheKey] = defaultCache;
      return;
    }

    let hurst = Number(ctx.statisticalBounds?.hurstExponent);
    if (!Number.isFinite(hurst)) hurst = 0.5;
    hurst = clamp(hurst, 0.1, 0.9);

    // Dynamic scan depth based on total available history
    const maxYearsToScan = Math.max(1, Math.min(10, Math.floor(history.length / 52)));
    const twinCandidates = findTwinDrawCandidates(history, currentDate, maxYearsToScan, hurst);

    if (twinCandidates.length === 0) {
      ctx.pluginCache[cacheKey] = defaultCache;
      return;
    }

    // Select top multi-year twin draws adaptively derived from Hurst persistence
    const maxActiveTwins = Math.max(2, Math.min(10, Math.round(5 * (1.0 + (hurst - 0.5)))));
    const activeTwins = twinCandidates.slice(0, maxActiveTwins);
    const topTwin = activeTwins[0];

    // Continuous damping gamma derived from Hurst persistence
    const decayGamma = 0.05 / (hurst * 2.0);

    const rawScores: Record<number, number> = {};
    for (let i = 1; i <= LOTTERY_CONSTANTS.TOTAL_NUMBERS; i++) {
      rawScores[i] = 0;
    }

    let periodsAnalyzed = 0;
    let matchedSourcePeriods = 0;
    let totalProjectedOccurrences = 0;
    let totalSignalMass = 0;
    const distinctProjected = new Set<number>();

    // Scan lookback window from twin indices
    for (const twinRes of activeTwins) {
      const twinNumbers = buildDrawNumberSet(twinRes.draw);
      if (twinNumbers.size < 3) continue;

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

        // Continuous combination weight activation via logistic curve (centered at 2 overlaps)
        const combinationActivation = 1.0 / (1.0 + Math.exp(-2.5 * (overlapCount - 1.5)));
        if (combinationActivation < 0.1) continue;

        matchedSourcePeriods++;

        const sourceStrength = overlapCount / Math.max(1, twinNumbers.size);
        const timeAmortization = Math.exp(-decayGamma * k);

        // Period weight continuous product
        const periodWeight =
          combinationActivation *
          timeAmortization *
          twinRes.quality *
          (0.5 + sourceStrength);

        const projectedWinners = uniqueValidNumbers(projectedCurrent.gagnants);
        const projectedMachine = uniqueValidNumbers(projectedCurrent.machine);

        for (const num of projectedWinners) {
          rawScores[num] += periodWeight;
          totalProjectedOccurrences++;
          totalSignalMass += periodWeight;
          distinctProjected.add(num);
        }

        // Machine numbers weighted proportional to winning ratio (5 winners / 5 machine = 0.5)
        const machineRatio = projectedWinners.length > 0 ? 0.5 : 0.0;
        for (const num of projectedMachine) {
          rawScores[num] += periodWeight * machineRatio;
          totalProjectedOccurrences++;
          totalSignalMass += periodWeight * machineRatio;
          distinctProjected.add(num);
        }
      }
    }

    // --- APPLICATION DU TAMIS DE L'ADN ALGORITHMIQUE DU MOMENT ---
    const { multipliers: dnaMultipliers, affinityPercent: dnaAffinity } = computeDnaSieveSignal(ctx);

    const sievedScores: Record<number, number> = {};
    const dnaMultipliersRecord: Record<number, number> = {};
    const dnaAffinityRecord: Record<number, number> = {};

    for (let i = 1; i <= LOTTERY_CONSTANTS.TOTAL_NUMBERS; i++) {
      const raw = rawScores[i] || 0;
      const mult = dnaMultipliers[i] || 1.0;
      const aff = dnaAffinity[i] || 50.0;

      dnaMultipliersRecord[i] = mult;
      dnaAffinityRecord[i] = aff;

      // Tamisage continu : combinaison différentiable de la projection mensuelle et de l'ADN actif
      // Modulation douce : 30% d'inertie brute temporelle + 70% de modulation par le tamis d'ADN
      sievedScores[i] = raw * (0.30 + 0.70 * mult);
    }

    const { median, iqr, mad } = computeRobustStats(sievedScores);
    const concentrationTop5 = computeTop5Concentration(sievedScores);
    const signalDetected = matchedSourcePeriods > 0 && totalSignalMass > 0;

    ctx.pluginCache[cacheKey] = {
      scores: sievedScores,
      rawScores,
      dnaMultipliers: dnaMultipliersRecord,
      dnaAffinity: dnaAffinityRecord,
      median,
      mad,
      iqr,
      topTwinDate: topTwin.draw.date,
      topTwinIndex: topTwin.index,
      topTwinQuality: topTwin.quality,
      activeTwinsCount: activeTwins.length,
      periodsAnalyzed,
      matchedSourcePeriods,
      totalProjectedOccurrences,
      distinctProjectedNumbers: distinctProjected.size,
      totalSignalMass,
      concentrationTop5,
      signalDetected,
      dnaSieveActive: true,
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
        score: 50,
        confidence: 0.5,
        metadata: {
          rawVal: 0,
          sievedVal: 0,
          dnaMultiplier: 1.0,
          dnaAffinity: 50.0,
          topTwinDate: 'N/A',
          periodsAnalyzed: 0,
          matchedSourcePeriods: 0,
          totalProjectedNumbers: 0,
          signalDetected: false,
          dnaSieveActive: false,
        },
      };
    }

    const sievedVal = Number.isFinite(cache.scores[num]) ? cache.scores[num] : 0;
    const rawVal = Number.isFinite(cache.rawScores[num]) ? cache.rawScores[num] : sievedVal;
    const dnaMult = Number.isFinite(cache.dnaMultipliers[num]) ? cache.dnaMultipliers[num] : 1.0;
    const dnaAff = Number.isFinite(cache.dnaAffinity[num]) ? cache.dnaAffinity[num] : 50.0;
    const median = Number.isFinite(cache.median) ? cache.median : 0;

    // Normalization scale using robust estimator: 1.4826 * MAD or IQR
    const robustScale = Math.max(1e-6, 1.4826 * cache.mad);

    let score = 50.0;

    if (cache.signalDetected) {
      // Z-score relative to robust median and MAD of sieved distribution
      const zRobust = (sievedVal - median) / robustScale;

      // Hurst-informed slope tuning
      let hurst = Number(ctx.statisticalBounds?.hurstExponent);
      if (!Number.isFinite(hurst)) hurst = 0.5;
      const slope = 1.0 + clamp(hurst, 0.1, 0.9) * 2.0;

      // Continuous sigmoid transformation mapped to [0, 100]
      score = 100.0 / (1.0 + Math.exp(-slope * zRobust));
    }

    score = clamp(score, 0.0, 100.0);

    // Continuous confidence derivation enriched by DNA compatibility
    const evidenceRatio =
      cache.periodsAnalyzed > 0
        ? cache.matchedSourcePeriods / (cache.matchedSourcePeriods + Math.sqrt(cache.periodsAnalyzed) + 1)
        : 0;

    const twinQualityTerm = clamp(cache.topTwinQuality, 0, 1);
    const signalMassTerm = 1.0 / (1.0 + Math.exp(-0.2 * (cache.totalSignalMass - 5.0)));
    const concentrationPenalty = clamp(
      1.0 - Math.max(0, cache.concentrationTop5 - 0.70) * 1.5,
      0.4,
      1.0
    );
    const dnaSieveConfidenceBonus = clamp((dnaMult - 0.5) / 1.5, 0.0, 0.2);

    const confidenceRaw =
      0.15 +
      0.25 * evidenceRatio +
      0.25 * twinQualityTerm +
      0.15 * signalMassTerm +
      0.10 * concentrationPenalty +
      0.10 * (dnaAff / 100.0) +
      dnaSieveConfidenceBonus;

    const confidence = clamp(confidenceRaw, 0.2, 0.95);

    return {
      score: Number(score.toFixed(2)),
      confidence: Number(confidence.toFixed(3)),
      metadata: {
        rawVal: Number(rawVal.toFixed(3)),
        sievedVal: Number(sievedVal.toFixed(3)),
        dnaMultiplier: Number(dnaMult.toFixed(3)),
        dnaAffinity: Number(dnaAff.toFixed(1)),
        topTwinDate: cache.topTwinDate,
        topTwinIndex: cache.topTwinIndex,
        topTwinQuality: Number(cache.topTwinQuality.toFixed(3)),
        activeTwinsCount: cache.activeTwinsCount,
        periodsAnalyzed: cache.periodsAnalyzed,
        matchedSourcePeriods: cache.matchedSourcePeriods,
        totalProjectedNumbers: cache.totalProjectedOccurrences,
        distinctProjectedNumbers: cache.distinctProjectedNumbers,
        totalSignalMass: Number(cache.totalSignalMass.toFixed(2)),
        concentrationTop5: Number(cache.concentrationTop5.toFixed(3)),
        signalDetected: cache.signalDetected,
        dnaSieveActive: cache.dnaSieveActive,
      },
    };
  },
};

