/// <reference lib="webworker" />

import * as mathCore from './mathCore';
import { unpackHistory, unpackMatrix, unpackArray, collectTransferables } from './workers/zeroCopy';

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
