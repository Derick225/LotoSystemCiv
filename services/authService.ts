import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  sendPasswordResetEmail, 
  updatePassword as updateFirebasePassword,
  onAuthStateChanged
} from 'firebase/auth';
import { auth, isFirebaseConfigured } from './firebaseClient';

export interface UserSession {
  user: {
    id: string;
    uid: string;
    email: string | null;
    app_metadata?: Record<string, unknown>;
    user_metadata?: Record<string, unknown>;
  };
}

export const authService = {
  /**
   * Connecte un utilisateur avec email et mot de passe via Firebase Auth.
   */
  login: async (email: string, password: string) => {
    if (!isFirebaseConfigured()) {
      return { data: null, error: new Error("Mode hors-ligne : Authentification désactivée.") };
    }
    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const user = credential.user;
      return {
        data: {
          user: {
            id: user.uid,
            uid: user.uid,
            email: user.email,
          }
        },
        error: null
      };
    } catch (error: unknown) {
      return { data: null, error: error instanceof Error ? error : new Error(String(error)) };
    }
  },

  /**
   * Inscrit un nouvel utilisateur via Firebase Auth.
   */
  signUp: async (email: string, password: string) => {
    if (!isFirebaseConfigured()) {
      return { data: null, error: new Error("Mode hors-ligne : Inscription désactivée.") };
    }
    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      const user = credential.user;
      return {
        data: {
          user: {
            id: user.uid,
            uid: user.uid,
            email: user.email,
          }
        },
        error: null
      };
    } catch (error: unknown) {
      return { data: null, error: error instanceof Error ? error : new Error(String(error)) };
    }
  },

  /**
   * Déconnecte l'utilisateur actuel.
   */
  logout: async () => {
    if (!isFirebaseConfigured()) return { error: null };
    try {
      await signOut(auth);
      return { error: null };
    } catch (error: unknown) {
      return { error: error instanceof Error ? error : new Error(String(error)) };
    }
  },

  /**
   * Récupère la session / utilisateur actuel.
   */
  getSession: async (): Promise<UserSession | null> => {
    if (!isFirebaseConfigured()) return null;
    const currentUser = auth.currentUser;
    if (!currentUser) return null;
    return {
      user: {
        id: currentUser.uid,
        uid: currentUser.uid,
        email: currentUser.email,
      }
    };
  },

  /**
   * Récupère l'utilisateur actuel.
   */
  getUser: async () => {
    if (!isFirebaseConfigured()) return null;
    const currentUser = auth.currentUser;
    if (!currentUser) return null;
    return {
      id: currentUser.uid,
      uid: currentUser.uid,
      email: currentUser.email,
    };
  },

  /**
   * Envoie un lien de réinitialisation de mot de passe à l'adresse e-mail.
   */
  resetPasswordForEmail: async (email: string) => {
    if (!isFirebaseConfigured()) {
      return { data: null, error: new Error("Mode hors-ligne : Réinitialisation désactivée.") };
    }
    try {
      await sendPasswordResetEmail(auth, email);
      return { data: true, error: null };
    } catch (error: unknown) {
      return { data: null, error: error instanceof Error ? error : new Error(String(error)) };
    }
  },

  /**
   * Met à jour le mot de passe de l'utilisateur connecté.
   */
  updatePassword: async (newPassword: string) => {
    if (!isFirebaseConfigured() || !auth.currentUser) return { data: null, error: new Error("Non connecté") };
    try {
      await updateFirebasePassword(auth.currentUser, newPassword);
      return { data: true, error: null };
    } catch (error: unknown) {
      return { data: null, error: error instanceof Error ? error : new Error(String(error)) };
    }
  },

  /**
   * Écoute les changements d'état d'authentification.
   */
  onAuthStateChange: (callback: (session: UserSession | null) => void) => {
    return onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        callback({
          user: {
            id: firebaseUser.uid,
            uid: firebaseUser.uid,
            email: firebaseUser.email,
          }
        });
      } else {
        callback(null);
      }
    });
  },

  /**
   * Vérifie si l'utilisateur a le rôle administrateur.
   */
  isAdminUser: (user: { app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown>; email?: string | null } | null): boolean => {
    if (!user) return false;
    if (user.email && (user.email.includes('admin') || user.email === 'dieudonnekeric@gmail.com')) {
      return true;
    }
    if (user.app_metadata?.role === 'admin') {
      return true;
    }
    return false;
  }
};
