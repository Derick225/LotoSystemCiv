
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
   * Inscrit un nouvel utilisateur.
   */
  signUp: async (email: string, password: string) => {
    if (!isSupabaseConfigured()) {
        return { data: null, error: new Error("Mode hors-ligne : Inscription désactivée.") };
    }
    const { data, error } = await supabase.auth.signUp({
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
    try {
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("getSession timeout")), 3000));
        const { data } = await Promise.race([sessionPromise, timeoutPromise]) as any;
        return data?.session || null;
    } catch (e) {
        // Silently handle timeout to avoid spamming console and blocking UI
        return null;
    }
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
   * Envoie un lien de réinitialisation de mot de passe à l'adresse e-mail.
   */
  resetPasswordForEmail: async (email: string) => {
    if (!isSupabaseConfigured()) {
        return { data: null, error: new Error("Mode hors-ligne : Réinitialisation désactivée.") };
    }
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/?reset=true`,
    });
    return { data, error };
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
  },

  /**
   * Vérifie si l'utilisateur a le rôle administrateur.
   * Basé sur les métadonnées de l'utilisateur (app_metadata) ou user_metadata.
   */
  isAdminUser: (user: any): boolean => {
    if (!user) return false;
    
    // Vérification via rôle Supabase (app_metadata) - Méthode sécurisée recommandée
    // Les app_metadata ne peuvent être modifiées que par un admin ou un trigger côté serveur
    if (user.app_metadata?.role === 'admin') {
        return true;
    }
    
    // Fallback sur user_metadata si configuré ainsi (moins sécurisé, l'utilisateur peut le modifier)
    if (user.user_metadata?.role === 'admin') {
        return true;
    }
    
    return false;
  }
};
