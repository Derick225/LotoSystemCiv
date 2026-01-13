
import { supabase } from './supabaseClient';

/**
 * Wrapper pour appeler les Edge Functions Supabase.
 * Utilise le client natif supabase.functions.invoke.
 */
export const invokeEdgeFunction = async (functionName: string, options: { body?: any; headers?: any } = {}) => {
  try {
    const { data, error } = await supabase.functions.invoke(functionName, {
      body: options.body,
      headers: options.headers
    });

    return { data, error };
  } catch (e: any) {
    console.error(`Edge Function ${functionName} failed:`, e);
    return { data: null, error: e };
  }
};
