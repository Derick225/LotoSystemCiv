import { supabase } from '../../services/supabaseClient';
import { AppError, logError } from '../../utils/AppError';

interface ApiOptions extends RequestInit {
  requireAuth?: boolean;
  suppressErrorLogging?: boolean;
  /** Timeout en ms avant abandon de l'appel Edge Function (défaut: 4000ms). */
  timeoutMs?: number;
}

// Sans ceci, `supabase.functions.invoke` peut rester en attente pendant la durée
// du timeout réseau par défaut du navigateur (souvent 30-60s+) si la fonction Edge
// n'est pas déployée, surchargée ou injoignable. C'est la cause n°1 des gels ressentis
// avant le basculement automatique vers le Worker local (voir workerService.ts).
const DEFAULT_EDGE_TIMEOUT_MS = 4000;

function withTimeout<T>(promise: Promise<T>, ms: number, signal: AbortController): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.abort();
      reject(new Error(`Timeout Edge Function après ${ms}ms`));
    }, ms);

    promise
      .then((val) => { clearTimeout(timer); resolve(val); })
      .catch((err) => { clearTimeout(timer); reject(err); });
  });
}

export const apiClient = {
  async post<T>(endpoint: string, body: unknown, options: ApiOptions = {}): Promise<T> {
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? DEFAULT_EDGE_TIMEOUT_MS;

    try {
      // Appel direct de la Supabase Edge Function, borné par un timeout strict.
      // `signal` est transmis pour interrompre la requête HTTP sous-jacente dès
      // que le timeout expire (au lieu de la laisser traîner en arrière-plan).
      const { data, error } = await withTimeout(
        supabase.functions.invoke(endpoint, {
          body: body as Record<string, unknown>,
          headers: options.headers as Record<string, string>,
          signal: controller.signal,
          // @ts-ignore - option native supportée par functions-js >= 2.9x (verrouillé 2.97.0 ici)
          timeout: timeoutMs
        }),
        timeoutMs,
        controller
      );

      if (error) {
        let errorMessage = error.message;
        let details: Record<string, unknown> = { error };
        
        // Handle "Edge Function returned a non-2xx status code"
        if (error.context && typeof error.context.json === 'function') {
            try {
                const errorBody = await error.context.json();
                if (errorBody && errorBody.error) {
                    errorMessage = errorBody.error;
                    if (errorBody.details) {
                        details = errorBody.details;
                    }
                }
            } catch (e) {
                // Ignore parse errors from context
            }
        }

        const isNetworkError = (errorMessage || '').toLowerCase().includes('fetch') || (errorMessage || '').toLowerCase().includes('network') || (errorMessage || '').toLowerCase().includes('failed to fetch');
        throw new AppError(
          errorMessage || `Erreur lors de l'appel à la fonction ${endpoint}`,
          'NETWORK_ERR',
          isNetworkError ? 'medium' : 'high',
          details
        );
      }

      if (data && typeof data === 'object' && 'error' in data) {
        throw new AppError(
          data.error || `Erreur métier retournée par la fonction ${endpoint}`,
          'API_ERR',
          'high',
          { details: data.details || data }
        );
      }

      return data as T;
    } catch (error: unknown) {
      if (error instanceof AppError) {
        if (!options.suppressErrorLogging) {
            logError(error, { endpoint });
        }
        throw error;
      }
      const errorText = String(error).toLowerCase();
      const isNetworkError = errorText.includes('fetch') || errorText.includes('network') || errorText.includes('timeout') || errorText.includes('abort');
      const unknownError = new AppError('Impossible de contacter le serveur', 'UNKNOWN_ERR', isNetworkError ? 'medium' : 'high', { error });
      if (!options.suppressErrorLogging) {
          logError(unknownError, { endpoint });
      }
      throw unknownError;
    }
  }
};
