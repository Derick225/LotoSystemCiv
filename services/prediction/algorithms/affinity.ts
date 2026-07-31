import { AlgoKey } from '../../../shared/prediction.types';
import { AlgorithmPlugin } from '../algorithmRegistry';

interface GameProfile {
  name: string;
  mainMax: number;
  mainCount: number;
  specialMax: number;
  specialCount: number;
  isSpecialActive: boolean;
}

function getGameProfile(drawName: string): GameProfile {
  const lower = drawName.toLowerCase();
  if (lower.includes("euromillions") || lower.includes("euro million")) {
    return { name: "EuroMillions", mainMax: 50, mainCount: 5, specialMax: 12, specialCount: 2, isSpecialActive: true };
  }
  if (lower.includes("powerball")) {
    return { name: "Powerball", mainMax: 69, mainCount: 5, specialMax: 26, specialCount: 1, isSpecialActive: true };
  }
  if (lower.includes("mega million") || lower.includes("megamillion")) {
    return { name: "Mega Millions", mainMax: 70, mainCount: 5, specialMax: 25, specialCount: 1, isSpecialActive: true };
  }
  return { name: "Loto 5/90", mainMax: 90, mainCount: 5, specialMax: 90, specialCount: 5, isSpecialActive: true };
}

export const affinityPlugin: AlgorithmPlugin = {
  key: AlgoKey.AFFINITY,
  category: 'advanced',
  stability: 'experimental',
  mathematicalBasis: 'Régularisation de Copules Jointes de Gumbel et Clayton (Asymétrie des Queues Intra-Jeu)',
  description: 'Analyse la co-occurrence synergique asymétrique et non-linéaire des boules spéciales et principales au sein du jeu via les Copules de Gumbel et Clayton.',
  isStrictlyDeterministic: true,

  precompute(ctx) {
    const drawName = ctx.drawName || "Loto 5/90";
    const profile = getGameProfile(drawName);
    const mainMax = profile.mainMax;
    const specialMax = profile.specialMax;

    const history = ctx.history || [];
    
    const countMain = new Float64Array(mainMax + 1);
    const countSpecial = new Float64Array(specialMax + 1);
    const jointCount = Array(mainMax + 1).fill(0).map(() => new Float64Array(specialMax + 1));

    let totalDrawsWithSpecial = 0;

    for (const draw of history) {
      const winners = draw.gagnants || [];
      const specials = draw.machine || [];

      if (winners.length > 0 && specials.length > 0) {
        totalDrawsWithSpecial++;
        for (const w of winners) {
          if (w >= 1 && w <= mainMax) {
            countMain[w]++;
          }
        }
        for (const s of specials) {
          if (s >= 1 && s <= specialMax) {
            countSpecial[s]++;
          }
        }
        for (const w of winners) {
          for (const s of specials) {
            if (w >= 1 && w <= mainMax && s >= 1 && s <= specialMax) {
              jointCount[w][s]++;
            }
          }
        }
      }
    }

    if (totalDrawsWithSpecial === 0) {
      ctx.pluginCache = ctx.pluginCache || {};
      ctx.pluginCache[AlgoKey.AFFINITY] = {
        rawCopulaScores: new Float64Array(mainMax + 1),
        median: 0,
        iqr: 1.0,
        mainMax
      };
      return;
    }

    // Assignation des marginales uniformes U et V par fractional ranking stable sur [0.01, 0.99]
    const getUniformMarginals = (counts: Float64Array, maxVal: number): Float64Array => {
      const marginals = new Float64Array(maxVal + 1);
      const indexed = Array.from({ length: maxVal }, (_, i) => ({ val: counts[i + 1], index: i + 1 }));
      indexed.sort((a, b) => a.val - b.val);
      
      for (let r = 0; r < maxVal; r++) {
        const item = indexed[r];
        marginals[item.index] = 0.01 + 0.98 * (r / (maxVal - 1 || 1));
      }
      return marginals;
    };

    const u = getUniformMarginals(countMain, mainMax);
    const v = getUniformMarginals(countSpecial, specialMax);

    // Estimation continue des coefficients d'association Gumbel et Clayton
    let sumExcess = 0;
    let countExcess = 0;
    let sumDeficit = 0;
    let countDeficit = 0;

    for (let i = 1; i <= mainMax; i++) {
      const pI = countMain[i] / totalDrawsWithSpecial;
      if (pI === 0) continue;
      for (let j = 1; j <= specialMax; j++) {
        const pJ = countSpecial[j] / totalDrawsWithSpecial;
        if (pJ === 0) continue;

        const pJoint = jointCount[i][j] / totalDrawsWithSpecial;
        const ratio = pJoint / (pI * pJ);

        if (ratio > 1.0) {
          sumExcess += (ratio - 1.0);
          countExcess++;
        } else if (ratio < 1.0) {
          sumDeficit += (1.0 - ratio);
          countDeficit++;
        }
      }
    }

    const avgExcess = countExcess > 0 ? sumExcess / countExcess : 0.05;
    const avgDeficit = countDeficit > 0 ? sumDeficit / countDeficit : 0.05;

    const thetaGumbel = 1.0 + Math.log(1.0 + avgExcess);
    const thetaClayton = Math.max(0.1, Math.log(1.0 + avgDeficit));

    const rawCopulaScores = new Float64Array(mainMax + 1);

    for (let i = 1; i <= mainMax; i++) {
      let copulaSum = 0;
      let totalWeight = 0;
      const uVal = u[i];

      for (let j = 1; j <= specialMax; j++) {
        const vVal = v[j];
        const pI = countMain[i] / totalDrawsWithSpecial;
        const pJ = countSpecial[j] / totalDrawsWithSpecial;
        const pJoint = jointCount[i][j] / totalDrawsWithSpecial;

        let cValue = 0;
        if (pJoint > pI * pJ) {
          // Gumbel copula (positive tail dependency)
          const logU = -Math.log(uVal);
          const logV = -Math.log(vVal);
          cValue = Math.exp(-Math.pow(Math.pow(logU, thetaGumbel) + Math.pow(logV, thetaGumbel), 1.0 / thetaGumbel));
        } else {
          // Clayton copula (negative tail dependency)
          cValue = Math.pow(Math.max(1e-15, Math.pow(uVal, -thetaClayton) + Math.pow(vVal, -thetaClayton) - 1.0), -1.0 / thetaClayton);
        }

        // Pondération de la copule par l'importance de la boule spéciale
        copulaSum += cValue * vVal;
        totalWeight += vVal;
      }

      rawCopulaScores[i] = totalWeight > 0 ? copulaSum / totalWeight : 0;
    }

    // Statistiques de centrage robustes
    const validScores = Array.from(rawCopulaScores.slice(1, mainMax + 1));
    let median = 0;
    let iqr = 1.0;
    if (validScores.length > 0) {
      const sorted = [...validScores].sort((a, b) => a - b);
      median = sorted[Math.floor(sorted.length / 2)];
      const q1 = sorted[Math.floor(sorted.length * 0.25)];
      const q3 = sorted[Math.floor(sorted.length * 0.75)];
      iqr = Math.max(1e-6, q3 - q1);
    }

    ctx.pluginCache = ctx.pluginCache || {};
    ctx.pluginCache[AlgoKey.AFFINITY] = {
      rawCopulaScores,
      median,
      iqr,
      mainMax
    };
  },

  evaluate(num, ctx) {
    if (!ctx.pluginCache?.[AlgoKey.AFFINITY]) {
      this.precompute(ctx);
    }
    const cache = ctx.pluginCache![AlgoKey.AFFINITY];
    const rawCopulaScores = cache.rawCopulaScores;
    const median = cache.median;
    const iqr = cache.iqr;
    const mainMax = cache.mainMax;

    if (num < 1 || num > mainMax) {
      return { score: 0, confidence: 0.5 };
    }

    const rawScore = rawCopulaScores[num] || 0.0;
    const zScore = (rawScore - median) / iqr;
    const score = 100.0 / (1.0 + Math.exp(-2.0 * zScore));

    return {
      score: Math.max(0.0, Math.min(100.0, score)),
      confidence: 0.85,
      metadata: { rawScore, zScore }
    };
  }
};

