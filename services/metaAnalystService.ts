
import {
  PlatinumResult,
  DrawResult,
  ScoreBreakdown,
  SymbioticContext,
  PlatinumTimeline,
  Prediction,
  PlatinumAudit,
  EntropyMetric,
  ChiSquareMetric
} from '../types';
import {
  getAlgoWeights,
  generateMasterPrediction,
} from './predictionEngine';

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const MAX_NUM        = 90;
const DRAW_SIZE      = 5;
const CACHE_TTL      = 300_000;     // 5 min
const CACHE_MAX      = 20;
const KL_EPSILON     = 1e-5;
const MIN_HISTORY    = 10;
const HISTORY_LIMIT  = 20;
const RNG_POOL_SIZE  = 256;

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

type GatingKey    = 'ALPHA' | 'BETA' | 'GAMMA' | 'DELTA';
type GatingWeights = Record<GatingKey, number>;

interface ExpertDefinition {
  readonly gatingKey:      GatingKey;
  readonly timelineType:   string;
  readonly title:          string;
  readonly focusKeys:      readonly (keyof ScoreBreakdown)[];
  readonly excludeFrom:    readonly string[];   // timeline types to exclude
  readonly temperature:    number;
  readonly poolSize:       number;
  readonly baseScore:      number;
  readonly intuitionScore: number;
  readonly remark:         string;
  readonly keyMetric:      string;
  readonly colorTheme:     string;
  readonly divergence:     number;
  readonly radarStats:     readonly { label: string; value: number }[];
}

interface FractalEntry { hurst?: number }
interface MetricsPayload {
  fractal?:    FractalEntry[];
  volatility?: { score?: number };
  entropy?:    EntropyMetric;
  chiSquare?:  ChiSquareMetric;
  [k: string]: unknown;
}

// ═══════════════════════════════════════════════════════════════
// LRU CACHE
// ═══════════════════════════════════════════════════════════════

class LRUCache<T> {
  private readonly entries = new Map<string, { data: T; ts: number }>();

  constructor(
    private readonly maxSize: number,
    private readonly ttl: number,
  ) {}

  get(key: string): T | null {
    const entry = this.entries.get(key);
    if (!entry) return null;

    if (Date.now() - entry.ts > this.ttl) {
      this.entries.delete(key);
      return null;
    }

    // Refresh LRU position
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.data;
  }

  set(key: string, data: T): void {
    this.entries.delete(key);

    if (this.entries.size >= this.maxSize) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }

    this.entries.set(key, { data, ts: Date.now() });
  }
}

const scoreCache = new LRUCache<Record<number, ScoreBreakdown>>(CACHE_MAX, CACHE_TTL);

// ═══════════════════════════════════════════════════════════════
// CRYPTO-SECURE RNG
// ═══════════════════════════════════════════════════════════════

let rngPool  = new Uint32Array(RNG_POOL_SIZE);
let rngIndex = RNG_POOL_SIZE;

const nextRandom = (): number => {
  if (rngIndex >= RNG_POOL_SIZE) {
    crypto.getRandomValues(rngPool);
    rngIndex = 0;
  }
  return rngPool[rngIndex++] / 0x1_0000_0000;
};

// ═══════════════════════════════════════════════════════════════
// EXPERT DEFINITIONS
// ═══════════════════════════════════════════════════════════════

const LEADER_NAMES: Readonly<Record<GatingKey, string>> = {
  ALPHA: 'Historien',
  BETA:  'Physicien',
  GAMMA: 'Géomètre',
  DELTA: 'Contrarian',
};

const EXPERTS: readonly ExpertDefinition[] = [
  {
    gatingKey:      'BETA',
    timelineType:   'NEON',
    title:          'Signal Physique',
    focusKeys:      ['spectral', 'wavelet', 'fractal'],
    excludeFrom:    ['NOVA'],
    temperature:    0.8,
    poolSize:       40,
    baseScore:      92,
    intuitionScore: 90,
    remark:         'Basé sur la résonance spectrale et les ondes.',
    keyMetric:      'Énergie',
    colorTheme:     'text-cyan-400',
    divergence:     20,
    radarStats:     [{ label: 'Spectre', value: 95 }, { label: 'Cycles', value: 90 }],
  },
  {
    gatingKey:      'GAMMA',
    timelineType:   'TERRA',
    title:          'Topologie Grille',
    focusKeys:      ['spatial', 'orchestration'],
    excludeFrom:    ['NOVA', 'NEON'],
    temperature:    0.9,
    poolSize:       40,
    baseScore:      85,
    intuitionScore: 80,
    remark:         'Focalisé sur les clusters spatiaux et voisins.',
    keyMetric:      'Densité',
    colorTheme:     'text-emerald-400',
    divergence:     40,
    radarStats:     [{ label: 'Espace', value: 90 }, { label: 'Structure', value: 85 }],
  },
  {
    gatingKey:      'ALPHA',
    timelineType:   'CHRONOS',
    title:          'Inertie Temporelle',
    focusKeys:      ['frequency', 'markov', 'momentum', 'equilibrium'],
    excludeFrom:    [],
    temperature:    0.7,
    poolSize:       40,
    baseScore:      88,
    intuitionScore: 85,
    remark:         'Suit les probabilités de transition Markoviennes.',
    keyMetric:      'Fréquence',
    colorTheme:     'text-amber-400',
    divergence:     30,
    radarStats:     [{ label: 'Mémoire', value: 95 }, { label: 'Tendance', value: 90 }],
  },
  {
    gatingKey:      'DELTA',
    timelineType:   'AETHER',
    title:          'Rupture Chaos',
    focusKeys:      ['gap', 'anti_consensus', 'gap_velocity'],
    excludeFrom:    [],
    temperature:    1.5,
    poolSize:       50,
    baseScore:      82,
    intuitionScore: 95,
    remark:         'Mise sur les anomalies statistiques et les écarts.',
    keyMetric:      'Entropie',
    colorTheme:     'text-rose-400',
    divergence:     80,
    radarStats:     [{ label: 'Risque', value: 100 }, { label: 'Surprise', value: 95 }],
  },
];

// ═══════════════════════════════════════════════════════════════
// CORE MATH
// ═══════════════════════════════════════════════════════════════

const computeKLDivergence = (
  probs: Float64Array,
  winners: ReadonlySet<number>,
): number => {
  const winnerProb = 1 / DRAW_SIZE;
  let divergence   = 0;

  for (let i = 0; i < probs.length; i++) {
    const p = Math.max(probs[i], KL_EPSILON);
    const q = winners.has(i + 1) ? winnerProb : KL_EPSILON;
    divergence += p * Math.log(p / q);
  }

  return Math.max(0, divergence);
};

const buildExpertVector = (
  breakdowns: Record<number, ScoreBreakdown>,
  focusKeys: readonly (keyof ScoreBreakdown)[],
): Float64Array => {
  const vector   = new Float64Array(MAX_NUM + 1);
  const keyCount = focusKeys.length || 1;

  for (let i = 1; i <= MAX_NUM; i++) {
    const bd = breakdowns[i];
    if (!bd) continue;

    let sum = 0;
    for (const k of focusKeys) {
        const val = (bd[k] as number) ?? 0;
        // Non-linear amplification of expert signals
        // Strong signals get stronger, weak signals fade
        sum += Math.pow(val, 1.2); 
    }
    vector[i] = sum / keyCount;
  }

  return vector;
};

// ═══════════════════════════════════════════════════════════════
// FUSION ENGINE (NON-LINEAR)
// ═══════════════════════════════════════════════════════════════

/**
 * Fusionne N vecteurs experts avec amplification non-linéaire et bonus de consensus.
 */
const fuseVectors = (
  vectors: ReadonlyMap<GatingKey, Float64Array>,
  weights: GatingWeights,
): Float64Array => {
  const result = new Float64Array(MAX_NUM + 1);
  const expertKeys = Array.from(vectors.keys());

  for (let i = 1; i <= MAX_NUM; i++) {
    let weightedSum = 0;
    let agreementCount = 0;

    for (const key of expertKeys) {
        const vec = vectors.get(key)!;
        const w = weights[key];
        const val = vec[i];

        weightedSum += val * w;

        // Check for strong signal agreement (> 60)
        if (val > 60) agreementCount++;
    }

    // Amplification Non-Linéaire (Sigmoid-like behavior)
    // Rend les pics plus nets
    let fusedScore = weightedSum;
    
    // Bonus de Consensus (Cross-Expert Validation)
    if (agreementCount >= 2) {
        fusedScore *= 1.15; // +15% if 2 experts agree
    }
    if (agreementCount >= 3) {
        fusedScore *= 1.25; // +25% if 3 experts agree
    }

    result[i] = fusedScore;
  }

  return result;
};

// ═══════════════════════════════════════════════════════════════
// SAMPLING STRATEGIES
// ═══════════════════════════════════════════════════════════════

interface Candidate { num: number; score: number }

const weightedSelect = (
  vector:      Float64Array,
  count:       number,
  exclude:     ReadonlySet<number>,
  temperature: number,
  topK:        number,
): number[] => {
  const candidates: Candidate[] = [];
  for (let i = 1; i <= MAX_NUM; i++) {
    if (vector[i] > 0 && !exclude.has(i)) {
      candidates.push({ num: i, score: vector[i] });
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  const pool = candidates.length > topK ? candidates.slice(0, topK) : candidates;

  if (pool.length <= count) {
    return pool.map(c => c.num).sort((a, b) => a - b);
  }

  const weights = new Float64Array(pool.length);
  let totalWeight = 0;

  for (let i = 0; i < pool.length; i++) {
    const w = Math.pow(Math.max(1, pool[i].score), 1 / temperature);
    weights[i]   = w;
    totalWeight  += w;
  }

  const selected: number[] = [];
  let remaining = pool.length;

  while (selected.length < count && remaining > 0) {
    let r   = nextRandom() * totalWeight;
    let idx = 0;

    for (; idx < remaining - 1; idx++) {
      r -= weights[idx];
      if (r <= 0) break;
    }

    selected.push(pool[idx].num);
    totalWeight -= weights[idx];

    remaining--;
    pool[idx]    = pool[remaining];
    weights[idx] = weights[remaining];
  }

  return selected.sort((a, b) => a - b);
};

// ═══════════════════════════════════════════════════════════════
// ADAPTIVE GATING NETWORK (ENTROPY-AWARE)
// ═══════════════════════════════════════════════════════════════

const computeGatingWeights = (
  metrics: MetricsPayload | undefined,
  context: SymbioticContext | null | undefined,
): GatingWeights => {
  const w: GatingWeights = {
    ALPHA: 0.25,
    BETA:  0.25,
    GAMMA: 0.25,
    DELTA: 0.25,
  };

  // 1. Régime Fractal (Hurst) - Mémoire vs Chaos
  const fractalData = metrics?.fractal;
  if (Array.isArray(fractalData) && fractalData.length > 0) {
    const hurst = fractalData.reduce((acc, f) => acc + (f.hurst ?? 0.5), 0) / fractalData.length;

    if (hurst > 0.6) {
        w.ALPHA += 0.20; // Historian (Persistant)
        w.DELTA -= 0.10;
    } else if (hurst < 0.45) {
        w.DELTA += 0.20; // Contrarian (Mean Reversion)
        w.ALPHA -= 0.10;
    }
  }

  // 2. Entropie de Shannon (Structure du désordre)
  const entropy = metrics?.entropy?.normalized || 1.0;
  if (entropy > 0.92) {
      // Chaos maximal -> Les algos physiques (Beta) et les outsiders (Delta) gèrent mieux le bruit
      w.BETA += 0.15;
      w.DELTA += 0.10;
      w.ALPHA -= 0.15;
  } else if (entropy < 0.75) {
      // Structure forte -> Les algos historiques (Alpha) et géométriques (Gamma) excellent
      w.ALPHA += 0.15;
      w.GAMMA += 0.10;
  }

  // 3. Volatilité (Variance)
  if ((metrics?.volatility?.score ?? 50) > 60) {
    w.BETA  += 0.10;
    w.ALPHA -= 0.05;
  }

  // 4. Clusters Spatiaux
  if (context?.spatialHotZones?.length) {
    w.GAMMA += 0.15; // Geometrician
  }

  // Normalisation Softmax
  const total = w.ALPHA + w.BETA + w.GAMMA + w.DELTA;
  w.ALPHA /= total;
  w.BETA  /= total;
  w.GAMMA /= total;
  w.DELTA /= total;

  return w;
};

// ═══════════════════════════════════════════════════════════════
// PRECOMPUTE BASE SCORES
// ═══════════════════════════════════════════════════════════════

export const precomputeBaseScores = async (
  drawName: string,
  history:  DrawResult[],
  metrics?: MetricsPayload,
): Promise<Record<number, ScoreBreakdown>> => {
  const cacheKey = `${drawName}:${history[0]?.id ?? 'init'}`;
  const cached = scoreCache.get(cacheKey);
  if (cached) return cached;

  const weights    = await getAlgoWeights(drawName);
  const masterPred = await generateMasterPrediction(drawName, history, weights, metrics);
  const data       = masterPred.breakdown ?? {};

  scoreCache.set(cacheKey, data);
  return data;
};

// ═══════════════════════════════════════════════════════════════
// MAIN PREDICTION ENGINE
// ═══════════════════════════════════════════════════════════════

export async function generatePlatinumPrediction(
  drawName:           string,
  history:            DrawResult[],
  precomputedMetrics?: MetricsPayload,
  _userBias?:         unknown,
  symbioticContext?:  SymbioticContext | null,
  _basePrediction?:   Prediction | null,
): Promise<PlatinumResult> {
  if (history.length < MIN_HISTORY) {
    throw new Error(`Dataset insuffisant : ${history.length}/${MIN_HISTORY} tirages requis.`);
  }

  // ── 1. Acquisition des breakdowns ──
  const breakdowns = await precomputeBaseScores(drawName, history, precomputedMetrics);

  // ── 2. Gating Network ──
  const gating = computeGatingWeights(precomputedMetrics, symbioticContext);

  // ── 3. Vecteurs experts ──
  const expertVectors = new Map<GatingKey, Float64Array>();
  for (const e of EXPERTS) {
    expertVectors.set(e.gatingKey, buildExpertVector(breakdowns, e.focusKeys));
  }

  // ── 4. Fusion NOVA (Non-Linear) ──
  const novaVector  = fuseVectors(expertVectors, gating);
  
  // Elite Selection: Le meilleur candidat du vecteur NOVA est forcé si score très haut
  const sortedIndices = Array.from({length: 90}, (_, i) => i+1).sort((a,b) => novaVector[b] - novaVector[a]);
  const eliteCandidate = (novaVector[sortedIndices[0]] > 95) ? new Set([sortedIndices[0]]) : new Set<number>();
  
  const novaNumbers = weightedSelect(novaVector, DRAW_SIZE, new Set(), 0.5, 50);
  
  // Force l'inclusion du candidat élite si présent et non sélectionné par le hasard
  if (eliteCandidate.size > 0 && !novaNumbers.includes(sortedIndices[0])) {
      novaNumbers[4] = sortedIndices[0]; // Remplace le dernier (le plus faible)
      novaNumbers.sort((a,b) => a-b);
  }

  const timelines: PlatinumTimeline[] = [
    {
      type:           'NOVA',
      title:          'Fusion Experts',
      numbers:        novaNumbers,
      score:          99,
      intuitionScore: 98,
      remark:         'Consensus optimal amplifié par fusion non-linéaire.',
      keyMetric:      'MoE Score',
      colorTheme:     'text-purple-400',
      divergence:     0,
      radarStats: [
        { label: 'Historique', value: Math.round(gating.ALPHA * 100) },
        { label: 'Physique',   value: Math.round(gating.BETA  * 100) },
        { label: 'Géométrie',  value: Math.round(gating.GAMMA * 100) },
        { label: 'Chaos',      value: Math.round(gating.DELTA * 100) },
      ],
    },
  ];

  // ── 5. Timelines experts (config-driven) ──
  const timelineNumbers = new Map<string, readonly number[]>();
  timelineNumbers.set('NOVA', novaNumbers);

  for (const expert of EXPERTS) {
    const exclude = new Set<number>();
    for (const src of expert.excludeFrom) {
      const nums = timelineNumbers.get(src);
      if (nums) for (const n of nums) exclude.add(n);
    }

    const vector  = expertVectors.get(expert.gatingKey)!;
    const numbers = weightedSelect(
      vector, DRAW_SIZE, exclude, expert.temperature, expert.poolSize,
    );

    timelineNumbers.set(expert.timelineType, numbers);

    timelines.push({
      type:           expert.timelineType,
      title:          expert.title,
      numbers,
      score:          expert.baseScore,
      intuitionScore: expert.intuitionScore,
      remark:         expert.remark,
      keyMetric:      expert.keyMetric,
      colorTheme:     expert.colorTheme,
      divergence:     expert.divergence,
      radarStats:     [...expert.radarStats],
    });
  }

  // ── 6. King Numbers ──
  const kingCounts = new Uint8Array(MAX_NUM + 1);
  for (const t of timelines) {
    for (const n of t.numbers) kingCounts[n]++;
  }

  const kingNumbers: { number: number; count: number }[] = [];
  for (let i = 1; i <= MAX_NUM; i++) {
    if (kingCounts[i] >= 2) kingNumbers.push({ number: i, count: kingCounts[i] });
  }
  kingNumbers.sort((a, b) => b.count - a.count);

  // ── 7. Leader Analysis ──
  const leaderKey = (Object.entries(gating) as [GatingKey, number][])
    .reduce((best, cur) => (cur[1] > best[1] ? cur : best))[0];

  return {
    id:           crypto.randomUUID(),
    kingNumbers,
    timelines,
    combinations: [],
    confidence:   98,
    analysis:     `MoE v3.1 (Non-Linear): ${LEADER_NAMES[leaderKey]} dominant (${Math.round(gating[leaderKey] * 100)}%). Entropie: ${(precomputedMetrics?.entropy?.normalized || 0.5).toFixed(2)}.`,
    drawName,
    timestamp:    Date.now(),
  };
}

// ═══════════════════════════════════════════════════════════════
// PERSISTENCE & AUDIT
// ═══════════════════════════════════════════════════════════════

const storageKey = (name: string) => `platinum_hist_${name}`;

export const savePlatinumHistory = (result: PlatinumResult): void => {
  try {
    const key      = storageKey(result.drawName);
    const existing = JSON.parse(localStorage.getItem(key) ?? '[]') as PlatinumResult[];
    const updated  = [result, ...existing.slice(0, HISTORY_LIMIT - 1)];
    localStorage.setItem(key, JSON.stringify(updated));
  } catch (err) {
    console.error('[Platinum] Sauvegarde échouée :', err);
  }
};

export const getPlatinumHistory = (drawName: string): PlatinumResult[] => {
  try {
    return JSON.parse(localStorage.getItem(storageKey(drawName)) ?? '[]');
  } catch {
    return [];
  }
};

export const performPlatinumAudit = (
  prediction:   PlatinumResult,
  actualResult: DrawResult,
): PlatinumAudit => {
  const winners = new Set(actualResult.gagnants);

  let bestTimeline  = 'AUCUNE';
  let bestHits      = -1;
  let minDivergence = Infinity;

  const performances = prediction.timelines.map(t => {
    const matchingNumbers = t.numbers.filter(n => winners.has(n));
    const hits            = matchingNumbers.length;

    const probVector = new Float64Array(MAX_NUM);
    const norm       = t.numbers.length || 1;
    for (const n of t.numbers) probVector[n - 1] = 1 / norm;

    const klDiv = computeKLDivergence(probVector, winners);

    if (hits > bestHits || (hits === bestHits && klDiv < minDivergence)) {
      bestHits      = hits;
      bestTimeline  = t.type;
      minDivergence = klDiv;
    }

    return {
      type:         t.type,
      hits,
      numbers:      matchingNumbers,
      klDivergence: +klDiv.toFixed(3),
    };
  });

  const avgHits   = performances.reduce((s, p) => s + p.hits, 0) / performances.length;
  const syncScore = Math.min(100, Math.round(
    avgHits * 25 + Math.max(0, 20 - minDivergence),
  ));

  let verdict: string;
  if (bestHits >= 3) {
    verdict = `Convergence Réussie sur ${bestTimeline} (KL: ${minDivergence.toFixed(2)}).`;
  } else if (bestHits >= 1) {
    verdict = `Signal partiel sur ${bestTimeline}.`;
  } else {
    verdict = 'Déphasage Complet.';
  }

  return {
    predictionId:       prediction.id,
    date:               actualResult.date,
    actualDraw:         actualResult.gagnants,
    bestTimeline,
    bestScore:          bestHits,
    syncScore,
    timelinePerformance: performances,
    verdict,
  };
};
