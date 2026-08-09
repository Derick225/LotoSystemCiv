
import { db, isFirebaseConfigured } from './firebaseClient';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import type { SubscriptionState } from '../types';

const TRIAL_DURATION_DAYS = 30;
const SUBSCRIPTION_COST = 3000; // FCFA

export const checkSubscriptionStatus = async (userId: string): Promise<SubscriptionState> => {
    if (!isFirebaseConfigured()) {
        return { status: 'active', daysLeft: 30, expiresAt: new Date(Date.now() + 86400000 * 30).toISOString(), plan: 'premium' };
    }

    try {
        const docRef = doc(db, 'subscriptions', userId);
        const docSnap = await getDoc(docRef);

        const now = new Date();
        
        if (!docSnap.exists()) {
            const trialEnd = new Date(now);
            trialEnd.setDate(trialEnd.getDate() + TRIAL_DURATION_DAYS);

            return {
                status: 'trial',
                daysLeft: TRIAL_DURATION_DAYS,
                expiresAt: trialEnd.toISOString(),
                plan: 'premium'
            };
        }

        const subData = docSnap.data();
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
    if (!isFirebaseConfigured()) return () => {};

    const unsub = onSnapshot(doc(db, 'subscriptions', userId), (docSnap) => {
        if (docSnap.exists()) {
            const newSub = docSnap.data();
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
    });

    return unsub;
};

export const processMobileMoneyPayment = async (userId: string, provider: 'ORANGE' | 'MTN' | 'WAVE'): Promise<boolean> => {
    console.error("Configuration de paiement mobile indisponible sans passerelle cloud.");
    return false;
};
