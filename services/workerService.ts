
import { AppError, logError } from '../utils/AppError';
import { apiClient } from '../core/api/apiClient';
import * as mathCore from './mathCore';

/**
 * NEXUS WORKER SERVICE
 * Orchestre les calculs lourds en arrière-plan.
 * Modifié pour utiliser les Edge Functions Supabase afin de décharger le client.
 */

class WorkerService {
    constructor() {}

    public isAvailable(): boolean {
        // Toujours disponible via l'API
        return true;
    }

    public async runTask<T>(task: string, payload: any = {}, history: any[] = []): Promise<T> {
        try {
            // Appel à l'Edge Function Supabase pour les calculs lourds
            const response = await apiClient.post<any>('compute-nexus-analytics', {
                task,
                payload,
                history
            });

            if (response && response.success) {
                return response.result as T;
            } else {
                throw new Error(response?.error || "Erreur inconnue de l'Edge Function");
            }
        } catch (e: any) {
            console.warn(`Edge Function failed for task ${task}, falling back to local computation:`, e);
            
            // FALLBACK: Execute logic directly locally if Edge Function fails
            try {
                let result: any;
                switch (task) {
                    case 'full_analysis':
                        result = {
                            spectral: mathCore.runSpectral(history),
                            wavelet: mathCore.runWavelet(history),
                            fractal: mathCore.runFractal(history)
                        };
                        break;
                    case 'wavelet_analysis':
                        result = mathCore.runWavelet(history);
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
                    default:
                        result = { status: 'OK' };
                }
                return result as T;
            } catch (fallbackError: any) {
                throw new AppError(fallbackError.message || "Fallback Task Error", "WORKER_FALLBACK_ERROR", "medium");
            }
        }
    }
}

export const workerService = new WorkerService();
