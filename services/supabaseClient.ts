import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Récupère une variable d'environnement avec stratégie de repli multiple.
 * Supporte à la fois Vite (import.meta.env) et l'injection Node (process.env).
 */
const getViteEnv = (key: string): string => {
  // Vérification Vite (import.meta.env)
  if (typeof import.meta !== 'undefined' && import.meta.env && (import.meta.env as any)[key]) {
    return String((import.meta.env as any)[key]);
  }
  
  // Vérification Node (process.env)
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return String(process.env[key]);
  }

  return '';
};

// Nettoyage des valeurs (suppression des guillemets accidentels et espaces)
const cleanEnv = (val: string) => val.replace(/["']/g, '').trim();

// Récupération des variables avec fallbacks
const SUPABASE_URL = cleanEnv(getViteEnv('VITE_SUPABASE_URL'));
const SUPABASE_ANON_KEY = cleanEnv(
  getViteEnv('VITE_SUPABASE_ANON_KEY') || 
  getViteEnv('VITE_SUPABASE_KEY') || 
  getViteEnv('VITE_SUPABASE_PUBLISHABLE_KEY')
);

/**
 * Vérifie que l’URL est valide (doit être une URL Supabase en HTTPS).
 */
const isValidSupabaseUrl = (url: string): boolean => {
  try {
    if (!url || url.includes('your-project-url') || url.includes('placeholder')) return false;
    const u = new URL(url);
    return u.protocol === 'https:' && (u.hostname.includes('supabase.co') || u.hostname.includes('localhost') || u.hostname.includes('127.0.0.1'));
  } catch {
    return false;
  }
};

/**
 * Vérifie le format basique d'une clé Supabase (JWT).
 */
const isValidSupabaseKey = (key: string): boolean => {
  return key && key.length > 20 && key !== 'placeholder' && !key.includes('your-anon-key');
};

/**
 * Indique si la configuration minimale est présente et valide.
 */
export const isSupabaseConfigured = (): boolean => {
  const urlValid = isValidSupabaseUrl(SUPABASE_URL);
  const keyValid = isValidSupabaseKey(SUPABASE_ANON_KEY);
  
  if (!urlValid || !keyValid) {
      if (process.env.NODE_ENV === 'development') {
          console.debug("[Nexus Config] Supabase non configuré ou clés invalides.", { url: SUPABASE_URL, keyLength: SUPABASE_ANON_KEY?.length });
      }
      return false;
  }
  return true;
};

// Configuration Fallback Safe
const SAFE_URL = isSupabaseConfigured() ? SUPABASE_URL : 'https://placeholder.supabase.co';
const SAFE_KEY = isSupabaseConfigured() ? SUPABASE_ANON_KEY : 'placeholder';

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
      error: "Configuration manquante. Avez-vous mis à jour le fichier .env avec les clés du nouveau projet ?",
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
      // Détection spécifique des erreurs courantes
      if (error.code === '42P01') return { success: false, error: "La table 'draw_results' n'existe pas. Veuillez exécuter le script SQL dans Supabase.", code: error.code };
      if (error.code === '28P01' || error.code === '42501') return { success: false, error: "Connexion refusée. Vérifiez vos clés API ou les politiques RLS.", code: error.code };
      if (error.message.includes('fetch')) return { success: false, error: "Impossible de joindre Supabase. Vérifiez l'URL du projet.", code: 'NETWORK_ERROR' };
      
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
      error: err?.message || "Erreur réseau (CORS ou DNS).",
    };
  }
};