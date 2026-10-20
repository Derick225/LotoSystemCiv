/**
 * Calibration en Ligne Monotone & Intervalles Conformes (AGENTS.md)
 *
 * 1. Calibrateur monotone C¹ : isotonic regression (PAVA) pour la
 *    monotonie exacte, puis interpolation cubique d'Hermite régularisée par
 *    la méthode de Fritsch–Carlson pour la continuité des pentes — aucune
 *    marche discontinue, conforme au principe de continuité des transitions.
 * 2. ECE (Expected Calibration Error) avec nombre de bins dérivé de la
 *    taille d'échantillon : B = clamp(round(√n), 3, 10) — précédent du
 *    moteur Rust (calibration.rs), aucune constante d'échelle arbitraire.
 * 3. Intervalle conforme distribution-free sur les résidus |observé − attendu| :
 *    quantile d'ordre k = ceil((n+1)·couverture) sur les résidus triés.
 *    Couverture dérivée de l'échantillon : 1 − 1/√(n+1) (loi de concentration
 *    en √n : l'intervalle se resserre comme les données s'accumulent).
 *
 * 100% déterministe : aucun PRNG, tri stable par valeur puis indice.
 */

export interface CalibrationPairs {
  /** Probabilités prédites (domaine [0, 1]) */
  p: number[];
  /** Issues réelles binaires (1 = sorti, 0 = non sorti) */
  y: number[];
}

export interface CalibrationKnot {
  x: number;
  y: number;
  weight: number;
}

export interface MonotoneCalibrator {
  /** Application de la carte de calibration à une probabilité brute */
  apply: (p: number) => number;
  /** Nœuds de la courbe isotonique (moyennes par bloc PAVA) */
  knots: CalibrationKnot[];
  /** Nombre de blocs monotone — diagnostic de complexité effective */
  blockCount: number;
}

export interface ConformalInterval {
  center: number;
  lower: number;
  upper: number;
  quantile: number;
  coverage: number;
  sampleSize: number;
}

const ECE_MIN_BINS = 3;
const ECE_MAX_BINS = 10;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/**
 * Nombre de bins ECE dérivé de l'échantillon — même convention que le
 * moteur Rust (round(√n) borné à [3, 10]).
 */
export const deriveEceBinCount = (sampleSize: number): number =>
  Math.max(ECE_MIN_BINS, Math.min(ECE_MAX_BINS, Math.round(Math.sqrt(Math.max(0, sampleSize)))));

/**
 * Couverture conforme dérivée de la taille d'échantillon : 1 − 1/√(n+1).
 * Croît avec les données, laisse un slack minimal 1/(n+1) garant par
 * échangeabilité — aucun seuil de confiance fixe.
 */
export const coverageFromSampleSize = (sampleSize: number): number =>
  sampleSize <= 0 ? 0 : 1 - 1 / Math.sqrt(sampleSize + 1);

interface PavaBlock {
  x: number;
  ySum: number;
  weight: number;
}

/**
 * PAVA (Pool Adjacent Violators) pondéré sur points triés par p, après
 * agrégation des réplicats de même p en une observation unique (poids =
 * effectif). La fusion s'opère dès prev.moyenne >= curr.moyenne : les blocs
 * de moyenne égale fusionnent, garantissant le calibrateur le plus compact
 * et des nœuds à x strictement distincts (interpolation d'Hermite saine).
 */
const runPava = (points: Array<{ x: number; yMean: number; weight: number }>): PavaBlock[] => {
  const blocks: PavaBlock[] = [];
  for (const pt of points) {
    blocks.push({ x: pt.x, ySum: pt.yMean * pt.weight, weight: pt.weight });
    while (blocks.length >= 2) {
      const prev = blocks[blocks.length - 2];
      const curr = blocks[blocks.length - 1];
      if (prev.ySum / prev.weight < curr.ySum / curr.weight) break;
      const merged: PavaBlock = {
        x: (prev.x * prev.weight + curr.x * curr.weight) / (prev.weight + curr.weight),
        ySum: prev.ySum + curr.ySum,
        weight: prev.weight + curr.weight,
      };
      blocks.splice(blocks.length - 2, 2, merged);
    }
  }
  return blocks;
};

/**
 * Dérivées d'Hermite aux nœuds par Fritsch–Butland (moyenne harmonique
 * pondérée des pentes sécantes, nulle aux extremums locaux), puis
 * limitation de pente Fritsch–Carlson (α² + β² ≤ 9) pour la monotonie.
 */
const computeHermiteDerivatives = (xs: number[], ys: number[]): number[] => {
  const k = xs.length;
  const h: number[] = [];
  const delta: number[] = [];
  for (let i = 0; i < k - 1; i++) {
    h.push(Math.max(xs[i + 1] - xs[i], 1e-12));
    delta.push((ys[i + 1] - ys[i]) / h[i]);
  }
  const d = new Array<number>(k).fill(0);
  d[0] = delta[0];
  d[k - 1] = delta[k - 2];
  for (let i = 1; i < k - 1; i++) {
    d[i] = delta[i - 1] * delta[i] <= 0 ? 0 : (delta[i - 1] + delta[i]) / 2;
  }
  for (let i = 0; i < k - 1; i++) {
    if (Math.abs(delta[i]) < 1e-15) {
      d[i] = 0;
      d[i + 1] = 0;
      continue;
    }
    const alpha = d[i] / delta[i];
    const beta = d[i + 1] / delta[i];
    const rho = alpha * alpha + beta * beta;
    if (rho > 9) {
      const tau = 3 / Math.sqrt(rho);
      d[i] = tau * alpha * delta[i];
      d[i + 1] = tau * beta * delta[i];
    }
  }
  return d;
};

/**
 * Ajuste le calibrateur monotone sur les couples (p, y).
 * Cas dégénérés : 0 échantillon → identité ; 1 nœud → constante à la moyenne.
 */
export const fitMonotoneCalibrator = (pairs: CalibrationPairs): MonotoneCalibrator => {
  const n = Math.min(pairs.p.length, pairs.y.length);
  if (n === 0) {
    return {
      apply: (p: number) => clamp01(p),
      knots: [],
      blockCount: 0,
    };
  }

  const order: number[] = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => pairs.p[a] - pairs.p[b] || a - b
  );
  // Agrégation des réplicats de même p : une observation unique par x,
  // de fréquence empirique yMean et de poids = effectif.
  const points: Array<{ x: number; yMean: number; weight: number }> = [];
  for (let i = 0; i < n; i++) {
    const x = clamp01(pairs.p[order[i]]);
    const yObs = clamp01(pairs.y[order[i]]);
    const last = points[points.length - 1];
    if (last && Math.abs(last.x - x) <= 1e-15) {
      last.yMean = (last.yMean * last.weight + yObs) / (last.weight + 1);
      last.weight += 1;
    } else {
      points.push({ x, yMean: yObs, weight: 1 });
    }
  }

  const blocks = runPava(points);
  const knots: CalibrationKnot[] = blocks.map((b) => ({
    x: b.x,
    y: b.ySum / b.weight,
    weight: b.weight,
  }));

  if (knots.length === 1) {
    const c = knots[0].y;
    return { apply: () => clamp01(c), knots, blockCount: 1 };
  }

  const xs = knots.map((k) => k.x);
  const ys = knots.map((k) => k.y);
  const d = computeHermiteDerivatives(xs, ys);

  const apply = (pRaw: number): number => {
    const p = clamp01(pRaw);
    if (p <= xs[0]) return ys[0];
    if (p >= xs[knots.length - 1]) return ys[knots.length - 1];
    let seg = 0;
    while (seg < xs.length - 2 && p > xs[seg + 1]) seg++;
    const h = xs[seg + 1] - xs[seg];
    const t = (p - xs[seg]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    const value =
      h00 * ys[seg] + h10 * h * d[seg] + h01 * ys[seg + 1] + h11 * h * d[seg + 1];
    return clamp01(value);
  };

  return { apply, knots, blockCount: knots.length };
};

/**
 * Expected Calibration Error : moyenne pondérée des écarts
 * |moyenne(p) − moyenne(y)| sur des bins de largeur égale sur [0, 1].
 */
export const computeEce = (pairs: CalibrationPairs, binCount?: number): number => {
  const n = Math.min(pairs.p.length, pairs.y.length);
  if (n === 0) return 0;
  const B = binCount ?? deriveEceBinCount(n);
  const binSumP = new Array<number>(B).fill(0);
  const binSumY = new Array<number>(B).fill(0);
  const binCountObs = new Array<number>(B).fill(0);
  for (let i = 0; i < n; i++) {
    const b = Math.min(B - 1, Math.floor(clamp01(pairs.p[i]) * B));
    binSumP[b] += pairs.p[i];
    binSumY[b] += pairs.y[i];
    binCountObs[b]++;
  }
  let ece = 0;
  for (let b = 0; b < B; b++) {
    if (binCountObs[b] > 0) {
      ece +=
        (binCountObs[b] / n) * Math.abs(binSumP[b] / binCountObs[b] - binSumY[b] / binCountObs[b]);
    }
  }
  return ece;
};

/**
 * Intervalle conforme symétrique sur les résidus |observé − attendu| :
 * quantile d'ordre k = ceil((n+1)·couverture) de la loi empirique des
 * résidus triés (tri stable). Garantie distribution-free par échangeabilité.
 * Les bornes sont repliées sur le domaine structurel [0, maxHits].
 */
export const conformalInterval = (
  residuals: number[],
  center: number,
  maxHits: number,
  coverage?: number
): ConformalInterval => {
  const n = residuals.length;
  const cov = coverage ?? coverageFromSampleSize(n);
  if (n === 0) {
    return { center, lower: 0, upper: maxHits, quantile: maxHits, coverage: 0, sampleSize: 0 };
  }
  const sorted = [...residuals].sort((a, b) => a - b || 0);
  const k = Math.max(1, Math.min(n, Math.ceil((n + 1) * cov)));
  const q = sorted[k - 1];
  return {
    center,
    lower: Math.max(0, center - q),
    upper: Math.min(maxHits, center + q),
    quantile: q,
    coverage: cov,
    sampleSize: n,
  };
};

/**
 * Évaluation honnête leave-one-out de la calibration : pour chaque bloc
 * d'évaluation, ajuste le calibrateur sur tous les autres. 100% déterministe.
 */
export const looEceAfterCalibration = (
  folds: CalibrationPairs[],
  binCount?: number
): number => {
  const totalN = folds.reduce((a, f) => a + Math.min(f.p.length, f.y.length), 0);
  if (folds.length < 2 || totalN === 0) return 0;

  const evalP: number[] = [];
  const evalY: number[] = [];
  for (let k = 0; k < folds.length; k++) {
    const trainP: number[] = [];
    const trainY: number[] = [];
    for (let j = 0; j < folds.length; j++) {
      if (j === k) continue;
      const m = Math.min(folds[j].p.length, folds[j].y.length);
      for (let i = 0; i < m; i++) {
        trainP.push(folds[j].p[i]);
        trainY.push(folds[j].y[i]);
      }
    }
    const calibrator = fitMonotoneCalibrator({ p: trainP, y: trainY });
    const m = Math.min(folds[k].p.length, folds[k].y.length);
    for (let i = 0; i < m; i++) {
      evalP.push(calibrator.apply(folds[k].p[i]));
      evalY.push(folds[k].y[i]);
    }
  }
  return computeEce({ p: evalP, y: evalY }, binCount ?? deriveEceBinCount(totalN));
};
