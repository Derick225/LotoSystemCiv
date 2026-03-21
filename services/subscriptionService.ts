
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { apiClient } from '../core/api/apiClient';
import { initiateRealPayment, PaymentConfig } from './paymentService';
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

    // 2. Fallback to Client-Side SDK (CinetPay)
    // This requires a CinetPay API Key in env vars
    const apiKey = import.meta.env.VITE_CINETPAY_API_KEY as string;
    const siteId = import.meta.env.VITE_CINETPAY_SITE_ID as string;

    if (apiKey && siteId) {
        const transactionId = `TX-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const result = await initiateRealPayment({
            provider: 'CINETPAY',
            apiKey,
            siteId
        }, {
            amount: SUBSCRIPTION_COST,
            currency: 'XOF',
            description: 'Abonnement Premium LotoPro',
            customerName: 'Utilisateur',
            customerEmail: 'user@example.com', // Should be fetched from user profile
            customerPhone: '00000000', // Should be fetched
            transactionId
        });

        if (result.success) {
            // Optimistic Update
            // In real app, we should verify transaction via backend before updating
            if (isSupabaseConfigured()) {
                const now = new Date();
                const expiry = new Date(now);
                expiry.setDate(expiry.getDate() + 30);
                
                await supabase.from('user_preferences').upsert({
                    user_id: userId,
                    subscription: {
                        status: 'paid',
                        start_date: now.toISOString(),
                        expires_at: expiry.toISOString(),
                        plan: 'premium',
                        last_transaction_id: transactionId
                    },
                    updated_at: now.toISOString()
                });
            }
            return true;
        } else {
            console.error("Payment Failed:", result.message);
            return false;
        }
    }

    // 3. Final Fallback: Simulation
    console.warn("Mode simulation (Pas de backend ni de clés API)");
    await new Promise(r => setTimeout(r, 2000));
    return true; 
};
