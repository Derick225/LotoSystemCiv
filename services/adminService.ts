
import { supabase, isSupabaseConfigured } from './supabaseClient';

export interface AdminUser {
    id: string;
    email: string;
    last_sign_in: string;
    created_at: string;
    role: 'admin' | 'user';
    subscription: {
        status: string;
        plan: string;
        expires_at: string;
    } | null;
}

const getAuthHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
        throw new Error("Session expirée ou invalide. Veuillez vous reconnecter.");
    }
    return { Authorization: `Bearer ${session.access_token}` };
};

export const adminService = {
    /**
     * Récupère la liste complète des utilisateurs via Edge Function
     */
    fetchUsers: async (): Promise<AdminUser[]> => {
        if (!isSupabaseConfigured()) return [];

        const headers = await getAuthHeaders();
        const { data, error } = await supabase.functions.invoke('admin-users', {
            body: { action: 'list' },
            headers
        });

        if (error) throw new Error(error.message);
        return data.users;
    },

    /**
     * Met à jour le rôle d'un utilisateur (Admin/User)
     */
    updateUserRole: async (userId: string, role: 'admin' | 'user'): Promise<boolean> => {
        if (!isSupabaseConfigured()) return false;

        const headers = await getAuthHeaders();
        const { data, error } = await supabase.functions.invoke('admin-users', {
            body: { action: 'updateRole', userId, role },
            headers
        });

        if (error) throw new Error(error.message);
        return data.success;
    },

    /**
     * Supprime un utilisateur définitivement
     */
    deleteUser: async (userId: string): Promise<boolean> => {
        if (!isSupabaseConfigured()) return false;

        const headers = await getAuthHeaders();
        const { data, error } = await supabase.functions.invoke('admin-users', {
            body: { action: 'delete', userId },
            headers
        });

        if (error) throw new Error(error.message);
        return data.success;
    }
};
