
import { supabase, isSupabaseConfigured } from './supabaseClient';
import { apiClient } from '../core/api/apiClient';
import type { SubscriptionState } from '../types';
import {
    SubscriptionRow,
    SubscriptionRowSchema,
    SubscriptionStateSchema,
    InitPaymentResponseSchema,
    MobileMoneyProvider,
    MobileMoneyProviderSchema,
} from './schemas/paymentSchemas';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

const TRIAL_DURATION_DAYS = 30;
const SUBSCRIPTION_COST = 3000; // FCFA

export const checkSubscriptionStatus = async (userId: string): Promise<SubscriptionState> => {
    if (!isSupabaseConfigured()) {
        return { status: 'active', daysLeft: 30, expiresAt: new Date(Date.now() + 86400000 * 30).toISOString(), plan: 'premium' };
    }

    try {
        const queryPromise = supabase
            .from('subscriptions')
            .select('user_id, status, plan, expires_at, start_date, updated_at')
            .eq('user_id', userId)
            .single();
        const timeoutPromise = new Promise<{ data: null; error: Error }>((_, reject) =>
            setTimeout(() => reject(new Error("checkSubscriptionStatus timeout")), 15000)
        );
        const { data: rawData, error } = await Promise.race([queryPromise, timeoutPromise]);

        const now = new Date();
        
        if (error || !rawData) {
            const trialEnd = new Date(now);
            trialEnd.setDate(trialEnd.getDate() + TRIAL_DURATION_DAYS);

            return {
                status: 'trial',
                daysLeft: TRIAL_DURATION_DAYS,
                expiresAt: trialEnd.toISOString(),
                plan: 'premium'
            };
        }

        const parsedSub = SubscriptionRowSchema.safeParse(rawData);
        if (!parsedSub.success) {
            console.warn("Format d'abonnement Supabase invalide :", parsedSub.error.format());
            return {
                status: 'trial',
                daysLeft: TRIAL_DURATION_DAYS,
                expiresAt: new Date(Date.now() + 86400000 * TRIAL_DURATION_DAYS).toISOString(),
                plan: 'premium'
            };
        }

        const subData = parsedSub.data;
        if (!subData.expires_at) {
            return {
                status: 'trial',
                daysLeft: TRIAL_DURATION_DAYS,
                expiresAt: new Date(Date.now() + 86400000 * TRIAL_DURATION_DAYS).toISOString(),
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
    } catch (e: unknown) {
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
            (payload: RealtimePostgresChangesPayload<SubscriptionRow>) => {
                const newSub = payload.new ? SubscriptionRowSchema.safeParse(payload.new) : null;
                if (newSub && newSub.success && typeof newSub.data.expires_at === 'string') {
                    const row = newSub.data;
                    const expiresAt = newSub.data.expires_at;
                    const now = new Date();
                    const expiryDate = new Date(expiresAt);
                    const diffTime = expiryDate.getTime() - now.getTime();
                    const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    
                    const stateCandidate: SubscriptionState = {
                        status: row.status === 'paid' ? 'active' : (daysLeft > 0 ? 'trial' : 'expired'),
                        daysLeft: Math.max(0, daysLeft),
                        expiresAt,
                        plan: row.plan === 'free' ? 'free' : 'premium'
                    };

                    const validatedState = SubscriptionStateSchema.safeParse(stateCandidate);
                    if (validatedState.success) {
                        onUpdate(validatedState.data);
                    }
                }
            }
        )
        .subscribe();

    return () => { supabase.removeChannel(channel); };
};

export const processMobileMoneyPayment = async (userId: string, provider: MobileMoneyProvider): Promise<boolean> => {
    const providerValidation = MobileMoneyProviderSchema.safeParse(provider);
    if (!providerValidation.success) {
        console.error("Fournisseur Mobile Money non valide :", provider);
        return false;
    }

    // 1. Try Backend Edge Function (Preferred for Security)
    if (isSupabaseConfigured()) {
        try {
            const rawResponse = await apiClient.post<unknown>('init-payment', {
                userId,
                amount: SUBSCRIPTION_COST,
                provider: providerValidation.data
            });

            const parsedResponse = InitPaymentResponseSchema.safeParse(rawResponse);
            if (parsedResponse.success && parsedResponse.data.payment_url) {
                window.location.href = parsedResponse.data.payment_url;
                return true;
            }
        } catch (e: unknown) {
            console.warn("Backend payment init failed, falling back to Client SDK:", e);
        }
    }
    console.error("Configuration de paiement manquante (Pas de backend ni de clés API).");
    return false;
};
