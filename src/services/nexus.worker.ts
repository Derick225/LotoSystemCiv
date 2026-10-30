/// <reference lib="webworker" />

import * as mathCore from './mathCore';
import { unpackHistory, unpackMatrix, unpackArray, collectTransferables } from './workers/zeroCopy';
import {
    computeTopologicalLyapunovHpc,
    solveCombinatorialAnnealingHpc,
    computeCrossHawkesKernelHpc,
    computeMarkovTransitionHpc,
    computeCooccurrenceTensorHpc,
    computeRobustHurstHpc,
    computeFftPowerSpectrumHpc,
    computeSpatialGridHpc,
    computeBarycenterTrajectoryHpc,
    computePearsonCorrelationHpc,
    computePearsonCorrelationMatrixHpc
} from './wasm/lotoEngineBridge';

self.onmessage = (e: MessageEvent) => {
    const { taskId, task, payload, history, historyBuffer, drawCount, winningCount, totalCols } = e.data;
    
    try {
        const hist = historyBuffer ? unpackHistory(historyBuffer, drawCount, winningCount, totalCols) : unpackHistory(history);
        let result: unknown;
        const p = payload || {};

        switch (task) {
            case 'full_analysis':
                result = {
                    spectral: mathCore.runSpectral(hist),
                    fractal: mathCore.runFractal(hist)
                };
                break;

            case 'hurst_exponent':
                result = mathCore.runFractal(hist);
                break;
            case 'DENOISE_PCA': {
                const matrix = p.matrixBuffer ? unpackMatrix(p.matrixBuffer, p.rows, p.cols) : p.matrix;
                result = mathCore.denoiseFeaturesPCA(matrix, p.variance);
                break;
            }
            case 'TRAIN_RIDGE': {
                const features = p.featuresBuffer ? unpackMatrix(p.featuresBuffer, p.featRows, p.featCols) : p.features;
                const labels = p.labelsBuffer ? unpackArray(p.labelsBuffer) : p.labels;
                result = mathCore.trainRidgeRegression(features, labels, p.lambda);
                break;
            }
            case 'GAP_EFFICIENCY':
                result = mathCore.runGapEfficiency(hist);
                break;
            case 'SPECTRAL_METRICS':
                result = mathCore.runSpectral(hist);
                break;
            case 'wavelet_analysis':
                result = mathCore.runContinuousWaveletTransformAnalysis(hist);
                break;
            case 'TRANSFER_ENTROPY':
                result = mathCore.computeTransferEntropy(hist, p?.targetNumbers);
                break;
            case 'TOPOLOGICAL_LYAPUNOV_HPC':
                result = computeTopologicalLyapunovHpc(
                    p.historyDraws,
                    p.numDraws,
                    p.winCols || 5,
                    p.horizonLimit || 30
                );
                break;
            case 'COMBINATORIAL_ANNEALING_HPC':
                result = solveCombinatorialAnnealingHpc(p);
                break;
            case 'CROSS_HAWKES_HPC':
                result = computeCrossHawkesKernelHpc(p);
                break;
            case 'MARKOV_TRANSITIONS_HPC':
                result = computeMarkovTransitionHpc(
                    p.historyDraws,
                    p.numDraws,
                    p.winCols || 5,
                    p.numStates || 90
                );
                break;
            case 'COOCCURRENCE_TENSOR_HPC':
                result = computeCooccurrenceTensorHpc(
                    p.predDrawsFlat,
                    p.targetDrawsFlat,
                    p.numDraws,
                    p.winCols || 5,
                    p.activePredNumbers || []
                );
                break;
            case 'HURST_HPC':
                result = computeRobustHurstHpc(p.signal);
                break;
            case 'SPECTRAL_FFT_HPC':
                result = computeFftPowerSpectrumHpc(p.signal);
                break;
            case 'SPATIAL_GRID_HPC': {
                const flatDraws = p.flatDraws instanceof Int32Array ? p.flatDraws : new Int32Array(p.flatDraws || []);
                const numDraws = p.numDraws || Math.floor(flatDraws.length / 5);
                const spatial = computeSpatialGridHpc(flatDraws, numDraws);
                result = {
                    gridDensity: spatial.gridDensity,
                    gravityPulls: spatial.gravityPulls,
                    barycenterX: spatial.barycenterX,
                    barycenterY: spatial.barycenterY,
                    entropy: spatial.entropy,
                    densityThreshold: spatial.densityThreshold
                };
                break;
            }
            case 'BARYCENTER_TRAJECTORY_HPC':
                result = computeBarycenterTrajectoryHpc(p.results || [], p.limit || 20);
                break;
            case 'PEARSON_CORRELATION_HPC': {
                const x = p.x instanceof Float64Array ? p.x : new Float64Array(p.x || []);
                const y = p.y instanceof Float64Array ? p.y : new Float64Array(p.y || []);
                result = computePearsonCorrelationHpc(x, y);
                break;
            }
            case 'PEARSON_MATRIX_HPC':
                result = computePearsonCorrelationMatrixHpc(p.algoScores || {}, p.keys || []);
                break;
            default:
                result = { status: 'OK' };
        }
        
        const transferables: Transferable[] = [];
        if (result && typeof result === 'object') {
            collectTransferables(result, transferables);
        }

        self.postMessage({ taskId, success: true, result }, transferables);
    } catch (error: unknown) {
        self.postMessage({ taskId, success: false, error: (error instanceof Error ? error.message : String(error)) || "Erreur interne au Web Worker" });
    }
};
