import { AlgoKey } from '../../../shared/prediction.types';
import { AlgorithmPlugin, AlgorithmContext } from '../algorithmRegistry';
import { LOTTERY_CONSTANTS } from '../../lotteryService';
import { calculateDnaSieveWeights } from '../../temporalAnalysisService';
import { calculateInterDrawMonthlyCoupling } from '../../interDrawService';
import { drawHasMachineNumbers, normalizeDrawName, getPrimaryInterDrawFamily } from '../../../constants';
import { globalCache, CACHE_TTL } from '../../cache/CacheService';

type HistoryDraw = {
  date: string;
  drawName?: string;
  gagnants?: number[];
  machine?: number[];
  timestamp?: number;
};

type MultiScaleTwinCandidate = {
  draw: HistoryDraw;
  index: number;
  monthsAgo: number;
  yearsAgo: number;
  dayDistance: number;
  monthlyResonance: number;
  seasonalResonance: number;
  synodicResonance: number;
  dowResonance: number;
  quality: number;
  scaleType: 'MONTHLY' | 'ANNUAL' | 'HYBRID';
};

type InterMonthlyResonanceCache = {
  scores: Record<number, number>; // Scores continus tamisés via ADN algorithmique [0, 100]
  rawScores: Record<number, number>; // Projections spectrales temporelles brutes
  dnaMultipliers: Record<number, number>; // Multiplicateurs différentiables du tamis ADN
  dnaAffinity: Record<number, number>; // Affinité génomique normalisée en %
  monthlyComponents: Record<number, number>; // Composante de résonance inter-mensuelle
  annualComponents: Record<number, number>; // Composante de résonance multi-annuelle
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
  monthlyComponents: {},
  annualComponents: {},
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
 * Calcule le signal continu de compatibilité avec l'ADN algorithmique actif
 * via le moteur unifié de tamisage génomique calculateDnaSieveWeights.
 */
const computeDnaSieveSignal = (
  ctx: AlgorithmContext
): { rawDna: Float64Array; multipliers: Float64Array; affinityPercent: Float64Array } => {
  const rawDna = new Float64Array(LOTTERY_CONSTANTS.TOTAL_NUMBERS + 1);
  const multipliers = new Float64Array(LOTTERY_CONSTANTS.TOTAL_NUMBERS + 1);
  const affinityPercent = new Float64Array(LOTTERY_CONSTANTS.TOTAL_NUMBERS + 1);
  const weights = (ctx.weights || ctx.algoWeights || {}) as Record<string, number>;

  const dnaReport = calculateDnaSieveWeights(
    (ctx.history || []) as any,
    weights as any,
    ctx.drawName || ''
  );

  if (!dnaReport || !dnaReport.multipliers) {
    multipliers.fill(1.0);
    affinityPercent.fill(50.0);
    return { rawDna, multipliers, affinityPercent };
  }

  for (let n = 1; n <= LOTTERY_CONSTANTS.TOTAL_NUMBERS; n++) {
    multipliers[n] = dnaReport.multipliers[n] ?? 1.0;
    affinityPercent[n] = dnaReport.affinityPercent[n] ?? 50.0;
    rawDna[n] = (dnaReport.multipliers[n] ?? 1.0) / 2.0;
  }

  return { rawDna, multipliers, affinityPercent };
};

const parseDateStrict = (dateStr: string): Date | null => {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();

  // Format DD/MM/YYYY
  const fr = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (fr) {
    const day = Number(fr[1]);
    const month = Number(fr[2]);
    const year = Number(fr[3]);
    const d = new Date(year, month - 1, day);
    if (d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day) {
      return d;
    }
    return null;
  }

  // ISO / YYYY-MM-DD
  const iso = new Date(trimmed);
  return Number.isNaN(iso.getTime()) ? null : iso;
};

/**
 * Calcule le quantième du jour dans l'année (1-366).
 */
const getDayOfYear = (d: Date): number => {
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = d.getTime() - start.getTime() + (start.getTimezoneOffset() - d.getTimezoneOffset()) * 60 * 1000;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
};

// Constantes astronomiques et calendaires objectives (zéro nombre magique arbitraire)
const TROPICAL_YEAR_DAYS = 365.242189; // Année tropique moyenne
const SYNODIC_MONTH_DAYS = 29.530588853; // Période synodique moyenne
const MEAN_SOLAR_MONTH_DAYS = TROPICAL_YEAR_DAYS / 12.0; // ~ 30.43685 jours

/**
 * Angle de phase saisonnière annuelle dans [0, 2*pi).
 */
const getSeasonalAngle = (d: Date): number => {
  const doy = getDayOfYear(d);
  return (2.0 * Math.PI * doy) / TROPICAL_YEAR_DAYS;
};

/**
 * Angle de phase intra-mensuelle dans [0, 2*pi) sur le cycle moyen d'un mois solaire (30.43685 jours).
 */
const getMonthlyAngle = (d: Date): number => {
  const day = d.getDate();
  return (2.0 * Math.PI * (day - 1)) / MEAN_SOLAR_MONTH_DAYS;
};

/**
 * Distance angulaire circulaire minimale entre deux phases dans [0, pi].
 */
const getCircularAngleDistance = (a1: number, a2: number): number => {
  const diff = Math.abs(a1 - a2) % (2.0 * Math.PI);
  return Math.min(diff, 2.0 * Math.PI - diff);
};

// Dispersions gaussiennes continues dérivées des résolutions temporelles naturelles
const SIGMA_SEASONAL_RAD = (2.0 * Math.PI * 14.0) / TROPICAL_YEAR_DAYS; // ~ 14 jours sur l'année tropique
const SIGMA_MONTHLY_RAD = (2.0 * Math.PI * 3.5) / MEAN_SOLAR_MONTH_DAYS; // ~ 3.5 jours sur le mois moyen

/**
 * Calcule l'harmonique synodique déterministe (phase de cycle calendaire lunaire).
 */
const getSynodicPhase = (d: Date): number => {
  const daysSinceEpoch = d.getTime() / 86400000.0;
  const cycle = ((daysSinceEpoch % SYNODIC_MONTH_DAYS) + SYNODIC_MONTH_DAYS) % SYNODIC_MONTH_DAYS;
  return (2.0 * Math.PI * cycle) / SYNODIC_MONTH_DAYS;
};

/**
 * Calcule la résonance temporelle multi-échelles entre la date cible et une date historique.
 * Combine la périodicité inter-mensuelle, l'angle saisonnier annuel, la phase synodique et le jour de la semaine.
 */
const calculateMultiScaleTemporalResonance = (
  targetDate: Date,
  drawDate: Date
): {
  monthlyResonance: number;
  seasonalResonance: number;
  synodicResonance: number;
  dowResonance: number;
  monthsAgo: number;
  yearsAgo: number;
  scaleType: 'MONTHLY' | 'ANNUAL' | 'HYBRID';
} => {
  const tYear = targetDate.getFullYear();
  const tMonth = targetDate.getMonth();
  const dYear = drawDate.getFullYear();
  const dMonth = drawDate.getMonth();

  const monthsAgo = (tYear - dYear) * 12 + (tMonth - dMonth);
  const yearsAgo = tYear - dYear;

  // 1. Résonance intra-mensuelle (même période du mois dans les mois passés)
  const aMonth1 = getMonthlyAngle(targetDate);
  const aMonth2 = getMonthlyAngle(drawDate);
  const distMonth = getCircularAngleDistance(aMonth1, aMonth2);
  const monthlyResonance = Math.exp(-0.5 * Math.pow(distMonth / SIGMA_MONTHLY_RAD, 2));

  // 2. Résonance saisonnière multi-annuelle (même période de l'année)
  const aSeason1 = getSeasonalAngle(targetDate);
  const aSeason2 = getSeasonalAngle(drawDate);
  const distSeason = getCircularAngleDistance(aSeason1, aSeason2);
  const seasonalResonance = Math.exp(-0.5 * Math.pow(distSeason / SIGMA_SEASONAL_RAD, 2));

  // 3. Harmonique synodique (cycle de 29.53 jours)
  const phiSyn1 = getSynodicPhase(targetDate);
  const phiSyn2 = getSynodicPhase(drawDate);
  const distSyn = getCircularAngleDistance(phiSyn1, phiSyn2);
  const synodicResonance = Math.pow(Math.cos(distSyn / 2.0), 2);

  // 4. Harmonique jour de la semaine (DOW)
  const dowDiff = Math.abs(targetDate.getDay() - drawDate.getDay());
  const dowResonance = Math.pow(Math.cos((Math.PI * dowDiff) / 7.0), 2);

  let scaleType: 'MONTHLY' | 'ANNUAL' | 'HYBRID' = 'HYBRID';
  if (yearsAgo >= 1 && seasonalResonance > monthlyResonance) {
    scaleType = 'ANNUAL';
  } else if (monthsAgo >= 1 && monthlyResonance >= seasonalResonance) {
    scaleType = 'MONTHLY';
  }

  return {
    monthlyResonance,
    seasonalResonance,
    synodicResonance,
    dowResonance,
    monthsAgo,
    yearsAgo,
    scaleType
  };
};

const buildDrawNumberSet = (draw: HistoryDraw, hasMachineData: boolean): Set<number> => {
  const nums = uniqueValidNumbers(draw.gagnants);
  if (hasMachineData && Array.isArray(draw.machine)) {
    nums.push(...uniqueValidNumbers(draw.machine));
  }
  return new Set(nums);
};

/**
 * Recherche continue des tirages jumeaux résonants à travers les deux échelles clés :
 * 1. Périodicité inter-mensuelle (mois M-1, M-2, ..., M-12).
 * 2. Périodicité multi-annuelle (années Y-1, Y-2, ..., Y-K).
 * ZÉRO COUPURE BINAIRE : Pondération continue basée sur l'exposant de Hurst et l'entropie.
 */
const findMultiScaleTwinCandidates = (
  history: HistoryDraw[],
  currentDate: Date,
  hurst: number,
  hasMachineData: boolean
): MultiScaleTwinCandidate[] => {
  const candidates: MultiScaleTwinCandidate[] = [];

  // Échelles d'amortissement dérivées de la persistance de Hurst H in [0.1, 0.9]
  const lambdaMonth = 6.0 + 8.0 * hurst; // Amortissement en mois
  const lambdaYear = 3.0 + 4.0 * hurst; // Amortissement en années

  for (let i = 1; i < history.length; i++) {
    const draw = history[i];
    const drawDate = parseDateStrict(draw.date);
    if (!drawDate) continue;

    const {
      monthlyResonance,
      seasonalResonance,
      synodicResonance,
      dowResonance,
      monthsAgo,
      yearsAgo,
      scaleType
    } = calculateMultiScaleTemporalResonance(currentDate, drawDate);

    if (monthsAgo < 1) continue; // Éviter l'autocorrélation avec le tirage immédiat

    // Amortissement temporel continu sans coupure brusque
    const timeDecay = Math.max(
      Math.exp(-monthsAgo / lambdaMonth),
      yearsAgo >= 1 ? Math.exp(-yearsAgo / lambdaYear) : 0
    );

    // Richesse du tirage (densité de boules valides disponibles)
    const gagnantsCount = uniqueValidNumbers(draw.gagnants).length;
    const machineCount = hasMachineData ? uniqueValidNumbers(draw.machine).length : 0;
    const richness = Math.min(1.0, (gagnantsCount + machineCount * 0.5) / 5.0);

    // Résonance combinée multi-échelles
    const blendedResonance =
      scaleType === 'MONTHLY'
        ? monthlyResonance * 0.65 + seasonalResonance * 0.35
        : seasonalResonance * 0.65 + monthlyResonance * 0.35;

    const harmonicCoupling = 0.5 + 0.25 * synodicResonance + 0.25 * dowResonance;
    const quality = clamp(blendedResonance * harmonicCoupling * timeDecay * (0.5 + 0.5 * richness), 0.0, 1.0);

    if (quality > 0.005) {
      const dayDistance = Math.abs(currentDate.getDate() - drawDate.getDate());
      candidates.push({
        draw,
        index: i,
        monthsAgo,
        yearsAgo,
        dayDistance,
        monthlyResonance,
        seasonalResonance,
        synodicResonance,
        dowResonance,
        quality,
        scaleType
      });
    }
  }

  // Tri par qualité de résonance décroissante
  candidates.sort((a, b) => b.quality - a.quality);
  return candidates;
};

/**
 * Calcule les statistiques robustes (Médiane, IQR, et MAD) pour une standardisation sans biais.
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
    'Analyse Spectrale Multi-Échelles des Périodicités Calendaires (Mensuelle, Trimestrielle, Lunaire/Synodique et Multi-Annuelle) avec Tamisage Génétique Différentiable',
  description:
    'Détecte les tirages jumeaux multi-échelles (mois récurrents M-k, mêmes quinzaines annuelles, et harmoniques synodiques), extrait les dynamiques de transition conjointes, puis les tamise à travers l’ADN algorithmique.',
  isStrictlyDeterministic: true,

  precompute(ctx: AlgorithmContext) {
    const history = (ctx.history || []) as HistoryDraw[];
    ctx.pluginCache = ctx.pluginCache || {};

    const cacheKey = AlgoKey.INTER_MONTHLY_RESONANCE;

    const emptyScores: Record<number, number> = {};
    const emptyMonthly: Record<number, number> = {};
    const emptyAnnual: Record<number, number> = {};
    for (let i = 1; i <= LOTTERY_CONSTANTS.TOTAL_NUMBERS; i++) {
      emptyScores[i] = 0;
      emptyMonthly[i] = 0;
      emptyAnnual[i] = 0;
    }

    const defaultCache: InterMonthlyResonanceCache = {
      ...DEFAULT_CACHE,
      scores: emptyScores,
      monthlyComponents: emptyMonthly,
      annualComponents: emptyAnnual
    };

    if (history.length < 15) {
      ctx.pluginCache[cacheKey] = defaultCache;
      return;
    }

    const drawName = ctx.drawName || '';
    const hasMachineData = drawHasMachineNumbers(drawName, history as any);

    const currentDraw = history[0];
    const currentDate = parseDateStrict(currentDraw?.date || '');
    if (!currentDate) {
      ctx.pluginCache[cacheKey] = defaultCache;
      return;
    }

    let hurst = Number(ctx.statisticalBounds?.hurstExponent);
    if (!Number.isFinite(hurst)) hurst = 0.5;
    hurst = clamp(hurst, 0.1, 0.9);

    // Extraction des candidats jumeaux multi-échelles (mensuels et annuels)
    const twinCandidates = findMultiScaleTwinCandidates(history, currentDate, hurst, hasMachineData);
    if (twinCandidates.length === 0) {
      ctx.pluginCache[cacheKey] = defaultCache;
      return;
    }

    // Nombre optimal de jumeaux actifs dérivé continûment de Hurst
    const maxActiveTwins = Math.max(3, Math.min(12, Math.round(6 * (1.0 + (hurst - 0.5)))));
    const activeTwins = twinCandidates.slice(0, maxActiveTwins);
    const topTwin = activeTwins[0];

    // Décroissance exponentielle continue dérivée de Hurst
    const decayGamma = 0.05 / (hurst * 2.0);

    const rawScores: Record<number, number> = {};
    const monthlyScores: Record<number, number> = {};
    const annualScores: Record<number, number> = {};
    for (let i = 1; i <= LOTTERY_CONSTANTS.TOTAL_NUMBERS; i++) {
      rawScores[i] = 0;
      monthlyScores[i] = 0;
      annualScores[i] = 0;
    }

    let periodsAnalyzed = 0;
    let matchedSourcePeriods = 0;
    let totalProjectedOccurrences = 0;
    let totalSignalMass = 0;
    const distinctProjected = new Set<number>();

    // Analyse de la fenêtre rétro-projective pour chaque jumeau temporel
    for (const twinRes of activeTwins) {
      const twinNumbers = buildDrawNumberSet(twinRes.draw, hasMachineData);
      if (twinNumbers.size < 2) continue;

      // Profondeur d'analyse rétro-projective liée à la taille d'échantillon
      const maxLookback = Math.min(Math.floor(history.length / 2), Math.min(120, history.length - twinRes.index - 1));

      for (let k = 1; k <= maxLookback; k++) {
        const historicalSource = history[twinRes.index + k];
        const projectedCurrent = history[k];
        if (!historicalSource || !projectedCurrent) continue;

        periodsAnalyzed++;

        const sourceNumbers = uniqueValidNumbers(historicalSource.gagnants);
        if (hasMachineData && Array.isArray(historicalSource.machine)) {
          sourceNumbers.push(...uniqueValidNumbers(historicalSource.machine));
        }

        const overlapCount = sourceNumbers.filter((n) => twinNumbers.has(n)).length;

        // Espérance neutre de co-occurrence hypergéométrique
        const expectedOverlap = (sourceNumbers.length * twinNumbers.size) / LOTTERY_CONSTANTS.TOTAL_NUMBERS;
        // Activation logistique continue centrée sur l'espérance neutre
        const combinationActivation = 1.0 / (1.0 + Math.exp(-3.0 * (overlapCount - expectedOverlap)));
        if (combinationActivation < 0.05) continue;

        matchedSourcePeriods++;

        const sourceStrength = overlapCount / Math.max(1, twinNumbers.size);
        const timeAmortization = Math.exp(-decayGamma * k);

        // Poids continu de la période
        const periodWeight =
          combinationActivation *
          timeAmortization *
          twinRes.quality *
          (0.5 + sourceStrength);

        const projectedWinners = uniqueValidNumbers(projectedCurrent.gagnants);

        for (const num of projectedWinners) {
          rawScores[num] += periodWeight;
          if (twinRes.scaleType === 'MONTHLY') {
            monthlyScores[num] += periodWeight;
          } else {
            annualScores[num] += periodWeight;
          }
          totalProjectedOccurrences++;
          totalSignalMass += periodWeight;
          distinctProjected.add(num);
        }

        // Boules machine projetées UNIQUEMENT si le tirage supporte les numéros machine
        if (hasMachineData && Array.isArray(projectedCurrent.machine)) {
          const projectedMachine = uniqueValidNumbers(projectedCurrent.machine);
          const machineRatio = projectedWinners.length > 0 ? 0.5 : 0.0;
          for (const num of projectedMachine) {
            const mWeight = periodWeight * machineRatio;
            rawScores[num] += mWeight;
            if (twinRes.scaleType === 'MONTHLY') {
              monthlyScores[num] += mWeight;
            } else {
              annualScores[num] += mWeight;
            }
            totalProjectedOccurrences++;
            totalSignalMass += mWeight;
            distinctProjected.add(num);
          }
        }
      }
    }

    // --- COUPLAGE DÉTERMINISTE AVEC LE FLUX INTER-TIRAGES DE LA FAMILLE ÉTANCHE ---
    if (drawName && drawName !== 'all') {
      const primaryFam = getPrimaryInterDrawFamily(drawName);
      const interMonthly = calculateInterDrawMonthlyCoupling(
        history as any,
        drawName,
        currentDate.getMonth(),
        currentDate.getMonth(),
        primaryFam?.id
      );
      if (interMonthly && interMonthly.vector) {
        for (let i = 1; i <= LOTTERY_CONSTANTS.TOTAL_NUMBERS; i++) {
          // Modulation continue et douce (gain unitaire centré)
          const p = interMonthly.vector[i] || 0.05555;
          rawScores[i] = rawScores[i] * (0.85 + 0.30 * (p / 0.05555));
        }
      }
    }

    // --- APPLICATION DU TAMIS DE L'ADN ALGORITHMIQUE DU MOMENT ---
    const { multipliers: dnaMultipliers, affinityPercent: dnaAffinity } = computeDnaSieveSignal(ctx);

    const sievedScores: Record<number, number> = {};
    const dnaMultipliersRecord: Record<number, number> = {};
    const dnaAffinityRecord: Record<number, number> = {};

    let sumMult = 0;
    let sumMultSq = 0;
    for (let i = 1; i <= LOTTERY_CONSTANTS.TOTAL_NUMBERS; i++) {
      const m = dnaMultipliers[i] || 1.0;
      sumMult += m;
      sumMultSq += m * m;
    }
    const meanMult = sumMult / LOTTERY_CONSTANTS.TOTAL_NUMBERS;
    const stdMult = Math.sqrt(Math.max(1e-6, sumMultSq / LOTTERY_CONSTANTS.TOTAL_NUMBERS - meanMult * meanMult));
    const dynamicSieveIntensity = 1.0 / (1.0 + Math.exp(-2.0 * (stdMult / 0.15 - 1.0)));

    for (let i = 1; i <= LOTTERY_CONSTANTS.TOTAL_NUMBERS; i++) {
      const raw = rawScores[i] || 0;
      const mult = dnaMultipliers[i] || 1.0;
      const aff = dnaAffinity[i] || 50.0;

      dnaMultipliersRecord[i] = mult;
      dnaAffinityRecord[i] = aff;

      // Tamisage différentiable continu
      sievedScores[i] = raw * ((1.0 - dynamicSieveIntensity) + dynamicSieveIntensity * mult);
    }

    const { median, iqr, mad } = computeRobustStats(sievedScores);
    const concentrationTop5 = computeTop5Concentration(sievedScores);
    const signalDetected = matchedSourcePeriods > 0 && totalSignalMass > 0;

    const cacheResult: InterMonthlyResonanceCache = {
      scores: sievedScores,
      rawScores,
      dnaMultipliers: dnaMultipliersRecord,
      dnaAffinity: dnaAffinityRecord,
      monthlyComponents: monthlyScores,
      annualComponents: annualScores,
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

    ctx.pluginCache[cacheKey] = cacheResult;

    // Cache sous convention canonique d'isolation
    if (drawName) {
      const primaryFam = getPrimaryInterDrawFamily(drawName);
      const famId = primaryFam?.id || 'ISO';
      const canonKey = `nexus_intermonthly_${famId}_${normalizeDrawName(drawName)}`;
      try {
        globalCache.set(canonKey, cacheResult, CACHE_TTL.LONG, drawName);
      } catch (e) { /* Silenced */ }
    }
  },

  evaluate(num: number, ctx: AlgorithmContext) {
    const cacheKey = AlgoKey.INTER_MONTHLY_RESONANCE;

    if (!ctx.pluginCache?.[cacheKey]) {
      this.precompute(ctx);
    }

    const cache = ctx.pluginCache?.[cacheKey] as InterMonthlyResonanceCache | undefined;
    if (!cache) {
      return {
        score: 50.0,
        confidence: 0.5,
        metadata: {
          rawVal: 0,
          sievedVal: 0,
          monthlyScore: 50.0,
          annualScore: 50.0,
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
    const monthlyVal = Number.isFinite(cache.monthlyComponents[num]) ? cache.monthlyComponents[num] : 0;
    const annualVal = Number.isFinite(cache.annualComponents[num]) ? cache.annualComponents[num] : 0;
    const dnaMult = Number.isFinite(cache.dnaMultipliers[num]) ? cache.dnaMultipliers[num] : 1.0;
    const dnaAff = Number.isFinite(cache.dnaAffinity[num]) ? cache.dnaAffinity[num] : 50.0;
    const median = Number.isFinite(cache.median) ? cache.median : 0;

    const robustScale = Math.max(1e-6, 1.4826 * cache.mad);
    let score = 50.0;

    if (cache.signalDetected) {
      const zRobust = (sievedVal - median) / robustScale;
      let hurst = Number(ctx.statisticalBounds?.hurstExponent);
      if (!Number.isFinite(hurst)) hurst = 0.5;
      const slope = 1.0 + clamp(hurst, 0.1, 0.9) * 2.0;
      score = 100.0 / (1.0 + Math.exp(-slope * zRobust));
    }

    score = clamp(score, 0.5, 99.5);

    // Dérivation continue de la confiance
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

    const confidence = clamp(confidenceRaw, 0.2, 0.98);

    return {
      score: Number(score.toFixed(2)),
      confidence: Number(confidence.toFixed(3)),
      metadata: {
        rawVal: Number(rawVal.toFixed(3)),
        sievedVal: Number(sievedVal.toFixed(3)),
        monthlyVal: Number(monthlyVal.toFixed(3)),
        annualVal: Number(annualVal.toFixed(3)),
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
