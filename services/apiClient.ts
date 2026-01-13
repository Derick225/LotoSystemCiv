
import { supabase } from './supabaseClient';

/**
 * Wrapper pour appeler les API Routes Vercel (qui remplacent les Edge Functions Supabase).
 * Utilise fetch vers /api/{functionName} en injectant le token d'auth Supabase.
 */
export const invokeEdgeFunction = async (functionName: string, options: { body?: any; headers?: any } = {}) => {
  try {
    // Récupération du token d'authentification actuel
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;

    // Construction des headers
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...options.headers
    };

    // Appel vers l'API Vercel (Chemin relatif /api/...)
    const response = await fetch(`/api/${functionName}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(options.body || {})
    });

    let data;
    try {
        data = await response.json();
    } catch (parseError) {
        // Fallback si la réponse n'est pas du JSON (ex: erreur 500 html Vercel)
        console.error("API Response Parse Error", parseError);
        throw new Error(`Erreur serveur (${response.status})`);
    }
    
    if (!response.ok) {
        // On propage l'erreur renvoyée par l'API
        return { data: null, error: data.error || data || new Error(`Erreur HTTP ${response.status}`) };
    }

    return { data, error: null };
  } catch (e: any) {
    console.error(`Edge Function ${functionName} failed:`, e);
    return { data: null, error: e };
  }
};
