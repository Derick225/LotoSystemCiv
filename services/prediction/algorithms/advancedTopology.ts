import { AlgorithmPlugin } from '../algorithmRegistry';
import { AlgoKey } from '../../../shared/prediction.types';

export const equilibriumPlugin: AlgorithmPlugin = {
  key: AlgoKey.EQUILIBRIUM,
  category: 'experimental',
  stability: 'experimental',
  mathematicalBasis: 'Thermodynamique des Systèmes Fermés (Mean Reversion)',
  description: 'Favorise les numéros en déficit statistique local pour un retour à la moyenne (Mean Reversion).',
  isStrictlyDeterministic: true,
  precompute() {},
  evaluate: (num, ctx) => {
    // equilibriumMap contient des valeurs autour de 50. 
    // Plus la valeur est élevée, plus le numéro est en déficit par rapport à l'attente théorique.
    const eqValue = Number(ctx.features.equilibriumMap?.[num]) || 50;
    
    // Normalisation : on s'assure de rester entre 0 et 100.
    return { score: Math.max(0, Math.min(100, eqValue)), confidence: 50 };
  }
};

export const shadowProbabilityPlugin: AlgorithmPlugin = {
  key: AlgoKey.SHADOW_PROBABILITY,
  category: 'advanced',
  stability: 'volatile',
  mathematicalBasis: 'Demi-vie Adaptative et Tension Harmonique',
  description: 'Évalue la tension de sortie basée sur la demi-vie adaptative des écarts.',
  isStrictlyDeterministic: true,
  precompute() {},
  evaluate: (num, ctx) => {
    // shadowProbabilityMap est déjà normalisée entre 0.0 et 1.0 (gap / demi-vie)
    const prob = Number(ctx.features.shadowProbabilityMap?.[num]) || 0;
    
    // Fonction d'activation sigmoïde ou logistique pourrait être utilisée, 
    // mais une mise à l'échelle linéaire directe est sûre car le max est géré par la topologie.
    return { score: Math.min(100, prob * 100), confidence: 60 };
  }
};

export const networkCorrelationPlugin: AlgorithmPlugin = {
  key: AlgoKey.NETWORK_CORRELATION,
  category: 'core',
  stability: 'stable',
  mathematicalBasis: 'Centralité de Graphe et Matrices dAffinités Multi-Échelles',
  description: 'Score issu de la centralité du numéro dans le graphe d\'affinité global.',
  isStrictlyDeterministic: true,
  precompute() {},
  evaluate: (num, ctx) => {
    // networkCorrelationMap représente la somme des affinités normalisées
    const netValue = Number(ctx.features.networkCorrelationMap?.[num]) || 0;
    
    // Normalisation : on trouve le max global pour mettre à l'échelle, ou on utilise une saturation
    // Si networkCorrelationMap est P(Affinité Moyenne), on l'amplifie pour le score
    return { score: Math.min(100, netValue * 100), confidence: 70 };
  }
};

export const antiConsensusPlugin: AlgorithmPlugin = {
  key: AlgoKey.ANTI_CONSENSUS,
  category: 'experimental',
  stability: 'volatile',
  mathematicalBasis: 'Distribution de Cauchy sur hyper-fréquences de court terme',
  description: 'Pénalise ou favorise de façon continue les numéros en fonction de leur surchauffe locale (Théorème Central Limite).',
  isStrictlyDeterministic: true,
  precompute() {},
  evaluate: (num, ctx) => {
    // antiConsensusMap contient l'intensité de sortie sur la fenêtre très courte
    const hits = Number(ctx.features.antiConsensusMap?.[num]) || 0.0;
    
    // Fonction d'activation continue : Modèle de désintégration de Cauchy
    // H(x) = 100 / (1 + ((x - c)/w)^2)
    // où c est le pic idéal de rebond (ex. ~0.8) et w l'étalement.
    // Plus le nombre de hits s'éloigne du sweet spot, plus le score chute continuellement.
    
    const peak = 0.85; // Sweet spot : juste avant 1.0 hit en moyenne glissante
    const width = 0.75; // Facteur d'étalement de la résonance
    
    const continuousScore = 100.0 / (1.0 + Math.pow((hits - peak) / width, 2));
    const continuousConfidence = 40.0 + 60.0 * (1.0 - Math.exp(-0.5 * hits)); // Confidence asymptotique
    
    return { 
      score: Math.max(0, Math.min(100, continuousScore)), 
      confidence: Math.max(0, Math.min(100, continuousConfidence))
    };
  }
};
