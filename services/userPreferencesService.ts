import { supabase, isSupabaseConfigured } from './supabaseClient';
import { audioEngine } from '../utils/audioEngine';
import type { SavedTicket } from '../types';
import { get as idbGet, set as idbSet } from 'idb-keyval';

// Shadowing local pour garantir la robustesse absolue dans les environnements restreints (ex: iframe sandbox)
const localStorage = {
    getItem: (key: string): string | null => {
        try {
            return typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
        } catch (e) {
            console.warn(`[Storage] Échec de la lecture de localStorage pour ${key}:`, e);
            return null;
        }
    },
    setItem: (key: string, value: string): void => {
        try {
            if (typeof window !== 'undefined') {
                window.localStorage.setItem(key, value);
            }
        } catch (e: unknown) {
            console.warn(`[Storage] Échec de l'écriture dans localStorage pour ${key}:`, e);
            if (e instanceof Error && (e.name === 'QuotaExceededError' || e.message?.includes('quota') || e.message?.includes('Quota'))) {
                try {
                    const keysToRemove: string[] = [];
                    for (let i = 0; i < window.localStorage.length; i++) {
                        const k = window.localStorage.key(i);
                        if (k && (k.startsWith('gei_') || k.startsWith('spectral_') || k.startsWith('wavelet_') || k.startsWith('fractal_') || k.startsWith('correlation_'))) {
                            keysToRemove.push(k);
                        }
                    }
                    keysToRemove.forEach(k => window.localStorage.removeItem(k));
                    window.localStorage.setItem(key, value);
                } catch (retryErr) {
                    console.error("[Storage] Impossible d'écrire après purge:", retryErr);
                }
            }
        }
    },
    removeItem: (key: string): void => {
        try {
            if (typeof window !== 'undefined') {
                window.localStorage.removeItem(key);
            }
        } catch (e) {
            console.warn(`[Storage] Échec de la suppression de localStorage pour ${key}:`, e);
        }
    },
    key: (index: number): string | null => {
        try {
            return typeof window !== 'undefined' ? window.localStorage.key(index) : null;
        } catch (e) {
            return null;
        }
    },
    get length(): number {
        try {
            return typeof window !== 'undefined' ? window.localStorage.length : 0;
        } catch (e) {
            return 0;
        }
    }
};

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
        return raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : { stability: 0.5, chaos: 0.3, harmony: 0.7 };
    } catch (e) {
        return { stability: 0.5, chaos: 0.3, harmony: 0.7 };
    }
};

export const saveFusionConfig = (config: FusionConfig) => {
    localStorage.setItem(FUSION_CONFIG_KEY, JSON.stringify(config));
    // Trigger instant background sync
    performAlmostInstantSync();
};

// --- WATCHLIST ---

export const getWatchlist = (): number[] => {
    try {
        const raw = localStorage.getItem(WATCHLIST_KEY);
        return raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];
    } catch (e) {
        return [];
    }
};

export const addToWatchlist = (number: number): boolean => {
    const list = getWatchlist();
    if (list.includes(number) || list.length >= 10) return false;
    
    const updated = [...list, number].sort((a, b) => a - b);
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(updated));
    // Trigger background sync instantly
    performAlmostInstantSync();
    return true;
};

export const removeFromWatchlist = (number: number): void => {
    const list = getWatchlist();
    const updated = list.filter(n => n !== number);
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(updated));
    performAlmostInstantSync();
};

export const isInWatchlist = (number: number): boolean => {
    const list = getWatchlist();
    return list.includes(number);
};

export const syncWatchlist = async () => {
    await performAlmostInstantSync();
};

// --- SAVED TICKETS (WALLET) ---

export const getSavedTickets = (): SavedTicket[] => {
    try {
        const raw = localStorage.getItem(TICKETS_KEY);
        const tickets = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];
        return tickets.sort((a: SavedTicket, b: SavedTicket) => b.createdAt - a.createdAt);
    } catch (e) { return []; }
};

export const saveTicket = async (ticket: Omit<SavedTicket, 'id' | 'createdAt' | 'status'>): Promise<void> => {
    const seed = `${ticket.drawName}_${ticket.numbers.join(',')}_${Date.now()}`;
    let hashVal = 0;
    for (let i = 0; i < seed.length; i++) {
        hashVal = (hashVal << 5) - hashVal + seed.charCodeAt(i);
        hashVal |= 0;
    }
    const deterministicId = `tkt_${Math.abs(hashVal)}_${Date.now()}`;

    const newTicket: SavedTicket = {
        ...ticket,
        id: deterministicId,
        createdAt: Date.now(),
        status: 'active'
    };
    
    const current = getSavedTickets();
    const updated = [newTicket, ...current].slice(0, 50); // Limit to 50 local tickets
    localStorage.setItem(TICKETS_KEY, JSON.stringify(updated));
    
    // Débit de simulation du coût du ticket
    updateBankroll(-100); 

    // Instant cloud synchronization
    await performAlmostInstantSync();
};

export const deleteTicket = async (id: string): Promise<void> => {
    const current = getSavedTickets();
    const updated = current.filter(t => t.id !== id);
    localStorage.setItem(TICKETS_KEY, JSON.stringify(updated));
    
    await performAlmostInstantSync();
};

export const archiveTicket = async (id: string): Promise<void> => {
    const current = getSavedTickets();
    const updated = current.map(t => t.id === id ? { ...t, status: 'archived' as const } : t);
    localStorage.setItem(TICKETS_KEY, JSON.stringify(updated));
    
    await performAlmostInstantSync();
};

// --- SYSTEM SETTINGS ---

export interface UserSettings {
    sound: boolean;
    haptics: boolean;
    highPerf: boolean;
    theme: 'light' | 'dark' | 'system';
}

export const getSettings = (): UserSettings => {
    try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        return raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : { sound: true, haptics: true, highPerf: true, theme: 'dark' };
    } catch (e) {
        return { sound: true, haptics: true, highPerf: true, theme: 'dark' };
    }
};

export const saveSettings = async (settings: UserSettings): Promise<void> => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    
    // Application immédiate des effets
    audioEngine.setEnabled(settings.sound);
    
    await performAlmostInstantSync();
};

// --- BANKROLL MANAGEMENT ---

export const getBankroll = (): number => {
    try {
        const raw = localStorage.getItem(BANKROLL_KEY);
        return raw ? parseFloat(raw) : 50000; // Capital par défaut
    } catch (e) { return 50000; }
};

export const updateBankroll = (amount: number): number => {
    const current = getBankroll();
    const newBalance = current + amount;
    localStorage.setItem(BANKROLL_KEY, newBalance.toString());
    performAlmostInstantSync();
    return newBalance;
};

// --- MOTEUR DE SYNCHRONISATION ULTRA RAPIDE (ALMOST INSTANT SYNC ENGINE) ---

export const performAlmostInstantSync = async () => {
    if (!isSupabaseConfigured() || !navigator.onLine) return;
    
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;

        const userId = session.user.id;

        // Récupérer tous les états UI, bankroll, et fusion locaux
        const settings = getSettings();
        const fusion_config = getFusionConfig();
        const bankroll = getBankroll();
        const watchlist = getWatchlist();
        const saved_tickets = getSavedTickets();

        // Extraire de localStorage les paramètres d'entraînement du modèle (règles adaptatives + historique de poids + poids personnalisés)
        const adaptive_rules: Record<string, any> = {};
        const weights_history: Record<string, any> = {};
        const custom_weights: Record<string, any> = {};

        if (typeof window !== 'undefined') {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key) {
                    if (key.startsWith('nexus_rules_')) {
                        const draw = key.replace('nexus_rules_', '');
                        try {
                            const val = localStorage.getItem(key);
                            if (val) adaptive_rules[draw] = JSON.parse(val);
                        } catch (e) { /* Silenced */ }
                    } else if (key.startsWith('nexus_weights_history_')) {
                        const draw = key.replace('nexus_weights_history_', '');
                        try {
                            const val = localStorage.getItem(key);
                            if (val) weights_history[draw] = JSON.parse(val);
                        } catch (e) { /* Silenced */ }
                    } else if (key.startsWith('nexus_config_')) {
                        const draw = key.replace('nexus_config_', '');
                        try {
                            const val = localStorage.getItem(key);
                            if (val) custom_weights[draw] = JSON.parse(val);
                        } catch (e) { /* Silenced */ }
                    }
                }
            }
        }

        // Extraire d'IndexedDB le stockage JSON de useNexusStore
        const custom_ui_states: Record<string, any> = {};
        try {
            const nexusStorage = await idbGet('nexus-storage');
            if (nexusStorage) {
                custom_ui_states['nexus-storage'] = typeof nexusStorage === 'string' ? JSON.parse(nexusStorage) : nexusStorage;
            }
        } catch (e) { /* Silenced */ }

        // Mettre à jour également d'autres indicateurs de localStorage
        if (typeof window !== 'undefined') {
            const keysToSync = ['nexus-cloud-disabled', 'lotopro_user_selected_view'];
            keysToSync.forEach(key => {
                const val = localStorage.getItem(key);
                if (val) {
                    try {
                        custom_ui_states[key] = JSON.parse(val);
                    } catch (e) {
                        custom_ui_states[key] = val;
                    }
                }
            });
        }

        const unifiedSettings = {
            ...settings,
            fusion_config,
            bankroll,
            adaptive_rules,
            weights_history,
            custom_weights,
            custom_ui_states,
            sync_timestamp: new Date().toISOString()
        };

        // Communication locale instantanée inter-modules
        window.dispatchEvent(new CustomEvent('PREFERENCES_CHANGED', {
            detail: {
                watchlist,
                saved_tickets,
                settings: unifiedSettings
            }
        }));

        // Planification instantanée et asynchrone non restrictive pour le UI thread
        Promise.resolve(
            supabase.from('user_preferences').upsert({
                user_id: userId,
                watchlist,
                saved_tickets,
                settings: unifiedSettings,
                updated_at: new Date().toISOString()
            })
        ).catch((err: any) => {
            console.error("[AlmostInstantSync] Erreur d'écriture cloud en arrière plan", err);
        });

    } catch (error) {
        console.warn("[AlmostInstantSync] Échec du déclenchement du cycle de synchronisation", error);
    }
};

// --- HYDRATION DU CLOUD VERS LOCAL (LOGIQUE DE FUSION ET SOURCE UNIQUE DE VÉRITÉ) ---

export const hydrateUserData = async (userId: string) => {
    if (!isSupabaseConfigured()) return;
    
    try {
        const queryPromise = supabase
            .from('user_preferences')
            .select('watchlist, saved_tickets, settings')
            .eq('user_id', userId)
            .single();
            
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("hydrateUserData timeout")), 25000));
        const { data, error } = await Promise.race([queryPromise, timeoutPromise]) as { 
            data: { watchlist?: string[], saved_tickets?: SavedTicket[], settings?: Record<string, any> }, 
            error?: Error 
        };

        if (error || !data) {
            // Première synchronisation : on envoie les données locales existantes vers le Cloud
            await performAlmostInstantSync();
            return;
        }

        // 1. WATCHLIST
        const localWatchlist = getWatchlist();
        const remoteWatchlist = (data.watchlist || []).map(Number);
        const mergedWatchlist = Array.from(new Set([...localWatchlist, ...remoteWatchlist])).sort((a, b) => a - b);
        localStorage.setItem(WATCHLIST_KEY, JSON.stringify(mergedWatchlist));

        // 2. TICKETS SAUVEGARDÉS
        const localTickets = getSavedTickets();
        const remoteTickets = (data.saved_tickets || []) as SavedTicket[];
        const ticketMap = new Map<string, SavedTicket>();
        
        localTickets.forEach(t => ticketMap.set(t.id, t));
        remoteTickets.forEach(t => {
            if (!ticketMap.has(t.id)) {
                ticketMap.set(t.id, t);
            }
        });
        
        const mergedTickets = Array.from(ticketMap.values()).sort((a, b) => b.createdAt - a.createdAt).slice(0, 50);
        localStorage.setItem(TICKETS_KEY, JSON.stringify(mergedTickets));

        // 3. CORE SETTINGS & CONFIGS ÉTENDUES
        if (data.settings) {
            const s = data.settings;
            
            // Paramètres basiques
            const baseSettings = {
                sound: s.sound !== undefined ? s.sound : true,
                haptics: s.haptics !== undefined ? s.haptics : true,
                highPerf: s.highPerf !== undefined ? s.highPerf : true,
                theme: s.theme !== undefined ? s.theme : 'dark'
            };
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(baseSettings));
            audioEngine.setEnabled(baseSettings.sound);

            // Fusion config
            if (s.fusion_config) {
                localStorage.setItem(FUSION_CONFIG_KEY, JSON.stringify(s.fusion_config));
            }

            // Bankroll
            if (s.bankroll !== undefined) {
                localStorage.setItem(BANKROLL_KEY, s.bankroll.toString());
            }

            // Paramètres d'entraînement : Règles adaptatives
            if (s.adaptive_rules) {
                Object.entries(s.adaptive_rules).forEach(([draw, rules]) => {
                    localStorage.setItem(`nexus_rules_${draw}`, JSON.stringify(rules));
                });
            }

            // Paramètres d'entraînement : Historique de poids
            if (s.weights_history) {
                Object.entries(s.weights_history).forEach(([draw, history]) => {
                    localStorage.setItem(`nexus_weights_history_${draw}`, JSON.stringify(history));
                });
            }

            // Paramètres d'entraînement : Poids personnalisés des tirages (nexus_config_)
            if (s.custom_weights) {
                for (const [draw, dataWeights] of Object.entries(s.custom_weights)) {
                    if (dataWeights && typeof dataWeights === 'object') {
                        localStorage.setItem(`nexus_config_${draw}`, JSON.stringify(dataWeights));
                        await idbSet(`nexus_config_${draw}`, dataWeights).catch(() => {});
                    }
                }
            }

            // États d'interface utilisateur customisés & IndexedDB (zustand store)
            if (s.custom_ui_states) {
                for (const [key, val] of Object.entries(s.custom_ui_states)) {
                    if (key === 'nexus-storage') {
                        try {
                            await idbSet('nexus-storage', typeof val === 'object' ? JSON.stringify(val) : val);
                        } catch (e) {
                            console.warn("Échec d'écriture idbSet pour 'nexus-storage':", e);
                        }
                    } else {
                        localStorage.setItem(key, typeof val === 'object' ? JSON.stringify(val) : String(val));
                    }
                }
            }

            // Notification d'agencement terminée pour les écouteurs de l'application
            window.dispatchEvent(new CustomEvent('PREFERENCES_HYDRATED', {
                detail: s
            }));
        }

    } catch (e) {
        console.warn("[AlmostInstantSync] Échec de l'hydratation des préférences", e);
    }
};

// Écouter de potentiels déclencheurs asynchrones externes (ex: depuis predictionEngine ou WeightVersionManager)
if (typeof window !== 'undefined') {
    window.addEventListener('PREFERENCES_TRIGGER_SYNC', () => {
        performAlmostInstantSync();
    });
}
