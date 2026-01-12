
import { supabase } from './supabaseClient';

/**
 * Wrapper pour appeler les Edge Functions (maintenant sur Vercel /api)
 * Remplace supabase.functions.invoke pour une migration transparente.
 */
export const invokeEdgeFunction = async (functionName: string, options: { body?: any; headers?: any } = {}) => {
  try {
    // Récupérer le token d'auth si disponible pour sécuriser l'appel
    const { data: { session } } = await supabase.auth.getSession();
    const authHeaders = session ? { 'Authorization': `Bearer ${session.access_token}` } : {};

    const response = await fetch(`/api/${functionName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
        ...options.headers
      },
      body: JSON.stringify(options.body || {})
    });

    const data = await response.json();

    if (!response.ok) {
      return { data: null, error: new Error(data.error || response.statusText) };
    }

    return { data, error: null };
  } catch (e: any) {
    return { data: null, error: e };
  }
};
