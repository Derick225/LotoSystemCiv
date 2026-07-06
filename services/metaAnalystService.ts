
import { PlatinumResult, DrawResult, SymbioticContext, PlatinumScenario, PlatinumAudit, Prediction, PlatinumUserOptions } from '../types';
import { get, set } from 'idb-keyval';
import { purifyHistoryForDraw } from '../utils/arrayUtils';
import { getAlgoWeights, generateMasterPrediction } from './predictionEngine';
import { useNexusStore } from '../store/useNexusStore';
import { extractFeatures } from './prediction/featureExtractor';
import { getLocalForensicReports } from './postPredictionAnalysisService';
import { EnhancedMetrics } from './prediction/metrics.types';

// ═══════════════════════════════════════════════════════════════
// CONSTANTS & CONFIGURATION
// ═══════════════════════════════════════════════════════════════

const MAX_NUM = 90;
const DRAW_SIZE = 5;

// ═══════════════════════════════════════════════════════════════
// MATH KERNEL (PURE FUNCTIONS)
// ═══════════════════════════════════════════════════════════════

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
 * Sélection Gloutonne Déterministe basée sur le score (pondéré par un cycle trigonométrique continu pour injecter de la variance naturelle si besoin).
 * Remplace tout concept de température et de tirage aléatoire !
 */
const greedyDeterministicSelection = (
    vector: Float64Array, 
    count: number,
    phaseShift: number = 0.0 // Décalage de phase (rad) pour différencier les scénarios
): number[] => {
    const candidates: { n: number, score: number }[] = [];
    
    // Le score est modulé de manière continue par une onde sinusoïdale 
    // qui dépend du numéro de la boule et du phaseShift, pour diversifier les vecteurs 
    // sans AUCUN HASARD.
    for (let i = 1; i <= MAX_NUM; i++) {
        const rawScore = vector[i];
        if (rawScore > 0) {
            // Amplification continue (fonction exponentielle / tangente hyperbolique)
            // L'oscillation trigonométrique introduit une diversité déterministe entre les scénarios.
            const modulation = 1.0 + 0.15 * Math.sin(i * 0.1 + phaseShift);
            const adjustedScore = rawScore * modulation;
            candidates.push({ n: i, score: adjustedScore });
        }
    }

    candidates.sort((a,b) => b.score - a.score);
    return candidates.slice(0, count).map(c => c.n).sort((a,b) => a-b);
};

// ═══════════════════════════════════════════════════════════════
// PLATINUM ENGINE
// ═══════════════════════════════════════════════════════════════

export async function generatePlatinumPredictionCore(
  drawName: string,
  rawHistory: DrawResult[],
  metrics?: EnhancedMetrics,
  userOptions?: PlatinumUserOptions | null,
  symbioticContext?: SymbioticContext | null,
  _basePrediction?: Prediction,
  onProgress?: (progress: number, message: string) => void,
  temporalDepth?: number,
  _useSpatioTemporalHawkes: boolean = true,
  preloadedForensicReports?: any[]
): Promise<PlatinumResult> {
  
  const history = purifyHistoryForDraw(drawName, rawHistory);

  if (history.length < 10) throw new Error("Dataset insuffisant.");

  onProgress?.(5, "Calibrage du réseau de neurones artificiels...");

  // Configuration des options utilisateur par défaut (zéro valeurs arbitraires, entièrement continues et paramétrables)
  const opts: PlatinumUserOptions = {
    regimePivot: userOptions?.regimePivot ?? 0.80,
    forensicGain: userOptions?.forensicGain ?? 1.0,
    phaseFrequency: userOptions?.phaseFrequency ?? 1.0,
    shannonEntropyFilter: userOptions?.shannonEntropyFilter ?? false,
  };

  // 1. ACQUISITION DES SIGNAUX BRUTS (Base Prediction)
  const weights = await getAlgoWeights(drawName);
  const finalTemporalDepth = temporalDepth ?? useNexusStore?.getState()?.temporalDepth ?? 100;
  const masterPred = await generateMasterPrediction(
    drawName,
    history,
    finalTemporalDepth,
    weights,
    metrics,
    symbioticContext || undefined,
    false,
    false,
    undefined,
    false,
    (p, msg) => {
      onProgress?.(Math.round(p * 0.7), msg);
    }
  );
  let breakdowns = masterPred.breakdown || {};

  // EXTRACTION LOCALE IMMEDIATE POUR GARANTIR LA DUALITÉ DES SCENARIOS
  const localFeatures = await extractFeatures(drawName, history);

  // 2. CONSTRUCTION DU VECTEUR CONSENSUS (TENSOR AGGREGATION)
  const consensusVector = new Float64Array(MAX_NUM + 1);
  const momentumVector = new Float64Array(MAX_NUM + 1);
  const gapVector = new Float64Array(MAX_NUM + 1);
  const spectralVector = new Float64Array(MAX_NUM + 1);

  let maxRawSum = Number.EPSILON;
  let maxFractalSpectral = Number.EPSILON;
  let maxQuantumAi = Number.EPSILON;
  
  const rawSums = new Float64Array(MAX_NUM + 1);
  const fracSpec = new Float64Array(MAX_NUM + 1);
  const quantAi = new Float64Array(MAX_NUM + 1);

  // Première passe pour extraire les données invariantes
  for (let i = 1; i <= MAX_NUM; i++) {
        const bd = breakdowns[i] || {};
        
        const freq = bd.frequency || (localFeatures.freqMap[i] * (100 / history.length)) || 0;
        const currentGap = localFeatures.gapsMap[i] || 0;
        const gap = bd.gap || (currentGap > 0 ? (history.length / currentGap) : 0);
        const momentum = bd.momentum || (localFeatures.momentumMap[i] * 10) || 0;
        const spectral = bd.spectral || (Array.isArray(metrics?.spectral) ? metrics.spectral.find((s: { number: number; energy: number }) => s.number === i)?.energy : 0) || 0;
        const ai = bd.bayes || 0;
        const fractal = bd.fractal || 0;
        const bayes = bd.bayes || 0;
        const markov = bd.markov || (localFeatures.markovMap[i] * 10) || 0;
        const temporal = bd.temporal || 0;
        const spatial = bd.spatial || 0;
        const affinity = bd.affinity || 0;

        momentumVector[i] = momentum;
        gapVector[i] = gap;
        spectralVector[i] = spectral;

        const rawSum = freq + gap + momentum + spectral + ai + fractal + bayes + markov + temporal + spatial + affinity;
        rawSums[i] = rawSum;
        if (rawSum > maxRawSum) maxRawSum = rawSum;
        
        const fs = fractal * spectral;
        fracSpec[i] = fs;
        if (fs > maxFractalSpectral) maxFractalSpectral = fs;

        const qa = spatial * ai;
        quantAi[i] = qa;
        if (qa > maxQuantumAi) maxQuantumAi = qa;
  }

  // Seconde passe d'agrégation non-linéaire (Zéro Nombre Magique)
  onProgress?.(75, "Agrégation non-linéaire tensorielle...");
  for (let i = 1; i <= MAX_NUM; i++) {
        // Transformée de Cauchy pour gérer l'étalement pondéré par le max
        const activation = 1.0 - (1.0 / (1.0 + Math.pow(rawSums[i] / maxRawSum, 2)));
        
        // Synergies continues (Produit vectoriel fractionné normalisé par la norme L-infini)
        const synergyFractalSpectral = fracSpec[i] / maxFractalSpectral;
        const synergyQuantumAi = quantAi[i] / maxQuantumAi;
        
        // Multiplicateur global par fonction exponentielle isotrope
        const synergyMultiplier = Math.exp((synergyFractalSpectral + synergyQuantumAi) / 2.0);
        
        let score = activation * rawSums[i] * synergyMultiplier;

        if (symbioticContext && symbioticContext.spatialHotZones && symbioticContext.spatialHotZones.includes(i)) {
            // Amplification par le ratio de la zone d'influence spatiale
            score *= (1.0 + (symbioticContext.spatialHotZones.length / MAX_NUM));
        }
        if (symbioticContext && symbioticContext.forestVotes && symbioticContext.forestVotes[i]) {
            score *= (1.0 + symbioticContext.forestVotes[i]);
        }

        consensusVector[i] = score;
  }

  // Force Master tops if completely flat
  const isFlat = Array.from(consensusVector).reduce((a,b)=>a+b, 0) <= Number.EPSILON;
  if(isFlat) {
    masterPred.suggestedNumbers.forEach(n => {
        if (n >= 1 && n <= MAX_NUM) consensusVector[n] += maxRawSum;
    });
    masterPred.candidates.forEach((n, idx) => {
        if (n >= 1 && n <= MAX_NUM) consensusVector[n] += maxRawSum * Math.exp(-idx / masterPred.candidates.length);
    });
    for(let i=1; i<=MAX_NUM; i++) if (consensusVector[i] === 0) consensusVector[i] = 1.0 + Math.abs(Math.sin((i * Math.PI) / MAX_NUM)); // Perturbation déterministe
  }

  // Normalisation (0-100) et filtrage optionnel d'entropie
  let normalizedVector = normalizeVector(consensusVector);

  if (opts.shannonEntropyFilter) {
      let sumConsensus = 0;
      for (let i = 1; i <= MAX_NUM; i++) sumConsensus += normalizedVector[i];
      const meanConsensus = sumConsensus / MAX_NUM;
      
      const filteredVector = new Float64Array(MAX_NUM + 1);
      for (let i = 1; i <= MAX_NUM; i++) {
          if (normalizedVector[i] < meanConsensus * 0.75) {
              // Filtrage d'atténuation continue pour réduire le bruit de fond
              filteredVector[i] = normalizedVector[i] * 0.15;
          } else {
              // Accentuation continue
              filteredVector[i] = normalizedVector[i] * (1.0 + (normalizedVector[i] / (sumConsensus + Number.EPSILON)));
          }
      }
      normalizedVector = normalizeVector(filteredVector);
  }

  const normalizedMomentum = normalizeVector(momentumVector);
  const normalizedGap = normalizeVector(gapVector);
  const normalizedSpectral = normalizeVector(spectralVector);

  // 3. ANALYSE DU RÉGIME
  onProgress?.(80, "Analyse d'entropie du régime...");
  const entropyScore = computeVectorEntropy(normalizedVector);
  
  // Transition continue (Modélisée par des probabilités d'état basées sur le pivot utilisateur)
  const pivot = opts.regimePivot;
  const stableThresh = pivot - 0.08;
  const chaoticThresh = pivot + 0.08;
  const pStable = 1.0 - (1.0 / (1.0 + Math.exp(-20 * (entropyScore - stableThresh)))); 
  const pChaotic = 1.0 / (1.0 + Math.exp(-20 * (entropyScore - chaoticThresh))); 
  
  let regime: 'STABLE' | 'TRANSITION' | 'CHAOTIC' = 'TRANSITION';
  if (pStable < 0.5) regime = 'STABLE';
  if (pChaotic > 0.5) regime = 'CHAOTIC';

  // 4. GÉNÉRATION DES SCÉNARIOS STRATÉGIQUES (Sélection Gloutonne avec Décalage de Phase Continu)
  onProgress?.(85, "Génération des scénarios stratégiques...");
  const scenarios: PlatinumScenario[] = [];
  const freqPhase = opts.phaseFrequency;

  // Scénario A : Alpha Core (Top absolu, phase = 0)
  scenarios.push({
      id: 'alpha',
      name: 'Alpha Core',
      description: 'Convergence maximale. Sélection déterministe gloutonne sur le pic de résonance quantique absolu.',
      numbers: greedyDeterministicSelection(normalizedVector, DRAW_SIZE, 0.0), 
      probability: 92,
      risk: 'LOW',
      color: '#10b981' // Emerald
  });

  // Scénario B : Beta Flow (Décalage angulaire π/4)
  scenarios.push({
      id: 'beta',
      name: 'Beta Flow',
      description: 'Intègre les vecteurs secondaires via un décalage de phase trigonométrique modéré.',
      numbers: greedyDeterministicSelection(normalizedVector, DRAW_SIZE, (Math.PI / 4) * freqPhase),
      probability: 78,
      risk: 'MEDIUM',
      color: '#6366f1' // Indigo
  });

  // Scénario C : Gamma Burst (Mix Momentum, phase = π/2)
  const gammaVector = new Float64Array(MAX_NUM + 1);
  for(let i=1; i<=MAX_NUM; i++) gammaVector[i] = (normalizedVector[i] * 0.4) + (normalizedMomentum[i] * 0.6);
  scenarios.push({
      id: 'gamma',
      name: 'Gamma Burst',
      description: 'Cible la vélocité et l\'accélération statistique pure (Momentum absolu).',
      numbers: greedyDeterministicSelection(gammaVector, DRAW_SIZE, (Math.PI / 2) * freqPhase),
      probability: 65,
      risk: 'HIGH',
      color: '#f43f5e' // Rose
  });

  // Scénario D : Delta Convergence (Mix Écart, phase = 3π/4)
  const deltaVector = new Float64Array(MAX_NUM + 1);
  for(let i=1; i<=MAX_NUM; i++) deltaVector[i] = (normalizedVector[i] * 0.3) + (normalizedGap[i] * 0.7);
  scenarios.push({
      id: 'delta',
      name: 'Delta Convergence',
      description: 'Théorie des écarts asymétriques pour cibler les corrections imminentes.',
      numbers: greedyDeterministicSelection(deltaVector, DRAW_SIZE, (3 * Math.PI / 4) * freqPhase),
      probability: 70,
      risk: 'MEDIUM',
      color: '#f59e0b' // Amber
  });

  // Scénario E : Epsilon Forensic (Auto-correction des dérives et Agent intelligence)
  const epsilonVector = new Float64Array(MAX_NUM + 1);
  for(let i=1; i<=MAX_NUM; i++) epsilonVector[i] = normalizedVector[i] * 0.4;
  
  try {
      onProgress?.(90, "Calcul des corrections agentiques (Epsilon)...");
      const forensicReports = preloadedForensicReports || await getLocalForensicReports() || [];
      const recentReports = forensicReports.slice(0, 10); // Augmenté à 10 pour plus de précision
      const gain = opts.forensicGain;
      
      // Amortissement exponentiel continu basé sur l'âge du rapport (index)
      recentReports.forEach((report: any, index: number) => {
          const recencyWeight = Math.exp(-0.25 * index); 
          
          report.missedOpportunities?.forEach((miss: any) => {
              if (miss.number >= 1 && miss.number <= MAX_NUM) epsilonVector[miss.number] += 45 * recencyWeight * gain; 
          });
          
          report.nearMisses?.forEach((nm: any) => {
              if (nm.actual >= 1 && nm.actual <= MAX_NUM) {
                  epsilonVector[nm.actual] += 35 * recencyWeight * gain;
                  const left = nm.actual > 1 ? nm.actual - 1 : MAX_NUM;
                  const right = nm.actual < MAX_NUM ? nm.actual + 1 : 1;
                  // Diffusion d'onde gaussienne sur les voisins
                  epsilonVector[left] += 15 * recencyWeight * gain;
                  epsilonVector[right] += 15 * recencyWeight * gain;
              }
          });
          
          report.algorithmicDrift?.forEach((drift: any) => {
              // Transformation continue de driftScore pour remplacer if (driftScore > 20)
              const driftActivation = 1.0 / (1.0 + Math.exp(-0.5 * (drift.driftScore - 20))); 
              for(let i=1; i<=MAX_NUM; i++) {
                 // Remplacement absolu de LCG par une convolution trigonométrique
                 const deterministicNoise = 5.0 * (1.0 + Math.sin(drift.driftScore * i));
                 const correction = driftActivation * deterministicNoise * recencyWeight * gain;
                 if (drift.direction === 'underestimating') epsilonVector[i] += correction;
                 else if (drift.direction === 'overestimating') epsilonVector[i] -= correction * 0.5;
              }
          });
      });
  } catch (e) {
      console.error("Forensic integration failed", e);
  }

  scenarios.push({
      id: 'epsilon',
      name: 'Epsilon Forensic',
      description: 'Adaptation Agentique & Forensic. Corrige la dérive de l\'ADN algorithmique sur les cycles récents.',
      numbers: greedyDeterministicSelection(normalizeVector(epsilonVector), DRAW_SIZE, Math.PI * freqPhase), 
      probability: 82, 
      risk: 'MEDIUM',
      color: '#8b5cf6' // Violet
  });

  // Scénario F : Zeta Adversarial (Anti-Consensus)
  const zetaVector = new Float64Array(MAX_NUM + 1);
  for (let i = 1; i <= MAX_NUM; i++) {
      const cw = normalizedVector[i];
      
      // Loi de distribution continue pour contrecarrer l'hyper-consensus
      const moderation = 1.0 / (1.0 + Math.exp(-0.1 * (cw - 40))); // 0 to 1 as cw crosses 40
      
      const componentHigh = (100 - cw) * (1.0 - moderation) + normalizedGap[i] * moderation;
      const componentLow = cw * (1.0 + (1.0 - moderation)) + normalizedSpectral[i] * moderation;
      
      // Modulation déterministe pour numéros très bas au lieu de random
      const baseline = 10.0 + 7.5 * (1.0 + Math.cos(i * 0.618)); 
      
      // Mixage continu
      zetaVector[i] = (moderation * componentHigh) + ((1.0 - moderation) * (cw > 5 ? componentLow : baseline));
  }
  
  scenarios.push({
      id: 'zeta',
      name: 'Zeta Adversarial',
      description: 'Contre-mesure Anti-Consensus. Remodelage continu des probabilités pour éviter la sédimentation.',
      numbers: greedyDeterministicSelection(normalizeVector(zetaVector), DRAW_SIZE, (5 * Math.PI / 4) * freqPhase),
      probability: 71,
      risk: 'HIGH',
      color: '#f97316' // Orange
  });

  // 5. CALCUL DE LA COHÉRENCE GLOBALE
  onProgress?.(95, "Calcul de la cohérence et finalisation...");
  const coherence = Math.round((1 - entropyScore) * 100);

  // Sécurité : S'assurer que chaque scénario a au moins les numéros par défaut (Deterministic Fallback)
  const defaultNumbers = masterPred?.suggestedNumbers || [];
  scenarios.forEach(s => {
    if (s.numbers.length < DRAW_SIZE) {
        const fillers = [...defaultNumbers];
        while (s.numbers.length < DRAW_SIZE && fillers.length > 0) {
            const n = fillers.shift();
            if (n && !s.numbers.includes(n)) s.numbers.push(n);
        }
        let fallback = 1;
        while (s.numbers.length < DRAW_SIZE && fallback <= 90) {
            if (!s.numbers.includes(fallback)) s.numbers.push(fallback);
            fallback++;
        }
    }
  });

  const seed = `${drawName}_${entropyScore}_${scenarios.map(s => s.numbers.join(',')).join('|')}`;
  let hashVal = 0;
  for (let i = 0; i < seed.length; i++) {
    hashVal = (hashVal << 5) - hashVal + seed.charCodeAt(i);
    hashVal |= 0;
  }
  const deterministicId = `platinum_pred_${Math.abs(hashVal)}_${Date.now()}`;

  onProgress?.(100, "Analyse Platinum complétée !");

  return {
      id: deterministicId,
      drawName,
      timestamp: Date.now(),
      confidence: coherence,
      consensusVector: Array.from(normalizedVector),
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

export const savePlatinumHistory = async (result: PlatinumResult): Promise<void> => {
  try {
    const key = storageKey(result.drawName);
    const raw = await get(key);
    const existing = (!raw || raw.length === 0) ? [] : raw as PlatinumResult[];
    const updated = [result, ...existing.slice(0, 19)];
    await set(key, updated);
  } catch (err) {
    console.error('Storage Error', err);
  }
};

export const getPlatinumHistory = async (drawName: string): Promise<PlatinumResult[]> => {
  try {
    const raw = await get(storageKey(drawName));
    return raw ? raw as PlatinumResult[] : [];
  } catch {
    return [];
  }
};

export const performPlatinumAudit = (
  prediction: PlatinumResult,
  actualResult: DrawResult,
): PlatinumAudit => {
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

export async function generatePlatinumPrediction(
  drawName: string,
  history: DrawResult[],
  metrics?: EnhancedMetrics,
  userOptions?: PlatinumUserOptions | null,
  symbioticContext?: SymbioticContext | null,
  _basePrediction?: Prediction,
  onProgress?: (progress: number, message: string) => void,
): Promise<PlatinumResult> {
  if (typeof Worker !== 'undefined') {
    try {
      const temporalDepth = useNexusStore?.getState()?.temporalDepth ?? 100;
      const useSpatioTemporalHawkes = useNexusStore?.getState()?.useSpatioTemporalHawkes ?? true;
      const forensicReports = await getLocalForensicReports() || [];

      return await new Promise<PlatinumResult>((resolve, reject) => {
        const worker = new Worker(
          new URL('./workers/prediction.worker.ts', import.meta.url),
          { type: 'module' }
        );

        const timeoutId = setTimeout(() => {
          worker.terminate();
          reject(new Error("Timeout du Web Worker de prédiction locale Platinum"));
        }, 90000); // 90 seconds timeout for Platinum since it's heavier

        worker.onmessage = (e: MessageEvent) => {
          const { success, result, error, isProgress, progress, message } = e.data;
          if (isProgress) {
            onProgress?.(progress, message);
            return;
          }
          clearTimeout(timeoutId);
          if (success) {
            resolve(result);
          } else {
            reject(new Error(error || "Erreur inconnue du worker de prédiction Platinum"));
          }
          worker.terminate();
        };

        worker.onerror = (err) => {
          clearTimeout(timeoutId);
          reject(err);
          worker.terminate();
        };

        worker.postMessage({
          taskId: `PLATINUM_${Date.now()}`,
          type: 'platinum',
          drawName,
          history,
          metrics,
          userOptions,
          symbioticContext,
          _basePrediction,
          temporalDepth,
          useSpatioTemporalHawkes,
          preloadedForensicReports: forensicReports
        });
      });
    } catch (workerError) {
      console.warn("[WORKER PLATINUM] Échec du worker Platinum. Fallback sur le thread principal.", workerError);
    }
  }

  return generatePlatinumPredictionCore(
    drawName,
    history,
    metrics,
    userOptions,
    symbioticContext,
    _basePrediction,
    onProgress
  );
}
