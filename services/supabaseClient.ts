
import { createClient } from '@supabase/supabase-js';

/**
 * NEXUS PLATINUM - Configuration Client Supabase
 * Gestion agnostique de l'environnement avec logs de débogage.
 */
const getEnvVar = (key: string): string => {
  try {
    // 1. Vite Environment (Standard moderne)
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
      return import.meta.env[key];
    }
    // 2. Process Environment (Polyfill Vite ou Node)
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
      return process.env[key];
    }
  } catch (e) {
    console.warn(`[Nexus Config] Erreur lecture var ${key}`, e);
  }
  return '';
};

const envUrl = getEnvVar('VITE_SUPABASE_URL');
const envKey = getEnvVar('VITE_SUPABASE_ANON_KEY');

const isValidUrl = (url: string) => {
    try { return new URL(url).protocol.startsWith('http'); } catch { return false; }
};

export const isSupabaseConfigured = () => {
    const hasUrl = !!envUrl && isValidUrl(envUrl) && !envUrl.includes('placeholder');
    const hasKey = !!envKey && envKey !== 'placeholder';
    
    if (!hasUrl || !hasKey) {
        // Log discret en développement pour aider à la configuration
        if (import.meta.env.DEV) {
            console.groupCollapsed("[Nexus Config] Supabase non connecté");
            console.log("VITE_SUPABASE_URL:", hasUrl ? "OK" : "MANQUANT/INVALIDE");
            console.log("VITE_SUPABASE_ANON_KEY:", hasKey ? "OK" : "MANQUANT");
            console.log("Veuillez créer un fichier .env à la racine avec ces variables.");
            console.groupEnd();
        }
        return false;
    }
    return true;
};

// Initialisation du client avec Fallback "Safe Mode" pour éviter le crash au démarrage si config absente
const clientUrl = isSupabaseConfigured() ? envUrl : 'https://placeholder.supabase.co';
const clientKey = isSupabaseConfigured() ? envKey : 'placeholder';

export const supabase = createClient(clientUrl, clientKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: typeof window !== 'undefined' ? window.localStorage : undefined
    },
    db: {
      schema: 'public',
    },
    global: {
      headers: { 'x-nexus-version': '11.0.5-platinum' }
    }
});

/**
 * Diagnostic de connexion à la base de données.
 */
export const testDatabaseConnection = async () => {
    if (!isSupabaseConfigured()) {
        return { success: false, error: "Variables d'environnement Supabase manquantes dans le fichier .env (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)." };
    }
    try {
        // Ping léger sur la table principale (HEAD request)
        const { error, count } = await supabase
            .from('draw_results')
            .select('*', { count: 'exact', head: true });

        if (error) {
            console.error("[Supabase Diagnostic]", error);
            if (error.code === '42P01') return { success: false, error: "Table 'draw_results' inexistante. Veuillez exécuter le script SQL dans 'Système > Infrastructure'." };
            if (error.code === '42501') return { success: false, error: "Accès refusé (RLS). Vérifiez les politiques de sécurité dans le script SQL." };
            if (error.code === 'PGRST301') return { success: false, error: "Erreur REST. Vérifiez que l'API est active dans le dashboard Supabase." };
            return { success: false, error: error.message };
        }
        
        return { success: true, count };
    } catch (e: any) {
        return { success: false, error: e.message || "Erreur réseau inconnue. Vérifiez votre connexion internet." };
    }
};
