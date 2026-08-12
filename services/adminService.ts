
import { isSupabaseConfigured } from './supabaseClient';
import { apiClient } from '../core/api/apiClient';
import { get, set } from 'idb-keyval';

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

const LOCAL_USERS_KEY = 'nexus_local_users';

const getInitialLocalUsers = (): AdminUser[] => [
    {
        id: "7efb2938-1a5c-42b7-bdc1-aa45a89fbcd0",
        email: "dieudonnekeric@gmail.com",
        last_sign_in: new Date().toISOString(),
        created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        role: "admin",
        subscription: { status: "active", plan: "premium", expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() }
    },
    {
        id: "a3b2c1d0-4e5f-6a7b-8c9d-0e1f2a3b4c5d",
        email: "visiteur_platinum_01@gold.io",
        last_sign_in: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
        created_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
        role: "user",
        subscription: { status: "active", plan: "premium", expires_at: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString() }
    },
    {
        id: "f8e7d6c5-b4a3-2f1e-0d9c-8b7a6f5e4d3c",
        email: "analyste_stochastique@maths.org",
        last_sign_in: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        role: "user",
        subscription: { status: "active", plan: "trial", expires_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString() }
    },
    {
        id: "c9b8a7d6-e5f4-3d2c-1b0a-9f8e7d6c5b4a",
        email: "user_excedant_limite@gmail.com",
        last_sign_in: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
        role: "user",
        subscription: { status: "expired", plan: "basic", expires_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() }
    }
];

const fetchLocalUsers = async (): Promise<AdminUser[]> => {
    try {
        const stored = await get<AdminUser[]>(LOCAL_USERS_KEY);
        if (stored && Array.isArray(stored)) {
            return stored;
        }
        const initial = getInitialLocalUsers();
        await set(LOCAL_USERS_KEY, initial);
        return initial;
    } catch {
        return getInitialLocalUsers();
    }
};

export const adminService = {
    fetchUsers: async (): Promise<AdminUser[]> => {
        if (!isSupabaseConfigured()) {
            return await fetchLocalUsers();
        }

        try {
            const data = await apiClient.post<{ users: AdminUser[] }>('admin-users', { action: 'list' });
            return data.users;
        } catch (error) {
            console.warn("Using local database due to network, API or permission error:", error);
            return await fetchLocalUsers();
        }
    },

    updateUserRole: async (userId: string, role: 'admin' | 'user'): Promise<boolean> => {
        if (!isSupabaseConfigured()) {
            try {
                const users = await fetchLocalUsers();
                const updated = users.map(u => u.id === userId ? { ...u, role } : u);
                await set(LOCAL_USERS_KEY, updated);
                return true;
            } catch {
                return false;
            }
        }

        try {
            const data = await apiClient.post<{ success: boolean }>('admin-users', { action: 'updateRole', userId, role });
            return data.success;
        } catch (error) {
            console.warn("Simulating roll update offline/bypass:", error);
            try {
                const users = await fetchLocalUsers();
                const updated = users.map(u => u.id === userId ? { ...u, role } : u);
                await set(LOCAL_USERS_KEY, updated);
                return true;
            } catch {
                return false;
            }
        }
    },

    deleteUser: async (userId: string): Promise<boolean> => {
        if (!isSupabaseConfigured()) {
            try {
                const users = await fetchLocalUsers();
                const updated = users.filter(u => u.id !== userId);
                await set(LOCAL_USERS_KEY, updated);
                return true;
            } catch {
                return false;
            }
        }

        try {
            const data = await apiClient.post<{ success: boolean }>('admin-users', { action: 'delete', userId });
            return data.success;
        } catch (error) {
            console.warn("Simulating deleteUser offline/bypass:", error);
            try {
                const users = await fetchLocalUsers();
                const updated = users.filter(u => u.id !== userId);
                await set(LOCAL_USERS_KEY, updated);
                return true;
            } catch {
                return false;
            }
        }
    }
};
