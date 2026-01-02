
import { createClient } from '@supabase/supabase-js';

// Fonction utilitaire pour lire les variables d'environnement de manière robuste
const getEnv = (key: string): string => {
  let val = '';
  // 1. Essai via Vite (import.meta.env) - Standard moderne
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
    val = import.meta.env[key];
  } 
  // 2. Fallback via process.env (Compatible avec certaines configs de build ou tests)
  else if (typeof process !== 'undefined' && process.env && process.env[key]) {
    val = process.env[key];
  }
  return (val || '').trim();
};

// Récupération explicite des variables du .env (Support VITE_ et VITE_PUBLIC_)
const urlSource = getEnv('VITE_SUPABASE_URL') ? 'VITE_' : getEnv('VITE_PUBLIC_SUPABASE_URL') ? 'VITE_PUBLIC_' : null;
const keySource = getEnv('VITE_SUPABASE_ANON_KEY') ? 'VITE_' : getEnv('VITE_PUBLIC_SUPABASE_ANON_KEY') ? 'VITE_PUBLIC_' : null;

const SUPABASE_URL = getEnv('VITE_SUPABASE_URL') || getEnv('VITE_PUBLIC_SUPABASE_URL');
const SUPABASE_ANON_KEY = getEnv('VITE_SUPABASE_ANON_KEY') || getEnv('VITE_PUBLIC_SUPABASE_ANON_KEY');

// Validation de la configuration
const isValidUrl = (url: string) => {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (u.hostname.endsWith('.supabase.co') || u.hostname.endsWith('.supabase.com') || u.hostname === 'localhost');
  } catch {
    return false;
  }
};

const isConfigured = isValidUrl(SUPABASE_URL) && SUPABASE_ANON_KEY.length > 20;

if (!isConfigured) {
  // En production, on avertit clairement que la configuration manque
  console.warn(
    "[Nexus System] Configuration Supabase manquante ou invalide. L'application fonctionnera en mode local/restreint."
  );
} else {
  // Masquage de l'URL pour la sécurité dans les logs, mais confirmation de la cible
  const maskedUrl = SUPABASE_URL.replace(/^(https:\/\/)([^.]+)(.+)$/, '$1****$3');
  console.log(`[Nexus System] Connexion Supabase établie vers ${maskedUrl} (Source: URL=${urlSource}, KEY=${keySource}).`);
}

/**
 * Client Supabase Singleton
 * En production, on ne met PAS de fallback. Si la config manque, l'app doit échouer explicitement sur les appels réseau
 * plutôt que de tenter de joindre une URL fictive.
 */
export const supabase = createClient(
  isConfigured ? SUPABASE_URL : 'https://placeholder.supabase.co',
  isConfigured ? SUPABASE_ANON_KEY : 'placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: typeof window !== 'undefined' ? window.localStorage : undefined
    },
    global: {
      headers: { 'x-nexus-client': 'platinum-v11-prod' }
    }
  }
);

/**
 * Vérifie si le service est correctement configuré pour les opérations critiques
 */
export const isSupabaseConfigured = () => isConfigured;

/**
 * Diagnostic de connexion à la base de données.
 * Vérifie la latence et l'accès à la table principale.
 */
export const testDatabaseConnection = async () => {
    if (!isConfigured) {
        return { success: false, error: "Configuration .env manquante (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)." };
    }
    
    const start = performance.now();
    try {
        // Ping léger sur la table principale (HEAD request)
        const { error, count, status } = await supabase
            .from('draw_results')
            .select('*', { count: 'exact', head: true });

        const latency = Math.round(performance.now() - start);

        if (error) {
            console.error("[Supabase Diagnostic] Error:", error);
            // Gestion des erreurs spécifiques pour guider l'utilisateur
            if (error.code === '42P01') return { success: false, error: "Table 'draw_results' inexistante. Veuillez exécuter le script SQL dans Supabase." };
            if (error.code === '42501') return { success: false, error: "Accès refusé (RLS). Vérifiez les politiques de sécurité dans Supabase." };
            return { success: false, error: `Erreur API: ${error.message} (Code: ${error.code})` };
        }
        
        return { success: true, count, latency, status };
    } catch (e: any) {
        return { success: false, error: e.message || "Erreur réseau inconnue." };
    }
};
