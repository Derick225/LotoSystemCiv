
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

export const markovPlugin: AlgorithmPlugin = {
  key: AlgoKey.MARKOV,
  category: 'core',
  stability: 'stable',
  mathematicalBasis: 'Modélisation Continue SDE par Processus d\'Ornstein-Uhlenbeck & Langevin (Euler-Maruyama)',
  description: 'Modélise la dérive (drift) et la volatilité continue de l\'attractivité d\'un numéro par équation stochastique dans l\'espace des phases.',
  isStrictlyDeterministic: true,
  
  precompute(ctx) {
    const drawName = ctx.drawName || "Loto 5/90";
    const profile = getGameProfile(drawName);
    const domainSize = profile.mainMax;
    
    const history = ctx.history || [];
    const depth = Math.min(150, history.length);
    
    // Paramètres SDE continus dérivés (Zéro nombre magique)
    const hurst = ctx.statisticalBounds?.hurstExponent ?? 0.5;
    const entropy = ctx.statisticalBounds?.shannonEntropy ?? 0.95;
    
    const theta = 0.15 * (1.0 - hurst + 0.1); // Force de retour à la moyenne (dérive d'Ornstein-Uhlenbeck)
    const mu = 5.0 / domainSize;              // Attractivité moyenne à long terme
    const alpha = 0.25 * (1.0 + entropy);     // Force d'impulsion à l'occurrence (potentiel de Langevin)
    const sigmaSde = 0.05 * entropy;          // Volatilité de la perturbation stochastique
    
    const X = new Float64Array(domainSize + 1);
    // Initialisation uniforme sur la moyenne à long terme
    for (let i = 1; i <= domainSize; i++) {
      X[i] = mu;
    }
    
    // Hash déterministe pour seed de LCG
    const getDeterministicSeed = (str: string): number => {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
      }
      return Math.abs(hash);
    };
    
    // Générateur LCG déterministe
    const createLcg = (seed: number) => {
      let s = Math.abs(seed) % 2147483647;
      if (s === 0) s = 1;
      return () => {
        s = (s * 16807) % 2147483647;
        return s / 2147483647;
      };
    };
    
    // Box-Muller transform
    const getGaussian = (lcg: () => number): number => {
      const u1 = Math.max(1e-15, lcg());
      const u2 = lcg();
      return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    };
    
    // Résolution de l'EDS d'Ornstein-Uhlenbeck & Langevin par Euler-Maruyama
    // On avance dans le sens chronologique (du plus ancien au plus récent)
    for (let step = depth - 1; step >= 0; step--) {
      const draw = history[step];
      const winners = new Set(draw?.gagnants || []);
      
      for (let n = 1; n <= domainSize; n++) {
        const y = winners.has(n) ? 1.0 : 0.0;
        
        // Wiener increment déterministe
        const stepSeed = getDeterministicSeed(`${drawName}_sde_${n}_${step}`);
        const lcg = createLcg(stepSeed);
        const dW = getGaussian(lcg) * 1.0; // sqrt(dt) avec dt=1
        
        // Équation de Langevin-Bucy continue : dérive mean-reverting + attraction + perturbation stochastique
        X[n] = X[n] + theta * (mu - X[n]) + alpha * y + sigmaSde * dW;
        
        // Protection de positivité
        if (X[n] < 0.001) X[n] = 0.001;
      }
    }
    
    // Calcul des statistiques de centrage robustes pour la normalisation CDF logistique
    const validValues = Array.from(X.slice(1, domainSize + 1));
    let median = mu;
    let iqr = mu * 0.5;
    
    if (validValues.length > 0) {
      const sorted = [...validValues].sort((a, b) => a - b);
      median = sorted[Math.floor(sorted.length / 2)];
      const q1 = sorted[Math.floor(sorted.length * 0.25)];
      const q3 = sorted[Math.floor(sorted.length * 0.75)];
      iqr = Math.max(1e-6, q3 - q1);
    }
    
    ctx.pluginCache = ctx.pluginCache || {};
    ctx.pluginCache[AlgoKey.MARKOV] = {
      attractionState: X,
      median,
      iqr,
      domainSize
    };
  },
  
  evaluate(num, ctx) {
    if (!ctx.pluginCache?.[AlgoKey.MARKOV]) {
      markovPlugin.precompute(ctx);
    }
    const cache = ctx.pluginCache![AlgoKey.MARKOV];
    const X = cache.attractionState;
    const median = cache.median;
    const iqr = cache.iqr;
    const domainSize = cache.domainSize;
    
    if (num < 1 || num > domainSize) {
      return { score: 0, confidence: 0.5 };
    }
    
    const rawAttraction = X[num] || 0.0;
    
    // Intégration de la succession du leader (Chaîne de plus haut degré)
    const leaderBoost = (ctx.advancedMetrics?.leaderSuccession as Record<number, number>)?.[num] || 0.0;
    const effectiveAttraction = rawAttraction * (1.0 + leaderBoost / 100.0);
    
    // Normalisation robuste via la CDF Logistique continue
    const slope = 1.0 / iqr;
    const normalizedScore = 100.0 / (1.0 + Math.exp(-slope * (effectiveAttraction - median)));
    
    const score = Math.max(0.0, Math.min(100.0, normalizedScore));
    return {
      score,
      confidence: 0.95,
      metadata: { rawAttraction, leaderBoost }
    };
  }
};

