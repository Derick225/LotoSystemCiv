import { supabase } from '../../services/supabaseClient';
import { AppError, logError } from '../../utils/AppError';

interface ApiOptions extends RequestInit {
  requireAuth?: boolean;
}

export const apiClient = {
  async post<T>(endpoint: string, body: any, options: ApiOptions = {}): Promise<T> {
    const headers = new Headers(options.headers || {});
    headers.set('Content-Type', 'application/json');

    if (options.requireAuth !== false) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          headers.set('Authorization', `Bearer ${session.access_token}`);
        }
      } catch (e) {
        // Ignorer l'erreur d'auth pour permettre les appels non authentifiés si l'API le supporte
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

    try {
      const response = await fetch(`/api/${endpoint}`, {
        ...options,
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      let data;
      try {
        const text = await response.text();
        data = text ? JSON.parse(text) : null;
      } catch (parseError) {
        if (response.ok) return { success: true } as unknown as T;
        throw new AppError(`Erreur serveur (${response.status}) : Réponse non-JSON`, 'NETWORK_ERR', 'high', { error: parseError });
      }

      if (!response.ok) {
        throw new AppError(
          data?.error || data?.message || `Erreur HTTP ${response.status}`,
          response.status === 401 ? 'AUTH_ERR' : 'NETWORK_ERR',
          'high',
          { data }
        );
      }

      return data as T;
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error instanceof AppError) {
        logError(error, { endpoint });
        throw error;
      }
      if (error.name === 'AbortError') {
        const timeoutError = new AppError(`Timeout lors de l'appel à ${endpoint}`, 'NETWORK_ERR', 'medium', { error });
        logError(timeoutError, { endpoint });
        throw timeoutError;
      }
      const unknownError = new AppError('Impossible de contacter le serveur', 'UNKNOWN_ERR', 'high', { error });
      logError(unknownError, { endpoint });
      throw unknownError;
    }
  }
};
