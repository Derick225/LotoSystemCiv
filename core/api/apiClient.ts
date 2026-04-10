import { supabase } from '../../services/supabaseClient';
import { AppError, logError } from '../../utils/AppError';

interface ApiOptions extends RequestInit {
  requireAuth?: boolean;
}

export const apiClient = {
  async post<T>(endpoint: string, body: any, options: ApiOptions = {}): Promise<T> {
    try {
      // Appel direct de la Supabase Edge Function
      const { data, error } = await supabase.functions.invoke(endpoint, {
        body: body,
        headers: options.headers as Record<string, string>
      });

      if (error) {
        throw new AppError(
          error.message || `Erreur lors de l'appel à la fonction ${endpoint}`,
          'NETWORK_ERR',
          'high',
          { error }
        );
      }

      return data as T;
    } catch (error: any) {
      if (error instanceof AppError) {
        logError(error, { endpoint });
        throw error;
      }
      const unknownError = new AppError('Impossible de contacter le serveur', 'UNKNOWN_ERR', 'high', { error });
      logError(unknownError, { endpoint });
      throw unknownError;
    }
  }
};
