
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { apiClient } from '../core/api/apiClient';

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

export const adminService = {
    fetchUsers: async (): Promise<AdminUser[]> => {
        if (!isSupabaseConfigured()) return [];

        const data = await apiClient.post<{ users: AdminUser[] }>('admin-users', { action: 'list' });
        return data.users;
    },

    updateUserRole: async (userId: string, role: 'admin' | 'user'): Promise<boolean> => {
        if (!isSupabaseConfigured()) return false;

        const data = await apiClient.post<{ success: boolean }>('admin-users', { action: 'updateRole', userId, role });
        return data.success;
    },

    deleteUser: async (userId: string): Promise<boolean> => {
        if (!isSupabaseConfigured()) return false;

        const data = await apiClient.post<{ success: boolean }>('admin-users', { action: 'delete', userId });
        return data.success;
    }
};
