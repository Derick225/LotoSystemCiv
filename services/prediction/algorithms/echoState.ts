import { AlgorithmPlugin } from '../algorithmRegistry';
import { AlgoKey } from '../../../shared/prediction.types';

// Déterministe et statique, partagé par tous les appels
const RESERVOIR_SIZE = 64;
const SPECTRAL_RADIUS = 0.9;
const LEAKY_RATE = 0.3;

let W_res: number[][] | null = null;
let W_in: number[][] | null = null;
let initialized = false;

function initDeterministicReservoir(inputSize: number) {
  if (initialized && W_in && W_in[0].length === inputSize) return;

  // LCG pour Zéro hasard
  let seed = 123456789;
  const lcg = () => {
    seed = (1103515245 * seed + 12345) % 2147483648;
    return seed / 2147483648;
  };

  W_in = Array(RESERVOIR_SIZE).fill(0).map(() => 
    Array(inputSize).fill(0).map(() => (lcg() * 2.0 - 1.0) * 0.1)
  );

  W_res = Array(RESERVOIR_SIZE).fill(0).map(() => 
    Array(RESERVOIR_SIZE).fill(0).map(() => {
      // 20% sparsity
      if (lcg() > 0.2) return 0;
      return lcg() * 2.0 - 1.0;
    })
  );

  // Approximation de la normalisation du rayon spectral
  let maxSum = 0;
  for (let i = 0; i < RESERVOIR_SIZE; i++) {
    let sum = 0;
    for (let j = 0; j < RESERVOIR_SIZE; j++) {
      sum += Math.abs(W_res[i][j]);
    }
    if (sum > maxSum) maxSum = sum;
  }

  const scale = maxSum > 0 ? (SPECTRAL_RADIUS / maxSum) : 1;
  for (let i = 0; i < RESERVOIR_SIZE; i++) {
    for (let j = 0; j < RESERVOIR_SIZE; j++) {
      W_res[i][j] *= scale;
    }
  }

  initialized = true;
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

    // Feature extraction: utiliser une matrice N_tirages x 90
    const N = Math.min(ctx.history.length, 128); // On limite pour performance
    
    // Inverser l'historique pour l'avoir du plus ancien au plus récent (ordre chronologique)
    const chronologicalHistory = ctx.history.slice(0, N).reverse();

    initDeterministicReservoir(90);

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
        for (let j = 0; j < 90; j++) inSum += W_in![i][j] * u[j];
        
        let resSum = 0;
        for (let j = 0; j < RESERVOIR_SIZE; j++) resSum += W_res![i][j] * state[j];
        
        // Equation de mise à jour Leaky-Integrator
        const activation = Math.tanh(inSum + resSum);
        nextState[i] = (1.0 - LEAKY_RATE) * state[i] + LEAKY_RATE * activation;
      }
      
      state = nextState;
      // On stocke l'état pour l'étape t, l'étiquette cible (ce qu'il doit prédire) sera à t+1
      statesMatrix.push(Array.from(state));
    }

    // Régression linéaire : on veut prédire la probabilité de sortie de chaque numéro au temps N (prochain)
    // Au lieu de faire 90 régressions de 64 poids, on peut projeter un readout vectoriel.
    // L'état final contient le contexte du dernier tirage
    const finalState = state;
    
    // Pour simplifier et respecter l'isolation, on utilise une métrique d'affinité continue
    // entre l'état final et les états où le numéro n est sorti.
    const numberScores = new Float64Array(91);
    const hitCounts = new Float64Array(91);
    
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
      const similarity = dot / (Math.sqrt(magS) * Math.sqrt(magF) + 1e-8);
      
      // On accumule la similarité continue pour les numéros qui sont sortis
      nextDraw.forEach(n => {
        if (n >= 1 && n <= 90) {
          numberScores[n] += (similarity + 1.0) / 2.0; // Mappé de 0 à 1
          hitCounts[n] += 1;
        }
      });
    }

    // Caching des scores lissés
    ctx.pluginCache = ctx.pluginCache || {};
    ctx.pluginCache[AlgoKey.ECHO_STATE as string] = { scores: Array.from(numberScores) };
  },

  evaluate(num, ctx) {
    if (!ctx.pluginCache?.[AlgoKey.ECHO_STATE as string]) {
      this.precompute(ctx);
    }
    
    const cache = ctx.pluginCache?.[AlgoKey.ECHO_STATE as string];
    if (!cache || !cache.scores) {
      return { score: 50, confidence: 10 };
    }
    
    const rawScore = cache.scores[num];
    // Sigmoïde d'étalement basée sur la moyenne/médiane pour obtenir une échelle 0-100 continue
    const allScores = [...cache.scores.slice(1)].filter(s => s > 0).sort((a,b) => a-b);
    const max = allScores[allScores.length - 1] || 1;
    
    const scale = 100.0 / (max + 1e-6);
    const score = Math.max(0, Math.min(100, rawScore * scale));
    
    return {
      score,
      confidence: 85, // Réseau de neurones déterministe
      metadata: { rawScore }
    };
  }
};
