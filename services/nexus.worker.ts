/// <reference lib="webworker" />

import * as mathCore from './mathCore';

self.onmessage = (e: MessageEvent) => {
    const { taskId, task, payload, history } = e.data;
    
    try {
        let result: unknown;
        switch (task) {
            case 'full_analysis':
                result = {
                    spectral: mathCore.runSpectral(history),
                    fractal: mathCore.runFractal(history)
                };
                break;

            case 'hurst_exponent':
                result = mathCore.runFractal(history);
                break;
            case 'DENOISE_PCA':
                result = mathCore.denoiseFeaturesPCA(payload.matrix, payload.variance);
                break;
            case 'TRAIN_RIDGE':
                result = mathCore.trainRidgeRegression(payload.features, payload.labels, payload.lambda);
                break;
            case 'GAP_EFFICIENCY':
                result = mathCore.runGapEfficiency(history);
                break;
            case 'SPECTRAL_METRICS':
                result = mathCore.runSpectral(history);
                break;
            case 'wavelet_analysis':
                result = mathCore.runContinuousWaveletTransformAnalysis(history);
                break;
            case 'TRANSFER_ENTROPY':
                result = mathCore.computeTransferEntropy(history, payload?.targetNumbers);
                break;
            default:
                result = { status: 'OK' };
        }
        
        self.postMessage({ taskId, success: true, result });
    } catch (error: unknown) {
        self.postMessage({ taskId, success: false, error: (error instanceof Error ? error.message : String(error)) || "Erreur interne au Web Worker" });
    }
};
