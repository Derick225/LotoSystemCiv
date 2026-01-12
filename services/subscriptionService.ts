
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { invokeEdgeFunction } from './apiClient';
import type { SubscriptionState } from '../types';

const TRIAL_DURATION_DAYS = 30;
const SUBSCRIPTION_COST = 3000; // FCFA

export const checkSubscriptionStatus = async (userId: string): Promise<SubscriptionState> => {
    if (!isSupabaseConfigured()) {
        return { status: 'active', daysLeft: 30, expiresAt: new Date(Date.now() + 86400000 * 30).toISOString(), plan: 'premium' };
    }

    const { data, error } = await supabase
        .from('user_preferences')
        .select('subscription')
        .eq('user_id', userId)
        .single();

    const now = new Date();
    
    if (error || !data || !data.subscription) {
        const trialEnd = new Date(now);
        trialEnd.setDate(trialEnd.getDate() + TRIAL_DURATION_DAYS);
        const subData = {
            status: 'trial',
            start_date: now.toISOString(),
            expires_at: trialEnd.toISOString(),
            plan: 'premium'
        };

        await supabase.from('user_preferences').upsert({
            user_id: userId,
            subscription: subData,
            updated_at: now.toISOString()
        });

        return {
            status: 'trial',
            daysLeft: TRIAL_DURATION_DAYS,
            expiresAt: trialEnd.toISOString(),
            plan: 'premium'
        };
    }

    const sub = data.subscription;
    const expiryDate = new Date(sub.expires_at);
    const diffTime = expiryDate.getTime() - now.getTime();
    const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (daysLeft <= 0) {
        return {
            status: 'expired',
            daysLeft: 0,
            expiresAt: sub.expires_at,
            plan: 'free'
        };
    }

    return {
        status: sub.status === 'paid' ? 'active' : 'trial',
        daysLeft,
        expiresAt: sub.expires_at,
        plan: 'premium'
    };
};

export const subscribeToSubscriptionUpdates = (userId: string, onUpdate: (sub: SubscriptionState) => void) => {
    if (!isSupabaseConfigured()) return () => {};

    const channel = supabase
        .channel(`sub-updates-${userId}`)
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'user_preferences',
                filter: `user_id=eq.${userId}`
            },
            (payload) => {
                const newSub = payload.new.subscription;
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
    if (!isSupabaseConfigured()) {
        console.warn("Mode simulation (Pas de backend configuré)");
        await new Promise(r => setTimeout(r, 2000));
        return true; 
    }

    try {
        const { data, error } = await invokeEdgeFunction('init-payment', {
            body: {
                userId,
                amount: SUBSCRIPTION_COST,
                provider
            }
        });

        if (error) throw new Error(error.message);
        
        if (data?.payment_url) {
            window.location.href = data.payment_url;
            return true;
        } else {
            throw new Error("Pas d'URL de paiement reçue");
        }

    } catch (e) {
        console.error("Erreur Initialisation Paiement:", e);
        return false;
    }
};
