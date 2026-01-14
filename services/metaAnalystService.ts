
import { 
  PlatinumResult, 
  DrawResult, 
  SpectralMetric,
  StrategyBias 
} from '../types';
import { 
  getAlgoWeights, 
  generateMasterPrediction
} from './predictionEngine';
import { 
  calculateSpectralMetricsAsync,
  calculateShannonEntropy,
  calculateVolatility,
  detectGameRegime,
  validateDataIntegrity
} from './mathService';
import { fetchResults } from './lotteryService';
import { generateShadowOracleVector } from './forensicAuditService';

/**
 * Nexus AutoCycle v7.1 - Tirage Unique Edition
 * 
 * Fonctionnement:
 * 1. Analyse l'historique UNIQUE du tirage sélectionné
 * 2. Détection automatique de phase cyclique
 * 3. Auto-calibration des paramètres (bias, poids)
 * 4. Génération de prédiction avec ajustements dynamiques
 */

interface CyclePhase {
  phase: 'peak' | 'trough' | 'ascending' | 'descending' | 'chaotic';
  confidence: number;
  daysToPeak: number;
  spectralResonance: number;
}

interface DrawAnalysis {
  drawName: string;
  history: DrawResult[];
  phase: CyclePhase;
  priorityScore: number;
  bias: StrategyBias;
  metrics: {
    volatility: number;
    entropy: number;
    hurst: number;
    dataQuality: number;
  };
}

// Cache intelligent avec invalidation par date
const ANALYSIS_CACHE = new Map<string, { analysis: DrawAnalysis, expiry: number }>();
const PREDICTION_CACHE = new Map<string, { result: PlatinumResult, expiry: number }>();

// Durée de validité du cache (5 minutes)
const CACHE_TTL = 5 * 60 * 1000;

/**
 * Fonction PRINCIPALE - Obtient la prédiction optimale pour UN tirage spécifique
 */
export async function getOptimalPrediction(drawName: string): Promise<{
  selectedDraw: string;
  priorityScore: number;
  prediction: PlatinumResult;
  analysis: string;
  timestamp: number;
}> {
  console.log(`[AutoCycle] 🔍 Analysing draw: ${drawName}`);

  let history: DrawResult[];
  try {
    const { data } = await fetchResults(drawName);
    history = data;
  } catch (error: any) {
    throw new Error(`❌ Impossible de charger le tirage "${drawName}": ${error.message}`);
  }

  // Validation stricte
  const integrity = validateDataIntegrity(history);
  if (integrity.issues.length > 0 && integrity.score < 50) {
    throw new Error(`❌ Tirage invalide: ${integrity.issues.join(', ')}`);
  }

  if (history.length < 30) {
    throw new Error(`❌ Historique insuffisant: ${history.length} tirages (minimum: 30)`);
  }

  // Vérifier la fraîcheur des données
  if (history.length > 0) {
      const lastDrawDate = new Date(history[0].date);
      const daysSinceLast = (Date.now() - lastDrawDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceLast > 7) {
        console.warn(`[AutoCycle] ⚠️ Données obsolètes: ${Math.floor(daysSinceLast)} jours`);
      }
  }

  // Étape 2: Analyse cyclique détaillée
  const analysis = await analyzeDrawCycle(drawName, history);
  
  // Étape 3: Générer prédiction optimale
  const prediction = await generateOptimalPrediction(analysis);

  // Étape 4: Logging
  const analysisLog = `
Tirage: ${analysis.drawName}
Phase: ${analysis.phase.phase} (conf: ${(analysis.phase.confidence*100).toFixed(0)}%)
Volatilité: ${analysis.metrics.volatility}%
Entropie: ${(analysis.metrics.entropy*100).toFixed(0)}%
Hurst: ${analysis.metrics.hurst.toFixed(2)}
Bias: Chaos=${(analysis.bias.chaos*100).toFixed(0)}% | Stab=${(analysis.bias.stability*100).toFixed(0)}% | Harm=${(analysis.bias.harmony*100).toFixed(0)}%
  `.trim();

  return {
    selectedDraw: analysis.drawName,
    priorityScore: analysis.priorityScore,
    prediction,
    analysis: analysisLog,
    timestamp: Date.now()
  };
}

/**
 * Analyse la phase cyclique d'UN tirage spécifique
 */
async function analyzeDrawCycle(
  drawName: string, 
  history: DrawResult[]
): Promise<DrawAnalysis> {
  const cacheKey = `${drawName}:${history[0].date}:${history.length}`;
  const cached = ANALYSIS_CACHE.get(cacheKey);
  
  if (cached && Date.now() < cached.expiry) {
    return cached.analysis;
  }

  // Métrics de base
  const volatility = calculateVolatility(history);
  const entropy = calculateShannonEntropy(history.slice(0, 50));
  const regime = detectGameRegime(history);
  
  // Analyse spectrale avec gestion d'erreur
  let spectral: SpectralMetric[] = [];
  try {
    spectral = await calculateSpectralMetricsAsync(history);
  } catch (error: any) {
    console.warn(`[AutoCycle] Spectral analysis failed: ${error.message}`);
    spectral = [];
  }

  // Détection de phase
  const phase = detectSpectralPhase(spectral, history);
  
  // Calcul du bias adaptatif
  const bias = calculateDynamicBias(volatility, entropy, regime);

  // Score de priorité (0-100)
  const priorityScore = calculatePriorityScore({
    phase,
    volatility,
    entropy,
    regime,
    dataQuality: validateDataIntegrity(history).score
  });

  const analysis: DrawAnalysis = {
    drawName,
    history,
    phase,
    priorityScore,
    bias,
    metrics: {
      volatility: volatility.score,
      entropy: entropy.normalized,
      hurst: regime.hurst,
      dataQuality: validateDataIntegrity(history).score
    }
  };

  ANALYSIS_CACHE.set(cacheKey, { analysis, expiry: Date.now() + CACHE_TTL });
  return analysis;
}

/**
 * Détecte la phase cyclique actuelle via analyse spectrale
 */
function detectSpectralPhase(
  spectral: SpectralMetric[], 
  history: DrawResult[]
): CyclePhase {
  if (!spectral || spectral.length === 0) {
    return {
      phase: 'chaotic',
      confidence: 0.3,
      daysToPeak: 7,
      spectralResonance: 0
    };
  }

  const energies = spectral.map(s => s.energy);
  const avgEnergy = energies.reduce((a, b) => a + b, 0) / energies.length;
  const maxEnergy = Math.max(...energies);
  const dominant = spectral.find(s => s.energy === maxEnergy);

  // Analyse de l'historique récent
  const recent = history.slice(0, 10);
  let trendUp = false;
  if (recent.length >= 2) {
    const recentSums = recent.map(d => d.gagnants.reduce((a, b) => a + b, 0));
    trendUp = recentSums[0] > recentSums[recentSums.length - 1];
  }

  let phase: CyclePhase['phase'] = 'chaotic';
  let confidence = 0.5;
  let daysToPeak = 7;

  if (maxEnergy > 75 && dominant) {
    if (trendUp) {
      phase = 'peak';
      confidence = 0.85;
      daysToPeak = 0;
    } else {
      phase = 'descending';
      confidence = 0.7;
      daysToPeak = 3;
    }
  } else if (avgEnergy < 30) {
    phase = 'trough';
    confidence = 0.6;
    daysToPeak = 5;
  }

  return {
    phase,
    confidence,
    daysToPeak,
    spectralResonance: avgEnergy
  };
}

/**
 * Calcule le bias dynamiquement selon les métriques détectées
 */
function calculateDynamicBias(
  volatility: ReturnType<typeof calculateVolatility>,
  entropy: ReturnType<typeof calculateShannonEntropy>,
  regime: ReturnType<typeof detectGameRegime>
): StrategyBias {
  let stability = 0.5;
  let chaos = 0.3;
  let harmony = 0.5;

  // Volatilité élevée → Plus de chaos
  if (volatility.score > 60) {
    chaos = Math.min(0.85, 0.3 + (volatility.score - 60) / 100);
    stability = Math.max(0.15, 0.5 - (volatility.score - 60) / 150);
  }

  // Entropie élevée → Encore plus de chaos
  if (entropy.normalized > 0.9) {
    chaos = Math.min(0.9, chaos + 0.15);
    stability = Math.max(0.1, stability - 0.1);
  }

  // Hurst persistant → Plus de stabilité/harmonie
  if (regime.hurst > 0.65) {
    stability = Math.min(0.8, stability + 0.2);
    harmony = Math.min(0.8, harmony + 0.15);
  }

  return {
    stability: parseFloat(stability.toFixed(2)),
    chaos: parseFloat(chaos.toFixed(2)),
    harmony: parseFloat(harmony.toFixed(2))
  };
}

/**
 * Calcule le score de priorité pour UN tirage
 */
function calculatePriorityScore(params: {
  phase: CyclePhase;
  volatility: ReturnType<typeof calculateVolatility>;
  entropy: ReturnType<typeof calculateShannonEntropy>;
  regime: ReturnType<typeof detectGameRegime>;
  dataQuality: number;
}): number {
  let score = 50; // Base neutre

  // Phase cyclique favorable = +20pts
  if (params.phase.phase === 'peak' || params.phase.phase === 'ascending') {
    score += params.phase.confidence * 20;
  }

  // Volatilité modérée = +15pts
  if (params.volatility.score > 30 && params.volatility.score < 70) {
    score += 15;
  }

  // Entropie équilibrée = +10pts
  if (params.entropy.normalized > 0.85 && params.entropy.normalized < 0.95) {
    score += 10;
  }

  // Qualité de données élevée = +5pts
  score += (params.dataQuality / 100) * 5;

  // Bonus si Hurst proche de 0.5 (cycle naturel)
  if (Math.abs(params.regime.hurst - 0.5) < 0.1) {
    score += 5;
  }

  return Math.min(100, Math.max(0, score));
}

/**
 * Calculateur de Biais Utilisateur Optimal
 * Retourne le biais suggéré pour le draw actuel
 */
export function calculateOptimalUserBias(drawName: string, history: DrawResult[]): StrategyBias {
    const vol = calculateVolatility(history);
    const ent = calculateShannonEntropy(history.slice(0, 50));
    const reg = detectGameRegime(history);
    return calculateDynamicBias(vol, ent, reg);
}

/**
 * Sauvegarde l'historique Platinum (Placeholder)
 */
export function savePlatinumHistory(result: PlatinumResult) {
    // Logique de persistance
    try {
        const key = `nexus_platinum_${result.drawName}_latest`;
        localStorage.setItem(key, JSON.stringify(result));
    } catch (e) {
        console.warn("Failed to save Platinum result locally");
    }
}

/**
 * Génère une prédiction optimale pour un tirage analysé
 */
async function generateOptimalPrediction(analysis: DrawAnalysis): Promise<PlatinumResult> {
  const cacheKey = `${analysis.drawName}:${analysis.history[0].date}:v7`;
  const cached = PREDICTION_CACHE.get(cacheKey);
  
  if (cached && Date.now() < cached.expiry) {
    return cached.result;
  }

  // Calcul des poids auto-optimisés
  const autoWeights = await getAlgoWeights(analysis.drawName);
  
  // Génération de la prédiction principale
  const masterPred = await generateMasterPrediction(
    analysis.drawName,
    analysis.history,
    autoWeights,
    { spectral: await calculateSpectralMetricsAsync(analysis.history) }
  );

  // Génération du vecteur anti-consensus (shadow)
  const oracleScores: Record<number, number> = {};
  if (masterPred.breakdown) {
      Object.entries(masterPred.breakdown).forEach(([k, v]) => {
          const vals = Object.values(v).filter((x): x is number => typeof x === 'number');
          oracleScores[Number(k)] = vals.reduce((a, b) => a + b, 0) / vals.length;
      });
  }
  
  const shadowVector = generateShadowOracleVector(
    analysis.history,
    oracleScores
  );

  // Fusion intelligente: 70% Master + 30% Shadow
  const finalKingNumbers = [
    ...masterPred.suggestedNumbers.slice(0, 3),
    ...shadowVector.slice(0, 2)
  ].filter((n, i, arr) => arr.indexOf(n) === i).sort((a, b) => a - b);

  // Création du résultat Platinum
  const result: PlatinumResult = {
    id: crypto.randomUUID(), 
    kingNumbers: finalKingNumbers.map((n, i) => ({ number: n, count: 5 - i })),
    combinations: [{
      numbers: finalKingNumbers,
      score: masterPred.confidence,
      tags: ['AutoCycle v7', 'Master+Shadow Fusion'],
      breakdown: {
        harmony: Math.round(analysis.bias.harmony * 100),
        stability: Math.round(analysis.bias.stability * 100),
        chaos: Math.round(analysis.bias.chaos * 100),
        pattern: masterPred.confidence
      }
    }],
    targetSumRange: {
      min: finalKingNumbers.reduce((a, b) => a + b, 0) - 10,
      max: finalKingNumbers.reduce((a, b) => a + b, 0) + 10,
      reason: 'AutoCycle Adaptive'
    },
    hotZonesSpectro: masterPred.candidates.slice(0, 10),
    confidence: masterPred.confidence,
    analysis: `AutoCycle: ${analysis.phase.phase} phase | ${analysis.metrics.volatility}% vol | Entropy ${(analysis.metrics.entropy*100).toFixed(0)}%`,
    drawName: analysis.drawName,
    timestamp: Date.now(),
    nextDraw: {
      expectedDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      predictedNumbers: finalKingNumbers
    }
  };

  PREDICTION_CACHE.set(cacheKey, { result, expiry: Date.now() + CACHE_TTL });
  return result;
}

/**
 * Export pour compatibilité descendante
 */
export async function generatePlatinumPrediction(
    drawName: string, 
    history?: DrawResult[],
    metrics?: any,
    bias?: StrategyBias
): Promise<PlatinumResult> {
  const data = history || (await fetchResults(drawName)).data;
  const analysis = await analyzeDrawCycle(drawName, data);
  if (bias) analysis.bias = bias;
  return generateOptimalPrediction(analysis);
}
