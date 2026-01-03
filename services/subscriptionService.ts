
import { supabase, isSupabaseConfigured } from './supabaseClient';
import type { SubscriptionState } from '../types';

const TRIAL_DURATION_DAYS = 30;
const SUBSCRIPTION_COST = 3000; // FCFA

/**
 * Initialise ou récupère l'état d'abonnement de l'utilisateur.
 */
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
        // Essai gratuit par défaut pour les nouveaux
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

/**
 * Initialise le paiement réel via Edge Function.
 * Redirige l'utilisateur vers le guichet de paiement (CinetPay/FedaPay/etc).
 */
export const processMobileMoneyPayment = async (userId: string, provider: 'ORANGE' | 'MTN' | 'WAVE'): Promise<boolean> => {
    if (!isSupabaseConfigured()) {
        console.warn("Mode simulation (Pas de backend configuré)");
        await new Promise(r => setTimeout(r, 2000));
        return true; // Simulation succès local
    }

    try {
        // Appel à la Edge Function sécurisée 'init-payment'
        const { data, error } = await supabase.functions.invoke('init-payment', {
            body: {
                userId,
                amount: SUBSCRIPTION_COST,
                provider
            }
        });

        if (error) throw new Error(error.message);
        
        if (data?.payment_url) {
            // Redirection vers la page de paiement sécurisée de l'agrégateur
            window.location.href = data.payment_url;
            return true; // Le flow continue hors de l'app
        } else {
            throw new Error("Pas d'URL de paiement reçue");
        }

    } catch (e) {
        console.error("Erreur Initialisation Paiement:", e);
        return false;
    }
};
