
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
   * Basé sur les métadonnées de l'utilisateur (app_metadata) ou une liste blanche d'emails.
   */
  isAdminUser: (user: any): boolean => {
    if (!user) return false;
    
    // 1. Vérification via rôle Supabase (app_metadata) - Méthode recommandée
    if (user.app_metadata?.role === 'admin' || user.user_metadata?.role === 'admin') {
        return true;
    }
    
    // 2. Vérification par liste blanche d'emails (Hardcoded)
    // Ajoutez votre email ici pour devenir admin immédiatement
    const adminEmails = [
        'admin@lotopro.com', 
        'admin@nexus.com',
        'superadmin@example.com' 
    ]; 
    
    const isWhitelisted = user.email && adminEmails.includes(user.email);

    if (process.env.NODE_ENV === 'development') {
        if (isWhitelisted) {
            console.log("[Auth] Admin access granted via whitelist:", user.email);
        } else {
            console.debug("[Auth] User is not admin:", user.email);
        }
    }
    
    return isWhitelisted;
  }
};
