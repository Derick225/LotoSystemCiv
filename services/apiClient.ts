
import { supabase } from './supabaseClient';

/**
 * Wrapper pour appeler les API Routes Vercel (qui remplacent les Edge Functions Supabase).
 * Utilise fetch vers /api/{functionName} en injectant le token d'auth Supabase.
 */
export const invokeEdgeFunction = async (functionName: string, options: { body?: any; headers?: any } = {}) => {
  try {
    // Récupération du token d'authentification actuel (peut échouer si Supabase non configuré, à gérer)
    let token = undefined;
    try {
        const session = await supabase.auth.getSession();
        token = session.data.session?.access_token;
    } catch (e) {
        // Ignorer l'erreur d'auth pour permettre les appels non authentifiés si l'API le supporte
    }

    // Construction des headers
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...options.headers
    };

    // Appel vers l'API Vercel (Chemin relatif /api/...)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

    try {
      const response = await fetch(`/api/${functionName}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(options.body || {}),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      let data;
      try {
          const text = await response.text();
          data = text ? JSON.parse(text) : null;
      } catch (parseError) {
          console.error("API Response Parse Error", parseError);
          if (response.ok) return { data: { success: true }, error: null };
          throw new Error(`Erreur serveur (${response.status}) : Réponse non-JSON`);
      }
      
      if (!response.ok) {
          return { data: null, error: data?.error || data || new Error(`Erreur HTTP ${response.status}`) };
      }

      return { data, error: null };
    } catch (e: any) {
      clearTimeout(timeoutId);
      if (e.name === 'AbortError') {
        return { data: null, error: new Error(`Request to ${functionName} timed out`) };
      }
      throw e;
    }
  } catch (e: any) {
    console.error(`Edge Function ${functionName} failed:`, e);
    return { data: null, error: e };
  }
};
