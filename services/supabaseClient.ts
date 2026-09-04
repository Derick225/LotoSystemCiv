
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const getViteEnv = (key: string): string => {
  if (typeof import.meta !== 'undefined' && import.meta.env && (import.meta.env as Record<string, string>)[key]) {
    return String((import.meta.env as Record<string, string>)[key]);
  }
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return String(process.env[key]);
  }
  return '';
};

const cleanEnv = (val: string) => val ? val.replace(/["']/g, '').trim() : '';

export const SUPABASE_URL = cleanEnv(getViteEnv('VITE_SUPABASE_URL'));
export const SUPABASE_ANON_KEY = cleanEnv(
  getViteEnv('VITE_SUPABASE_ANON_KEY') || 
  getViteEnv('VITE_SUPABASE_KEY') || 
  getViteEnv('VITE_SUPABASE_PUBLISHABLE_KEY')
);

const isValidSupabaseUrl = (url: string): boolean => {
  try {
    if (!url || url.includes('your-project-url') || url.includes('placeholder') || url.includes('your-project-ref') || url.includes('votre-projet')) return false;
    const u = new URL(url);
    return u.protocol === 'https:' && (u.hostname.includes('supabase.co') || u.hostname.includes('localhost') || u.hostname.includes('127.0.0.1'));
  } catch { return false; }
};

const isValidSupabaseKey = (key: string): boolean => {
  return Boolean(key && key.length > 20 && key !== 'placeholder');
};

export const isSupabaseConfigured = (): boolean => {
  const urlValid = isValidSupabaseUrl(SUPABASE_URL);
  const keyValid = isValidSupabaseKey(SUPABASE_ANON_KEY);
  return urlValid && keyValid;
};

export const getSupabaseConfigDiagnostics = () => {
  const urlValid = isValidSupabaseUrl(SUPABASE_URL);
  const keyValid = isValidSupabaseKey(SUPABASE_ANON_KEY);
  if (urlValid && keyValid) {
    return {
      isConfigured: true,
      url: { valid: true, value: `${SUPABASE_URL.substring(0, 15)}...`, error: null },
      key: { valid: true, value: "Clé Anon Valide", error: null }
    };
  }
  return {
    isConfigured: false,
    url: { valid: false, value: "Local Storage Engine", error: "Configuration absente (mode local autonome)" },
    key: { valid: false, value: "Secure Offline Mode", error: "Pas de clé Supabase renseignée" }
  };
};

// Initialisation sécurisée
const createSafeClient = (): SupabaseClient => {
    if (isSupabaseConfigured()) {
        return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: { 
                persistSession: true, 
                autoRefreshToken: true, 
                detectSessionInUrl: true, 
                storage: typeof window !== 'undefined' ? window.localStorage : undefined,
                // Désactivation du verrouillage Navigator LockManager pour éviter les timeouts dans l'iframe
                lock: async <R>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> => {
                    return await fn();
                },
            },
            global: { headers: {} },
        });
    } else {
        console.warn("Supabase non configuré correctement. Mode hors-ligne strict activé.");
        
        // Au lieu de retourner un mock en "any" qui cache les erreurs silencieusement, 
        // on lève une erreur formelle si on tente de l'utiliser.
        const throwNotConfigured = () => {
            throw new Error("Service Supabase non configuré. Assurez-vous que les variables d'environnement sont définies.");
        };

        const failingProxy = new Proxy({}, {
            get: (_target, prop) => {
                if (prop === 'auth') {
                     return {
                        getSession: async () => ({ data: { session: null }, error: null }),
                        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
                        getUser: async () => ({ data: { user: null }, error: null }),
                        signInWithPassword: async () => ({ data: null, error: { message: "No config" } }),
                        signOut: async () => ({ error: null }),
                     };
                }
                if (prop === 'then' || prop === 'catch' || prop === 'finally') return undefined;
                return throwNotConfigured;
            }
        });
        
        return failingProxy as unknown as SupabaseClient;
    }
};

export const supabase = createSafeClient();

export interface DatabaseConnectionResult {
  success: boolean;
  count?: number;
  latency?: number;
  error?: string;
  code?: string;
}

// Cache mémoire pour le test de connexion afin d'éviter le martèlement de Supabase
let cachedConnResult: { result: DatabaseConnectionResult; timestamp: number } | null = null;
const CONN_CACHE_TTL = 3 * 60 * 1000; // 3 minutes

export const testDatabaseConnection = async (force?: boolean): Promise<DatabaseConnectionResult> => {
  if (!isSupabaseConfigured()) return { success: false, error: "Configuration manquante (.env)" };

  const now = Date.now();
  if (!force && cachedConnResult && (now - cachedConnResult.timestamp < CONN_CACHE_TTL)) {
    return cachedConnResult.result;
  }

  try {
    const start = performance.now();
    // Projection 'id' avec 'head: true' pour minimiser la consommation Egress
    const { error, count } = await supabase.from('draw_results').select('id', { count: 'exact', head: true });
    const latency = Math.round(performance.now() - start);
    if (error) {
      const errorMsg = error instanceof Error ? error.message : (typeof error === 'object' && error !== null && 'message' in error ? String((error as { message: unknown }).message) : String(error));
      const lowerMsg = errorMsg.toLowerCase();

      if (error.code === '42P01') return { success: false, error: "Table 'draw_results' inexistante. Exécutez le script SQL.", code: error.code };
      if (lowerMsg.includes('fetch') || lowerMsg.includes('network') || lowerMsg.includes('connection') || lowerMsg.includes('contact')) {
        return { success: false, error: "Erreur réseau. Vérifiez votre connexion.", code: 'NETWORK' };
      }
      const failureRes = { success: false, error: errorMsg, code: error.code || 'UNKNOWN', latency };
      cachedConnResult = { result: failureRes, timestamp: now };
      return failureRes;
    }
    const successRes = { success: true, count: count ?? 0, latency };
    cachedConnResult = { result: successRes, timestamp: now };
    return successRes;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const lowerMsg = errorMsg.toLowerCase();
    if (lowerMsg.includes('fetch') || lowerMsg.includes('network') || lowerMsg.includes('connection') || lowerMsg.includes('contact')) {
      return { success: false, error: "Erreur réseau. Vérifiez votre connexion.", code: 'NETWORK' };
    }
    const errRes = { success: false, error: errorMsg || "Erreur critique de connexion." };
    cachedConnResult = { result: errRes, timestamp: now };
    return errRes;
  }
};
