import { AlgoWeights, DrawResult, ForensicReport } from '../../types';
import { AlgoKey, DEFAULT_ALGO_WEIGHTS } from '../../shared/prediction.types';
import { supabase, isSupabaseConfigured } from '../supabaseClient';
import { get, set } from 'idb-keyval';
import { logger } from '../../utils/logger';

export const getDefaultWeights = (): AlgoWeights => ({ ...DEFAULT_ALGO_WEIGHTS });

/**
 * NORMALISATION L1 STRICTE AVEC BORNES TOPOLOGIQUES
 * Remplace les constantes arbitraires par des bornes dérivées de la taille de l'espace des algorithmes (N).
 */
export const normalizeWeights = (weights: AlgoWeights, options?: { bypassCap?: boolean }): AlgoWeights => {
  // CRITICAL FIX: Only use valid AlgoKeys to avoid old stale keys stealing probability mass
  const validKeys = Object.values(AlgoKey);
  const keys = Object.keys(weights).filter(k => validKeys.includes(k as AlgoKey)) as Array<AlgoKey>;
  
  if (keys.length === 0) {
    return { ...DEFAULT_ALGO_WEIGHTS };
  }

  const numAlgos = keys.length;
  
  // Plancher : 1 / (2 * N) garantit qu'aucun algo n'est totalement éteint mais pénalise la dilution excessive
  const FLOOR = 1.0 / (2.0 * numAlgos);
  // Plafond : 1 - (1 / sqrt(N)), garantissant qu'aucun algo ne dépasse la domination statistique naturelle
  const CEILING = options?.bypassCap ? (1.0 - (1.0 / Math.sqrt(numAlgos))) : Math.min(0.50, 2.0 / Math.sqrt(numAlgos));
  
  let w: Record<string, number> = {};
  let initialSum = 0;

  keys.forEach(key => {
    let val = weights[key];
    if (typeof val !== 'number' || isNaN(val) || val < 0) val = 0;
    w[key] = val;
    initialSum += val;
  });

  if (initialSum > 0) {
    keys.forEach(key => { w[key] = w[key] / initialSum; });
  } else {
    const uniform = 1.0 / numAlgos;
    keys.forEach(key => { w[key] = uniform; });
  }

  const maxProjectIterations = Math.max(10, numAlgos * 2);
  for (let iter = 0; iter < maxProjectIterations; iter++) {
    let currentSum = 0;
    keys.forEach(k => {
      w[k] = Math.max(FLOOR, Math.min(CEILING, w[k]));
      currentSum += w[k];
    });

    if (Math.abs(currentSum - 1.0) < Number.EPSILON * 100) break;

    const error = 1.0 - currentSum;
    const freeKeys = keys.filter(k => w[k] > FLOOR && w[k] < CEILING);
    const adjustment = freeKeys.length > 0 ? (error / freeKeys.length) : (error / numAlgos);
    const targetKeys = freeKeys.length > 0 ? freeKeys : keys;

    targetKeys.forEach(k => { w[k] += adjustment; });
  }

  let finalTotal = 0;
  keys.forEach(k => {
    w[k] = Math.max(FLOOR, Math.min(CEILING, w[k]));
    w[k] = parseFloat(w[k].toFixed(6));
    finalTotal += w[k];
  });

  if (finalTotal > 0 && Math.abs(finalTotal - 1.0) > 1e-5) {
    const sortedKeys = [...keys].sort((a, b) => {
      const diff = w[b] - w[a];
      return diff !== 0 ? diff : a.localeCompare(b);
    });
    w[sortedKeys[0]] = parseFloat((w[sortedKeys[0]] + (1.0 - finalTotal)).toFixed(6));
  }

  return w as AlgoWeights;
};

export const adjustWeightsForRegime = (weights: AlgoWeights, regimeInfo?: { regime: string, hurst: number, entropy: number, volatility: number }): AlgoWeights => {
  if (!regimeInfo) return normalizeWeights(weights);
  const { hurst, entropy, volatility } = regimeInfo;
  const adjusted = { ...weights };

  const persistenceFactor = Math.max(0, Math.min(1, hurst));
  const meanReversionFactor = 1.0 - persistenceFactor;
  
  // Entropie maximale théorique pour un domaine de 90 éléments (base 2)
  const maxEntropy = Math.log2(90); 
  const chaosFactor = Math.max(0, Math.min(1, entropy / maxEntropy));
  const volFactor = Math.max(0, Math.min(1, volatility / 100.0)); // 100.0 est une borne physique de volatilité de somme

  // CORRECTION : Multiplicateurs continus sans constantes arbitraires
  // Si persistance = 1, le poids est doublé.
  adjusted[AlgoKey.FREQUENCY] = (adjusted[AlgoKey.FREQUENCY] || 0) * (1.0 + persistenceFactor);
  adjusted[AlgoKey.MARKOV] = (adjusted[AlgoKey.MARKOV] || 0) * (1.0 + (persistenceFactor * (1.0 / 2.0)));
  
  // Si mean-reversion = 1, le poids est doublé.
  adjusted[AlgoKey.GAPS] = (adjusted[AlgoKey.GAPS] || 0) * (1.0 + meanReversionFactor);
  
  // Les algos de chaos sont amplifiés par le produit du chaos et de la volatilité
  const chaosVolatilityIndex = chaosFactor * volFactor;
  adjusted[AlgoKey.SPECTRAL] = (adjusted[AlgoKey.SPECTRAL] || 0) * (1.0 + chaosVolatilityIndex);
  adjusted[AlgoKey.FRACTAL] = (adjusted[AlgoKey.FRACTAL] || 0) * (1.0 + chaosFactor);
  adjusted[AlgoKey.BAYES] = (adjusted[AlgoKey.BAYES] || 0) * (1.0 + chaosFactor);
  adjusted[AlgoKey.TEMPORAL] = (adjusted[AlgoKey.TEMPORAL] || 0) * (1.0 + chaosFactor);

  // AMPLIFICATION CONTINUE DU POIDS DE LA TENDANCE EN PHASE PERSISTANTE (Requirement 4)
  // Si Hurst > 0.5 (régime persistant), on injecte un multiplicateur de gain proportionnel à (Hurst - 0.5).
  // Cela garantit que la force de la persistance détectée soit pleinement exploitée par les analyses de dynamique.
  if (hurst > 0.5) {
    const persistencePremium = 1.0 + 4.0 * (hurst - 0.5);
    adjusted[AlgoKey.GAP_TREND] = (adjusted[AlgoKey.GAP_TREND] || 0) * persistencePremium;
    adjusted[AlgoKey.GAP_CADENCE] = (adjusted[AlgoKey.GAP_CADENCE] || 0) * persistencePremium;
  }

  return normalizeWeights(adjusted);
};

export const applyMetaLearning = async (weights: AlgoWeights, history: DrawResult[], drawName?: string): Promise<AlgoWeights> => {
  const dynamicWeights = { ...weights };
  try {
    const { getLocalForensicReports } = await import('../postPredictionAnalysisService');
    let forensicReports = await getLocalForensicReports() || [];
    if (drawName) forensicReports = forensicReports.filter(r => r.drawName === drawName);
    
    // CORRECTION : Fenêtre dynamique absolue basée sur l'entropie de l'historique
    const entropyWindow = forensicReports.length > 0 ? 
      Math.abs(forensicReports.reduce((acc, r) => acc + (r.shannon_entropy || 0), 0) / forensicReports.length) : 1;
    const windowSize = Math.max(5, Math.floor(Math.sqrt(forensicReports.length) * (1.0 + (entropyWindow / Math.log2(90)))));
    const recentReports = forensicReports.slice(0, windowSize);
    
    if (recentReports.length > 0) {
      // CORRECTION : Demi-vie dynamique basée sur la taille de la fenêtre
      const dynamicHalfLife = Math.max(1, Math.floor(windowSize / 2));
      const algosList = Object.keys(dynamicWeights) as AlgoKey[];
      const numAlgos = algosList.length || 1;

      // FILTRE DE KALMAN MULTI-DIMENSIONNEL DÉTERMINISTE
      // État de l'estimateur de vélocité de performance/multiplicateur des poids:
      // x: multiplicateur de poids estimé (initialisé à 1.0, neutre)
      // P: covariance d'erreur / incertitude théorique (initialisé à 1.0)
      const kalmanStates: Record<AlgoKey, { x: number; P: number }> = {} as any;
      algosList.forEach(algo => {
        kalmanStates[algo] = { x: 1.0, P: 1.0 };
      });

      // Chargement passif de l'historique de feedback humain pour RLHF (Phase 3)
      const predictionsMap = new Map<string, any>();
      try {
        const { keys: idbKeys } = await import('idb-keyval');
        const allKeys = await idbKeys();
        const histKeys = allKeys.filter(k => typeof k === 'string' && k.startsWith('pred_'));
        for (const k of histKeys) {
          const itemStr = await get(k as string);
          if (itemStr) {
            try {
              const item = typeof itemStr === 'string' ? JSON.parse(itemStr) : itemStr;
              if (item && item.id) {
                predictionsMap.set(item.id, item);
              }
            } catch (_) {}
          }
        }
      } catch (_) {}

      // Simulation chronologique stricte (du plus ancien au plus récent)
      const chronologicalReports = [...recentReports].reverse();

      chronologicalReports.forEach((report, index) => {
        if (report.isBlackSwan) return;

        // Horloge inversée pour calculer le déclin temporel
        const originalIndexInRecent = (recentReports.length - 1) - index;
        const timeDecay = Math.pow(0.5, originalIndexInRecent / dynamicHalfLife); 
        
        // Incertitude intrinsèque de la mesure basée sur le Brier Score [0, 1]
        const brierNormalized = Math.max(0, Math.min(1.0, report.brier_score || 0.5));
        
        // Pénalité d'incertitude liée à l'unité d'intégrité (UFI)
        const ufiPenalty = report.unifiedIntegrityIndex !== undefined ? Math.max(0, (100 - report.unifiedIntegrityIndex) / 100) : 0;
        
        // Bruit de mesure de base R (Zéro Nombre Magique, déduit des algos et pénalités)
        const baseR = Math.max(1.0 / (2.0 * numAlgos), brierNormalized + ufiPenalty * (1.0 / Math.sqrt(numAlgos)));
        
        // Bruit de mesure modulé par le temps d'observation: l'incertitude augmente pour les données historiques (timeDecay faible)
        const finalR = baseR / (timeDecay + Number.EPSILON);

        // Bruit de procédé/dynamique Q (stabilité temporelle et protection anti-amnésie)
        const Q = (1.0 / (numAlgos * numAlgos)) / Math.sqrt(recentReports.length + 1);

        algosList.forEach(algo => {
          const state = kalmanStates[algo];

          // 1. Prediction Step / Phase de Prédiction
          const P_pred = state.P + Q;

          // 2. Observation / Mesure (z_t) recommandée par les analyses d'erreurs
          let z_t = 1.0;

          // A. Ajustements proposés par l'autopsie d'écart
          if (report.proposedAdjustments && report.proposedAdjustments.length > 0) {
            const adj = report.proposedAdjustments.find(a => a.algo === algo);
            if (adj) {
              // Activation continue pour éviter une brisure de gradient
              const shockFactor = 1.0 + ((1.0 / numAlgos) * (1.0 - Math.exp(-Math.abs(adj.proposedWeightChange))));
              z_t += adj.proposedWeightChange * shockFactor;
            }
          }

          // B. Estimations contrefactuelles (Synergies et ADN optimal)
          if (report.counterfactuals && report.counterfactuals.length > 0) {
            report.counterfactuals.forEach(cf => {
              if (cf.action === 'OPTIMAL_DNA' && cf.optimalWeightsDistribution) {
                const optW = cf.optimalWeightsDistribution[algo];
                if (typeof optW === 'number' && weights[algo] > 0) {
                  const multiplier = optW / weights[algo];
                  // Intégration de la divergence d'ADN optimal dans la mesure
                  z_t += (multiplier - 1.0) * (1.0 / 2.0);
                }
              } else if (cf.action === 'SYNERGY' && cf.algo) {
                const parts = cf.algo.split('+').map(a => a.trim() as AlgoKey);
                if (parts.includes(algo)) {
                  z_t += (cf.rankImprovement || 0) / Math.max(1.0, recentReports.length);
                }
              } else if (cf.algo === algo) {
                const modifier = (cf.action === 'BOOST' || cf.action === 'ISOLATE') ? 1.0 : -1.0;
                z_t += modifier * ((cf.rankImprovement || 0) / Math.max(1.0, recentReports.length));
              }
            });
          }

          // C. Compensation de la dérive KL Divergence (Théorie de l'Information)
          if (report.kl_divergence && report.kl_divergence > 0) {
            const maxKL = Math.log(90.0);
            const klImpact = 1.0 - Math.exp(-(report.kl_divergence / maxKL)); // Asymptotique vers 1.0
            const normalizedImpact = klImpact / numAlgos;
            if (algo === AlgoKey.FREQUENCY) z_t -= normalizedImpact;
            if (algo === AlgoKey.GAPS) z_t += normalizedImpact;
            if (algo === AlgoKey.AFFINITY) z_t += normalizedImpact;
          }

          // D. Compensation de l'effondrement de l'Entropie de Shannon
          if (report.shannon_entropy && report.shannon_entropy > 0 && algo === AlgoKey.MARKOV) {
            const maxEntropy = Math.log2(90.0);
            const entropyImpact = 1.0 - Math.exp(-(report.shannon_entropy / maxEntropy)); // Asymptotique vers 1.0
            z_t += entropyImpact / numAlgos;
          }

          // E. Alignement RLHF (Reinforcement Learning from Human Feedback) - Phase 3
          if (report.predictionId) {
            const pred = predictionsMap.get(report.predictionId);
            if (pred && pred.feedback && pred.feedback.userRating) {
              const rating = pred.feedback.userRating;
              const adj = report.proposedAdjustments?.find(a => a.algo === algo);
              const changeMagnitude = adj ? Math.abs(adj.proposedWeightChange) : (1.0 / numAlgos);
              
              if (rating === "Visionnaire") {
                // Renforcement positif proportionnel à l'ajustement proposé
                const isContrib = adj && adj.proposedWeightChange > 0;
                z_t += changeMagnitude * (isContrib ? 1.0 : (1.0 / 2.0)); 
              } else if (rating === "Incohérente") {
                // Pénalisation continue (feedback négatif) 
                const isOffender = adj && adj.proposedWeightChange < 0;
                z_t -= changeMagnitude * (isOffender ? 1.0 : (1.0 / 2.0));
              }
            }
          }

          // Écrêtage physique continu pour éviter les poles singuliers / exponentielles folles
          // Utilisation de la tangente hyperbolique pour mapper vers (0, scale) continuellement
          const scale = Math.log(90.0);
          z_t = scale * Math.tanh(Math.max(Number.EPSILON, z_t) / scale);

          // 3. Phase de mise à jour (Correction de Kalman)
          const rawK = P_pred / (P_pred + finalR); // Gain de Kalman brut
          
          // GESTION DU CATASTROPHIC FORGETTING (Régularisation de Huber / Norme L1)
          const innovation = z_t - state.x;
          // Utilisation de la distribution de Cauchy pour étaler la sensibilité aux valeurs aberrantes
          // Le facteur de dispersion (gamma) est lié à l'incertitude P_pred
          const gamma = Math.max(Number.EPSILON, P_pred);
          const resilienceFactor = 1.0 / (1.0 + Math.pow((innovation / gamma), 2));
          const K = rawK * resilienceFactor; // Gain de Kalman throttlé

          state.x = state.x + K * innovation; // Mise à jour de l'estimation de l'état
          state.P = (1.0 - K) * P_pred; // Mise à jour de la covariance d'erreur
        });
      });

      // Injection des ratios Kalman stabilisés dans les poids physiques du moteur
      algosList.forEach(algo => {
        dynamicWeights[algo] *= kalmanStates[algo].x;
      });

      return normalizeWeights(dynamicWeights);
    }
  } catch (e) {
    logger.warn({ err: e }, "Erreur Meta-Learning, fallback vers les poids normalisés.");
  }

  if (history.length < 20) return normalizeWeights(dynamicWeights);

  return new Promise((resolve) => {
    try {
      const worker = new Worker(new URL('../../workers/metaLearning.worker.ts?worker', import.meta.url), { type: 'module' });
      worker.onmessage = (event) => {
        const { type, bestConfig, error } = event.data;
        if (type === 'SUCCESS' && bestConfig) resolve(bestConfig);
        else {
          logger.warn({ err: error }, "Worker error during meta-learning fallback");
          resolve(normalizeWeights(dynamicWeights));
        }
        worker.terminate();
      };
      worker.onerror = (e) => {
        logger.warn({ err: e.message }, "Worker execution error");
        resolve(normalizeWeights(dynamicWeights));
        worker.terminate();
      };
      worker.postMessage({ dynamicWeights, history });
    } catch (err) {
      logger.warn({ err }, "Failed to spawn meta-learning worker");
      resolve(normalizeWeights(dynamicWeights));    }
  });
};

const weightsCache = new Map<string, { weights: AlgoWeights; timestamp: number }>();
const CACHE_TTL_MS = 1000 * 30; // Cache weights for 30 seconds to deduplicate database queries

export const getAlgoWeights = async (drawName: string): Promise<AlgoWeights> => {
  const now = Date.now();
  const cached = weightsCache.get(drawName);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.weights;
  }

  let weights: AlgoWeights = getDefaultWeights();
  let localWeights: Partial<AlgoWeights> | null = null;
  let localUpdatedAt: Date | null = null;
  let remoteWeights: Partial<AlgoWeights> | null = null;
  let remoteUpdatedAt: Date | null = null;

  // 1. Lire les poids locaux depuis IndexedDB (Source de Vérité Locale) sans aucun fallback synchrone vers localStorage
  if (typeof window !== 'undefined') {
    try {
      const parsed = await get<{ weights: Partial<AlgoWeights>; updatedAt?: string }>(`nexus_config_${drawName}`);
      if (parsed?.weights && Object.keys(parsed.weights).length > 0) {
        localWeights = parsed.weights as Partial<AlgoWeights>;
        if (parsed.updatedAt) {
          localUpdatedAt = new Date(parsed.updatedAt);
        }
      }
    } catch (e) { /* Silenced */ }
  }

  // 2. Lire les poids distants depuis Supabase
  if (isSupabaseConfigured() && navigator.onLine) {
    try {
      const { data } = await supabase
        .from('algo_weights')
        .select('weights, updated_at')
        .eq('draw_name', drawName)
        .maybeSingle();

      if (data?.weights) {
        remoteWeights = data.weights as Partial<AlgoWeights>;
        if (data.updated_at) {
          remoteUpdatedAt = new Date(data.updated_at);
        }
      }
    } catch (e) { /* Silenced */ }
  }

  // 3. Choix intelligent de l'ADN (Stratégie Local-First robuste basée sur l'horodatage)
  let selectedWeights: Partial<AlgoWeights> | null = null;

  if (localWeights && remoteWeights) {
    if (localUpdatedAt && remoteUpdatedAt) {
      // Tolérance de 5 minutes (300 000 ms) pour empêcher des skews NTP ou database latency d'écraser les modifications locales
      if (localUpdatedAt.getTime() + 300000 >= remoteUpdatedAt.getTime()) {
        selectedWeights = localWeights;
      } else {
        selectedWeights = remoteWeights;
      }
    } else {
      // Priorité au local par défaut en l'absence de timestamp (Local-First)
      selectedWeights = localWeights;
    }
  } else {
    selectedWeights = localWeights || remoteWeights;
  }

  if (selectedWeights) {
    weights = { ...weights, ...selectedWeights };
  }

  const finalWeights = normalizeWeights(weights);
  
  // Cache the weights
  weightsCache.set(drawName, { weights: finalWeights, timestamp: now });
  return finalWeights;
};

export const saveAlgoWeights = async (drawName: string, weights: AlgoWeights) => {
  // Update memory cache immediately
  weightsCache.set(drawName, { weights, timestamp: Date.now() });

  try {
    if (typeof window !== 'undefined') {
      const payload = { weights, updatedAt: new Date().toISOString() };
      await set(`nexus_config_${drawName}`, payload);
    }
    if (isSupabaseConfigured()) {
      await supabase.from('algo_weights').upsert({ draw_name: drawName, weights });
    }
  } catch (e) { /* Silenced */ }
};

export const applyForensicCalibration = (
  currentWeights: AlgoWeights,
  suggestions: Array<{ algo: string, action: string, improvement: number }>,
  historyLength: number // Ajout pour dériver le damping
): AlgoWeights => {
  const newWeights = { ...currentWeights };
  const numAlgos = Object.keys(currentWeights).length || 1;
  
  // CORRECTION : Damping dérivé de l'inverse de la racine de la taille de l'historique (loi des grands nombres)
  // Plus l'historique est long, plus on fait confiance aux données réelles, moins on damp les ajustements.
  const dampingMin = 1.0 / numAlgos;
  const dampingMax = 1.0 / Math.sqrt(numAlgos);
  const damping = Math.max(dampingMin, Math.min(dampingMax, 1.0 / Math.sqrt(historyLength)));

  suggestions.forEach(s => {
    const change = (s.improvement / 100.0) * damping;
    if (s.action === 'SYNERGY') {
      const parts = s.algo.split('+').map(p => p.trim() as AlgoKey);
      parts.forEach(p => {
        if (newWeights[p] !== undefined) newWeights[p] = (newWeights[p] || 0) * (1.0 + (change / parts.length));
      });
    } else {
      const key = s.algo as AlgoKey;
      if (newWeights[key] === undefined) return;
      if (s.action === 'BOOST' || s.action === 'ISOLATE') {
        newWeights[key] = (newWeights[key] || 0) * (1.0 + change);
      } else if (s.action === 'REDUCE') {
        newWeights[key] = (newWeights[key] || 0) * (1.0 - change);
      }
    }
  });
  return normalizeWeights(newWeights);
};

/**
 * APPLIQUE UNE RÉTROACTION BAYÉSIENNE SUR LES POIDS D'ALGORITHMES LOCAUX
 * Basée sur la validation manuelle de l'opérateur (RLHF / Forensic Autopsy).
 * Ajuste les poids de façon continue et déterministe (sans nombre magique ni Math.random()).
 */
export const applyBayesianForensicFeedback = async (
  drawName: string,
  report: ForensicReport,
  userRating: "Visionnaire" | "Standard" | "Incohérente"
): Promise<AlgoWeights> => {
  const currentWeights = await getAlgoWeights(drawName);
  const newWeights = { ...currentWeights };
  
  // Facteur de feedback : 1.0 (Visionnaire), 0.0 (Standard), -1.0 (Incohérente)
  const feedbackScore = userRating === "Visionnaire" ? 1.0 : (userRating === "Incohérente" ? -1.0 : 0.0);
  
  // Si le feedback est neutre (Standard), pas de modification requise
  if (feedbackScore === 0.0) return currentWeights;

  const validKeys = Object.values(AlgoKey);
  const numAlgos = validKeys.length || 1;
  // Coefficient d'apprentissage bayésien dérivé pour préserver l'entropie
  const baseLR = 1.0 / (2.0 * numAlgos);
  
  if (report.proposedAdjustments && report.proposedAdjustments.length > 0) {
    report.proposedAdjustments.forEach((adj) => {
      const key = adj.algo as AlgoKey;
      if (!validKeys.includes(key) || newWeights[key] === undefined) return;
      
      // La dérive bayésienne ajuste le poids :
      // - Si feedbackScore > 0 (Visionnaire), on se déplace dans le sens de l'ajustement proposé.
      // - Si feedbackScore < 0 (Incohérente), on se déplace dans le sens opposé (pénalisation).
      const adjustment = adj.proposedWeightChange * feedbackScore * baseLR;
      
      // Loi de transition continue avec tangente hyperbolique (respect d'AGENTS.md)
      newWeights[key] = newWeights[key] * (1.0 + Math.tanh(adjustment));
    });
  } else if (report.counterfactuals && report.counterfactuals.length > 0) {
    // Si pas d'ajustements directs, on utilise les contrefactuels de performance
    report.counterfactuals.forEach((cf) => {
      if (cf.algo) {
        const key = cf.algo as AlgoKey;
        if (!validKeys.includes(key) || newWeights[key] === undefined) return;
        const change = (cf.rankImprovement || 1.0) / 100.0;
        const adjustment = change * feedbackScore * baseLR;
        newWeights[key] = newWeights[key] * (1.0 + Math.tanh(adjustment));
      }
    });
  }

  const finalNormalized = normalizeWeights(newWeights);
  await saveAlgoWeights(drawName, finalNormalized);
  
  return finalNormalized;
};
