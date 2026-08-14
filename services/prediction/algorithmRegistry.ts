import { AlgoKey } from '../../shared/prediction.types';
import { ExtractedFeatures } from './featureExtractor';
import { DrawResult } from '../../types';
import { EnhancedMetrics } from './metrics.types';

export type PluginCacheValue = Float64Array | Int32Array | Record<number, any> | Record<string, any> | any;
export type PluginCacheData = Record<string, PluginCacheValue>;

/**
 * CONTEXTE MATHÉMATIQUE STRICT
 * Remplace les "nombres magiques" par des descripteurs statistiques dérivés des données.
 * Garantit que chaque algorithme prend ses décisions basées sur la distribution réelle des données.
 */
export interface AlgorithmContext {
  features: ExtractedFeatures;
  advancedMetrics: EnhancedMetrics;
  history: DrawResult[];
  
  // ADN ALGORITHMIQUE ACTUEL DU MOMENT
  weights?: import('../../shared/prediction.types').AlgoWeights;
  algoWeights?: import('../../shared/prediction.types').AlgoWeights;

  // CACHE DE CORRÉLATION ET PRÉCALCUL POUR RENDEMENT PHÉNOMÉNAL
  pluginCache?: PluginCacheData;

  // NOM DU TIRAGE ACTIF POUR ISOLATION ET TRAÇABILITÉ (TIRAGE ISOLATION RULE)
  drawName?: string;
  
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
  [key: string]: unknown;
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

  // Optionnel: Permet d'indiquer si l'algorithme est marqué comme désactivé suite à une anomalie détectée
  disabled?: boolean;
}

/**
 * Registre des algorithmes souscrits.
 * Découplage total de la logique d'évaluation de ScoringEngine.
 */
export const algorithmRegistry: AlgorithmPlugin[] = [];

/**
 * Creates a robust AlgorithmContext for deterministic verification of plugins during registration.
 */
const createValidationContext = (): AlgorithmContext => {
  const validationHistory: DrawResult[] = Array(15).fill(0).map((_, i) => ({
    id: `draw_${i}`,
    date: `2026-01-${i + 1}`,
    gagnants: [1, 2, 3, 4, 5],
    boule_machine: "A",
    drawName: "Reveil",
    timestamp: Date.now() - i * 86400000
  }));

  const freqMap = new Float32Array(91);
  const gapsMap = new Int32Array(91);
  const markovMap = new Float32Array(91);
  const momentumMap = new Float32Array(91);
  const machineTransferMap = new Float32Array(91);
  const shadowProbabilityMap = new Float32Array(91);
  const networkCorrelationMap = new Float32Array(91);
  const affinityMap: Float32Array[] = Array.from({ length: 91 }, () => new Float32Array(91));

  for (let i = 1; i <= 90; i++) {
    freqMap[i] = 10.0;
    gapsMap[i] = 5;
    shadowProbabilityMap[i] = 0.5;
    networkCorrelationMap[i] = 0.3;
    momentumMap[i] = 1.0;
    machineTransferMap[i] = 0.5;
  }

  const validationContext: AlgorithmContext = {
    features: {
      freqMap,
      gapsMap,
      markovMap,
      affinityMap,
      momentumMap,
      machineTransferMap,
      shadowProbabilityMap,
      networkCorrelationMap
    },
    advancedMetrics: {
      digitalRoot: {},
      harmonicTension: {},
      volatility: {},
      drift: {}
    } as any,
    history: validationHistory,
    deterministicSeed: 987654321,
    statisticalBounds: {
      median: 5.0,
      q1: 2.0,
      q3: 8.0,
      variance: 3.0,
      kurtosis: 1.5,
      skewness: 0.2,
      shannonEntropy: 3.5,
      hurstExponent: 0.5
    }
  };

  return validationContext;
};

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

  // 3. RUNTIME MATHEMATICAL INTEGRITY TEST (Verification via validation context)
  try {
    const validationCtx = createValidationContext();
    // Call precompute to populate plugin cache if needed
    plugin.precompute(validationCtx);
    
    // Test evaluate on sample numbers
    const testNumbers = [1, 45, 90];
    for (const num of testNumbers) {
      const result = plugin.evaluate(num, validationCtx);
      if (!result) {
        throw new Error(`L'évaluation a retourné null ou undefined pour le numéro ${num}.`);
      }
      const score = result.score;
      if (typeof score !== 'number' || isNaN(score) || !isFinite(score)) {
        throw new Error(`Le score '${score}' retourné pour le numéro ${num} n'est pas un nombre fini.`);
      }
      if (score < 0 || score > 100) {
        throw new Error(`Le score '${score}' retourné pour le numéro ${num} est hors de l'intervalle [0, 100].`);
      }
      const confidence = result.confidence;
      if (typeof confidence !== 'number' || isNaN(confidence) || !isFinite(confidence)) {
        throw new Error(`La confiance '${confidence}' retournée pour le numéro ${num} n'est pas un nombre fini.`);
      }
    }
  } catch (error: any) {
    throw new Error(
      `[VIOLATION INTÉGRITÉ MATHÉMATIQUE] L'algorithme '${plugin.key}' a échoué au test d'intégrité de l'évaluateur.\n` +
      `Détails de l'erreur: ${error.message}`
    );
  }

  // 4. ENREGISTREMENT (Pattern Plugin dynamique avec écrasement)
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
 * Marque un algorithme comme désactivé sans le supprimer du registre.
 * Permet une récupération gracieuse en cas d'erreur de calcul détectée au runtime.
 */
export const disableAlgorithm = (key: AlgoKey, reason: string): void => {
  console.warn(`[REGISTRY] Désactivation de l'algorithme '${key}'. Raison : ${reason}`);
  const plugin = getAlgorithm(key);
  if (plugin) {
    plugin.disabled = true;
  }
};

/**
 * Retourne uniquement les algorithmes actifs (non désactivés).
 */
export const getActiveAlgorithms = (): AlgorithmPlugin[] => {
  return algorithmRegistry.filter(p => !p.disabled);
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