import { AlgoWeights, DrawResult } from '../../types';
import { LCG } from '../../utils/mathUtils';

export type MetaDrawLike = Pick<DrawResult, 'gagnants'> & {
  id?: string;
  drawName?: string;
  date?: string;
  machine?: number[];
};

/**
 * Construit une graine 100% déterministe à partir du contenu de l'historique,
 * sans jamais recourir à Date.now() même si les dates de tirage sont absentes.
 */
export const buildDeterministicMetaSeed = (hist: MetaDrawLike[]): string => {
  const firstDate = hist[0]?.date;
  if (typeof firstDate === 'string' && firstDate.trim().length > 0) {
    return `meta_${hist.length}_${firstDate.trim()}`;
  }

  let fnv = 0x811c9dc5;
  const depth = Math.min(hist.length, 32);
  for (let i = 0; i < depth; i++) {
    const nums = hist[i]?.gagnants || [];
    for (let j = 0; j < nums.length; j++) {
      fnv ^= (nums[j] & 0xff) ^ ((i + 1) * 31 + j);
      fnv = Math.imul(fnv, 0x01000193) >>> 0;
    }
  }
  return `meta_${hist.length}_fnv_${fnv.toString(16)}`;
};

export const normalizeMetaWeights = (weights: AlgoWeights): AlgoWeights => {
  const sum = Object.values(weights).reduce(
    (a, b) => a + (typeof b === 'number' ? b : 0),
    0
  );
  if (sum === 0) return weights;

  const normalized: Partial<AlgoWeights> = {};
  for (const [key, value] of Object.entries(weights)) {
    if (typeof value === 'number') {
      normalized[key as keyof AlgoWeights] = value / sum;
    }
  }
  return normalized as AlgoWeights;
};

/**
 * Optimisation déterministe des poids algorithmiques par LCG + descente continue modulée par entropie.
 */
export const optimizeMetaWeightsDeterministic = (
  hist: MetaDrawLike[],
  dynamicWeights: AlgoWeights
): AlgoWeights => {
  if (!hist || hist.length === 0) {
    return normalizeMetaWeights({ ...dynamicWeights });
  }

  const entropyHistoryDepth = Math.min(30, hist.length);
  const countsAll: Record<number, number> = {};
  let totalCountAll = 0;
  for (let idx = 0; idx < entropyHistoryDepth; idx++) {
    if (hist[idx] && hist[idx].gagnants) {
      hist[idx].gagnants.forEach((n) => {
        countsAll[n] = (countsAll[n] || 0) + 1;
        totalCountAll++;
      });
    }
  }

  let totalEntropy = 0;
  if (totalCountAll > 0) {
    Object.values(countsAll).forEach((c) => {
      const p = c / totalCountAll;
      if (p > 0) totalEntropy -= p * Math.log2(p);
    });
  }
  const maxPossibleEntropy = Math.log2(90);
  const globalChaosRatio = Math.max(Number.EPSILON, totalEntropy / maxPossibleEntropy);

  const adaptiveWindowSize = Math.max(
    8,
    Math.min(18, Math.round(8 + 10 * globalChaosRatio))
  );
  const recentDraws = hist.slice(
    0,
    Math.max(1, Math.min(adaptiveWindowSize, Math.max(1, hist.length - 11)))
  );

  const lcg = new LCG(buildDeterministicMetaSeed(hist));

  let bestConfig = { ...dynamicWeights };
  let bestFitness = -Infinity;

  const counts: Record<number, number> = {};
  let totalCount = 0;
  recentDraws.forEach((d) =>
    d.gagnants.forEach((n) => {
      counts[n] = (counts[n] || 0) + 1;
      totalCount++;
    })
  );
  let entropy = 0;
  if (totalCount > 0) {
    Object.values(counts).forEach((c) => {
      const p = c / totalCount;
      if (p > 0) entropy -= p * Math.log2(p);
    });
  }
  const maxEntropy = Math.log2(90);
  const chaosLevel = Math.max(Number.EPSILON, entropy / maxEntropy);

  const variations: AlgoWeights[] = [dynamicWeights];
  const numMutations = Math.floor(chaosLevel * 10) + 3;
  for (let i = 0; i < numMutations; i++) {
    const jittered = { ...dynamicWeights };
    Object.keys(jittered).forEach((k) => {
      const key = k as keyof AlgoWeights;
      const drift = 1.0 + (lcg.next() * 2.0 - 1.0) * chaosLevel;
      jittered[key] = (jittered[key] || 0) * Math.max(0, drift);
    });
    variations.push(normalizeMetaWeights(jittered));
  }

  variations.forEach((testWeights) => {
    let fitnessScore = 0;

    recentDraws.forEach((actualDraw, idx) => {
      const histSlice = hist.slice(idx + 1, idx + 40);
      if (histSlice.length < 15) return;

      const testScores: Record<number, number> = {};
      for (let i = 1; i <= 90; i++) testScores[i] = 0;

      const targetDraw = histSlice[0].gagnants;

      histSlice.forEach((h, j) => {
        const decay = Math.pow(0.9, j);

        h.gagnants.forEach((n) => {
          testScores[n] += (testWeights.frequency || 0) * 10 * decay;
          testScores[n] += (testWeights.temporal || 0) * 5 * (j < 5 ? 1 : 0);
        });

        if (j > 0) {
          const currentInTime = h.gagnants;
          const nextInTime = histSlice[j - 1].gagnants;

          currentInTime.forEach((c) => {
            if (targetDraw.includes(c)) {
              nextInTime.forEach((nx) => {
                testScores[nx] += (testWeights.markov || 0) * 8 * decay;
              });
            }
          });

          if (j < 10) {
            currentInTime.forEach((c) => {
              currentInTime.forEach((co) => {
                if (c !== co && targetDraw.includes(c)) {
                  testScores[co] += (testWeights.affinity || 0) * 4 * decay;
                }
              });
            });
          }
        }
      });

      const topScoreArr = Object.entries(testScores).sort(([, a], [, b]) => b - a);
      const top5 = topScoreArr.slice(0, 5).map(([n]) => Number(n));
      const top10 = topScoreArr.slice(0, 10).map(([n]) => Number(n));

      const exactHits = top5.filter((n) => actualDraw.gagnants.includes(n)).length;
      const proximityHits =
        top10.filter((n) => actualDraw.gagnants.includes(n)).length - exactHits;

      fitnessScore += exactHits * 10 + proximityHits * 2.5;
    });

    if (fitnessScore > bestFitness) {
      bestFitness = fitnessScore;
      const lr = chaosLevel;
      Object.keys(testWeights).forEach((k) => {
        const key = k as keyof AlgoWeights;
        bestConfig[key] =
          (dynamicWeights[key] || 0) * (1 - lr) + (testWeights[key] || 0) * lr;
      });
    }
  });

  return normalizeMetaWeights(bestConfig);
};
