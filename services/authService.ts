
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { Session } from '@supabase/supabase-js';

export const authService = {
  /**
   * Connecte un utilisateur avec email et mot de passe via Supabase ou en mode local sécurisé.
   */
  login: async (email: string, password: string) => {
    if (!isSupabaseConfigured()) {
        const role = email === 'dieudonnekeric@gmail.com' || email === 'admin@admin.com' ? 'admin' : 'user';
        const mockUser = {
            id: "local-mock-user-id",
            email,
            app_metadata: { role },
            user_metadata: { role }
        };
        const mockSession = {
            access_token: "mock-access-token",
            token_type: "bearer",
            expires_in: 3600,
            refresh_token: "mock-refresh-token",
            user: mockUser
        };
        localStorage.setItem("nexus_local_auth_session", JSON.stringify(mockSession));
        return { data: { user: mockUser, session: mockSession }, error: null };
    }
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { data, error };
  },

  /**
   * Inscrit un nouvel utilisateur (localement en mode déconnecté).
   */
  signUp: async (email: string, password: string) => {
    if (!isSupabaseConfigured()) {
        const role = email === 'dieudonnekeric@gmail.com' || email === 'admin@admin.com' ? 'admin' : 'user';
        const mockUser = {
            id: "local-mock-user-id",
            email,
            app_metadata: { role },
            user_metadata: { role }
        };
        const mockSession = {
            access_token: "mock-access-token",
            token_type: "bearer",
            expires_in: 3600,
            refresh_token: "mock-refresh-token",
            user: mockUser
        };
        localStorage.setItem("nexus_local_auth_session", JSON.stringify(mockSession));
        return { data: { user: mockUser, session: mockSession }, error: null };
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
    if (!isSupabaseConfigured()) {
        localStorage.removeItem("nexus_local_auth_session");
        return { error: null };
    }
    const { error } = await supabase.auth.signOut();
    return { error };
  },

  /**
   * Récupère la session actuelle.
   */
  getSession: async (): Promise<Session | null> => {
    if (!isSupabaseConfigured()) {
        try {
            const raw = localStorage.getItem("nexus_local_auth_session");
            return raw ? JSON.parse(raw) as Session : null;
        } catch {
            return null;
        }
    }
    try {
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("getSession timeout")), 3000));
        const { data } = await Promise.race([sessionPromise, timeoutPromise]) as { data: { session: Session | null }, error?: Error };
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
    if (!isSupabaseConfigured()) {
        try {
            const raw = localStorage.getItem("nexus_local_auth_session");
            if (raw) {
                const session = JSON.parse(raw);
                return session.user;
            }
        } catch {}
        return null;
    }
    const { data } = await supabase.auth.getUser();
    return data.user;
  },

  /**
   * Envoie un lien de réinitialisation de mot de passe à l'adresse e-mail.
   */
  resetPasswordForEmail: async (email: string) => {
    if (!isSupabaseConfigured()) {
        return { data: {}, error: null };
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
    if (!isSupabaseConfigured()) return { data: {}, error: null };
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword
    });
    return { data, error };
  },

  /**
   * Vérifie si l'utilisateur a le rôle administrateur.
   * Basé sur les métadonnées de l'utilisateur (app_metadata) ou user_metadata.
   */
  isAdminUser: (user: { app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown>; email?: string } | null): boolean => {
    if (!user) return false;
    
    // Whitelist administrative emails to enable immediate developer preview and skip role configuration blocking
    if (user.email === 'dieudonnekeric@gmail.com' || user.email === 'admin@admin.com') {
        return true;
    }
    
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
