import { AlgorithmPlugin } from '../algorithmRegistry';
import { AlgoKey } from '../../../shared/prediction.types';
import { LCG } from '../../../utils/mathUtils';
import { useNexusStore } from '../../../store/useNexusStore';

// Déterministe et statique, partagé par tous les appels
const RESERVOIR_SIZE = 64;
const LEAKY_RATE = 0.3;

// Cache d'isolation par tirage pour les poids d'ESN afin d'éviter toute pollution inter-tirages
const W_res_map: Record<string, number[][]> = {};
const W_in_map: Record<string, number[][]> = {};

/**
 * Initialisation déterministe d'un réservoir d'Echo State Network.
 * 
 * Les matrices de poids d'entrée (W_in) et de réservoir (W_res) sont initialisées 
 * de manière strictement reproductible et bit-à-bit à l'aide d'un LCG local 
 * seedé uniquement par le nom du tirage cible. Ceci garantit un déterminisme absolu 
 * et respecte scrupuleusement la règle TIRAGE ISOLATION RULE.
 */
function initDeterministicReservoir(inputSize: number, spectralRadius: number, drawName: string) {
  if (W_in_map[drawName] && W_res_map[drawName] && W_in_map[drawName][0].length === inputSize) return;

  const seedStr = `${drawName}_ESN_init_v12`;
  const prng = new LCG(seedStr);

  W_in_map[drawName] = Array(RESERVOIR_SIZE).fill(0).map(() => 
    Array(inputSize).fill(0).map(() => (prng.next() * 2.0 - 1.0) * 0.1)
  );

  W_res_map[drawName] = Array(RESERVOIR_SIZE).fill(0).map(() => 
    Array(RESERVOIR_SIZE).fill(0).map(() => {
      // 20% sparsity
      if (prng.next() > 0.2) return 0;
      return prng.next() * 2.0 - 1.0;
    })
  );

  // Normalisation du rayon spectral pour garantir la propriété "Echo State" (oubli)
  let maxSum = 0;
  const wRes = W_res_map[drawName];
  for (let i = 0; i < RESERVOIR_SIZE; i++) {
    let sum = 0;
    for (let j = 0; j < RESERVOIR_SIZE; j++) {
      sum += Math.abs(wRes[i][j]);
    }
    if (sum > maxSum) maxSum = sum;
  }

  const scale = maxSum > 0 ? (spectralRadius / maxSum) : 1.0;
  for (let i = 0; i < RESERVOIR_SIZE; i++) {
    for (let j = 0; j < RESERVOIR_SIZE; j++) {
      wRes[i][j] *= scale;
    }
  }
}

export const echoStateNetworkPlugin: AlgorithmPlugin = {
  key: AlgoKey.ECHO_STATE as AlgoKey,
  category: 'advanced',
  stability: 'experimental',
  mathematicalBasis: 'Reservoir Computing (Echo State Network) Déterministe',
  description: 'Projections dynamiques non-linéaires des séries temporelles sans gradient.',
  isStrictlyDeterministic: true,
  
  precompute(ctx) {
    // Si l'historique est trop court, on skip
    if (!ctx.history || ctx.history.length < 10) return;

    const activeDraw = useNexusStore.getState().drawName || "Reveil";

    // 1. Dérivation dynamique du rayon spectral basée sur l'entropie de Shannon
    // Un régime hautement chaotique (entropie élevée) nécessite un rayon spectral plus faible (ex: 0.8)
    // pour garantir la propriété d'écho (stabilité d'activation et évanouissement de l'état)
    // tandis qu'un régime plus ordonné peut tolérer un rayon proche de 1.0 (mémoire à plus long terme).
    const baseEntropy = ctx.statisticalBounds?.shannonEntropy ?? 3.5;
    const dynamicSpectralRadius = Math.max(0.7, Math.min(0.98, 0.9 + 0.05 * (3.5 - baseEntropy)));

    // Feature extraction: utiliser une matrice N_tirages x 90
    const N = Math.min(ctx.history.length, 128); // On limite pour performance
    
    // Inverser l'historique pour l'avoir du plus ancien au plus récent (ordre chronologique)
    const chronologicalHistory = ctx.history.slice(0, N).reverse();

    initDeterministicReservoir(90, dynamicSpectralRadius, activeDraw);
    const W_in = W_in_map[activeDraw];
    const W_res = W_res_map[activeDraw];

    // Initialisation de l'état du réservoir
    let state = new Float64Array(RESERVOIR_SIZE);
    
    // Matrice de collection des états pour l'entraînement (N_tirages, RESERVOIR_SIZE)
    const statesMatrix: number[][] = [];
    
    // On fait avancer le réservoir dans le temps
    for (let t = 0; t < chronologicalHistory.length; t++) {
      const draw = chronologicalHistory[t];
      // Vecteur d'entrée (one-hot ou binaire)
      const u = new Float64Array(90);
      draw.gagnants.forEach(n => {
        if (n >= 1 && n <= 90) u[n - 1] = 1.0;
      });

      const nextState = new Float64Array(RESERVOIR_SIZE);
      
      for (let i = 0; i < RESERVOIR_SIZE; i++) {
        let inSum = 0;
        for (let j = 0; j < 90; j++) inSum += W_in[i][j] * u[j];
        
        let resSum = 0;
        for (let j = 0; j < RESERVOIR_SIZE; j++) resSum += W_res[i][j] * state[j];
        
        // Equation de mise à jour Leaky-Integrator
        const activation = Math.tanh(inSum + resSum);
        nextState[i] = (1.0 - LEAKY_RATE) * state[i] + LEAKY_RATE * activation;
      }
      
      state = nextState;
      // On stocke l'état pour l'étape t, l'étiquette cible (ce qu'il doit prédire) sera à t+1
      statesMatrix.push(Array.from(state));
    }

    // Régression linéaire / similarité de trajectoire dans le réservoir
    const finalState = state;
    const numberScores = new Float64Array(91);
    
    for (let t = 0; t < statesMatrix.length - 1; t++) {
      const s = statesMatrix[t];
      const nextDraw = chronologicalHistory[t + 1].gagnants;
      
      // Mesure de similarité cosinus entre state(t) et finalState
      let dot = 0;
      let magS = 0;
      let magF = 0;
      for (let i = 0; i < RESERVOIR_SIZE; i++) {
        dot += s[i] * finalState[i];
        magS += s[i] * s[i];
        magF += finalState[i] * finalState[i];
      }
      
      // Protection rigoureuse de la division par Number.EPSILON
      const similarity = dot / (Math.sqrt(magS) * Math.sqrt(magF) + Number.EPSILON);
      
      // On accumule la similarité continue pour les numéros qui sont sortis
      nextDraw.forEach(n => {
        if (n >= 1 && n <= 90) {
          numberScores[n] += (similarity + 1.0) / 2.0; // Mappé de 0 à 1
        }
      });
    }

    // Caching des scores lissés
    ctx.pluginCache = ctx.pluginCache || {};
    ctx.pluginCache[AlgoKey.ECHO_STATE as string] = { 
      scores: Array.from(numberScores),
      spectralRadiusUsed: dynamicSpectralRadius 
    };
  },

    evaluate(num, ctx) {
    if (!ctx.pluginCache?.[AlgoKey.ECHO_STATE as string]) {
      this.precompute(ctx);
    }

    const cache = ctx.pluginCache?.[AlgoKey.ECHO_STATE as string];
    if (!cache || !cache.scores) {
      return { score: 50, confidence: 0.5 };
    }

    const rawScore = cache.scores[num] || 0;
    // Robust normalization via IQR instead of max (resistant to outliers)
    const allScores = cache.scores.slice(1).filter((s: number) => s > 0).sort((a: number, b: number) => a - b);
    if (allScores.length === 0) return { score: 50, confidence: 0.5 };

    const q1 = allScores[Math.floor(allScores.length * 0.25)] || 0;
    const q3 = allScores[Math.floor(allScores.length * 0.75)] || 0;
    const iqr = Math.max(Number.EPSILON, q3 - q1);
    const med = allScores[Math.floor(allScores.length / 2)] || 0;

    // Sigmoid normalization centered on median, scaled by IQR
    const slope = 1.0 / iqr;
    const score = Math.max(0, Math.min(100, 100.0 / (1.0 + Math.exp(-slope * (rawScore - med)))));

    return {
      score,
      confidence: 0.85,
      metadata: { rawScore, spectralRadius: cache.spectralRadiusUsed }
    };
  }
};
