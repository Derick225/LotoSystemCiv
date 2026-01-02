
import { createClient } from '@supabase/supabase-js';

/**
 * NEXUS PLATINUM - Supabase Client Configuration
 * Detects environment variables from Vite (import.meta.env) or Process (process.env)
 */
const getEnvVar = (key: string): string => {
  try {
    // Attempt Vite-style access
    if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
      const val = (import.meta as any).env[key];
      if (val) return val;
    }
    // Attempt process.env access (defined in vite.config.ts)
    if (typeof process !== 'undefined' && process.env) {
      const val = process.env[key];
      if (val) return val;
    }
  } catch (e) {
    console.warn(`[Nexus Config] Failed to read ${key}:`, e);
  }
  return '';
};

const envUrl = getEnvVar('VITE_SUPABASE_URL');
const envKey = getEnvVar('VITE_SUPABASE_ANON_KEY');

export const isSupabaseConfigured = () => {
    return !!envUrl && envUrl !== 'https://placeholder.supabase.co' && !!envKey;
};

if (!isSupabaseConfigured()) {
    console.error("🚨 NEXUS CRITICAL: Supabase environment variables are missing! Check your .env file and ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set.");
}

// Fallback to placeholder only to prevent total JS crash, but isSupabaseConfigured will return false
const clientUrl = envUrl || 'https://placeholder.supabase.co';
const clientKey = envKey || 'placeholder-key';

export const supabase = createClient(clientUrl, clientKey);
