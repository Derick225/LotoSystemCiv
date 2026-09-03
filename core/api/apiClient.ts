import { supabase, isSupabaseConfigured } from '../../services/supabaseClient';
import { AppError, logError } from '../../utils/AppError';

interface ApiOptions extends RequestInit {
  requireAuth?: boolean;
  suppressErrorLogging?: boolean;
}

export const apiClient = {
  async post<T>(endpoint: string, body: unknown, options: ApiOptions = {}): Promise<T> {
    if (!isSupabaseConfigured()) {
      const offlineErr = new AppError(
        `Service Supabase non configuré pour l'appel ${endpoint}`,
        'CONFIG_ERR',
        'low',
        { endpoint }
      );
      if (!options.suppressErrorLogging) {
        logError(offlineErr, { endpoint });
      }
      throw offlineErr;
    }

    try {
      // Route toutes les requêtes vers la gateway unique 'nexus-api'
      const requestPayload =
        typeof body === 'object' && body !== null
          ? { action: endpoint, ...(body as Record<string, unknown>) }
          : { action: endpoint, payload: body };

      const { data, error } = await supabase.functions.invoke('nexus-api', {
        body: requestPayload,
        headers: options.headers as Record<string, string>
      });

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
      const isNetworkError = String(error).toLowerCase().includes('fetch') || String(error).toLowerCase().includes('network');
      const unknownError = new AppError('Impossible de contacter le serveur', 'UNKNOWN_ERR', isNetworkError ? 'medium' : 'high', { error });
      if (!options.suppressErrorLogging) {
          logError(unknownError, { endpoint });
      }
      throw unknownError;
    }
  }
};
