import { useState, useCallback, useMemo, useRef, useEffect, useDeferredValue } from 'react';
import { useNexusStore } from '../store/useNexusStore';
import { generateMasterPrediction, getStrategyName, getAlgoWeights, normalizeWeights } from '../services/predictionEngine';
import { savePredictionToHistory, getLatestPredictionForDraw } from '../services/predictionHistoryService';
import { calculateShannonEntropy, detectGameRegime } from '../services/mathService';
import { getLocalForensicReports } from '../services/postPredictionAnalysisService';
import { DEFAULT_ALGO_WEIGHTS, AlgoKey } from '../shared/prediction.types';
import { DNAOptimizer } from '../services/training/DNAOptimizer';
import { useFeatureFlags } from '../services/prediction/featureFlags';
import { useToast } from '../components/ui/Toast';
import { audioEngine } from '../utils/audioEngine';

import { packHistory } from '../services/workers/zeroCopy';
import { purifyHistoryForDraw } from '../utils/arrayUtils';
import { Prediction } from '../types';
import { AlgoWeights } from '../types';

export const usePredictionGenerator = (drawName: string) => {
    const { showToast } = useToast();
    const rawHistory = useNexusStore(state => state.history);
    const history = useDeferredValue(rawHistory);
    const temporalDepth = useNexusStore(state => state.temporalDepth);
    const setLastPrediction = useNexusStore(state => state.setLastPrediction);
    const globalWeights = useNexusStore(state => state.globalWeights);
    const updateGlobalWeights = useNexusStore(state => state.updateGlobalWeights);
    const spectral = useNexusStore(state => state.spectral);
    const correlationMatrix = useNexusStore(state => state.correlationMatrix);
    const regularity = useNexusStore(state => state.regularity);
    const volatility = useNexusStore(state => state.volatility);
    const symbioticContext = useNexusStore(state => state.symbioticContext);
    const fractal = useNexusStore(state => state.fractal);
    const isForensicOptimized = useNexusStore(state => state.isForensicOptimized);

    const [isComputing, setIsComputing] = useState(false);
    const [computingStep, setComputingStep] = useState<string>("");
    const [computingProgress, setComputingProgress] = useState<number>(0);
    const [activeDNA, setActiveDNA] = useState<string>("Standard");
    const [quantumMode, setQuantumMode] = useState(false);
    const { flags } = useFeatureFlags();
    const [isChaotic, setIsChaotic] = useState(false);
    const lastInferenceStateRef = useRef<string | null>(null);

    const [isOptimizing, setIsOptimizing] = useState(false);
    const [optimizedWeights, setOptimizedWeights] = useState<AlgoWeights | null>(null);
    const [previousWeights, setPreviousWeights] = useState<AlgoWeights | null>(null);

    const storeDrawName = useNexusStore(state => state.drawName);
    const regime = useNexusStore(state => state.regime);

    // Strict Draw Isolation: purify history for active draw
    const activeHistory = useMemo(() => {
        if (!drawName) return [];
        return purifyHistoryForDraw(drawName, history);
    }, [drawName, history]);

    const isIsolated = useMemo(() => {
        return activeHistory.length > 0 || history.length === 0;
    }, [activeHistory.length, history.length]);

    const activeSpectral = useMemo(() => {
        return spectral;
    }, [spectral]);

    const activeCorrelationMatrix = useMemo(() => {
        return correlationMatrix;
    }, [correlationMatrix]);

    const activeRegularity = useMemo(() => {
        return regularity;
    }, [regularity]);

    const activeVolatility = useMemo(() => {
        return volatility;
    }, [volatility]);

    const activeSymbioticContext = useMemo(() => {
        return symbioticContext;
    }, [symbioticContext]);

    const activeFractal = useMemo(() => {
        return fractal;
    }, [fractal]);

    const activeRegime = useMemo(() => {
        return regime;
    }, [regime]);

    const currentEntropy = useMemo(() => {
        return activeRegime?.entropy || (activeHistory.length > 0 ? calculateShannonEntropy(activeHistory.slice(0, 10)).normalized : 0);
    }, [activeRegime, activeHistory]);

    const resolvedLearningRate = useMemo(() => {
        return Math.max(0.01, Math.min(0.2, 0.15 * (1.0 - currentEntropy) + 0.01));
    }, [currentEntropy]);

    const resolvedNoiseLevel = useMemo(() => {
        const volScore = activeVolatility?.score || 50;
        return Math.max(0.1, Math.min(3.0, (volScore / 50.0) * (currentEntropy || 0.5) * 1.5 + 0.2));
    }, [currentEntropy, activeVolatility]);

    const resolvedMcIterations = useMemo(() => {
        return Math.max(10, Math.min(100, Math.round(20 + 80 * (currentEntropy || 0.5))));
    }, [currentEntropy]);

    const gameRegimeInfo = activeRegime;

    const [chaoticRatio, setChaoticRatio] = useState(0);
    useEffect(() => {
        let active = true;
        const fetchReports = async () => {
            try {
                const rawReports = await getLocalForensicReports();
                if (!rawReports || !active) return;
                const reports = rawReports.filter(r => r.drawName === drawName);
                if (reports.length > 0) {
                    const windowSize = Math.min(10, reports.length);
                    const swans = reports.slice(0, windowSize).filter(r => r.isBlackSwan).length;
                    setChaoticRatio(swans / windowSize);
                } else {
                    setChaoticRatio(0);
                }
            } catch (err) {
                console.warn("[Oracle Base] Reports validation bypassed (local fallback mode active):", err);
            }
        };
        fetchReports();
        return () => { active = false; };
    }, [drawName]);

    useEffect(() => {
        // Activation logistique continue pour la détection du chaos (Zéro Seuil Arbitraire)
        const volScore = activeVolatility?.score ?? 50.0;
        const chaosIndex = 0.5 * (1.0 / (1.0 + Math.exp(-8.0 * (chaoticRatio - 0.20)))) +
                           0.5 * (1.0 / (1.0 + Math.exp(-0.1 * (volScore - 75.0))));
        setIsChaotic(chaosIndex > 0.5);
    }, [chaoticRatio, activeVolatility]);

    const [cachedPrediction, setCachedPrediction] = useState<Prediction | null>(null);

    useEffect(() => {
        let isMounted = true;
        setLastPrediction(null);
        setCachedPrediction(null);
        lastInferenceStateRef.current = null;

        // Pré-charger la dernière prédiction en cache (accessible sur demande sans lancement automatique)
        if (drawName) {
            getLatestPredictionForDraw(drawName).then((cached) => {
                if (isMounted && cached) {
                    setCachedPrediction(cached);
                }
            }).catch(e => {
                console.warn("[Oracle Base] Erreur lecture cache prédiction:", e);
            });
        }

        return () => {
            isMounted = false;
        };
    }, [drawName, setLastPrediction]);

    const restoreCachedPrediction = useCallback(() => {
        if (cachedPrediction) {
            setLastPrediction(cachedPrediction);
            audioEngine.play('click');
            showToast("Dernière prédiction archivée restaurée.", "info");
        }
    }, [cachedPrediction, setLastPrediction, showToast]);

    useEffect(() => {
        if (globalWeights) setActiveDNA(getStrategyName(globalWeights));
    }, [globalWeights]);

    const resolveWeights = useCallback(async (forcedWeights?: AlgoWeights | null): Promise<AlgoWeights> => {
        let specificWeights = forcedWeights || (Object.keys(globalWeights || {}).length > 0 ? { ...globalWeights } as AlgoWeights : null);
        if (!specificWeights) {
            try {
                specificWeights = await getAlgoWeights(drawName);
            } catch (err) {
                console.warn("[Oracle Base] Using local weights library because server was unreachable:", err);
                specificWeights = DEFAULT_ALGO_WEIGHTS;
            }
        }
        return specificWeights;
    }, [drawName, globalWeights]);

    const runInference = useCallback(async (forcedWeights?: AlgoWeights) => {
        if (!isIsolated) {
            audioEngine.play('error');
            console.error(`[StrictDrawIsolationGuard] Rejected runInference: active draw "${drawName}" is not synchronized with store draw "${storeDrawName}".`);
            showToast("Garde d'isolation active : Les données ne correspondent pas au tirage actif.", "error");
            return;
        }
        if (activeHistory.length < 5) {
            audioEngine.play('error');
            showToast("Historique insuffisant pour l'Oracle Base.", "error");
            return;
        }
        audioEngine.play('loading');
        setIsComputing(true);
        setComputingStep("Convergence Vectorielle en cours...");

        let specificWeights = await resolveWeights(forcedWeights);

        if (quantumMode) {
            // Mode Quantique (Exploratoire) : au lieu de booster arbitrairement 4 algorithmes,
            // on augmente l'entropie globale de la distribution des poids (relaxation thermique).
            // Les poids se rapprochent de l'uniformité proportionnellement à la volatilité (resolvedNoiseLevel).
            const mixingFactor = Math.min(0.8, resolvedNoiseLevel * 0.15); 
            const numAlgos = Object.keys(specificWeights).length;
            const uniformWeight = 1.0 / (numAlgos || 1);
            
            const smoothedWeights = {} as AlgoWeights;
            Object.keys(specificWeights).forEach((k) => {
                const key = k as keyof AlgoWeights;
                const original = specificWeights![key] || 0;
                // Combinaison convexe entre le poids optimisé et le poids uniforme
                smoothedWeights[key] = original * (1 - mixingFactor) + uniformWeight * mixingFactor;
            });
            specificWeights = normalizeWeights(smoothedWeights);
        }

        if (!forcedWeights) {
            setPreviousWeights(null);
            setOptimizedWeights(null);
            setActiveDNA(quantumMode ? `Quantum ${getStrategyName(specificWeights!)}` : getStrategyName(globalWeights as AlgoWeights));
        }

        try {
            await new Promise(r => setTimeout(r, 150)); 
            const metrics = { spectral: activeSpectral, correlationMatrix: activeCorrelationMatrix, regularity: activeRegularity, volatility: activeVolatility, fractal: activeFractal };
            const res = await generateMasterPrediction(
                drawName,
                activeHistory,
                temporalDepth,
                specificWeights!,
                metrics,
                activeSymbioticContext || undefined,
                false,
                flags.adversarialMode,
                undefined,
                isForensicOptimized,
                (progress, step) => {
                    setComputingProgress(progress);
                    setComputingStep(step);
                },
                undefined,
                undefined,
                false // Pure Local Execution (Zéro Cloud) pour Oracle Base
            );
            
            setLastPrediction(res);
            
            try {
                await savePredictionToHistory(drawName, res, undefined, metrics);
            } catch (dbErr) {
                console.warn("[Oracle Base] Local execution success: Prediction not committed to distant repository (network isolated).", dbErr);
            }
            
            if (!forcedWeights) {
                audioEngine.play('success');
                showToast("Prédiction générée via l'ADN actif.", "success");
            }
        } catch (e: any) {
            console.error("[Oracle Base Inference Engine Error]:", e);
            audioEngine.play('error');
            showToast("Erreur d'inférence (Mode secouru actif).", "error");
        } finally {
            setIsComputing(false);
            setComputingStep("");
        }
    }, [isIsolated, storeDrawName, drawName, activeHistory, activeSpectral, activeCorrelationMatrix, activeRegularity, activeVolatility, activeFractal, activeSymbioticContext, globalWeights, quantumMode, flags.adversarialMode, resolvedNoiseLevel, setLastPrediction, showToast]);



    const runMonteCarlo = useCallback(async () => {
        if (!isIsolated) {
            audioEngine.play('error');
            console.error(`[StrictDrawIsolationGuard] Rejected runMonteCarlo: active draw "${drawName}" is not synchronized with store draw "${storeDrawName}".`);
            showToast("Garde d'isolation active : Les données ne correspondent pas au tirage actif.", "error");
            return;
        }
        if (activeHistory.length < 10) {
            showToast("Historique insuffisant.", "error");
            return;
        }
        audioEngine.play('scan');
        setIsComputing(true);
        setComputingStep(`Monte-Carlo Déterministe (${resolvedMcIterations} runs)...`);

        try {
            let specificWeights = await resolveWeights();
            const metrics = { spectral: activeSpectral, correlationMatrix: activeCorrelationMatrix, regularity: activeRegularity, volatility: activeVolatility, fractal: activeFractal };
            
            const packed = packHistory(activeHistory);
            
            const worker = new Worker(new URL('../services/workers/prediction.worker.ts', import.meta.url), { type: 'module' });
            
            const aggregatedPred: Prediction = await new Promise((resolve, reject) => {
                const timeoutId = setTimeout(() => {
                    worker.terminate();
                    reject(new Error("Timeout du Web Worker MCMC"));
                }, 120000);

                worker.onmessage = (e: MessageEvent) => {
                    const { success, result, error, isProgress, progress, message } = e.data;
                    if (isProgress) {
                        setComputingProgress(progress);
                        setComputingStep(message);
                        return;
                    }
                    clearTimeout(timeoutId);
                    if (success) {
                        resolve(result);
                    } else {
                        reject(new Error(error || "Erreur MCMC Worker"));
                    }
                    worker.terminate();
                };

                worker.onerror = (err) => {
                    clearTimeout(timeoutId);
                    reject(err);
                    worker.terminate();
                };

                worker.postMessage({
                    taskId: `MCMC_${Date.now()}`,
                    type: 'mcmc',
                    drawName,
                    historyBuffer: packed.historyBuffer,
                    drawCount: packed.drawCount,
                    winningCount: packed.winningCount,
                    totalCols: packed.totalCols,
                    temporalDepth: 10,
                    weightsToUse: specificWeights,
                    metrics,
                    symbioticContext: activeSymbioticContext || undefined,
                    adversarialMode: flags.adversarialMode,
                    isForensicOptimized,
                    resolvedMcIterations,
                    resolvedNoiseLevel,
                    resolvedLearningRate
                }, [packed.historyBuffer]);
            });

            setLastPrediction(aggregatedPred);
            
            try {
                await savePredictionToHistory(drawName, aggregatedPred, undefined, metrics);
            } catch (dbErr) {
                console.warn("[Oracle MC] Local fallback success:", dbErr);
            }
            
            setActiveDNA("Monte-Carlo (MCMC)");
            audioEngine.play("success");
            showToast(`Convergence MC achevée avec succès.`, "success");

        } catch (e: any) {
            console.error("Monte Carlo Failed:", e);
            audioEngine.play("error");
            showToast("Échec du process stochastique MCMC.", "error");
        } finally {
            setIsComputing(false);
            setComputingStep("");
        }
    }, [isIsolated, storeDrawName, activeHistory, drawName, resolvedMcIterations, resolvedNoiseLevel, resolvedLearningRate, flags.adversarialMode, activeSpectral, activeCorrelationMatrix, activeRegularity, activeVolatility, activeFractal, activeSymbioticContext, globalWeights, currentEntropy, setLastPrediction, showToast, isForensicOptimized]);

    const handleOptimizeWeights = async () => {
        // Self-learning optimization retired
        showToast("L'Auto-apprentissage a été désactivé.", "info");
    };

    return {
        isComputing,
        computingStep,
        computingProgress,
        activeDNA,
        quantumMode,
        setQuantumMode,
        isChaotic,
        isOptimizing,
        optimizedWeights,
        previousWeights,
        currentEntropy,
        resolvedLearningRate,
        resolvedNoiseLevel,
        resolvedMcIterations,
        gameRegimeInfo,
        runInference,
        runMonteCarlo,
        handleOptimizeWeights,
        cachedPrediction,
        restoreCachedPrediction,
    };
};
