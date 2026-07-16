import { AlgoKey } from '../../../shared/prediction.types';
import { AlgorithmPlugin } from '../algorithmRegistry';

/**
 * Calculates circular (geodesic) distance on a 1D circular manifold (torus of 90 numbers).
 * Ensure that 1 is adjacent to 90.
 */
const getCircularDistance = (a: number, b: number, maxVal = 90): number => {
    const diff = Math.abs(a - b);
    return Math.min(diff, maxVal - diff);
};

export const derivedNeighborPlugin: AlgorithmPlugin = {
  key: AlgoKey.DERIVED_NEIGHBOR as any, // Type cast for new key
  category: 'meta', // Meta-algorithme car il observe les autres
  stability: 'stable',
  mathematicalBasis: 'Diffusion Gaussienne sur Variété Circulaire (Spreading Activation)',
  description: 'Propage l\'activation par noyau gaussien circulaire et transformations symétriques à partir des graines principales.',
  isStrictlyDeterministic: true,

  /**
   * Precomputes the top seeds and transformations.
   * 
   * This algorithm acts as a Spreading Activation model on a 1D circular manifold [1, 90],
   * where the boundary conditions are periodic (1 is adjacent to 90). It identifies the top 
   * 10 "seed" numbers estimated by principal algorithms and diffuses activation from these 
   * sources across the topology.
   */
  precompute(ctx) {
    const N = 90;
    // 1. Identifier les "numéros choisis" par les autres algorithmes (proxy via les features de base)
    // On agrège freqMap, markovMap et momentumMap pour trouver les favoris actuels
    const proxyScores: { num: number; score: number }[] = [];
    
    // Normaliser les features pour faire une somme
    const maxFreq = Math.max(0.001, ...Array.from(ctx.features.freqMap));
    const maxMarkov = Math.max(0.001, ...Array.from(ctx.features.markovMap));
    const maxMomentum = Math.max(0.001, ...Array.from(ctx.features.momentumMap));

    for (let i = 1; i <= N; i++) {
        const freqVal = (ctx.features.freqMap[i] || 0) / maxFreq;
        const markovVal = (ctx.features.markovMap[i] || 0) / maxMarkov;
        const momentumVal = (ctx.features.momentumMap[i] || 0) / maxMomentum;
        
        // Poids équivalent pour estimer le choix des autres algos
        const proxyScore = (freqVal + markovVal * 1.5 + momentumVal * 0.8) / 3.3;
        proxyScores.push({ num: i, score: proxyScore });
    }

    // Prendre les 10 meilleurs comme "choisis par les autres algos" (graines d'activation)
    proxyScores.sort((a, b) => b.score - a.score);
    const topChosen = proxyScores.slice(0, 10).map(p => p.num);

    // 2. Calculer l'affinité historique des transformations
    const transformMap: Record<number, { type: string, source: number }[]> = {};

    topChosen.forEach(chosen => {
        // Transformation +1
        const plus1 = chosen === 90 ? 1 : chosen + 1;
        if (!transformMap[plus1]) transformMap[plus1] = [];
        transformMap[plus1].push({ type: '+1', source: chosen });

        // Transformation -1
        const minus1 = chosen === 1 ? 90 : chosen - 1;
        if (!transformMap[minus1]) transformMap[minus1] = [];
        transformMap[minus1].push({ type: '-1', source: chosen });

        // Ombre (Shadow): Complémentaire à 90 (ou 91 pour que 1->90)
        const shadow = 91 - chosen;
        if (shadow >= 1 && shadow <= 90) {
            if (!transformMap[shadow]) transformMap[shadow] = [];
            transformMap[shadow].push({ type: 'ombre', source: chosen });
        }

        // Miroir (Mirror): Inversion des chiffres
        const strNum = chosen.toString().padStart(2, '0');
        const reversedStr = strNum.split('').reverse().join('');
        const mirror = parseInt(reversedStr, 10);
        if (mirror >= 1 && mirror <= 90 && mirror !== chosen) {
            if (!transformMap[mirror]) transformMap[mirror] = [];
            transformMap[mirror].push({ type: 'miroir', source: chosen });
        }
    });

    ctx.pluginCache = ctx.pluginCache || {};
    ctx.pluginCache[AlgoKey.DERIVED_NEIGHBOR] = {
        transformMap,
        topChosen
    };
  },

  evaluate(num, ctx) {
    if (!ctx.pluginCache?.[AlgoKey.DERIVED_NEIGHBOR]) {
        this.precompute(ctx);
    }
    const cache = ctx.pluginCache![AlgoKey.DERIVED_NEIGHBOR];
    const transformations = cache.transformMap[num] || [];
    const topChosen = cache.topChosen as number[];

    // 1. Spreading Activation via Circular Gaussian Kernel
    // The sigma parameter is derived directly from the topology size (90).
    // According to the 3-sigma rule of a normal distribution, to cover ~99.7% of the density
    // across the maximum geodesic distance of 45 (half of the domain), we set sigma to 90 / 6.0 = 15.0.
    const SIGMA_TOPOLOGY = 90.0 / 6.0;
    let spreadingActivation = 0.0;
    
    topChosen.forEach(seed => {
        const dist = getCircularDistance(num, seed);
        // Gaussian kernel applied continuously on the geodesic circular distance
        spreadingActivation += Math.exp(-0.5 * Math.pow(dist / SIGMA_TOPOLOGY, 2));
    });

    // 2. Discrete Transformation Score
    // Gives extra spikes to direct adjacent, mirror or shadow nodes
    const baseScorePerTransform = 35.0; 
    const discreteScore = transformations.length * baseScorePerTransform;

    // 3. Fusion and Continuous Scaling
    // Combines spreading activation and discrete symmetry boosts, then scales via hyperbolic tangent
    const rawScore = spreadingActivation * 25.0 + discreteScore;
    const normalizedScore = Math.tanh(rawScore / 100.0) * 100.0;

    return {
        score: Math.max(0, Math.min(100, normalizedScore)),
        confidence: 0.90,
        metadata: { 
            derived: transformations.length > 0, 
            transformations: transformations,
            spreadingActivation,
            isSeed: topChosen.includes(num)
        }
    };
  }
};
