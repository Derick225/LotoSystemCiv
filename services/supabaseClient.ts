
import { createClient } from '@supabase/supabase-js';

/**
 * NEXUS PLATINUM - Configuration Client Supabase
 * Gestion agnostique de l'environnement (Vite vs Next vs Standard)
 */
const getEnvVar = (key: string): string => {
  try {
    // 1. Vite Environment
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
      return import.meta.env[key];
    }
    // 2. Process Environment (Node/Legacy)
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
    return !!envUrl && 
           !!envKey && 
           isValidUrl(envUrl) &&
           !envUrl.includes('placeholder');
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
        return { success: false, error: "Variables d'environnement Supabase manquantes (VITE_SUPABASE_URL / ANON_KEY)." };
    }
    try {
        // Ping léger sur la table principale (HEAD request)
        const { error, count } = await supabase
            .from('draw_results')
            .select('*', { count: 'exact', head: true });

        if (error) {
            console.error("[Supabase Diagnostic]", error);
            if (error.code === '42P01') return { success: false, error: "Table 'draw_results' inexistante. Veuillez exécuter le script SQL d'initialisation." };
            if (error.code === '42501') return { success: false, error: "Accès refusé (RLS). Vérifiez les politiques de sécurité." };
            return { success: false, error: error.message };
        }
        
        return { success: true, count };
    } catch (e: any) {
        return { success: false, error: e.message || "Erreur réseau inconnue." };
    }
};
