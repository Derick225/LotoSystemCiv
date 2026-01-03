import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Récupère une variable d'environnement avec stratégie de repli multiple.
 * Supporte à la fois Vite (import.meta.env) et l'injection Node (process.env) via DefinePlugin.
 */
const getViteEnv = (key: string): string => {
  // 1. Stratégie Vite Standard (import.meta.env)
  // @ts-ignore
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
    // @ts-ignore
    return String(import.meta.env[key]).trim();
  }
  
  // 2. Stratégie Polyfill (process.env injecté par vite.config.ts)
  // @ts-ignore
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    // @ts-ignore
    return String(process.env[key]).trim();
  }

  return '';
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
    // En production, HTTPS est requis. En local, HTTP peut passer si configuré, 
    // mais pour Supabase Cloud c'est toujours HTTPS.
    return u.protocol === 'https:';
  } catch {
    return false;
  }
};

/**
 * Indique si la configuration minimale est présente.
 */
export const isSupabaseConfigured = (): boolean => {
  const isValid = isValidSupabaseUrl(SUPABASE_URL) && SUPABASE_ANON_KEY.length > 20;
  if (!isValid && typeof window !== 'undefined') {
    // Log discret pour le débogage en production
    console.debug("[Supabase Config Check] Missing or invalid keys", { 
      hasUrl: !!SUPABASE_URL, 
      keyLen: SUPABASE_ANON_KEY?.length 
    });
  }
  return isValid;
};

// Validation au démarrage
if (!isSupabaseConfigured()) {
  console.warn(
    '[Nexus System] Mode Hors-Ligne : Configuration Supabase manquante ou incomplète.',
    'Vérifiez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans vos variables d\'environnement.'
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