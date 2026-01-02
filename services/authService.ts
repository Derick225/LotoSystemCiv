
import { supabase } from './supabaseClient';

export const authService = {
  /**
   * Connecte un utilisateur avec email et mot de passe via Supabase.
   */
  login: async (email: string, password: string) => {
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
    const { error } = await supabase.auth.signOut();
    return { error };
  },

  /**
   * Récupère la session actuelle.
   */
  getSession: async () => {
    const { data } = await supabase.auth.getSession();
    return data.session;
  },

  /**
   * Récupère l'utilisateur actuel.
   */
  getUser: async () => {
    const { data } = await supabase.auth.getUser();
    return data.user;
  },

  /**
   * Met à jour le mot de passe de l'utilisateur connecté.
   */
  updatePassword: async (newPassword: string) => {
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword
    });
    return { data, error };
  }
};
