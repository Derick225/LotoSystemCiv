import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Récupère une variable d'environnement Vite avec nettoyage.
 */
const getViteEnv = (key: string): string => {
  const value = import.meta.env[key];
  return typeof value === 'string' ? value.trim() : '';
};

// Récupération des variables avec fallbacks pour différentes conventions de nommage
const SUPABASE_URL = getViteEnv('VITE_SUPABASE_URL');
const SUPABASE_ANON_KEY = 
  getViteEnv('VITE_SUPABASE_ANON_KEY') || 
  getViteEnv('VITE_SUPABASE_KEY') || 
  getViteEnv('VITE_SUPABASE_PUBLISHABLE_KEY');

/**
 * Vérifie que l’URL est valide (doit être une URL Supabase en HTTPS).
 */
const isValidSupabaseUrl = (url: string): boolean => {
  try {
    const u = new URL(url);
    return u.protocol === 'https:';
  } catch {
    return false;
  }
};

/**
 * Indique si la configuration minimale est présente.
 */
export const isSupabaseConfigured = (): boolean => {
  return isValidSupabaseUrl(SUPABASE_URL) && SUPABASE_ANON_KEY.length > 20;
};

// Validation au démarrage
if (!isSupabaseConfigured()) {
  console.warn(
    '[Nexus System] Mode Hors-Ligne : Configuration Supabase manquante ou incomplète.',
    'Vérifiez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY.'
  );
}

/**
 * Client Supabase singleton.
 */
export const supabase: SupabaseClient = createClient(
  isSupabaseConfigured() ? SUPABASE_URL : 'https://placeholder.supabase.co',
  isSupabaseConfigured() ? SUPABASE_ANON_KEY : 'placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    },
    global: {
      headers: { 'x-nexus-client': 'platinum-v11-prod' },
    },
  }
);

/**
 * Test de connexion simple.
 */
export const testDatabaseConnection = async () => {
  if (!isSupabaseConfigured()) {
    return {
      success: false,
      error: "Configuration manquante : URL ou Clé API absente.",
    };
  }

  try {
    const start = performance.now();
    const { error, count } = await supabase
      .from('draw_results')
      .select('*', { count: 'exact', head: true });

    const latency = Math.round(performance.now() - start);

    if (error) {
      return {
        success: false,
        error: error.message || "Erreur d'accès à la base de données.",
        code: error.code || 'UNKNOWN',
        latency,
      };
    }

    return {
      success: true,
      count: count ?? 0,
      latency,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Erreur réseau ou CORS.",
    };
  }
};