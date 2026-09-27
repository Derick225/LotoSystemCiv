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

export interface UserMetrics {
    totalUsers: number;
    adminCount: number;
    userCount: number;
    activeSubscribers: number;
    trialUsers: number;
    expiredSubscribers: number;
    activeRate: number; // percentage [0, 100]
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

const saveLocalUsers = async (users: AdminUser[]): Promise<void> => {
    await set(LOCAL_USERS_KEY, users);
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

    createUser: async (params: {
        email: string;
        role: 'admin' | 'user';
        plan?: string;
        durationDays?: number;
    }): Promise<AdminUser> => {
        let seedHash = 0;
        const seedStr = `${params.email}::${params.role}::${Date.now()}`;
        for (let i = 0; i < seedStr.length; i++) {
            seedHash = (seedHash << 5) - seedHash + seedStr.charCodeAt(i);
            seedHash |= 0;
        }
        const newId = `user_${Date.now()}_${Math.abs(seedHash).toString(16).padStart(8, '0')}`;
        const plan = params.plan || 'basic';
        const duration = params.durationDays && params.durationDays > 0 ? params.durationDays : 30;
        const expiresAt = new Date(Date.now() + duration * 24 * 60 * 60 * 1000).toISOString();

        const newUser: AdminUser = {
            id: newId,
            email: params.email.trim().toLowerCase(),
            last_sign_in: new Date().toISOString(),
            created_at: new Date().toISOString(),
            role: params.role,
            subscription: {
                status: 'active',
                plan,
                expires_at: expiresAt
            }
        };

        if (!isSupabaseConfigured()) {
            const users = await fetchLocalUsers();
            const updated = [newUser, ...users];
            await saveLocalUsers(updated);
            return newUser;
        }

        try {
            const data = await apiClient.post<{ success: boolean; user?: AdminUser }>('admin-users', {
                action: 'create',
                email: newUser.email,
                role: newUser.role,
                subscription: newUser.subscription
            });
            if (data.user) return data.user;
            return newUser;
        } catch (error) {
            console.warn("Falling back to local user creation:", error);
            const users = await fetchLocalUsers();
            const updated = [newUser, ...users];
            await saveLocalUsers(updated);
            return newUser;
        }
    },

    updateUserRole: async (userId: string, role: 'admin' | 'user'): Promise<boolean> => {
        if (!isSupabaseConfigured()) {
            try {
                const users = await fetchLocalUsers();
                const updated = users.map(u => u.id === userId ? { ...u, role } : u);
                await saveLocalUsers(updated);
                return true;
            } catch {
                return false;
            }
        }

        try {
            const data = await apiClient.post<{ success: boolean }>('admin-users', { action: 'updateRole', userId, role });
            return data.success;
        } catch (error) {
            console.warn("Simulating role update offline/bypass:", error);
            try {
                const users = await fetchLocalUsers();
                const updated = users.map(u => u.id === userId ? { ...u, role } : u);
                await saveLocalUsers(updated);
                return true;
            } catch {
                return false;
            }
        }
    },

    updateUserSubscription: async (
        userId: string,
        subscription: { status: string; plan: string; expires_at: string }
    ): Promise<boolean> => {
        if (!isSupabaseConfigured()) {
            try {
                const users = await fetchLocalUsers();
                const updated = users.map(u => u.id === userId ? { ...u, subscription } : u);
                await saveLocalUsers(updated);
                return true;
            } catch {
                return false;
            }
        }

        try {
            const data = await apiClient.post<{ success: boolean }>('admin-users', {
                action: 'updateSubscription',
                userId,
                subscription
            });
            return data.success;
        } catch (error) {
            console.warn("Falling back to local subscription update:", error);
            try {
                const users = await fetchLocalUsers();
                const updated = users.map(u => u.id === userId ? { ...u, subscription } : u);
                await saveLocalUsers(updated);
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
                await saveLocalUsers(updated);
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
                await saveLocalUsers(updated);
                return true;
            } catch {
                return false;
            }
        }
    },

    getUserMetrics: (users: AdminUser[]): UserMetrics => {
        const total = users.length;
        if (total === 0) {
            return {
                totalUsers: 0,
                adminCount: 0,
                userCount: 0,
                activeSubscribers: 0,
                trialUsers: 0,
                expiredSubscribers: 0,
                activeRate: 0
            };
        }

        let adminCount = 0;
        let activeSubscribers = 0;
        let trialUsers = 0;
        let expiredSubscribers = 0;
        const now = Date.now();

        for (const u of users) {
            if (u.role === 'admin') adminCount++;
            if (u.subscription) {
                const isNotExpired = new Date(u.subscription.expires_at).getTime() > now;
                if (u.subscription.status === 'active' && isNotExpired) {
                    activeSubscribers++;
                } else if (u.subscription.status === 'trial' && isNotExpired) {
                    trialUsers++;
                } else {
                    expiredSubscribers++;
                }
            } else {
                expiredSubscribers++;
            }
        }

        const activeRate = Math.round(((activeSubscribers + trialUsers) / total) * 100);

        return {
            totalUsers: total,
            adminCount,
            userCount: total - adminCount,
            activeSubscribers,
            trialUsers,
            expiredSubscribers,
            activeRate
        };
    },

    exportUsersToCSV: (users: AdminUser[]): void => {
        const headers = ["ID", "Email", "Role", "Subscription_Status", "Subscription_Plan", "Expires_At", "Last_Sign_In", "Created_At"];
        const rows = users.map(u => [
            `"${u.id}"`,
            `"${u.email}"`,
            `"${u.role}"`,
            `"${u.subscription?.status || 'none'}"`,
            `"${u.subscription?.plan || 'none'}"`,
            `"${u.subscription?.expires_at || ''}"`,
            `"${u.last_sign_in || ''}"`,
            `"${u.created_at || ''}"`
        ]);

        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `nexus_users_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },

    exportUsersToJSON: (users: AdminUser[]): void => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(users, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `nexus_users_${new Date().toISOString().split('T')[0]}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
    }
};
