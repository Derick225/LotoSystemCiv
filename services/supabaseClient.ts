
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const getViteEnv = (key: string): string => {
  if (typeof import.meta !== 'undefined' && import.meta.env && (import.meta.env as any)[key]) {
    return String((import.meta.env as any)[key]);
  }
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return String(process.env[key]);
  }
  return '';
};

const cleanEnv = (val: string) => val.replace(/["']/g, '').trim();

const SUPABASE_URL = cleanEnv(getViteEnv('VITE_SUPABASE_URL'));
const SUPABASE_ANON_KEY = cleanEnv(
  getViteEnv('VITE_SUPABASE_ANON_KEY') || 
  getViteEnv('VITE_SUPABASE_KEY') || 
  getViteEnv('VITE_SUPABASE_PUBLISHABLE_KEY')
);

const isValidSupabaseUrl = (url: string): boolean => {
  try {
    if (!url || url.includes('your-project-url') || url.includes('placeholder')) return false;
    const u = new URL(url);
    return u.protocol === 'https:' && (u.hostname.includes('supabase.co') || u.hostname.includes('localhost'));
  } catch { return false; }
};

const isValidSupabaseKey = (key: string): boolean => {
  return key && key.length > 20 && key !== 'placeholder';
};

export const isSupabaseConfigured = (): boolean => {
  return isValidSupabaseUrl(SUPABASE_URL) && isValidSupabaseKey(SUPABASE_ANON_KEY);
};

export const getSupabaseConfigDiagnostics = () => {
  const urlValid = isValidSupabaseUrl(SUPABASE_URL);
  const keyValid = isValidSupabaseKey(SUPABASE_ANON_KEY);
  return {
    isConfigured: urlValid && keyValid,
    url: { valid: urlValid, value: SUPABASE_URL ? `${SUPABASE_URL.substring(0, 15)}...` : '(Vide)', error: !SUPABASE_URL ? "URL Manquante" : !urlValid ? "Format URL Invalide" : null },
    key: { valid: keyValid, value: SUPABASE_ANON_KEY ? `${SUPABASE_ANON_KEY.substring(0, 5)}...` : '(Vide)', error: !SUPABASE_ANON_KEY ? "Clé Manquante" : !keyValid ? "Clé Invalide" : null }
  };
};

const SAFE_URL = isSupabaseConfigured() ? SUPABASE_URL : 'https://placeholder.supabase.co';
const SAFE_KEY = isSupabaseConfigured() ? SUPABASE_ANON_KEY : 'placeholder';

export const supabase: SupabaseClient = createClient(SAFE_URL, SAFE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: typeof window !== 'undefined' ? window.localStorage : undefined },
    global: { 
        headers: { 'x-nexus-client': 'platinum-v12-prod' },
        fetch: (url, options) => {
            return fetch(url, { ...options, signal: AbortSignal.timeout(15000) }); // Global Timeout 15s
        }
    },
});

export const testDatabaseConnection = async () => {
  if (!isSupabaseConfigured()) return { success: false, error: "Configuration manquante." };
  try {
    const start = performance.now();
    const { error, count } = await supabase.from('draw_results').select('*', { count: 'exact', head: true });
    const latency = Math.round(performance.now() - start);
    if (error) {
      if (error.code === '42P01') return { success: false, error: "Table 'draw_results' inexistante. Exécutez le script SQL.", code: error.code };
      return { success: false, error: error.message, code: error.code || 'UNKNOWN', latency };
    }
    return { success: true, count: count ?? 0, latency };
  } catch (err: any) {
    return { success: false, error: err?.message || "Erreur réseau (Timeout ou DNS)." };
  }
};
