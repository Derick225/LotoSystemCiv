
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
      if (val) return val.trim();
    }
    // Attempt process.env access (defined in vite.config.ts)
    if (typeof process !== 'undefined' && process.env) {
      const val = process.env[key];
      if (val) return val.trim();
    }
  } catch (e) {
    console.warn(`[Nexus Config] Failed to read ${key}:`, e);
  }
  return '';
};

const envUrl = getEnvVar('VITE_SUPABASE_URL');
const envKey = getEnvVar('VITE_SUPABASE_ANON_KEY');

const isValidSupabaseUrl = (url: string): boolean => {
  try {
    const u = new URL(url);
    // On valide le protocole et le fait que ce soit bien une URL supabase ou self-hosted valide
    return u.protocol === 'https:' && u.hostname.includes('.');
  } catch {
    return false;
  }
};

export const isSupabaseConfigured = () => {
    // Check strict : pas de placeholder, URL valide, clé présente
    return !!envUrl && 
           !!envKey && 
           !envUrl.includes('placeholder') && 
           !envKey.includes('placeholder') &&
           isValidSupabaseUrl(envUrl);
};

// Safe check for DEV environment
const isDev = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV;

if (!isSupabaseConfigured()) {
    if (isDev) {
         console.warn(`[Supabase] Mode Hors-Ligne (Config manquante ou invalide). URL: ${envUrl}`);
    } else {
         console.error("🚨 NEXUS CRITICAL: Supabase configuration missing or invalid. App running in offline mode.");
    }
}

// Fallback sûr pour éviter le crash du client JS si la config est manquante
// createClient crash si l'URL est invalide, donc on utilise une URL valide même en fallback
const clientUrl = isSupabaseConfigured() ? envUrl : 'https://placeholder.supabase.co';
const clientKey = isSupabaseConfigured() ? envKey : 'placeholder-key';

export const supabase = createClient(clientUrl, clientKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: typeof window !== 'undefined' ? window.localStorage : undefined
    },
    global: {
      headers: { 'x-nexus-version': '11.6' }
    }
});

/**
 * Teste la connexion réelle à la base de données.
 * Retourne { success: true } ou { success: false, error: string }
 */
export const testDatabaseConnection = async () => {
    if (!isSupabaseConfigured()) {
        return { success: false, error: "Configuration Supabase invalide (URL/KEY)." };
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
