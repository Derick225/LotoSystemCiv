import { AlgoKey } from '../../../shared/prediction.types';
import { AlgorithmPlugin } from '../algorithmRegistry';
import { extractDrawNumbers } from '../featureExtractor';

export const machineTransferPlugin: AlgorithmPlugin = {
  key: AlgoKey.MACHINE_TRANSFER,
  category: 'core',
  stability: 'stable',
  mathematicalBasis: 'Transfert Stochastique & Résonance Croisée Machine -> Gagnants (Cross-Markovian Density)',
  description: 'Évalue la probabilité de transition conditionnelle et le carry-over cinématique entre le plateau Machine précédent et les numéros Gagnants.',
  isStrictlyDeterministic: true,

  precompute(ctx) {
    const rawMap = ctx.features.machineTransferMap || new Float32Array(91);
    const domainMax = rawMap.length - 1;
    const values: number[] = [];

    for (let i = 1; i <= domainMax; i++) {
      values.push(rawMap[i] || 0);
    }

    const sorted = [...values].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] || 0;
    const q1 = sorted[Math.floor(sorted.length * 0.25)] || 0;
    const q3 = sorted[Math.floor(sorted.length * 0.75)] || 0;
    const iqr = Math.max(Number.EPSILON, q3 - q1);

    // Analyse du plateau machine le plus récent
    const latestDraw = ctx.history[0];
    const latestMachine = latestDraw ? extractDrawNumbers(latestDraw).machine : [];
    const directMachineSet = new Set(latestMachine);

    // Calcul de la matrice de transfert empirique
    const machineToWinnersWeights = new Float32Array(domainMax + 1);
    let sampleCount = 0;

    for (let h = 0; h < Math.min(ctx.history.length - 1, 40); h++) {
      const current = extractDrawNumbers(ctx.history[h]);
      const prev = extractDrawNumbers(ctx.history[h + 1]);
      if (prev.machine.length === 0 || current.winners.length === 0) continue;

      sampleCount++;
      const decay = Math.exp(-h / 15.0);

      // Direct carry-over (Machine t -> Winner t+1)
      for (const m of prev.machine) {
        if (current.winners.includes(m)) {
          machineToWinnersWeights[m] += decay * 1.5;
        }
        // Near-misses transfer (+/- 1)
        if (m > 1 && current.winners.includes(m - 1)) {
          machineToWinnersWeights[m - 1] += decay * 0.5;
        }
        if (m < domainMax && current.winners.includes(m + 1)) {
          machineToWinnersWeights[m + 1] += decay * 0.5;
        }
      }
    }

    ctx.pluginCache = ctx.pluginCache || {};
    ctx.pluginCache[AlgoKey.MACHINE_TRANSFER] = {
      median,
      iqr,
      directMachineSet,
      machineToWinnersWeights,
      sampleCount,
      hasMachineData: sampleCount > 0 || latestMachine.length > 0,
    };
  },

  evaluate(num, ctx) {
    const cache = ctx.pluginCache?.[AlgoKey.MACHINE_TRANSFER];
    const rawVal = ctx.features.machineTransferMap?.[num] || 0;

    if (!cache || !cache.hasMachineData) {
      // Score nul et confiance nulle si le tirage ne possède pas de données machine
      return { score: 0.0, confidence: 0.0 };
    }

    const zScore = (rawVal - cache.median) / (cache.iqr || 1.0);
    let continuousScore = 1.0 / (1.0 + Math.exp(-zScore));

    // Modulation continue par présence directe au tirage précédent
    if (cache.directMachineSet.has(num)) {
      continuousScore = 0.5 + 0.5 * Math.tanh(continuousScore * 1.8);
    }

    // Modulation par historique de co-occurrence machine
    const empiricalBonus = cache.machineToWinnersWeights[num] || 0;
    if (empiricalBonus > 0) {
      const bonusNorm = Math.tanh(empiricalBonus / 2.0);
      continuousScore = Math.min(1.0, continuousScore * 0.7 + bonusNorm * 0.3);
    }

    return {
      score: Math.max(0.01, Math.min(0.99, continuousScore)),
      confidence: Math.min(1.0, 0.5 + Math.abs(continuousScore - 0.5)),
    };
  },
};
