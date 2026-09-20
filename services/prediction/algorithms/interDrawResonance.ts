import { AlgoKey } from '../../../shared/prediction.types';
import { AlgorithmPlugin, AlgorithmContext } from '../algorithmRegistry';
import {
  INTER_DRAW_FAMILIES,
  InterDrawFamilyId,
  getFamilyPredecessorAndSuccessor,
  getInterDrawFamiliesForDraw,
  getPrimaryInterDrawFamily,
  normalizeDrawName
} from '../../../constants';
import {
  alignConsecutiveDrawHistories,
  getComplement90,
  getMirrorNumber
} from '../../interDrawService';
import {
  LOTTERY_CONSTANTS,
  generateDeterministicFallbackHistory
} from '../../lotteryService';
import { globalCache, CACHE_TTL } from '../../cache/CacheService';
import { wasmMatrixEngine } from '../../wasm/wasmMatrixCore';

export interface InterDrawChannelDetail {
  transitionScore: number;
  carryOverScore: number;
  harmonicScore: number;
  cohortScore: number;
  hawkesScore: number;
  hawkesExcitation: number;
  flags: string[];
}

export interface InterDrawPluginCache {
  scores: Float32Array;
  confidence: Float32Array;
  channelDetails: Record<number, InterDrawChannelDetail>;
  median: number;
  mad: number;
  familyId: string;
  familyName: string;
  predecessorName: string;
  activePredWinners: number[];
  carryOverLift: number;
  mirrorLift: number;
  complementLift: number;
  sampleSize: number;
  signalDetected: boolean;
  hawkesTotalEnergy?: number;
  hawkesBetaDecay?: number;
  hawkesLagExcitations?: number[];
}

const clamp = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, v));

/**
 * Calcule la médiane et la MAD (Median Absolute Deviation) pour une standardisation z-score robuste
 * sans aucune distorsion causée par les valeurs extrêmes.
 */
const computeRobustDistribution = (arr: Float64Array): { median: number; mad: number } => {
  const vals: number[] = [];
  for (let i = 1; i <= LOTTERY_CONSTANTS.TOTAL_NUMBERS; i++) {
    vals.push(arr[i]);
  }
  vals.sort((a, b) => a - b);
  const n = vals.length;
  const median = vals[Math.floor(n / 2)] ?? 0;
  const deviations = vals.map(v => Math.abs(v - median)).sort((a, b) => a - b);
  const mad = Math.max(1e-6, deviations[Math.floor(n / 2)] ?? 0);
  return { median, mad };
};

export const interDrawResonancePlugin: AlgorithmPlugin = {
  key: AlgoKey.INTER_DRAW_RESONANCE,
  category: 'core',
  stability: 'stable',
  mathematicalBasis:
    'Chaînes de Markov Multi-Ordres, Report Direct (Carry-Over) et Résonance Harmonique Involutive (Miroirs & Compléments 91) au sein des Familles Étanches',
  description:
    'Modélise les flux stochastiques inter-tirages à travers 4 canaux continus : transitions markoviennes d’ordre 1 et 2, persistance carry-over modulée par Hurst, résonance harmonique miroir/complémentaire 91, et attraction de cohorte.',
  isStrictlyDeterministic: true,

  precompute(ctx: AlgorithmContext): void {
    const N = LOTTERY_CONSTANTS.TOTAL_NUMBERS; // 90
    const K = LOTTERY_CONSTANTS.NUMBERS_PER_DRAW; // 5
    const p0 = K / N; // 5/90 ~ 0.055555...
    const logitP0 = Math.log(p0 / (1.0 - p0)); // log-cotes neutres ~ -2.833213

    const scores = new Float32Array(N + 1).fill(50.0);
    const confidences = new Float32Array(N + 1).fill(0.5);
    const channelDetails: Record<number, InterDrawChannelDetail> = {};

    for (let i = 1; i <= N; i++) {
      channelDetails[i] = {
        transitionScore: 50.0,
        carryOverScore: 50.0,
        harmonicScore: 50.0,
        cohortScore: 50.0,
        hawkesScore: 50.0,
        hawkesExcitation: 0.0,
        flags: []
      };
    }

    const defaultCache: InterDrawPluginCache = {
      scores,
      confidence: confidences,
      channelDetails,
      median: 0,
      mad: 1,
      familyId: 'NONE',
      familyName: 'Tirage Isolé',
      predecessorName: 'N/A',
      activePredWinners: [],
      carryOverLift: 1.0,
      mirrorLift: 1.0,
      complementLift: 1.0,
      sampleSize: 0,
      signalDetected: false,
      hawkesTotalEnergy: 0,
      hawkesBetaDecay: 0,
      hawkesLagExcitations: []
    };

    ctx.pluginCache = ctx.pluginCache || {};

    const drawName = ctx.drawName;
    if (!drawName || drawName === 'all' || drawName === 'all combined') {
      ctx.pluginCache[AlgoKey.INTER_DRAW_RESONANCE] = defaultCache;
      return;
    }

    const forcedFamilyId = (ctx as any).forcedFamilyId as InterDrawFamilyId | undefined;
    const families = getInterDrawFamiliesForDraw(drawName);
    const family = forcedFamilyId
      ? INTER_DRAW_FAMILIES[forcedFamilyId] || getPrimaryInterDrawFamily(drawName)
      : (families.length > 0 ? families[0] : getPrimaryInterDrawFamily(drawName));

    if (!family) {
      ctx.pluginCache[AlgoKey.INTER_DRAW_RESONANCE] = defaultCache;
      return;
    }

    const relation = getFamilyPredecessorAndSuccessor(drawName, family.id);
    if (!relation) {
      ctx.pluginCache[AlgoKey.INTER_DRAW_RESONANCE] = defaultCache;
      return;
    }

    // Clé de cache canonique conforme à la directive d'isolation stricte des familles.
    // Utilise un sous-secteur 'plugin' pour ne jamais écraser ni entrer en collision
    // avec le rapport complet InterDrawReport généré par interDrawService.
    const canonicalCacheKey = globalCache.getInterDrawKey(family.id, normalizeDrawName(drawName), 'plugin');

    // 1. Récupération de l'historique du prédécesseur direct au sein de la famille étanche
    const predName = relation.predecessor.name;
    const predHistoryKey = globalCache.generateKey('history', predName);
    let predHistory = globalCache.getSync<any[]>(predHistoryKey, predName);
    if (!predHistory || predHistory.length === 0) {
      predHistory = generateDeterministicFallbackHistory(predName);
    }

    const targetHistory = ctx.history || [];
    if (targetHistory.length === 0 || predHistory.length === 0) {
      ctx.pluginCache[AlgoKey.INTER_DRAW_RESONANCE] = defaultCache;
      return;
    }

    // Gagnants actifs du tirage le plus récent du prédécesseur
    const activePredWinners = (predHistory[0]?.gagnants || []).filter(
      (n: number) => Number.isInteger(n) && n >= 1 && n <= N
    );
    if (activePredWinners.length === 0) {
      ctx.pluginCache[AlgoKey.INTER_DRAW_RESONANCE] = defaultCache;
      return;
    }

    const activePredSet = new Set<number>(activePredWinners);

    // 2. Alignement chronologique strict des couples consécutifs (Zéro fuite look-ahead)
    const pairedPairs = alignConsecutiveDrawHistories(targetHistory as any, predHistory);
    const sampleSize = pairedPairs.length;
    if (sampleSize < 2) {
      ctx.pluginCache[AlgoKey.INTER_DRAW_RESONANCE] = defaultCache;
      return;
    }

    // 3. Dérivation continue du paramètre de lissage de Laplace (zéro constante arbitraire)
    // alpha = 1 / (1 + ln(1 + sampleSize)), diminue continûment lorsque la taille de l'échantillon croît
    const laplaceAlpha = 1.0 / (1.0 + Math.log(1.0 + sampleSize));

    // Matrices de transitions d'ordre 1 et paires d'ordre 2
    const transCounts: Int32Array[] = Array.from({ length: N + 1 }, () => new Int32Array(N + 1));
    const fromTotals = new Int32Array(N + 1);
    const targetTotals = new Int32Array(N + 1);
    const repeatCounts = new Int32Array(N + 1);
    const cohortPairCounts: Map<number, number> = new Map(); // key = (n1 << 7) | n2

    let totalConsecutive = 0;
    let carryOverOccurrences = 0;

    // Métriques harmoniques empiriques
    let mirrorOccurrences = 0;
    let mirrorAttempts = 0;
    let complementOccurrences = 0;
    let compAttempts = 0;
    const mirrorPairHits = new Map<number, number>();
    const compPairHits = new Map<number, number>();

    for (const pair of pairedPairs) {
      totalConsecutive++;
      const pWin = pair.predWinners;
      const tWin = pair.targetWinners;
      const tSet = new Set(tWin);

      let pairHasCarryOver = false;

      for (const tw of tWin) {
        if (tw >= 1 && tw <= N) {
          targetTotals[tw]++;
        }
      }

      // Cohorte cible conditionnelle
      for (let a = 0; a < tWin.length; a++) {
        for (let b = a + 1; b < tWin.length; b++) {
          const t1 = Math.min(tWin[a], tWin[b]);
          const t2 = Math.max(tWin[a], tWin[b]);
          const code = (t1 << 7) | t2;
          cohortPairCounts.set(code, (cohortPairCounts.get(code) || 0) + 1);
        }
      }

      for (const pw of pWin) {
        if (pw >= 1 && pw <= N) {
          fromTotals[pw]++;
          if (tSet.has(pw)) {
            pairHasCarryOver = true;
            repeatCounts[pw]++;
          }

          for (const tw of tWin) {
            if (tw >= 1 && tw <= N) {
              transCounts[pw][tw]++;
            }
          }

          // Harmoniques
          const mir = getMirrorNumber(pw);
          if (mir !== pw && mir >= 1 && mir <= N) {
            mirrorAttempts++;
            if (tSet.has(mir)) {
              mirrorOccurrences++;
              const k = (pw << 7) | mir;
              mirrorPairHits.set(k, (mirrorPairHits.get(k) || 0) + 1);
            }
          }

          const comp = getComplement90(pw);
          if (comp !== pw && comp >= 1 && comp <= N) {
            compAttempts++;
            if (tSet.has(comp)) {
              complementOccurrences++;
              const k = (pw << 7) | comp;
              compPairHits.set(k, (compPairHits.get(k) || 0) + 1);
            }
          }
        }
      }

      if (pairHasCarryOver) {
        carryOverOccurrences++;
      }
    }

    // Lifts statistiques empiriques dérivés de la combinatoire réelle
    const carryOverExpected = (1.0 - (85 * 84 * 83 * 82 * 81) / (90 * 89 * 88 * 87 * 86)) * 100; // ~ 25.41%
    const carryOverRate = totalConsecutive > 0 ? (carryOverOccurrences / totalConsecutive) * 100 : carryOverExpected;
    const carryOverLift = Math.max(0.2, carryOverRate / carryOverExpected);

    const harmonicExpectedRate = (K / N) * 100; // 5.5556%
    const mirrorObservedRate = mirrorAttempts > 0 ? (mirrorOccurrences / mirrorAttempts) * 100 : harmonicExpectedRate;
    const mirrorLift = Math.max(0.2, mirrorObservedRate / harmonicExpectedRate);

    const compObservedRate = compAttempts > 0 ? (complementOccurrences / compAttempts) * 100 : harmonicExpectedRate;
    const complementLift = Math.max(0.2, compObservedRate / harmonicExpectedRate);

    // Modulation continue par l'exposant de Hurst (mémoire longue vs retour à la moyenne)
    let hurst = Number(ctx.statisticalBounds?.hurstExponent);
    if (!Number.isFinite(hurst)) hurst = 0.5;
    hurst = clamp(hurst, 0.1, 0.9);

    // Si Hurst > 0.5 (persistance), le report direct carry-over est amplifié continûment.
    // Si Hurst < 0.5 (anti-persistance), les compléments et alternatives sont favorisés.
    const carryHurstModulator = Math.exp(1.5 * (hurst - 0.5));
    const harmonicHurstModulator = Math.exp(-1.5 * (hurst - 0.5));

    // 3b. Noyau de Hawkes Croisé Vectorisé (Multi-Lags Hermétique au sein de la Famille)
    const lagCount = Math.max(1, Math.min(5, predHistory.length));
    const predLaggedOccurrences = new Int32Array(lagCount * K);
    for (let l = 0; l < lagCount; l++) {
      const g = (predHistory[l]?.gagnants || []).filter((n: number) => Number.isInteger(n) && n >= 1 && n <= N);
      for (let c = 0; c < K; c++) {
        predLaggedOccurrences[l * K + c] = g[c] ?? 0;
      }
    }

    const targetBaseline = new Float64Array(N + 1);
    for (let i = 1; i <= N; i++) {
      targetBaseline[i] = (targetTotals[i] + laplaceAlpha * p0) / (sampleSize + laplaceAlpha);
    }

    // 3c. Construction des Densités Non-Paramétriques de Transition (KDE Torique modulo 90)
    // Calcul de la bande passante adaptative de Silverman / Scott pour chaque état source p
    const kdeBandwidths = new Float64Array(N + 1);
    const kdeTransitionMatrix = Array.from({ length: N + 1 }, () => new Float64Array(N + 1));

    for (let p = 1; p <= N; p++) {
      const totalP = fromTotals[p];
      if (totalP === 0) {
        kdeBandwidths[p] = 2.0;
        for (let c = 1; c <= N; c++) {
          kdeTransitionMatrix[p][c] = p0;
        }
        continue;
      }

      // Calcul des moments trigonométriques angulaires sur le tore S1 (Z/90Z)
      let sumCos = 0;
      let sumSin = 0;
      for (let tw = 1; tw <= N; tw++) {
        const count = transCounts[p][tw];
        if (count > 0) {
          const theta = (2.0 * Math.PI * (tw - 1)) / 90.0;
          sumCos += count * Math.cos(theta);
          sumSin += count * Math.sin(theta);
        }
      }

      const meanCos = sumCos / totalP;
      const meanSin = sumSin / totalP;
      const R = Math.sqrt(meanCos * meanCos + meanSin * meanSin);
      // Écart-type circulaire continu sur l'échelle des 90 numéros
      const circularStd = (90.0 / (2.0 * Math.PI)) * Math.sqrt(Math.max(0.01, -2.0 * Math.log(Math.max(1e-4, R))));
      
      // Bande passante optimale de Silverman pour noyau gaussien h_p = 1.06 * sigma * n^(-1/5)
      const h_p = Math.max(1.0, 1.06 * Math.max(2.0, circularStd) * Math.pow(totalP, -0.2));
      kdeBandwidths[p] = h_p;

      const twoHsq = 2.0 * h_p * h_p;
      const normFactor = 1.0 / (Math.sqrt(2.0 * Math.PI) * h_p * totalP);

      let kdeSum = 0;
      for (let c = 1; c <= N; c++) {
        let densityAtC = 0;
        for (let tw = 1; tw <= N; tw++) {
          const count = transCounts[p][tw];
          if (count > 0) {
            const diff = Math.abs(c - tw);
            const distToroidal = Math.min(diff, 90 - diff);
            densityAtC += count * Math.exp(-(distToroidal * distToroidal) / twoHsq);
          }
        }
        densityAtC *= normFactor;
        kdeTransitionMatrix[p][c] = densityAtC;
        kdeSum += densityAtC;
      }

      // Normalisation continue de la densité de transition KDE avec lissage bayésien de Laplace
      const blendKDE = totalP / (totalP + laplaceAlpha);
      for (let c = 1; c <= N; c++) {
        const rawDensity = kdeSum > 0 ? kdeTransitionMatrix[p][c] / kdeSum : p0;
        kdeTransitionMatrix[p][c] = blendKDE * rawDensity + (1.0 - blendKDE) * p0;
      }
    }

    const stride = N + 1;
    const crossCouplingMatrix = new Float64Array(stride * stride);

    // Calcul des poids de couplage par canal basés sur les lifts empiriques réels
    const logCarryMax = Math.log(Math.max(1.05, carryOverLift * carryHurstModulator));
    const logHarmMax = Math.log(Math.max(1.05, Math.max(mirrorLift, complementLift) * harmonicHurstModulator));
    const totalCouplingWeight = 1.0 + logCarryMax + logHarmMax;
    const wTrans = 0.40 / totalCouplingWeight;
    const wCarry = (0.30 * logCarryMax) / totalCouplingWeight;
    const wHarm = (0.20 * logHarmMax) / totalCouplingWeight;
    const wCohort = 0.10 / totalCouplingWeight;

    for (let j = 1; j <= N; j++) {
      const rowOffset = j * stride;
      const mirJ = getMirrorNumber(j);
      const compJ = getComplement90(j);

      for (let i = 1; i <= N; i++) {
        // 1. Transition markovienne non-paramétrique KDE
        const pTransKDE = kdeTransitionMatrix[j][i];
        const liftTrans = Math.max(1e-4, pTransKDE / p0);

        // 2. Report direct carry-over
        let liftCarry = 1.0;
        if (i === j) {
          const structCarry = Math.max(1.0, carryOverLift * carryHurstModulator);
          const boostCarry = 1.0 + ((repeatCounts[j] || 0) / (laplaceAlpha * p0 + (fromTotals[j] || 0) * p0));
          liftCarry = structCarry * boostCarry;
        }

        // 3. Harmonique continu (distance modulaire sur le tore Z_90)
        const dMir = Math.min(Math.abs(i - mirJ), 90 - Math.abs(i - mirJ));
        const dComp = Math.min(Math.abs(i - compJ), 90 - Math.abs(i - compJ));
        const kMir = Math.exp(-(dMir * dMir) / 2.0) * mirrorLift * harmonicHurstModulator;
        const kComp = Math.exp(-(dComp * dComp) / 2.0) * complementLift * harmonicHurstModulator;
        const liftHarm = 1.0 + kMir + kComp;

        // 4. Cohorte conditionnelle
        const pairKey = (Math.min(j, i) << 7) | Math.max(j, i);
        const coOcc = cohortPairCounts.get(pairKey) || 0;
        const expectedPairRate = (K / N) * (K / N);
        const liftCohort = Math.max(1.0, (coOcc + laplaceAlpha * p0) / (sampleSize * expectedPairRate + laplaceAlpha));

        crossCouplingMatrix[rowOffset + i] =
          wTrans * Math.log(Math.max(1.0, liftTrans)) +
          wCarry * Math.log(Math.max(1.0, liftCarry)) +
          wHarm * Math.log(Math.max(1.0, liftHarm)) +
          wCohort * Math.log(Math.max(1.0, liftCohort));
      }
    }

    // Décroissance temporelle continue du noyau de Hawkes dérivée de l'exposant de Hurst
    const betaDecay = Math.LN2 / (1.0 + 2.0 * (1.0 - hurst));

    const hawkesRes = wasmMatrixEngine.vectorizedCrossHawkesKernel({
      numStates: N,
      lagCount,
      winningCols: K,
      predecessorLaggedOccurrences: predLaggedOccurrences,
      targetBaseline,
      crossCouplingMatrix,
      betaDecay
    });

    const rawHawkes = new Float64Array(N + 1);
    for (let c = 1; c <= N; c++) {
      const mu = targetBaseline[c] > 0 ? targetBaseline[c] : p0;
      rawHawkes[c] = Math.log(Math.max(1e-4, hawkesRes.intensities[c] / mu));
    }

    // Rétrécissement bayésien continu gamma basé sur la taille d'échantillon
    const sampleScale = Math.sqrt(N); // racine de l'espace d'état
    const gamma = sampleSize / (sampleSize + sampleScale);

    // Log-cotes continues brutes pour chaque numéro [1..90]
    const rawLogOdds = new Float64Array(N + 1);
    const rawTrans = new Float64Array(N + 1);
    const rawCarry = new Float64Array(N + 1);
    const rawHarm = new Float64Array(N + 1);
    const rawCohort = new Float64Array(N + 1);

    for (let c = 1; c <= N; c++) {
      const isDirectCandidate = activePredSet.has(c);
      const flags: string[] = [];

      // --- CANAL 1 : TRANSITIONS MARKOVIENNES CONDITIONNELLES D'ORDRE 1 & 2 AVEC KDE ---
      let evidenceTrans = 0;
      for (const p of activePredWinners) {
        if (isDirectCandidate && p === c) continue; // Le report direct est traité dans son canal propre
        const condProb = kdeTransitionMatrix[p][c];

        if (isDirectCandidate) {
          const transLift = Math.max(1.0, condProb / p0);
          if (transLift > 1.0) {
            evidenceTrans += Math.log(transLift);
          }
        } else {
          const transLift = Math.max(1e-4, condProb / p0);
          evidenceTrans += Math.log(transLift);
        }
      }
      rawTrans[c] = evidenceTrans;

      // --- CANAL 2 : REPORT DIRECT CARRY-OVER (INERTIE STOCHASTIQUE) ---
      let evidenceRepeat = 0;
      if (isDirectCandidate) {
        flags.push('REPORT_DIRECT');
        const structuralPriorLift = Math.max(1.0, carryOverLift * carryHurstModulator);
        const empiricalBoost = 1.0 + ((repeatCounts[c] || 0) / (laplaceAlpha * p0 + (fromTotals[c] || 0) * p0));
        evidenceRepeat = Math.log(structuralPriorLift * empiricalBoost);
      }
      rawCarry[c] = evidenceRepeat;

      // --- CANAL 3 : RÉSONANCE HARMONIQUE SYMÉTRIQUE (MIROIR & COMPLÉMENT 91) ---
      let evidenceHarmonic = 0;
      for (const p of activePredWinners) {
        const mir = getMirrorNumber(p);
        if (mir === c && mir !== p) {
          flags.push('MIROIR_DECIMAL');
          const hitKey = (p << 7) | c;
          const occ = mirrorPairHits.get(hitKey) || 0;
          const structuralMirrorLift = Math.max(1.0, mirrorLift * harmonicHurstModulator);
          const mirrorEmpiricalBoost = 1.0 + (occ / (laplaceAlpha * p0 + (fromTotals[p] || 0) * p0));
          evidenceHarmonic += Math.log(structuralMirrorLift * mirrorEmpiricalBoost);
        }

        const comp = getComplement90(p);
        if (comp === c && comp !== p) {
          flags.push('COMPLEMENT_90');
          const hitKey = (p << 7) | c;
          const occ = compPairHits.get(hitKey) || 0;
          const structuralCompLift = Math.max(1.0, complementLift * harmonicHurstModulator);
          const compEmpiricalBoost = 1.0 + (occ / (laplaceAlpha * p0 + (fromTotals[p] || 0) * p0));
          evidenceHarmonic += Math.log(structuralCompLift * compEmpiricalBoost);
        }
      }
      rawHarm[c] = evidenceHarmonic;

      // --- CANAL 4 : ATTRACTION DE COHORTE INTER-TIRAGES ---
      let evidenceCohort = 0;
      for (const p of activePredWinners) {
        const pairKey = (Math.min(p, c) << 7) | Math.max(p, c);
        const coOcc = cohortPairCounts.get(pairKey) || 0;
        if (coOcc > 0) {
          const expectedPairRate = (K / N) * (K / N);
          const cohortLift = (coOcc + laplaceAlpha * p0) / (sampleSize * expectedPairRate + laplaceAlpha);
          if (cohortLift > 1.0) {
            evidenceCohort += Math.log(cohortLift) * 0.5;
            if (!flags.includes('RESONANCE_COHORTE')) flags.push('RESONANCE_COHORTE');
          }
        }
      }
      rawCohort[c] = evidenceCohort;

      // Fusion conjointe bayésienne des 4 canaux + Noyau de Hawkes Croisé sans coupure brusque
      const logitCombined = logitP0 + gamma * (evidenceTrans + evidenceRepeat + evidenceHarmonic + evidenceCohort + 0.5 * rawHawkes[c]);
      rawLogOdds[c] = logitCombined;

      channelDetails[c] = {
        transitionScore: 50.0,
        carryOverScore: 50.0,
        harmonicScore: 50.0,
        cohortScore: 50.0,
        hawkesScore: 50.0,
        hawkesExcitation: 0.0,
        flags
      };
    }

    // 4. Standardisation z-score robuste (Médiane & MAD de la distribution complète)
    const { median: medLog, mad: madLog } = computeRobustDistribution(rawLogOdds);
    const { median: medTrans, mad: madTrans } = computeRobustDistribution(rawTrans);
    const { median: medCarry, mad: madCarry } = computeRobustDistribution(rawCarry);
    const { median: medHarm, mad: madHarm } = computeRobustDistribution(rawHarm);
    const { median: medCohort, mad: madCohort } = computeRobustDistribution(rawCohort);
    const { median: medHawkes, mad: madHawkes } = computeRobustDistribution(rawHawkes);

    const robustScale = Math.max(1e-6, 1.4826 * madLog);
    const slope = 1.0 + 2.0 * hurst;

    for (let c = 1; c <= N; c++) {
      // Score global continu [0, 100] via fonction sigmoïde différentiable
      const zScore = (rawLogOdds[c] - medLog) / robustScale;
      const scoreVal = 100.0 / (1.0 + Math.exp(-slope * zScore));
      scores[c] = clamp(scoreVal, 0.5, 99.5);

      // Décomposition des canaux en scores continus [0, 100]
      const zTrans = (rawTrans[c] - medTrans) / Math.max(1e-6, 1.4826 * madTrans);
      const zCarry = (rawCarry[c] - medCarry) / Math.max(1e-6, 1.4826 * madCarry);
      const zHarm = (rawHarm[c] - medHarm) / Math.max(1e-6, 1.4826 * madHarm);
      const zCohort = (rawCohort[c] - medCohort) / Math.max(1e-6, 1.4826 * madCohort);
      const zHawkes = (rawHawkes[c] - medHawkes) / Math.max(1e-6, 1.4826 * madHawkes);

      channelDetails[c].transitionScore = clamp(100.0 / (1.0 + Math.exp(-slope * zTrans)), 1.0, 99.0);
      channelDetails[c].carryOverScore = clamp(100.0 / (1.0 + Math.exp(-slope * zCarry)), 1.0, 99.0);
      channelDetails[c].harmonicScore = clamp(100.0 / (1.0 + Math.exp(-slope * zHarm)), 1.0, 99.0);
      channelDetails[c].cohortScore = clamp(100.0 / (1.0 + Math.exp(-slope * zCohort)), 1.0, 99.0);
      channelDetails[c].hawkesScore = clamp(100.0 / (1.0 + Math.exp(-slope * zHawkes)), 1.0, 99.0);
      channelDetails[c].hawkesExcitation = Number(hawkesRes.netExcitations[c].toFixed(4));

      if (zTrans > 1.25 && !channelDetails[c].flags.includes('HAUTE_TRANSITION')) {
        channelDetails[c].flags.push('HAUTE_TRANSITION');
      }

      if (zHawkes > 1.25 && !channelDetails[c].flags.includes('HAWKES_EXCITATION')) {
        channelDetails[c].flags.push('HAWKES_EXCITATION');
      }

      if (lagCount > 1 && hawkesRes.lagExcitations.subarray(1).reduce((a, b) => a + b, 0) > 0.20 * Math.max(1e-6, hawkesRes.totalEnergy)) {
        if (zHawkes > 0.75 && !channelDetails[c].flags.includes('HAWKES_REMANENCE')) {
          channelDetails[c].flags.push('HAWKES_REMANENCE');
        }
      }

      // Confiance continue basée sur la taille d'échantillon et le contraste de signal
      const sampleConfidence = Math.sqrt(sampleSize / (sampleSize + 15.0));
      const signalContrast = Math.tanh(Math.abs(zScore) / 2.0);
      confidences[c] = clamp(sampleConfidence * 0.65 + signalContrast * 0.35, 0.2, 0.98);
    }

    const cachePayload: InterDrawPluginCache = {
      scores,
      confidence: confidences,
      channelDetails,
      median: medLog,
      mad: madLog,
      familyId: family.id,
      familyName: family.name,
      predecessorName: predName,
      activePredWinners,
      carryOverLift,
      mirrorLift,
      complementLift,
      sampleSize,
      signalDetected: true,
      hawkesTotalEnergy: Number(hawkesRes.totalEnergy.toFixed(4)),
      hawkesBetaDecay: Number(betaDecay.toFixed(4)),
      hawkesLagExcitations: Array.from(hawkesRes.lagExcitations).map(e => Number(e.toFixed(4)))
    };

    ctx.pluginCache[AlgoKey.INTER_DRAW_RESONANCE] = cachePayload;

    // Persistance dans le cache global sous la clé d'isolation canonique
    try {
      globalCache.set(canonicalCacheKey, cachePayload, CACHE_TTL.LONG, drawName);
    } catch (e) { /* Silenced */ }
  },

  evaluate(num: number, ctx: AlgorithmContext) {
    const defaultRes = {
      score: 50.0,
      confidence: 0.5,
      metadata: {
        familyId: 'NONE',
        familyName: 'Tirage Isolé',
        predecessorName: 'N/A',
        transitionScore: 50.0,
        carryOverScore: 50.0,
        harmonicScore: 50.0,
        cohortScore: 50.0,
        hawkesScore: 50.0,
        hawkesExcitation: 0.0,
        flags: [],
        signalDetected: false
      }
    };

    if (!ctx.pluginCache?.[AlgoKey.INTER_DRAW_RESONANCE]) {
      this.precompute(ctx);
    }

    const cache = ctx.pluginCache?.[AlgoKey.INTER_DRAW_RESONANCE] as InterDrawPluginCache | undefined;
    if (!cache) {
      return defaultRes;
    }

    const score = cache.scores[num] ?? 50.0;
    const confidence = cache.confidence[num] ?? 0.5;
    const detail = cache.channelDetails[num] || {
      transitionScore: 50.0,
      carryOverScore: 50.0,
      harmonicScore: 50.0,
      cohortScore: 50.0,
      hawkesScore: 50.0,
      hawkesExcitation: 0.0,
      flags: []
    };

    return {
      score: Number(score.toFixed(2)),
      confidence: Number(confidence.toFixed(3)),
      metadata: {
        familyId: cache.familyId,
        familyName: cache.familyName,
        predecessorName: cache.predecessorName,
        transitionScore: Number(detail.transitionScore.toFixed(1)),
        carryOverScore: Number(detail.carryOverScore.toFixed(1)),
        harmonicScore: Number(detail.harmonicScore.toFixed(1)),
        cohortScore: Number(detail.cohortScore.toFixed(1)),
        hawkesScore: Number((detail.hawkesScore ?? 50.0).toFixed(1)),
        hawkesExcitation: Number((detail.hawkesExcitation ?? 0.0).toFixed(4)),
        flags: detail.flags,
        carryOverLift: Number(cache.carryOverLift.toFixed(2)),
        mirrorLift: Number(cache.mirrorLift.toFixed(2)),
        complementLift: Number(cache.complementLift.toFixed(2)),
        sampleSize: cache.sampleSize,
        signalDetected: cache.signalDetected
      }
    };
  }
};
