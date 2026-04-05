/**
 * Nexus Production Math Worker v12.0 (Deep Science Edition)
 * Implémentations mathématiques réelles (DFT, Haar, Hurst R/S).
 */
import { 
    runSpectral, 
    runWavelet, 
    runFractal, 
    denoiseFeaturesPCA, 
    trainRidgeRegression, 
    runGapEfficiency 
} from './mathCore';

const ctx = self as unknown as Worker;

// --- WORKER HANDLER ---

ctx.onmessage = async (e: MessageEvent) => {
    const { requestId, task, history, payload } = e.data;

    try {
        let result: any;
        switch (task) {
            case 'full_analysis':
                if (!history || history.length === 0) throw new Error("History required for full_analysis");
                result = {
                    spectral: runSpectral(history),
                    wavelet: runWavelet(history),
                    fractal: runFractal(history)
                };
                break;
            case 'wavelet_analysis':
                if (!history || history.length === 0) throw new Error("History required for wavelet_analysis");
                result = runWavelet(history);
                break;
            case 'hurst_exponent': 
                if (!history || history.length === 0) throw new Error("History required for hurst_exponent");
                result = runFractal(history);
                break;
            case 'DENOISE_PCA':
                result = denoiseFeaturesPCA(payload.matrix, payload.variance);
                break;
            case 'TRAIN_RIDGE':
                result = trainRidgeRegression(payload.features, payload.labels, payload.lambda);
                break;
            case 'GAP_EFFICIENCY':
                if (!history || history.length === 0) throw new Error("History required for GAP_EFFICIENCY");
                result = runGapEfficiency(history);
                break;
            case 'SPECTRAL_METRICS':
                if (!history || history.length === 0) throw new Error("History required for SPECTRAL_METRICS");
                result = runSpectral(history);
                break;
            default:
                result = { status: 'OK' };
        }
        ctx.postMessage({ requestId, result });
    } catch (err: any) {
        ctx.postMessage({ requestId, error: err.message });
    }
};
