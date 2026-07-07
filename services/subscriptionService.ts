
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { apiClient } from '../core/api/apiClient';
import type { SubscriptionState } from '../types';



const TRIAL_DURATION_DAYS = 30;
const SUBSCRIPTION_COST = 3000; // FCFA

export const checkSubscriptionStatus = async (userId: string): Promise<SubscriptionState> => {
    if (!isSupabaseConfigured()) {
        return { status: 'active', daysLeft: 30, expiresAt: new Date(Date.now() + 86400000 * 30).toISOString(), plan: 'premium' };
    }

    try {
        const queryPromise = supabase
            .from('subscriptions')
            .select('*')
            .eq('user_id', userId)
            .single();
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("checkSubscriptionStatus timeout")), 15000));
        const { data: subData, error } = await Promise.race([queryPromise, timeoutPromise]) as { data: any, error?: Error };

    const now = new Date();
    
    if (error || !subData) {
        const trialEnd = new Date(now);
        trialEnd.setDate(trialEnd.getDate() + TRIAL_DURATION_DAYS);

        return {
            status: 'trial',
            daysLeft: TRIAL_DURATION_DAYS,
            expiresAt: trialEnd.toISOString(),
            plan: 'premium'
        };
    }

    const expiryDate = new Date(subData.expires_at);
    const diffTime = expiryDate.getTime() - now.getTime();
    const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (daysLeft <= 0) {
        return {
            status: 'expired',
            daysLeft: 0,
            expiresAt: subData.expires_at,
            plan: 'free'
        };
    }

    return {
        status: subData.status === 'paid' ? 'active' : 'trial',
        daysLeft,
        expiresAt: subData.expires_at,
        plan: 'premium'
    };
    } catch (e) {
        console.warn("checkSubscriptionStatus error or timeout:", e);
        return { status: 'active', daysLeft: 30, expiresAt: new Date(Date.now() + 86400000 * 30).toISOString(), plan: 'premium' };
    }
};

export const subscribeToSubscriptionUpdates = (userId: string, onUpdate: (sub: SubscriptionState) => void) => {
    if (!isSupabaseConfigured()) return () => {};

    const channel = supabase
        .channel(`sub-updates-${userId}`)
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'subscriptions',
                filter: `user_id=eq.${userId}`
            },
            (payload: any) => {
                const newSub = payload.new;
                if (newSub) {
                    const now = new Date();
                    const expiryDate = new Date(newSub.expires_at);
                    const diffTime = expiryDate.getTime() - now.getTime();
                    const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    
                    onUpdate({
                        status: newSub.status === 'paid' ? 'active' : (daysLeft > 0 ? 'trial' : 'expired'),
                        daysLeft: Math.max(0, daysLeft),
                        expiresAt: newSub.expires_at,
                        plan: newSub.plan || 'premium'
                    });
                }
            }
        )
        .subscribe();

    return () => { supabase.removeChannel(channel); };
};

export const processMobileMoneyPayment = async (userId: string, provider: 'ORANGE' | 'MTN' | 'WAVE'): Promise<boolean> => {
    // 1. Try Backend Edge Function (Preferred for Security)
    if (isSupabaseConfigured()) {
        try {
            const data = await apiClient.post<{ payment_url: string }>('init-payment', {
                userId,
                amount: SUBSCRIPTION_COST,
                provider
            });

            if (data?.payment_url) {
                window.location.href = data.payment_url;
                return true;
            }
        } catch (e) {
            console.warn("Backend payment init failed, falling back to Client SDK:", e);
        }
    }
    console.error("Configuration de paiement manquante (Pas de backend ni de clés API).");
    return false;
};
