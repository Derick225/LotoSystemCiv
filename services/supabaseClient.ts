
import { createClient } from '@supabase/supabase-js';

/**
 * NEXUS PLATINUM - Supabase Client Configuration
 * Detects environment variables from Vite (import.meta.env) or Process (process.env)
 */
const getEnvVar = (key: string): string => {
  try {
    // Attempt Vite-style access
    if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
      const val = (import.meta as any).env[key];
      if (val) return val;
    }
    // Attempt process.env access (defined in vite.config.ts)
    if (typeof process !== 'undefined' && process.env) {
      const val = process.env[key];
      if (val) return val;
    }
  } catch (e) {
    console.warn(`[Nexus Config] Failed to read ${key}:`, e);
  }
  return '';
};

const envUrl = getEnvVar('VITE_SUPABASE_URL');
const envKey = getEnvVar('VITE_SUPABASE_ANON_KEY');

export const isSupabaseConfigured = () => {
    const isConfigured = !!envUrl && envUrl !== 'https://placeholder.supabase.co' && !!envKey;
    if (!isConfigured) {
        // Log discret en dev pour ne pas spammer
        if ((import.meta.env as any).DEV) {
             console.warn(`[Supabase Check] URL: ${envUrl ? 'OK' : 'MISSING'}, KEY: ${envKey ? 'OK (Masked)' : 'MISSING'}`);
        }
    }
    return isConfigured;
};

if (!isSupabaseConfigured()) {
    console.error("🚨 NEXUS CRITICAL: Supabase environment variables are missing! Check your deployment settings (Vercel/Netlify) or .env file.");
}

// Fallback to placeholder only to prevent total JS crash, but isSupabaseConfigured will return false
const clientUrl = envUrl || 'https://placeholder.supabase.co';
const clientKey = envKey || 'placeholder-key';

export const supabase = createClient(clientUrl, clientKey);

/**
 * Teste la connexion réelle à la base de données.
 * Retourne { success: true } ou { success: false, error: string }
 */
export const testDatabaseConnection = async () => {
    if (!isSupabaseConfigured()) {
        return { success: false, error: "Variables d'environnement manquantes (VITE_SUPABASE_URL)" };
    }
    try {
        // Tentative de lecture légère (head) sur la table principale
        const { error, count } = await supabase
            .from('draw_results')
            .select('*', { count: 'exact', head: true });

        if (error) {
            console.error("[Supabase Connection Test] Failed:", error);
            // Détection spécifique des erreurs RLS ou 404
            if (error.code === '42501') return { success: false, error: "Accès refusé (RLS Policy manquante). Vérifiez que la politique 'Public Read Results' est active." };
            if (error.code === '42P01') return { success: false, error: "Table 'draw_results' introuvable. Avez-vous exécuté le script SQL ?" };
            if (error.message.includes('FetchError')) return { success: false, error: "Erreur réseau. Vérifiez votre connexion internet." };
            return { success: false, error: `${error.message} (Code: ${error.code})` };
        }
        
        return { success: true, count };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
};
