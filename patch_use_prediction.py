import re

with open('hooks/usePredictionGenerator.ts', 'r') as f:
    content = f.read()

# Add imports
imports_to_add = """
import { packHistory } from '../services/workers/zeroCopy';
import { Prediction } from '../types';
import { AlgoWeights } from '../types';
"""

content = re.sub(r"import type \{ AlgoWeights, Prediction \} from '\.\./types';\n", imports_to_add, content)

# Replace runMonteCarlo
mcmc_start = content.find("const runMonteCarlo = useCallback(async () => {")
mcmc_end = content.find("const handleOptimizeWeights = async () => {")

new_mcmc = """const runMonteCarlo = useCallback(async () => {
        if (history.length < 10) {
            showToast("Historique insuffisant.", "error");
            return;
        }
        audioEngine.play('scan');
        setIsComputing(true);
        setComputingStep(`Monte-Carlo Déterministe (${resolvedMcIterations} runs)...`);

        try {
            let specificWeights = await resolveWeights();
            const metrics = { spectral, correlationMatrix, regularity, volatility, fractal };
            
            const packed = packHistory(history);
            
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
                    symbioticContext: symbioticContext || undefined,
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
            showToast("Echec du process stochastique MCMC.", "error");
        } finally {
            setIsComputing(false);
            setComputingStep("");
        }
    }, [history, drawName, resolvedMcIterations, resolvedNoiseLevel, resolvedLearningRate, flags.adversarialMode, spectral, correlationMatrix, regularity, volatility, fractal, symbioticContext, globalWeights, currentEntropy, setLastPrediction, showToast, isForensicOptimized]);

    """

content = content[:mcmc_start] + new_mcmc + content[mcmc_end:]

with open('hooks/usePredictionGenerator.ts', 'w') as f:
    f.write(content)
