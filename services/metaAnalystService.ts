
import {
  PlatinumResult,
  DrawResult,
  ScoreBreakdown,
  SymbioticContext,
  PlatinumScenario,
  PlatinumAudit,
  EntropyMetric,
  ChiSquareMetric
} from '../types';
import {
  getAlgoWeights,
  generateMasterPrediction,
} from './predictionEngine';

// ═══════════════════════════════════════════════════════════════
// CONSTANTS & CONFIGURATION
// ═══════════════════════════════════════════════════════════════

const MAX_NUM = 90;
const DRAW_SIZE = 5;
const HISTORY_LIMIT = 20;

// ═══════════════════════════════════════════════════════════════
// MATH KERNEL (PURE FUNCTIONS)
// ═══════════════════════════════════════════════════════════════

/**
 * Normalise un vecteur de valeurs entre 0 et 100
 */
const normalizeVector = (vector: Float64Array): Float64Array => {
    let max = 0;
    for (let i = 0; i < vector.length; i++) if (vector[i] > max) max = vector[i];
    if (max === 0) return vector;
    
    const normalized = new Float64Array(vector.length);
    for (let i = 0; i < vector.length; i++) {
        normalized[i] = (vector[i] / max) * 100;
    }
    return normalized;
};

/**
 * Calcul de l'entropie sur un vecteur de distribution
 */
const computeVectorEntropy = (vector: Float64Array): number => {
    let sum = 0;
    for (let i = 1; i <= MAX_NUM; i++) sum += vector[i];
    if (sum === 0) return 1.0;

    let entropy = 0;
    for (let i = 1; i <= MAX_NUM; i++) {
        const p = vector[i] / sum;
        if (p > 0) entropy -= p * Math.log(p);
    }
    const maxEntropy = Math.log(MAX_NUM);
    return entropy / maxEntropy;
};

/**
 * Sélectionne des numéros basés sur le vecteur de probabilité
 * avec une température pour introduire de la variété
 */
const sampleFromVector = (
    vector: Float64Array, 
    count: number, 
    temperature: number = 1.0
): number[] => {
    const candidates: { n: number, score: number }[] = [];
    
    for (let i = 1; i <= MAX_NUM; i++) {
        const score = vector[i];
        if (score > 1) {
            // Softmax-like temperature scaling
            const adjustedScore = Math.pow(score, 1 / temperature);
            candidates.push({ n: i, score: adjustedScore });
        }
    }

    // Sort descending by score for basic selection
    candidates.sort((a,b) => b.score - a.score);

    // Weighted Random Selection (Reservoir Sampling-like)
    const selected: number[] = [];
    const pool = [...candidates];
    
    while(selected.length < count && pool.length > 0) {
        let totalWeight = 0;
        pool.forEach(c => totalWeight += c.score);
        
        let r = Math.random() * totalWeight;
        let idx = 0;
        
        for(let i=0; i<pool.length; i++) {
            r -= pool[i].score;
            if(r <= 0) {
                idx = i;
                break;
            }
        }
        
        selected.push(pool[idx].n);
        pool.splice(idx, 1); // Remove selected to avoid duplicates
    }

    return selected.sort((a,b) => a-b);
};

// ═══════════════════════════════════════════════════════════════
// PLATINUM ENGINE
// ═══════════════════════════════════════════════════════════════

export async function generatePlatinumPrediction(
  drawName: string,
  history: DrawResult[],
  metrics?: { entropy?: EntropyMetric; volatility?: { score?: number }; [k: string]: unknown },
  _userBias?: unknown,
  symbioticContext?: SymbioticContext | null,
  _basePrediction?: any,
): Promise<PlatinumResult> {
  
  if (history.length < 10) throw new Error("Dataset insuffisant.");

  // 1. ACQUISITION DES SIGNAUX BRUTS (Base Prediction)
  // On réutilise le moteur de prédiction standard pour obtenir les breakdowns par numéro
  const weights = await getAlgoWeights(drawName);
  const masterPred = await generateMasterPrediction(drawName, history, weights, metrics, symbioticContext || undefined);
  const breakdowns = masterPred.breakdown || {};

  // 2. CONSTRUCTION DU VECTEUR CONSENSUS (TENSOR AGGREGATION)
  // On aplatit tous les signaux (freq, gap, spectral, etc.) dans un seul vecteur maître
  const consensusVector = new Float64Array(MAX_NUM + 1); // Index 1-90

  for (let i = 1; i <= MAX_NUM; i++) {
      const bd = breakdowns[i];
      if (!bd) continue;
      
      let score = 0;
      // Agrégation non-linéaire : On favorise les signaux forts concordants
      // Si plusieurs algos donnent > 50, le score explose (Résonance)
      const values = Object.values(bd).filter(v => typeof v === 'number') as number[];
      const strongSignals = values.filter(v => v > 60).length;
      const baseSum = values.reduce((a,b) => a+b, 0);
      
      // Formule de Fusion
      score = baseSum;
      if (strongSignals >= 2) score *= 1.2;
      if (strongSignals >= 3) score *= 1.5;

      consensusVector[i] = score;
  }

  // Normalisation (0-100) pour l'affichage et l'échantillonnage
  const normalizedVector = normalizeVector(consensusVector);

  // 3. ANALYSE DU RÉGIME
  const entropyScore = computeVectorEntropy(normalizedVector);
  let regime: 'STABLE' | 'TRANSITION' | 'CHAOTIC' = 'TRANSITION';
  
  if (entropyScore < 0.75) regime = 'STABLE'; // Pics très nets, prédiction confiante
  else if (entropyScore > 0.90) regime = 'CHAOTIC'; // Distribution plate, bruit élevé

  // 4. GÉNÉRATION DES SCÉNARIOS STRATÉGIQUES
  // Au lieu de "Personnages", on génère des profils de risque mathématiques
  
  const scenarios: PlatinumScenario[] = [];

  // Scénario A : CONSERVATEUR (Low Temperature)
  // Prend les pics les plus hauts du consensus. Minimise la variance.
  scenarios.push({
      id: 'alpha',
      name: 'Alpha Core',
      description: 'Convergence maximale des modèles. Cible les pics de probabilité les plus stables.',
      numbers: sampleFromVector(normalizedVector, DRAW_SIZE, 0.4), // Température basse
      probability: 95,
      risk: 'LOW',
      color: '#10b981' // Emerald
  });

  // Scénario B : ÉQUILIBRÉ (Mid Temperature)
  // Mélange les favoris et les outsiders forts (Zone médiane).
  scenarios.push({
      id: 'beta',
      name: 'Beta Flow',
      description: 'Équilibre dynamique. Intègre les vecteurs secondaires à fort potentiel de rupture.',
      numbers: sampleFromVector(normalizedVector, DRAW_SIZE, 1.0), // Température moyenne
      probability: 85,
      risk: 'MEDIUM',
      color: '#6366f1' // Indigo
  });

  // Scénario C : AGRESSIF (High Temperature)
  // Cherche dans la "queue" de distribution des signaux forts mais non-dominants (Black Swans).
  scenarios.push({
      id: 'gamma',
      name: 'Gamma Burst',
      description: 'Haute variance. Cible les anomalies statistiques et les signaux cachés.',
      numbers: sampleFromVector(normalizedVector, DRAW_SIZE, 1.8), // Température haute
      probability: 60,
      risk: 'HIGH',
      color: '#f43f5e' // Rose
  });

  // 5. CALCUL DE LA COHÉRENCE GLOBALE
  // Inverse de l'entropie : plus c'est bas, plus le système est "sûr" de lui
  const coherence = Math.round((1 - entropyScore) * 100);

  return {
      id: crypto.randomUUID(),
      drawName,
      timestamp: Date.now(),
      confidence: coherence,
      consensusVector: Array.from(normalizedVector), // Convert to standard array for JSON
      scenarios,
      coherence,
      regime,
      entropy: entropyScore
  };
}

// ═══════════════════════════════════════════════════════════════
// PERSISTENCE
// ═══════════════════════════════════════════════════════════════

const storageKey = (name: string) => `platinum_hyper_${name}`;

export const savePlatinumHistory = (result: PlatinumResult): void => {
  try {
    const key = storageKey(result.drawName);
    const existing = JSON.parse(localStorage.getItem(key) ?? '[]') as PlatinumResult[];
    const updated = [result, ...existing.slice(0, 19)];
    localStorage.setItem(key, JSON.stringify(updated));
  } catch (err) {
    console.error('Storage Error', err);
  }
};

export const getPlatinumHistory = (drawName: string): PlatinumResult[] => {
  try {
    return JSON.parse(localStorage.getItem(storageKey(drawName)) ?? '[]');
  } catch {
    return [];
  }
};

export const performPlatinumAudit = (
  prediction: PlatinumResult,
  actualResult: DrawResult,
): PlatinumAudit => {
    // Audit simplifié pour la nouvelle structure
    const winners = new Set(actualResult.gagnants);
    let bestScenarioId = '';
    let bestHits = -1;

    const performances = prediction.scenarios.map(s => {
        const hits = s.numbers.filter(n => winners.has(n)).length;
        if (hits > bestHits) {
            bestHits = hits;
            bestScenarioId = s.name;
        }
        return {
            type: s.name,
            hits,
            numbers: s.numbers.filter(n => winners.has(n))
        };
    });

    return {
        predictionId: prediction.id,
        date: actualResult.date,
        actualDraw: actualResult.gagnants,
        bestTimeline: bestScenarioId,
        bestScore: bestHits,
        syncScore: Math.round((bestHits / 5) * 100),
        timelinePerformance: performances,
        verdict: bestHits >= 3 ? "Succès Confirmé" : bestHits >= 1 ? "Signal Partiel" : "Divergence"
    };
};
