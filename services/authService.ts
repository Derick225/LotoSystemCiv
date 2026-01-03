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
  },

  /**
   * Vérifie si l'utilisateur a le rôle administrateur.
   * Basé sur les métadonnées de l'utilisateur ou une liste blanche simple pour la démo.
   */
  isAdminUser: (user: any): boolean => {
    if (!user) return false;
    // Vérification via app_metadata (rôle Supabase)
    if (user.app_metadata?.role === 'admin') return true;
    
    // Fallback : Vérification simple par email (à adapter selon vos besoins)
    const adminEmails = ['admin@lotopro.com', 'admin@nexus.com']; 
    if (user.email && adminEmails.includes(user.email)) return true;
    
    // Pour les besoins de développement, si on est en localhost et qu'aucun email n'est fourni, on peut être permissif
    // Mais pour la prod, on garde la logique stricte.
    return false;
  }
};