import { AlgorithmPlugin } from '../algorithmRegistry';
import { AlgoKey } from '../../../shared/prediction.types';

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
