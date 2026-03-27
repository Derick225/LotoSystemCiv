
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { audioEngine } from '../utils/audioEngine';
import type { SavedTicket } from '../types';

const WATCHLIST_KEY = 'lotopro_user_watchlist';
const TICKETS_KEY = 'lotopro_user_tickets';
const BANKROLL_KEY = 'lotopro_user_bankroll';
const SETTINGS_KEY = 'lotopro_user_settings';
const FUSION_CONFIG_KEY = 'lotopro_fusion_config';

// --- FUSION CONFIG (META ANALYST) ---

export interface FusionConfig {
    stability: number;
    chaos: number;
    harmony: number;
}

export const getFusionConfig = (): FusionConfig => {
    try {
        const raw = localStorage.getItem(FUSION_CONFIG_KEY);
        return raw ? JSON.parse(raw) : { stability: 0.5, chaos: 0.3, harmony: 0.7 };
    } catch (e) {
        return { stability: 0.5, chaos: 0.3, harmony: 0.7 };
    }
};

export const saveFusionConfig = (config: FusionConfig) => {
    localStorage.setItem(FUSION_CONFIG_KEY, JSON.stringify(config));
    // Pas de sync cloud critique pour ça, c'est une préférence UI locale volatile
};

// --- WATCHLIST ---

export const getWatchlist = (): number[] => {
    try {
        const raw = localStorage.getItem(WATCHLIST_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        return [];
    }
};

export const addToWatchlist = (number: number): boolean => {
    const list = getWatchlist();
    if (list.includes(number) || list.length >= 10) return false;
    
    const updated = [...list, number].sort((a, b) => a - b);
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(updated));
    syncWatchlist(); // Trigger background sync
    return true;
};

export const removeFromWatchlist = (number: number): void => {
    const list = getWatchlist();
    const updated = list.filter(n => n !== number);
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(updated));
    syncWatchlist();
};

export const isInWatchlist = (number: number): boolean => {
    const list = getWatchlist();
    return list.includes(number);
};

export const syncWatchlist = async () => {
    if (!isSupabaseConfigured()) return;
    try {
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("syncWatchlist timeout")), 15000));
        const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]) as any;
        if (session) {
            const localList = getWatchlist();
            const upsertPromise = supabase.from('user_preferences').upsert({ 
                user_id: session.user.id, 
                watchlist: localList, 
                updated_at: new Date().toISOString() 
            });
            await Promise.race([upsertPromise, timeoutPromise]);
        }
    } catch (e) { console.warn("Sync Watchlist failed", e); }
};

// --- SAVED TICKETS (WALLET) ---

export const getSavedTickets = (): SavedTicket[] => {
    try {
        const raw = localStorage.getItem(TICKETS_KEY);
        const tickets = raw ? JSON.parse(raw) : [];
        return tickets.sort((a: SavedTicket, b: SavedTicket) => b.createdAt - a.createdAt);
    } catch (e) { return []; }
};

export const saveTicket = async (ticket: Omit<SavedTicket, 'id' | 'createdAt' | 'status'>): Promise<void> => {
    const newTicket: SavedTicket = {
        ...ticket,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        status: 'active'
    };
    
    const current = getSavedTickets();
    const updated = [newTicket, ...current].slice(0, 50); // Limit to 50 local tickets
    localStorage.setItem(TICKETS_KEY, JSON.stringify(updated));
    
    // Débit automatique du coût du ticket (simulation)
    updateBankroll(-100); 

    if (isSupabaseConfigured()) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            await supabase.from('user_preferences').upsert({
                user_id: session.user.id,
                saved_tickets: updated,
                updated_at: new Date().toISOString()
            });
        }
    }
};

export const deleteTicket = async (id: string): Promise<void> => {
    const current = getSavedTickets();
    const updated = current.filter(t => t.id !== id);
    localStorage.setItem(TICKETS_KEY, JSON.stringify(updated));
    
    if (isSupabaseConfigured()) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            await supabase.from('user_preferences').upsert({
                user_id: session.user.id,
                saved_tickets: updated,
                updated_at: new Date().toISOString()
            });
        }
    }
};

export const archiveTicket = async (id: string): Promise<void> => {
    const current = getSavedTickets();
    const updated = current.map(t => t.id === id ? { ...t, status: 'archived' as const } : t);
    localStorage.setItem(TICKETS_KEY, JSON.stringify(updated));
    
    if (isSupabaseConfigured()) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            await supabase.from('user_preferences').upsert({
                user_id: session.user.id,
                saved_tickets: updated,
                updated_at: new Date().toISOString()
            });
        }
    }
};

// --- SYSTEM SETTINGS (NEW) ---

export interface UserSettings {
    sound: boolean;
    haptics: boolean;
    highPerf: boolean;
    theme: 'light' | 'dark' | 'system';
    riskProfile: 'PRUDENT' | 'BALANCED' | 'AUDACIOUS' | 'CHAOS';
}

export const getSettings = (): UserSettings => {
    try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        return raw ? { riskProfile: 'BALANCED', ...JSON.parse(raw) } : { sound: true, haptics: true, highPerf: true, theme: 'dark', riskProfile: 'BALANCED' };
    } catch (e) {
        return { sound: true, haptics: true, highPerf: true, theme: 'dark', riskProfile: 'BALANCED' };
    }
};

export const saveSettings = async (settings: UserSettings): Promise<void> => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    
    // Application immédiate des effets
    audioEngine.setEnabled(settings.sound);
    
    if (isSupabaseConfigured()) {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                await supabase.from('user_preferences').upsert({
                    user_id: session.user.id,
                    settings: settings,
                    updated_at: new Date().toISOString()
                });
            }
        } catch(e) { console.warn("Sync settings failed"); }
    }
};

// --- BANKROLL MANAGEMENT ---

export const getBankroll = (): number => {
    try {
        const raw = localStorage.getItem(BANKROLL_KEY);
        return raw ? parseFloat(raw) : 50000; // Capital de départ par défaut
    } catch (e) { return 50000; }
};

export const updateBankroll = (amount: number): number => {
    const current = getBankroll();
    const newBalance = current + amount;
    localStorage.setItem(BANKROLL_KEY, newBalance.toString());
    return newBalance;
};

// --- HYDRATION DU CLOUD VERS LOCAL (LOGIQUE DE FUSION) ---

export const hydrateUserData = async (userId: string) => {
    if (!isSupabaseConfigured()) return;
    
    try {
        const queryPromise = supabase
            .from('user_preferences')
            .select('watchlist, saved_tickets, settings')
            .eq('user_id', userId)
            .single();
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("hydrateUserData timeout")), 15000));
        const { data, error } = await Promise.race([queryPromise, timeoutPromise]) as any;

        if (error || !data) {
            // Si pas de données distantes, on pousse les locales (First Sync)
            await syncWatchlist();
            // On sauvegarde aussi les tickets initiaux
            const tickets = getSavedTickets();
            if(tickets.length > 0) {
                 const upsertPromise = supabase.from('user_preferences').upsert({
                    user_id: userId,
                    saved_tickets: tickets,
                    updated_at: new Date().toISOString()
                });
                await Promise.race([upsertPromise, timeoutPromise]);
            }
            return;
        }

        // FUSION : WATCHLIST
        // On fusionne les arrays en gardant les uniques
        const localWatchlist = getWatchlist();
        const remoteWatchlist = data.watchlist || [];
        const mergedWatchlist = Array.from(new Set([...localWatchlist, ...remoteWatchlist])).sort((a,b) => a-b);
        
        if (mergedWatchlist.length !== localWatchlist.length) {
            localStorage.setItem(WATCHLIST_KEY, JSON.stringify(mergedWatchlist));
        }

        // FUSION : TICKETS
        // On utilise l'ID pour dédoublonner. En cas de conflit, on garde le plus récent (basé sur updated_at implicite ou logique métier)
        const localTickets = getSavedTickets();
        const remoteTickets = (data.saved_tickets || []) as SavedTicket[];
        
        const ticketMap = new Map<string, SavedTicket>();
        localTickets.forEach(t => ticketMap.set(t.id, t));
        
        let hasChanges = false;
        remoteTickets.forEach(t => {
            if (!ticketMap.has(t.id)) {
                ticketMap.set(t.id, t);
                hasChanges = true;
            }
        });
        
        if (hasChanges || localTickets.length < ticketMap.size) {
            const mergedTickets = Array.from(ticketMap.values()).sort((a, b) => b.createdAt - a.createdAt).slice(0, 50); // Keep limit
            localStorage.setItem(TICKETS_KEY, JSON.stringify(mergedTickets));
        }
        
        // SETTINGS : Cloud Wins (Source of Truth pour la configuration)
        if (data.settings) {
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(data.settings));
            audioEngine.setEnabled(data.settings.sound);
        }

    } catch (e) { 
        console.warn("Hydration Merge Failed", e); 
    }
};
