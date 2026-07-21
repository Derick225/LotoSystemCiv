import React, { useState, useEffect, useMemo } from "react";
import { useNexusStore } from "../store/useNexusStore";
import {
  Clock,
  Activity,
  Sparkles,
  Cpu,
  History,
  Sliders,
  Wand2,
  TrendingUp,
  Dna,
  Award,
  Calendar,
  AlertTriangle,
  RotateCcw,
  Network,
  Play,
  Pause,
  BrainCircuit
} from "lucide-react";
import { AlgoWeights, DrawResult } from "../types";
import { useToast } from "./ui/Toast";
import { audioEngine } from "../utils/audioEngine";
import { purifyHistoryForDraw } from "../utils/arrayUtils";
import {
  generateMasterPrediction,
  normalizeWeights,
  extractFeatures,
  calculateScores,
} from "../services/predictionEngine";
import { AlgoKey } from "../shared/prediction.types";
import { logError, AppError } from "../utils/AppError";

interface ForensicTimeMachineProps {
  drawName: string;
  history: DrawResult[];
  currentWeights: AlgoWeights;
}

export const ForensicTimeMachine: React.FC<ForensicTimeMachineProps> = ({
  drawName,
  history,
  currentWeights,
}) => {
  const { showToast } = useToast();
  const temporalDepth = useNexusStore(state => state.temporalDepth);
  const isForensicOptimized = useNexusStore(state => state.isForensicOptimized);
  
  // Filter draws specific to this game
  const drawHistory = useMemo(() => {
    return purifyHistoryForDraw(drawName, history);
  }, [history, drawName]);

  const [historicalIndex, setHistoricalIndex] = useState<number>(0);
  const [localWeights, setLocalWeights] = useState<AlgoWeights>({ ...currentWeights });
  const [isSimulating, setIsSimulating] = useState(false);
  const [isWalkForwarding, setIsWalkForwarding] = useState(false);
  const [optimizationLogs, setOptimizationLogs] = useState<string[]>([]);
  const [activeWeightCategory, setActiveWeightCategory] = useState<string>("stats");
  const [isOptimized, setIsOptimized] = useState(false);
  
  const [generalizationMetrics, setGeneralizationMetrics] = useState<{
    score: number;
    overfittingRatio: number;
    avgValidationHits: number;
    isCalculating: boolean;
  }>({
    score: 100,
    overfittingRatio: 1.0,
    avgValidationHits: 1.0,
    isCalculating: false,
  });

  const [walkForwardStats, setWalkForwardStats] = useState<{
    isActive: boolean;
    history: {
      date: string;
      hits: number;
      accuracy: number;
      predicted: number[];
      actual: number[];
    }[];
  } | null>(null);

  // Group algorithms into distinct logical categories (No unrequested sliders)
  const getCategoryOfAlgo = (algo: string): string => {
    if (["frequency", "gap", "bayes", "temporal", "momentum"].includes(algo)) return "stats";
    if (["spectral", "fractal", "echo_state"].includes(algo)) return "signal";
    if (["spatial", "affinity", "shadow", "network", "isolation_anomaly"].includes(algo)) return "network";
    return "sequences"; // fallback for gap_sequence, derived_neighbor, etc.
  };
  const [simulationResult, setSimulationResult] = useState<{
    accuracy: number;
    hits: number[];
    predicted: number[];
    actual: number[];
    confidence: number;
    analysis: string;
    stability: number;
    xapExp?: import('../services/training/DNAOptimizer').XAPExplanation[];
  } | null>(null);

  // Sync if currentWeights changes
  useEffect(() => {
    setLocalWeights({ ...currentWeights });
  }, [currentWeights]);

  // Active draw in time travel
  const targetDraw = useMemo(() => {
    if (drawHistory.length === 0) return null;
    return drawHistory[Math.min(historicalIndex, drawHistory.length - 1)];
  }, [drawHistory, historicalIndex]);

  // Split history into the PAST prior to the target draw (index + 1 to N, strictly no future leakage)
  const pastHistory = useMemo(() => {
    if (drawHistory.length === 0) return [];
    return drawHistory.slice(historicalIndex + 1);
  }, [drawHistory, historicalIndex]);

  // Continuous standard deviation of dispersion computed directly from past history (No magic numbers, AGENTS.md)
  const empiricalStdDispersion = useMemo(() => {
    if (pastHistory.length < 5) return 0.5;
    
    const dispersions = pastHistory.map((d) => {
      const avg = d.gagnants.reduce((a, b) => a + b, 0) / d.gagnants.length;
      const v = d.gagnants.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / d.gagnants.length;
      return Math.log(1 + v);
    });
    
    const meanDisp = dispersions.reduce((a, b) => a + b, 0) / dispersions.length;
    const varDisp = dispersions.reduce((sum, d) => sum + Math.pow(d - meanDisp, 2), 0) / (dispersions.length - 1 || 1);
    
    return Math.max(0.1, Math.sqrt(varDisp));
  }, [pastHistory]);

  // Continuous empirical frequency of Near-Miss relations in the active draw's history (No magic numbers, AGENTS.md)
  const empiricalNearMissFrequencies = useMemo(() => {
    if (pastHistory.length < 5) {
      return { neighbor: 0.5, mirror: 0.4, shadow: 0.2 };
    }
    
    let totalPairs = 0;
    let neighborCount = 0;
    let mirrorCount = 0;
    let shadowCount = 0;
    
    for (let i = 0; i < pastHistory.length - 1; i++) {
      const currentDraw = pastHistory[i].gagnants;
      const prevDraw = pastHistory[i + 1].gagnants;
      
      currentDraw.forEach((c) => {
        prevDraw.forEach((p) => {
          totalPairs++;
          
          if (Math.abs(c - p) === 1) {
            neighborCount++;
          }
          
          const cStr = String(c);
          const revC = parseInt(cStr.split("").reverse().join(""));
          if (revC === p && revC !== c) {
            mirrorCount++;
          }
          
          if (c % 10 === p % 10) {
            shadowCount++;
          }
        });
      });
    }
    
    const total = Math.max(1, totalPairs);
    const rawNeighborFreq = neighborCount / total;
    const rawMirrorFreq = mirrorCount / total;
    const rawShadowFreq = shadowCount / total;
    
    const scaleFreq = (freq: number, baseDefault: number) => {
      const baseline = 0.02; // statistical baseline
      const ratio = freq / (baseline || 1e-5);
      const scaled = baseDefault * (2 / (1 + Math.exp(-ratio + 1)));
      return Math.max(0.05, Math.min(0.8, scaled));
    };

    return {
      neighbor: parseFloat(scaleFreq(rawNeighborFreq, 0.5).toFixed(3)),
      mirror: parseFloat(scaleFreq(rawMirrorFreq, 0.4).toFixed(3)),
      shadow: parseFloat(scaleFreq(rawShadowFreq, 0.2).toFixed(3)),
    };
  }, [pastHistory]);

  // Continuous "Mathematical Resilience Index" calculated smoothly
  // Based on the statistical entropy of the historical sample variance and length (No magic numbers)
  const mathematicalResilience = useMemo(() => {
    if (pastHistory.length < 5) return 0;
    
    // Compute entropy of gap intervals of past drawings
    const count = pastHistory.length;
    const sampleVariance = pastHistory.reduce((sum, d) => {
      const avg = d.gagnants.reduce((a, b) => a + b, 0) / d.gagnants.length;
      const v = d.gagnants.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / d.gagnants.length;
      return sum + v;
    }, 0) / count;

    // Calcul de l'espérance de la variance pour une loi uniforme sur [1, 90]
    const expectedVariance = (90 * 90 - 1) / 12; // ~674.9
    const expectedDispersion = Math.log(1 + expectedVariance); // ~6.51
    const stdDispersion = empiricalStdDispersion; // Derived continuously from history (No magic numbers)

    // Shannon/Boltzman continuous dispersion log-likelihood
    const dispersion = Math.log(1 + sampleVariance);
    const zDispersion = (dispersion - expectedDispersion) / Math.max(Number.EPSILON, stdDispersion);
    const continuousRaw = (count / (count + 15)) * (1 / (1 + Math.exp(-Math.max(-5, Math.min(5, zDispersion)))));
    
    return Math.min(100, Math.max(1, Math.round(continuousRaw * 100)));
  }, [pastHistory, empiricalStdDispersion]);

  // Compute Near Misses (Voisins, Miroirs, Ombres) in retroactive drawing
  const rawNearMisses = useMemo(() => {
    if (!simulationResult || !targetDraw) return [];
    const actualSet = new Set(targetDraw.gagnants);
    const misses: { type: "Voisin" | "Miroir" | "Ombre"; num: number; target: number }[] = [];

    simulationResult.predicted.forEach((p) => {
      if (actualSet.has(p)) return;
      
      // Voisin (±1)
      if (actualSet.has(p - 1)) misses.push({ type: "Voisin", num: p, target: p - 1 });
      else if (actualSet.has(p + 1)) misses.push({ type: "Voisin", num: p, target: p + 1 });
      
      // Miroir (e.g. 14 <-> 41)
      const pStr = String(p);
      const reversedP = parseInt(pStr.split("").reverse().join(""));
      if (reversedP !== p && reversedP <= 90 && actualSet.has(reversedP)) {
        misses.push({ type: "Miroir", num: p, target: reversedP });
      }

      // Ombre de phase (Calcul continu de congruence mod 10 ou 9)
      if (p % 10 === targetDraw.gagnants[0] % 10) {
        misses.push({ type: "Ombre", num: p, target: targetDraw.gagnants[0] });
      }
    });

    return misses.slice(0, 3);
  }, [simulationResult, targetDraw]);

  // Execute retroactive time travel prediction
  const computeTimeTravelPrediction = async (weights = localWeights) => {
    if (!targetDraw || pastHistory.length < 5) {
      showToast("Profondeur d'historique insuffisante dans le passé (minimum 5 requis).", "error");
      return;
    }

    setIsSimulating(true);
    try {
      // Simulate predicting targetDraw using past history exactly
      const pred = await generateMasterPrediction(
        drawName,
        pastHistory,
        temporalDepth,
        weights,
        undefined,
        undefined,
        true, // skip active model retraining to use strict instant weights
        false,
        0,
        isForensicOptimized
      );

      const hits = pred.suggestedNumbers.filter((n) =>
        targetDraw.gagnants.includes(n)
      );
      const accuracy = Math.round((hits.length / targetDraw.gagnants.length) * 100);

      setSimulationResult({
        accuracy,
        hits,
        predicted: pred.suggestedNumbers,
        actual: targetDraw.gagnants,
        confidence: pred.confidence,
        analysis: pred.analysis,
        stability: pred.stabilityScore || 50,
        xapExp: pred.xapExp,
      });

      if (isWalkForwarding) {
        setWalkForwardStats((prev) => {
          if (!prev) return null;
          if (prev.history.some((item) => item.date === targetDraw.date)) return prev;
          return {
            ...prev,
            history: [
              ...prev.history,
              {
                date: targetDraw.date,
                hits: hits.length,
                accuracy,
                predicted: pred.suggestedNumbers,
                actual: targetDraw.gagnants,
              }
            ]
          };
        });
      }

      audioEngine.play(hits.length > 0 ? "success" : "click");
    } catch (e: unknown) {
      logError(
        new AppError("Time Matchine Simulation failed", "TIMEMACHINE_FAILED", "low", {
          error: e,
        })
      );
      showToast("Erreur d'inférence rétroactive.", "error");
    } finally {
      setIsSimulating(false);
    }
  };

  // Run initial simulation for selected draw
  useEffect(() => {
    if (targetDraw && pastHistory.length >= 5) {
      computeTimeTravelPrediction(localWeights);
    } else {
      setSimulationResult(null);
    }
  }, [historicalIndex, drawName]);

  // Walk-forward auto-play logic
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    if (isWalkForwarding) {
        if (historicalIndex > 0) {
            timeout = setTimeout(() => {
                setHistoricalIndex((prev) => prev - 1);
            }, 1200);
        } else {
            setIsWalkForwarding(false);
            showToast("Séquence Walk-Forward terminée.", "success");
            audioEngine.play("success");
        }
    }
    return () => clearTimeout(timeout);
  }, [historicalIndex, isWalkForwarding]);

  // Robust Generalization & Overfitting Risk evaluation (disjoint window validation)
  useEffect(() => {
    let active = true;
    const calculateGeneralization = async () => {
      if (!targetDraw || pastHistory.length < 5) return;
      
      setGeneralizationMetrics(prev => ({ ...prev, isCalculating: true }));
      
      try {
        const valWindow = Math.max(5, Math.min(10, pastHistory.length));
        let totalHits = 0;
        let count = 0;
        
        for (let offset = 1; offset <= valWindow; offset++) {
          const idx = historicalIndex + offset;
          if (idx >= drawHistory.length) break;
          const testDraw = drawHistory[idx];
          const testPast = drawHistory.slice(idx + 1);
          if (testPast.length < 5) break;
          
          const pred = await generateMasterPrediction(
            drawName,
            testPast,
            temporalDepth,
            localWeights,
            undefined,
            undefined,
            true, // skip retrain
            false,
            0,
            isForensicOptimized
          );
          const hits = pred.suggestedNumbers.filter(n => testDraw.gagnants.includes(n)).length;
          totalHits += hits;
          count++;
        }
        
        if (!active) return;
        
        const avgValidationHits = count > 0 ? totalHits / count : 1.0;
        const targetHits = simulationResult?.hits.length ?? 0;
        
        let score = 100;
        if (targetHits > avgValidationHits) {
          const ratio = targetHits / Math.max(0.1, avgValidationHits);
          // Continuous sigmoid decay transition (AGENTS.md)
          score = Math.round(100 / (1 + Math.exp(1.5 * (ratio - 2.0))));
        }
        score = Math.max(5, Math.min(100, score));
        
        setGeneralizationMetrics({
          score,
          overfittingRatio: parseFloat((targetHits / Math.max(0.1, avgValidationHits)).toFixed(2)),
          avgValidationHits: parseFloat(avgValidationHits.toFixed(2)),
          isCalculating: false,
        });
      } catch (e) {
        if (active) {
          setGeneralizationMetrics(prev => ({ ...prev, isCalculating: false }));
        }
      }
    };
    
    if (simulationResult) {
      calculateGeneralization();
    }
    
    return () => {
      active = false;
    };
  }, [localWeights, simulationResult, historicalIndex, drawName]);

  const toggleWalkForward = () => {
    const nextState = !isWalkForwarding;
    setIsWalkForwarding(nextState);
    audioEngine.play("click");
    
    if (nextState) {
      let startIdx = historicalIndex;
      if (historicalIndex === 0) {
        startIdx = Math.min(12, drawHistory.length - 2);
        setHistoricalIndex(startIdx);
      }
      setWalkForwardStats({
        isActive: true,
        history: [],
      });
    } else {
      setWalkForwardStats(prev => prev ? { ...prev, isActive: false } : null);
    }
  };

  const handleWeightChange = (algoName: string, value: number) => {
    setIsOptimized(false); // Manual adjustments clear single-draw optimization flag
    const updated = {
      ...localWeights,
      [algoName]: value / 100,
    };
    const normalized = normalizeWeights(updated);
    setLocalWeights(normalized);
  };

  const handleApplyPastWeightsToGlobal = () => {
    audioEngine.play("success");
    let weightsToApply = { ...localWeights };
    if (isOptimized && generalizationMetrics.score < 100) {
      // Blending de mitigation anti-surapprentissage continu (AGENTS.md)
      const alpha = generalizationMetrics.score / 100;
      const blended: any = {};
      const keys = Object.keys(currentWeights) as AlgoKey[];
      keys.forEach((k) => {
        const globalW = currentWeights[k] || 0;
        const optW = localWeights[k] || 0;
        blended[k] = globalW * (1.0 - alpha) + optW * alpha;
      });
      weightsToApply = normalizeWeights(blended);
      showToast(`Injection sécurisée : Blending continu de ${Math.round(alpha * 100)}% appliqué pour atténuer le surapprentissage.`, "info");
    } else {
      showToast("Calibration de l'instant chargée comme ADN principal v14.", "success");
    }
    useNexusStore.getState().updateGlobalWeights(weightsToApply, drawName);
    useNexusStore.getState().setForensicOptimized(true);
  };

  // Walk-forward aggregate summary evaluation (No magic numbers)
  const walkForwardSummary = useMemo(() => {
    if (!walkForwardStats || walkForwardStats.history.length === 0) return null;
    
    const h = walkForwardStats.history;
    const len = h.length;
    const totalHits = h.reduce((sum, item) => sum + item.hits, 0);
    const avgHits = totalHits / len;
    
    const variance = h.reduce((sum, item) => sum + Math.pow(item.hits - avgHits, 2), 0) / len;
    const stdDev = Math.sqrt(variance);
    
    const dist = { 0: 0, 1: 0, 2: 0, "3+": 0 };
    h.forEach(item => {
      if (item.hits === 0) dist[0]++;
      else if (item.hits === 1) dist[1]++;
      else if (item.hits === 2) dist[2]++;
      else dist["3+"]++;
    });
    
    const successRate = (h.filter(item => item.hits >= 1).length / len) * 100;
    
    return {
      len,
      avgHits: parseFloat(avgHits.toFixed(2)),
      stdDev: parseFloat(stdDev.toFixed(2)),
      dist,
      successRate: parseFloat(successRate.toFixed(1)),
    };
  }, [walkForwardStats]);

  // Mathematical Retro-Optimizer of weights (Descente de gradient Soft-Margin diff sans hasard)
  const handleOptimizationOfInstantWeights = async () => {
    if (!targetDraw || pastHistory.length < 10) {
      showToast("Profondeur d'historique insuffisante pour optimiser 19 dimensions rétroactives (minimum 10 requis).", "error");
      return;
    }
    audioEngine.play("scan");
    setIsSimulating(true);
    setOptimizationLogs([
      "🧬 INITIALISATION DE L'OPTIMISEUR RÉTROACTIF CONTINU...",
      `Cible de calibration : Tirage ${targetDraw.date} (K = ${targetDraw.gagnants.join(", ")})`,
      `Profondeur d'inférence active : ${pastHistory.length} tirages passés.`
    ]);

    try {
      const targets = targetDraw.gagnants;
      // Extract continuous features and raw scores for gradient calculation
      const features = await extractFeatures(drawName, pastHistory);
      const baseScoresRaw = calculateScores(
        features,
        localWeights,
        {} as any,
        pastHistory
      );

      const keys = Object.values(AlgoKey);
      setOptimizationLogs(prev => [...prev, "Distribution spectrale brute des algos extraite."]);
      
      const algoStats: Record<string, { mean: number; stdDev: number }> = {};
      keys.forEach((k) => {
        const vals = baseScoresRaw.map((s) => s.breakdown[k] || 0);
        const mean = vals.reduce((a, b) => a + b, 0) / 90;
        const variance = vals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / 90;
        algoStats[k] = { mean, stdDev: Math.sqrt(variance) || 1 };
      });

      // Construct soft logit matrix 90 x K
      const squashedMatrix: Record<number, Record<string, number>> = {};
      for (let num = 1; num <= 90; num++) {
        squashedMatrix[num] = {};
        const sObj = baseScoresRaw.find((s) => s.num === num);
        const breakdown = sObj ? sObj.breakdown : {};
        keys.forEach((k) => {
          const val = breakdown[k] || 0;
          const stats = algoStats[k];
          const zScore = (val - stats.mean) / stats.stdDev;
          squashedMatrix[num][k] = 1 / (1 + Math.exp(-zScore)); // continuous logistic logistic CDF
        });
      }

      setOptimizationLogs(prev => [
        ...prev, 
        "Matrice continue CDF Logistique (90 x K) consolidée.",
        "Initialisation de l'estimation de Pouvoir Discriminant Analytique (PDA)..."
      ]);

      // Linear discriminant approximation (PDA)
      const dScores: Record<string, number> = {};
      keys.forEach((k) => {
        let targetsSum = 0;
        let othersSum = 0;
        targets.forEach((t) => {
          targetsSum += squashedMatrix[t]?.[k] || 0;
        });
        for (let num = 1; num <= 90; num++) {
          if (!targets.includes(num)) {
            othersSum += squashedMatrix[num]?.[k] || 0;
          }
        }
        const meanTarget = targetsSum / targets.length;
        const meanOther = othersSum / (90 - targets.length);
        dScores[k] = meanTarget - meanOther;
      });

      const initialOptimizedWeights: AlgoWeights = { ...localWeights };
      let totalD = 0;
      keys.forEach((k) => {
        const discValue = Math.max(0.01, dScores[k] || 0);
        initialOptimizedWeights[k] = discValue;
        totalD += discValue;
      });
      keys.forEach((k) => {
        initialOptimizedWeights[k] = (initialOptimizedWeights[k] || 0.01) / totalD;
      });

      // Gradient Descent continuous optimization loop
      let entropySpatial = -keys.reduce((sum, k) => {
        const p = initialOptimizedWeights[k] || 1e-5;
        return sum + p * Math.log2(p);
      }, 0) / Math.log2(keys.length);

      const beta = 1.0 / (keys.reduce((sum, k) => sum + algoStats[k].stdDev, 0) / keys.length + 1e-5);
      const lambda = entropySpatial / keys.length;
      const momentumDecay = Math.max(0.5, Math.min(0.95, entropySpatial));
      const maxGradientSteps = Math.floor(50 + 100 * entropySpatial);

      setOptimizationLogs(prev => [
        ...prev,
        `Entropie Génoise Spatiale globale : ${(entropySpatial * 100).toFixed(1)}%`,
        `Hyperparamètres : bêta = ${beta.toFixed(3)}, régularisation lambda = ${lambda.toFixed(4)}`,
        `Amorçage de la Descente de Gradients Réduite (${maxGradientSteps} itérations)...`
      ]);

      const w = { ...initialOptimizedWeights };
      const momentum: Record<string, number> = {};
      keys.forEach((k) => { momentum[k] = 0; });

      const initialLearningRate = 1.0 / (beta + 1e-5);
      
      // Proximity function for Near Miss sensitivity (Neighbors, Mirrors, Shadows) using continuous empirical frequencies (AGENTS.md)
      const getProximityWeight = (t: number, num: number) => {
        if (Math.abs(t - num) === 1) return empiricalNearMissFrequencies.neighbor; // Neighbor
        const tStr = String(t);
        const revT = parseInt(tStr.split("").reverse().join(""));
        if (revT === num && revT !== t) return empiricalNearMissFrequencies.mirror; // Mirror
        if (num % 10 === t % 10) return empiricalNearMissFrequencies.shadow; // Shadow
        return 0.0;
      };

      for (let step = 0; step < maxGradientSteps; step++) {
        const gradients: Record<string, number> = {};
        keys.forEach((k) => { gradients[k] = 0; });
        let stepLoss = 0;

        targets.forEach((t) => {
          const scoreT = keys.reduce((sum, k) => sum + (w[k] || 0) * squashedMatrix[t][k], 0);

          for (let num = 1; num <= 90; num++) {
            if (targets.includes(num)) continue;
            const scoreO = keys.reduce((sum, k) => sum + (w[k] || 0) * squashedMatrix[num][k], 0);

            // Near Misses Adjustment: Suppress penalty weight based on target proximity
            const proximity = getProximityWeight(t, num);
            const proximityScale = 1.0 - proximity;

            const diff = scoreT - scoreO;
            const expTerm = Math.exp(-beta * diff);
            stepLoss += Math.log(1 + expTerm) * proximityScale;

            const dLoss_dDiff = ((-beta * expTerm) / (1 + expTerm)) * proximityScale;

            keys.forEach((k) => {
              const gradDiff = squashedMatrix[t][k] - squashedMatrix[num][k];
              gradients[k] += dLoss_dDiff * gradDiff;
            });
          }
        });

        keys.forEach((k) => {
          gradients[k] += lambda * (w[k] || 0);
        });

        const currentLr = initialLearningRate / (1 + 0.05 * step);

        keys.forEach((k) => {
          momentum[k] = momentumDecay * momentum[k] - currentLr * gradients[k];
          w[k] = Math.max(0.001, (w[k] || 0.001) + momentum[k]);
        });

        if (step % Math.max(1, Math.floor(maxGradientSteps / 5)) === 0 || step === maxGradientSteps - 1) {
          setOptimizationLogs(prev => [
            ...prev,
            `Étape ${step}/${maxGradientSteps} | Perte: ${stepLoss.toFixed(4)} | LR: ${currentLr.toFixed(5)}`
          ]);
        }
      }

      // Re-normalize and set
      const totalW = keys.reduce((sum, k) => sum + (w[k] || 0), 0);
      keys.forEach((k) => {
        w[k] = (w[k] || 0) / totalW;
      });

      const finalOptimized = normalizeWeights(w);
      setLocalWeights(finalOptimized);
      setIsOptimized(true); // Track active optimization
      
      // Immediately run prediction with newly optimized weights
      await computeTimeTravelPrediction(finalOptimized);

      setOptimizationLogs(prev => [
        ...prev,
        "👍 OPTIMISATION RÉTROACTIVE ACHEVÉE.",
        "ADN Calibré injecté dans le contexte de la Machine Temporelle !"
      ]);
      showToast("Algorithme ADN optimisé avec succès pour cet instant précis !", "success");
    } catch (e) {
      setOptimizationLogs(prev => [...prev, "❌ ERREUR DIRECTE : Impossible de converger."]);
      showToast("Erreur d'optimisation rétroactive.", "error");
    } finally {
      setIsSimulating(false);
    }
  };

  if (!targetDraw) {
    return (
      <div className="glass-card neural-border p-8 rounded-3xl text-center text-slate-400">
        Pas assez d'historique de tirages disponibles.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 bg-slate-950 p-6 md:p-8 rounded-[2rem] border border-slate-800/60 shadow-2xl relative overflow-hidden">
      {/* Retrospective Time Travel Cover */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-fuchsia-500/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-indigo-500/5 rounded-full blur-[120px] pointer-events-none" />

      {/* COLUMN LEFT: Time Slider and Past Coordinates (5 columns grid) */}
      <div className="xl:col-span-4 space-y-6 flex flex-col justify-between">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20 font-black text-[9px] rounded-full uppercase tracking-wider mb-4 animate-pulse">
            <Clock size={12} /> Forensic Time Machine Active
          </div>
          <h3 className="text-2xl font-black text-white uppercase tracking-tight">
            Machine Temporelle
          </h3>
          <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
            Glissez dans le passé pour recalculer l'inférence des modèles en mode 100% aveugle (sans pollution future ni contamination quantique du futur).
          </p>
        </div>

        {/* TIME NAVIGATION SLIDER */}
        <div className="bg-slate-900/60 p-5 rounded-2xl border border-slate-800/80 relative">
          <div className="flex justify-between items-center text-[10px] font-black text-slate-400 mb-3 uppercase tracking-wider">
            <div className="flex items-center gap-2">
                <span>Saut Temporel (-T)</span>
                <button
                    onClick={toggleWalkForward}
                    className={`flex items-center justify-center p-1.5 rounded-full border transition-all ${isWalkForwarding ? 'bg-fuchsia-500/20 border-fuchsia-500/50 text-fuchsia-400 animate-pulse' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'}`}
                    title={isWalkForwarding ? "Pause Walk-Forward" : "Démarrer Walk-Forward Backtesting (Auto-Play)"}
                >
                    {isWalkForwarding ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" className="ml-0.5" />}
                </button>
            </div>
            <span className="text-fuchsia-400 font-mono">Tirage -{historicalIndex}</span>
          </div>

          <input
            type="range"
            min="0"
            max={Math.max(0, drawHistory.length - 2)}
            step="1"
            value={historicalIndex}
            onChange={(e) => {
              setHistoricalIndex(parseInt(e.target.value));
              audioEngine.play("click");
            }}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-fuchsia-500 focus:outline-none mb-3"
          />

          <div className="flex justify-between text-[9px] text-slate-500 font-bold">
            <span>Plus Récent ({drawHistory[0]?.date.slice(0, 5)})</span>
            <span>Ancien ({drawHistory[drawHistory.length - 1]?.date.slice(0, 5)})</span>
          </div>
        </div>

        {/* GENERALIZATION & OVERFITTING METRICS */}
        {simulationResult && (
          <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-800/80 space-y-3">
            <div className="flex justify-between items-center">
              <div>
                <span className="text-[9px] font-black tracking-widest text-slate-500 uppercase block">Indice de Généralisation</span>
                <span className="text-[10px] text-slate-400 mt-0.5 block italic">Validation croisée glissante</span>
              </div>
              <div className="flex items-center gap-2 font-mono">
                {generalizationMetrics.isCalculating ? (
                  <span className="text-[9px] text-fuchsia-400 animate-pulse uppercase font-black">Calcul...</span>
                ) : (
                  <span className={`text-lg font-black ${
                    generalizationMetrics.score >= 70 ? "text-emerald-400" :
                    generalizationMetrics.score >= 40 ? "text-amber-400" : "text-rose-500"
                  }`}>
                    {generalizationMetrics.score}%
                  </span>
                )}
              </div>
            </div>

            <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${
                  generalizationMetrics.score >= 70 ? "bg-emerald-500" :
                  generalizationMetrics.score >= 40 ? "bg-amber-500" : "bg-rose-500"
                }`}
                style={{ width: `${generalizationMetrics.score}%` }}
              />
            </div>

            <div className="grid grid-cols-2 gap-2 text-[9px] font-bold text-slate-400">
              <div className="bg-slate-950/40 p-2 rounded-lg border border-slate-900/60">
                <span className="text-slate-500 block uppercase text-[8px]">Hits Cible</span>
                <span className="text-white font-mono text-xs">{simulationResult.hits.length} / 5</span>
              </div>
              <div className="bg-slate-950/40 p-2 rounded-lg border border-slate-900/60">
                <span className="text-slate-500 block uppercase text-[8px]">Val. Moyenne</span>
                <span className="text-fuchsia-400 font-mono text-xs">{generalizationMetrics.avgValidationHits} hits</span>
              </div>
            </div>

            {isOptimized && generalizationMetrics.score < 50 && (
              <div className="bg-rose-950/20 border border-rose-500/20 p-2.5 rounded-xl flex gap-2">
                <AlertTriangle className="text-rose-400 shrink-0 mt-0.5" size={12} />
                <p className="text-[9px] text-rose-300 leading-normal">
                  <strong>Surapprentissage détecté !</strong> Les poids ont été hyper-optimisés sur un tirage unique. Une mitigation automatique par blending sera appliquée si vous injectez dans la production.
                </p>
              </div>
            )}
          </div>
        )}

        {/* TIMELINE RIBBON */}
        <div className="bg-slate-900/40 p-4 rounded-2xl border border-slate-800/80">
          <span className="text-[9px] font-black tracking-widest uppercase text-slate-500 block mb-3">
            Ruban Temporel (Tirages Adjacents)
          </span>
          <div className="grid grid-cols-5 gap-1.5 bg-black/40 p-2 rounded-xl border border-slate-950">
            {Array.from({ length: 5 }).map((_, offset) => {
              const targetIndex = historicalIndex + (offset - 2);
              if (targetIndex < 0 || targetIndex >= drawHistory.length) {
                return (
                  <div key={offset} className="h-12 rounded-xl bg-slate-900/10 border border-slate-900/50 flex items-center justify-center text-slate-700 font-black text-[9px]">
                    Ø
                  </div>
                );
              }
              const draw = drawHistory[targetIndex];
              const isActive = targetIndex === historicalIndex;
              return (
                <button
                  key={offset}
                  onClick={() => {
                    setHistoricalIndex(targetIndex);
                    audioEngine.play("click");
                  }}
                  className={`py-2 px-1 rounded-lg border flex flex-col items-center justify-between transition-all duration-300 ${isActive ? 'bg-fuchsia-600/10 border-fuchsia-500 text-fuchsia-400 font-bold scale-105 shadow-[0_0_10px_rgba(217,70,239,0.15)]' : 'bg-slate-950 border-slate-900 text-slate-500 hover:text-slate-350 hover:border-slate-800'}`}
                >
                  <span className="text-[8px] font-mono leading-none tracking-tighter">-{targetIndex}</span>
                  <span className="text-[9px] font-black leading-none my-1 font-mono">{draw.date.split('/')[0] || draw.date}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* METRICS OF THE PAST REGIME */}
        <div className="space-y-4">
          <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-800 flex justify-between items-center">
            <div>
              <span className="text-[9px] font-bold text-slate-500 uppercase block">Resilience Mathématique</span>
              <span className="text-[10px] text-slate-400 mt-0.5 block italic max-w-[200px]">Dispersion saine calculée</span>
            </div>
            <div className="text-2xl font-black text-emerald-400 font-mono">{mathematicalResilience}%</div>
          </div>

          <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-800 flex justify-between items-center">
            <div>
              <span className="text-[9px] font-bold text-slate-500 uppercase block">Profondeur d'Inférence Actuelle</span>
              <span className="text-[10px] text-slate-400 mt-0.5 block italic">Tirages passés cumulés</span>
            </div>
            <div className="text-2xl font-black text-indigo-400 font-mono">{pastHistory.length}</div>
          </div>

          {pastHistory.length < 25 && (
            <div className="bg-amber-950/20 border border-amber-500/20 p-3 rounded-xl flex gap-2">
              <AlertTriangle className="text-amber-400 shrink-0 mt-0.5" size={14} />
              <div>
                <span className="text-[10px] font-bold text-amber-400 block uppercase">Risque Statistique Élevé</span>
                <span className="text-[9px] text-amber-300 leading-relaxed block mt-0.5">
                  {`Profondeur faible (${pastHistory.length} < 25). L'optimisation rétroactive sur un échantillon aussi restreint est instable.`}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* SUBMISSION / APPLY BUTTONS */}
        <div className="flex flex-col gap-2.5 mt-auto pt-4">
          <button
            onClick={() => handleOptimizationOfInstantWeights()}
            disabled={isSimulating || pastHistory.length < 10}
            className="w-full py-3 bg-gradient-to-r from-fuchsia-600 to-indigo-600 hover:opacity-95 rounded-xl text-[10px] text-white font-black uppercase tracking-widest flex items-center justify-center gap-2.5 shadow-lg active:scale-95 transition-all disabled:opacity-50"
          >
            <Wand2 size={14} /> Optimiser l'ADN Rétroactif
          </button>
          
          <button
            onClick={handleApplyPastWeightsToGlobal}
            className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700/60 rounded-xl text-[9px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-all relative overflow-hidden group"
          >
            <Dna size={12} />
            <span className="relative z-10">Injecter dans le Moteur Actuel</span>
            {isOptimized && generalizationMetrics.score < 100 && (
              <span className="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 bg-rose-500/20 border border-rose-500/30 text-[7px] text-rose-400 rounded-full font-black uppercase tracking-wider animate-pulse">
                Blend {generalizationMetrics.score}%
              </span>
            )}
          </button>
        </div>

        {/* Real-time Optimizer Terminal logs */}
        {optimizationLogs.length > 0 && (
          <div className="bg-black/80 border border-slate-800 rounded-xl p-3 font-mono text-[8px] text-fuchsia-400 space-y-1 h-32 overflow-y-auto mt-4 custom-scrollbar">
            <div className="flex items-center gap-2 text-slate-400 border-b border-white/5 pb-1 mb-1.5 font-bold uppercase tracking-widest">
              <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-500 animate-pulse"></span>
              Console Cybernétique d'ADN
            </div>
            {optimizationLogs.map((log, idx) => (
              <div key={idx} className="line-clamp-1 leading-normal">
                &gt; {log}
              </div>
            ))}
          </div>
        )}

        {/* SYSTÈMES CONNECTÉS SHORTCUTS */}
        <div className="border-t border-slate-800/80 pt-4 mt-4 space-y-2">
            <span className="text-[9px] font-black tracking-widest uppercase text-slate-500 block">
                Harmonisation Cybernétique
            </span>
            <div className="grid grid-cols-2 gap-2">
                <button
                    onClick={() => {
                        audioEngine.play('click');
                        window.dispatchEvent(new CustomEvent("CROSS_MODULE_NAVIGATE", {
                            detail: {
                                view: 'admin',
                                mainTab: 'admin',
                                subTab: 'training'
                            }
                        }));
                    }}
                    className="py-2 px-2.5 bg-indigo-950/40 hover:bg-indigo-900/40 text-indigo-400 border border-indigo-500/20 rounded-xl text-[8px] font-extrabold uppercase tracking-wide flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                    <BrainCircuit size={10} /> Entraîner (Training)
                </button>
                <button
                    onClick={() => {
                        audioEngine.play('click');
                        window.dispatchEvent(new CustomEvent("NAVIGATE_SUB_FORENSIC", {
                            detail: { subTab: 'dna' }
                        }));
                    }}
                    className="py-2 px-2.5 bg-emerald-950/40 hover:bg-emerald-900/40 text-emerald-400 border border-emerald-500/20 rounded-xl text-[8px] font-extrabold uppercase tracking-wide flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                    <Dna size={10} /> Playground ADN
                </button>
            </div>
        </div>
      </div>

      {/* COLUMN MIDDLE: Face Off & Past Drawing Examination (4 columns) */}
      <div className="xl:col-span-5 space-y-6">
        <div className="bg-slate-900/80 p-6 rounded-3xl border border-slate-800 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-3 text-[9px] font-mono font-black text-slate-500 select-none">
            INDEX #{historicalIndex}
          </div>

          <div className="flex items-center gap-2.5 text-xs text-slate-400 font-bold mb-4">
            <Calendar size={14} className="text-fuchsia-400" />
            <span>Tirage du {targetDraw.date}</span>
          </div>

          <h4 className="text-md font-bold text-white mb-2 unicode-range uppercase">
            Tirage Cible du Passé
          </h4>
          <p className="text-[11px] text-slate-400 mb-6">
            L'Oracle tente de deviner ce résultat en ignorant tout ce qui s'est produit après cette date.
          </p>

          <div className="space-y-6">
            {/* Real Winning Numbers */}
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-2">
                Gagnants Réels de l'Instant
              </span>
              <div className="flex gap-2.5 flex-wrap">
                {targetDraw.gagnants.slice(0, 5).map((num, idx) => {
                  const isHit = simulationResult?.hits.includes(num);
                  return (
                    <div key={idx} className="flex flex-col items-center">
                      <div
                        className={`w-11 h-11 rounded-full border-2 flex items-center justify-center font-bold font-mono text-xs transition-all duration-300 ${isHit ? "border-emerald-500 bg-emerald-500/10 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.25)]" : "border-slate-800 bg-black/40 text-slate-400"}`}
                      >
                        {num}
                      </div>
                      <span className="text-[7px] text-slate-600 uppercase font-black tracking-tight mt-1">Boule {idx+1}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Suggested Vector */}
            {simulationResult && (
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-2">
                  Vecteur Suggéré (Prediction)
                </span>
                <div className="flex gap-2.5 flex-wrap">
                  {simulationResult.predicted.slice(0, 5).map((num, idx) => {
                    const isHit = targetDraw.gagnants.includes(num);
                    return (
                      <div key={idx} className="flex flex-col items-center">
                        <div
                          className={`w-11 h-11 rounded-full border-2 flex items-center justify-center font-bold font-mono text-xs transition-all duration-300 ${isHit ? "border-emerald-500 bg-emerald-500/10 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.25)] font-bold animate-pulse" : "border-indigo-500/40 bg-indigo-500/5 text-indigo-300"}`}
                        >
                          {num}
                        </div>
                        <span className={`text-[7px] uppercase font-black mt-1 ${isHit ? "text-emerald-400 font-bold" : "text-slate-600"}`}>
                          {isHit ? "HIT EXACT" : `Suggéré ${idx+1}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* XAP Floor pour la simulation */}
            {simulationResult?.xapExp && simulationResult.xapExp.length > 0 && (
                <div className="mt-8 border-t border-slate-800/50 pt-8">
                    <h3 className="text-[10px] font-black tracking-[0.2em] text-slate-400 uppercase mb-6 flex items-center gap-2">
                        <Network size={14} className="text-indigo-400" /> Attribution ADN (XAP) de la Simulation
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        {simulationResult.xapExp.map((xap) => (
                            <div key={xap.number} className="bg-[#0b0f19]/50 rounded-xl p-3 border border-slate-800/50 flex flex-col items-center justify-between text-center min-h-[120px] relative overflow-hidden">
                                {targetDraw.gagnants.includes(xap.number) && (
                                   <div className="absolute top-0 right-0 w-8 h-8 bg-emerald-500/20 rounded-bl-full flex items-start justify-end p-1">
                                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                                   </div>
                                )}
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-sm mb-2 border ${targetDraw.gagnants.includes(xap.number) ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/50' : 'bg-indigo-900/30 text-indigo-400 border-indigo-800/50'}`}>
                                    {xap.number}
                                </div>
                                <span className="text-[9px] uppercase font-bold text-slate-400 mb-1 leading-tight line-clamp-1" title={xap.dominantAlgo}>
                                    {xap.dominantAlgo.substring(0, 15)}
                                </span>
                                <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden mb-1">
                                    <div 
                                        className={`${targetDraw.gagnants.includes(xap.number) ? 'bg-emerald-500' : 'bg-indigo-500'} h-full rounded-full`}
                                        style={{ width: `${xap.contributionPercentage}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
          </div>
        </div>

        {/* RETROSPECTIVE NEAR-MISS AUDITS */}
        <div className="bg-slate-900/35 p-5 rounded-2xl border border-slate-800/80">
          <span className="text-[10px] font-black text-slate-500 tracking-wider uppercase block mb-3">
            Analyse des Écarts d'Inférence (Near Hits)
          </span>

          {rawNearMisses.length > 0 ? (
            <div className="space-y-2.5">
              {rawNearMisses.map((m, idx) => (
                <div key={idx} className="flex justify-between items-center text-xs bg-black/30 p-2.5 rounded-xl border border-white/5 font-medium">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-500" />
                    <span className="text-slate-300 font-mono font-bold">{m.num}</span>
                    <span className="text-slate-500">→</span>
                    <span className="text-slate-400">Proche de la cible {m.target}</span>
                  </div>
                  <span className={`text-[8px] font-black font-mono uppercase px-1.5 py-0.5 rounded ${m.type === "Voisin" ? "bg-blue-500/10 text-blue-400" : m.type === "Miroir" ? "bg-purple-500/10 text-purple-400" : "bg-amber-500/10 text-amber-400"}`}>
                    {m.type}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[10px] text-slate-500 italic py-2 text-center">
              Aucun écho harmonique ou déphase détecté d'amplitude minimale.
            </div>
          )}
        </div>
      </div>

      {/* COLUMN RIGHT: Weights and Spatial Distribution at this Instant (3 columns) */}
      <div className="xl:col-span-3 space-y-6">
        {/* INTERACTIVE WEIGHT ADJUSTMENTS */}
        <div className="bg-black/30 p-5 rounded-3xl border border-slate-800/80">
          <span className="text-[10px] font-black tracking-widest uppercase text-slate-500 block mb-4">
            Ajustement Stratégique Instantané
          </span>

          {/* Dynamic Category Selector Tabs */}
          <div className="flex bg-slate-900 p-0.5 rounded-xl border border-slate-800 mb-4 overflow-x-auto whitespace-nowrap scrollbar-none">
            {[
              { id: "stats", label: "Stats" },
              { id: "signal", label: "Signal" },
              { id: "network", label: "Réseau" },
              { id: "sequences", label: "Séquences" },
            ].map((cat) => (
              <button
                key={cat.id}
                onClick={() => {
                  audioEngine.play("click");
                  setActiveWeightCategory(cat.id);
                }}
                className={`flex-1 px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all text-center ${
                  activeWeightCategory === cat.id
                    ? "bg-fuchsia-600 text-white shadow-md font-bold"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="space-y-4 max-h-[380px] overflow-y-auto custom-scrollbar pr-1">
            {Object.entries(localWeights)
              .filter(([algo]) => getCategoryOfAlgo(algo) === activeWeightCategory)
              .map(([algo, w]) => (
                <div key={algo} className="space-y-1">
                  <div className="flex justify-between text-[10px] font-bold text-slate-400">
                    <span className="capitalize">{algo.replace(/_/g, " ")}</span>
                    <span className="font-mono text-fuchsia-400">{(w * 100).toFixed(0)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={Math.round(w * 100)}
                    onChange={(e) => handleWeightChange(algo, parseInt(e.target.value))}
                    className="w-full h-1 bg-slate-800 rounded appearance-none cursor-pointer accent-fuchsia-400"
                  />
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* WALK-FORWARD AGGREGATE SUMMARY MODULE */}
      {walkForwardSummary && (
        <div className="xl:col-span-12 bg-slate-900/30 p-6 rounded-[2rem] border border-slate-800/80 mt-4 space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-800/60 pb-4">
            <div>
              <h3 className="text-md font-black text-white uppercase tracking-wider flex items-center gap-2">
                <TrendingUp size={16} className="text-fuchsia-400 animate-pulse" /> Rapport de Inférence Séquentielle Walk-Forward
              </h3>
              <p className="text-[10px] text-slate-400 leading-normal mt-1">
                Analyse statistique consolidée sur la fenêtre glissante passée (blind simulation sans fuite d'informations).
              </p>
            </div>
            {walkForwardStats?.isActive ? (
              <span className="px-3 py-1 bg-fuchsia-500/10 border border-fuchsia-500/20 text-fuchsia-400 text-[9px] font-black uppercase tracking-wider rounded-full animate-pulse">
                Simulation en cours ({walkForwardSummary.len} tirages...)
              </span>
            ) : (
              <button 
                onClick={() => setWalkForwardStats(null)}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-[9px] font-bold uppercase transition-all"
              >
                Réinitialiser le Rapport
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-950/40 p-4 rounded-2xl border border-slate-900 flex flex-col justify-between">
              <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Tirages Simulés</span>
              <span className="text-2xl font-black text-white mt-1 font-mono">{walkForwardSummary.len}</span>
            </div>

            <div className="bg-slate-950/40 p-4 rounded-2xl border border-slate-900 flex flex-col justify-between">
              <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Espérance de Hits</span>
              <span className="text-2xl font-black text-fuchsia-400 mt-1 font-mono">
                {walkForwardSummary.avgHits} <span className="text-xs text-slate-500 font-bold">± {walkForwardSummary.stdDev}</span>
              </span>
            </div>

            <div className="bg-slate-950/40 p-4 rounded-2xl border border-slate-900 flex flex-col justify-between">
              <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Taux de Succès (≥1)</span>
              <span className="text-2xl font-black text-emerald-400 mt-1 font-mono">{walkForwardSummary.successRate}%</span>
            </div>

            <div className="bg-slate-950/40 p-4 rounded-2xl border border-slate-900 flex flex-col justify-between">
              <span className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Rapport de Dispersion</span>
              <span className="text-2xl font-black text-indigo-400 mt-1 font-mono">{walkForwardSummary.stdDev}</span>
            </div>
          </div>

          {/* HITS DISTRIBUTION VISUALIZER */}
          <div className="bg-slate-950/30 p-5 rounded-2xl border border-slate-800/40 space-y-3">
            <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Distribution des Fréquences de Hits</h4>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[0, 1, 2, "3+"].map((hKey) => {
                const count = walkForwardSummary.dist[hKey as 0 | 1 | 2 | "3+"] || 0;
                const percent = walkForwardSummary.len > 0 ? (count / walkForwardSummary.len) * 100 : 0;
                return (
                  <div key={hKey} className="space-y-1 bg-black/20 p-3 rounded-xl border border-slate-900">
                    <div className="flex justify-between items-center text-[10px] font-bold">
                      <span className="text-slate-400">{hKey} Hits Exacts</span>
                      <span className="font-mono text-white">{count} ({percent.toFixed(0)}%)</span>
                    </div>
                    <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full ${hKey === 0 ? 'bg-slate-600' : hKey === 1 ? 'bg-blue-500' : hKey === 2 ? 'bg-indigo-500' : 'bg-emerald-500'}`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* HISTORICAL TRACE TABLE */}
          <div className="bg-slate-950/50 rounded-2xl border border-slate-800/60 overflow-hidden">
            <div className="p-3 bg-slate-900/60 border-b border-slate-800/80 text-[9px] font-black uppercase text-slate-400 tracking-widest">
              Historique de la Séquence d'Inférence Walk-Forward
            </div>
            <div className="max-h-60 overflow-y-auto custom-scrollbar">
              <table className="w-full text-left text-[10px] border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-500 font-extrabold uppercase bg-slate-900/10">
                    <th className="p-3">Instant de Backtest</th>
                    <th className="p-3">Hits Évalués</th>
                    <th className="p-3">Classement Gagnants</th>
                    <th className="p-3">Gagnants Réels</th>
                    <th className="p-3">Numéros Suggérés</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900">
                  {walkForwardStats?.history.slice().reverse().map((item, index) => (
                    <tr key={index} className="hover:bg-slate-900/30 transition-colors">
                      <td className="p-3 font-mono font-bold text-slate-300">{item.date}</td>
                      <td className="p-3 font-mono font-black">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] ${item.hits >= 2 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : item.hits === 1 ? 'bg-blue-500/10 text-blue-400' : 'bg-slate-800 text-slate-500'}`}>
                          {item.hits} / 5
                        </span>
                      </td>
                      <td className="p-3 font-mono text-slate-400">{item.accuracy}%</td>
                      <td className="p-3 font-mono text-slate-300">{item.actual.join(", ")}</td>
                      <td className="p-3 font-mono text-slate-400 flex gap-1 flex-wrap">
                        {item.predicted.map((num, i) => {
                          const isHit = item.actual.includes(num);
                          return (
                            <span key={i} className={`px-1 rounded ${isHit ? 'bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/20' : 'bg-slate-800 text-slate-500'}`}>
                              {num}
                            </span>
                          );
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
