
import { supabase, isSupabaseConfigured } from './supabaseClient';

export const authService = {
  /**
   * Connecte un utilisateur avec email et mot de passe via Supabase.
   */
  login: async (email: string, password: string) => {
    if (!isSupabaseConfigured()) {
        return { data: null, error: new Error("Mode hors-ligne : Authentification désactivée.") };
    }
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { data, error };
  },

  /**
   * Déconnecte l'utilisateur actuel.
   */
  logout: async () => {
    if (!isSupabaseConfigured()) return { error: null };
    const { error } = await supabase.auth.signOut();
    return { error };
  },

  /**
   * Récupère la session actuelle.
   */
  getSession: async () => {
    if (!isSupabaseConfigured()) return null;
    const { data } = await supabase.auth.getSession();
    return data.session;
  },

  /**
   * Récupère l'utilisateur actuel.
   */
  getUser: async () => {
    if (!isSupabaseConfigured()) return null;
    const { data } = await supabase.auth.getUser();
    return data.user;
  },

  /**
   * Met à jour le mot de passe de l'utilisateur connecté.
   */
  updatePassword: async (newPassword: string) => {
    if (!isSupabaseConfigured()) return { data: null, error: new Error("Mode hors-ligne") };
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword
    });
    return { data, error };
  }
};
