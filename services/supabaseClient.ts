import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Récupère une variable d'environnement avec stratégie de repli multiple.
 * Supporte à la fois Vite (import.meta.env) et l'injection Node (process.env).
 */
const getViteEnv = (key: string): string => {
  // @ts-ignore
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
    // @ts-ignore
    return String(import.meta.env[key]).trim();
  }
  
  // @ts-ignore
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    // @ts-ignore
    return String(process.env[key]).trim();
  }

  return '';
};

// Récupération des variables avec fallbacks
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
 * Vérifie le format basique d'une clé Supabase (JWT).
 */
const isValidSupabaseKey = (key: string): boolean => {
  return key.length > 30 && (key.startsWith('ey') || key !== 'placeholder');
};

/**
 * Indique si la configuration minimale est présente et valide.
 */
export const isSupabaseConfigured = (): boolean => {
  const isValid = isValidSupabaseUrl(SUPABASE_URL) && isValidSupabaseKey(SUPABASE_ANON_KEY);
  
  if (!isValid && typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    console.debug("[Supabase Config Check] Missing or invalid keys", { 
      hasUrl: !!SUPABASE_URL, 
      keyLen: SUPABASE_ANON_KEY?.length 
    });
  }
  return isValid;
};

// Configuration Fallback Safe (Sans espace en fin d'URL pour éviter le crash URL constructor)
const SAFE_URL = isSupabaseConfigured() ? SUPABASE_URL : 'https://placeholder.supabase.co';
const SAFE_KEY = isSupabaseConfigured() ? SUPABASE_ANON_KEY : 'placeholder';

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
  SAFE_URL,
  SAFE_KEY,
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
 * Test de connexion simple et diagnostic.
 */
export const testDatabaseConnection = async () => {
  if (!isSupabaseConfigured()) {
    return {
      success: false,
      error: "Configuration manquante : URL ou Clé API absente/invalide.",
    };
  }

  try {
    const start = performance.now();
    // Requête légère HEAD pour vérifier l'accès
    const { error, count } = await supabase
      .from('draw_results')
      .select('*', { count: 'exact', head: true });

    const latency = Math.round(performance.now() - start);

    if (error) {
      console.error("[DB Test] Connection Failed:", error);
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
    console.error("[DB Test] Network Exception:", err);
    return {
      success: false,
      error: err?.message || "Erreur réseau ou CORS.",
    };
  }
};