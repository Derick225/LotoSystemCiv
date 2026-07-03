import { AlgoKey } from '../../shared/prediction.types';
import { ExtractedFeatures } from './featureExtractor';
import { DrawResult } from '../../types';
import { EnhancedMetrics } from './metrics.types';

/**
 * CONTEXTE MATHÉMATIQUE STRICT
 * Remplace les "nombres magiques" par des descripteurs statistiques dérivés des données.
 * Garantit que chaque algorithme prend ses décisions basées sur la distribution réelle des données.
 */
export interface AlgorithmContext {
  features: ExtractedFeatures;
  advancedMetrics: EnhancedMetrics;
  history: DrawResult[];
  
  // CACHE DE CORRÉLATION ET PRÉCALCUL POUR RENDEMENT PHÉNOMÉNAL
  pluginCache?: Record<string, any>;
  
  // REMPLACEMENT DES CONSTANTES ARBITRAIRES PAR DES BORNES STATISTIQUES
  statisticalBounds: {
    median: number;          // Médiane de la distribution (robuste aux outliers)
    q1: number;              // 1er Quartile (25ème percentile)
    q3: number;              // 3ème Quartile (75ème percentile)
    variance: number;        // Variance de l'échantillon
    kurtosis: number;        // Aplatissement (queues de distribution)
    skewness: number;        // Asymétrie de la distribution
    shannonEntropy: number;  // Entropie de Shannon (mesure du désordre/incertitude)
    hurstExponent: number;   // Exposant de Hurst (0.5 = marche aléatoire, >0.5 = tendance, <0.5 = retour à la moyenne)
  };

  // SEMENCE DÉTERMINISTE
  // Si un algorithme a besoin de simuler un tirage (ex: LCG), il DOIT utiliser cette seed dérivée de l'état du système.
  deterministicSeed: number; 

  // CHAMPS D'ÉCHELLE POUR LES ALGORITHMES DE SÉQUENCE GÉNÉRÉS
  maxFreq?: number;
  maxMarkov?: number;
  maxMachineTransfer?: number;
  [key: string]: any;
}

/**
 * ÉVALUATEUR D'ALGORITHME
 * @returns Un score strictement normalisé dans l'intervalle [0, 1], 
 * idéalement dérivé d'une Fonction de Répartition Cumulative (CDF) ou d'une Sigmoïde.
 */
export type AlgorithmEvaluator = (num: number, context: AlgorithmContext) => number;

export type AlgorithmCategory = 'core' | 'advanced' | 'experimental' | 'meta';
export type AlgorithmStability = 'stable' | 'volatile' | 'experimental';

/**
 * PLUG-IN D'ALGORITHME
 * Ajout de métadonnées pour garantir la traçabilité mathématique et le respect des contraintes.
 */
export interface AlgorithmPlugin {
  key: AlgoKey;
  category: AlgorithmCategory;
  stability: AlgorithmStability;
  
  // EXIGENCE : Nommer la loi ou le théorème sous-jacent (ex: "Loi de Poisson", "Chaîne de Markov d'ordre 2", "Théorème Central Limite")
  mathematicalBasis: string; 
  
  description: string;
  
  // EXIGENCE : Doit être true. Tout algorithme utilisant Math.random() ou des initialisations non seedées sera rejeté.
  isStrictlyDeterministic: boolean; 
  
  // PRÉCALCUL DE RENDEMENT (Optimisation et découplage cybernétique)
  precompute(context: AlgorithmContext): void;
  
  evaluate(num: number, context: AlgorithmContext): { score: number; confidence: number; metadata?: any };
}

/**
 * Registre des algorithmes souscrits.
 * Découplage total de la logique d'évaluation de ScoringEngine.
 */
export const algorithmRegistry: AlgorithmPlugin[] = [];

/**
 * Enregistre un nouvel algorithme d'évaluation.
 * Applique une validation stricte pour faire respecter la philosophie "Zéro Hasard" et "Zéro Nombres Magiques".
 */
export const registerAlgorithm = (plugin: AlgorithmPlugin) => {
  // 1. VALIDATION DÉTERMINISTE (Non négociable)
  if (!plugin.isStrictlyDeterministic) {
    throw new Error(
      `[VIOLATION ARCHITECTURE] L'algorithme '${plugin.key}' est rejeté. ` +
      `Principe ZÉRO HASARD violé : Tous les algorithmes doivent être 100% déterministes.`
    );
  }

  // 2. VALIDATION DE LA BASE MATHÉMATIQUE
  if (!plugin.mathematicalBasis || plugin.mathematicalBasis.trim().length < 3) {
    throw new Error(
      `[VIOLATION ARCHITECTURE] L'algorithme '${plugin.key}' doit déclarer explicitement sa 'mathematicalBasis' ` +
      `(ex: 'Loi Normale', 'Entropie de Shannon'). Les heuristiques arbitraires sont interdites.`
    );
  }

  // CORRECTION : Validation que l'évaluateur utilise de manière rigoureuse le contexte
  if (plugin.evaluate.length < 2) {
    throw new Error(
      `[VIOLATION ARCHITECTURE] L'évaluateur de '${plugin.key}' doit accepter le paramètre 'context' ` +
      `pour garantir l'accès à la deterministicSeed et aux bornes statistiques.`
    );
  }

  // 3. ENREGISTREMENT (Pattern Plugin dynamique avec écrasement)
  const existingIndex = algorithmRegistry.findIndex(p => p.key === plugin.key);
  if (existingIndex >= 0) {
    console.warn(`[REGISTRY] Mise à jour de l'algorithme existant : ${plugin.key}`);
    algorithmRegistry[existingIndex] = plugin;
  } else {
    algorithmRegistry.push(plugin);
  }
};

/**
 * Récupère un algorithme par sa clé.
 */
export const getAlgorithm = (key: AlgoKey): AlgorithmPlugin | undefined => {
  return algorithmRegistry.find(p => p.key === key);
};

/**
 * Récupère tous les algorithmes d'une catégorie donnée, triés par stabilité.
 * Utile pour l'orchestration déterministe des ensembles (Ensemble Learning).
 */
export const getAlgorithmsByCategory = (category: AlgorithmCategory): AlgorithmPlugin[] => {
  return algorithmRegistry
    .filter(p => p.category === category)
    .sort((a, b) => {
      const stabilityOrder = { stable: 3, volatile: 2, experimental: 1 };
      return stabilityOrder[b.stability] - stabilityOrder[a.stability];
    });
};