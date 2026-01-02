import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Récupère une variable d'environnement Vite.
 * ⚠️ Dans Vite, seules les variables commençant par `VITE_` sont exposées via `import.meta.env`.
 */
const getViteEnv = (key: string): string => {
  const value = import.meta.env[key];
  return typeof value === 'string' ? value.trim() : '';
};

// Récupération directe (pas de fallback ni de "VITE_PUBLIC_" redondant)
const SUPABASE_URL = getViteEnv('VITE_SUPABASE_URL');
const SUPABASE_ANON_KEY = getViteEnv('VITE_SUPABASE_ANON_KEY');

/**
 * Vérifie que l’URL est valide (doit être une URL Supabase en HTTPS).
 */
const isValidSupabaseUrl = (url: string): boolean => {
  try {
    const u = new URL(url);
    return (
      u.protocol === 'https:' &&
      (u.hostname.endsWith('.supabase.co') || u.hostname.endsWith('.supabase.com'))
    );
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

// Validation stricte au démarrage
if (!isSupabaseConfigured()) {
  console.error(
    '[Nexus System] ❌ Configuration Supabase manquante ou invalide.',
    '\nAssurez-vous que VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY sont définies dans .env.local et sur Vercel.',
    '\nDocumentation : https://supabase.com/docs/guides/getting-started/tutorials/with-vite'
  );
}

/**
 * Client Supabase singleton.
 * ⚠️ Si la config est manquante, on lance quand même le client avec des valeurs vides,
 * mais toute requête échouera clairement (pas de fallback silencieux).
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
 * Test de connexion : effectue une requête HEAD légère sur une table existante.
 * ⚠️ À n’utiliser qu’en dev/debug – pas en production courante.
 */
export const testDatabaseConnection = async () => {
  if (!isSupabaseConfigured()) {
    return {
      success: false,
      error: "Configuration manquante : VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY absentes.",
    };
  }

  try {
    const start = performance.now();
    const { error, count } = await supabase
      .from('draw_results')
      .select('*', { count: 'exact', head: true });

    const latency = Math.round(performance.now() - start);

    if (error) {
      let userMessage = "Erreur inconnue lors de la connexion à la base de données.";
      if (error.code === '42P01') {
        userMessage = "Table 'draw_results' introuvable. Créez-la dans Supabase ou mettez à jour le nom.";
      } else if (error.code === '42501') {
        userMessage = "Accès refusé. Vérifiez les RLS (Row Level Security) dans Supabase.";
      } else if (error.message) {
        userMessage = error.message;
      }

      return {
        success: false,
        error: userMessage,
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
      error: err?.message || "Erreur réseau ou CORS. Vérifiez l’URL et les règles CORS dans Supabase.",
    };
  }
};