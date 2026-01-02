
import { supabase, isSupabaseConfigured } from './supabaseClient';
import type { SavedTicket } from '../types';

const WATCHLIST_KEY = 'lotopro_user_watchlist';
const TICKETS_KEY = 'lotopro_user_tickets';
const BANKROLL_KEY = 'lotopro_user_bankroll';

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
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            const localList = getWatchlist();
            await supabase.from('user_preferences').upsert({ 
                user_id: session.user.id, 
                watchlist: localList, 
                updated_at: new Date().toISOString() 
            });
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

export const syncAllUserData = async () => {
    if (!isSupabaseConfigured()) return;
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            const { data, error } = await supabase
                .from('user_preferences')
                .select('watchlist, saved_tickets')
                .eq('user_id', session.user.id)
                .single();

            if (!error && data) {
                if (data.watchlist) localStorage.setItem(WATCHLIST_KEY, JSON.stringify(data.watchlist));
                if (data.saved_tickets) localStorage.setItem(TICKETS_KEY, JSON.stringify(data.saved_tickets));
            }
        }
    } catch (e) { console.warn("Full Sync Failed", e); }
};
